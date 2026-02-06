"""CRUD operations for User model"""

from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from models import User
from services.auth import hash_password, generate_api_key
from typing import Optional, List


def create_user(
    db: Session,
    email: str,
    password: Optional[str] = None,
    name: Optional[str] = None,
    auth_provider: str = "local",
    github_id: Optional[str] = None,
    google_id: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> User:
    """Create a new user"""
    password_hash = hash_password(password) if password else None
    
    user = User(
        email=email,
        password_hash=password_hash,
        name=name,
        auth_provider=auth_provider,
        github_id=github_id,
        google_id=google_id,
        avatar_url=avatar_url,
        is_verified=(auth_provider != "local"),  # OAuth users auto-verified
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get a user by email"""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get a user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_github_id(db: Session, github_id: str) -> Optional[User]:
    """Get a user by GitHub ID"""
    return db.query(User).filter(User.github_id == github_id).first()


def get_user_by_google_id(db: Session, google_id: str) -> Optional[User]:
    """Get a user by Google ID"""
    return db.query(User).filter(User.google_id == google_id).first()


def update_user(db: Session, user_id: int, **kwargs) -> Optional[User]:
    """Update a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    for key, value in kwargs.items():
        if hasattr(user, key):
            setattr(user, key, value)
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user


def update_last_login(db: Session, user_id: int):
    """Update the last login timestamp"""
    return update_user(db, user_id, last_login=datetime.utcnow())


def add_api_key(db: Session, user_id: int, key_name: Optional[str] = None) -> str:
    """Add a new API key to user"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    api_key = generate_api_key()
    
    if user.api_keys is None:
        user.api_keys = []
    
    user.api_keys.append({
        "key": api_key,
        "name": key_name or "API Key",
        "created_at": datetime.utcnow().isoformat(),
        "last_used": None
    })
    
    db.commit()
    db.refresh(user)
    return api_key


def revoke_api_key(db: Session, user_id: int, key: str) -> bool:
    """Revoke an API key"""
    user = get_user_by_id(db, user_id)
    if not user or not user.api_keys:
        return False
    
    user.api_keys = [k for k in user.api_keys if k["key"] != key]
    db.commit()
    return True


def get_user_by_api_key(db: Session, api_key: str) -> Optional[User]:
    """Get a user by API key"""
    users = db.query(User).all()
    for user in users:
        if user.api_keys:
            for key_obj in user.api_keys:
                if key_obj.get("key") == api_key:
                    return user
    return None


def list_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    """List all users"""
    return db.query(User).offset(skip).limit(limit).all()


def delete_user(db: Session, user_id: int) -> bool:
    """Delete a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False
    
    db.delete(user)
    db.commit()
    return True
