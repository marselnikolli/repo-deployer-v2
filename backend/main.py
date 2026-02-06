"""
FastAPI Backend for GitHub Repo Deployer
RESTful API for managing GitHub repository imports and deployments
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Query, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from sqlalchemy import text
import os
import logging
from typing import List, Optional
from pydantic import BaseModel
from datetime import timedelta

from database import engine, SessionLocal, init_db
from models import Repository, Category, Base
from schemas import RepositorySchema, RepositoryCreate, RepositoryUpdate, BulkActionRequest, ImportResponse
from services.bookmark_parser import parse_html_bookmarks, filter_github_urls, categorize_url
from services.git_service import clone_repo, sync_repo, get_repo_info
from services.clone_queue import clone_queue, CloneStatus
# from services.docker_service import deploy_to_docker
from crud import repository as repo_crud
from routes import auth, docker, deployment, analytics, scheduler, notifications, search, import_routes, collection_routes

logger = logging.getLogger(__name__)


# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    # Create all tables (including users table from updated models)
    Base.metadata.create_all(bind=engine)
    # Run migrations
    try:
        db = SessionLocal()
        # Migration 1: Users table
        try:
            with open('migrations/001_add_users_table.sql', 'r') as f:
                migration_sql = f.read()
                # Split by semicolon but skip comments and empty lines
                for statement in migration_sql.split(';'):
                    statement = statement.strip()
                    if statement and not statement.startswith('--'):
                        try:
                            db.execute(text(statement))
                        except Exception as stmt_err:
                            pass  # Skip if table already exists
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"Users migration already applied: {e}")
        
        # Migration 2: Scheduled tasks
        try:
            with open('migrations/002_add_scheduled_tasks_table.sql', 'r') as f:
                migration_sql = f.read()
                for statement in migration_sql.split(';'):
                    statement = statement.strip()
                    if statement and not statement.startswith('--'):
                        try:
                            db.execute(text(statement))
                        except Exception as stmt_err:
                            pass  # Skip if table already exists
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"Scheduled tasks migration already applied: {e}")
        
        # Migration 3: Notifications
        try:
            with open('migrations/003_add_notifications_table.sql', 'r') as f:
                migration_sql = f.read()
                for statement in migration_sql.split(';'):
                    statement = statement.strip()
                    if statement and not statement.startswith('--'):
                        try:
                            db.execute(text(statement))
                        except Exception as stmt_err:
                            pass  # Skip if table already exists
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"Notifications migration already applied: {e}")
        
        # Migration 5: Import Sources
        try:
            with open('migrations/005_add_import_sources_table.sql', 'r') as f:
                migration_sql = f.read()
                for statement in migration_sql.split(';'):
                    statement = statement.strip()
                    if statement and not statement.startswith('--'):
                        try:
                            db.execute(text(statement))
                        except Exception as stmt_err:
                            pass  # Skip if table already exists
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"Import sources migration already applied: {e}")
        
        # Migration 6: Deployments
        try:
            with open('migrations/006_add_deployments_table.sql', 'r') as f:
                migration_sql = f.read()
                for statement in migration_sql.split(';'):
                    statement = statement.strip()
                    if statement and not statement.startswith('--'):
                        try:
                            db.execute(text(statement))
                        except Exception as stmt_err:
                            pass  # Skip if table already exists
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"Deployments migration already applied: {e}")
    finally:
        db.close()
    
    # Start clone queue worker
    clone_queue.db_session_factory = SessionLocal
    clone_queue.start()
    
    yield
    
    # Shutdown
    clone_queue.stop()

app = FastAPI(
    title="GitHub Repo Deployer API",
    description="Professional API for managing and deploying GitHub repositories",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url="/api/redoc",
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route blueprints
app.include_router(auth.router)
app.include_router(docker.router)
app.include_router(deployment.router)
app.include_router(analytics.router)
app.include_router(scheduler.router)
app.include_router(notifications.router)
app.include_router(search.router)
app.include_router(import_routes.router)
app.include_router(collection_routes.router)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============ IMPORT ENDPOINTS ============

@app.post("/api/import/html", response_model=ImportResponse)
async def import_from_html(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Import repositories from HTML bookmark file"""
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Parse bookmarks
        bookmarks = parse_html_bookmarks(contents.decode('utf-8'))
        github_urls = filter_github_urls(bookmarks)
        
        if not github_urls:
            raise HTTPException(status_code=400, detail="No GitHub URLs found in file")
        
        # Check for duplicates in the import file and database
        seen_urls = set()
        unique_bookmarks = []
        duplicates_in_file = 0
        
        for bookmark in github_urls:
            if bookmark['url'] in seen_urls:
                duplicates_in_file += 1
            else:
                seen_urls.add(bookmark['url'])
                unique_bookmarks.append(bookmark)
        
        # Check for duplicates in database
        duplicates_in_db = 0
        to_import = []
        
        for bookmark in unique_bookmarks:
            existing = repo_crud.get_repo_by_url(db, bookmark['url'])
            if existing:
                duplicates_in_db += 1
            else:
                to_import.append(bookmark)
        
        # Save all repositories (synchronously for better feedback)
        newly_imported = 0
        for bookmark in to_import:
            # Extract owner/repo format
            url_parts = bookmark['url'].rstrip('/').split('/')
            if len(url_parts) >= 2:
                repo_name = f"{url_parts[-2]}/{url_parts[-1]}"
            else:
                repo_name = url_parts[-1]
            
            category = categorize_url(bookmark['url'], bookmark['title'])
            repo_data = RepositoryCreate(
                name=repo_name,
                url=bookmark['url'],
                title=bookmark['title'],
                category=category
            )
            try:
                repo_crud.create_repository(db, repo_data)
                newly_imported += 1
            except Exception as e:
                # Rollback the failed transaction so we can continue
                db.rollback()
                logger.error(f"Failed to create repository {repo_name}: {str(e)}")
        
        return ImportResponse(
            total_found=len(github_urls),
            duplicates_in_file=duplicates_in_file,
            duplicates_in_db=duplicates_in_db,
            newly_imported=newly_imported,
            message=f"Import complete: {newly_imported} repositories imported, {duplicates_in_db} already in database, {duplicates_in_file} duplicates in file"
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/import/folder", response_model=ImportResponse)
async def import_from_folder(
    folder_path: str = Query(...),
    db: Session = Depends(get_db)
):
    """Import repositories from folder containing bookmark files"""
    try:
        if not os.path.isdir(folder_path):
            raise HTTPException(status_code=400, detail="Folder not found")
        
        all_bookmarks = []
        
        # Scan for bookmark files
        for filename in os.listdir(folder_path):
            if filename.endswith(('.html', '.json')):
                filepath = os.path.join(folder_path, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    bookmarks = parse_html_bookmarks(content)
                    all_bookmarks.extend(bookmarks)
        
        github_urls = filter_github_urls(all_bookmarks)
        
        if not github_urls:
            raise HTTPException(status_code=400, detail="No GitHub URLs found in folder")
        
        # Check for duplicates in the import file and database
        seen_urls = set()
        unique_bookmarks = []
        duplicates_in_file = 0
        
        for bookmark in github_urls:
            if bookmark['url'] in seen_urls:
                duplicates_in_file += 1
            else:
                seen_urls.add(bookmark['url'])
                unique_bookmarks.append(bookmark)
        
        # Check for duplicates in database
        duplicates_in_db = 0
        to_import = []
        
        for bookmark in unique_bookmarks:
            existing = repo_crud.get_repo_by_url(db, bookmark['url'])
            if existing:
                duplicates_in_db += 1
            else:
                to_import.append(bookmark)
        
        # Save all repositories
        newly_imported = 0
        for bookmark in to_import:
            # Extract owner/repo format
            url_parts = bookmark['url'].rstrip('/').split('/')
            if len(url_parts) >= 2:
                repo_name = f"{url_parts[-2]}/{url_parts[-1]}"
            else:
                repo_name = url_parts[-1]
            
            category = categorize_url(bookmark['url'], bookmark['title'])
            repo_data = RepositoryCreate(
                name=repo_name,
                url=bookmark['url'],
                title=bookmark['title'],
                category=category
            )
            try:
                repo_crud.create_repository(db, repo_data)
                newly_imported += 1
            except Exception as e:
                # Rollback the failed transaction so we can continue
                db.rollback()
                logger.error(f"Failed to create repository {repo_name}: {str(e)}")
        
        return ImportResponse(
            total_found=len(github_urls),
            duplicates_in_file=duplicates_in_file,
            duplicates_in_db=duplicates_in_db,
            newly_imported=newly_imported,
            message=f"Import complete: {newly_imported} repositories imported, {duplicates_in_db} already in database, {duplicates_in_file} duplicates in file"
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



# ============ REPOSITORY ENDPOINTS ============

@app.get("/api/repositories", response_model=List[RepositorySchema])
async def list_repositories(
    category: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    sort_by: Optional[str] = Query(None, description="Sort by field: name, category, created_at, updated_at"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db)
):
    """List all repositories with optional filtering, sorting, and pagination"""
    repos = repo_crud.get_repositories(
        db,
        category=category,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return repos


@app.get("/api/repositories/check-duplicate")
async def check_duplicate_url(
    url: str = Query(..., description="URL to check"),
    db: Session = Depends(get_db)
):
    """Check if a repository URL already exists"""
    existing = repo_crud.get_repo_by_url(db, url)
    return {
        "exists": existing is not None,
        "repository": {
            "id": existing.id,
            "name": existing.name,
            "url": existing.url
        } if existing else None
    }


@app.post("/api/repositories", response_model=RepositorySchema)
async def create_repository(
    repo_data: RepositoryCreate,
    db: Session = Depends(get_db)
):
    """Manually add a new repository"""
    # Check if repository already exists
    existing = repo_crud.get_repo_by_url(db, repo_data.url)
    if existing:
        raise HTTPException(status_code=400, detail="Repository with this URL already exists")
    
    # Create the repository
    new_repo = repo_crud.create_repository(db, repo_data)
    return new_repo


@app.get("/api/search")
async def search_repositories(
    q: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = Query(None, description="Filter by category"),
    cloned: Optional[bool] = Query(None, description="Filter by cloned status"),
    deployed: Optional[bool] = Query(None, description="Filter by deployed status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search repositories with full-text search and filters"""
    from services.search_service import SearchService
    from services.cache_service import CacheService, generate_search_cache_key
    
    # Generate cache key
    cache_key = generate_search_cache_key(q, category, cloned, deployed, limit, offset)
    
    # Try to get from cache
    cached_result = CacheService.get(cache_key)
    if cached_result:
        return cached_result
    
    results, total = SearchService.search_repositories(
        db=db,
        query=q or "",
        category=category,
        cloned=cloned,
        deployed=deployed,
        limit=limit,
        offset=offset,
    )
    
    response = {
        "results": [
            {
                "id": r.id,
                "name": r.name,
                "title": r.title,
                "url": r.url,
                "category": r.category,
                "cloned": r.cloned,
                "deployed": r.deployed,
                "created_at": r.created_at,
            }
            for r in results
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
    
    # Cache the result (1 hour TTL)
    CacheService.set(cache_key, response, ttl=3600)
    
    return response


@app.get("/api/repositories/{repo_id}", response_model=RepositorySchema)
async def get_repository(repo_id: int, db: Session = Depends(get_db)):
    """Get repository details"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@app.put("/api/repositories/{repo_id}", response_model=RepositorySchema)
async def update_repository(
    repo_id: int,
    repo_data: RepositoryUpdate,
    db: Session = Depends(get_db)
):
    """Update repository metadata (supports partial updates)"""
    repo = repo_crud.update_repository(db, repo_id, repo_data)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@app.delete("/api/repositories/{repo_id}")
async def delete_repository(repo_id: int, db: Session = Depends(get_db)):
    """Delete repository"""
    success = repo_crud.delete_repository(db, repo_id)
    if not success:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"message": "Repository deleted"}


@app.get("/api/categories")
async def get_categories(db: Session = Depends(get_db)):
    """Get all available categories with repository counts"""
    categories = repo_crud.get_category_stats(db)
    return categories


# ============ BULK OPERATIONS ============

@app.post("/api/bulk/update-category")
async def bulk_update_category(
    action: BulkActionRequest,
    db: Session = Depends(get_db)
):
    """Update category for multiple repositories"""
    try:
        updated_count = repo_crud.bulk_update_category(
            db,
            action.repository_ids,
            action.new_category
        )
        return {"updated_count": updated_count, "message": f"Updated {updated_count} repositories"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/bulk/delete")
async def bulk_delete(
    action: BulkActionRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple repositories"""
    try:
        deleted_count = repo_crud.bulk_delete(db, action.repository_ids)
        return {"deleted_count": deleted_count, "message": f"Deleted {deleted_count} repositories"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============ GIT OPERATIONS ============

@app.post("/api/repositories/{repo_id}/sync")
async def sync_repository(
    repo_id: int,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Sync/update repository from remote"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    background_tasks.add_task(sync_repo, repo.path, repo.url)
    return {"message": f"Syncing {repo.name}..."}


@app.post("/api/repositories/{repo_id}/clone")
async def clone_repository(
    repo_id: int,
    db: Session = Depends(get_db)
):
    """Clone repository locally using the clone queue"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if repo.cloned:
        return {"message": f"{repo.name} is already cloned", "job_id": None}

    # Use the clone queue for proper tracking and status updates
    target_path = repo.path or f"./repos/{repo.name}"
    job = clone_queue.add_job(
        repository_id=repo.id,
        name=repo.name,
        url=repo.url,
        target_path=target_path
    )
    return {"message": f"Cloning {repo.name}...", "job_id": job.id}


# ============ DOCKER DEPLOYMENT ============

@app.post("/api/repositories/{repo_id}/deploy")
async def deploy_repository(
    repo_id: int,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Deploy repository to Docker"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # background_tasks.add_task(deploy_to_docker, repo.path, repo.name)
    return {"message": f"Deploying {repo.name} to Docker..."}


# ============ HEALTH & STATS ============

@app.get("/api/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint"""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except:
        return {"status": "unhealthy", "database": "disconnected"}


@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get application statistics"""
    from services.cache_service import CacheService, generate_stats_cache_key
    
    # Try to get from cache
    cache_key = generate_stats_cache_key()
    cached_stats = CacheService.get(cache_key)
    if cached_stats:
        return cached_stats
    
    stats = repo_crud.get_stats(db)
    
    # Cache the result (5 minute TTL)
    CacheService.set(cache_key, stats, ttl=300)
    
    return stats


@app.get("/api/audit-logs")
async def get_audit_logs(
    operation: Optional[str] = Query(None, description="Filter by operation type"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get audit logs with optional filtering"""
    from services.audit_service import AuditService
    logs = AuditService.get_audit_logs(
        db=db,
        operation=operation,
        resource_type=resource_type,
        limit=limit,
        offset=offset,
    )
    return [
        {
            "id": log.id,
            "operation": log.operation,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "status": log.status,
            "timestamp": log.timestamp.isoformat(),
            "details": log.details,
            "error_message": log.error_message,
        }
        for log in logs
    ]


# ============ EXPORT ENDPOINTS ============


@app.get("/api/export/csv")
async def export_csv(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Export repositories to CSV format"""
    from fastapi.responses import Response
    from services.export_service import ExportService

    repos = repo_crud.get_repositories(db, category=category, skip=0, limit=100000)
    csv_content = ExportService.to_csv(repos)

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=repositories.csv"}
    )


@app.get("/api/export/json")
async def export_json(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Export repositories to JSON format"""
    from fastapi.responses import Response
    from services.export_service import ExportService

    repos = repo_crud.get_repositories(db, category=category, skip=0, limit=100000)
    json_content = ExportService.to_json(repos)

    return Response(
        content=json_content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=repositories.json"}
    )


@app.get("/api/export/markdown")
async def export_markdown(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Export repositories to Markdown format"""
    from fastapi.responses import Response
    from services.export_service import ExportService

    repos = repo_crud.get_repositories(db, category=category, skip=0, limit=100000)
    md_content = ExportService.to_markdown(repos)

    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=repositories.md"}
    )


# ============ AUTHENTICATION ENDPOINTS ============


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    from services.auth_service import verify_password, create_access_token
    
    # In a real app, verify username against database
    # For now, accept any username/password that matches a pattern
    if not request.username or not request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create token with 30 minute expiration
    access_token = create_access_token(
        data={"sub": request.username},
        expires_delta=timedelta(minutes=30)
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/auth/verify")
async def verify_token(authorization: Optional[str] = Header(None)):
    """Verify JWT token validity"""
    from services.auth_service import decode_token
    
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = parts[1]
    username = decode_token(token)
    
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return {"username": username, "valid": True}


# ============ GITHUB METADATA ENDPOINTS ============


@app.get("/api/github/metadata")
async def fetch_github_metadata(url: str = Query(..., description="GitHub repository URL")):
    """Fetch metadata from GitHub API for a repository URL"""
    from services.github_service import GitHubService

    metadata = await GitHubService.fetch_repo_metadata(url)
    if not metadata:
        raise HTTPException(status_code=404, detail="Could not fetch metadata. Repository may not exist or is private.")

    suggested_category = GitHubService.suggest_category_from_metadata(metadata)

    return {
        "stars": metadata.stars,
        "forks": metadata.forks,
        "watchers": metadata.watchers,
        "language": metadata.language,
        "languages": metadata.languages,
        "topics": metadata.topics,
        "description": metadata.description,
        "license": metadata.license,
        "archived": metadata.archived,
        "is_fork": metadata.is_fork,
        "created_at": metadata.created_at,
        "updated_at": metadata.updated_at,
        "pushed_at": metadata.pushed_at,
        "open_issues": metadata.open_issues,
        "default_branch": metadata.default_branch,
        "suggested_category": suggested_category
    }


@app.post("/api/repositories/{repo_id}/sync-metadata")
async def sync_repository_metadata(
    repo_id: int,
    db: Session = Depends(get_db)
):
    """Sync GitHub metadata for a repository"""
    from services.github_service import GitHubService
    from datetime import datetime

    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    metadata = await GitHubService.fetch_repo_metadata(repo.url)
    if not metadata:
        return {"message": "Could not fetch metadata", "success": False}

    # Update repository with metadata
    repo.stars = metadata.stars
    repo.forks = metadata.forks
    repo.watchers = metadata.watchers
    repo.language = metadata.language
    repo.languages = metadata.languages
    repo.topics = metadata.topics
    repo.license = metadata.license
    repo.archived = metadata.archived
    repo.is_fork = metadata.is_fork
    repo.open_issues = metadata.open_issues
    repo.default_branch = metadata.default_branch
    repo.last_metadata_sync = datetime.utcnow()

    # Update health status based on archived flag
    repo.health_status = "archived" if metadata.archived else "healthy"
    repo.last_health_check = datetime.utcnow()

    # Parse GitHub dates
    if metadata.created_at:
        try:
            repo.github_created_at = datetime.fromisoformat(metadata.created_at.replace('Z', '+00:00'))
        except:
            pass
    if metadata.updated_at:
        try:
            repo.github_updated_at = datetime.fromisoformat(metadata.updated_at.replace('Z', '+00:00'))
        except:
            pass
    if metadata.pushed_at:
        try:
            repo.github_pushed_at = datetime.fromisoformat(metadata.pushed_at.replace('Z', '+00:00'))
        except:
            pass

    db.commit()
    db.refresh(repo)

    return {"message": f"Metadata synced for {repo.name}", "success": True, "repository": repo}


# ============ TAGS ENDPOINTS ============


from crud import tags as tags_crud
from schemas import TagCreate, TagSchema


@app.get("/api/tags")
async def list_tags(db: Session = Depends(get_db)):
    """List all tags with repository counts"""
    return tags_crud.get_tags_with_counts(db)


@app.post("/api/tags", response_model=TagSchema)
async def create_tag(tag: TagCreate, db: Session = Depends(get_db)):
    """Create a new tag"""
    existing = tags_crud.get_tag_by_name(db, tag.name)
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    return tags_crud.create_tag(db, tag)


@app.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    """Delete a tag"""
    success = tags_crud.delete_tag(db, tag_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"message": "Tag deleted"}


@app.post("/api/repositories/{repo_id}/tags")
async def add_tags_to_repo(
    repo_id: int,
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add tags to a repository"""
    repo = tags_crud.add_tags_to_repository(db, repo_id, tag_ids)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"message": f"Added {len(tag_ids)} tags to repository"}


@app.delete("/api/repositories/{repo_id}/tags")
async def remove_tags_from_repo(
    repo_id: int,
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Remove tags from a repository"""
    repo = tags_crud.remove_tags_from_repository(db, repo_id, tag_ids)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"message": f"Removed {len(tag_ids)} tags from repository"}


@app.post("/api/bulk/add-tags")
async def bulk_add_tags(
    repo_ids: List[int],
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add tags to multiple repositories"""
    updated = tags_crud.bulk_add_tags(db, repo_ids, tag_ids)
    return {"message": f"Added tags to {updated} repositories"}


@app.post("/api/bulk/remove-tags")
async def bulk_remove_tags(
    repo_ids: List[int],
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Remove tags from multiple repositories"""
    updated = tags_crud.bulk_remove_tags(db, repo_ids, tag_ids)
    return {"message": f"Removed tags from {updated} repositories"}


# ============ HEALTH CHECK ENDPOINTS ============


@app.post("/api/repositories/{repo_id}/check-health")
async def check_repository_health(
    repo_id: int,
    db: Session = Depends(get_db)
):
    """Check if a repository still exists on GitHub"""
    from services.github_service import GitHubService
    from datetime import datetime

    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    exists = await GitHubService.check_repo_exists(repo.url)
    repo.health_status = "healthy" if exists else "not_found"
    repo.last_health_check = datetime.utcnow()

    db.commit()
    db.refresh(repo)

    return {
        "repository_id": repo_id,
        "health_status": repo.health_status,
        "checked_at": repo.last_health_check
    }


# ============ CLONE QUEUE ENDPOINTS ============


@app.on_event("startup")
async def start_clone_queue():
    """Start the clone queue worker on app startup"""
    clone_queue.db_session_factory = SessionLocal
    clone_queue.start()


@app.on_event("shutdown")
async def stop_clone_queue():
    """Stop the clone queue worker on app shutdown"""
    clone_queue.stop()


@app.get("/api/clone-queue/status")
async def get_clone_queue_status():
    """Get clone queue status"""
    return clone_queue.get_queue_status()


@app.get("/api/clone-queue/jobs")
async def get_clone_queue_jobs():
    """Get all clone jobs"""
    jobs = clone_queue.get_all_jobs()
    return [
        {
            "id": job.id,
            "repository_id": job.repository_id,
            "repository_name": job.repository_name,
            "status": job.status,
            "progress": job.progress,
            "error_message": job.error_message,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "created_at": job.created_at.isoformat()
        }
        for job in jobs
    ]


@app.post("/api/clone-queue/add")
async def add_to_clone_queue(
    repository_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add repositories to the clone queue"""
    repos_to_clone = []
    for repo_id in repository_ids:
        repo = repo_crud.get_repository(db, repo_id)
        if repo and not repo.cloned:
            repos_to_clone.append({
                "id": repo.id,
                "name": repo.name,
                "url": repo.url,
                "path": repo.path or f"./repos/{repo.name}"
            })

    if not repos_to_clone:
        return {"message": "No repositories to clone", "jobs_added": 0}

    jobs = clone_queue.add_jobs(repos_to_clone)
    return {
        "message": f"Added {len(jobs)} repositories to clone queue",
        "jobs_added": len(jobs),
        "job_ids": [job.id for job in jobs]
    }


@app.post("/api/clone-queue/cancel/{job_id}")
async def cancel_clone_job(job_id: int):
    """Cancel a pending clone job"""
    success = clone_queue.cancel_job(job_id)
    if success:
        return {"message": f"Job {job_id} cancelled"}
    raise HTTPException(status_code=400, detail="Cannot cancel job (may be already in progress or completed)")


@app.post("/api/clone-queue/clear")
async def clear_clone_queue():
    """Clear completed and failed jobs from the queue"""
    clone_queue.clear_completed()
    return {"message": "Cleared completed jobs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
