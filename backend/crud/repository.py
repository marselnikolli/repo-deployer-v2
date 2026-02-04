"""CRUD operations for repositories"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from models import Repository, CategoryEnum
from schemas import RepositoryCreate, RepositorySchema
from datetime import datetime
from typing import List, Optional


def get_repository(db: Session, repo_id: int) -> Optional[Repository]:
    """Get single repository by ID"""
    return db.query(Repository).filter(Repository.id == repo_id).first()


def get_repo_by_name(db: Session, name: str) -> Optional[Repository]:
    """Get repository by name"""
    return db.query(Repository).filter(Repository.name == name).first()


def get_repo_by_url(db: Session, url: str) -> Optional[Repository]:
    """Get repository by URL"""
    return db.query(Repository).filter(Repository.url == url).first()


def get_repositories(
    db: Session,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[Repository]:
    """Get repositories with optional filtering"""
    query = db.query(Repository)
    
    if category:
        query = query.filter(Repository.category == category)
    
    return query.offset(skip).limit(limit).all()


def create_repository(db: Session, repo: RepositoryCreate) -> Repository:
    """Create new repository"""
    db_repo = Repository(
        name=repo.name,
        url=repo.url,
        title=repo.title,
        category=repo.category,
        description=repo.description
    )
    db.add(db_repo)
    db.commit()
    db.refresh(db_repo)
    return db_repo


def update_repository(db: Session, repo_id: int, repo_data: dict) -> Optional[Repository]:
    """Update repository"""
    db_repo = get_repository(db, repo_id)
    if not db_repo:
        return None
    
    update_data = repo_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_repo, field, value)
    
    db_repo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_repo)
    return db_repo


def delete_repository(db: Session, repo_id: int) -> bool:
    """Delete repository"""
    db_repo = get_repository(db, repo_id)
    if not db_repo:
        return False
    
    db.delete(db_repo)
    db.commit()
    return True


def bulk_update_category(
    db: Session,
    repo_ids: List[int],
    new_category: str
) -> int:
    """Update category for multiple repositories"""
    updated = db.query(Repository).filter(
        Repository.id.in_(repo_ids)
    ).update({
        Repository.category: new_category,
        Repository.updated_at: datetime.utcnow()
    }, synchronize_session=False)
    
    db.commit()
    return updated


def bulk_delete(db: Session, repo_ids: List[int]) -> int:
    """Delete multiple repositories"""
    deleted = db.query(Repository).filter(
        Repository.id.in_(repo_ids)
    ).delete(synchronize_session=False)
    
    db.commit()
    return deleted


def get_category_stats(db: Session) -> List[dict]:
    """Get repository count by category"""
    stats = db.query(
        Repository.category,
        func.count(Repository.id).label('count')
    ).group_by(Repository.category).all()
    
    return [{"category": cat, "count": count} for cat, count in stats]


def get_stats(db: Session) -> dict:
    """Get application statistics"""
    total = db.query(func.count(Repository.id)).scalar() or 0
    cloned = db.query(func.count(Repository.id)).filter(Repository.cloned == True).scalar() or 0
    deployed = db.query(func.count(Repository.id)).filter(Repository.deployed == True).scalar() or 0
    
    categories = get_category_stats(db)
    
    return {
        "total_repositories": total,
        "total_cloned": cloned,
        "total_deployed": deployed,
        "categories": categories
    }
