"""Collection API routes"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import SessionLocal
from routes.auth import get_current_user
from services.collection_service import CollectionService
from models import User, Collection
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

router = APIRouter(prefix="/api/collections", tags=["collections"])


# ============ Pydantic Schemas ============

class RepositoryInCollection(BaseModel):
    id: int
    name: str
    url: str
    description: Optional[str]
    stars: int
    language: Optional[str]
    category: str
    
    class Config:
        from_attributes = True


class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_smart: bool = False
    filter_config: Optional[Dict[str, Any]] = None
    is_public: bool = False
    auto_populate: bool = False


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    filter_config: Optional[Dict[str, Any]] = None
    auto_populate: Optional[bool] = None


class CollectionResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    is_smart: bool
    is_public: bool
    is_template: bool
    auto_populate: bool
    filter_config: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CollectionWithRepositories(CollectionResponse):
    repositories: List[RepositoryInCollection]
    repository_count: int
    
    class Config:
        from_attributes = True


class CollectionStats(BaseModel):
    total_repositories: int
    total_stars: int
    average_stars: float
    categories: Dict[str, int]
    languages: Dict[str, int]


# ============ Collection Endpoints ============

@router.post("", response_model=CollectionResponse)
async def create_collection(
    request: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new collection"""
    service = CollectionService(db)
    
    collection = service.create_collection(
        user_id=current_user.id,
        name=request.name,
        description=request.description,
        is_smart=request.is_smart,
        filter_config=request.filter_config,
        is_public=request.is_public,
        auto_populate=request.auto_populate
    )
    
    return collection


@router.get("", response_model=List[CollectionResponse])
async def list_collections(
    include_public: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List user's collections"""
    service = CollectionService(db)
    collections = service.list_collections(
        user_id=current_user.id,
        include_public=include_public,
        limit=limit,
        offset=offset
    )
    return collections


@router.get("/public-templates", response_model=List[CollectionResponse])
async def list_templates(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List public collection templates"""
    service = CollectionService(db)
    templates = service.list_templates(limit=limit)
    return templates


@router.get("/{collection_id}", response_model=CollectionWithRepositories)
async def get_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get collection details with repositories"""
    service = CollectionService(db)
    collection = service.get_collection(collection_id, user_id=current_user.id)
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return {
        **collection.__dict__,
        'repositories': collection.repositories,
        'repository_count': len(collection.repositories)
    }


@router.put("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: int,
    request: CollectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update collection"""
    service = CollectionService(db)
    
    collection = service.update_collection(
        collection_id,
        current_user.id,
        **request.dict(exclude_unset=True)
    )
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return collection


@router.delete("/{collection_id}")
async def delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete collection"""
    service = CollectionService(db)
    
    if not service.delete_collection(collection_id, current_user.id):
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return {"message": "Collection deleted"}


# ============ Repository Management ============

@router.post("/{collection_id}/repositories/{repo_id}")
async def add_repository_to_collection(
    collection_id: int,
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add repository to collection"""
    service = CollectionService(db)
    
    if not service.add_repository_to_collection(collection_id, repo_id, current_user.id):
        raise HTTPException(status_code=400, detail="Failed to add repository to collection")
    
    return {"message": "Repository added to collection"}


@router.post("/{collection_id}/repositories/bulk-add")
async def bulk_add_repositories(
    collection_id: int,
    request: Dict[str, List[int]],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add multiple repositories to collection"""
    service = CollectionService(db)
    
    repository_ids = request.get('repository_ids', [])
    result = service.bulk_add_repositories(collection_id, repository_ids, current_user.id)
    
    if result['added'] == 0 and result['skipped'] == 0:
        raise HTTPException(status_code=400, detail="Failed to add repositories")
    
    return result


@router.delete("/{collection_id}/repositories/{repo_id}")
async def remove_repository_from_collection(
    collection_id: int,
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove repository from collection"""
    service = CollectionService(db)
    
    if not service.remove_repository_from_collection(collection_id, repo_id, current_user.id):
        raise HTTPException(status_code=400, detail="Failed to remove repository from collection")
    
    return {"message": "Repository removed from collection"}


@router.get("/{collection_id}/repositories", response_model=List[RepositoryInCollection])
async def get_collection_repositories(
    collection_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get repositories in collection"""
    service = CollectionService(db)
    repositories = service.get_collection_repositories(
        collection_id,
        user_id=current_user.id,
        limit=limit,
        offset=offset
    )
    return repositories


@router.get("/{collection_id}/stats", response_model=CollectionStats)
async def get_collection_stats(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get collection statistics"""
    service = CollectionService(db)
    collection = service.get_collection(collection_id, user_id=current_user.id)
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    stats = service.get_collection_stats(collection_id)
    return stats


# ============ Smart Collection Endpoints ============

@router.post("/{collection_id}/refresh")
async def refresh_smart_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Refresh smart collection with matching repositories"""
    service = CollectionService(db)
    
    if not service.update_smart_collection(collection_id, current_user.id):
        raise HTTPException(status_code=400, detail="Failed to refresh collection")
    
    return {"message": "Smart collection refreshed"}


# ============ Template Endpoints ============

@router.post("/templates/{template_id}/create")
async def create_from_template(
    template_id: int,
    request: Dict[str, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create new collection from template"""
    service = CollectionService(db)
    
    collection = service.create_collection_from_template(
        template_id,
        current_user.id,
        request.get('name'),
        request.get('description')
    )
    
    if not collection:
        raise HTTPException(status_code=400, detail="Failed to create from template")
    
    return {
        "id": collection.id,
        "name": collection.name,
        "message": "Collection created from template"
    }

# ============ Scanning & Analysis ============

class FileScanResult(BaseModel):
    total_files_found: int
    unique_files: int
    duplicate_files: int
    duplicates_by_name: Dict[str, int]  # filename -> count
    files_by_type: Dict[str, int]  # extension -> count
    repositories_scanned: int
    scan_duration_seconds: float


@router.post("/{collection_id}/scan", response_model=FileScanResult)
async def scan_collection_files(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Scan all repositories in a collection and detect duplicate files"""
    import os
    import time
    from pathlib import Path
    
    service = CollectionService(db)
    collection = service.get_collection(collection_id, user_id=current_user.id)
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    start_time = time.time()
    
    # Track file statistics
    all_files = []
    file_count_by_name = {}
    file_count_by_type = {}
    repositories_scanned = 0
    
    # Scan each repository in the collection
    for repo in collection.repositories:
        repo_path = repo.path
        
        if not repo_path or not os.path.exists(repo_path):
            continue
        
        repositories_scanned += 1
        
        # Walk through repository directory
        try:
            for root, dirs, files in os.walk(repo_path):
                # Skip hidden directories and common non-essential folders
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'venv', '.git']]
                
                for filename in files:
                    # Skip hidden files
                    if filename.startswith('.'):
                        continue
                    
                    filepath = os.path.join(root, filename)
                    relative_path = os.path.relpath(filepath, repo_path)
                    
                    all_files.append({
                        'name': filename,
                        'path': relative_path,
                        'repo_id': repo.id,
                        'repo_name': repo.name
                    })
                    
                    # Count by filename
                    file_count_by_name[filename] = file_count_by_name.get(filename, 0) + 1
                    
                    # Count by file extension
                    _, ext = os.path.splitext(filename)
                    ext = ext or 'no_extension'
                    file_count_by_type[ext] = file_count_by_type.get(ext, 0) + 1
        except Exception as e:
            logger.error(f"Error scanning repository {repo.name}: {str(e)}")
            continue
    
    # Calculate duplicates
    total_files = len(all_files)
    duplicate_files = sum(count - 1 for count in file_count_by_name.values() if count > 1)
    unique_files = total_files - duplicate_files
    duplicates_dict = {name: count for name, count in file_count_by_name.items() if count > 1}
    
    duration = time.time() - start_time
    
    return FileScanResult(
        total_files_found=total_files,
        unique_files=unique_files,
        duplicate_files=duplicate_files,
        duplicates_by_name=duplicates_dict,
        files_by_type=file_count_by_type,
        repositories_scanned=repositories_scanned,
        scan_duration_seconds=round(duration, 2)
    )