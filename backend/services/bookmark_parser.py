"""Bookmark parsing and GitHub URL extraction"""

from html.parser import HTMLParser
from typing import List, Dict
import re
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
