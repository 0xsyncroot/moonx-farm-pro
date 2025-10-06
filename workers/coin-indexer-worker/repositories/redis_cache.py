import redis.asyncio as redis
from typing import Optional, List, Dict, Any
import structlog
import json

logger = structlog.get_logger()


class RedisCacheRepository:
    """Redis implementation for token caching."""
    
    def __init__(self, redis_url: str, db: int = 0, key_prefix: str = "moonx:tokens"):
        self.redis_url = redis_url
        self.db = db
        self.key_prefix = key_prefix
        self.client: Optional[redis.Redis] = None
    
    async def connect(self) -> None:
        """Connect to Redis."""
        try:
            self.client = redis.from_url(
                self.redis_url,
                db=self.db,
                decode_responses=True,
                socket_timeout=30,
                socket_connect_timeout=30
            )
            
            # Test connection
            await self.client.ping()
            
            logger.info("Connected to Redis for tokens", url=self.redis_url, db=self.db)
        except Exception as e:
            logger.error("Failed to connect to Redis for tokens", error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        try:
            if self.client:
                await self.client.aclose()
                self.client = None
                logger.info("Disconnected from Redis for tokens")
        except Exception as e:
            logger.error("Error disconnecting from Redis for tokens", error=str(e))
            # Don't raise here to allow other cleanup to continue
    
    async def health_check(self) -> bool:
        """Check Redis health."""
        try:
            if not self.client:
                return False
            await self.client.ping()
            return True
        except Exception as e:
            logger.error("Redis health check failed for tokens", error=str(e))
            return False
    
    def _make_key(self, key_suffix: str) -> str:
        """Create a prefixed key."""
        return f"{self.key_prefix}:{key_suffix}"
    
    async def cache_token(self, chain_id: int, token_address: str, token_data: Dict[str, Any], 
                         ttl_seconds: int = 3600) -> None:
        """Cache token data."""
        try:
            key = self._make_key(f"token:{chain_id}:{token_address}")
            value = json.dumps(token_data, default=str)
            
            await self.client.setex(key, ttl_seconds, value)
            
            logger.debug("Cached token data",
                        chain_id=chain_id,
                        token_address=token_address,
                        ttl=ttl_seconds)
            
        except Exception as e:
            logger.error("Failed to cache token data",
                        chain_id=chain_id,
                        token_address=token_address,
                        error=str(e))
    
    async def get_cached_token(self, chain_id: int, token_address: str) -> Optional[Dict[str, Any]]:
        """Get cached token data."""
        try:
            key = self._make_key(f"token:{chain_id}:{token_address}")
            value = await self.client.get(key)
            
            if value:
                return json.loads(value)
            
            return None
            
        except Exception as e:
            logger.error("Failed to get cached token data",
                        chain_id=chain_id,
                        token_address=token_address,
                        error=str(e))
            return None
    
    async def cache_processing_lock(self, chain_id: int, token_address: str, 
                                  ttl_seconds: int = 300) -> bool:
        """Set a processing lock to prevent duplicate processing."""
        try:
            key = self._make_key(f"processing:{chain_id}:{token_address}")
            
            # Use SET with NX (only if not exists) and EX (expiration)
            result = await self.client.set(key, "1", nx=True, ex=ttl_seconds)
            
            if result:
                logger.debug("Set processing lock",
                           chain_id=chain_id,
                           token_address=token_address,
                           ttl=ttl_seconds)
                return True
            else:
                logger.debug("Processing lock already exists",
                           chain_id=chain_id,
                           token_address=token_address)
                return False
            
        except Exception as e:
            logger.error("Failed to set processing lock",
                        chain_id=chain_id,
                        token_address=token_address,
                        error=str(e))
            return False
    
    async def remove_processing_lock(self, chain_id: int, token_address: str) -> None:
        """Remove processing lock."""
        try:
            key = self._make_key(f"processing:{chain_id}:{token_address}")
            await self.client.delete(key)
            
            logger.debug("Removed processing lock",
                        chain_id=chain_id,
                        token_address=token_address)
            
        except Exception as e:
            logger.error("Failed to remove processing lock",
                        chain_id=chain_id,
                        token_address=token_address,
                        error=str(e))
    
    async def cache_recent_tokens(self, chain_id: int, tokens: List[Dict[str, Any]], 
                                ttl_seconds: int = 300) -> None:
        """Cache recent tokens list."""
        try:
            key = self._make_key(f"recent:{chain_id}")
            value = json.dumps(tokens, default=str)
            
            await self.client.setex(key, ttl_seconds, value)
            
            logger.debug("Cached recent tokens",
                        chain_id=chain_id,
                        count=len(tokens),
                        ttl=ttl_seconds)
            
        except Exception as e:
            logger.error("Failed to cache recent tokens",
                        chain_id=chain_id,
                        error=str(e))
    
    async def get_cached_recent_tokens(self, chain_id: int) -> Optional[List[Dict[str, Any]]]:
        """Get cached recent tokens."""
        try:
            key = self._make_key(f"recent:{chain_id}")
            value = await self.client.get(key)
            
            if value:
                return json.loads(value)
            
            return None
            
        except Exception as e:
            logger.error("Failed to get cached recent tokens",
                        chain_id=chain_id,
                        error=str(e))
            return None
    
    async def increment_stats(self, chain_id: int, stat_name: str, value: int = 1) -> None:
        """Increment statistics counter."""
        try:
            key = self._make_key(f"stats:{chain_id}:{stat_name}")
            await self.client.incrby(key, value)
            
            # Set TTL if this is a new key
            await self.client.expire(key, 86400)  # 24 hours
            
        except Exception as e:
            logger.error("Failed to increment stats",
                        chain_id=chain_id,
                        stat_name=stat_name,
                        error=str(e))
    
    async def get_stats(self, chain_id: int, stat_name: str) -> int:
        """Get statistics counter value."""
        try:
            key = self._make_key(f"stats:{chain_id}:{stat_name}")
            value = await self.client.get(key)
            
            return int(value) if value else 0
            
        except Exception as e:
            logger.error("Failed to get stats",
                        chain_id=chain_id,
                        stat_name=stat_name,
                        error=str(e))
            return 0
