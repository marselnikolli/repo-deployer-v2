"""Team and collaboration service"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from models import Team, TeamMember, User, UserRole, AuditLog
from datetime import datetime
import json


class TeamService:
    """Service for team management and RBAC"""
    
    @staticmethod
    def create_team(
        db: Session,
        name: str,
        owner_id: int,
        slug: str,
        description: Optional[str] = None,
        logo_url: Optional[str] = None,
        is_public: bool = False
    ) -> Team:
        """Create a new team"""
        team = Team(
            name=name,
            slug=slug,
            owner_id=owner_id,
            description=description,
            logo_url=logo_url,
            is_public=is_public
        )
        db.add(team)
        
        # Add owner as admin
        member = TeamMember(
            team_id=team.id,
            user_id=owner_id,
            role=UserRole.ADMIN
        )
        db.add(member)
        db.commit()
        db.refresh(team)
        return team
    
    @staticmethod
    def get_team(db: Session, team_id: int) -> Optional[Team]:
        """Get team by ID"""
        return db.query(Team).filter(Team.id == team_id).first()
    
    @staticmethod
    def get_team_by_slug(db: Session, slug: str) -> Optional[Team]:
        """Get team by slug"""
        return db.query(Team).filter(Team.slug == slug).first()
    
    @staticmethod
    def list_user_teams(db: Session, user_id: int) -> List[Team]:
        """List all teams the user belongs to"""
        return db.query(Team).join(
            TeamMember, Team.id == TeamMember.team_id
        ).filter(TeamMember.user_id == user_id).all()
    
    @staticmethod
    def add_team_member(
        db: Session,
        team_id: int,
        user_id: int,
        role: str = UserRole.VIEWER,
        added_by: int = None
    ) -> TeamMember:
        """Add a member to a team"""
        # Check if already a member
        existing = db.query(TeamMember).filter(
            and_(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        ).first()
        
        if existing:
            return existing
        
        member = TeamMember(
            team_id=team_id,
            user_id=user_id,
            role=role
        )
        db.add(member)
        
        # Log the action
        if added_by:
            log = AuditLog(
                operation="team_member_added",
                resource_type="team",
                resource_id=team_id,
                details=json.dumps({"user_id": user_id, "role": role}),
                status="success"
            )
            db.add(log)
        
        db.commit()
        db.refresh(member)
        return member
    
    @staticmethod
    def remove_team_member(db: Session, team_id: int, user_id: int) -> bool:
        """Remove a member from a team"""
        member = db.query(TeamMember).filter(
            and_(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        ).first()
        
        if not member:
            return False
        
        # Check if this would leave team without admin
        team = db.query(Team).filter(Team.id == team_id).first()
        if team and team.owner_id == user_id:
            # Check if there are other admins
            other_admins = db.query(TeamMember).filter(
                and_(
                    TeamMember.team_id == team_id,
                    TeamMember.role == UserRole.ADMIN,
                    TeamMember.user_id != user_id
                )
            ).count()
            
            if other_admins == 0:
                raise ValueError("Cannot remove the last admin from a team")
        
        db.delete(member)
        db.commit()
        return True
    
    @staticmethod
    def update_member_role(
        db: Session,
        team_id: int,
        user_id: int,
        new_role: str
    ) -> Optional[TeamMember]:
        """Update a member's role"""
        member = db.query(TeamMember).filter(
            and_(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        ).first()
        
        if not member:
            return None
        
        member.role = new_role
        member.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(member)
        return member
    
    @staticmethod
    def get_team_members(db: Session, team_id: int) -> List[Dict[str, Any]]:
        """Get all members of a team with details"""
        members = db.query(TeamMember, User).join(
            User, TeamMember.user_id == User.id
        ).filter(TeamMember.team_id == team_id).all()
        
        result = []
        for member, user in members:
            result.append({
                "id": member.id,
                "user_id": user.id,
                "email": user.email,
                "name": user.name,
                "role": member.role,
                "avatar_url": user.avatar_url,
                "joined_at": member.joined_at,
                "is_owner": user.id == db.query(Team).filter(Team.id == team_id).first().owner_id
            })
        
        return result
    
    @staticmethod
    def get_user_role_in_team(db: Session, team_id: int, user_id: int) -> Optional[str]:
        """Get user's role in a team"""
        member = db.query(TeamMember).filter(
            and_(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        ).first()
        
        return member.role if member else None
    
    @staticmethod
    def is_team_admin(db: Session, team_id: int, user_id: int) -> bool:
        """Check if user is team admin"""
        role = TeamService.get_user_role_in_team(db, team_id, user_id)
        return role == UserRole.ADMIN
    
    @staticmethod
    def is_team_owner(db: Session, team_id: int, user_id: int) -> bool:
        """Check if user is team owner"""
        team = db.query(Team).filter(Team.id == team_id).first()
        return team and team.owner_id == user_id
    
    @staticmethod
    def update_team(
        db: Session,
        team_id: int,
        **kwargs
    ) -> Optional[Team]:
        """Update team settings"""
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return None
        
        for key, value in kwargs.items():
            if hasattr(team, key) and key not in ['id', 'created_at']:
                setattr(team, key, value)
        
        team.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(team)
        return team
    
    @staticmethod
    def delete_team(db: Session, team_id: int) -> bool:
        """Delete a team and all its members"""
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            return False
        
        db.delete(team)
        db.commit()
        return True
