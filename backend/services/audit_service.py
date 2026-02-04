"""Audit logging service for tracking operations"""

import json
from datetime import datetime
from sqlalchemy.orm import Session
from models import AuditLog


class AuditService:
    """Service for recording audit logs"""

    @staticmethod
    def log_operation(
        db: Session,
        operation: str,
        resource_type: str,
        status: str,
        details: dict = None,
        resource_id: int = None,
        error_message: str = None,
        ip_address: str = None,
        user_agent: str = None,
    ) -> AuditLog:
        """
        Log an operation to the audit trail
        
        Args:
            db: Database session
            operation: Type of operation (import, delete, update, etc.)
            resource_type: Type of resource being operated on (repository, category, etc.)
            status: Operation status (success, failure)
            details: Dictionary with operation details
            resource_id: ID of the resource being operated on
            error_message: Error message if operation failed
            ip_address: IP address of the request
            user_agent: User agent string of the request
        """
        log = AuditLog(
            operation=operation,
            resource_type=resource_type,
            status=status,
            details=json.dumps(details or {}),
            resource_id=resource_id,
            error_message=error_message,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def get_audit_logs(
        db: Session,
        operation: str = None,
        resource_type: str = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        """Get audit logs with optional filtering"""
        query = db.query(AuditLog)
        
        if operation:
            query = query.filter(AuditLog.operation == operation)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        
        return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
