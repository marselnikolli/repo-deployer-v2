"""Repository analytics service"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import Repository
from pydantic import BaseModel


class RepositoryStats(BaseModel):
    """Repository statistics"""
    total_repos: int
    total_stars: int
    avg_stars: float
    total_updates: int
    languages: Dict[str, int]
    status_breakdown: Dict[str, int]
    recent_repos: List[Dict[str, Any]]


class RepositoryAnalytics(BaseModel):
    """Individual repository analytics"""
    repo_id: int
    name: str
    url: str
    stars: int
    language: Optional[str]
    description: Optional[str]
    last_updated: Optional[datetime]
    created_at: Optional[datetime]
    size_estimate: int
    activity_level: str
    estimated_commits: int
    estimated_contributors: int


class AnalyticsService:
    """Service for computing repository analytics"""

    @staticmethod
    def get_dashboard_stats(db: Session, user_id: Optional[int] = None) -> RepositoryStats:
        """Get aggregated statistics for dashboard"""
        # Build query
        query = db.query(Repository)
        if user_id:
            query = query.filter(Repository.user_id == user_id)

        repos = query.all()

        # Calculate stats
        total_repos = len(repos)
        total_stars = sum(r.stars or 0 for r in repos)
        avg_stars = total_stars / total_repos if total_repos > 0 else 0

        # Count updates in last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_updates = sum(
            1 for r in repos
            if r.github_updated_at and r.github_updated_at > thirty_days_ago
        )

        # Language breakdown
        language_counts: Dict[str, int] = {}
        for repo in repos:
            lang = repo.language or "Unknown"
            language_counts[lang] = language_counts.get(lang, 0) + 1

        # Status breakdown
        status_counts: Dict[str, int] = {}
        for repo in repos:
            # Map repository fields to status
            if repo.archived:
                status = "archived"
            elif repo.is_fork:
                status = "fork"
            elif repo.health_status == "not_found":
                status = "not_found"
            else:
                status = "active"
            status_counts[status] = status_counts.get(status, 0) + 1

        # Recent repos (sorted by github_updated_at)
        recent = sorted(
            repos,
            key=lambda r: r.github_updated_at or r.github_created_at or datetime.min,
            reverse=True
        )[:5]

        recent_repos = [
            {
                "id": r.id,
                "name": r.name,
                "url": r.url,
                "stars": r.stars,
                "language": r.language,
                "last_updated": r.github_updated_at.isoformat() if r.github_updated_at else None
            }
            for r in recent
        ]

        return RepositoryStats(
            total_repos=total_repos,
            total_stars=total_stars,
            avg_stars=round(avg_stars, 2),
            total_updates=recent_updates,
            languages=language_counts,
            status_breakdown=status_counts,
            recent_repos=recent_repos
        )

    @staticmethod
    def get_repo_analytics(db: Session, repo_id: int) -> Optional[RepositoryAnalytics]:
        """Get detailed analytics for a specific repository"""
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            return None

        # Determine activity level based on updates
        activity_level = "low"
        if repo.github_updated_at:
            days_since_update = (datetime.utcnow() - repo.github_updated_at).days
            if days_since_update < 7:
                activity_level = "high"
            elif days_since_update < 30:
                activity_level = "medium"
            else:
                activity_level = "low"

        # Estimate commits and contributors based on size and activity
        # This is simplified - in production, you'd fetch from GitHub API
        base_commits = 10
        commits_multiplier = 1
        if activity_level == "high":
            commits_multiplier = 10
        elif activity_level == "medium":
            commits_multiplier = 5

        estimated_commits = base_commits * commits_multiplier
        estimated_contributors = max(1, estimated_commits // 15)

        # Size estimate (in KB) - simplified
        size_estimate = 100 + (repo.stars or 0) // 10

        return RepositoryAnalytics(
            repo_id=repo.id,
            name=repo.name,
            url=repo.url,
            stars=repo.stars or 0,
            language=repo.language,
            description=repo.description,
            last_updated=repo.github_updated_at,
            created_at=repo.github_created_at,
            size_estimate=size_estimate,
            activity_level=activity_level,
            estimated_commits=estimated_commits,
            estimated_contributors=estimated_contributors
        )

    @staticmethod
    def get_language_analytics(db: Session, user_id: Optional[int] = None) -> Dict[str, Any]:
        """Get language distribution analytics"""
        query = db.query(Repository)
        if user_id:
            query = query.filter(Repository.user_id == user_id)

        repos = query.all()

        language_stats: Dict[str, Any] = {}
        for repo in repos:
            lang = repo.language or "Unknown"
            if lang not in language_stats:
                language_stats[lang] = {
                    "count": 0,
                    "total_stars": 0,
                    "avg_stars": 0
                }
            language_stats[lang]["count"] += 1
            language_stats[lang]["total_stars"] += repo.stars or 0

        # Calculate averages
        for lang, stats in language_stats.items():
            stats["avg_stars"] = (
                stats["total_stars"] / stats["count"]
                if stats["count"] > 0 else 0
            )

        return language_stats

    @staticmethod
    def get_activity_timeline(
        db: Session,
        user_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, int]:
        """Get activity timeline for last N days"""
        query = db.query(Repository)
        if user_id:
            query = query.filter(Repository.user_id == user_id)

        repos = query.all()

        # Initialize timeline
        timeline: Dict[str, int] = {}
        now = datetime.utcnow()
        for i in range(days):
            date = (now - timedelta(days=i)).date()
            timeline[date.isoformat()] = 0

        # Count updates by date
        for repo in repos:
            if repo.github_updated_at:
                update_date = repo.github_updated_at.date().isoformat()
                if update_date in timeline:
                    timeline[update_date] += 1

        # Sort by date
        return dict(sorted(timeline.items()))

    @staticmethod
    def get_status_distribution(db: Session, user_id: Optional[int] = None) -> Dict[str, int]:
        """Get distribution of repository statuses"""
        query = db.query(Repository.status, func.count(Repository.id))
        if user_id:
            query = query.filter(Repository.user_id == user_id)

        distribution = dict(query.group_by(Repository.status).all())

        # Ensure all statuses are represented
        for status in ["active", "archived", "private", "fork"]:
            if status not in distribution:
                distribution[status] = 0

        return distribution

    @staticmethod
    def get_top_repos(
        db: Session,
        user_id: Optional[int] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get top repositories by stars"""
        query = db.query(Repository).order_by(Repository.stars.desc())
        if user_id:
            query = query.filter(Repository.user_id == user_id)

        repos = query.limit(limit).all()

        return [
            {
                "id": r.id,
                "name": r.name,
                "url": r.url,
                "stars": r.stars or 0,
                "language": r.language,
                "description": r.description
            }
            for r in repos
        ]

    @staticmethod
    def get_most_recently_updated(
        db: Session,
        user_id: Optional[int] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get most recently updated repositories"""
        query = db.query(Repository).order_by(Repository.github_updated_at.desc().nullslast())
        if user_id:
            query = query.filter(Repository.user_id == user_id)

        repos = query.limit(limit).all()

        return [
            {
                "id": r.id,
                "name": r.name,
                "url": r.url,
                "language": r.language,
                "last_updated": r.github_updated_at.isoformat() if r.github_updated_at else None
            }
            for r in repos
        ]
