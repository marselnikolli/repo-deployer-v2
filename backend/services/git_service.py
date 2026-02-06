"""Git operations"""

from git import Repo, GitCommandError
from pathlib import Path
import os
import subprocess
import shutil
from threading import Thread


def clone_repo(url: str, path: str, timeout_seconds: int = 300) -> bool:
    """Clone repository with timeout using subprocess (shallow clone)"""
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        
        # Check if path already exists
        if os.path.exists(path):
            print(f"Path {path} already exists, removing it first", flush=True)
            shutil.rmtree(path)
        
        try:
            print(f"Starting clone: {url} -> {path}", flush=True)
            # Use shallow clone (--depth 1) to speed up and avoid huge downloads
            result = subprocess.run(
                ['git', 'clone', '--depth', '1', '--single-branch', url, path],
                timeout=timeout_seconds,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print(f"Clone successful: {path}", flush=True)
                return True
            else:
                error_output = result.stderr or result.stdout
                print(f"Git clone failed with return code {result.returncode}: {error_output}", flush=True)
                return False
                
        except subprocess.TimeoutExpired:
            print(f"Clone timed out after {timeout_seconds}s for {url}", flush=True)
            # Kill any lingering git process and clean up
            if os.path.exists(path):
                try:
                    shutil.rmtree(path)
                except:
                    pass
            return False
        except Exception as e:
            print(f"Error cloning {url}: {type(e).__name__}: {e}", flush=True)
            return False
    except Exception as e:
        print(f"Unexpected error in clone_repo: {type(e).__name__}: {e}", flush=True)
        return False
    finally:
        # Clean up partial clone if it failed
        if os.path.exists(path):
            try:
                # Check if it's a valid git repo
                Repo(path)
            except:
                print(f"Cleaning up failed clone at {path}", flush=True)
                try:
                    shutil.rmtree(path)
                except:
                    pass


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
