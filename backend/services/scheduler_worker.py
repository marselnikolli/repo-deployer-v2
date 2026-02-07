"""Background scheduler worker for executing scheduled tasks"""

import threading
import time
import logging
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Import models and services
from models import ScheduledTask
from services.scheduler import SchedulerService


class SchedulerWorker:
    """Background worker that executes scheduled tasks"""
    
    def __init__(self, db_session_factory):
        self.db_session_factory = db_session_factory
        self.running = False
        self.thread = None
        self.poll_interval = 60  # Check every minute
        
    def start(self):
        """Start the scheduler worker in a background thread"""
        if self.running:
            logger.warning("Scheduler worker already running")
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        logger.info("Scheduler worker started")
    
    def stop(self):
        """Stop the scheduler worker"""
        if not self.running:
            return
            
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Scheduler worker stopped")
    
    def _run(self):
        """Main scheduler loop"""
        while self.running:
            try:
                self._check_and_execute_tasks()
            except Exception as e:
                logger.error(f"Error in scheduler worker: {e}", exc_info=True)
            
            # Sleep for a bit before checking again
            time.sleep(self.poll_interval)
    
    def _check_and_execute_tasks(self):
        """Check for tasks that need to be executed"""
        db = self.db_session_factory()
        try:
            # Find all enabled tasks where next_run is reached or past
            now = datetime.utcnow()
            
            tasks = db.query(ScheduledTask).filter(
                ScheduledTask.enabled == True
            ).all()
            
            for task in tasks:
                should_execute = False
                
                # Check if task should run
                if task.next_run is None:
                    # Never run before, execute now
                    should_execute = True
                elif task.next_run <= now:
                    # Time to run
                    should_execute = True
                
                if should_execute:
                    self._execute_task(db, task)
        
        except Exception as e:
            logger.error(f"Error checking tasks: {e}", exc_info=True)
        finally:
            db.close()
    
    def _execute_task(self, db, task):
        """Execute a single task and update its schedule"""
        logger.info(f"Executing scheduled task: {task.name} ({task.task_type})")
        
        try:
            # Execute the task
            result = SchedulerService.execute_task(db, task.id)
            
            # Calculate next run time
            task = db.query(ScheduledTask).filter(ScheduledTask.id == task.id).first()
            if task:
                if task.schedule_type == "interval" and task.interval_hours:
                    task.next_run = datetime.utcnow() + timedelta(hours=task.interval_hours)
                    db.commit()
                    logger.info(f"Task {task.name} scheduled next run for {task.next_run}")
                elif task.schedule_type == "cron" and task.cron_expression:
                    # TODO: Implement cron expression parsing
                    # For now, default to daily
                    task.next_run = datetime.utcnow() + timedelta(days=1)
                    db.commit()
            
            logger.info(f"Task executed: {task.name} - Status: {result.get('status')}")
        
        except Exception as e:
            logger.error(f"Error executing task {task.id}: {e}", exc_info=True)


# Global scheduler worker instance
_scheduler_worker = None


def get_scheduler_worker():
    """Get or create the global scheduler worker"""
    global _scheduler_worker
    return _scheduler_worker


def init_scheduler_worker(db_session_factory):
    """Initialize the global scheduler worker"""
    global _scheduler_worker
    _scheduler_worker = SchedulerWorker(db_session_factory)
    _scheduler_worker.start()
    return _scheduler_worker


def shutdown_scheduler_worker():
    """Shutdown the global scheduler worker"""
    global _scheduler_worker
    if _scheduler_worker:
        _scheduler_worker.stop()
