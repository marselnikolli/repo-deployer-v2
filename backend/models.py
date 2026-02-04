"""SQLAlchemy database models"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum
from sqlalchemy.sql import func
from database import Base
import enum
from datetime import datetime


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
    
    # Metadata
    cloned = Column(Boolean, default=False)
    deployed = Column(Boolean, default=False)
    last_synced = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<Repository {self.name}>"


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

