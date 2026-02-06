"""Docker installation and management endpoints"""

from fastapi import APIRouter, HTTPException, status
from services.docker_install import DockerInstallationService, SystemInfo

router = APIRouter(prefix="/api/docker", tags=["docker"])


@router.get("/system-info", response_model=SystemInfo)
def get_system_info():
    """Get current system information and Docker status"""
    try:
        return DockerInstallationService.get_system_info()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/install-commands")
def get_install_commands():
    """Get Docker and Docker Compose installation commands"""
    try:
        system_info = DockerInstallationService.get_system_info()
        
        # If both are installed, no need to install
        if system_info.docker_installed and system_info.docker_compose_installed:
            return {
                "status": "already_installed",
                "message": "Docker and Docker Compose are already installed",
                "docker_version": system_info.docker_version,
                "docker_compose_version": system_info.docker_compose_version
            }
        
        commands = []
        
        if not system_info.docker_installed:
            commands.append({
                "component": "Docker",
                "command": DockerInstallationService.get_docker_install_command()
            })
        
        if not system_info.docker_compose_installed:
            commands.append({
                "component": "Docker Compose",
                "command": DockerInstallationService.get_docker_compose_install_command()
            })
        
        instructions = DockerInstallationService.get_post_install_instructions()
        
        return {
            "status": "installation_required",
            "commands": commands,
            "post_install_instructions": instructions,
            "os_type": system_info.os_type
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/check-installation")
def check_docker_installation():
    """Check Docker and Docker Compose installation status"""
    try:
        system_info = DockerInstallationService.get_system_info()
        
        return {
            "docker": {
                "installed": system_info.docker_installed,
                "version": system_info.docker_version
            },
            "docker_compose": {
                "installed": system_info.docker_compose_installed,
                "version": system_info.docker_compose_version
            },
            "system": {
                "os": system_info.os_type,
                "arch": system_info.arch
            },
            "ready": system_info.docker_installed and system_info.docker_compose_installed
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
