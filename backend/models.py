"""SQLAlchemy database models"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum, Table, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum
from datetime import datetime


# Association table for many-to-many relationship between repositories and tags
repository_tags = Table(
    'repository_tags',
    Base.metadata,
    Column('repository_id', Integer, ForeignKey('repositories.id', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True)
)


class CategoryEnum(str, enum.Enum):
    """Repository categories"""
    SECURITY = "security"
    CI_CD = "ci_cd"
    DATABASE = "database"
    DEVOPS = "devops"
    API = "api"
    FRONTEND = "frontend"
    BACKEND = "backend"
    ML_AI = "ml_ai"
    EMBEDDED = "embedded"
    DOCUMENTATION = "documentation"
    TOOLS = "tools"
    LIBRARY = "library"
    MOBILE = "mobile"
    OTHER = "other"


class Repository(Base):
    """Repository model"""
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True)
    url = Column(String(512), unique=True)
    title = Column(String(512))
    description = Column(String(2048), nullable=True)
    category = Column(String(50), default=CategoryEnum.OTHER)
    path = Column(String(512), nullable=True)

    # Status
    cloned = Column(Boolean, default=False)
    deployed = Column(Boolean, default=False)
    last_synced = Column(DateTime, nullable=True)

    # GitHub metadata
    stars = Column(Integer, default=0)
    forks = Column(Integer, default=0)
    watchers = Column(Integer, default=0)
    language = Column(String(100), nullable=True)
    languages = Column(JSON, nullable=True)  # Dict of language: bytes
    topics = Column(JSON, nullable=True)  # List of topic strings
    license = Column(String(50), nullable=True)
    archived = Column(Boolean, default=False)
    is_fork = Column(Boolean, default=False)
    open_issues = Column(Integer, default=0)
    default_branch = Column(String(100), default="main")
    github_created_at = Column(DateTime, nullable=True)
    github_updated_at = Column(DateTime, nullable=True)
    github_pushed_at = Column(DateTime, nullable=True)
    last_metadata_sync = Column(DateTime, nullable=True)

    # Health status
    health_status = Column(String(20), default="unknown")  # healthy, archived, not_found, unknown
    last_health_check = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    tags = relationship("Tag", secondary=repository_tags, back_populates="repositories")

    def __repr__(self):
        return f"<Repository {self.name}>"


class Tag(Base):
    """Tag model for flexible repository tagging"""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    color = Column(String(7), default="#6B7280")  # Hex color
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    repositories = relationship("Repository", secondary=repository_tags, back_populates="tags")

    def __repr__(self):
        return f"<Tag {self.name}>"


class Category(Base):
    """Category metadata"""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, index=True)
    display_name = Column(String(100))
    description = Column(String(512))
    color = Column(String(7))  # Hex color

    def __repr__(self):
        return f"<Category {self.name}>"


class AuditLog(Base):
    """Audit log model for tracking all operations"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    operation = Column(String, index=True)  # import, delete, update, clone, sync
    resource_type = Column(String)  # repository, category, bulk_action
    resource_id = Column(Integer, nullable=True)
    details = Column(String)  # JSON string with operation details
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, server_default=func.now(), index=True)
    status = Column(String)  # success, failure
    error_message = Column(String, nullable=True)

    def __repr__(self):
        return f"<AuditLog {self.operation} on {self.resource_type} at {self.timestamp}>"

