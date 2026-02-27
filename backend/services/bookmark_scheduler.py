"""Scheduled tasks manager for bookmark sync"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
import asyncio
from sqlalchemy.orm import Session

from database import SessionLocal
from crud.user import get_user_by_id
from models import User
from services.git_bookmark_sync import git_bookmark_service


class BookmarkSyncScheduler:
    """Manages scheduled bookmark synchronization"""
    
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.is_running = False
    
    def start(self):
        """Start the scheduler"""
        if self.is_running:
            return
        
        # Run bookmark sync every day at 2 AM UTC
        self.scheduler.add_job(
            self._sync_all_bookmarks,
            CronTrigger(hour=2, minute=0),
            id='bookmark_sync_daily',
            name='Daily bookmark sync',
            replace_existing=True
        )
        
        self.scheduler.start()
        self.is_running = True
        print("Bookmark sync scheduler started - runs daily at 02:00 UTC")
    
    def stop(self):
        """Stop the scheduler"""
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
    
    def _sync_all_bookmarks(self):
        """Sync bookmarks for all connected users"""
        db = SessionLocal()
        try:
            # Get all users with GitHub credentials
            users = db.query(User).filter(
                User.github_token.isnot(None),
                User.github_username.isnot(None),
                User.is_active == True
            ).all()
            
            print(f"Starting bookmark sync for {len(users)} users...")
            
            for user in users:
                try:
                    self._sync_user_bookmarks(user, db)
                except Exception as e:
                    print(f"Error syncing bookmarks for user {user.id}: {e}")
            
            print("Bookmark sync completed")
        finally:
            db.close()
    
    def _sync_user_bookmarks(self, user: User, db: Session):
        """Sync bookmarks for a specific user"""
        try:
            # Decrypt token
            github_token = git_bookmark_service.decrypt_token(user.github_token)
            
            # Run async sync function in event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success, message = loop.run_until_complete(
                    git_bookmark_service.sync_bookmarks(
                        user.id,
                        github_token,
                        user.github_username,
                        db
                    )
                )
                
                if success:
                    print(f"✓ User {user.email}: {message}")
                else:
                    print(f"✗ User {user.email}: {message}")
            finally:
                loop.close()
        
        except Exception as e:
            print(f"Error syncing user {user.email}: {e}")


# Global scheduler instance
bookmark_scheduler = BookmarkSyncScheduler()
