"""GitHub API service for fetching repository metadata"""

import os
import re
import httpx
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class GitHubRepoMetadata:
    """GitHub repository metadata"""
    stars: int = 0
    forks: int = 0
    watchers: int = 0
    language: Optional[str] = None
    languages: Dict[str, int] = None
    topics: list = None
    description: Optional[str] = None
    license: Optional[str] = None
    archived: bool = False
    is_fork: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    pushed_at: Optional[str] = None
    open_issues: int = 0
    default_branch: str = "main"

    def __post_init__(self):
        if self.languages is None:
            self.languages = {}
        if self.topics is None:
            self.topics = []


class GitHubService:
    """Service for interacting with GitHub API"""

    BASE_URL = "https://api.github.com"
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

    @classmethod
    def _get_headers(cls) -> Dict[str, str]:
        """Get headers for GitHub API requests"""
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "RepoDeployer/2.0"
        }
        if cls.GITHUB_TOKEN:
            headers["Authorization"] = f"token {cls.GITHUB_TOKEN}"
        return headers

    @classmethod
    def parse_github_url(cls, url: str) -> Optional[tuple]:
        """
        Parse a GitHub URL to extract owner and repo name.
        Returns (owner, repo) tuple or None if not a valid GitHub URL.
        """
        patterns = [
            r"github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$",
            r"github\.com:([^/]+)/([^/]+?)(?:\.git)?$",
        ]

        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                owner, repo = match.groups()
                # Clean up repo name (remove .git if present)
                repo = repo.rstrip('.git')
                return (owner, repo)

        return None

    @classmethod
    async def fetch_repo_metadata(cls, url: str) -> Optional[GitHubRepoMetadata]:
        """
        Fetch repository metadata from GitHub API.
        Returns GitHubRepoMetadata or None if fetch fails.
        """
        parsed = cls.parse_github_url(url)
        if not parsed:
            return None

        owner, repo = parsed

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Fetch main repo data
                response = await client.get(
                    f"{cls.BASE_URL}/repos/{owner}/{repo}",
                    headers=cls._get_headers()
                )

                if response.status_code != 200:
                    print(f"GitHub API error: {response.status_code} for {owner}/{repo}")
                    return None

                data = response.json()

                # Fetch languages
                languages = {}
                try:
                    lang_response = await client.get(
                        f"{cls.BASE_URL}/repos/{owner}/{repo}/languages",
                        headers=cls._get_headers()
                    )
                    if lang_response.status_code == 200:
                        languages = lang_response.json()
                except Exception:
                    pass

                return GitHubRepoMetadata(
                    stars=data.get("stargazers_count", 0),
                    forks=data.get("forks_count", 0),
                    watchers=data.get("watchers_count", 0),
                    language=data.get("language"),
                    languages=languages,
                    topics=data.get("topics", []),
                    description=data.get("description"),
                    license=data.get("license", {}).get("spdx_id") if data.get("license") else None,
                    archived=data.get("archived", False),
                    is_fork=data.get("fork", False),
                    created_at=data.get("created_at"),
                    updated_at=data.get("updated_at"),
                    pushed_at=data.get("pushed_at"),
                    open_issues=data.get("open_issues_count", 0),
                    default_branch=data.get("default_branch", "main")
                )

        except httpx.TimeoutException:
            print(f"GitHub API timeout for {owner}/{repo}")
            return None
        except Exception as e:
            print(f"GitHub API error: {e}")
            return None

    @classmethod
    async def check_repo_exists(cls, url: str) -> bool:
        """Check if a GitHub repository exists and is accessible"""
        parsed = cls.parse_github_url(url)
        if not parsed:
            return False

        owner, repo = parsed

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.head(
                    f"{cls.BASE_URL}/repos/{owner}/{repo}",
                    headers=cls._get_headers()
                )
                return response.status_code == 200
        except Exception:
            return False

    @classmethod
    def suggest_category_from_metadata(cls, metadata: GitHubRepoMetadata) -> str:
        """
        Suggest a category based on GitHub metadata.
        Uses topics, language, and description to determine category.
        """
        # Topic-based categorization (highest priority)
        topic_categories = {
            "security": ["security", "cybersecurity", "penetration-testing", "hacking", "ctf", "vulnerability", "exploit", "malware"],
            "ci_cd": ["ci", "cd", "cicd", "ci-cd", "continuous-integration", "continuous-deployment", "github-actions", "jenkins", "pipeline"],
            "devops": ["devops", "kubernetes", "k8s", "docker", "terraform", "ansible", "infrastructure", "cloud", "aws", "azure", "gcp"],
            "database": ["database", "sql", "nosql", "mongodb", "postgresql", "mysql", "redis", "elasticsearch"],
            "api": ["api", "rest", "graphql", "grpc", "openapi", "swagger"],
            "frontend": ["frontend", "react", "vue", "angular", "svelte", "nextjs", "web", "ui", "css", "tailwind"],
            "backend": ["backend", "server", "fastapi", "django", "flask", "express", "nodejs", "golang", "rust"],
            "ml_ai": ["machine-learning", "ml", "ai", "deep-learning", "tensorflow", "pytorch", "nlp", "computer-vision", "data-science"],
            "embedded": ["embedded", "iot", "esp32", "arduino", "raspberry-pi", "microcontroller", "firmware"],
            "mobile": ["mobile", "android", "ios", "flutter", "react-native", "swift", "kotlin"],
            "documentation": ["documentation", "docs", "tutorial", "learning", "education", "course"],
            "tools": ["tools", "cli", "utility", "automation", "scripts", "productivity"],
            "library": ["library", "package", "sdk", "framework", "module"],
        }

        if metadata.topics:
            for category, keywords in topic_categories.items():
                for topic in metadata.topics:
                    if topic.lower() in keywords:
                        return category

        # Language-based categorization (secondary)
        language_categories = {
            "frontend": ["JavaScript", "TypeScript", "CSS", "HTML", "Vue", "Svelte"],
            "backend": ["Python", "Go", "Rust", "Java", "C#", "Ruby", "PHP"],
            "embedded": ["C", "C++", "Assembly"],
            "mobile": ["Swift", "Kotlin", "Dart", "Objective-C"],
            "ml_ai": ["Jupyter Notebook", "R"],
            "devops": ["HCL", "Dockerfile", "Shell"],
        }

        if metadata.language:
            for category, languages in language_categories.items():
                if metadata.language in languages:
                    return category

        # Description-based categorization (fallback)
        if metadata.description:
            desc_lower = metadata.description.lower()
            for category, keywords in topic_categories.items():
                for keyword in keywords:
                    if keyword in desc_lower:
                        return category

        return "other"


# Sync wrapper for non-async contexts
def fetch_repo_metadata_sync(url: str) -> Optional[GitHubRepoMetadata]:
    """Synchronous wrapper for fetch_repo_metadata"""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(GitHubService.fetch_repo_metadata(url))
