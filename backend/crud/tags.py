"""CRUD operations for tags"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from models import Tag, Repository, repository_tags
from schemas import TagCreate
from datetime import datetime
from typing import List, Optional


def get_tag(db: Session, tag_id: int) -> Optional[Tag]:
    """Get single tag by ID"""
    return db.query(Tag).filter(Tag.id == tag_id).first()


def get_tag_by_name(db: Session, name: str) -> Optional[Tag]:
    """Get tag by name"""
    return db.query(Tag).filter(Tag.name == name).first()


def get_tags(db: Session, skip: int = 0, limit: int = 100) -> List[Tag]:
    """Get all tags"""
    return db.query(Tag).order_by(Tag.name).offset(skip).limit(limit).all()


def create_tag(db: Session, tag: TagCreate) -> Tag:
    """Create a new tag"""
    db_tag = Tag(
        name=tag.name,
        color=tag.color
    )
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag


def get_or_create_tag(db: Session, name: str, color: str = "#6B7280") -> Tag:
    """Get existing tag or create new one"""
    tag = get_tag_by_name(db, name)
    if tag:
        return tag
    return create_tag(db, TagCreate(name=name, color=color))


def update_tag(db: Session, tag_id: int, name: Optional[str] = None, color: Optional[str] = None) -> Optional[Tag]:
    """Update a tag"""
    tag = get_tag(db, tag_id)
    if not tag:
        return None

    if name is not None:
        tag.name = name
    if color is not None:
        tag.color = color

    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag_id: int) -> bool:
    """Delete a tag"""
    tag = get_tag(db, tag_id)
    if not tag:
        return False

    db.delete(tag)
    db.commit()
    return True


def add_tags_to_repository(db: Session, repo_id: int, tag_ids: List[int]) -> Optional[Repository]:
    """Add tags to a repository"""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        return None

    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    for tag in tags:
        if tag not in repo.tags:
            repo.tags.append(tag)

    db.commit()
    db.refresh(repo)
    return repo


def remove_tags_from_repository(db: Session, repo_id: int, tag_ids: List[int]) -> Optional[Repository]:
    """Remove tags from a repository"""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        return None

    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    for tag in tags:
        if tag in repo.tags:
            repo.tags.remove(tag)

    db.commit()
    db.refresh(repo)
    return repo


def set_repository_tags(db: Session, repo_id: int, tag_ids: List[int]) -> Optional[Repository]:
    """Set all tags for a repository (replaces existing)"""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        return None

    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    repo.tags = tags

    db.commit()
    db.refresh(repo)
    return repo


def get_tags_with_counts(db: Session) -> List[dict]:
    """Get all tags with repository counts"""
    results = db.query(
        Tag,
        func.count(repository_tags.c.repository_id).label('count')
    ).outerjoin(
        repository_tags, Tag.id == repository_tags.c.tag_id
    ).group_by(Tag.id).order_by(Tag.name).all()

    return [
        {
            "id": tag.id,
            "name": tag.name,
            "color": tag.color,
            "count": count
        }
        for tag, count in results
    ]


def bulk_add_tags(db: Session, repo_ids: List[int], tag_ids: List[int]) -> int:
    """Add tags to multiple repositories"""
    updated = 0
    repos = db.query(Repository).filter(Repository.id.in_(repo_ids)).all()
    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()

    for repo in repos:
        for tag in tags:
            if tag not in repo.tags:
                repo.tags.append(tag)
        updated += 1

    db.commit()
    return updated


def bulk_remove_tags(db: Session, repo_ids: List[int], tag_ids: List[int]) -> int:
    """Remove tags from multiple repositories"""
    updated = 0
    repos = db.query(Repository).filter(Repository.id.in_(repo_ids)).all()
    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()

    for repo in repos:
        for tag in tags:
            if tag in repo.tags:
                repo.tags.remove(tag)
        updated += 1

    db.commit()
    return updated
