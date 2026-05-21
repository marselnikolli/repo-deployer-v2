"""Docker deployment endpoints"""

from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from database import SessionLocal
from services.deployment_service import get_deployment_service
from services.stack_detection import StackDetector
from pydantic import BaseModel
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


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
    id: str
    name: str
    path: str
    zip_file: Optional[str] = None
    install_guide: Optional[str] = None
    install_guide_path: Optional[str] = None
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
    """Return all cloned repositories from the database with stack detection."""
    from models import Repository

    repos_dir = Path(os.getenv("REPOS_DIR", "/app/repos"))
    cloned = db.query(Repository).filter(Repository.cloned == True).all()  # noqa: E712

    results: List[ClonedRepoResponse] = []
    for repo in cloned:
        # Build clone path: repos_dir / owner / name
        parts = repo.name.split("/", 1)
        owner = parts[0] if len(parts) == 2 else "unknown"
        name  = parts[1] if len(parts) == 2 else parts[0]
        clone_path = repos_dir / owner / name

        if not clone_path.is_dir():
            # DB says cloned but folder is gone — reset and skip
            repo.cloned = False
            repo.path = None
            db.add(repo)
            continue

        # Optional install guide
        guide_path = clone_path / "install-guide.md"
        install_guide = None
        if guide_path.exists():
            try:
                install_guide = guide_path.read_text(encoding="utf-8")
            except Exception:
                pass

        # Stack detection directly on the cloned source tree
        detection = None
        try:
            detector = StackDetector(str(clone_path))
            detection = detector.detect()
        except Exception as e:
            logger.warning(f"Stack detection failed for {repo.name}: {e}")

        results.append(ClonedRepoResponse(
            id=str(repo.id),
            name=repo.name,
            path=str(clone_path),
            install_guide=install_guide,
            install_guide_path=str(guide_path) if guide_path.exists() else None,
            stack=detection.stack if detection else None,
            confidence_score=detection.confidence_score if detection else 0,
            framework=detection.framework if detection else None,
            detected_files=detection.detected_files if detection else [],
            requires_db=detection.requires_db if detection else False,
            internal_port=detection.internal_port if detection else 3000,
        ))

    db.commit()
    return results


@router.get("/install-guide/{repo_name}")
def get_install_guide(repo_name: str):
    """Retrieve the install-guide.md content for a cloned repository"""
    try:
        repo_base_path = Path(__file__).parent.parent / "repos"
        repo_folder = repo_base_path / repo_name
        
        if not repo_folder.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository folder not found: {repo_name}"
            )
        
        # Look for install-guide.md in repo folder
        guide_path = repo_folder / "install-guide.md"
        
        if not guide_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"install-guide.md not found for repository {repo_name}"
            )
        
        with open(guide_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "repository_name": repo_name,
            "content": content,
            "path": str(guide_path)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reading install guide: {str(e)}"
        )


@router.delete("/cloned-repos/{repo_name}")
def delete_cloned_repository(repo_name: str):
    """Delete a cloned repository and all its contents (ZIP file and install guide)"""
    try:
        repo_base_path = Path(__file__).parent.parent / "repos"
        repo_folder = repo_base_path / repo_name
        
        if not repo_folder.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository folder not found: {repo_name}"
            )
        
        if not repo_folder.is_dir():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid repository path: {repo_name}"
            )
        
        # Delete the entire repository folder and its contents
        import shutil
        try:
            shutil.rmtree(repo_folder)
            logger.info(f"Successfully deleted repository folder: {repo_folder}")
            
            return {
                "status": "success",
                "message": f"Deleted repository and all its contents: {repo_name}",
                "deleted_path": str(repo_folder)
            }
        except PermissionError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: Cannot delete {repo_name}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete repository: {str(e)}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting repository: {str(e)}"
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

