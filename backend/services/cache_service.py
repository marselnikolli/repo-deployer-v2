import json
from typing import Optional, Any
import redis
import os
from datetime import timedelta

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class CacheService:
    """Redis caching service for search results and statistics"""
    
    _client: Optional[redis.Redis] = None
    
    @staticmethod
    def get_client() -> redis.Redis:
        """Get or create Redis client"""
        if CacheService._client is None:
            try:
                CacheService._client = redis.from_url(REDIS_URL, decode_responses=True)
                CacheService._client.ping()
                print("✓ Redis connected successfully")
            except Exception as e:
                print(f"⚠ Redis connection failed: {e}")
                print("Cache will be disabled")
                return None
        return CacheService._client
    
    @staticmethod
    def set(key: str, value: Any, ttl: int = 3600) -> bool:
        """Set cache value with TTL (default 1 hour)"""
        try:
            client = CacheService.get_client()
            if not client:
                return False
            
            serialized = json.dumps(value)
            client.setex(key, ttl, serialized)
            return True
        except Exception as e:
            print(f"Cache SET error: {e}")
            return False
    
    @staticmethod
    def get(key: str) -> Optional[Any]:
        """Get cache value"""
        try:
            client = CacheService.get_client()
            if not client:
                return None
            
            value = client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            print(f"Cache GET error: {e}")
            return None
    
    @staticmethod
    def delete(key: str) -> bool:
        """Delete cache key"""
        try:
            client = CacheService.get_client()
            if not client:
                return False
            
            client.delete(key)
            return True
        except Exception as e:
            print(f"Cache DELETE error: {e}")
            return False
    
    @staticmethod
    def delete_pattern(pattern: str) -> int:
        """Delete all keys matching pattern"""
        try:
            client = CacheService.get_client()
            if not client:
                return 0
            
            keys = client.keys(pattern)
            if keys:
                return client.delete(*keys)
            return 0
        except Exception as e:
            print(f"Cache DELETE_PATTERN error: {e}")
            return 0
    
    @staticmethod
    def clear_all() -> bool:
        """Clear all cache"""
        try:
            client = CacheService.get_client()
            if not client:
                return False
            
            client.flushdb()
            return True
        except Exception as e:
            print(f"Cache CLEAR_ALL error: {e}")
            return False


def generate_search_cache_key(query: str, category: Optional[str] = None, 
                             cloned: Optional[bool] = None, 
                             deployed: Optional[bool] = None,
                             limit: int = 100, offset: int = 0) -> str:
    """Generate cache key for search results"""
    parts = ["search"]
    if query:
        parts.append(query.lower())
    if category:
        parts.append(f"cat:{category}")
    if cloned is not None:
        parts.append(f"cloned:{cloned}")
    if deployed is not None:
        parts.append(f"deployed:{deployed}")
    parts.append(f"limit:{limit}:offset:{offset}")
    
    return ":".join(parts)


def generate_stats_cache_key() -> str:
    """Generate cache key for stats"""
    return "stats:all"
