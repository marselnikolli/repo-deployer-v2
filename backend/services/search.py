"""Search and filtering service for repositories"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, text
from models import Repository
from datetime import datetime, timedelta


class SearchService:
    """Service for searching and filtering repositories"""
    
    @staticmethod
    def search(
        db: Session,
        query: Optional[str] = None,
        language: Optional[str] = None,
        min_stars: Optional[int] = None,
        max_stars: Optional[int] = None,
        health_status: Optional[str] = None,
        is_fork: Optional[bool] = None,
        is_archived: Optional[bool] = None,
        category: Optional[str] = None,
        updated_after: Optional[datetime] = None,
        updated_before: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> List[Repository]:
        """
        Advanced search with filtering and sorting
        
        Args:
            db: Database session
            query: Full-text search query (searches name, description, url)
            language: Filter by programming language
            min_stars: Minimum GitHub stars
            max_stars: Maximum GitHub stars
            health_status: Filter by health status (healthy, archived, not_found)
            is_fork: Filter by fork status
            is_archived: Filter by archived status
            category: Filter by category
            updated_after: Filter repos updated after date
            updated_before: Filter repos updated before date
            limit: Max results
            offset: Pagination offset
            sort_by: Field to sort by (name, stars, updated_at, created_at)
            sort_order: asc or desc
        """
        query_obj = db.query(Repository)
        
        # Text search
        if query:
            search_term = f"%{query}%"
            query_obj = query_obj.filter(
                or_(
                    Repository.name.ilike(search_term),
                    Repository.description.ilike(search_term),
                    Repository.url.ilike(search_term),
                    Repository.title.ilike(search_term)
                )
            )
        
        # Language filter
        if language:
            query_obj = query_obj.filter(Repository.language == language)
        
        # Stars filter
        if min_stars is not None:
            query_obj = query_obj.filter(Repository.stars >= min_stars)
        if max_stars is not None:
            query_obj = query_obj.filter(Repository.stars <= max_stars)
        
        # Health status filter
        if health_status:
            query_obj = query_obj.filter(Repository.health_status == health_status)
        
        # Fork filter
        if is_fork is not None:
            query_obj = query_obj.filter(Repository.is_fork == is_fork)
        
        # Archive filter
        if is_archived is not None:
            query_obj = query_obj.filter(Repository.archived == is_archived)
        
        # Category filter
        if category:
            query_obj = query_obj.filter(Repository.category == category)
        
        # Date filters
        if updated_after:
            query_obj = query_obj.filter(Repository.github_updated_at >= updated_after)
        if updated_before:
            query_obj = query_obj.filter(Repository.github_updated_at <= updated_before)
        
        # Sorting
        sort_column = getattr(Repository, sort_by, Repository.name)
        if sort_order.lower() == "desc":
            query_obj = query_obj.order_by(sort_column.desc())
        else:
            query_obj = query_obj.order_by(sort_column.asc())
        
        # Pagination
        return query_obj.offset(offset).limit(limit).all()
    
    @staticmethod
    def get_search_filters(db: Session) -> Dict[str, Any]:
        """Get available filter options for search UI"""
        languages = db.query(Repository.language).distinct().filter(
            Repository.language.isnot(None)
        ).all()
        languages = sorted([lang[0] for lang in languages if lang[0]])
        
        categories = db.query(Repository.category).distinct().all()
        categories = sorted([cat[0] for cat in categories if cat[0]])
        
        min_stars = db.query(func.min(Repository.stars)).scalar() or 0
        max_stars = db.query(func.max(Repository.stars)).scalar() or 0
        
        health_statuses = db.query(Repository.health_status).distinct().filter(
            Repository.health_status.isnot(None)
        ).all()
        health_statuses = [status[0] for status in health_statuses if status[0]]
        
        return {
            "languages": languages,
            "categories": categories,
            "min_stars": min_stars,
            "max_stars": max_stars,
            "health_statuses": health_statuses,
            "sort_options": ["name", "stars", "updated_at", "created_at"]
        }
    
    @staticmethod
    def search_count(
        db: Session,
        query: Optional[str] = None,
        language: Optional[str] = None,
        min_stars: Optional[int] = None,
        max_stars: Optional[int] = None,
        health_status: Optional[str] = None,
        is_fork: Optional[bool] = None,
        is_archived: Optional[bool] = None,
        category: Optional[str] = None,
        updated_after: Optional[datetime] = None,
        updated_before: Optional[datetime] = None
    ) -> int:
        """Get count of search results without pagination"""
        query_obj = db.query(func.count(Repository.id))
        
        # Text search
        if query:
            search_term = f"%{query}%"
            query_obj = query_obj.filter(
                or_(
                    Repository.name.ilike(search_term),
                    Repository.description.ilike(search_term),
                    Repository.url.ilike(search_term),
                    Repository.title.ilike(search_term)
                )
            )
        
        # Language filter
        if language:
            query_obj = query_obj.filter(Repository.language == language)
        
        # Stars filter
        if min_stars is not None:
            query_obj = query_obj.filter(Repository.stars >= min_stars)
        if max_stars is not None:
            query_obj = query_obj.filter(Repository.stars <= max_stars)
        
        # Health status filter
        if health_status:
            query_obj = query_obj.filter(Repository.health_status == health_status)
        
        # Fork filter
        if is_fork is not None:
            query_obj = query_obj.filter(Repository.is_fork == is_fork)
        
        # Archive filter
        if is_archived is not None:
            query_obj = query_obj.filter(Repository.archived == is_archived)
        
        # Category filter
        if category:
            query_obj = query_obj.filter(Repository.category == category)
        
        # Date filters
        if updated_after:
            query_obj = query_obj.filter(Repository.github_updated_at >= updated_after)
        if updated_before:
            query_obj = query_obj.filter(Repository.github_updated_at <= updated_before)
        
        return query_obj.scalar() or 0
