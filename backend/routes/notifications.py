"""Notification API routes"""

from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from services.notifications import NotificationService
from models import NotificationType, NotificationChannel
from database import SessionLocal

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class NotificationResponse(BaseModel):
    """Response model for notifications"""
    id: int
    title: str
    content: str
    type: str
    channel: str
    read: bool
    sent: bool
    delivery_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationRequest(BaseModel):
    """Request model for creating notifications"""
    title: str
    content: str
    type: str = NotificationType.INFO
    channels: List[str] = None


class NotificationStatsResponse(BaseModel):
    """Response model for notification stats"""
    total: int
    unread: int
    by_type: dict
    by_channel: dict
    by_delivery_status: dict


@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    user_id: int = Query(...),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get notifications for current user"""
    service = NotificationService(db)
    notifications = service.get_user_notifications(
        user_id=user_id,
        unread_only=unread_only,
        limit=limit,
        offset=offset
    )
    return notifications


@router.get("/stats", response_model=NotificationStatsResponse)
async def get_notification_stats(
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Get notification statistics"""
    service = NotificationService(db)
    stats = service.get_notification_stats(user_id)
    return stats


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Get a specific notification"""
    service = NotificationService(db)
    notification = service.get_notification(notification_id, user_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Mark a notification as read"""
    service = NotificationService(db)
    notification = service.mark_as_read(notification_id, user_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success", "message": "Notification marked as read"}


@router.post("/read-all")
async def mark_all_as_read(
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Mark all unread notifications as read"""
    service = NotificationService(db)
    count = service.mark_all_as_read(user_id)
    return {"status": "success", "message": f"Marked {count} notifications as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Delete a notification"""
    service = NotificationService(db)
    success = service.delete_notification(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success", "message": "Notification deleted"}


@router.post("/clear")
async def clear_notifications(
    user_id: int = Query(...),
    days: int = Query(30, ge=1),
    db: Session = Depends(get_db)
):
    """Clear old read notifications"""
    service = NotificationService(db)
    count = service.clear_notifications(user_id, days)
    return {"status": "success", "message": f"Cleared {count} old notifications"}
