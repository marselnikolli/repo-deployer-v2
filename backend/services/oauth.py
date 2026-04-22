"""OAuth2 authentication services for GitHub and Google"""

import os
import httpx
import secrets
from typing import Optional, Dict, Any, Tuple
from pydantic import BaseModel


class GitHubUser(BaseModel):
    """GitHub OAuth2 user data"""
    id: int
    login: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class GoogleUser(BaseModel):
    """Google OAuth2 user data"""
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None


class OAuth2Service:
    """OAuth2 provider integrations"""
    
    GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
    GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
    GITHUB_USER_URL = "https://api.github.com/user"
    
    GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
    GOOGLE_USER_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
    
    def __init__(self):
        """Initialize OAuth2 service with credentials from environment"""
        self.github_client_id = os.getenv("GITHUB_OAUTH_CLIENT_ID", "")
        self.github_client_secret = os.getenv("GITHUB_OAUTH_CLIENT_SECRET", "")
        self.github_redirect_uri = os.getenv("GITHUB_OAUTH_REDIRECT_URI", "http://localhost:3000/auth/github/callback")
        
        self.google_client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
        self.google_client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
        self.google_redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:3000/auth/google/callback")
        
        # In-memory state storage (use Redis in production)
        self._state_store: Dict[str, str] = {}
    
    async def get_github_user(self, access_token: str) -> Optional[GitHubUser]:
        """Get GitHub user data using access token"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.GITHUB_USER_URL,
                    headers={
                        "Authorization": f"token {access_token}",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return GitHubUser(
                        id=data.get("id"),
                        login=data.get("login"),
                        email=data.get("email"),
                        name=data.get("name"),
                        avatar_url=data.get("avatar_url")
                    )
        except Exception as e:
            print(f"Error fetching GitHub user: {e}")
        
        return None
    
    async def exchange_github_code(self, code: str) -> Optional[str]:
        """Exchange GitHub authorization code for access token"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.GITHUB_TOKEN_URL,
                    data={
                        "client_id": self.github_client_id,
                        "client_secret": self.github_client_secret,
                        "code": code,
                        "redirect_uri": self.github_redirect_uri
                    },
                    headers={"Accept": "application/json"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get("access_token")
        except Exception as e:
            print(f"Error exchanging GitHub code: {e}")
        
        return None
    
    async def get_google_user(self, access_token: str) -> Optional[GoogleUser]:
        """Get Google user data using access token"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.GOOGLE_USER_URL,
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return GoogleUser(
                        id=data.get("id"),
                        email=data.get("email"),
                        name=data.get("name"),
                        picture=data.get("picture")
                    )
        except Exception as e:
            print(f"Error fetching Google user: {e}")
        
        return None
    
    async def exchange_google_code(self, code: str) -> Optional[str]:
        """Exchange Google authorization code for access token"""
        import logging
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.DEBUG)  # Ensure debug level
        
        try:
            logger.info(f"=== GOOGLE OAUTH CODE EXCHANGE START ===")
            logger.info(f"Redirect URI configured: {self.google_redirect_uri}")
            
            async with httpx.AsyncClient() as client:
                logger.info(f"Posting to Google token endpoint: {self.GOOGLE_TOKEN_URL}")
                response = await client.post(
                    self.GOOGLE_TOKEN_URL,
                    data={
                        "client_id": self.google_client_id,
                        "client_secret": self.google_client_secret,
                        "code": code,
                        "grant_type": "authorization_code",
                        "redirect_uri": self.google_redirect_uri
                    }
                )
                
                logger.info(f"Google response status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info("✓ Successfully exchanged Google code for access token")
                    return data.get("access_token")
                else:
                    try:
                        error_json = response.json()
                        error_msg = str(error_json)
                    except:
                        error_msg = response.text
                    
                    logger.error(f"✗ Google token exchange FAILED - Status: {response.status_code}")
                    logger.error(f"Google error response: {error_msg}")
        except Exception as e:
            logger.error(f"✗ Exception during Google code exchange: {str(e)}", exc_info=True)
        
        logger.info(f"=== GOOGLE OAUTH CODE EXCHANGE END ===")
        return None
    
    def generate_state(self, provider: str) -> str:
        """
        Generate and store a state parameter for CSRF protection.
        
        In production, this should use Redis or a session store with TTL.
        
        Args:
            provider: 'github' or 'google'
            
        Returns:
            Generated state parameter
        """
        state = secrets.token_urlsafe(32)
        # Store state with provider prefix (e.g., 'github:state_value')
        self._state_store[state] = provider
        return state
    
    def validate_state(self, state: str, provider: str) -> bool:
        """
        Validate state parameter to prevent CSRF attacks.
        
        Args:
            state: State parameter from OAuth callback
            provider: Expected provider ('github' or 'google')
            
        Returns:
            True if state is valid, False otherwise
        """
        if state not in self._state_store:
            return False
        
        stored_provider = self._state_store.pop(state)  # Remove after validation
        return stored_provider == provider
    
    def get_github_auth_url(self, state: Optional[str] = None) -> str:
        """
        Get GitHub OAuth2 authorization URL.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            GitHub authorization URL
        """
        scope = "user:email"
        url = (
            f"{self.GITHUB_AUTH_URL}?"
            f"client_id={self.github_client_id}&"
            f"redirect_uri={self.github_redirect_uri}&"
            f"scope={scope}&"
            f"allow_signup=true"
        )
        
        if state:
            url += f"&state={state}"
        
        return url
    
    def get_google_auth_url(self, state: Optional[str] = None) -> str:
        """
        Get Google OAuth2 authorization URL.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Google authorization URL
        """
        scope = "openid email profile"
        url = (
            f"{self.GOOGLE_AUTH_URL}?"
            f"client_id={self.google_client_id}&"
            f"redirect_uri={self.google_redirect_uri}&"
            f"response_type=code&"
            f"scope={scope}"
        )
        
        if state:
            url += f"&state={state}"
        
        return url
