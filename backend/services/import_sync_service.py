"""Post-import metadata and health check service"""

import asyncio
import traceback
from datetime import datetime, timedelta
from typing import Optional, Callable, Tuple, List
from sqlalchemy.orm import Session
from models import Repository
from services.github_service import GitHubService, GitHubRateLimitError, GitHubAuthError
from services.readme_parser import ReadmeParser
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
    
    # Check for common rate limit indicators
    if "403" in error_str or "rate limit" in error_str or "api rate" in error_str:
        # Try to extract reset time from error message or calculate default
        # GitHub rate limit resets every hour
        # For unauthenticated requests: 60 requests/hour
        # For authenticated requests: 5000 requests/hour
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


async def sync_repository_metadata(
    repo: Repository,
    db: Session,
    github_token: Optional[str] = None,
    progress_callback: Optional[Callable] = None
) -> bool:
    """
    Sync metadata and health for a single repository.
    
    Args:
        repo: Repository to sync
        db: Database session
        github_token: GitHub API token for fetch
        progress_callback: Callback function for progress updates
    
    Returns:
        True if successful, False otherwise
    """
    try:
        # Parse owner/repo from URL
        parts = repo.url.rstrip('/').split('/')
        owner = parts[-2]
        repo_name = parts[-1]
        
        # Fetch metadata (GitHub API)
        metadata = await GitHubService.fetch_repo_metadata(repo.url)
        
        if metadata:
            # Determine category using three-level smart categorization
            category, category_source = await smart_categorize(
                repo.url,
                repo.title or repo.name or "",
                github_token=github_token,
                language=metadata.language,
                topics=metadata.topics,
                description=metadata.description,
            )

            # Update repository with metadata
            updates = {
                'stars': metadata.stars,
                'forks': metadata.forks,
                'watchers': metadata.watchers,
                'language': metadata.language,
                'languages': metadata.languages,
                'topics': metadata.topics,
                'license': metadata.license,
                'archived': metadata.archived,
                'is_fork': metadata.is_fork,
                'open_issues': metadata.open_issues,
                'default_branch': metadata.default_branch,
                'github_created_at': metadata.created_at,
                'github_updated_at': metadata.updated_at,
                'github_pushed_at': metadata.pushed_at,
                'last_metadata_sync': datetime.utcnow(),
                'health_status': 'healthy',
                'category': category,
                'category_source': category_source,
            }

            # Update description from API if better than what we have
            if metadata.description and (not repo.description or len(repo.description) < 50):
                updates['description'] = metadata.description
            
            # Try to fetch README for even richer description / category refinement
            try:
                readme_content = await ReadmeParser.fetch_readme(owner, repo_name, github_token)
                if readme_content:
                    # Only override category if README yields a more specific result
                    best_category = ReadmeParser.determine_best_category(
                        readme_content,
                        category
                    )
                    if best_category != category:
                        updates['category'] = best_category
                        updates['category_source'] = 'readme_parse'
                    
                    # Extract description if still not set
                    if not updates.get('description') and (not repo.description or len(repo.description) < 50):
                        extracted_desc = ReadmeParser.extract_description(readme_content)
                        if extracted_desc:
                            updates['description'] = extracted_desc
            except Exception as e:
                print(f"Could not parse README for {owner}/{repo_name}: {e}")
            
            update_repository(db, repo.id, updates)
            return True
        else:
            # GitHub API unavailable — fall back to stealth fetch for metadata + category
            category, category_source = await smart_categorize(
                repo.url,
                repo.title or repo.name or "",
                github_token=github_token,
            )
            # Repository might not exist on GitHub
            error_msg = f"Repository metadata not found: {repo.url}"
            print(f"[SYNC] {error_msg}")
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
    Sync metadata for multiple repositories with rate limiting.
    
    Args:
        repositories: List of repositories to sync
        db: Database session
        github_token: GitHub API token
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
        
        # Check if GitHub token is set
        if not github_token:
            print("[SYNC] WARNING: No GitHub token set! Using unauthenticated requests (60/hour limit)")
        
        # Validate all repository URLs before syncing
        valid_count, invalid_count = validate_repositories_urls(repositories)
        print(f"[SYNC] URL validation: {valid_count} valid, {invalid_count} invalid URLs")
        
        if invalid_count > 0:
            print(f"[SYNC] WARNING: Found {invalid_count} repositories with invalid GitHub URLs - these will be skipped")
        
        print(f"[SYNC] Starting metadata sync for {len(repositories)} repositories")
        
        for i, repo in enumerate(repositories):
            # Check if user requested stop
            if sync_progress.should_stop:
                print(f"[SYNC] Stop requested, halting sync at {i+1}/{len(repositories)}")
                break
            
            # Wait if manually paused
            while sync_progress.manual_paused:
                await asyncio.sleep(0.5)
            
            # Check for excessive errors (>80% failure rate) - indicates misconfiguration
            if i > 5:  # After at least 5 attempts
                error_rate = sync_progress.error_count / (i + 1)
                if error_rate > 0.85:
                    error_msg = f"Error rate too high ({int(error_rate*100)}% failures). Stopping sync. Check GitHub token and repository URLs."
                    print(f"[SYNC] {error_msg}")
                    sync_progress.sync_error = error_msg
                    sync_progress.status = "stopped"
                    sync_progress.pause_reason = error_msg
                    break
            
            try:
                sync_progress.current = i + 1
                sync_progress.current_repo = f"{repo.name} ({i+1}/{len(repositories)})"
                
                # Skip invalid URLs
                parsed = GitHubService.parse_github_url(repo.url)
                if not parsed:
                    print(f"[SYNC] Skipping {i+1}/{len(repositories)}: invalid URL {repo.url}")
                    sync_progress.error_count += 1
                    continue
                
                print(f"[SYNC] Processing {i+1}/{len(repositories)}: {repo.name}")
                
                success = await sync_repository_metadata(repo, db, github_token)
                
                if success:
                    sync_progress.updated_count += 1
                else:
                    sync_progress.error_count += 1
                
                # Rate limiting: pause between batches
                if (i + 1) % batch_size == 0 and (i + 1) < len(repositories):
                    print(f"[SYNC] Batch {(i+1)//batch_size} complete, waiting {delay_between_batches}s")
                    await asyncio.sleep(delay_between_batches)
                    
            except GitHubRateLimitError as e:
                # Rate limit hit - pause without auto-resume
                message = "GitHub API rate limit reached (60 requests/hour for unauthenticated access). Please add a GITHUB_TOKEN environment variable and resume."
                print(f"[SYNC] {message}")
                
                sync_progress.is_paused = True
                sync_progress.pause_reason = message
                sync_progress.status = "paused"
                
                # Don't auto-resume - let user manually add token and resume
                print(f"[SYNC] Pausing sync - user must add GitHub token and manually resume")
                break
                    
            except GitHubAuthError as e:
                # Authentication error
                message = "GitHub API authentication failed. Invalid or revoked token."
                print(f"[SYNC] {message}")
                sync_progress.error_count += 1
                sync_progress.sync_error = message
                continue
                
            except Exception as e:
                error_str = str(e)
                is_rate_limit, reset_time = is_rate_limit_error(e)
                
                if is_rate_limit and reset_time:
                    # Pause due to rate limiting
                    sync_progress.is_paused = True
                    sync_progress.pause_reason = "GitHub API rate limit reached. Waiting for limit reset."
                    sync_progress.resume_at = reset_time
                    sync_progress.status = "paused"
                    
                    wait_seconds = int(reset_time - datetime.utcnow().timestamp())
                    print(f"[SYNC] Rate limit hit! Pausing for {wait_seconds} seconds")
                    
                    # Wait for rate limit to reset
                    await asyncio.sleep(wait_seconds + 1)
                    
                    # Resume
                    sync_progress.is_paused = False
                    sync_progress.pause_reason = None
                    sync_progress.resume_at = None
                    sync_progress.status = "scanning"
                    print(f"[SYNC] Rate limit reset, resuming sync...")
                    
                    # Retry the current repo
                    try:
                        success = await sync_repository_metadata(repo, db, github_token)
                        if success:
                            sync_progress.updated_count += 1
                        else:
                            sync_progress.error_count += 1
                    except Exception as retry_error:
                        print(f"[SYNC] Error on retry {repo.name}: {retry_error}")
                        sync_progress.error_count += 1
                else:
                    print(f"[SYNC] Error processing repo {repo.name}: {error_str}")
                    sync_progress.error_count += 1
                    # Continue syncing even on errors - don't pause
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
