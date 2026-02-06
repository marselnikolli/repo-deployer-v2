"""Main deployment service that orchestrates the full deployment pipeline"""

import logging
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from models import Repository, Deployment, DeploymentStatus
from services.stack_detection import StackDetector
from services.dockerfile_generator import DockerfileGenerator
from services.compose_generator import ComposeGenerator
from services.port_manager import get_port_manager
from services.deployment_executor import DeploymentExecutor

logger = logging.getLogger(__name__)


class DeploymentService:
    """Service for managing deployments"""
    
    def __init__(self, db_session: Session):
        """Initialize service
        
        Args:
            db_session: SQLAlchemy database session
        """
        self.db = db_session
        self.executor = DeploymentExecutor(timeout_seconds=300)
        self.port_manager = get_port_manager()
    
    def detect_and_validate_repo(self, repo_path: str) -> Optional[Dict[str, Any]]:
        """Detect stack and validate repository
        
        Args:
            repo_path: Path to cloned repository
            
        Returns:
            Detection result or None if invalid
        """
        
        try:
            repo_path = Path(repo_path)
            if not repo_path.exists():
                logger.error(f"Repo path not found: {repo_path}")
                return None
            
            # Detect stack
            detector = StackDetector(str(repo_path))
            detection = detector.detect()
            
            return detection.to_dict()
        
        except Exception as e:
            logger.error(f"Stack detection failed: {e}", exc_info=True)
            return None
    
    def create_deployment(
        self,
        repository_id: int,
        repo_name: str,
        repo_path: str,
        detection_result: Dict[str, Any],
        assign_port: bool = True
    ) -> Optional[str]:
        """Create a deployment record and prepare Docker files
        
        Args:
            repository_id: Repository ID
            repo_name: Repository name
            repo_path: Path to cloned repository
            detection_result: Stack detection results
            assign_port: Whether to assign a port
            
        Returns:
            Deployment ID or None on error
        """
        
        try:
            repo_path = Path(repo_path)
            
            # Allocate port
            assigned_port = self.port_manager.allocate_port(repo_name)
            
            # Generate Dockerfile
            from services.stack_detection import StackDetectionResult
            detection = StackDetectionResult(**detection_result)
            dockerfile_content = DockerfileGenerator.generate(detection)
            
            # Generate docker-compose.yml
            compose_content = ComposeGenerator.generate(
                detection,
                repo_name,
                assigned_port,
                include_db=detection.requires_db
            )
            
            # Create deployment record
            deployment = Deployment(
                repository_id=repository_id,
                repo_name=repo_name,
                stack=detection.stack,
                confidence_score=detection.confidence_score,
                assigned_port=assigned_port,
                docker_path="Dockerfile",
                dockerfile_content=dockerfile_content,
                compose_content=compose_content,
                status=DeploymentStatus.PENDING
            )
            
            self.db.add(deployment)
            self.db.commit()
            
            logger.info(f"Created deployment record: {deployment.id} for {repo_name}")
            return deployment.id
        
        except Exception as e:
            logger.error(f"Failed to create deployment: {e}", exc_info=True)
            self.db.rollback()
            return None
    
    def deploy(
        self,
        deployment_id: int,
        repo_path: str
    ) -> bool:
        """Execute deployment
        
        Args:
            deployment_id: Deployment ID
            repo_path: Path to cloned repository
            
        Returns:
            True if successful, False otherwise
        """
        
        try:
            # Get deployment
            deployment = self.db.query(Deployment).filter(
                Deployment.id == deployment_id
            ).first()
            
            if not deployment:
                logger.error(f"Deployment {deployment_id} not found")
                return False
            
            repo_path = Path(repo_path)
            
            # Update status
            deployment.status = DeploymentStatus.RUNNING
            deployment.started_at = datetime.utcnow()
            self.db.commit()
            
            logger.info(f"Starting deployment {deployment_id}...")
            
            # Execute deployment
            result = self.executor.deploy(
                str(repo_path),
                deployment.dockerfile_content,
                deployment.compose_content,
                deployment.repo_name,
                deployment.assigned_port
            )
            
            if result["success"]:
                # Update with success
                deployment.status = DeploymentStatus.RUNNING
                deployment.container_id = result["container_id"]
                deployment.log_tail = result.get("logs")
                deployment.error_message = None
            else:
                # Update with error
                deployment.status = DeploymentStatus.ERROR
                deployment.error_message = result.get("error")
                deployment.log_tail = result.get("logs")
            
            self.db.commit()
            logger.info(f"Deployment {deployment_id} completed: {result['success']}")
            
            return result["success"]
        
        except Exception as e:
            logger.error(f"Deployment execution failed: {e}", exc_info=True)
            
            # Update status
            deployment = self.db.query(Deployment).filter(
                Deployment.id == deployment_id
            ).first()
            if deployment:
                deployment.status = DeploymentStatus.ERROR
                deployment.error_message = str(e)
                self.db.commit()
            
            return False
    
    def stop_deployment(self, deployment_id: int) -> bool:
        """Stop a running deployment
        
        Args:
            deployment_id: Deployment ID
            
        Returns:
            True if successful
        """
        
        try:
            deployment = self.db.query(Deployment).filter(
                Deployment.id == deployment_id
            ).first()
            
            if not deployment:
                logger.error(f"Deployment {deployment_id} not found")
                return False
            
            # Stop using docker-compose
            result = self.executor.stop_deployment(deployment.repo_name)
            
            if result["success"]:
                deployment.status = DeploymentStatus.STOPPED
                deployment.stopped_at = datetime.utcnow()
                deployment.log_tail = result.get("logs")
                self.db.commit()
                
                logger.info(f"Stopped deployment {deployment_id}")
                return True
            else:
                logger.error(f"Failed to stop deployment {deployment_id}: {result.get('error')}")
                return False
        
        except Exception as e:
            logger.error(f"Error stopping deployment: {e}", exc_info=True)
            return False
    
    def restart_deployment(self, deployment_id: int) -> bool:
        """Restart a deployment
        
        Args:
            deployment_id: Deployment ID
            
        Returns:
            True if successful
        """
        
        try:
            deployment = self.db.query(Deployment).filter(
                Deployment.id == deployment_id
            ).first()
            
            if not deployment:
                logger.error(f"Deployment {deployment_id} not found")
                return False
            
            result = self.executor.restart_deployment(deployment.repo_name)
            
            if result["success"]:
                deployment.status = DeploymentStatus.RUNNING
                deployment.started_at = datetime.utcnow()
                deployment.log_tail = result.get("logs")
                self.db.commit()
                
                logger.info(f"Restarted deployment {deployment_id}")
                return True
            else:
                logger.error(f"Failed to restart deployment: {result.get('error')}")
                return False
        
        except Exception as e:
            logger.error(f"Error restarting deployment: {e}", exc_info=True)
            return False
    
    def delete_deployment(self, deployment_id: int) -> bool:
        """Delete a deployment
        
        Args:
            deployment_id: Deployment ID
            
        Returns:
            True if successful
        """
        
        try:
            deployment = self.db.query(Deployment).filter(
                Deployment.id == deployment_id
            ).first()
            
            if not deployment:
                return False
            
            # Stop if running
            if deployment.status == DeploymentStatus.RUNNING:
                self.stop_deployment(deployment_id)
            
            # Release port
            self.port_manager.release_port(deployment.assigned_port)
            
            # Delete record
            self.db.delete(deployment)
            self.db.commit()
            
            logger.info(f"Deleted deployment {deployment_id}")
            return True
        
        except Exception as e:
            logger.error(f"Error deleting deployment: {e}", exc_info=True)
            self.db.rollback()
            return False
    
    def get_deployment(self, deployment_id: int) -> Optional[Dict[str, Any]]:
        """Get deployment details
        
        Args:
            deployment_id: Deployment ID
            
        Returns:
            Deployment details or None
        """
        
        try:
            deployment = self.db.query(Deployment).filter(
                Deployment.id == deployment_id
            ).first()
            
            if not deployment:
                return None
            
            return {
                "id": deployment.id,
                "repository_id": deployment.repository_id,
                "repo_name": deployment.repo_name,
                "stack": deployment.stack,
                "confidence_score": deployment.confidence_score,
                "assigned_port": deployment.assigned_port,
                "domain": deployment.domain,
                "status": deployment.status,
                "container_id": deployment.container_id,
                "error_message": deployment.error_message,
                "log_tail": deployment.log_tail,
                "created_at": deployment.created_at.isoformat() if deployment.created_at else None,
                "started_at": deployment.started_at.isoformat() if deployment.started_at else None,
                "stopped_at": deployment.stopped_at.isoformat() if deployment.stopped_at else None,
            }
        
        except Exception as e:
            logger.error(f"Error getting deployment: {e}", exc_info=True)
            return None
    
    def list_deployments(self, repository_id: Optional[int] = None) -> list[Dict[str, Any]]:
        """List deployments
        
        Args:
            repository_id: Filter by repository ID (optional)
            
        Returns:
            List of deployments
        """
        
        try:
            query = self.db.query(Deployment)
            
            if repository_id:
                query = query.filter(Deployment.repository_id == repository_id)
            
            deployments = query.all()
            
            return [
                {
                    "id": d.id,
                    "repository_id": d.repository_id,
                    "repo_name": d.repo_name,
                    "stack": d.stack,
                    "assigned_port": d.assigned_port,
                    "status": d.status,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in deployments
            ]
        
        except Exception as e:
            logger.error(f"Error listing deployments: {e}", exc_info=True)
            return []


def get_deployment_service(db_session: Session) -> DeploymentService:
    """Get deployment service instance"""
    return DeploymentService(db_session)
