"""Pydantic schemas for API validation"""

from pydantic import BaseModel, HttpUrl
from datetime import datetime
from typing import List, Optional


class RepositoryBase(BaseModel):
    name: str
    url: str
    title: str
    category: str = "other"
    description: Optional[str] = None


class RepositoryCreate(RepositoryBase):
    pass


class RepositorySchema(RepositoryBase):
    id: int
    cloned: bool
    deployed: bool
    last_synced: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class BulkActionRequest(BaseModel):
    repository_ids: List[int]
    new_category: Optional[str] = None


class ImportResponse(BaseModel):
    total_found: int
    message: str


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
