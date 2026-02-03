"""Docker operations"""

import docker
import os
from pathlib import Path


client = docker.from_env()


def deploy_to_docker(repo_path: str, repo_name: str) -> bool:
    """Deploy repository to Docker"""
    try:
        if not os.path.exists(repo_path):
            print(f"Repository path not found: {repo_path}")
            return False
        
        # Check for Dockerfile
        dockerfile_path = os.path.join(repo_path, "Dockerfile")
        if not os.path.exists(dockerfile_path):
            print(f"No Dockerfile found in {repo_path}")
            return False
        
        # Build image
        image_tag = f"repo-{repo_name}:latest".lower()
        client.images.build(path=repo_path, tag=image_tag)
        
        return True
    
    except Exception as e:
        print(f"Error deploying {repo_name}: {e}")
        return False


def get_container_status(container_name: str) -> dict:
    """Get container status"""
    try:
        container = client.containers.get(container_name)
        return {
            "status": container.status,
            "state": container.attrs["State"],
            "running": container.status == "running"
        }
    except docker.errors.NotFound:
        return {"error": "Container not found"}
    except Exception as e:
        return {"error": str(e)}


def start_container(container_name: str) -> bool:
    """Start container"""
    try:
        container = client.containers.get(container_name)
        container.start()
        return True
    except Exception as e:
        print(f"Error starting container: {e}")
        return False


def stop_container(container_name: str) -> bool:
    """Stop container"""
    try:
        container = client.containers.get(container_name)
        container.stop()
        return True
    except Exception as e:
        print(f"Error stopping container: {e}")
        return False
