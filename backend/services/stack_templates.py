"""Stack configuration templates for Docker deployment"""

from typing import Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class StackTemplate:
    """Configuration template for a technology stack"""
    
    name: str
    display_name: str
    default_port: int = 3000
    build_command: Optional[str] = None
    run_command: str = "npm start"
    environment: Dict[str, str] = field(default_factory=dict)
    exposed_files: List[str] = field(default_factory=list)  # Files to exclude from Docker
    requires_database: bool = False
    database_type: Optional[str] = None  # postgresql, mysql, mongodb, redis
    health_check: Optional[str] = None  # Health check endpoint
    working_directory: str = "/app"
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "name": self.name,
            "display_name": self.display_name,
            "default_port": self.default_port,
            "build_command": self.build_command,
            "run_command": self.run_command,
            "environment": self.environment,
            "exposed_files": self.exposed_files,
            "requires_database": self.requires_database,
            "database_type": self.database_type,
            "health_check": self.health_check,
            "working_directory": self.working_directory,
        }


class StackTemplates:
    """Registry of stack templates"""
    
    TEMPLATES: Dict[str, StackTemplate] = {
        "node": StackTemplate(
            name="node",
            display_name="Node.js",
            default_port=3000,
            build_command="npm install",
            run_command="npm start",
            environment={"NODE_ENV": "production"},
            exposed_files=["node_modules", ".git", ".gitignore"],
            requires_database=True,
            health_check="/health",
            working_directory="/app"
        ),
        
        "python": StackTemplate(
            name="python",
            display_name="Python",
            default_port=8000,
            build_command="pip install -r requirements.txt",
            run_command="python main.py",
            environment={"PYTHONUNBUFFERED": "1"},
            exposed_files=["__pycache__", ".git", "venv", ".venv"],
            requires_database=True,
            health_check="/health",
            working_directory="/app"
        ),
        
        "php": StackTemplate(
            name="php",
            display_name="PHP",
            default_port=8000,
            build_command="composer install",
            run_command="php -S 0.0.0.0:8000",
            environment={"PHP_DISPLAY_ERRORS": "0"},
            exposed_files=["vendor", ".git", "node_modules"],
            requires_database=True,
            health_check="/health.php",
            working_directory="/app"
        ),
        
        "go": StackTemplate(
            name="go",
            display_name="Go",
            default_port=8080,
            build_command="go build -o app",
            run_command="./app",
            environment={"CGO_ENABLED": "0"},
            exposed_files=[".git", "vendor"],
            requires_database=True,
            health_check="/health",
            working_directory="/app"
        ),
        
        "ruby": StackTemplate(
            name="ruby",
            display_name="Ruby",
            default_port=3000,
            build_command="bundle install",
            run_command="rails server -b 0.0.0.0",
            environment={"RAILS_ENV": "production"},
            exposed_files=["vendor", ".git", "node_modules"],
            requires_database=True,
            health_check="/health",
            working_directory="/app"
        ),
        
        "java": StackTemplate(
            name="java",
            display_name="Java",
            default_port=8080,
            build_command="mvn clean package -DskipTests",
            run_command="java -jar target/app.jar",
            environment={"JAVA_OPTS": "-Xmx512m"},
            exposed_files=[".git", "target"],
            requires_database=True,
            health_check="/health",
            working_directory="/app"
        ),
        
        "csharp": StackTemplate(
            name="csharp",
            display_name=".NET / C#",
            default_port=5000,
            build_command="dotnet build",
            run_command="dotnet run",
            environment={"ASPNETCORE_ENVIRONMENT": "Production"},
            exposed_files=[".git", "bin", "obj"],
            requires_database=True,
            health_check="/health",
            working_directory="/app"
        ),
        
        "rust": StackTemplate(
            name="rust",
            display_name="Rust",
            default_port=8080,
            build_command="cargo build --release",
            run_command="./target/release/app",
            environment={},
            exposed_files=[".git", "target"],
            requires_database=False,
            working_directory="/app"
        ),
        
        "static": StackTemplate(
            name="static",
            display_name="Static Site",
            default_port=3000,
            build_command=None,
            run_command="http-server -p 3000",
            environment={},
            exposed_files=[".git", "node_modules"],
            requires_database=False,
            working_directory="/app"
        ),
    }
    
    @classmethod
    def get(cls, stack_name: str) -> Optional[StackTemplate]:
        """Get template for a stack"""
        return cls.TEMPLATES.get(stack_name)
    
    @classmethod
    def list_all(cls) -> Dict[str, StackTemplate]:
        """Get all templates"""
        return cls.TEMPLATES.copy()
    
    @classmethod
    def get_all_stacks(cls) -> List[str]:
        """Get list of all supported stacks"""
        return list(cls.TEMPLATES.keys())
    
    @classmethod
    def supports_stack(cls, stack_name: str) -> bool:
        """Check if stack is supported"""
        return stack_name in cls.TEMPLATES


def get_stack_template(stack_name: str) -> Optional[StackTemplate]:
    """Convenience function to get template"""
    return StackTemplates.get(stack_name)


def list_stacks() -> List[str]:
    """Convenience function to list all stacks"""
    return StackTemplates.get_all_stacks()
