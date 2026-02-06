"""Search and filtering API endpoints"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from database import SessionLocal

from services.search import SearchService
from models import Repository

router = APIRouter(prefix="/api/search", tags=["search"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
