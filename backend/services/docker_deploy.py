"""Docker deployment service for building and running containers"""

import os
import json
import subprocess
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from pathlib import Path


class DeploymentConfig(BaseModel):
    """Docker deployment configuration"""
    repo_path: str
    container_name: str
    image_name: str
    ports: Dict[str, str]  # {"8000": "8000"} format
    environment: Dict[str, str]  # {"KEY": "value"} format
    volumes: Dict[str, str]  # {"/app/data": "data_volume"} format
    use_compose: bool = False


class ContainerStatus(BaseModel):
    """Container status information"""
    container_id: Optional[str] = None
    name: str
    image: Optional[str] = None
    status: str  # running, exited, etc
    ports: Optional[List[Dict[str, Any]]] = None


class DockerDeploymentService:
    """Service for Docker deployments and container management"""
    
    @staticmethod
    def detect_dockerfile(repo_path: str) -> bool:
        """Check if repository has a Dockerfile"""
        dockerfile_path = os.path.join(repo_path, "Dockerfile")
        return os.path.exists(dockerfile_path)
    
    @staticmethod
    def detect_docker_compose(repo_path: str) -> bool:
        """Check if repository has docker-compose.yml"""
        compose_path = os.path.join(repo_path, "docker-compose.yml")
        if os.path.exists(compose_path):
            return True
        # Also check docker-compose.yaml
        compose_path = os.path.join(repo_path, "docker-compose.yaml")
        return os.path.exists(compose_path)
    
    @staticmethod
    def read_dockerfile(repo_path: str) -> Optional[str]:
        """Read Dockerfile content"""
        dockerfile_path = os.path.join(repo_path, "Dockerfile")
        try:
            with open(dockerfile_path, 'r') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading Dockerfile: {e}")
            return None
    
    @staticmethod
    def read_docker_compose(repo_path: str) -> Optional[str]:
        """Read docker-compose.yml content"""
        for filename in ["docker-compose.yml", "docker-compose.yaml"]:
            compose_path = os.path.join(repo_path, filename)
            try:
                with open(compose_path, 'r') as f:
                    return f.read()
            except FileNotFoundError:
                continue
            except Exception as e:
                print(f"Error reading docker-compose: {e}")
                return None
        return None
    
    @staticmethod
    def build_image(image_name: str, repo_path: str, dockerfile_path: str = "Dockerfile") -> bool:
        """Build Docker image"""
        try:
            cmd = [
                "docker", "build",
                "-t", image_name,
                "-f", os.path.join(repo_path, dockerfile_path),
                repo_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode == 0:
                return True
            else:
                print(f"Docker build error: {result.stderr}")
                return False
        except Exception as e:
            print(f"Error building image: {e}")
            return False
    
    @staticmethod
    def run_container(
        image_name: str,
        container_name: str,
        ports: Dict[str, str],
        environment: Dict[str, str],
        volumes: Dict[str, str]
    ) -> Optional[str]:
        """Run Docker container"""
        try:
            cmd = ["docker", "run", "-d", "--name", container_name]
            
            # Add ports
            for container_port, host_port in ports.items():
                cmd.extend(["-p", f"{host_port}:{container_port}"])
            
            # Add environment variables
            for key, value in environment.items():
                cmd.extend(["-e", f"{key}={value}"])
            
            # Add volumes
            for host_path, container_path in volumes.items():
                cmd.extend(["-v", f"{host_path}:{container_path}"])
            
            cmd.append(image_name)
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                return result.stdout.strip()  # container ID
            else:
                print(f"Docker run error: {result.stderr}")
                return None
        except Exception as e:
            print(f"Error running container: {e}")
            return None
    
    @staticmethod
    def get_container_status(container_name: str) -> Optional[ContainerStatus]:
        """Get container status"""
        try:
            cmd = ["docker", "inspect", container_name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                if data:
                    container = data[0]
                    return ContainerStatus(
                        container_id=container.get("Id"),
                        name=container.get("Name", "").lstrip("/"),
                        image=container.get("Config", {}).get("Image"),
                        status=container.get("State", {}).get("Status"),
                        ports=container.get("NetworkSettings", {}).get("Ports")
                    )
        except Exception as e:
            print(f"Error getting container status: {e}")
        
        return None
    
    @staticmethod
    def stop_container(container_name: str) -> bool:
        """Stop running container"""
        try:
            cmd = ["docker", "stop", container_name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return result.returncode == 0
        except Exception as e:
            print(f"Error stopping container: {e}")
            return False
    
    @staticmethod
    def remove_container(container_name: str, force: bool = False) -> bool:
        """Remove container"""
        try:
            cmd = ["docker", "rm"]
            if force:
                cmd.append("-f")
            cmd.append(container_name)
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return result.returncode == 0
        except Exception as e:
            print(f"Error removing container: {e}")
            return False
    
    @staticmethod
    def restart_container(container_name: str) -> bool:
        """Restart container"""
        try:
            cmd = ["docker", "restart", container_name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return result.returncode == 0
        except Exception as e:
            print(f"Error restarting container: {e}")
            return False
    
    @staticmethod
    def get_container_logs(container_name: str, lines: int = 100) -> Optional[str]:
        """Get container logs"""
        try:
            cmd = ["docker", "logs", "--tail", str(lines), container_name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return result.stdout
            return None
        except Exception as e:
            print(f"Error getting logs: {e}")
            return None
    
    @staticmethod
    def list_containers(all: bool = False) -> List[ContainerStatus]:
        """List all containers"""
        try:
            cmd = ["docker", "ps"]
            if all:
                cmd.append("-a")
            cmd.append("--format")
            cmd.append("json")
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0 and result.stdout:
                containers = []
                for line in result.stdout.strip().split("\n"):
                    if line:
                        data = json.loads(line)
                        containers.append(ContainerStatus(
                            container_id=data.get("ID"),
                            name=data.get("Names", "").split(",")[0],
                            image=data.get("Image"),
                            status=data.get("State")
                        ))
                return containers
        except Exception as e:
            print(f"Error listing containers: {e}")
        
        return []
