"""Analytics API endpoints"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
from database import SessionLocal
from services.analytics import AnalyticsService, RepositoryStats, RepositoryAnalytics


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=RepositoryStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics for all repositories"""
    try:
        stats = AnalyticsService.get_dashboard_stats(db)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repository/{repo_id}", response_model=RepositoryAnalytics)
def get_repository_analytics(repo_id: int, db: Session = Depends(get_db)):
    """Get detailed analytics for a specific repository"""
    try:
        analytics = AnalyticsService.get_repo_analytics(db, repo_id)
        if not analytics:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repo_id} not found"
            )
        return analytics
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/languages", response_model=Dict[str, Any])
def get_language_analytics(db: Session = Depends(get_db)):
    """Get language distribution analytics"""
    try:
        analytics = AnalyticsService.get_language_analytics(db)
        return analytics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/timeline", response_model=Dict[str, int])
def get_activity_timeline(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    """Get activity timeline for last N days"""
    try:
        timeline = AnalyticsService.get_activity_timeline(db, days=days)
        return timeline
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/status-distribution", response_model=Dict[str, int])
def get_status_distribution(db: Session = Depends(get_db)):
    """Get distribution of repository statuses"""
    try:
        distribution = AnalyticsService.get_status_distribution(db)
        return distribution
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/top-repos", response_model=List[Dict[str, Any]])
def get_top_repos(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get top repositories by stars"""
    try:
        repos = AnalyticsService.get_top_repos(db, limit=limit)
        return repos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/recently-updated", response_model=List[Dict[str, Any]])
def get_recently_updated(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get most recently updated repositories"""
    try:
        repos = AnalyticsService.get_most_recently_updated(db, limit=limit)
        return repos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
