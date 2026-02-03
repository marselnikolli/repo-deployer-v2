"""Git operations"""

from git import Repo, GitCommandError
from pathlib import Path
import os


def clone_repo(url: str, path: str) -> bool:
    """Clone repository"""
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Repo.clone_from(url, path)
        return True
    except GitCommandError as e:
        print(f"Error cloning {url}: {e}")
        return False


def sync_repo(path: str, url: str) -> bool:
    """Update existing repository"""
    try:
        if not os.path.exists(path):
            return clone_repo(url, path)
        
        repo = Repo(path)
        repo.remotes.origin.pull()
        return True
    except GitCommandError as e:
        print(f"Error syncing {path}: {e}")
        return False


def get_repo_info(path: str) -> dict:
    """Get repository information"""
    try:
        if not os.path.exists(path):
            return {"error": "Repository not found"}
        
        repo = Repo(path)
        return {
            "url": repo.remotes.origin.url,
            "branch": repo.active_branch.name,
            "last_commit": repo.head.commit.hexsha[:7],
            "commit_message": repo.head.commit.message,
            "commit_count": sum(1 for _ in repo.iter_commits()),
            "size": sum(
                os.path.getsize(os.path.join(path, f))
                for path, _, files in os.walk(path)
                for f in files
            )
        }
    except Exception as e:
        print(f"Error getting repo info: {e}")
        return {"error": str(e)}
