"""Bookmark parsing and GitHub URL extraction"""

from html.parser import HTMLParser
from typing import List, Dict, Optional, Tuple
import re
import os
import asyncio
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse


def clean_url(url: str) -> str:
    """Remove tracking parameters from URLs"""
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        
        # Remove tracking parameters
        tracking_params = ['fbclid', 'gclid', 'msclkid', 'utm_source', 'utm_medium', 
                          'utm_campaign', 'utm_content', 'utm_term']
        
        # Remove parameters starting with 'aem_'
        filtered_params = {k: v for k, v in params.items() 
                          if k not in tracking_params and not k.startswith('aem_')}
        
        # Rebuild URL
        new_query = urlencode(filtered_params, doseq=True)
        new_parsed = parsed._replace(query=new_query)
        return urlunparse(new_parsed)
    except Exception:
        return url


class BookmarkParser(HTMLParser):
    """Parse Netscape-format bookmark files"""
    
    def __init__(self):
        super().__init__()
        self.bookmarks = []
        self.current_href = None
        self.current_title_text = ""
        self.in_anchor = False
    
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.in_anchor = True
            for attr, value in attrs:
                if attr == 'href':
                    self.current_href = value
    
    def handle_endtag(self, tag):
        if tag == 'a' and self.in_anchor:
            if self.current_href:
                self.bookmarks.append({
                    'url': self.current_href,
                    'title': self.current_title_text.strip() or self.current_href
                })
            self.current_href = None
            self.current_title_text = ""
            self.in_anchor = False
    
    def handle_data(self, data):
        if self.in_anchor:
            self.current_title_text += data


def parse_html_bookmarks(html_content: str) -> List[Dict[str, str]]:
    """Parse HTML bookmark file"""
    parser = BookmarkParser()
    try:
        parser.feed(html_content)
        return parser.bookmarks
    except Exception as e:
        print(f"Error parsing bookmarks: {e}")
        return []


def filter_github_urls(bookmarks: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Filter bookmarks to only GitHub URLs and clean them"""
    github_bookmarks = []
    for bookmark in bookmarks:
        if 'github.com' in bookmark['url'].lower():
            # Clean the URL to remove tracking parameters and normalize
            cleaned_url = clean_url(bookmark['url'])
            normalized_url = normalize_github_url(cleaned_url)
            
            # Only add if it's a valid github.com/owner/repo URL
            if normalized_url:
                github_bookmarks.append({
                    'url': normalized_url,
                    'title': bookmark['title']
                })
    return github_bookmarks


def normalize_github_url(url: str) -> str:
    """Extract and normalize GitHub URL to github.com/owner/repo format"""
    try:
        # Remove query parameters
        url = url.split('?')[0]
        
        # Parse the URL
        parsed = urlparse(url)
        
        # Extract path components
        parts = [p for p in parsed.path.split('/') if p]
        
        # Should have at least owner and repo
        if len(parts) < 2:
            return None
        
        # Only take the first two parts (owner/repo)
        # Ignore /tree/branch, /blob/file, /releases, /pull, etc.
        owner = parts[0]
        repo = parts[1]
        
        # Validate owner and repo names
        # GitHub usernames/org names: alphanumeric with hyphens, underscores, no leading/trailing hyphens
        # Repo names: alphanumeric with hyphens, underscores, dots, no leading/trailing special chars
        owner_pattern = r'^[a-zA-Z0-9_-]+$'
        repo_pattern = r'^[a-zA-Z0-9_.-]+$'
        
        if not re.match(owner_pattern, owner) or not re.match(repo_pattern, repo):
            return None
        
        # Ensure owner/repo don't start or end with special characters
        if owner[0] in '-_' or owner[-1] in '-_':
            return None
        if repo[0] in '-_.' or repo[-1] in '-_.':
            return None
        
        # Reconstruct URL without branch/blob info
        normalized = f"https://github.com/{owner}/{repo}"
        return normalized
    except Exception:
        return None


def categorize_url(url: str, title: str) -> str:
    """Intelligently categorize repository"""
    
    # Convert to lowercase for matching
    url_lower = url.lower()
    title_lower = title.lower()
    combined = f"{url_lower} {title_lower}"
    
    # Category keywords
    categories = {
        "security": ["security", "crypto", "encryption", "ssl", "tls", "auth", "oauth", "jwt", "password", "vault"],
        "ci_cd": ["ci", "cd", "jenkins", "gitlab", "github", "actions", "pipeline", "workflow", "deploy"],
        "database": ["database", "sql", "nosql", "mysql", "postgres", "mongodb", "redis", "cassandra", "elasticsearch"],
        "devops": ["devops", "docker", "kubernetes", "k8s", "terraform", "ansible", "prometheus", "grafana"],
        "api": ["api", "rest", "graphql", "grpc", "swagger", "openapi", "endpoint"],
        "frontend": ["frontend", "react", "vue", "angular", "javascript", "typescript", "html", "css", "ui", "ux"],
        "backend": ["backend", "python", "java", "node", "golang", "rust", "dotnet", "spring", "django"],
        "ml_ai": ["machine learning", "ml", "ai", "tensorflow", "pytorch", "scikit", "neural", "model", "deep learning"],
        "embedded": ["embedded", "arduino", "iot", "firmware", "microcontroller", "rtos"],
        "documentation": ["docs", "documentation", "guide", "tutorial", "blog"],
        "tools": ["tool", "utility", "cli", "command", "plugin", "extension"],
        "library": ["library", "lib", "framework", "package", "module"],
        "mobile": ["mobile", "ios", "android", "react-native", "flutter", "app"],
    }
    
    # Check for matches in priority order
    for category, keywords in categories.items():
        for keyword in keywords:
            if keyword in combined:
                return category
    
    # Fallback: try to extract from repo name pattern
    if "python" in url_lower or "-py" in url_lower:
        return "backend"
    elif "react" in url_lower or "-js" in url_lower:
        return "frontend"
    
    return "other"


# ─── Smart categorization helpers ─────────────────────────────────────────────

_CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "security": ["security", "crypto", "encryption", "ssl", "tls", "auth", "oauth", "jwt", "password", "vault", "cve", "pentest", "exploit", "malware", "firewall"],
    "ci_cd": ["ci", "cd", "jenkins", "github-actions", "gitlab-ci", "pipeline", "workflow", "deploy", "argo", "tekton", "circleci"],
    "database": ["database", "sql", "nosql", "mysql", "postgres", "mongodb", "redis", "cassandra", "elasticsearch", "sqlite", "orm", "migration", "query"],
    "devops": ["devops", "docker", "kubernetes", "k8s", "terraform", "ansible", "prometheus", "grafana", "helm", "infrastructure", "iac", "monitoring"],
    "api": ["api", "rest", "graphql", "grpc", "swagger", "openapi", "endpoint", "webhook", "rpc"],
    "frontend": ["frontend", "react", "vue", "angular", "svelte", "next.js", "nuxt", "javascript", "typescript", "html", "css", "ui", "ux", "design-system", "component"],
    "backend": ["backend", "python", "java", "node", "golang", "rust", "dotnet", "spring", "django", "fastapi", "flask", "express", "rails", "laravel"],
    "ml_ai": ["machine learning", "ml", "ai", "tensorflow", "pytorch", "scikit", "neural", "model", "deep learning", "llm", "gpt", "nlp", "computer vision", "transformer"],
    "embedded": ["embedded", "arduino", "iot", "firmware", "microcontroller", "rtos", "esp32", "raspberry", "fpga"],
    "documentation": ["docs", "documentation", "guide", "tutorial", "blog", "wiki", "handbook", "awesome-list", "cheatsheet"],
    "tools": ["tool", "utility", "cli", "command-line", "plugin", "extension", "automation", "script", "generator"],
    "library": ["library", "lib", "framework", "package", "module", "sdk", "binding"],
    "mobile": ["mobile", "ios", "android", "react-native", "flutter", "swift", "kotlin", "xamarin"],
}


def _score_text_for_category(text: str) -> Tuple[str, int]:
    """Return (best_category, score) for a blob of text."""
    text_lower = text.lower()
    best_cat = "other"
    best_score = 0
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > best_score:
            best_score = score
            best_cat = cat
    return best_cat, best_score


async def _stealth_fetch_github_meta(owner: str, repo: str) -> Optional[Dict[str, str]]:
    """
    Silently fetch the public GitHub repository page and extract:
    description, topics, primary language — no headless browser required.
    Returns a dict with keys: description, topics (str), language, or None on failure.
    """
    try:
        import httpx
        url = f"https://github.com/{owner}/{repo}"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        }
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                return None
            html = response.text
    except Exception:
        return None

    meta: Dict[str, str] = {}

    # Description — og:description or <p class="f4 my-3">
    og_match = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', html)
    if og_match:
        meta["description"] = og_match.group(1).strip()

    # Primary language
    lang_match = re.search(
        r'itemprop="programmingLanguage"[^>]*>([^<]+)<', html
    ) or re.search(r'<span[^>]*class="[^"]*color-fg-default[^"]*"[^>]*>([^<]+)</span>\s*<span[^>]*>\d+\.\d+%', html)
    if lang_match:
        meta["language"] = lang_match.group(1).strip()

    # Topics (badge links: /topics/xxx)
    topics = re.findall(r'/topics/([a-z0-9\-]+)', html)
    if topics:
        meta["topics"] = " ".join(dict.fromkeys(topics))  # deduplicate, preserve order

    return meta if meta else None


async def _fetch_github_api_meta(url: str, github_token: str) -> Optional[Dict[str, any]]:
    """
    Fetch repository metadata from GitHub API using a personal token.
    Returns a dict with keys: description, topics, language, or None on failure.
    """
    try:
        import httpx
        import re
        
        # Parse owner/repo from URL
        pattern = r"github\.com/([^/]+)/([^/]+?)(?:\.git|/.*)?$"
        match = re.search(pattern, url)
        if not match:
            return None
        
        owner, repo = match.groups()
        repo = repo.rstrip('.git')
        
        api_url = f"https://api.github.com/repos/{owner}/{repo}"
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "RepoDeployer/2.0"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(api_url, headers=headers)
            if response.status_code != 200:
                return None
            
            data = response.json()
            
        meta: Dict[str, any] = {
            "description": data.get("description", ""),
            "topics": data.get("topics", []),
            "language": data.get("language", ""),
        }
        return meta if any(meta.values()) else None
    except Exception:
        return None


async def smart_categorize(
    url: str,
    title: str = "",
    *,
    github_token: Optional[str] = None,
    existing_category: Optional[str] = None,
    language: Optional[str] = None,
    topics: Optional[List[str]] = None,
    description: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Determine the best category for a repository using a four-level fallback chain.

    1. If github_token is provided: fetch metadata from GitHub API
    2. If `topics` / `language` / `description` are already available (from GitHub API),
       score them directly — no extra network call needed.
    3. Attempt a stealth HTML fetch of the public GitHub page (no auth required)
    4. Fall back to URL/title pattern heuristics.

    Returns (category, method) where method is one of:
        "api_token" | "api_metadata" | "stealth_fetch" | "url_heuristics"
    """
    # --- Level 0: GitHub API with user-provided token ---
    if github_token:
        api_meta = await _fetch_github_api_meta(url, github_token)
        if api_meta:
            combined = " ".join(filter(None, [
                " ".join(api_meta.get("topics", [])) if isinstance(api_meta.get("topics"), list) else api_meta.get("topics", ""),
                api_meta.get("language", ""),
                api_meta.get("description", ""),
                title,
            ]))
            cat, score = _score_text_for_category(combined)
            if score > 0:
                return cat, "api_token"

    # --- Level 1: use already-fetched API metadata if rich enough ---
    if topics or language or description:
        combined = " ".join(filter(None, [
            " ".join(topics or []),
            language or "",
            description or "",
            title,
        ]))
        cat, score = _score_text_for_category(combined)
        if score > 0:
            return cat, "api_metadata"
        # fall through if score == 0

    # --- Level 2: stealth fetch ---
    parsed_url = urlparse(url)
    parts = [p for p in parsed_url.path.split("/") if p]
    if len(parts) >= 2:
        owner, repo_name = parts[0], parts[1]
        meta = await _stealth_fetch_github_meta(owner, repo_name)
        if meta:
            combined = " ".join(filter(None, [
                meta.get("topics", ""),
                meta.get("language", ""),
                meta.get("description", ""),
                title,
            ]))
            cat, score = _score_text_for_category(combined)
            if score > 0:
                return cat, "stealth_fetch"

    # --- Level 3: URL / title heuristics ---
    heuristic_cat = categorize_url(url, title)
    return heuristic_cat, "url_heuristics"

