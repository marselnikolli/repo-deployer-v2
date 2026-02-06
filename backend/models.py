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

# Association table for many-to-many relationship between collections and repositories
collection_repositories = Table(
    'collection_repositories',
    Base.metadata,
    Column('collection_id', Integer, ForeignKey('collections.id', ondelete='CASCADE'), primary_key=True),
    Column('repository_id', Integer, ForeignKey('repositories.id', ondelete='CASCADE'), primary_key=True)
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
    url = Column(String(512), unique=True, index=True)
    title = Column(String(2048))
    description = Column(String(4096), nullable=True)
    category = Column(String(50), default=CategoryEnum.OTHER, index=True)
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
    health_status = Column(String(20), default="unknown", index=True)  # healthy, archived, not_found, unknown
    last_health_check = Column(DateTime, nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
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



class User(Base):
    """User model for authentication and user management"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=True)  # Null if OAuth-only
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    auth_provider = Column(String(50), default="local")  # local, github, google
    github_id = Column(String(100), nullable=True)
    google_id = Column(String(100), nullable=True)
    name = Column(String(100), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    profile = Column(JSON, nullable=True)  # Additional profile info
    api_keys = Column(JSON, nullable=True)  # List of API keys
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<User {self.email} ({self.auth_provider})>"


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


class ScheduledTask(Base):
    """Scheduled task configuration"""
    __tablename__ = "scheduled_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True)
    description = Column(String(512), nullable=True)
    task_type = Column(String(50), index=True)  # metadata_sync, health_check, stale_detection, auto_pull
    schedule_type = Column(String(50))  # cron, interval
    cron_expression = Column(String(100), nullable=True)  # e.g., "0 0 * * *" for daily
    interval_hours = Column(Integer, nullable=True)  # e.g., 24 for daily
    enabled = Column(Boolean, default=True, index=True)
    
    # Execution info
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    last_run_status = Column(String(20), nullable=True)  # success, failure, running
    last_run_message = Column(String, nullable=True)
    
    # Configuration
    config = Column(JSON, nullable=True)  # Task-specific config
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ScheduledTask {self.name} ({self.task_type})>"


class UserRole(str, enum.Enum):
    """User roles for RBAC"""
    ADMIN = "admin"  # Full access 
    EDITOR = "editor"  # Can manage repositories, deployments
    VIEWER = "viewer"  # Read-only access


class NotificationType(str, enum.Enum):
    """Notification types"""
    DEPLOYMENT = "deployment"
    HEALTH_CHECK = "health_check"
    SYNC = "sync"
    IMPORT = "import"
    ERROR = "error"
    INFO = "info"
    SUCCESS = "success"


class NotificationChannel(str, enum.Enum):
    """Notification channels"""
    IN_APP = "in_app"
    EMAIL = "email"
    SLACK = "slack"
    DISCORD = "discord"
    TELEGRAM = "telegram"


class Notification(Base):
    """Notification model"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    type = Column(String(50), default=NotificationType.INFO)
    channel = Column(String(50), default=NotificationChannel.IN_APP)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    data = Column(JSON, nullable=True)  # Extra context/data
    read = Column(Boolean, default=False, index=True)
    sent = Column(Boolean, default=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    
    # Delivery status
    delivery_status = Column(String(50), default='pending')  # pending, sent, failed, delivered
    delivery_error = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Notification {self.title} ({self.type}) - {self.channel}>"


class ImportSource(Base):
    """Import source configuration for users"""
    __tablename__ = "import_sources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    source_type = Column(String(50), nullable=False, index=True)  # github_stars, github_org, gitlab, bitbucket, opml, json, csv
    source_name = Column(String(255), nullable=False)  # e.g., "My GitHub Stars", "org-name"
    source_config = Column(JSON, default={})  # API tokens, org names, file paths, etc.
    is_active = Column(Boolean, default=True)
    last_import_at = Column(DateTime(timezone=True), nullable=True)
    import_count = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ImportSource {self.source_name} ({self.source_type})>"


class ImportJob(Base):
    """Track import job status and progress"""
    __tablename__ = "import_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    source_id = Column(Integer, ForeignKey('import_sources.id', ondelete='SET NULL'), nullable=True)
    source_type = Column(String(50), nullable=False, index=True)
    status = Column(String(50), default='pending', index=True)  # pending, running, completed, failed
    total_repositories = Column(Integer, default=0)
    imported_repositories = Column(Integer, default=0)
    failed_repositories = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ImportJob {self.id} ({self.source_type}) - {self.status}>"


class ImportedRepository(Base):
    """Track individual repositories imported from sources"""
    __tablename__ = "imported_repositories"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(Integer, ForeignKey('repositories.id', ondelete='CASCADE'), nullable=True)
    job_id = Column(Integer, ForeignKey('import_jobs.id', ondelete='CASCADE'), index=True)
    source_type = Column(String(50), nullable=False)
    source_url = Column(String(512), nullable=False)
    import_status = Column(String(50), default='success')  # success, failed, skipped
    error_message = Column(Text, nullable=True)
    imported_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ImportedRepository {self.source_url} - {self.import_status}>"


class Collection(Base):
    """Repository collection (custom or smart)"""
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    
    name = Column(String(255), nullable=False)
    description = Column(String(2048), nullable=True)
    slug = Column(String(255), nullable=False, index=True)
    
    # Collection type: custom (manually added repos) or smart (dynamic filter)
    is_smart = Column(Boolean, default=False, index=True)
    
    # Smart collection filter config (JSON for language, stars, category, etc)
    filter_config = Column(JSON, nullable=True)
    
    # Collection visibility
    is_public = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False)  # Shareable templates
    
    # Auto-populate settings for smart collections
    auto_populate = Column(Boolean, default=False)
    
    repositories = relationship(
        "Repository",
        secondary=collection_repositories,
        backref="collections",
        cascade="all, delete"
    )
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        ctype = "Smart" if self.is_smart else "Custom"
        return f"<Collection {self.name} ({ctype})>"


class DeploymentStatus(str, enum.Enum):
    """Deployment status values"""
    PENDING = "pending"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class Deployment(Base):
    """Docker deployment model for repositories"""
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(Integer, ForeignKey('repositories.id', ondelete='CASCADE'), nullable=False, index=True)
    repo_name = Column(String(255), nullable=False)
    
    # Stack detection
    stack = Column(String(50), nullable=False)  # node, python, php, go, ruby, etc
    confidence_score = Column(Integer, default=0)  # 0-100
    
    # Port and networking
    assigned_port = Column(Integer, unique=True, nullable=False, index=True)
    domain = Column(String(255), nullable=True)
    
    # Docker configuration
    docker_path = Column(String(512), nullable=True)  # Path to Dockerfile in repo
    dockerfile_content = Column(Text, nullable=True)  # Generated or existing Dockerfile
    compose_content = Column(Text, nullable=True)  # Generated docker-compose.yml
    
    # Deployment tracking
    status = Column(String(20), default=DeploymentStatus.PENDING, index=True)  # pending, running, stopped, error
    container_id = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    log_tail = Column(Text, nullable=True)  # Last 100 lines of container logs
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    stopped_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Deployment {self.repo_name}:{self.assigned_port} ({self.status})>"
