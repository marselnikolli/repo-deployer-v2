"""Post-import metadata and health check service"""

import asyncio
import traceback
from datetime import datetime, timedelta
from typing import Optional, Callable, Tuple, List
from sqlalchemy.orm import Session
from models import Repository
from services.github_service import GitHubService
from services.bookmark_parser import smart_categorize
from crud.repository import update_repository
import os
import time


def is_rate_limit_error(exception: Exception) -> Tuple[bool, Optional[int]]:
    """
    Detect if an error is due to GitHub API rate limiting.
    Returns (is_rate_limit, reset_timestamp)
    """
    error_str = str(exception).lower()
    
    if "403" in error_str or "rate limit" in error_str or "api rate" in error_str:
        reset_timestamp = datetime.utcnow() + timedelta(hours=1)
        return True, reset_timestamp.timestamp()
    
    return False, None


def validate_repositories_urls(repositories: List[Repository]) -> Tuple[int, int]:
    """
    Validate that all repositories have valid GitHub URLs.
    Returns (valid_count, invalid_count)
    """
    valid_count = 0
    invalid_count = 0
    
    for repo in repositories:
        parsed = GitHubService.parse_github_url(repo.url)
        if parsed:
            valid_count += 1
        else:
            invalid_count += 1
            print(f"[SYNC] Invalid GitHub URL: {repo.url} (repo: {repo.name})")
    
    return valid_count, invalid_count


class SyncProgress:
    """Track sync progress for real-time updates"""
    
    def __init__(self):
        self.current = 0
        self.total = 0
        self.current_repo = None
        self.start_time = None
        self.status = "idle"  # idle, scanning, completed, failed, paused, stopped
        self.error_count = 0
        self.updated_count = 0
        self.is_paused = False
        self.pause_reason = None
        self.resume_at = None  # Unix timestamp when to resume
        self.manual_paused = False  # User manually paused
        self.should_stop = False  # User requested stop
        self.sync_error = None  # Error message if sync failed
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        elapsed = 0
        remaining = 0
        resume_in = 0
        
        if self.start_time:
            elapsed = (datetime.utcnow() - self.start_time).total_seconds()
            if self.current > 0 and self.current < self.total:
                avg_per_item = elapsed / self.current
                remaining = avg_per_item * (self.total - self.current)
            elif self.current >= self.total:
                remaining = 0
        
        # Calculate resume countdown
        if self.resume_at:
            resume_in = max(0, self.resume_at - datetime.utcnow().timestamp())
        
        return {
            "status": self.status,
            "current": self.current,
            "total": self.total,
            "percentage": int((self.current / self.total * 100) if self.total > 0 else 0),
            "current_repo": self.current_repo,
            "elapsed_seconds": int(elapsed),
            "remaining_seconds": int(max(0, remaining)),
            "success_count": self.updated_count,
            "error_count": self.error_count,
            "is_paused": self.is_paused or self.manual_paused,
            "pause_reason": self.pause_reason or ("Paused by user" if self.manual_paused else None),
            "resume_in_seconds": int(resume_in),
            "sync_error": self.sync_error,
        }


# Global progress tracker
sync_progress = SyncProgress()


def pause_sync():
    """Manually pause the sync process"""
    global sync_progress
    sync_progress.manual_paused = True
    sync_progress.pause_reason = "Paused by user"
    sync_progress.status = "paused"
    print("[SYNC] Manual pause requested")


def resume_sync():
    """Manually resume the sync process"""
    global sync_progress
    sync_progress.manual_paused = False
    sync_progress.pause_reason = None
    sync_progress.status = "scanning"
    print("[SYNC] Manual resume requested")


def stop_sync():
    """Stop the sync process"""
    global sync_progress
    sync_progress.should_stop = True
    sync_progress.status = "stopped"
    print("[SYNC] Stop requested")


async def _download_readme_to_disk(owner: str, repo_name: str) -> bool:
    """
    Fetch README.md from raw.githubusercontent.com and save it to
    {REPOS_DIR}/{owner}/{repo_name}/README.md.
    Returns True if the file was written, False otherwise.
    """
    import httpx
    from pathlib import Path

    repos_dir = os.getenv("REPOS_DIR", "/app/repos")
    dest_dir = Path(repos_dir) / owner / repo_name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / "README.md"

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/plain,*/*;q=0.9",
    }

    for branch in ("HEAD", "main", "master"):
        url = f"https://raw.githubusercontent.com/{owner}/{repo_name}/{branch}/README.md"
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                dest_file.write_text(resp.text, encoding="utf-8")
                return True
        except Exception:
            continue

    return False


async def sync_repository_metadata(
    repo: Repository,
    db: Session,
    github_token: Optional[str] = None,
    progress_callback: Optional[Callable] = None
) -> bool:
    """
    Sync metadata and health for a single repository using stealth HTML fetching.
    No GitHub API calls are made — we parse the public GitHub page HTML instead.
    
    Args:
        repo: Repository to sync
        db: Database session
        github_token: Unused (kept for API compatibility)
        progress_callback: Callback function for progress updates
    
    Returns:
        True if successful, False otherwise
    """
    try:
        from services.bookmark_parser import _stealth_fetch_github_meta, _score_text_for_category
        
        parsed = GitHubService.parse_github_url(repo.url)
        if not parsed:
            update_repository(
                db,
                repo.id,
                {'health_status': 'unknown', 'last_health_check': datetime.utcnow()}
            )
            return False
        
        owner, repo_name = parsed
        
        meta = await _stealth_fetch_github_meta(owner, repo_name)
        
        if meta:
            text_for_category = " ".join(filter(None, [
                meta.get("topics", ""),
                meta.get("language", ""),
                meta.get("description", ""),
                repo.title or repo.name or "",
            ]))
            category, category_source = _score_text_for_category(text_for_category)
            if category_source == 0:
                category, category_source = "other", "stealth_fetch"

            updates = {
                'language': meta.get("language"),
                'topics': meta.get("topics", "").split() if meta.get("topics") else [],
                'last_metadata_sync': datetime.utcnow(),
                'health_status': 'healthy',
                'category': category,
                'category_source': category_source,
            }

            if meta.get("description") and (not repo.description or len(repo.description) < 50):
                updates['description'] = meta["description"]
            
            update_repository(db, repo.id, updates)
            return True
        else:
            category, category_source = await smart_categorize(
                repo.url,
                repo.title or repo.name or "",
                github_token=None,
            )
            update_repository(
                db,
                repo.id,
                {
                    'health_status': 'not_found',
                    'last_health_check': datetime.utcnow(),
                    'category': category,
                    'category_source': category_source,
                }
            )
            return False
            
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"[SYNC] Error syncing metadata for {repo.url}: {error_msg}")
        print(f"[SYNC] Traceback: {error_trace}")
        update_repository(
            db,
            repo.id,
            {
                'health_status': 'unknown',
                'last_health_check': datetime.utcnow()
            }
        )
        return False


async def sync_repositories_metadata(
    repositories: list,
    db: Session,
    github_token: Optional[str] = None,
    batch_size: int = 10,
    delay_between_batches: float = 2.0
) -> dict:
    """
    Sync metadata for multiple repositories using stealth HTML fetching.
    Uses longer delays between requests to avoid GitHub rate limiting.
    
    Args:
        repositories: List of repositories to sync
        db: Database session
        github_token: Unused (kept for API compatibility)
        batch_size: Number of repos to sync before delay
        delay_between_batches: Seconds to wait between batches
    
    Returns:
        Dict with sync statistics
    """
    global sync_progress
    
    try:
        sync_progress.total = len(repositories)
        sync_progress.current = 0
        sync_progress.status = "scanning"
        sync_progress.start_time = datetime.utcnow()
        sync_progress.updated_count = 0
        sync_progress.error_count = 0
        sync_progress.is_paused = False
        sync_progress.pause_reason = None
        sync_progress.resume_at = None
        
        print(f"[SYNC] Starting stealth metadata sync for {len(repositories)} repositories")
        print(f"[SYNC] Using stealth HTML fetching (no GitHub API calls)")
        
        for i, repo in enumerate(repositories):
            if sync_progress.should_stop:
                print(f"[SYNC] Stop requested, halting sync at {i+1}/{len(repositories)}")
                break
            
            while sync_progress.manual_paused:
                await asyncio.sleep(0.5)
            
            if i > 5:
                error_rate = sync_progress.error_count / (i + 1)
                if error_rate > 0.85:
                    error_msg = f"Error rate too high ({int(error_rate*100)}% failures). Stopping sync. Check repository URLs."
                    print(f"[SYNC] {error_msg}")
                    sync_progress.sync_error = error_msg
                    sync_progress.status = "stopped"
                    sync_progress.pause_reason = error_msg
                    break
            
            try:
                sync_progress.current = i + 1
                sync_progress.current_repo = f"{repo.name} ({i+1}/{len(repositories)})"
                
                parsed = GitHubService.parse_github_url(repo.url)
                if not parsed:
                    print(f"[SYNC] Skipping {i+1}/{len(repositories)}: invalid URL {repo.url}")
                    sync_progress.error_count += 1
                    continue
                
                print(f"[SYNC] Processing {i+1}/{len(repositories)}: {repo.name}")
                
                success = await sync_repository_metadata(repo, db, github_token)

                if success:
                    sync_progress.updated_count += 1
                    parsed = GitHubService.parse_github_url(repo.url)
                    if parsed:
                        await _download_readme_to_disk(parsed[0], parsed[1])
                else:
                    sync_progress.error_count += 1
                
                if (i + 1) % batch_size == 0 and (i + 1) < len(repositories):
                    print(f"[SYNC] Batch {(i+1)//batch_size} complete, waiting {delay_between_batches}s")
                    await asyncio.sleep(delay_between_batches)
                    
            except Exception as e:
                print(f"[SYNC] Error processing repo {repo.name}: {e}")
                sync_progress.error_count += 1
                continue
        
        sync_progress.status = "completed"
        sync_progress.is_paused = False
        print(f"[SYNC] Sync complete: {sync_progress.updated_count} successful, {sync_progress.error_count} failed")
        
        return {
            "total": len(repositories),
            "successful": sync_progress.updated_count,
            "failed": sync_progress.error_count,
            "elapsed_seconds": int((datetime.utcnow() - sync_progress.start_time).total_seconds())
        }
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"[SYNC] Fatal error during sync: {error_msg}")
        print(f"[SYNC] Traceback: {error_trace}")
        sync_progress.status = "failed"
        sync_progress.is_paused = False
        sync_progress.sync_error = f"Sync failed: {error_msg}"
        return {"error": error_msg}


def get_sync_progress() -> dict:
    """Get current sync progress"""
    return sync_progress.to_dict()


def reset_sync_progress():
    """Reset sync progress tracker"""
    global sync_progress
    sync_progress = SyncProgress()
