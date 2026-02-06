"""Docker installation and system detection service"""

import os
import platform
import subprocess
from typing import Optional, Dict, Any
from pydantic import BaseModel


class SystemInfo(BaseModel):
    """System information"""
    os_type: str  # linux, darwin, windows
    arch: str  # x86_64, aarch64, etc
    python_version: str
    docker_installed: bool
    docker_compose_installed: bool
    docker_version: Optional[str] = None
    docker_compose_version: Optional[str] = None


class DockerInstallationService:
    """Service for Docker installation and system management"""
    
    @staticmethod
    def get_system_info() -> SystemInfo:
        """Get system information"""
        os_type = platform.system().lower()
        if os_type == "darwin":
            os_type = "macos"
        
        arch = platform.machine()
        python_version = platform.python_version()
        
        docker_installed, docker_version = DockerInstallationService._check_docker()
        docker_compose_installed, docker_compose_version = DockerInstallationService._check_docker_compose()
        
        return SystemInfo(
            os_type=os_type,
            arch=arch,
            python_version=python_version,
            docker_installed=docker_installed,
            docker_compose_installed=docker_compose_installed,
            docker_version=docker_version,
            docker_compose_version=docker_compose_version
        )
    
    @staticmethod
    def _check_docker() -> tuple[bool, Optional[str]]:
        """Check if Docker is installed"""
        try:
            result = subprocess.run(
                ["docker", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                # Extract version from output like "Docker version 24.0.0, build xyz"
                version_str = result.stdout.strip().split(",")[0].replace("Docker version ", "")
                return True, version_str
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return False, None
    
    @staticmethod
    def _check_docker_compose() -> tuple[bool, Optional[str]]:
        """Check if Docker Compose is installed"""
        try:
            result = subprocess.run(
                ["docker", "compose", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                # Extract version from output like "Docker Compose version 2.20.0"
                version_str = result.stdout.strip().split("version ")[-1]
                return True, version_str
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return False, None
    
    @staticmethod
    def get_docker_install_command() -> str:
        """Get the appropriate Docker installation command for the system"""
        os_type = platform.system().lower()
        
        if os_type == "linux":
            return """curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"""
        elif os_type == "darwin":  # macOS
            return """brew install docker docker-compose"""
        elif os_type == "windows":
            return """winget install Docker.DockerDesktop"""
        else:
            return "Unsupported operating system"
    
    @staticmethod
    def get_docker_compose_install_command() -> str:
        """Get the appropriate Docker Compose installation command"""
        os_type = platform.system().lower()
        
        if os_type == "linux":
            return """sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose"""
        elif os_type == "darwin":  # macOS (usually comes with Docker Desktop)
            return "docker-compose should come with Docker Desktop"
        elif os_type == "windows":
            return "docker-compose should come with Docker Desktop"
        else:
            return "Unsupported operating system"
    
    @staticmethod
    def get_post_install_instructions() -> str:
        """Get post-installation instructions"""
        os_type = platform.system().lower()
        
        if os_type == "linux":
            return """
sudo usermod -aG docker $USER
newgrp docker
# Or reboot your system
            """
        elif os_type == "darwin":
            return "Docker Desktop will start automatically. Please complete the installation wizard."
        elif os_type == "windows":
            return "Docker Desktop will start automatically. Please complete the installation wizard."
        else:
            return "Please follow the Docker documentation for your system"
