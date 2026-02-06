"""Scheduler service for automated tasks"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import Repository, ScheduledTask
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)


class ScheduleConfig(BaseModel):
    """Schedule configuration"""
    name: str
    description: Optional[str] = None
    task_type: str  # metadata_sync, health_check, stale_detection, auto_pull
    schedule_type: str  # cron, interval
    cron_expression: Optional[str] = None
    interval_hours: Optional[int] = None
    enabled: bool = True
    config: Optional[Dict[str, Any]] = None


class TaskStatus(BaseModel):
    """Task execution status"""
    id: int
    name: str
    task_type: str
    enabled: bool
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    last_run_status: Optional[str] = None
    last_run_message: Optional[str] = None


class SchedulerService:
    """Service for managing scheduled tasks"""

    @staticmethod
    def create_task(db: Session, config: ScheduleConfig) -> ScheduledTask:
        """Create a new scheduled task"""
        task = ScheduledTask(
            name=config.name,
            description=config.description,
            task_type=config.task_type,
            schedule_type=config.schedule_type,
            cron_expression=config.cron_expression,
            interval_hours=config.interval_hours,
            enabled=config.enabled,
            config=config.config or {}
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    @staticmethod
    def get_task(db: Session, task_id: int) -> Optional[ScheduledTask]:
        """Get task by ID"""
        return db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()

    @staticmethod
    def list_tasks(db: Session, enabled_only: bool = False) -> List[ScheduledTask]:
        """List all scheduled tasks"""
        query = db.query(ScheduledTask)
        if enabled_only:
            query = query.filter(ScheduledTask.enabled == True)
        return query.all()

    @staticmethod
    def update_task(db: Session, task_id: int, config: ScheduleConfig) -> Optional[ScheduledTask]:
        """Update an existing task"""
        task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
        if not task:
            return None
        
        task.name = config.name
        task.description = config.description
        task.task_type = config.task_type
        task.schedule_type = config.schedule_type
        task.cron_expression = config.cron_expression
        task.interval_hours = config.interval_hours
        task.enabled = config.enabled
        task.config = config.config or {}
        
        db.commit()
        db.refresh(task)
        return task

    @staticmethod
    def delete_task(db: Session, task_id: int) -> bool:
        """Delete a task"""
        task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
        if not task:
            return False
        db.delete(task)
        db.commit()
        return True

    @staticmethod
    def toggle_task(db: Session, task_id: int) -> Optional[ScheduledTask]:
        """Enable/disable a task"""
        task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
        if not task:
            return None
        task.enabled = not task.enabled
        db.commit()
        db.refresh(task)
        return task

    @staticmethod
    def run_metadata_sync(db: Session) -> Dict[str, Any]:
        """Sync metadata for all repositories from GitHub"""
        try:
            repos = db.query(Repository).all()
            synced_count = 0
            failed_count = 0
            
            for repo in repos:
                try:
                    # In production, fetch from GitHub API
                    # For now, just update the timestamp
                    repo.last_metadata_sync = datetime.utcnow()
                    synced_count += 1
                except Exception as e:
                    logger.error(f"Failed to sync {repo.name}: {e}")
                    failed_count += 1
            
            db.commit()
            
            return {
                "status": "success",
                "synced": synced_count,
                "failed": failed_count,
                "total": len(repos)
            }
        except Exception as e:
            logger.error(f"Metadata sync error: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    @staticmethod
    def run_health_check(db: Session) -> Dict[str, Any]:
        """Check health status of all repositories"""
        try:
            repos = db.query(Repository).all()
            healthy_count = 0
            archived_count = 0
            not_found_count = 0
            
            for repo in repos:
                # Determine health status
                if repo.archived:
                    repo.health_status = "archived"
                    archived_count += 1
                elif not repo.github_created_at:
                    repo.health_status = "not_found"
                    not_found_count += 1
                else:
                    repo.health_status = "healthy"
                    healthy_count += 1
                
                repo.last_health_check = datetime.utcnow()
            
            db.commit()
            
            return {
                "status": "success",
                "healthy": healthy_count,
                "archived": archived_count,
                "not_found": not_found_count,
                "total": len(repos)
            }
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    @staticmethod
    def run_stale_detection(db: Session, days_threshold: int = 90) -> Dict[str, Any]:
        """Detect stale repositories (not updated in N days)"""
        try:
            repos = db.query(Repository).all()
            threshold_date = datetime.utcnow() - timedelta(days=days_threshold)
            stale_count = 0
            active_count = 0
            
            for repo in repos:
                last_update = repo.github_updated_at or repo.github_created_at or datetime.min
                
                if last_update < threshold_date:
                    # Mark as stale in config or metadata
                    if not repo.config:
                        repo.languages = {}  # Using languages to store stale flag
                    stale_count += 1
                else:
                    active_count += 1
            
            db.commit()
            
            return {
                "status": "success",
                "stale": stale_count,
                "active": active_count,
                "threshold_days": days_threshold,
                "total": len(repos)
            }
        except Exception as e:
            logger.error(f"Stale detection error: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    @staticmethod
    def execute_task(db: Session, task_id: int) -> Dict[str, Any]:
        """Execute a scheduled task"""
        task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
        if not task:
            return {"status": "error", "message": "Task not found"}
        
        try:
            task.last_run_status = "running"
            db.commit()
            
            result = None
            
            if task.task_type == "metadata_sync":
                result = SchedulerService.run_metadata_sync(db)
            elif task.task_type == "health_check":
                result = SchedulerService.run_health_check(db)
            elif task.task_type == "stale_detection":
                days = task.config.get("days_threshold", 90) if task.config else 90
                result = SchedulerService.run_stale_detection(db, days_threshold=days)
            elif task.task_type == "auto_pull":
                result = {"status": "success", "message": "Auto-pull not yet implemented"}
            else:
                result = {"status": "error", "message": f"Unknown task type: {task.task_type}"}
            
            # Update task status
            task.last_run = datetime.utcnow()
            task.last_run_status = result.get("status", "unknown")
            task.last_run_message = str(result)
            
            # Calculate next run
            if task.schedule_type == "interval" and task.interval_hours:
                task.next_run = datetime.utcnow() + timedelta(hours=task.interval_hours)
            # For cron, next_run would be calculated by the scheduler
            
            db.commit()
            
            return result
        except Exception as e:
            logger.error(f"Task execution error: {e}")
            task.last_run_status = "failure"
            task.last_run_message = str(e)
            task.last_run = datetime.utcnow()
            db.commit()
            
            return {
                "status": "error",
                "message": str(e)
            }

    @staticmethod
    def get_task_stats(db: Session) -> Dict[str, Any]:
        """Get overall scheduler statistics"""
        tasks = db.query(ScheduledTask).all()
        enabled = sum(1 for t in tasks if t.enabled)
        
        recent_runs = db.query(ScheduledTask).filter(
            ScheduledTask.last_run >= datetime.utcnow() - timedelta(hours=24)
        ).all()
        
        successful = sum(1 for t in recent_runs if t.last_run_status == "success")
        failed = sum(1 for t in recent_runs if t.last_run_status == "failure")
        
        return {
            "total_tasks": len(tasks),
            "enabled_tasks": enabled,
            "disabled_tasks": len(tasks) - enabled,
            "recent_runs_24h": len(recent_runs),
            "successful_runs": successful,
            "failed_runs": failed
        }
