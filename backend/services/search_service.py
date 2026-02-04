"""Search service for repositories"""

from sqlalchemy import or_
from sqlalchemy.orm import Session
from models import Repository


class SearchService:
    """Service for searching repositories"""

    @staticmethod
    def search_repositories(
        db: Session,
        query: str,
        category: str = None,
        cloned: bool = None,
        deployed: bool = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Repository], int]:
        """
        Search repositories with full-text search and filters
        
        Args:
            db: Database session
            query: Search query string (searches name, title, url)
            category: Filter by category
            cloned: Filter by cloned status
            deployed: Filter by deployed status
            limit: Results limit
            offset: Results offset
            
        Returns:
            Tuple of (results, total_count)
        """
        search_query = db.query(Repository)
        
        # Full-text search
        if query:
            search_filter = or_(
                Repository.name.ilike(f"%{query}%"),
                Repository.title.ilike(f"%{query}%"),
                Repository.url.ilike(f"%{query}%"),
            )
            search_query = search_query.filter(search_filter)
        
        # Category filter
        if category:
            search_query = search_query.filter(Repository.category == category)
        
        # Status filters
        if cloned is not None:
            search_query = search_query.filter(Repository.cloned == cloned)
        
        if deployed is not None:
            search_query = search_query.filter(Repository.deployed == deployed)
        
        # Get total count before pagination
        total_count = search_query.count()
        
        # Apply pagination
        results = search_query.offset(offset).limit(limit).all()
        
        return results, total_count
