"""Pydantic schemas for API validation"""

from pydantic import BaseModel, HttpUrl, EmailStr
from datetime import datetime
from typing import List, Optional, Dict, Any


# ============ AUTHENTICATION SCHEMAS ============

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserProfile(BaseModel):
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    auth_provider: str
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class UserSchema(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    auth_provider: str
    is_verified: bool
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSchema


class APIKeyResponse(BaseModel):
    key: str
    created_at: datetime
    last_used: Optional[datetime] = None


class APIKeyCreate(BaseModel):
    name: Optional[str] = None


# ============ PASSWORD RESET / EMAIL VERIFICATION ============

class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class EmailVerification(BaseModel):
    token: str


class PasswordResetResponse(BaseModel):
    message: str


class EmailVerificationResponse(BaseModel):
    message: str
    user: Optional[UserSchema] = None


# ============ TAG SCHEMAS ============

class TagBase(BaseModel):
    name: str
    color: str = "#6B7280"


class TagCreate(TagBase):
    pass


class TagSchema(TagBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ============ REPOSITORY SCHEMAS ============

class RepositoryBase(BaseModel):
    name: str
    url: str
    title: str
    category: str = "other"
    description: Optional[str] = None


class RepositoryCreate(RepositoryBase):
    pass


class RepositoryUpdate(BaseModel):
    """Schema for partial repository updates"""
    name: Optional[str] = None
    url: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None


class RepositorySchema(RepositoryBase):
    id: int
    cloned: bool
    deployed: bool
    last_synced: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    # GitHub metadata
    stars: int = 0
    forks: int = 0
    watchers: int = 0
    language: Optional[str] = None
    languages: Optional[Dict[str, int]] = None
    topics: Optional[List[str]] = None
    license: Optional[str] = None
    archived: bool = False
    is_fork: bool = False
    open_issues: int = 0
    default_branch: str = "main"
    github_created_at: Optional[datetime] = None
    github_updated_at: Optional[datetime] = None
    github_pushed_at: Optional[datetime] = None
    last_metadata_sync: Optional[datetime] = None
    # Health
    health_status: str = "unknown"
    last_health_check: Optional[datetime] = None
    # Tags
    tags: List[TagSchema] = []

    class Config:
        from_attributes = True


class RepositoryWithMetadata(RepositorySchema):
    """Extended schema with full metadata"""
    pass


# ============ BULK OPERATIONS ============

class BulkActionRequest(BaseModel):
    repository_ids: List[int]
    new_category: Optional[str] = None


class BulkTagRequest(BaseModel):
    repository_ids: List[int]
    tag_ids: List[int]


# ============ IMPORT/EXPORT ============

class ImportResponse(BaseModel):
    total_found: int
    message: str
    duplicates_in_file: int = 0
    duplicates_in_db: int = 0
    newly_imported: int = 0


# ============ STATS ============

class CategoryStats(BaseModel):
    name: str
    count: int
    color: Optional[str] = None


class StatsResponse(BaseModel):
    total_repositories: int
    total_cloned: int
    total_deployed: int
    categories: List[CategoryStats]
    last_import: Optional[datetime]


# ============ GITHUB METADATA ============

class GitHubMetadataResponse(BaseModel):
    stars: int
    forks: int
    watchers: int
    language: Optional[str]
    languages: Dict[str, int]
    topics: List[str]
    description: Optional[str]
    license: Optional[str]
    archived: bool
    is_fork: bool
    created_at: Optional[str]
    updated_at: Optional[str]
    pushed_at: Optional[str]
    open_issues: int
    default_branch: str
    suggested_category: str
