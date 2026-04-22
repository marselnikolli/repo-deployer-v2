"""Search and filtering API endpoints"""

from fastapi import APIRouter, Depends, Query, HTTPException, status, Body, Header
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from database import SessionLocal

from services.search import SearchService
from models import Repository, User
from services.auth import decode_access_token
from crud.user import get_user_by_id

router = APIRouter(prefix="/api/search", tags=["search"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from Authorization header"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header"
        )
    
    # Extract "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format"
        )
    
    token = parts[1]
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user = get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    return user


class RepositorySearchResult(BaseModel):
    """Repository search result"""
    id: int
    name: str
    url: str
    title: Optional[str]
    description: Optional[str]
    language: Optional[str]
    category: Optional[str]
    stars: Optional[int]
    health_status: Optional[str]
    is_fork: bool
    archived: bool
    github_updated_at: Optional[datetime]
    github_created_at: Optional[datetime]

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Search response with pagination"""
    results: List[RepositorySearchResult]
    total: int
    limit: int
    offset: int
    page: int
    pages: int


class FilterOptions(BaseModel):
    """Available filter options"""
    languages: List[str]
    categories: List[str]
    min_stars: int
    max_stars: int
    health_statuses: List[str]
    sort_options: List[str]


@router.get("/repositories", response_model=SearchResponse)
async def search_repositories(
    q: Optional[str] = Query(None, min_length=1, max_length=100),
    language: Optional[str] = Query(None),
    min_stars: Optional[int] = Query(None, ge=0),
    max_stars: Optional[int] = Query(None, ge=0),
    health_status: Optional[str] = Query(None),
    is_fork: Optional[bool] = Query(None),
    is_archived: Optional[bool] = Query(None),
    category: Optional[str] = Query(None),
    updated_after: Optional[datetime] = Query(None),
    updated_before: Optional[datetime] = Query(None),
    sort_by: str = Query("name", regex="^(name|stars|updated_at|created_at)$"),
    sort_order: str = Query("asc", regex="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Advanced search repositories with filtering and sorting
    
    Parameters:
    - q: Search query (searches name, title, description, url)
    - language: Filter by programming language
    - min_stars: Minimum GitHub stars
    - max_stars: Maximum GitHub stars
    - health_status: Filter by health status (healthy, archived, not_found)
    - is_fork: Filter by fork status
    - is_archived: Filter by archived status
    - category: Filter by category
    - updated_after: Filter repos updated after this date (ISO format)
    - updated_before: Filter repos updated before this date (ISO format)
    - sort_by: Field to sort by (name, stars, updated_at, created_at)
    - sort_order: Sort order (asc, desc)
    - limit: Results per page (max 100)
    - offset: Pagination offset
    """
    try:
        # Get total count
        total = SearchService.search_count(
            db,
            query=q,
            language=language,
            min_stars=min_stars,
            max_stars=max_stars,
            health_status=health_status,
            is_fork=is_fork,
            is_archived=is_archived,
            category=category,
            updated_after=updated_after,
            updated_before=updated_before
        )
        
        # Get paginated results
        results = SearchService.search(
            db,
            query=q,
            language=language,
            min_stars=min_stars,
            max_stars=max_stars,
            health_status=health_status,
            is_fork=is_fork,
            is_archived=is_archived,
            category=category,
            updated_after=updated_after,
            updated_before=updated_before,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        # Calculate pagination info
        pages = (total + limit - 1) // limit
        page = (offset // limit) + 1
        
        return SearchResponse(
            results=results,
            total=total,
            limit=limit,
            offset=offset,
            page=page,
            pages=pages
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/filters", response_model=FilterOptions)
async def get_filter_options(db: Session = Depends(get_db)):
    """Get available search filter options"""
    try:
        filters = SearchService.get_search_filters(db)
        return FilterOptions(**filters)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============ SEARCH HISTORY ENDPOINTS ============

class SearchHistoryItem(BaseModel):
    """Search history item"""
    id: int
    query: Optional[str]
    category: Optional[str]
    language: Optional[str]
    health_status: Optional[str]
    results_count: int
    searched_at: datetime
    
    class Config:
        from_attributes = True


@router.get("/history", response_model=List[SearchHistoryItem])
async def get_search_history(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's search history (most recent first)"""
    try:
        from models import SearchHistory
        
        history = db.query(SearchHistory).filter(
            SearchHistory.user_id == current_user.id
        ).order_by(
            SearchHistory.searched_at.desc()
        ).limit(limit).all()
        
        return history
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/history")
async def add_search_to_history(
    q: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    min_stars: Optional[int] = Query(None),
    max_stars: Optional[int] = Query(None),
    health_status: Optional[str] = Query(None),
    is_fork: Optional[bool] = Query(None),
    is_archived: Optional[bool] = Query(None),
    category: Optional[str] = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    results_count: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a search to user's history"""
    try:
        from models import SearchHistory
        
        search_entry = SearchHistory(
            user_id=current_user.id,
            query=q,
            language=language,
            min_stars=min_stars,
            max_stars=max_stars,
            health_status=health_status,
            is_fork=is_fork,
            is_archived=is_archived,
            category=category,
            sort_by=sort_by,
            sort_order=sort_order,
            results_count=results_count
        )
        
        db.add(search_entry)
        db.commit()
        
        return {"id": search_entry.id, "status": "saved"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/history/{history_id}")
async def delete_search_history(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a search history entry"""
    try:
        from models import SearchHistory
        
        entry = db.query(SearchHistory).filter(
            SearchHistory.id == history_id,
            SearchHistory.user_id == current_user.id
        ).first()
        
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        
        db.delete(entry)
        db.commit()
        
        return {"status": "deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============ SAVED SEARCHES ENDPOINTS ============

class SavedSearchInput(BaseModel):
    """Saved search input"""
    name: str
    description: Optional[str] = None
    query: Optional[str] = None
    language: Optional[str] = None
    min_stars: Optional[int] = None
    max_stars: Optional[int] = None
    health_status: Optional[str] = None
    is_fork: Optional[bool] = None
    is_archived: Optional[bool] = None
    category: Optional[str] = None
    sort_by: str = "name"
    sort_order: str = "asc"


class SavedSearchItem(BaseModel):
    """Saved search item"""
    id: int
    name: str
    description: Optional[str]
    query: Optional[str]
    category: Optional[str]
    language: Optional[str]
    health_status: Optional[str]
    times_used: int
    last_used: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


@router.get("/saved", response_model=List[SavedSearchItem])
async def get_saved_searches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's saved searches"""
    try:
        from models import SavedSearch
        
        saved = db.query(SavedSearch).filter(
            SavedSearch.user_id == current_user.id
        ).order_by(
            SavedSearch.created_at.desc()
        ).all()
        
        return saved
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/saved")
async def create_saved_search(
    search: SavedSearchInput = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new saved search"""
    try:
        from models import SavedSearch
        
        saved_search = SavedSearch(
            user_id=current_user.id,
            name=search.name,
            description=search.description,
            query=search.query,
            language=search.language,
            min_stars=search.min_stars,
            max_stars=search.max_stars,
            health_status=search.health_status,
            is_fork=search.is_fork,
            is_archived=search.is_archived,
            category=search.category,
            sort_by=search.sort_by,
            sort_order=search.sort_order
        )
        
        db.add(saved_search)
        db.commit()
        db.refresh(saved_search)
        
        return {"id": saved_search.id, "name": saved_search.name, "status": "created"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/saved/{saved_search_id}")
async def update_saved_search(
    saved_search_id: int,
    search: SavedSearchInput = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a saved search"""
    try:
        from models import SavedSearch
        
        saved_search = db.query(SavedSearch).filter(
            SavedSearch.id == saved_search_id,
            SavedSearch.user_id == current_user.id
        ).first()
        
        if not saved_search:
            raise HTTPException(status_code=404, detail="Saved search not found")
        
        saved_search.name = search.name
        saved_search.description = search.description
        saved_search.query = search.query
        saved_search.language = search.language
        saved_search.min_stars = search.min_stars
        saved_search.max_stars = search.max_stars
        saved_search.health_status = search.health_status
        saved_search.is_fork = search.is_fork
        saved_search.is_archived = search.is_archived
        saved_search.category = search.category
        saved_search.sort_by = search.sort_by
        saved_search.sort_order = search.sort_order
        
        db.commit()
        db.refresh(saved_search)
        
        return {"id": saved_search.id, "status": "updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/saved/{saved_search_id}")
async def delete_saved_search(
    saved_search_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a saved search"""
    try:
        from models import SavedSearch
        
        saved_search = db.query(SavedSearch).filter(
            SavedSearch.id == saved_search_id,
            SavedSearch.user_id == current_user.id
        ).first()
        
        if not saved_search:
            raise HTTPException(status_code=404, detail="Saved search not found")
        
        db.delete(saved_search)
        db.commit()
        
        return {"status": "deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/saved/{saved_search_id}/use")
async def use_saved_search(
    saved_search_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a saved search as used (increment counter, update last_used)"""
    try:
        from models import SavedSearch
        from datetime import datetime
        
        saved_search = db.query(SavedSearch).filter(
            SavedSearch.id == saved_search_id,
            SavedSearch.user_id == current_user.id
        ).first()
        
        if not saved_search:
            raise HTTPException(status_code=404, detail="Saved search not found")
        
        saved_search.times_used += 1
        saved_search.last_used = datetime.now()
        
        db.commit()
        
        return {"status": "updated", "times_used": saved_search.times_used}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repositories/{repo_id}", response_model=RepositorySearchResult)
async def get_repository(repo_id: int, db: Session = Depends(get_db)):
    """Get a specific repository by ID"""
    try:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found"
            )
        return repo
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
