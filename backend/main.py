"""
FastAPI Backend for GitHub Repo Deployer
RESTful API for managing GitHub repository imports and deployments
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
import os
from typing import List, Optional

from database import engine, SessionLocal, init_db
from models import Repository, Category
from schemas import RepositorySchema, RepositoryCreate, BulkActionRequest, ImportResponse
from services.bookmark_parser import parse_html_bookmarks, filter_github_urls, categorize_url
from services.git_service import clone_repo, sync_repo, get_repo_info
from services.docker_service import deploy_to_docker
from crud import repository as repo_crud


# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    yield
    # Shutdown


app = FastAPI(
    title="GitHub Repo Deployer API",
    description="Professional API for managing and deploying GitHub repositories",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    background_tasks: BackgroundTasks = BackgroundTasks(),
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
        
        # Background task: save to database
        background_tasks.add_task(save_repositories, github_urls, db)
        
        return ImportResponse(
            total_found=len(github_urls),
            message=f"Found {len(github_urls)} GitHub repositories. Importing in background..."
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/import/folder", response_model=ImportResponse)
async def import_from_folder(
    folder_path: str = Query(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
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
        
        background_tasks.add_task(save_repositories, github_urls, db)
        
        return ImportResponse(
            total_found=len(github_urls),
            message=f"Found {len(github_urls)} GitHub repositories. Importing in background..."
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def save_repositories(bookmarks: List[dict], db: Session):
    """Background task to save repositories to database"""
    for bookmark in bookmarks:
        repo_name = bookmark['url'].rstrip('/').split('/')[-1]
        category = categorize_url(bookmark['url'], bookmark['title'])
        
        # Check if already exists
        existing = repo_crud.get_repo_by_name(db, repo_name)
        if not existing:
            repo_data = RepositoryCreate(
                name=repo_name,
                url=bookmark['url'],
                title=bookmark['title'],
                category=category
            )
            repo_crud.create_repository(db, repo_data)


# ============ REPOSITORY ENDPOINTS ============

@app.get("/api/repositories", response_model=List[RepositorySchema])
async def list_repositories(
    category: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(get_db)
):
    """List all repositories with optional filtering and pagination"""
    repos = repo_crud.get_repositories(db, category=category, skip=skip, limit=limit)
    return repos


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
    repo_data: RepositorySchema,
    db: Session = Depends(get_db)
):
    """Update repository metadata"""
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
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Clone repository locally"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    background_tasks.add_task(clone_repo, repo.url, repo.path)
    return {"message": f"Cloning {repo.name}..."}


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
    
    background_tasks.add_task(deploy_to_docker, repo.path, repo.name)
    return {"message": f"Deploying {repo.name} to Docker..."}


# ============ HEALTH & STATS ============

@app.get("/api/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint"""
    try:
        db.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except:
        return {"status": "unhealthy", "database": "disconnected"}


@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get application statistics"""
    stats = repo_crud.get_stats(db)
    return stats


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
