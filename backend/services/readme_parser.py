"""README file parser for repository metadata extraction"""

import re
from typing import Dict, Optional
import httpx


class ReadmeParser:
    """Parse README.md files to extract technology stack and category information"""
    
    TECH_STACK_PATTERNS = {
        "frontend": [
            r"react|vue|angular|svelte|next\.js|nuxt|express\s+view|ejs|pug|handlebars|jsx|tsx|typescript",
            r"html|css|sass|less|tailwind|bootstrap|material\s+design|bulma",
            r"webpack|vite|parcel|rollup|esbuild|turbopack",
        ],
        "backend": [
            r"django|flask|fastapi|aiohttp|tornado|bottle|cherrypy",
            r"express|nestjs|hapi|koa|fastify|next\.js",
            r"spring|spring\s+boot|grails|micronaut|quarkus",
            r"laravel|symfony|codeigniter|yii|zend|slim",
            r"rails|sinatra|hanami|dry-rb|trailblazer",
            r"echo|gin|chi|beego|iris",
            r"axum|actix|rocket|hyper|tower",
            r"fastapi|starlette|django|flask|pyramid",
        ],
        "database": [
            r"postgres|postgresql|mysql|mariadb|oracle|mssql|sql\s+server",
            r"mongodb|mysql|cassandra|couchdb|dynamodb|elasticsearch",
            r"redis|memcached|etcd|consul",
            r"firestore|realtime\s+database|airtable",
            r"supabase|hasura|fauna",
        ],
        "devops": [
            r"docker|kubernetes|k8s|helm|docker\-compose",
            r"terraform|ansible|chef|puppet|saltstack",
            r"prometheus|grafana|datadog|new\s+relic|splunk",
            r"jenkins|gitlab",
            r"circleci|travis|github\s+actions|gitlab\s+ci",
        ],
        "ml_ai": [
            r"tensorflow|pytorch|keras|scikit|numpy|pandas|scipy",
            r"huggingface|transformers|llama|openai|anthropic",
            r"machine\s+learning|deep\s+learning|neural\s+network",
            r"nlp|computer\s+vision|cv|gan|lstm|rnn",
        ],
        "mobile": [
            r"react\-native|flutter|swift|kotlin|xcode|android\s+studio",
            r"ios|android|iphone|native\s+mobile",
        ],
        "security": [
            r"security|encryption|crypto|ssl|tls|oauth|jwt|auth",
            r"owasp|penetration|pentest|vulnerability|exploit",
            r"security\s+audit|threat\s+model|zero\s+trust",
        ],
        "api": [
            r"rest|graphql|grpc|swagger|openapi",
            r"api|endpoint|webhook|rpc",
        ],
    }
    
    @staticmethod
    async def fetch_readme(owner: str, repo: str, github_token: Optional[str] = None) -> Optional[str]:
        """Fetch README.md from GitHub repository"""
        try:
            headers = {
                "Accept": "application/vnd.github.v3.raw",
                "User-Agent": "Repo-Deployer"
            }
            if github_token:
                headers["Authorization"] = f"token {github_token}"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try common README locations
                for readme_name in ["README.md", "README.rst", "README.txt", "README"]:
                    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{readme_name}"
                    response = await client.get(url, headers=headers)
                    
                    if response.status_code == 200:
                        return response.text
            
            return None
        except Exception as e:
            print(f"Error fetching README for {owner}/{repo}: {e}")
            return None
    
    @staticmethod
    def extract_tech_stack(readme_content: str) -> Dict[str, list]:
        """Extract technology stack from README content"""
        readme_lower = readme_content.lower()
        detected_tech = {}
        
        for category, patterns in ReadmeParser.TECH_STACK_PATTERNS.items():
            detected_tech[category] = []
            for pattern in patterns:
                matches = re.findall(pattern, readme_lower, re.IGNORECASE)
                if matches:
                    detected_tech[category].extend(set(matches))
        
        # Remove empty categories
        return {k: v for k, v in detected_tech.items() if v}
    
    @staticmethod
    def determine_best_category(readme_content: str, current_category: str) -> str:
        """Determine best category based on README content"""
        tech_stack = ReadmeParser.extract_tech_stack(readme_content)
        
        if not tech_stack:
            return current_category
        
        # Category hierarchy - more specific categories first
        category_mapping = {
            "frontend": "frontend",
            "backend": "backend",
            "database": "database",
            "devops": "devops",
            "ml_ai": "ml_ai",
            "mobile": "mobile",
            "security": "security",
            "api": "api",
        }
        
        # Return the first detected category (in order of specificity)
        for category in ["ml_ai", "mobile", "security", "devops", "frontend", "backend", "database", "api"]:
            if category in tech_stack:
                return category
        
        return current_category
    
    @staticmethod
    def extract_description(readme_content: str) -> Optional[str]:
        """Extract description from README (first paragraph)"""
        try:
            lines = readme_content.split('\n')
            for line in lines:
                # Skip headers and empty lines
                if line.strip() and not line.startswith('#'):
                    return line.strip()[:500]
            return None
        except Exception:
            return None
