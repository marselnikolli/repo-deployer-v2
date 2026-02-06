"""Scheduler API endpoints"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import SessionLocal
from services.scheduler import SchedulerService, ScheduleConfig, TaskStatus
from models import ScheduledTask


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.post("/tasks", response_model=TaskStatus)
def create_task(config: ScheduleConfig, db: Session = Depends(get_db)):
    """Create a new scheduled task"""
    try:
        task = SchedulerService.create_task(db, config)
        return TaskStatus(
            id=task.id,
            name=task.name,
            task_type=task.task_type,
            enabled=task.enabled,
            last_run=task.last_run,
            next_run=task.next_run,
            last_run_status=task.last_run_status,
            last_run_message=task.last_run_message
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/tasks", response_model=List[TaskStatus])
def list_tasks(enabled_only: bool = False, db: Session = Depends(get_db)):
    """List all scheduled tasks"""
    try:
        tasks = SchedulerService.list_tasks(db, enabled_only=enabled_only)
        return [
            TaskStatus(
                id=t.id,
                name=t.name,
                task_type=t.task_type,
                enabled=t.enabled,
                last_run=t.last_run,
                next_run=t.next_run,
                last_run_status=t.last_run_status,
                last_run_message=t.last_run_message
            )
            for t in tasks
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/tasks/{task_id}", response_model=TaskStatus)
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Get a specific task"""
    try:
        task = SchedulerService.get_task(db, task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        return TaskStatus(
            id=task.id,
            name=task.name,
            task_type=task.task_type,
            enabled=task.enabled,
            last_run=task.last_run,
            next_run=task.next_run,
            last_run_status=task.last_run_status,
            last_run_message=task.last_run_message
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/tasks/{task_id}", response_model=TaskStatus)
def update_task(task_id: int, config: ScheduleConfig, db: Session = Depends(get_db)):
    """Update a scheduled task"""
    try:
        task = SchedulerService.update_task(db, task_id, config)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        return TaskStatus(
            id=task.id,
            name=task.name,
            task_type=task.task_type,
            enabled=task.enabled,
            last_run=task.last_run,
            next_run=task.next_run,
            last_run_status=task.last_run_status,
            last_run_message=task.last_run_message
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Delete a scheduled task"""
    try:
        success = SchedulerService.delete_task(db, task_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        return {"status": "success", "message": f"Task {task_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/tasks/{task_id}/toggle")
def toggle_task(task_id: int, db: Session = Depends(get_db)):
    """Enable/disable a task"""
    try:
        task = SchedulerService.toggle_task(db, task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        return {
            "status": "success",
            "message": f"Task {task_id} is now {'enabled' if task.enabled else 'disabled'}",
            "enabled": task.enabled
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/tasks/{task_id}/run")
def run_task(task_id: int, db: Session = Depends(get_db)):
    """Manually execute a task"""
    try:
        result = SchedulerService.execute_task(db, task_id)
        if result.get("status") == "error":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("message", "Task execution failed")
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/stats")
def get_scheduler_stats(db: Session = Depends(get_db)):
    """Get scheduler statistics"""
    try:
        stats = SchedulerService.get_task_stats(db)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
