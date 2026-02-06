"""Clone queue service for batch repository cloning"""

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Callable
from enum import Enum
import threading
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
import os
import logging
import sys

# Configure logging to output to stdout
logger = logging.getLogger(__name__)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


class CloneStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class CloneJob:
    """Represents a single clone job"""
    id: int
    repository_id: int
    repository_name: str
    repository_url: str
    target_path: str
    status: CloneStatus = CloneStatus.PENDING
    progress: int = 0
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.utcnow)


class CloneQueueService:
    """Service for managing batch clone operations"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.jobs: Dict[int, CloneJob] = {}
        self.queue: Queue = Queue()
        self.job_counter = 0
        self.max_concurrent = 3
        self.active_jobs = 0
        self._active_lock = threading.Lock()
        self.is_running = False
        self.worker_thread: Optional[threading.Thread] = None
        self.executor: Optional[ThreadPoolExecutor] = None
        self.on_job_update: Optional[Callable[[CloneJob], None]] = None
        self.db_session_factory: Optional[Callable] = None
        self._initialized = True

    def start(self):
        """Start the clone queue worker"""
        if self.is_running:
            logger.info("Clone queue already running")
            return

        self.is_running = True
        self.executor = ThreadPoolExecutor(max_workers=self.max_concurrent)
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=False)
        self.worker_thread.start()
        logger.info(f"Clone queue worker thread started (ID: {self.worker_thread.ident})")

    def stop(self):
        """Stop the clone queue worker"""
        self.is_running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=5)
        if self.executor:
            self.executor.shutdown(wait=False)

    def add_job(self, repository_id: int, name: str, url: str, target_path: str) -> CloneJob:
        """Add a new clone job to the queue"""
        self.job_counter += 1
        job = CloneJob(
            id=self.job_counter,
            repository_id=repository_id,
            repository_name=name,
            repository_url=url,
            target_path=target_path
        )
        self.jobs[job.id] = job
        self.queue.put(job.id)
        return job

    def add_jobs(self, repositories: List[Dict]) -> List[CloneJob]:
        """Add multiple clone jobs to the queue"""
        jobs = []
        for repo in repositories:
            job = self.add_job(
                repository_id=repo['id'],
                name=repo['name'],
                url=repo['url'],
                target_path=repo.get('path', f"./repos/{repo['name']}")
            )
            jobs.append(job)
        return jobs

    def get_job(self, job_id: int) -> Optional[CloneJob]:
        """Get a specific job by ID"""
        return self.jobs.get(job_id)

    def get_all_jobs(self) -> List[CloneJob]:
        """Get all jobs"""
        return list(self.jobs.values())

    def get_queue_status(self) -> Dict:
        """Get overall queue status"""
        jobs = self.get_all_jobs()
        return {
            "total": len(jobs),
            "pending": len([j for j in jobs if j.status == CloneStatus.PENDING]),
            "in_progress": len([j for j in jobs if j.status == CloneStatus.IN_PROGRESS]),
            "completed": len([j for j in jobs if j.status == CloneStatus.COMPLETED]),
            "failed": len([j for j in jobs if j.status == CloneStatus.FAILED]),
            "is_running": self.is_running,
            "active_jobs": self.active_jobs
        }

    def cancel_job(self, job_id: int) -> bool:
        """Cancel a pending job"""
        job = self.jobs.get(job_id)
        if job and job.status == CloneStatus.PENDING:
            job.status = CloneStatus.CANCELLED
            return True
        return False

    def clear_completed(self):
        """Clear completed and failed jobs from the list"""
        to_remove = [
            job_id for job_id, job in self.jobs.items()
            if job.status in [CloneStatus.COMPLETED, CloneStatus.FAILED, CloneStatus.CANCELLED]
        ]
        for job_id in to_remove:
            del self.jobs[job_id]

    def _update_repository_cloned_status(self, repository_id: int, path: str):
        """Update repository cloned status in database"""
        if not self.db_session_factory:
            logger.warning(f"No db_session_factory set, cannot update repository {repository_id}")
            return

        try:
            from models import Repository
            db = self.db_session_factory()
            try:
                repo = db.query(Repository).filter(Repository.id == repository_id).first()
                if repo:
                    repo.cloned = True
                    repo.path = path
                    repo.last_synced = datetime.utcnow()
                    db.commit()
                    logger.info(f"Updated repository {repository_id} cloned status to True")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error updating repository cloned status: {e}", exc_info=True)

    def _process_job(self, job: CloneJob):
        """Process a single clone job in a thread pool worker"""
        from services.git_service import clone_repo

        try:
            # Ensure target directory exists
            target_dir = os.path.dirname(job.target_path)
            os.makedirs(target_dir, exist_ok=True)

            # Clone the repository with timeout
            logger.info(f"Cloning to {job.target_path}")
            success = clone_repo(job.repository_url, job.target_path)

            if success:
                job.status = CloneStatus.COMPLETED
                job.progress = 100
                logger.info(f"Clone completed for job {job.id}: {job.repository_name}")
                self._update_repository_cloned_status(job.repository_id, job.target_path)
            else:
                job.status = CloneStatus.FAILED
                job.error_message = "Clone operation failed"
                logger.error(f"Clone failed for job {job.id}: {job.repository_name}")

        except Exception as e:
            job.status = CloneStatus.FAILED
            job.error_message = str(e)
            logger.error(f"Clone error for job {job.id}: {e}", exc_info=True)

        finally:
            job.completed_at = datetime.utcnow()
            with self._active_lock:
                self.active_jobs -= 1
            if self.on_job_update:
                self.on_job_update(job)

    def _worker_loop(self):
        """Main worker loop that dispatches clone jobs to thread pool"""
        logger.info("Clone queue worker loop started")

        while self.is_running:
            try:
                # Check if we can process more jobs
                with self._active_lock:
                    if self.active_jobs >= self.max_concurrent:
                        time.sleep(0.5)
                        continue

                # Get next job from queue (non-blocking)
                try:
                    job_id = self.queue.get(timeout=1)
                except Exception:
                    continue

                job = self.jobs.get(job_id)
                if not job or job.status == CloneStatus.CANCELLED:
                    continue

                # Mark job as in-progress and dispatch to thread pool
                with self._active_lock:
                    self.active_jobs += 1
                job.status = CloneStatus.IN_PROGRESS
                job.started_at = datetime.utcnow()
                logger.info(f"Dispatching clone job {job.id}: {job.repository_name}")

                if self.on_job_update:
                    self.on_job_update(job)

                # Submit to thread pool — does NOT block the loop
                self.executor.submit(self._process_job, job)

            except Exception as e:
                logger.error(f"Clone queue worker error: {e}", exc_info=True)
                with self._active_lock:
                    self.active_jobs = max(0, self.active_jobs - 1)
                continue


# Singleton instance
clone_queue = CloneQueueService()
