"""Repository scans for Docker files and deployment instructions"""

import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class RepositoryScanner:
    """Scans repository for Docker files and deployment instructions"""
    
    DOCKER_FILES = [
        'Dockerfile',
        'docker-compose.yml',
        'docker-compose.yaml',
        '.dockerignore',
        'docker.compose.yml',
        'compose.yaml'
    ]
    
    DEPLOYMENT_KEYWORDS = [
        'docker', 'deploy', 'setup', 'install', 'run', 'build', 
        'start', 'configuration', 'requirements', 'prerequisites',
        'environment', 'env', 'port', 'expose', 'mount', 'volume'
    ]
    
    @staticmethod
    def scan_repository(repo_path: str) -> Dict[str, Any]:
        """
        Scan repository for Docker files and deployment information
        
        Args:
            repo_path: Path to the cloned repository
            
        Returns:
            Dictionary containing:
            - has_docker: bool indicating if Docker files exist
            - docker_files: list of found Docker files
            - readme_content: content of README.md if found
            - deployment_instructions: extracted deployment instructions
            - docker_info: extracted info from Docker files
        """
        result = {
            "has_docker": False,
            "docker_files": [],
            "readme_content": None,
            "readme_found": False,
            "deployment_instructions": [],
            "docker_info": {
                "has_dockerfile": False,
                "has_compose": False,
                "ports": [],
                "volumes": [],
                "environment_vars": [],
                "services": []
            }
        }
        
        if not os.path.exists(repo_path):
            logger.error(f"Repository path does not exist: {repo_path}")
            return result
        
        try:
            # Scan for Docker files
            docker_files = RepositoryScanner._find_docker_files(repo_path)
            result["docker_files"] = docker_files
            result["has_docker"] = len(docker_files) > 0
            
            # Extract Docker information
            if docker_files:
                docker_info = RepositoryScanner._extract_docker_info(repo_path, docker_files)
                result["docker_info"].update(docker_info)
            
            # Find and read README
            readme_content = RepositoryScanner._find_and_read_readme(repo_path)
            if readme_content:
                result["readme_found"] = True
                result["readme_content"] = readme_content
                
                # Extract deployment instructions from README
                instructions = RepositoryScanner._extract_instructions_from_readme(readme_content)
                result["deployment_instructions"] = instructions
        
        except Exception as e:
            logger.error(f"Error scanning repository {repo_path}: {e}", exc_info=True)
        
        return result
    
    @staticmethod
    def _find_docker_files(repo_path: str) -> List[str]:
        """Find Docker-related files in the repository"""
        docker_files = []
        
        try:
            for root, dirs, files in os.walk(repo_path):
                # Skip hidden directories and common non-essential directories
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '.git', '__pycache__', 'venv']]
                
                for file in files:
                    if file in RepositoryScanner.DOCKER_FILES:
                        full_path = os.path.join(root, file)
                        relative_path = os.path.relpath(full_path, repo_path)
                        docker_files.append(relative_path)
        
        except Exception as e:
            logger.error(f"Error finding Docker files: {e}")
        
        return docker_files
    
    @staticmethod
    def _extract_docker_info(repo_path: str, docker_files: List[str]) -> Dict[str, Any]:
        """Extract information from Docker files"""
        info = {
            "has_dockerfile": False,
            "has_compose": False,
            "ports": [],
            "volumes": [],
            "environment_vars": [],
            "services": []
        }
        
        try:
            for docker_file in docker_files:
                file_path = os.path.join(repo_path, docker_file)
                
                if not os.path.exists(file_path):
                    continue
                
                filename = os.path.basename(docker_file)
                
                if filename == 'Dockerfile':
                    info["has_dockerfile"] = True
                    dockerfile_info = RepositoryScanner._parse_dockerfile(file_path)
                    if dockerfile_info.get("ports"):
                        info["ports"].extend(dockerfile_info["ports"])
                    if dockerfile_info.get("environment_vars"):
                        info["environment_vars"].extend(dockerfile_info["environment_vars"])
                
                elif filename in ['docker-compose.yml', 'docker-compose.yaml', 'compose.yaml']:
                    info["has_compose"] = True
                    compose_info = RepositoryScanner._parse_docker_compose(file_path)
                    if compose_info.get("ports"):
                        info["ports"].extend(compose_info["ports"])
                    if compose_info.get("volumes"):
                        info["volumes"].extend(compose_info["volumes"])
                    if compose_info.get("environment_vars"):
                        info["environment_vars"].extend(compose_info["environment_vars"])
                    if compose_info.get("services"):
                        info["services"].extend(compose_info["services"])
        
        except Exception as e:
            logger.error(f"Error extracting Docker info: {e}")
        
        return info
    
    @staticmethod
    def _parse_dockerfile(file_path: str) -> Dict[str, Any]:
        """Parse Dockerfile for relevant information"""
        info = {
            "ports": [],
            "environment_vars": [],
            "base_image": None,
            "commands": []
        }
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Extract base image
            base_image_match = re.search(r'FROM\s+(\S+)', content, re.IGNORECASE)
            if base_image_match:
                info["base_image"] = base_image_match.group(1)
            
            # Extract EXPOSE ports
            expose_matches = re.findall(r'EXPOSE\s+(\d+)', content, re.IGNORECASE)
            info["ports"] = expose_matches
            
            # Extract ENV variables
            env_matches = re.findall(r'ENV\s+(\w+)(?:=(.+))?', content, re.IGNORECASE)
            for match in env_matches:
                var_name = match[0]
                var_value = match[1].strip() if match[1] else ""
                info["environment_vars"].append(f"{var_name}={var_value}" if var_value else var_name)
            
            # Extract RUN, CMD, ENTRYPOINT
            command_matches = re.findall(r'(?:RUN|CMD|ENTRYPOINT)\s+(.+)', content, re.IGNORECASE)
            info["commands"] = command_matches[:5]  # Limit to first 5
        
        except Exception as e:
            logger.error(f"Error parsing Dockerfile: {e}")
        
        return info
    
    @staticmethod
    def _parse_docker_compose(file_path: str) -> Dict[str, Any]:
        """Parse Docker Compose file for relevant information"""
        info = {
            "ports": [],
            "volumes": [],
            "environment_vars": [],
            "services": []
        }
        
        try:
            import yaml
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                compose_data = yaml.safe_load(f)
            
            if not compose_data or 'services' not in compose_data:
                return info
            
            services = compose_data.get('services', {})
            info["services"] = list(services.keys())
            
            for service_name, service_config in services.items():
                if not isinstance(service_config, dict):
                    continue
                
                # Extract ports
                if 'ports' in service_config:
                    for port in service_config['ports']:
                        if isinstance(port, str):
                            info["ports"].append(port)
                        elif isinstance(port, int):
                            info["ports"].append(str(port))
                
                # Extract volumes
                if 'volumes' in service_config:
                    for volume in service_config['volumes']:
                        if isinstance(volume, str):
                            info["volumes"].append(volume)
                
                # Extract environment variables
                if 'environment' in service_config:
                    env = service_config['environment']
                    if isinstance(env, dict):
                        for key, value in env.items():
                            info["environment_vars"].append(f"{key}={value}")
                    elif isinstance(env, list):
                        info["environment_vars"].extend(env)
        
        except ImportError:
            logger.warning("PyYAML not installed, cannot parse docker-compose files")
        except Exception as e:
            logger.error(f"Error parsing docker-compose file: {e}")
        
        return info
    
    @staticmethod
    def _find_and_read_readme(repo_path: str) -> Optional[str]:
        """Find and read README.md file"""
        readme_names = ['README.md', 'README.MD', 'README.txt', 'README', 'readme.md']
        
        try:
            for root, dirs, files in os.walk(repo_path):
                # Skip hidden directories and unnecessary folders
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '.git', '__pycache__', 'venv']]
                
                for readme_name in readme_names:
                    if readme_name in files:
                        readme_path = os.path.join(root, readme_name)
                        try:
                            with open(readme_path, 'r', encoding='utf-8', errors='ignore') as f:
                                return f.read()
                        except Exception as e:
                            logger.error(f"Error reading {readme_path}: {e}")
                
                # Only check root and first level subdirectories
                if root != repo_path and os.path.dirname(root) != repo_path:
                    break
        
        except Exception as e:
            logger.error(f"Error finding README: {e}")
        
        return None
    
    @staticmethod
    def _extract_instructions_from_readme(readme_content: str) -> List[str]:
        """Extract deployment instructions from README content"""
        instructions = []
        
        if not readme_content:
            return instructions
        
        # Split by lines for processing
        lines = readme_content.split('\n')
        
        # Find sections that contain deployment/installation instructions
        current_section = None
        section_content = []
        
        for line in lines:
            # Check for section headers
            lower_line = line.lower()
            
            # Check if this is a header containing deployment-related keywords
            is_deployment_header = any(
                keyword in lower_line for keyword in 
                ['install', 'setup', 'deploy', 'run', 'usage', 'getting started', 'configuration', 'docker', 'build']
            )
            
            if line.startswith('#') and is_deployment_header:
                # Save previous section if exists
                if section_content:
                    instructions.extend(section_content)
                    section_content = []
                
                current_section = line.strip('# ').strip()
                section_content.append(f"### {current_section}")
            
            elif current_section and section_content:
                # Add lines to current section until next header
                if not line.startswith('#'):
                    section_content.append(line)
                else:
                    # Check if new section is also deployment-related
                    if not any(keyword in line.lower() for keyword in ['install', 'setup', 'deploy', 'run', 'usage', 'getting started', 'configuration', 'docker', 'build']):
                        instructions.extend(section_content)
                        section_content = []
                        current_section = None
        
        # Add remaining section
        if section_content:
            instructions.extend(section_content)
        
        # Clean up and filter out empty lines
        cleaned_instructions = []
        for instruction in instructions:
            if instruction.strip():
                cleaned_instructions.append(instruction)
        
        return cleaned_instructions
    
    @staticmethod
    def create_install_guide(repo_path: str, repo_name: str, scan_result: Dict[str, Any]) -> str:
        """
        Create install-guide.md file based on scan results
        
        Args:
            repo_path: Path to the repository
            repo_name: Name of the repository
            scan_result: Result from scan_repository()
            
        Returns:
            Path to created install-guide.md file
        """
        guide_content = RepositoryScanner.generate_install_guide_content(repo_name, scan_result)
        
        # Write guide to file
        try:
            guide_path = os.path.join(repo_path, 'install-guide.md')
            with open(guide_path, 'w', encoding='utf-8') as f:
                f.write(guide_content)
            logger.info(f"Created install-guide.md at {guide_path}")
            return guide_path
        except Exception as e:
            logger.error(f"Error creating install-guide.md: {e}")
            return None
    
    @staticmethod
    def generate_install_guide_content(repo_name: str, scan_result: Dict[str, Any]) -> str:
        """
        Generate install-guide.md content based on scan results
        
        Args:
            repo_name: Name of the repository
            scan_result: Result from scan_repository()
            
        Returns:
            Markdown content for the install guide
        """
        guide_content = f"""# Installation & Deployment Guide - {repo_name}

> Auto-generated deployment guide based on repository analysis

## Repository Information
- **Name**: {repo_name}
- **Generated**: {RepositoryScanner._get_current_timestamp()}

---

## Quick Start

"""
        
        # Add Docker information if available
        if scan_result.get("has_docker"):
            guide_content += "### Docker Setup\n\n"
            docker_info = scan_result.get("docker_info", {})
            
            if docker_info.get("has_dockerfile"):
                guide_content += "**Dockerfile found** - Build and run with Docker\n\n"
                guide_content += "```bash\n"
                guide_content += "docker build -t " + repo_name + " .\n"
                guide_content += "docker run -p 8080:8080 " + repo_name + "\n"
                guide_content += "```\n\n"
            
            if docker_info.get("has_compose"):
                guide_content += "**Docker Compose found** - Start services with:\n\n"
                guide_content += "```bash\n"
                guide_content += "docker-compose up -d\n"
                guide_content += "```\n\n"
            
            # Add ports information
            if docker_info.get("ports"):
                guide_content += "**Exposed Ports**:\n"
                for port in docker_info["ports"]:
                    guide_content += f"- {port}\n"
                guide_content += "\n"
            
            # Add services information
            if docker_info.get("services"):
                guide_content += "**Services**:\n"
                for service in docker_info["services"]:
                    guide_content += f"- {service}\n"
                guide_content += "\n"
            
            # Add environment variables if any
            if docker_info.get("environment_vars"):
                guide_content += "**Environment Variables**:\n"
                guide_content += "```\n"
                for env_var in docker_info["environment_vars"][:10]:  # Limit to 10
                    guide_content += f"{env_var}\n"
                guide_content += "```\n\n"
        
        # Add README instructions if found
        if scan_result.get("readme_found"):
            guide_content += "## Deployment Instructions from README\n\n"
            
            instructions = scan_result.get("deployment_instructions", [])
            if instructions:
                for instruction in instructions:
                    guide_content += instruction + "\n"
                guide_content += "\n"
            else:
                guide_content += "See the main README.md in the repository root for detailed instructions.\n\n"
        
        # Add Docker files list
        if scan_result.get("docker_files"):
            guide_content += "## Docker Files Found\n\n"
            for docker_file in scan_result["docker_files"]:
                guide_content += f"- `{docker_file}`\n"
            guide_content += "\n"
        
        # Add helpful notes
        guide_content += """---

## Notes

- This guide was automatically generated based on the repository structure
- Docker files were detected and analyzed for deployment information
- For more details, check the README.md in the repository root
- Some deployment instructions may need manual configuration

## Common Commands

```bash
# Build Docker image (if Dockerfile exists)
docker build -t repository-name .

# Run Docker container
docker run -d --name container-name -p 8080:8080 repository-name

# Stop container
docker stop container-name

# View logs
docker logs container-name

# Remove container
docker rm container-name
```

---

Generated automatically by Repo Deployer v2
"""
        
        return guide_content
    
    @staticmethod
    def _get_current_timestamp() -> str:
        """Get current timestamp in readable format"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
