"""GitHub bookmark synchronization service"""

import os
import json
import httpx
from typing import Optional, Dict, List, Any
from datetime import datetime
from pathlib import Path
import asyncio
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session


class GitBookmarkService:
    """Service for managing GitHub bookmarks synchronization"""
    
    # GitHub API endpoints
    GITHUB_API_URL = "https://api.github.com"
    REPO_NAME = "git-bookmark"
    REPO_DESCRIPTION = "Synchronized git bookmarks database"
    BOOKMARK_FILE = "bookmarks.json"
    
    def __init__(self):
        """Initialize the GitHub bookmark service"""
        # Get encryption key from environment or generate one
        self.encryption_key = os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY", "").encode()
        if not self.encryption_key:
            # If no key provided, tokens will be stored plain (not recommended for production)
            self.cipher = None
        else:
            self.cipher = Fernet(self.encryption_key)
    
    def encrypt_token(self, token: str) -> str:
        """Encrypt a GitHub token"""
        if not self.cipher:
            return token
        return self.cipher.encrypt(token.encode()).decode()
    
    def decrypt_token(self, encrypted_token: str) -> str:
        """Decrypt a GitHub token"""
        if not self.cipher:
            return encrypted_token
        return self.cipher.decrypt(encrypted_token.encode()).decode()
    
    def get_user_bookmarks_path(self, user_id: int) -> Path:
        """Get the local path for user's bookmarks JSON file"""
        base_path = Path("/home/ozo/Desktop/repo-deployer-v2/backend/data/users")
        user_path = base_path / str(user_id)
        user_path.mkdir(parents=True, exist_ok=True)
        return user_path / "bookmarks.json"
    
    def load_local_bookmarks(self, user_id: int) -> Dict[str, Any]:
        """Load bookmarks from local JSON file"""
        path = self.get_user_bookmarks_path(user_id)
        if path.exists():
            try:
                with open(path, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {"bookmarks": []}
        return {"bookmarks": []}
    
    def save_local_bookmarks(self, user_id: int, bookmarks: Dict[str, Any]) -> bool:
        """Save bookmarks to local JSON file"""
        try:
            path = self.get_user_bookmarks_path(user_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w') as f:
                json.dump(bookmarks, f, indent=2, default=str)
            return True
        except IOError as e:
            print(f"Error saving bookmarks: {e}")
            return False
    
    async def get_github_headers(self, token: str) -> Dict[str, str]:
        """Get headers for GitHub API requests"""
        return {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "GitBookmarkSync/1.0"
        }
    
    async def create_repository(self, token: str, username: str) -> bool:
        """Create the git-bookmark repository on GitHub"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = await self.get_github_headers(token)
                
                response = await client.post(
                    f"{self.GITHUB_API_URL}/user/repos",
                    headers=headers,
                    json={
                        "name": self.REPO_NAME,
                        "description": self.REPO_DESCRIPTION,
                        "private": True,
                        "auto_init": True,
                    }
                )
                
                if response.status_code in [201, 200]:
                    return True
                elif response.status_code == 422:
                    # Repo already exists
                    return True
                else:
                    print(f"Failed to create repo: {response.status_code} - {response.text}")
                    return False
        except Exception as e:
            print(f"Error creating repository: {e}")
            return False
    
    async def get_remote_bookmarks(self, token: str, username: str) -> Optional[Dict[str, Any]]:
        """Fetch bookmarks from GitHub repository"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = await self.get_github_headers(token)
                
                response = await client.get(
                    f"{self.GITHUB_API_URL}/repos/{username}/{self.REPO_NAME}/contents/{self.BOOKMARK_FILE}",
                    headers=headers
                )
                
                if response.status_code == 200:
                    import base64
                    data = response.json()
                    content = base64.b64decode(data['content']).decode('utf-8')
                    return json.loads(content)
                elif response.status_code == 404:
                    # File doesn't exist yet
                    return None
                else:
                    print(f"Failed to fetch bookmarks: {response.status_code}")
                    return None
        except Exception as e:
            print(f"Error fetching remote bookmarks: {e}")
            return None
    
    async def push_bookmarks_to_github(
        self, 
        token: str, 
        username: str, 
        bookmarks: Dict[str, Any],
        message: str = "Update bookmarks"
    ) -> bool:
        """Push bookmarks to GitHub repository"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = await self.get_github_headers(token)
                
                import base64
                content = base64.b64encode(
                    json.dumps(bookmarks, indent=2, default=str).encode()
                ).decode()
                
                # First, try to get the current file to get its SHA
                get_response = await client.get(
                    f"{self.GITHUB_API_URL}/repos/{username}/{self.REPO_NAME}/contents/{self.BOOKMARK_FILE}",
                    headers=headers
                )
                
                sha = None
                if get_response.status_code == 200:
                    sha = get_response.json()['sha']
                
                # Prepare the update payload
                payload = {
                    "message": message,
                    "content": content,
                    "branch": "main"
                }
                
                if sha:
                    payload["sha"] = sha
                
                # Create or update the file
                response = await client.put(
                    f"{self.GITHUB_API_URL}/repos/{username}/{self.REPO_NAME}/contents/{self.BOOKMARK_FILE}",
                    headers=headers,
                    json=payload
                )
                
                return response.status_code in [200, 201]
        except Exception as e:
            print(f"Error pushing bookmarks: {e}")
            return False
    
    def merge_bookmarks(
        self, 
        local: Dict[str, Any], 
        remote: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Merge local and remote bookmarks, avoiding duplicates by URL"""
        local_bookmarks = local.get("bookmarks", [])
        remote_bookmarks = remote.get("bookmarks", [])
        
        # Build a map of URLs to bookmark objects
        merged_map = {}
        
        # Add remote bookmarks first (to preserve GitHub as source of truth for duplicates)
        for bookmark in remote_bookmarks:
            url = bookmark.get("url")
            if url:
                merged_map[url] = bookmark
        
        # Add/update with local bookmarks
        for bookmark in local_bookmarks:
            url = bookmark.get("url")
            if url:
                # If exists remotely, merge metadata
                if url in merged_map:
                    # Keep the more recent data
                    local_updated = bookmark.get("updatedAt")
                    remote_updated = merged_map[url].get("updatedAt")
                    if local_updated and remote_updated:
                        if local_updated > remote_updated:
                            merged_map[url] = bookmark
                else:
                    merged_map[url] = bookmark
        
        return {
            "bookmarks": list(merged_map.values()),
            "lastSynced": datetime.utcnow().isoformat(),
            "syncStatus": "merged"
        }
    
    async def sync_bookmarks(
        self, 
        user_id: int, 
        github_token: str, 
        github_username: str,
        db: Session = None
    ) -> tuple[bool, str]:
        """
        Main sync function that handles the complete workflow.
        Returns (success: bool, message: str)
        """
        try:
            # Decrypt token if needed
            if github_token.startswith('gAAAAAA'):  # Fernet encrypted token prefix
                github_token = self.decrypt_token(github_token)
            
            # 1. Create repository if it doesn't exist
            repo_created = await self.create_repository(github_token, github_username)
            if not repo_created:
                return False, "Failed to create git-bookmark repository"
            
            # 2. Load local bookmarks
            local_bookmarks = self.load_local_bookmarks(user_id)
            
            # 3. Try to fetch remote bookmarks
            remote_bookmarks = await self.get_remote_bookmarks(github_token, github_username)
            
            # 4. Merge if both exist, otherwise use whichever exists
            if remote_bookmarks and local_bookmarks.get("bookmarks"):
                merged = self.merge_bookmarks(local_bookmarks, remote_bookmarks)
                final_bookmarks = merged
            elif remote_bookmarks:
                final_bookmarks = remote_bookmarks
            else:
                final_bookmarks = local_bookmarks
            
            # Ensure proper structure
            if "lastSynced" not in final_bookmarks:
                final_bookmarks["lastSynced"] = datetime.utcnow().isoformat()
            
            # 5. Save merged bookmarks locally
            self.save_local_bookmarks(user_id, final_bookmarks)
            
            # 6. Push to GitHub
            push_success = await self.push_bookmarks_to_github(
                github_token,
                github_username,
                final_bookmarks,
                message=f"Sync bookmarks at {datetime.utcnow().isoformat()}"
            )
            
            if not push_success:
                return False, "Failed to push bookmarks to GitHub"
            
            # 7. Update user sync status if db session provided
            if db:
                from crud.user import update_user_bookmark_sync
                update_user_bookmark_sync(
                    db, 
                    user_id, 
                    sync_status="synced",
                    git_bookmark_repo_created=True
                )
            
            return True, "Bookmarks synced successfully"
            
        except Exception as e:
            error_msg = f"Sync error: {str(e)}"
            print(error_msg)
            if db:
                from crud.user import update_user_bookmark_sync
                update_user_bookmark_sync(
                    db,
                    user_id,
                    sync_status="failed"
                )
            return False, error_msg
    
    def add_bookmark_to_local(
        self, 
        user_id: int, 
        url: str, 
        name: str, 
        description: str = "", 
        category: str = ""
    ) -> bool:
        """Add or update a bookmark in the local file"""
        bookmarks = self.load_local_bookmarks(user_id)
        
        # Check if bookmark already exists
        existing_index = None
        for i, bm in enumerate(bookmarks.get("bookmarks", [])):
            if bm.get("url") == url:
                existing_index = i
                break
        
        bookmark_obj = {
            "url": url,
            "name": name,
            "description": description,
            "category": category,
            "addedAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
        }
        
        if existing_index is not None:
            bookmarks["bookmarks"][existing_index] = bookmark_obj
        else:
            bookmarks["bookmarks"].append(bookmark_obj)
        
        return self.save_local_bookmarks(user_id, bookmarks)
    
    def remove_bookmark_from_local(self, user_id: int, url: str) -> bool:
        """Remove a bookmark from the local file"""
        bookmarks = self.load_local_bookmarks(user_id)
        bookmarks["bookmarks"] = [
            bm for bm in bookmarks.get("bookmarks", []) 
            if bm.get("url") != url
        ]
        return self.save_local_bookmarks(user_id, bookmarks)


# Global instance
git_bookmark_service = GitBookmarkService()
