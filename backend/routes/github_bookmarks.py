from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import SessionLocal
from crud.user import (
    get_user_by_id, set_github_bookmark_credentials, 
    clear_github_bookmark_credentials
)
from services.git_bookmark_sync import git_bookmark_service
from services.oauth import OAuth2Service

router = APIRouter(prefix="/api/github-bookmarks", tags=["github-bookmarks"])

# Dependency
def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Schemas
class GitHubBookmarkConnect(BaseModel):
    """Request to connect GitHub account for bookmarks"""
    code: str  # OAuth authorization code


class GitHubBookmarkStatus(BaseModel):
    """GitHub bookmark connection status"""
    connected: bool
    username: Optional[str] = None
    sync_status: str = "pending"
    last_sync: Optional[datetime] = None
    repo_created: bool = False


class BookmarkItem(BaseModel):
    """Individual bookmark item"""
    url: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None


class BookmarksData(BaseModel):
    """Bookmarks data response"""
    bookmarks: list[BookmarkItem]
    last_synced: Optional[datetime] = None
    sync_status: str


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get current authenticated user from Authorization header"""
    from services.auth import decode_access_token
    
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )
    
    token = authorization[7:]  # Remove "Bearer " prefix
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user = get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    return user


@router.get("/status", response_model=GitHubBookmarkStatus)
async def get_bookmark_status(
    user=Depends(get_current_user)
):
    """Get current GitHub bookmark connection status"""
    
    return GitHubBookmarkStatus(
        connected=user.github_token is not None,
        username=user.github_username,
        sync_status=user.bookmark_sync_status or "pending",
        last_sync=user.last_bookmark_sync,
        repo_created=user.git_bookmark_repo_created or False
    )


@router.post("/connect")
async def connect_github_bookmarks(
    request: GitHubBookmarkConnect,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Connect GitHub account for bookmarks synchronization"""
    
    try:
        oauth_service = OAuth2Service()
        
        # Exchange code for access token
        github_token = await oauth_service.exchange_github_code(request.code)
        if not github_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange GitHub code for token"
            )
        
        # Get GitHub user info
        github_user = await oauth_service.get_github_user(github_token)
        if not github_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to fetch GitHub user information"
            )
        
        # Encrypt token before storing
        encrypted_token = git_bookmark_service.encrypt_token(github_token)
        
        # Save credentials to database
        set_github_bookmark_credentials(
            db,
            user.id,
            encrypted_token,
            github_user.login
        )
        
        # Create repository (will be created on first sync if not exists)
        repo_created = await git_bookmark_service.create_repository(
            github_token,
            github_user.login
        )
        
        if repo_created:
            # Trigger initial sync
            success, message = await git_bookmark_service.sync_bookmarks(
                user.id,
                github_token,
                github_user.login,
                db
            )
            
            return {
                "success": True,
                "message": "GitHub account connected successfully",
                "username": github_user.login,
                "sync_message": message
            }
        else:
            return {
                "success": True,
                "message": "GitHub account connected, repository will be created on first sync",
                "username": github_user.login
            }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error connecting GitHub account: {str(e)}"
        )


@router.post("/disconnect")
async def disconnect_github_bookmarks(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Disconnect GitHub account from bookmarks"""
    
    clear_github_bookmark_credentials(db, user.id)
    
    return {
        "success": True,
        "message": "GitHub account disconnected"
    }


@router.post("/sync")
async def trigger_bookmark_sync(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually trigger bookmark synchronization"""
    
    if not user.github_token or not user.github_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account not connected"
        )
    
    try:
        # Decrypt token
        github_token = git_bookmark_service.decrypt_token(user.github_token)
        
        # Perform sync
        success, message = await git_bookmark_service.sync_bookmarks(
            user.id,
            github_token,
            user.github_username,
            db
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=message
            )
        
        return {
            "success": True,
            "message": message
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync error: {str(e)}"
        )


@router.get("/data", response_model=BookmarksData)
async def get_bookmarks(
    user=Depends(get_current_user)
):
    """Get current bookmarks data"""
    
    bookmarks_data = git_bookmark_service.load_local_bookmarks(user.id)
    
    return BookmarksData(
        bookmarks=bookmarks_data.get("bookmarks", []),
        last_synced=bookmarks_data.get("lastSynced"),
        sync_status=bookmarks_data.get("syncStatus", "pending")
    )


@router.post("/bookmark/add")
async def add_bookmark(
    bookmark: BookmarkItem,
    user=Depends(get_current_user)
):
    """Add or update a bookmark locally"""
    
    success = git_bookmark_service.add_bookmark_to_local(
        user.id,
        bookmark.url,
        bookmark.name,
        bookmark.description or "",
        bookmark.category or ""
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save bookmark"
        )
    
    return {
        "success": True,
        "message": "Bookmark added successfully"
    }


@router.delete("/bookmark/remove")
async def remove_bookmark(
    url: str,
    user=Depends(get_current_user)
):
    """Remove a bookmark"""
    
    success = git_bookmark_service.remove_bookmark_from_local(user.id, url)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove bookmark"
        )
    
    return {
        "success": True,
        "message": "Bookmark removed successfully"
    }
