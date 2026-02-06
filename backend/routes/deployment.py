"""Docker deployment endpoints"""

from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from database import SessionLocal
from services.deployment_service import get_deployment_service
from services.stack_detection import StackDetector
from pydantic import BaseModel
import os
from pathlib import Path


# Request/Response models
class DeploymentDetectRequest(BaseModel):
    """Request for stack detection"""
    repo_id: int
    repo_path: str


class DeploymentCreateRequest(BaseModel):
    """Request to create deployment"""
    repo_id: int
    repo_name: str
    repo_path: str


class DeploymentStartRequest(BaseModel):
    """Request to start deployment"""
    deployment_id: int
    repo_path: str


class DeploymentResponse(BaseModel):
    """Deployment response"""
    id: int
    repository_id: int
    repo_name: str
    stack: str
    confidence_score: int
    assigned_port: int
    status: str
    container_id: Optional[str] = None
    error_message: Optional[str] = None
    log_tail: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None


class DetectionResponse(BaseModel):
    """Stack detection response"""
    stack: str
    confidence_score: int
    framework: Optional[str] = None
    detected_files: List[str] = []
    requires_db: bool = False
    internal_port: int = 3000
    build_command: Optional[str] = None
    run_command: Optional[str] = None


class ClonedRepoResponse(BaseModel):
    """Response for a cloned repository with detection"""
    id: str  # Folder name as ID
    name: str
    path: str
    stack: Optional[str] = None
    confidence_score: int = 0
    framework: Optional[str] = None
    detected_files: List[str] = []
    requires_db: bool = False
    internal_port: int = 3000


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/deployments", tags=["deployment"])


@router.get("/cloned-repos", response_model=List[ClonedRepoResponse])
def scan_cloned_repositories(db: Session = Depends(get_db)):
    """Scan backend/repos/ folder and return all cloned repositories with stack detection"""
    try:
        repos_folder = Path(__file__).parent.parent / "repos"
        
        if not repos_folder.exists():
            return []
        
        cloned_repos = []
        
        for repo_dir in repos_folder.iterdir():
            if not repo_dir.is_dir():
                continue
            
            try:
                # Create detector with the repo path
                detector = StackDetector(str(repo_dir))
                detection = detector.detect()
                
                cloned_repos.append(ClonedRepoResponse(
                    id=repo_dir.name,
                    name=repo_dir.name,
                    path=str(repo_dir),
                    stack=detection.stack if detection else None,
                    confidence_score=detection.confidence_score if detection else 0,
                    framework=detection.framework if detection else None,
                    detected_files=detection.detected_files if detection else [],
                    requires_db=detection.requires_db if detection else False,
                    internal_port=detection.internal_port if detection else 3000
                ))
            except Exception as e:
                # If detection fails, still include the repo with minimal info
                cloned_repos.append(ClonedRepoResponse(
                    id=repo_dir.name,
                    name=repo_dir.name,
                    path=str(repo_dir),
                    stack=None,
                    confidence_score=0
                ))
        
        return cloned_repos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/detect", response_model=DetectionResponse)
def detect_stack(request: DeploymentDetectRequest, db: Session = Depends(get_db)):
    """Detect programming stack from repository"""
    try:
        service = get_deployment_service(db)
        detection = service.detect_and_validate_repo(request.repo_path)
        
        if not detection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to detect stack. Repository may be empty or invalid."
            )
        
        return detection
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/create", response_model=DeploymentResponse)
def create_deployment(
    request: DeploymentCreateRequest,
    db: Session = Depends(get_db)
):
    """Create deployment record and prepare Docker files"""
    try:
        service = get_deployment_service(db)
        
        # Detect stack first
        detection = service.detect_and_validate_repo(request.repo_path)
        if not detection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to detect stack"
            )
        
        # Create deployment
        deployment_id = service.create_deployment(
            repository_id=request.repo_id,
            repo_name=request.repo_name,
            repo_path=request.repo_path,
            detection_result=detection
        )
        
        if not deployment_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create deployment"
            )
        
        # Return deployment details
        deployment = service.get_deployment(deployment_id)
        return deployment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/start", response_model=DeploymentResponse)
def start_deployment(
    request: DeploymentStartRequest,
    db: Session = Depends(get_db)
):
    """Start/deploy a deployment"""
    try:
        service = get_deployment_service(db)
        
        success = service.deploy(
            deployment_id=request.deployment_id,
            repo_path=request.repo_path
        )
        
        if not success:
            deployment = service.get_deployment(request.deployment_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=deployment.get("error_message", "Deployment failed")
            )
        
        # Return updated deployment details
        deployment = service.get_deployment(request.deployment_id)
        return deployment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/stop/{deployment_id}")
def stop_deployment(deployment_id: int, db: Session = Depends(get_db)):
    """Stop a running deployment"""
    try:
        service = get_deployment_service(db)
        
        success = service.stop_deployment(deployment_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to stop deployment"
            )
        
        deployment = service.get_deployment(deployment_id)
        return deployment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/restart/{deployment_id}")
def restart_deployment(deployment_id: int, db: Session = Depends(get_db)):
    """Restart a deployment"""
    try:
        service = get_deployment_service(db)
        
        success = service.restart_deployment(deployment_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to restart deployment"
            )
        
        deployment = service.get_deployment(deployment_id)
        return deployment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/{deployment_id}")
def delete_deployment(deployment_id: int, db: Session = Depends(get_db)):
    """Delete a deployment"""
    try:
        service = get_deployment_service(db)
        
        success = service.delete_deployment(deployment_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found"
            )
        
        return {
            "status": "success",
            "message": "Deployment deleted",
            "deployment_id": deployment_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{deployment_id}", response_model=DeploymentResponse)
def get_deployment(deployment_id: int, db: Session = Depends(get_db)):
    """Get deployment details"""
    try:
        service = get_deployment_service(db)
        
        deployment = service.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found"
            )
        
        return deployment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repo/{repository_id}", response_model=List[DeploymentResponse])
def list_deployments(repository_id: int, db: Session = Depends(get_db)):
    """List deployments for a repository"""
    try:
        service = get_deployment_service(db)
        
        deployments = service.list_deployments(repository_id=repository_id)
        return deployments
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

