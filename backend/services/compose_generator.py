"""Docker Compose file generator for orchestrating deployment"""

from typing import Optional, Dict, Any
import logging
import json

from services.stack_detection import StackDetectionResult
from services.stack_templates import StackTemplates

logger = logging.getLogger(__name__)


class ComposeGenerator:
    """Generates docker-compose.yml files for deployments"""
    
    @staticmethod
    def generate(
        detection_result: StackDetectionResult,
        repo_name: str,
        assigned_port: int,
        include_db: bool = True,
        db_type: str = "postgresql"
    ) -> str:
        """Generate docker-compose.yml content"""
        
        compose = ComposeGenerator._build_base_compose(
            detection_result,
            repo_name,
            assigned_port,
            include_db,
            db_type
        )
        
        return ComposeGenerator._dict_to_yaml(compose)
    
    @staticmethod
    def _build_base_compose(
        result: StackDetectionResult,
        repo_name: str,
        assigned_port: int,
        include_db: bool = True,
        db_type: str = "postgresql"
    ) -> Dict[str, Any]:
        """Build compose structure as dictionary"""
        
        template = StackTemplates.get(result.stack)
        if not template:
            return ComposeGenerator._build_fallback_compose(repo_name, assigned_port)
        
        services = {}
        
        # Add main application service
        services[repo_name] = {
            "build": ".",
            "container_name": f"{repo_name}-app",
            "ports": [f"{assigned_port}:{template.default_port}"],
            "environment": template.environment.copy(),
            "volumes": [
                ".:/app",
                "/app/node_modules" if result.stack == "node" else None
            ],
            "restart": "unless-stopped",
            "networks": ["app-network"]
        }
        
        # Remove None volumes
        services[repo_name]["volumes"] = [v for v in services[repo_name]["volumes"] if v]
        
        # Add database if needed
        if include_db and result.requires_db:
            if db_type == "postgresql":
                services["database"] = {
                    "image": "postgres:15-alpine",
                    "container_name": f"{repo_name}-db",
                    "environment": {
                        "POSTGRES_USER": "appuser",
                        "POSTGRES_PASSWORD": "apppassword",
                        "POSTGRES_DB": repo_name
                    },
                    "volumes": [f"{repo_name}-db-data:/var/lib/postgresql/data"],
                    "restart": "unless-stopped",
                    "networks": ["app-network"],
                    "healthcheck": {
                        "test": ["CMD-SHELL", "pg_isready -U appuser"],
                        "interval": "10s",
                        "timeout": "5s",
                        "retries": 5
                    }
                }
                
                # Add database connection string to app
                services[repo_name]["environment"]["DATABASE_URL"] = \
                    "postgresql://appuser:apppassword@database:5432/" + repo_name
                services[repo_name]["depends_on"] = {
                    "database": {
                        "condition": "service_healthy"
                    }
                }
            
            elif db_type == "mysql":
                services["database"] = {
                    "image": "mysql:8.0",
                    "container_name": f"{repo_name}-db",
                    "environment": {
                        "MYSQL_ROOT_PASSWORD": "rootpassword",
                        "MYSQL_DATABASE": repo_name,
                        "MYSQL_USER": "appuser",
                        "MYSQL_PASSWORD": "apppassword"
                    },
                    "volumes": [f"{repo_name}-db-data:/var/lib/mysql"],
                    "restart": "unless-stopped",
                    "networks": ["app-network"],
                    "healthcheck": {
                        "test": ["CMD", "mysqladmin", "ping", "-h", "localhost"],
                        "interval": "10s",
                        "timeout": "5s",
                        "retries": 5
                    }
                }
                
                services[repo_name]["environment"]["DATABASE_URL"] = \
                    "mysql://appuser:apppassword@database:3306/" + repo_name
                services[repo_name]["depends_on"] = {
                    "database": {
                        "condition": "service_healthy"
                    }
                }
            
            elif db_type == "mongodb":
                services["database"] = {
                    "image": "mongo:7.0",
                    "container_name": f"{repo_name}-db",
                    "environment": {
                        "MONGO_INITDB_ROOT_USERNAME": "appuser",
                        "MONGO_INITDB_ROOT_PASSWORD": "apppassword",
                        "MONGO_INITDB_DATABASE": repo_name
                    },
                    "volumes": [f"{repo_name}-db-data:/data/db"],
                    "restart": "unless-stopped",
                    "networks": ["app-network"],
                    "healthcheck": {
                        "test": ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"],
                        "interval": "10s",
                        "timeout": "5s",
                        "retries": 5
                    }
                }
                
                services[repo_name]["environment"]["MONGODB_URI"] = \
                    "mongodb://appuser:apppassword@database:27017/" + repo_name
                services[repo_name]["depends_on"] = {
                    "database": {
                        "condition": "service_healthy"
                    }
                }
            
            elif db_type == "redis":
                services["cache"] = {
                    "image": "redis:7-alpine",
                    "container_name": f"{repo_name}-cache",
                    "volumes": [f"{repo_name}-cache-data:/data"],
                    "restart": "unless-stopped",
                    "networks": ["app-network"],
                    "healthcheck": {
                        "test": ["CMD", "redis-cli", "ping"],
                        "interval": "10s",
                        "timeout": "5s",
                        "retries": 5
                    }
                }
                
                services[repo_name]["environment"]["REDIS_URL"] = "redis://cache:6379"
                services[repo_name]["depends_on"] = {
                    "cache": {
                        "condition": "service_healthy"
                    }
                }
        
        # Build complete compose structure
        compose = {
            "version": "3.8",
            "services": services,
            "networks": {
                "app-network": {
                    "driver": "bridge"
                }
            }
        }
        
        # Add volumes if needed
        if include_db and result.requires_db:
            compose["volumes"] = {}
            if db_type in ["postgresql", "mysql", "mongodb"]:
                compose["volumes"][f"{repo_name}-db-data"] = {}
            if db_type == "redis":
                compose["volumes"][f"{repo_name}-cache-data"] = {}
        
        return compose
    
    @staticmethod
    def _build_fallback_compose(repo_name: str, assigned_port: int) -> Dict[str, Any]:
        """Build fallback compose for unknown stacks"""
        
        return {
            "version": "3.8",
            "services": {
                repo_name: {
                    "build": ".",
                    "container_name": f"{repo_name}-app",
                    "ports": [f"{assigned_port}:3000"],
                    "restart": "unless-stopped",
                    "networks": ["app-network"],
                    "# TODO": "Add proper configuration for this service"
                }
            },
            "networks": {
                "app-network": {
                    "driver": "bridge"
                }
            }
        }
    
    @staticmethod
    def _dict_to_yaml(data: Dict[str, Any]) -> str:
        """Convert dictionary to YAML format"""
        
        lines = []
        ComposeGenerator._dict_to_yaml_lines(data, lines, indent=0)
        return '\n'.join(lines)
    
    @staticmethod
    def _dict_to_yaml_lines(data: Any, lines: list, indent: int = 0) -> None:
        """Recursively convert data to YAML lines"""
        
        prefix = "  " * indent
        
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, (dict, list)):
                    lines.append(f"{prefix}{key}:")
                    ComposeGenerator._dict_to_yaml_lines(value, lines, indent + 1)
                elif isinstance(value, bool):
                    lines.append(f"{prefix}{key}: {'true' if value else 'false'}")
                elif isinstance(value, str) and '\n' in value:
                    lines.append(f"{prefix}{key}: |-")
                    for line in value.split('\n'):
                        lines.append(f"{prefix}  {line}")
                elif isinstance(value, str):
                    # Quote strings that need quoting
                    if any(c in value for c in [':', '#', '&', '*', '?', '[', ']', '{', '}', '|', '>', '%', '@', '`']):
                        lines.append(f"{prefix}{key}: '{value}'")
                    else:
                        lines.append(f"{prefix}{key}: {value}")
                else:
                    lines.append(f"{prefix}{key}: {value}")
        
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, (dict, list)):
                    lines.append(f"{prefix}- ")
                    ComposeGenerator._dict_to_yaml_lines(item, lines, indent + 1)
                elif isinstance(item, str):
                    if any(c in item for c in [':', '#', '&', '*', '?', '[', ']', '{', '}', '|', '>', '%', '@', '`']):
                        lines.append(f"{prefix}- '{item}'")
                    else:
                        lines.append(f"{prefix}- {item}")
                else:
                    lines.append(f"{prefix}- {item}")


def generate_compose(
    detection_result: StackDetectionResult,
    repo_name: str,
    assigned_port: int,
    include_db: bool = True,
    db_type: str = "postgresql"
) -> str:
    """Convenience function to generate compose file"""
    return ComposeGenerator.generate(
        detection_result,
        repo_name,
        assigned_port,
        include_db,
        db_type
    )
