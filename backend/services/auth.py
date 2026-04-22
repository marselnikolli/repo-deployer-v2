"""JWT authentication utilities"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from passlib.context import CryptContext
from pydantic import BaseModel


# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenPayload(BaseModel):
    """JWT token payload"""
    sub: int  # user_id
    exp: datetime
    iat: datetime


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    payload = {
        "sub": str(user_id),  # Convert to string for JWT spec compliance
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[int]:
    """Decode a JWT access token and return user_id"""
    try:
        print(f"DEBUG decode_access_token: decoding token {token[:20]}...")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print(f"DEBUG decode_access_token: decoded payload = {payload}")
        
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            print(f"ERROR: No 'sub' claim in token")
            return None
        
        # Convert string back to int
        user_id = int(user_id_str)
        print(f"SUCCESS: Decoded user_id = {user_id}")
        return user_id
    except jwt.ExpiredSignatureError as e:
        print(f"ERROR: Token expired - {e}")
        return None
    except jwt.InvalidTokenError as e:
        print(f"ERROR: Invalid token - {e}")
        return None


def generate_api_key() -> str:
    """Generate a random API key"""
    import secrets
    return secrets.token_urlsafe(32)
