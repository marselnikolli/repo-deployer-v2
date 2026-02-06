"""Team management API endpoints"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database import SessionLocal

from services.team import TeamService
from models import UserRole
from routes.auth import get_current_user

router = APIRouter(prefix="/api/teams", tags=["teams"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic schemas
class UserInfo(BaseModel):
    """Basic user info"""
    id: int
    email: str
    name: Optional[str]
    avatar_url: Optional[str]

    class Config:
        from_attributes = True


class TeamMemberInfo(BaseModel):
    """Team member info with role"""
    id: int
    user_id: int
    email: str
    name: Optional[str]
    role: str
    avatar_url: Optional[str]
    joined_at: datetime
    is_owner: bool

    class Config:
        from_attributes = True


class TeamCreate(BaseModel):
    """Create team request"""
    name: str
    slug: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    is_public: bool = False


class TeamUpdate(BaseModel):
    """Update team request"""
    name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    is_public: Optional[bool] = None
    settings: Optional[dict] = None


class TeamResponse(BaseModel):
    """Team response model"""
    id: int
    name: str
    slug: str
    description: Optional[str]
    owner_id: int
    logo_url: Optional[str]
    is_public: bool
    max_members: int
    max_repositories: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TeamDetailResponse(TeamResponse):
    """Team with members"""
    members: List[TeamMemberInfo]


class AddMemberRequest(BaseModel):
    """Add team member request"""
    user_id: int
    role: str = UserRole.VIEWER


class UpdateMemberRoleRequest(BaseModel):
    """Update member role request"""
    role: str


@router.post("", response_model=TeamResponse)
async def create_team(
    team_create: TeamCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create a new team"""
    try:
        # Check if slug already exists
        existing = TeamService.get_team_by_slug(db, team_create.slug)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Team slug already exists"
            )
        
        team = TeamService.create_team(
            db,
            name=team_create.name,
            owner_id=current_user.id,
            slug=team_create.slug,
            description=team_create.description,
            logo_url=team_create.logo_url,
            is_public=team_create.is_public
        )
        
        return team
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("", response_model=List[TeamResponse])
async def list_user_teams(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all teams the user belongs to"""
    try:
        teams = TeamService.list_user_teams(db, current_user.id)
        return teams
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{team_id}", response_model=TeamDetailResponse)
async def get_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get team details with members"""
    try:
        team = TeamService.get_team(db, team_id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        # Check if user has access (member or public team)
        if not team.is_public:
            role = TeamService.get_user_role_in_team(db, team_id, current_user.id)
            if not role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
        
        members = TeamService.get_team_members(db, team_id)
        
        return {
            **team.__dict__,
            "members": members
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: int,
    team_update: TeamUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update team settings"""
    try:
        # Check ownership
        if not TeamService.is_team_owner(db, team_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team owner can update settings"
            )
        
        update_data = team_update.dict(exclude_unset=True)
        team = TeamService.update_team(db, team_id, **update_data)
        
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        return team
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/{team_id}")
async def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Delete a team"""
    try:
        # Check ownership
        if not TeamService.is_team_owner(db, team_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team owner can delete team"
            )
        
        success = TeamService.delete_team(db, team_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        return {"detail": "Team deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/{team_id}/members", response_model=TeamMemberInfo)
async def add_team_member(
    team_id: int,
    member_request: AddMemberRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Add a member to a team"""
    try:
        # Check admin access
        if not TeamService.is_team_admin(db, team_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team admins can add members"
            )
        
        # Check if user exists
        from models import User
        user = db.query(User).filter(User.id == member_request.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        member = TeamService.add_team_member(
            db,
            team_id,
            member_request.user_id,
            member_request.role,
            added_by=current_user.id
        )
        
        members = TeamService.get_team_members(db, team_id)
        member_info = next((m for m in members if m['user_id'] == member_request.user_id), None)
        
        return member_info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{team_id}/members", response_model=List[TeamMemberInfo])
async def get_team_members(
    team_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get team members"""
    try:
        # Check access (member or public team)
        team = TeamService.get_team(db, team_id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        if not team.is_public:
            role = TeamService.get_user_role_in_team(db, team_id, current_user.id)
            if not role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
        
        members = TeamService.get_team_members(db, team_id)
        return members
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/{team_id}/members/{user_id}", response_model=TeamMemberInfo)
async def update_member_role(
    team_id: int,
    user_id: int,
    role_request: UpdateMemberRoleRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update a member's role"""
    try:
        # Check admin access
        if not TeamService.is_team_admin(db, team_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team admins can update roles"
            )
        
        member = TeamService.update_member_role(db, team_id, user_id, role_request.role)
        
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team member not found"
            )
        
        members = TeamService.get_team_members(db, team_id)
        member_info = next((m for m in members if m['user_id'] == user_id), None)
        
        return member_info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Remove a member from a team"""
    try:
        # Check admin access
        if not TeamService.is_team_admin(db, team_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team admins can remove members"
            )
        
        success = TeamService.remove_team_member(db, team_id, user_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team member not found"
            )
        
        return {"detail": "Member removed successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
