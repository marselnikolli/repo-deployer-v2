"""Service for managing repository collections"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from models import Collection, Repository, User
from database import SessionLocal
import re

logger = logging.getLogger(__name__)


class CollectionService:
    """Service for managing custom and smart collections"""
    
    def __init__(self, db: Session = None):
        self.db = db or SessionLocal()
    
    # ============ Collection CRUD ============
    
    def create_collection(
        self,
        user_id: int,
        name: str,
        description: str = None,
        is_smart: bool = False,
        filter_config: Dict[str, Any] = None,
        is_public: bool = False,
        is_template: bool = False,
        auto_populate: bool = False
    ) -> Collection:
        """Create a new collection"""
        # Generate slug from name
        slug = self._generate_slug(name)
        
        # Check for duplicate slug
        existing = self.db.query(Collection).filter(
            Collection.slug == slug,
            Collection.user_id == user_id
        ).first()
        
        if existing:
            # Add a counter to make slug unique
            counter = 1
            while self.db.query(Collection).filter_by(slug=f"{slug}-{counter}").first():
                counter += 1
            slug = f"{slug}-{counter}"
        
        collection = Collection(
            user_id=user_id,
            name=name,
            description=description,
            slug=slug,
            is_smart=is_smart,
            filter_config=filter_config or {},
            is_public=is_public,
            is_template=is_template,
            auto_populate=auto_populate
        )
        self.db.add(collection)
        self.db.commit()
        logger.info(f"Created collection {collection.id}: {name}")
        return collection
    
    def get_collection(self, collection_id: int, user_id: int = None) -> Optional[Collection]:
        """Get collection by ID"""
        query = self.db.query(Collection).filter_by(id=collection_id)
        
        if user_id:
            query = query.filter(
                or_(
                    Collection.user_id == user_id,
                    Collection.is_public == True
                )
            )
        
        return query.first()
    
    def list_collections(
        self,
        user_id: int = None,
        include_public: bool = False,
        limit: int = 50,
        offset: int = 0
    ) -> List[Collection]:
        """List collections for user"""
        query = self.db.query(Collection)
        
        if user_id:
            query = query.filter_by(user_id=user_id)
        
        if include_public:
            query = query.filter(Collection.is_public == True)
        
        return query.order_by(Collection.created_at.desc()).limit(limit).offset(offset).all()
    
    def update_collection(
        self,
        collection_id: int,
        user_id: int,
        **kwargs
    ) -> Optional[Collection]:
        """Update collection"""
        collection = self.db.query(Collection).filter(
            and_(Collection.id == collection_id, Collection.user_id == user_id)
        ).first()
        
        if not collection:
            return None
        
        # Update allowed fields
        allowed_fields = {'name', 'description', 'is_public', 'filter_config', 'auto_populate'}
        for field, value in kwargs.items():
            if field in allowed_fields and value is not None:
                setattr(collection, field, value)
        
        collection.updated_at = datetime.utcnow()
        self.db.commit()
        return collection
    
    def delete_collection(self, collection_id: int, user_id: int) -> bool:
        """Delete collection"""
        collection = self.db.query(Collection).filter(
            and_(Collection.id == collection_id, Collection.user_id == user_id)
        ).first()
        
        if collection:
            self.db.delete(collection)
            self.db.commit()
            logger.info(f"Deleted collection {collection_id}")
            return True
        return False
    
    # ============ Repository Management ============
    
    def add_repository_to_collection(
        self,
        collection_id: int,
        repository_id: int,
        user_id: int
    ) -> bool:
        """Add repository to collection"""
        collection = self.get_collection(collection_id, user_id)
        if not collection:
            return False
        
        repo = self.db.query(Repository).filter_by(id=repository_id).first()
        if not repo:
            return False
        
        # Check if already in collection
        if repo in collection.repositories:
            return True
        
        collection.repositories.append(repo)
        self.db.commit()
        return True
    
    def remove_repository_from_collection(
        self,
        collection_id: int,
        repository_id: int,
        user_id: int
    ) -> bool:
        """Remove repository from collection"""
        collection = self.get_collection(collection_id, user_id)
        if not collection:
            return False
        
        repo = self.db.query(Repository).filter_by(id=repository_id).first()
        if not repo or repo not in collection.repositories:
            return False
        
        collection.repositories.remove(repo)
        self.db.commit()
        return True
    
    def get_collection_repositories(
        self,
        collection_id: int,
        user_id: int = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Repository]:
        """Get repositories in collection"""
        collection = self.get_collection(collection_id, user_id)
        if not collection:
            return []
        
        return collection.repositories[offset:offset+limit]
    
    def get_collection_repo_count(self, collection_id: int) -> int:
        """Get count of repositories in collection"""
        collection = self.db.query(Collection).filter_by(id=collection_id).first()
        if not collection:
            return 0
        return len(collection.repositories)
    
    # ============ Smart Collection Filtering ============
    
    def apply_smart_filters(
        self,
        user_id: int,
        filter_config: Dict[str, Any],
        limit: int = 100
    ) -> List[Repository]:
        """Apply smart filters to get matching repositories"""
        query = self.db.query(Repository).filter_by(user_id=user_id)
        
        # Filter by language
        if 'languages' in filter_config and filter_config['languages']:
            query = query.filter(Repository.language.in_(filter_config['languages']))
        
        # Filter by category
        if 'categories' in filter_config and filter_config['categories']:
            query = query.filter(Repository.category.in_(filter_config['categories']))
        
        # Filter by stars
        if 'min_stars' in filter_config:
            query = query.filter(Repository.stars >= filter_config['min_stars'])
        
        if 'max_stars' in filter_config:
            query = query.filter(Repository.stars <= filter_config['max_stars'])
        
        # Filter by license
        if 'licenses' in filter_config and filter_config['licenses']:
            query = query.filter(Repository.license.in_(filter_config['licenses']))
        
        # Text search in name/description
        if 'search_text' in filter_config and filter_config['search_text']:
            search = f"%{filter_config['search_text']}%"
            query = query.filter(
                or_(
                    Repository.name.ilike(search),
                    Repository.description.ilike(search)
                )
            )
        
        return query.limit(limit).all()
    
    def update_smart_collection(self, collection_id: int, user_id: int) -> bool:
        """Update smart collection with current matching repositories"""
        collection = self.get_collection(collection_id, user_id)
        if not collection or not collection.is_smart:
            return False
        
        # Get matching repos
        matching_repos = self.apply_smart_filters(user_id, collection.filter_config or {})
        
        # Clear current repos and add new ones
        collection.repositories.clear()
        collection.repositories.extend(matching_repos)
        collection.updated_at = datetime.utcnow()
        self.db.commit()
        
        logger.info(f"Updated smart collection {collection_id} with {len(matching_repos)} repos")
        return True
    
    # ============ Template Management ============
    
    def list_templates(self, limit: int = 20) -> List[Collection]:
        """List public collection templates"""
        return self.db.query(Collection).filter(
            and_(Collection.is_template == True, Collection.is_public == True)
        ).order_by(Collection.created_at.desc()).limit(limit).all()
    
    def create_collection_from_template(
        self,
        template_id: int,
        user_id: int,
        name: str,
        description: str = None
    ) -> Optional[Collection]:
        """Create new collection from template"""
        template = self.db.query(Collection).filter_by(id=template_id, is_template=True).first()
        if not template:
            return None
        
        # Create new collection with same settings
        new_collection = self.create_collection(
            user_id=user_id,
            name=name,
            description=description or template.description,
            is_smart=template.is_smart,
            filter_config=template.filter_config,
            auto_populate=template.auto_populate
        )
        
        # Copy repositories if custom collection
        if not template.is_smart:
            new_collection.repositories.extend(template.repositories)
            self.db.commit()
        
        logger.info(f"Created collection {new_collection.id} from template {template_id}")
        return new_collection
    
    # ============ Helper Methods ============
    
    def _generate_slug(self, name: str) -> str:
        """Generate URL-safe slug from name"""
        # Convert to lowercase and replace spaces with hyphens
        slug = name.lower().strip()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')
        return slug[:50]  # Limit to 50 chars
    
    def bulk_add_repositories(
        self,
        collection_id: int,
        repository_ids: List[int],
        user_id: int
    ) -> Dict[str, int]:
        """Add multiple repositories to collection"""
        collection = self.get_collection(collection_id, user_id)
        if not collection:
            return {'added': 0, 'skipped': 0}
        
        added = 0
        skipped = 0
        
        for repo_id in repository_ids:
            if self.add_repository_to_collection(collection_id, repo_id, user_id):
                added += 1
            else:
                skipped += 1
        
        return {'added': added, 'skipped': skipped}
    
    def get_collection_stats(self, collection_id: int) -> Dict[str, Any]:
        """Get collection statistics"""
        collection = self.db.query(Collection).filter_by(id=collection_id).first()
        if not collection:
            return {}
        
        repos = collection.repositories
        
        # Count by category
        categories = {}
        languages = {}
        total_stars = 0
        
        for repo in repos:
            # Category stats
            cat = repo.category or 'other'
            categories[cat] = categories.get(cat, 0) + 1
            
            # Language stats
            if repo.language:
                languages[repo.language] = languages.get(repo.language, 0) + 1
            
            # Star stats
            total_stars += repo.stars or 0
        
        return {
            'total_repositories': len(repos),
            'total_stars': total_stars,
            'categories': categories,
            'languages': languages,
            'average_stars': total_stars / len(repos) if repos else 0
        }
