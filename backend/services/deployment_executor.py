"""Docker deployment execution service"""

import logging
import subprocess
import os
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
import threading

logger = logging.getLogger(__name__)


class DeploymentExecutor:
    """Executes Docker deployments"""
    
    def __init__(self, timeout_seconds: int = 300):
        """Initialize executor
        
        Args:
            timeout_seconds: Deployment timeout in seconds
        """
        self.timeout_seconds = timeout_seconds
    
    def deploy(
        self,
        repo_path: str,
        docker_content: str,
        compose_content: str,
        repo_name: str,
        assigned_port: int
    ) -> Dict[str, Any]:
        """Execute deployment
        
        Args:
            repo_path: Path to cloned repository
            docker_content: Generated Dockerfile content
            compose_content: Generated docker-compose.yml content
            repo_name: Name of repository (container name)
            assigned_port: Port to expose
            
        Returns:
            Deployment result with status and container_id
        """
        
        result = {
            "success": False,
            "container_id": None,
            "error": None,
            "logs": None,
            "status": "error",
            "created_at": datetime.utcnow().isoformat()
        }
        
        try:
            repo_path = Path(repo_path)
            if not repo_path.exists():
                result["error"] = f"Repository path not found: {repo_path}"
                return result
            
            # Write Dockerfile
            dockerfile_path = repo_path / "Dockerfile"
            dockerfile_path.write_text(docker_content)
            logger.info(f"Generated Dockerfile at {dockerfile_path}")
            
            # Write docker-compose.yml
            compose_path = repo_path / "docker-compose.yml"
            compose_path.write_text(compose_content)
            logger.info(f"Generated docker-compose.yml at {compose_path}")
            
            # Build Docker image
            logger.info(f"Building Docker image for {repo_name}...")
            build_result = self._build_image(repo_path, repo_name)
            if not build_result["success"]:
                result["error"] = build_result["error"]
                result["logs"] = build_result.get("logs")
                return result
            
            # Start containers with docker-compose
            logger.info(f"Starting deployment with docker-compose...")
            deploy_result = self._start_deployment(repo_path, repo_name)
            if not deploy_result["success"]:
                result["error"] = deploy_result["error"]
                result["logs"] = deploy_result.get("logs")
                return result
            
            # Get container ID
            container_result = self._get_container_id(repo_name)
            if not container_result["success"]:
                container_id = None
                error = container_result["error"]
            else:
                container_id = container_result["container_id"]
                error = None
            
            # Get container logs
            logs = self._get_container_logs(container_id) if container_id else None
            
            result["success"] = True
            result["container_id"] = container_id
            result["error"] = error
            result["logs"] = logs
            result["status"] = "running"
            
            logger.info(f"Deployment successful for {repo_name}: {container_id}")
            return result
        
        except Exception as e:
            logger.error(f"Deployment failed for {repo_name}: {e}", exc_info=True)
            result["error"] = str(e)
            return result
    
    def _build_image(self, repo_path: Path, image_name: str) -> Dict[str, Any]:
        """Build Docker image
        
        Args:
            repo_path: Repository path
            image_name: Image name
            
        Returns:
            Build result
        """
        
        try:
            # Use docker build command
            cmd = [
                "docker",
                "build",
                "-t", image_name,
                str(repo_path)
            ]
            
            result = subprocess.run(
                cmd,
                cwd=str(repo_path),
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds
            )
            
            if result.returncode != 0:
                return {
                    "success": False,
                    "error": f"Docker build failed: {result.stderr}",
                    "logs": result.stdout + "\n" + result.stderr
                }
            
            return {
                "success": True,
                "logs": result.stdout
            }
        
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"Docker build timed out after {self.timeout_seconds}s"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _start_deployment(self, repo_path: Path, service_name: str) -> Dict[str, Any]:
        """Start deployment with docker-compose
        
        Args:
            repo_path: Repository path
            service_name: Service name
            
        Returns:
            Deployment result
        """
        
        try:
            # Use docker-compose to start services
            cmd = [
                "docker-compose",
                "-p", service_name,
                "up",
                "-d"
            ]
            
            result = subprocess.run(
                cmd,
                cwd=str(repo_path),
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds
            )
            
            if result.returncode != 0:
                return {
                    "success": False,
                    "error": f"docker-compose up failed: {result.stderr}",
                    "logs": result.stdout + "\n" + result.stderr
                }
            
            return {
                "success": True,
                "logs": result.stdout
            }
        
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"docker-compose startup timed out after {self.timeout_seconds}s"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_container_id(self, service_name: str) -> Dict[str, Any]:
        """Get container ID for service
        
        Args:
            service_name: Service name
            
        Returns:
            Container ID result
        """
        
        try:
            # Use docker-compose ps to get container ID
            cmd = [
                "docker-compose",
                "-p", service_name,
                "ps",
                "-q"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                container_id = result.stdout.strip().split('\n')[0]
                return {
                    "success": True,
                    "container_id": container_id
                }
            
            return {
                "success": False,
                "error": "Could not find container ID",
                "container_id": None
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "container_id": None
            }
    
    def _get_container_logs(self, container_id: str, tail_lines: int = 100) -> Optional[str]:
        """Get container logs
        
        Args:
            container_id: Container ID
            tail_lines: Number of lines to get
            
        Returns:
            Container logs or None
        """
        
        try:
            cmd = [
                "docker",
                "logs",
                "--tail", str(tail_lines),
                container_id
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return result.stdout
            return None
        
        except Exception as e:
            logger.warning(f"Could not get logs for {container_id}: {e}")
            return None
    
    def stop_deployment(self, service_name: str) -> Dict[str, Any]:
        """Stop deployment
        
        Args:
            service_name: Service name
            
        Returns:
            Stop result
        """
        
        try:
            cmd = [
                "docker-compose",
                "-p", service_name,
                "down"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {
                    "success": False,
                    "error": f"docker-compose down failed: {result.stderr}"
                }
            
            return {
                "success": True,
                "logs": result.stdout
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def restart_deployment(self, service_name: str) -> Dict[str, Any]:
        """Restart deployment
        
        Args:
            service_name: Service name
            
        Returns:
            Restart result
        """
        
        try:
            cmd = [
                "docker-compose",
                "-p", service_name,
                "restart"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {
                    "success": False,
                    "error": f"docker-compose restart failed: {result.stderr}"
                }
            
            return {
                "success": True,
                "logs": result.stdout
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


def get_executor(timeout_seconds: int = 300) -> DeploymentExecutor:
    """Get deployment executor instance"""
    return DeploymentExecutor(timeout_seconds)
