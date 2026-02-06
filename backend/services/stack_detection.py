"""Stack detection service for automatic programming language/framework detection"""

import os
import json
import re
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)


class StackDetectionResult:
    """Result of stack detection"""
    
    def __init__(
        self,
        stack: str,
        confidence_score: int = 0,
        detected_files: list[str] = None,
        requires_db: bool = False,
        internal_port: int = 3000,
        build_command: str = None,
        run_command: str = None,
        framework: str = None,
        detected_version: str = None
    ):
        self.stack = stack
        self.confidence_score = min(100, max(0, confidence_score))  # Clamp 0-100
        self.detected_files = detected_files or []
        self.requires_db = requires_db
        self.internal_port = internal_port
        self.build_command = build_command
        self.run_command = run_command
        self.framework = framework
        self.detected_version = detected_version
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "stack": self.stack,
            "confidence_score": self.confidence_score,
            "detected_files": self.detected_files,
            "requires_db": self.requires_db,
            "internal_port": self.internal_port,
            "build_command": self.build_command,
            "run_command": self.run_command,
            "framework": self.framework,
            "detected_version": self.detected_version
        }
    
    def __repr__(self) -> str:
        return f"<StackDetection {self.stack} ({self.confidence_score}% confidence)>"


class StackDetector:
    """Detects programming language/framework from repository structure"""
    
    # File patterns for each stack
    STACK_PATTERNS = {
        "node": {
            "files": ["package.json"],
            "detect_methods": ["package_json"],
            "keywords": ["node", "npm", "yarn", "webpack", "express"],
            "requires_db": True,
            "internal_port": 3000,
            "default_run": "npm start",
            "default_build": "npm install"
        },
        "python": {
            "files": ["requirements.txt", "setup.py", "poetry.lock", "Pipfile"],
            "detect_methods": ["requirements_txt", "setup_py"],
            "keywords": ["flask", "django", "fastapi", "python"],
            "requires_db": True,
            "internal_port": 8000,
            "default_run": "python main.py",
            "default_build": "pip install -r requirements.txt"
        },
        "php": {
            "files": ["composer.json", "index.php"],
            "detect_methods": ["composer_json"],
            "keywords": ["laravel", "symfony", "wordpress", "php"],
            "requires_db": True,
            "internal_port": 8000,
            "default_run": "php -S localhost:8000",
            "default_build": "composer install"
        },
        "go": {
            "files": ["go.mod", "go.sum", "main.go"],
            "detect_methods": ["go_mod"],
            "keywords": ["go", "golang", "gin", "echo"],
            "requires_db": True,
            "internal_port": 8080,
            "default_run": "go run main.go",
            "default_build": "go build"
        },
        "ruby": {
            "files": ["Gemfile", "Gemfile.lock"],
            "detect_methods": ["gemfile"],
            "keywords": ["rails", "ruby", "sinatra"],
            "requires_db": True,
            "internal_port": 3000,
            "default_run": "rails server",
            "default_build": "bundle install"
        },
        "java": {
            "files": ["pom.xml", "build.gradle", "mvnw"],
            "detect_methods": ["maven_pom", "gradle_build"],
            "keywords": ["java", "spring", "maven", "gradle"],
            "requires_db": True,
            "internal_port": 8080,
            "default_run": "java -jar app.jar",
            "default_build": "mvn clean package"
        },
        "csharp": {
            "files": ["*.csproj", "*.sln"],
            "detect_methods": ["csproj"],
            "keywords": ["csharp", "dotnet", "aspnet", "entity-framework"],
            "requires_db": True,
            "internal_port": 5000,
            "default_run": "dotnet run",
            "default_build": "dotnet build"
        },
        "rust": {
            "files": ["Cargo.toml", "Cargo.lock"],
            "detect_methods": ["cargo_toml"],
            "keywords": ["rust", "cargo", "actix", "rocket"],
            "requires_db": False,
            "internal_port": 8080,
            "default_run": "cargo run",
            "default_build": "cargo build --release"
        },
        "static": {
            "files": ["index.html", "index.htm"],
            "detect_methods": ["html_files"],
            "keywords": ["html", "css", "javascript", "react", "vue"],
            "requires_db": False,
            "internal_port": 3000,
            "default_run": "http-server",
            "default_build": "npm install"
        }
    }
    
    def __init__(self, repo_path: str):
        """Initialize detector with repository path"""
        self.repo_path = Path(repo_path)
        if not self.repo_path.exists():
            raise ValueError(f"Repository path does not exist: {repo_path}")
    
    def detect(self) -> StackDetectionResult:
        """Detect stack from repository structure"""
        try:
            # Check for Dockerfile first (highest confidence)
            dockerfile_result = self._detect_from_dockerfile()
            if dockerfile_result and dockerfile_result.confidence_score >= 90:
                return dockerfile_result
            
            # Check for language-specific files
            results = []
            
            # Node detection
            node_result = self._detect_node()
            if node_result:
                results.append(node_result)
            
            # Python detection
            python_result = self._detect_python()
            if python_result:
                results.append(python_result)
            
            # PHP detection
            php_result = self._detect_php()
            if php_result:
                results.append(php_result)
            
            # Go detection
            go_result = self._detect_go()
            if go_result:
                results.append(go_result)
            
            # Ruby detection
            ruby_result = self._detect_ruby()
            if ruby_result:
                results.append(ruby_result)
            
            # Java detection
            java_result = self._detect_java()
            if java_result:
                results.append(java_result)
            
            # C# detection
            csharp_result = self._detect_csharp()
            if csharp_result:
                results.append(csharp_result)
            
            # Rust detection
            rust_result = self._detect_rust()
            if rust_result:
                results.append(rust_result)
            
            # Static site detection (lowest priority)
            if not results:
                static_result = self._detect_static()
                if static_result:
                    results.append(static_result)
            
            # Return best match or unknown
            if results:
                # Sort by confidence score descending
                results.sort(key=lambda x: x.confidence_score, reverse=True)
                return results[0]
            
            # If Dockerfile exists but couldn't parse it, return it anyway
            if dockerfile_result:
                return dockerfile_result
            
            # Default to unknown
            return StackDetectionResult(
                stack="unknown",
                confidence_score=0,
                internal_port=3000
            )
        
        except Exception as e:
            logger.error(f"Error detecting stack for {self.repo_path}: {e}")
            return StackDetectionResult(
                stack="unknown",
                confidence_score=0,
                internal_port=3000
            )
    
    def _detect_from_dockerfile(self) -> Optional[StackDetectionResult]:
        """Detect stack from existing Dockerfile"""
        dockerfile_path = self.repo_path / "Dockerfile"
        if not dockerfile_path.exists():
            return None
        
        try:
            content = dockerfile_path.read_text(encoding='utf-8', errors='ignore')
            base_image = ""
            
            # Find FROM instruction
            for line in content.split('\n'):
                if line.strip().startswith('FROM'):
                    base_image = line.lower()
                    break
            
            stack = "unknown"
            confidence = 85
            framework = None
            
            if 'node' in base_image or 'npm' in base_image:
                stack = "node"
                framework = self._extract_node_framework(content)
            elif 'python' in base_image:
                stack = "python"
                framework = self._extract_python_framework(content)
            elif 'php' in base_image:
                stack = "php"
                framework = "PHP"
            elif 'golang' in base_image or 'go:' in base_image:
                stack = "go"
                framework = "Go"
            elif 'ruby' in base_image:
                stack = "ruby"
                framework = "Ruby"
            elif 'java' in base_image:
                stack = "java"
                framework = "Java"
            elif 'rust' in base_image:
                stack = "rust"
                framework = "Rust"
            elif 'nginx' in base_image or 'httpd' in base_image:
                stack = "static"
                framework = "Web Server"
                confidence = 75
            else:
                confidence = 50
            
            if stack != "unknown":
                config = self.STACK_PATTERNS.get(stack, {})
                return StackDetectionResult(
                    stack=stack,
                    confidence_score=confidence,
                    detected_files=["Dockerfile"],
                    requires_db=config.get("requires_db", False),
                    internal_port=config.get("internal_port", 3000),
                    framework=framework
                )
        
        except Exception as e:
            logger.warning(f"Error reading Dockerfile: {e}")
        
        return None
    
    def _detect_node(self) -> Optional[StackDetectionResult]:
        """Detect Node.js project"""
        package_json_path = self.repo_path / "package.json"
        if not package_json_path.exists():
            return None
        
        try:
            with open(package_json_path) as f:
                package_json = json.load(f)
            
            detected_files = ["package.json"]
            framework = None
            confidence = 70
            requires_db = False
            
            # Extract dependencies
            deps = package_json.get("dependencies", {})
            dev_deps = package_json.get("devDependencies", {})
            all_deps = {**deps, **dev_deps}
            
            # Detect framework
            if "express" in all_deps:
                framework = "Express"
                confidence = 90
                requires_db = True
            elif "react" in all_deps or "react-dom" in all_deps:
                framework = "React"
                confidence = 90
            elif "vue" in all_deps:
                framework = "Vue"
                confidence = 90
            elif "next" in all_deps:
                framework = "Next.js"
                confidence = 90
                requires_db = True
            elif "nuxt" in all_deps:
                framework = "Nuxt"
                confidence = 90
                requires_db = True
            elif "nestjs" in all_deps or "@nestjs/core" in all_deps:
                framework = "NestJS"
                confidence = 90
                requires_db = True
            elif "gatsby" in all_deps:
                framework = "Gatsby"
                confidence = 85
            elif "svelte" in all_deps:
                framework = "Svelte"
                confidence = 85
            elif "fastify" in all_deps:
                framework = "Fastify"
                confidence = 90
                requires_db = True
            elif "hapi" in all_deps:
                framework = "Hapi"
                confidence = 85
                requires_db = True
            else:
                framework = "Node.js"
                confidence = 75
            
            # Check for package-lock.json or yarn.lock
            if (self.repo_path / "package-lock.json").exists():
                detected_files.append("package-lock.json")
            if (self.repo_path / "yarn.lock").exists():
                detected_files.append("yarn.lock")
            
            config = self.STACK_PATTERNS["node"]
            return StackDetectionResult(
                stack="node",
                confidence_score=confidence,
                detected_files=detected_files,
                requires_db=requires_db,
                internal_port=config["internal_port"],
                build_command="npm install",
                run_command="npm start",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting Node: {e}")
        
        return None
    
    def _detect_python(self) -> Optional[StackDetectionResult]:
        """Detect Python project"""
        detected_files = []
        
        if (self.repo_path / "requirements.txt").exists():
            detected_files.append("requirements.txt")
        if (self.repo_path / "setup.py").exists():
            detected_files.append("setup.py")
        if (self.repo_path / "poetry.lock").exists():
            detected_files.append("poetry.lock")
        if (self.repo_path / "Pipfile").exists():
            detected_files.append("Pipfile")
        
        if not detected_files:
            return None
        
        try:
            framework = "Python"
            confidence = 70 + (len(detected_files) * 5)  # Boost confidence for multiple markers
            requires_db = False
            
            # Check requirements.txt for framework
            req_file = self.repo_path / "requirements.txt"
            if req_file.exists():
                content = req_file.read_text(encoding='utf-8', errors='ignore').lower()
                
                if "django" in content:
                    framework = "Django"
                    confidence = 95
                    requires_db = True
                elif "flask" in content:
                    framework = "Flask"
                    confidence = 90
                    requires_db = True
                elif "fastapi" in content:
                    framework = "FastAPI"
                    confidence = 90
                    requires_db = True
                elif "pyramid" in content:
                    framework = "Pyramid"
                    confidence = 85
                    requires_db = True
                elif "tornado" in content:
                    framework = "Tornado"
                    confidence = 85
                    requires_db = True
            
            # Check setup.py
            setup_file = self.repo_path / "setup.py"
            if setup_file.exists() and not framework.endswith("Framework"):
                content = setup_file.read_text(encoding='utf-8', errors='ignore').lower()
                if "flask" in content or "django" in content or "fastapi" in content:
                    confidence = min(95, confidence + 5)
            
            config = self.STACK_PATTERNS["python"]
            return StackDetectionResult(
                stack="python",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=requires_db,
                internal_port=config["internal_port"],
                build_command="pip install -r requirements.txt",
                run_command="python main.py",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting Python: {e}")
        
        return None
    
    def _detect_php(self) -> Optional[StackDetectionResult]:
        """Detect PHP project"""
        detected_files = []
        
        if (self.repo_path / "composer.json").exists():
            detected_files.append("composer.json")
        
        # Also look for PHP files
        php_files = list(self.repo_path.glob("*.php"))
        if php_files:
            detected_files.extend([f.name for f in php_files[:3]])  # Include first 3 PHP files
        
        if not detected_files:
            return None
        
        try:
            framework = "PHP"
            confidence = 70 + (len(detected_files) * 5)
            
            # Check composer.json
            composer_file = self.repo_path / "composer.json"
            if composer_file.exists():
                content = composer_file.read_text(encoding='utf-8', errors='ignore').lower()
                
                if "laravel" in content:
                    framework = "Laravel"
                    confidence = 95
                elif "symfony" in content:
                    framework = "Symfony"
                    confidence = 90
                elif "wordpress" in content or "woocommerce" in content:
                    framework = "WordPress"
                    confidence = 90
                elif "drupal" in content:
                    framework = "Drupal"
                    confidence = 90
                elif "slim" in content:
                    framework = "Slim"
                    confidence = 85
            
            config = self.STACK_PATTERNS["php"]
            return StackDetectionResult(
                stack="php",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=True,
                internal_port=config["internal_port"],
                build_command="composer install",
                run_command="php -S localhost:8000",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting PHP: {e}")
        
        return None
    
    def _detect_go(self) -> Optional[StackDetectionResult]:
        """Detect Go project"""
        detected_files = []
        
        if (self.repo_path / "go.mod").exists():
            detected_files.append("go.mod")
        if (self.repo_path / "go.sum").exists():
            detected_files.append("go.sum")
        
        go_files = list(self.repo_path.glob("*.go"))
        if go_files:
            detected_files.extend([f.name for f in go_files[:3]])
        
        if not detected_files:
            return None
        
        try:
            framework = "Go"
            confidence = 75 + (len(detected_files) * 5)
            
            # Check go.mod
            go_mod = self.repo_path / "go.mod"
            if go_mod.exists():
                content = go_mod.read_text(encoding='utf-8', errors='ignore').lower()
                
                if "gin" in content:
                    framework = "Gin"
                    confidence = 90
                elif "echo" in content:
                    framework = "Echo"
                    confidence = 90
                elif "chi" in content:
                    framework = "Chi"
                    confidence = 85
            
            config = self.STACK_PATTERNS["go"]
            return StackDetectionResult(
                stack="go",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=True,
                internal_port=config["internal_port"],
                build_command="go build",
                run_command="go run main.go",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting Go: {e}")
        
        return None
    
    def _detect_ruby(self) -> Optional[StackDetectionResult]:
        """Detect Ruby project"""
        detected_files = []
        
        if (self.repo_path / "Gemfile").exists():
            detected_files.append("Gemfile")
        if (self.repo_path / "Gemfile.lock").exists():
            detected_files.append("Gemfile.lock")
        
        rb_files = list(self.repo_path.glob("*.rb"))
        if rb_files:
            detected_files.extend([f.name for f in rb_files[:3]])
        
        if not detected_files:
            return None
        
        try:
            framework = "Ruby"
            confidence = 75 + (len(detected_files) * 5)
            
            # Check Gemfile
            gemfile = self.repo_path / "Gemfile"
            if gemfile.exists():
                content = gemfile.read_text(encoding='utf-8', errors='ignore').lower()
                
                if "rails" in content:
                    framework = "Rails"
                    confidence = 95
                elif "sinatra" in content:
                    framework = "Sinatra"
                    confidence = 90
                elif "hanami" in content:
                    framework = "Hanami"
                    confidence = 85
            
            config = self.STACK_PATTERNS["ruby"]
            return StackDetectionResult(
                stack="ruby",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=True,
                internal_port=config["internal_port"],
                build_command="bundle install",
                run_command="rails server",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting Ruby: {e}")
        
        return None
    
    def _detect_java(self) -> Optional[StackDetectionResult]:
        """Detect Java project"""
        detected_files = []
        
        if (self.repo_path / "pom.xml").exists():
            detected_files.append("pom.xml")
        if (self.repo_path / "build.gradle").exists():
            detected_files.append("build.gradle")
        if (self.repo_path / "mvnw").exists():
            detected_files.append("mvnw")
        
        java_files = list(self.repo_path.glob("**/*.java"))
        if java_files:
            detected_files.append(f"{len(java_files)} .java files")
        
        if not detected_files:
            return None
        
        try:
            framework = "Java"
            confidence = 75 + (len(detected_files) * 5)
            
            # Check pom.xml
            pom = self.repo_path / "pom.xml"
            if pom.exists():
                content = pom.read_text(encoding='utf-8', errors='ignore').lower()
                
                if "spring-boot" in content:
                    framework = "Spring Boot"
                    confidence = 95
                elif "spring" in content:
                    framework = "Spring"
                    confidence = 90
                elif "quarkus" in content:
                    framework = "Quarkus"
                    confidence = 85
            
            config = self.STACK_PATTERNS["java"]
            return StackDetectionResult(
                stack="java",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=True,
                internal_port=config["internal_port"],
                build_command="mvn clean package",
                run_command="java -jar app.jar",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting Java: {e}")
        
        return None
    
    def _detect_csharp(self) -> Optional[StackDetectionResult]:
        """Detect C# / .NET project"""
        detected_files = []
        
        # Look for project files
        csproj_files = list(self.repo_path.glob("*.csproj"))
        sln_files = list(self.repo_path.glob("*.sln"))
        
        if csproj_files:
            detected_files.extend([f.name for f in csproj_files[:3]])
        if sln_files:
            detected_files.extend([f.name for f in sln_files[:1]])
        
        if not detected_files:
            return None
        
        try:
            framework = ".NET"
            confidence = 80 + (len(detected_files) * 5)
            
            # Check csproj content
            if csproj_files:
                content = csproj_files[0].read_text(encoding='utf-8', errors='ignore').lower()
                
                if "aspnetcore" in content:
                    framework = "ASP.NET Core"
                    confidence = 95
                elif "aspnet" in content:
                    framework = "ASP.NET"
                    confidence = 90
            
            config = self.STACK_PATTERNS["csharp"]
            return StackDetectionResult(
                stack="csharp",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=True,
                internal_port=config["internal_port"],
                build_command="dotnet build",
                run_command="dotnet run",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting C#: {e}")
        
        return None
    
    def _detect_rust(self) -> Optional[StackDetectionResult]:
        """Detect Rust project"""
        detected_files = []
        
        if (self.repo_path / "Cargo.toml").exists():
            detected_files.append("Cargo.toml")
        if (self.repo_path / "Cargo.lock").exists():
            detected_files.append("Cargo.lock")
        
        rs_files = list(self.repo_path.glob("**/*.rs"))
        if rs_files:
            detected_files.append(f"{len(rs_files)} .rs files")
        
        if not detected_files:
            return None
        
        try:
            framework = "Rust"
            confidence = 80 + (len(detected_files) * 5)
            
            # Check Cargo.toml
            cargo = self.repo_path / "Cargo.toml"
            if cargo.exists():
                content = cargo.read_text(encoding='utf-8', errors='ignore').lower()
                
                if "actix-web" in content:
                    framework = "Actix-web"
                    confidence = 95
                elif "rocket" in content:
                    framework = "Rocket"
                    confidence = 95
                elif "axum" in content:
                    framework = "Axum"
                    confidence = 90
                elif "warp" in content:
                    framework = "Warp"
                    confidence = 85
            
            config = self.STACK_PATTERNS["rust"]
            return StackDetectionResult(
                stack="rust",
                confidence_score=min(100, confidence),
                detected_files=detected_files,
                requires_db=False,
                internal_port=config["internal_port"],
                build_command="cargo build --release",
                run_command="cargo run",
                framework=framework
            )
        
        except Exception as e:
            logger.warning(f"Error detecting Rust: {e}")
        
        return None
    
    def _detect_static(self) -> Optional[StackDetectionResult]:
        """Detect static site (HTML/CSS/JS)"""
        detected_files = []
        
        if (self.repo_path / "index.html").exists():
            detected_files.append("index.html")
        if (self.repo_path / "index.htm").exists():
            detected_files.append("index.htm")
        
        html_files = list(self.repo_path.glob("*.html"))
        css_files = list(self.repo_path.glob("*.css"))
        
        if html_files:
            detected_files.extend([f.name for f in html_files[:3]])
        if css_files:
            detected_files.append(f"{len(css_files)} .css files")
        
        # Check for React/Vue/Angular in src/
        src_dir = self.repo_path / "src"
        if src_dir.exists():
            tsx_files = list(src_dir.glob("*.tsx")) or list(src_dir.glob("*.jsx"))
            if tsx_files:
                return None  # Let Node detection handle this
        
        if not detected_files:
            return None
        
        framework = "Static Site"
        confidence = 60 + (len(detected_files) * 3)
        
        config = self.STACK_PATTERNS["static"]
        return StackDetectionResult(
            stack="static",
            confidence_score=min(100, confidence),
            detected_files=detected_files,
            requires_db=False,
            internal_port=config["internal_port"],
            build_command=None,
            run_command=None,
            framework=framework
        )
    
    def _extract_node_framework(self, dockerfile_content: str) -> str:
        """Extract Node framework from Dockerfile"""
        content = dockerfile_content.lower()
        if "npm run build" in content or "next build" in content:
            return "Next.js"
        if "nuxt" in content:
            return "Nuxt"
        if "gatsby" in content:
            return "Gatsby"
        return "Node.js"
    
    def _extract_python_framework(self, dockerfile_content: str) -> str:
        """Extract Python framework from Dockerfile"""
        content = dockerfile_content.lower()
        if "django" in content:
            return "Django"
        if "flask" in content:
            return "Flask"
        if "fastapi" in content:
            return "FastAPI"
        return "Python"
