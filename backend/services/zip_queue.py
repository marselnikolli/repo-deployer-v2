"""
Background ZIP archiving queue.

Tracks the per-repo ZIP status (pending / in_progress / done / failed) and runs
the actual download in a job-queue fashion so it never blocks the main thread.

Usage:
    from services.zip_queue import zip_queue
    zip_queue.enqueue(repo_id, repo_url, zip_path)
    # Status exposed via zip_queue.get_status(repo_id) -> dict
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)

_STATUS_PENDING = "pending"
_STATUS_IN_PROGRESS = "in_progress"
_STATUS_DONE = "done"
_STATUS_FAILED = "failed"


class ZipJob:
    __slots__ = ("repo_id", "repo_url", "zip_path", "status", "queued_at", "started_at", "finished_at", "error")

    def __init__(self, repo_id: int, repo_url: str, zip_path: str):
        self.repo_id = repo_id
        self.repo_url = repo_url
        self.zip_path = zip_path
        self.status = _STATUS_PENDING
        self.queued_at = datetime.utcnow()
        self.started_at: Optional[datetime] = None
        self.finished_at: Optional[datetime] = None
        self.error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "repo_id": self.repo_id,
            "status": self.status,
            "queued_at": self.queued_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error": self.error,
        }


class ZipQueue:
    """Async queue that processes ZIP download jobs one at a time in the background."""

    def __init__(self):
        self._jobs: Dict[int, ZipJob] = {}   # keyed by repo_id
        self._queue: asyncio.Queue = None     # initialised lazily (needs running event loop)
        self._worker_task: Optional[asyncio.Task] = None
        self._db_session_factory = None

    # ── Public API ─────────────────────────────────────────────────────────────

    def set_db_factory(self, factory):
        self._db_session_factory = factory

    def enqueue(self, repo_id: int, repo_url: str, zip_path: str) -> bool:
        """
        Add a ZIP job to the queue.
        Returns False if the repo is already queued / in-progress / done.
        """
        existing = self._jobs.get(repo_id)
        if existing and existing.status in (_STATUS_PENDING, _STATUS_IN_PROGRESS, _STATUS_DONE):
            return False

        job = ZipJob(repo_id, repo_url, zip_path)
        self._jobs[repo_id] = job
        self._ensure_queue().put_nowait(job)
        logger.info(f"[ZIP] Enqueued repo {repo_id} ({repo_url})")
        return True

    def get_status(self, repo_id: int) -> Optional[dict]:
        job = self._jobs.get(repo_id)
        return job.to_dict() if job else None

    def get_all_statuses(self) -> Dict[int, dict]:
        return {rid: job.to_dict() for rid, job in self._jobs.items()}

    def start(self):
        """Start the background worker coroutine (call from FastAPI lifespan)."""
        loop = asyncio.get_event_loop()
        self._worker_task = loop.create_task(self._worker())
        logger.info("[ZIP] Worker started")

    def stop(self):
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            logger.info("[ZIP] Worker stopped")

    # ── Internal ───────────────────────────────────────────────────────────────

    def _ensure_queue(self) -> asyncio.Queue:
        if self._queue is None:
            self._queue = asyncio.Queue()
        return self._queue

    async def _worker(self):
        q = self._ensure_queue()
        while True:
            try:
                job: ZipJob = await q.get()
                await self._process(job)
                q.task_done()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.exception(f"[ZIP] Unexpected worker error: {exc}")

    async def _process(self, job: ZipJob):
        job.status = _STATUS_IN_PROGRESS
        job.started_at = datetime.utcnow()
        logger.info(f"[ZIP] Starting {job.repo_id} → {job.zip_path}")

        try:
            # Run the blocking download in a thread pool so the event loop stays free
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(
                None, _download_zip, job.repo_url, job.zip_path
            )
            if success:
                job.status = _STATUS_DONE
                logger.info(f"[ZIP] Done {job.repo_id}")
            else:
                job.status = _STATUS_FAILED
                job.error = "Download returned False"
                logger.warning(f"[ZIP] Failed {job.repo_id}: download returned False")
        except Exception as exc:
            job.status = _STATUS_FAILED
            job.error = str(exc)
            logger.error(f"[ZIP] Failed {job.repo_id}: {exc}")
        finally:
            job.finished_at = datetime.utcnow()

        # Persist zip_status + zip_path to DB
        if self._db_session_factory:
            try:
                db = self._db_session_factory()
                try:
                    from crud.repository import update_repository
                    update_repository(db, job.repo_id, {
                        "zip_status": job.status,
                        "zip_path": job.zip_path if job.status == _STATUS_DONE else None,
                    })
                finally:
                    db.close()
            except Exception as exc:
                logger.error(f"[ZIP] Could not persist status for repo {job.repo_id}: {exc}")


def _download_zip(repo_url: str, zip_path: str) -> bool:
    """Synchronous wrapper — runs in a thread-pool executor."""
    from services.git_service import download_repo_as_zip
    return download_repo_as_zip(repo_url, zip_path)


# Singleton — import and use this everywhere
zip_queue = ZipQueue()
