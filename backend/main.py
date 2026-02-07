"""
FastAPI Backend for GitHub Repo Deployer
RESTful API for managing GitHub repository imports and deployments
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Query, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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


def run_migration(db: Session, migration_number: int, migration_name: str):
    """
    Run a single migration file and handle errors gracefully.
    
    Args:
        db: Database session
        migration_number: Migration file number (e.g., 1 for 001_add_users_table.sql)
        migration_name: Human-readable name for logging
    """
    try:
        migration_file = f'migrations/{migration_number:03d}_{migration_name}.sql'
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
            # Split by semicolon but skip comments and empty lines
            for statement in migration_sql.split(';'):
                statement = statement.strip()
                if statement and not statement.startswith('--'):
                    try:
                        db.execute(text(statement))
                    except Exception as stmt_err:
                        # Skip if table already exists or other idempotent errors
                        logger.debug(f"Migration {migration_name} statement skipped: {stmt_err}")
            db.commit()
        logger.info(f"Migration {migration_number} ({migration_name}) completed successfully")
    except FileNotFoundError:
        logger.warning(f"Migration file {migration_number} not found: {migration_name}")
    except Exception as e:
        db.rollback()
        logger.warning(f"Migration {migration_number} ({migration_name}) already applied or skipped: {e}")


# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    # Create all tables (including users table from updated models)
    Base.metadata.create_all(bind=engine)
    
    # Run migrations
    db = SessionLocal()
    try:
        run_migration(db, 1, "add_users_table")
        run_migration(db, 2, "add_scheduled_tasks_table")
        run_migration(db, 3, "add_notifications_table")
        run_migration(db, 4, "add_teams_tables")
        run_migration(db, 5, "add_import_sources_table")
        run_migration(db, 6, "add_deployments_table")
        run_migration(db, 7, "add_email_fields")
    finally:
        db.close()
    
    # Initialize default scheduled tasks if they don't exist
    db = SessionLocal()
    try:
        from models import ScheduledTask
        from datetime import datetime, timedelta
        
        # Check if default tasks exist
        health_check_task = db.query(ScheduledTask).filter(
            ScheduledTask.name == "Daily Health Check"
        ).first()
        
        metadata_sync_task = db.query(ScheduledTask).filter(
            ScheduledTask.name == "Daily Metadata Sync"
        ).first()
        
        # Create health check task if not exists
        if not health_check_task:
            health_check_task = ScheduledTask(
                name="Daily Health Check",
                description="Check health status of all repositories",
                task_type="health_check",
                schedule_type="interval",
                interval_hours=24,
                enabled=True,
                next_run=datetime.utcnow() + timedelta(minutes=1)  # Run after 1 minute
            )
            db.add(health_check_task)
            logger.info("Created default Daily Health Check task")
        
        # Create metadata sync task if not exists
        if not metadata_sync_task:
            metadata_sync_task = ScheduledTask(
                name="Daily Metadata Sync",
                description="Update repository metadata from GitHub",
                task_type="metadata_sync",
                schedule_type="interval",
                interval_hours=24,
                enabled=True,
                next_run=datetime.utcnow() + timedelta(minutes=2)  # Run after 2 minutes
            )
            db.add(metadata_sync_task)
            logger.info("Created default Daily Metadata Sync task")
        
        db.commit()
    except Exception as e:
        logger.warning(f"Error initializing default scheduled tasks: {e}")
        db.rollback()
    finally:
        db.close()
    
    # Start clone queue worker
    clone_queue.db_session_factory = SessionLocal
    clone_queue.start()
    
    # Start scheduler worker
    from services.scheduler_worker import init_scheduler_worker, shutdown_scheduler_worker
    init_scheduler_worker(SessionLocal)
    
    yield
    
    # Shutdown
    clone_queue.stop()
    shutdown_scheduler_worker()

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

# Gzip Compression Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

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


@app.post("/api/bulk/health-check")
async def bulk_health_check(
    action: BulkActionRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Check health status of multiple repositories - returns job_id for progress tracking"""
    import uuid
    from services.cache_service import CacheService
    
    # Generate unique job ID for tracking progress
    job_id = str(uuid.uuid4())
    
    logger.info(f"[HEALTH-CHECK] Starting bulk health check")
    logger.info(f"[HEALTH-CHECK] Job ID: {job_id}")
    logger.info(f"[HEALTH-CHECK] Repositories to scan: {len(action.repository_ids)}")
    
    # Initialize progress tracking in cache
    CacheService.set(
        f"health_check:{job_id}",
        {
            "status": "running",
            "current": 0,
            "total": len(action.repository_ids),
            "healthy": 0,
            "archived": 0,
            "not_found": 0,
            "errors": 0,
            "message": "Starting health checks..."
        },
        ttl=3600
    )
    
    logger.info(f"[HEALTH-CHECK] Progress tracking initialized in cache for job {job_id}")
    
    # Schedule background task to perform health check
    background_tasks.add_task(
        perform_bulk_health_check,
        job_id,
        action.repository_ids
    )
    
    logger.info(f"[HEALTH-CHECK] Background task scheduled for job {job_id}")
    
    return {"job_id": job_id, "message": "Health check started"}


@app.get("/api/bulk/health-check/{job_id}/progress")
async def get_health_check_progress(job_id: str):
    """Get progress of a running health check"""
    from services.cache_service import CacheService
    
    progress = CacheService.get(f"health_check:{job_id}")
    
    if not progress:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    
    return progress


async def perform_bulk_health_check(job_id: str, repository_ids: list):
    """Background task to perform health check with rate limiting and progress tracking"""
    try:
        import requests
        import re
        import time
        from datetime import datetime
        from services.cache_service import CacheService
        from database import SessionLocal
        
        logger.info(f"[HEALTH-CHECK-TASK] Starting background task for job {job_id}")
        logger.info(f"[HEALTH-CHECK-TASK] Requested repository IDs: {len(repository_ids)}")
        
        db = SessionLocal()
        
        repos = db.query(Repository).filter(Repository.id.in_(repository_ids)).all()
        logger.info(f"[HEALTH-CHECK-TASK] Found {len(repos)} repositories in database")
        
        # GitHub API Rate Limiting:
        # - Unauthenticated: 60 req/hour (1 per minute)
        # - Authenticated: 5000 req/hour (1.4 per second)
        # We use 150ms delay = ~6.7 req/sec (safe for authenticated, respects limits)
        GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', None)  # Optional GitHub token for higher limits
        REQUEST_DELAY = 0.15  # 150ms delay between requests (~6.7 req/sec)
        CHUNK_SIZE = 50  # Process in chunks of 50, pause between chunks
        CHUNK_DELAY = 2  # 2 second delay between chunks
        
        headers = {}
        if GITHUB_TOKEN:
            headers['Authorization'] = f'token {GITHUB_TOKEN}'
            logger.info(f"[GITHUB-API] Using GitHub authenticated requests (5000 req/hour limit)")
        else:
            logger.info(f"[GITHUB-API] Using GitHub unauthenticated requests (60 req/hour limit)")
        
        logger.info(f"[RATE-LIMITING] REQUEST_DELAY={REQUEST_DELAY}s, CHUNK_SIZE={CHUNK_SIZE}, CHUNK_DELAY={CHUNK_DELAY}s")
        
        healthy_count = 0
        archived_count = 0
        not_found_count = 0
        error_count = 0
        rate_limited = False
        repo_updates = []
        
        logger.info(f"[HEALTH-CHECK-TASK] Starting to process {len(repos)} repositories")
        logger.info(f"[HEALTH-CHECK-TASK] Will process in {(len(repos) + CHUNK_SIZE - 1) // CHUNK_SIZE} chunks")
        
        # Process repos in chunks
        for chunk_idx in range(0, len(repos), CHUNK_SIZE):
            chunk = repos[chunk_idx:chunk_idx + CHUNK_SIZE]
            chunk_num = (chunk_idx // CHUNK_SIZE) + 1
            total_chunks = (len(repos) + CHUNK_SIZE - 1) // CHUNK_SIZE
            logger.info(f"[HEALTH-CHECK-CHUNK] Processing chunk {chunk_num}/{total_chunks} - {len(chunk)} repos")
            chunk_num = (chunk_idx // CHUNK_SIZE) + 1
            total_chunks = (len(repos) + CHUNK_SIZE - 1) // CHUNK_SIZE
            logger.info(f"[HEALTH-CHECK-CHUNK] Processing chunk {chunk_num}/{total_chunks} - {len(chunk)} repos")
            
            for idx, repo in enumerate(chunk):
                repo_update = {"id": repo.id}
                global_idx = chunk_idx + idx
                
                try:
                    # Update progress
                    progress_msg = f"Checking {repo.name}..."
                    if rate_limited:
                        progress_msg += " (rate limited, slowing down)"
                    
                    CacheService.set(
                        f"health_check:{job_id}",
                        {
                            "status": "running",
                            "current": global_idx,
                            "total": len(repos),
                            "healthy": healthy_count,
                            "archived": archived_count,
                            "not_found": not_found_count,
                            "errors": error_count,
                            "rate_limited": rate_limited,
                            "message": progress_msg
                        },
                        ttl=3600
                    )
                    
                    # Parse GitHub URL to extract owner and repo name
                    url = repo.url.rstrip('/')
                    if url.endswith('.git'):
                        url = url[:-4]
                    
                    # Extract from https URL or git@github.com URL
                    https_match = re.search(r'github\.com/([^/]+)/([^/]+)', url)
                    ssh_match = re.search(r'git@github\.com:([^/]+)/([^/]+)', url)
                    
                    if https_match:
                        owner, repo_name = https_match.group(1), https_match.group(2)
                    elif ssh_match:
                        owner, repo_name = ssh_match.group(1), ssh_match.group(2)
                    else:
                        # Not a GitHub URL, mark as unknown
                        repo_update["health_status"] = "unknown"
                        repo_update["last_health_check"] = datetime.utcnow()
                        repo_updates.append(repo_update)
                        continue
                    
                    # Call GitHub API to check repository status
                    api_url = f"https://api.github.com/repos/{owner}/{repo_name}"
                    response = requests.get(api_url, timeout=10, headers=headers)
                    
                    # Check rate limiting (429 = Too Many Requests)
                    if response.status_code == 429:
                        rate_limited = True
                        # Get retry-after header if available
                        retry_after = int(response.headers.get('Retry-After', 60))
                        logger.warning(f"GitHub API rate limited, sleeping for {retry_after}s")
                        time.sleep(min(retry_after, 5))  # Cap at 5 seconds per hit
                        
                        # Retry this repo
                        response = requests.get(api_url, timeout=10, headers=headers)
                    
                    if response.status_code == 200:
                        # Repository exists
                        data = response.json()
                        
                        # Update repository metadata
                        repo_update.update({
                            "archived": data.get('archived', False),
                            "stars": data.get('stargazers_count', 0),
                            "forks": data.get('forks_count', 0),
                            "watchers": data.get('watchers_count', 0),
                            "language": data.get('language'),
                            "topics": data.get('topics', []),
                            "license": data.get('license', {}).get('name') if data.get('license') else None,
                            "is_fork": data.get('fork', False),
                            "open_issues": data.get('open_issues_count', 0),
                            "default_branch": data.get('default_branch', 'main'),
                            "last_metadata_sync": datetime.utcnow()
                        })
                        
                        if data.get('created_at'):
                            from datetime import datetime as dt
                            repo_update["github_created_at"] = dt.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                        if data.get('updated_at'):
                            from datetime import datetime as dt
                            repo_update["github_updated_at"] = dt.fromisoformat(data['updated_at'].replace('Z', '+00:00'))
                        if data.get('pushed_at'):
                            from datetime import datetime as dt
                            repo_update["github_pushed_at"] = dt.fromisoformat(data['pushed_at'].replace('Z', '+00:00'))
                        
                        # Set health status
                        if data.get('archived'):
                            repo_update["health_status"] = "archived"
                            archived_count += 1
                        else:
                            repo_update["health_status"] = "healthy"
                            healthy_count += 1
                    
                    elif response.status_code == 404:
                        # Repository not found
                        repo_update["health_status"] = "not_found"
                        not_found_count += 1
                    else:
                        # Other API error, keep existing status
                        logger.warning(f"API error for {repo.name}: {response.status_code}")
                        repo_update["health_status"] = "unknown"
                        error_count += 1
                    
                    # Add delay between API calls to respect rate limits
                    time.sleep(REQUEST_DELAY)
                
                except Exception as e:
                    logger.error(f"Error checking repository {repo.id}: {e}")
                    repo_update["health_status"] = "unknown"
                    error_count += 1
                
                repo_update["last_health_check"] = datetime.utcnow()
                repo_updates.append(repo_update)
            
            # Pause between chunks
            if chunk_idx + CHUNK_SIZE < len(repos):
                chunk_num = (chunk_idx // CHUNK_SIZE) + 1
                total_chunks = (len(repos) + CHUNK_SIZE - 1) // CHUNK_SIZE
                logger.info(f"[HEALTH-CHECK-CHUNK] Completed chunk {chunk_num}/{total_chunks}, pausing {CHUNK_DELAY}s before next chunk")
                time.sleep(CHUNK_DELAY)
        
        # Batch update all repositories at once
        if repo_updates:
            db.bulk_update_mappings(Repository, repo_updates)
        db.commit()
        
        # Mark as completed
        logger.info(f"[HEALTH-CHECK-TASK] Updating progress - marking job {job_id} as completed")
        CacheService.set(
            f"health_check:{job_id}",
            {
                "status": "completed",
                "current": len(repos),
                "total": len(repos),
                "healthy": healthy_count,
                "archived": archived_count,
                "not_found": not_found_count,
                "errors": error_count,
                "message": f"✓ Complete: {healthy_count} healthy, {archived_count} archived, {not_found_count} removed (404)"
            },
            ttl=3600
        )
        
        logger.info(f"[HEALTH-CHECK-COMPLETE] Job {job_id} completed successfully")
        logger.info(f"[HEALTH-CHECK-SUMMARY] Healthy: {healthy_count}, Archived: {archived_count}, Not Found: {not_found_count}, Errors: {error_count}")
        db.close()
    except Exception as e:
        logger.error(f"[HEALTH-CHECK-ERROR] Job {job_id} failed with error: {str(e)}")
        logger.error(f"[HEALTH-CHECK-ERROR] Traceback: ", exc_info=True)
        CacheService.set(
            f"health_check:{job_id}",
            {
                "status": "failed",
                "error": str(e),
                "message": "Health check failed"
            },
            ttl=3600
        )


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
