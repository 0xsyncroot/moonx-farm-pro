import redis.asyncio as redis
from typing import Optional
import structlog
import json
from repositories.base import CacheRepository


logger = structlog.get_logger()


class RedisCacheRepository(CacheRepository):
    """Redis implementation of cache repository."""
    
    def __init__(self, redis_url: str, db: int = 0, key_prefix: str = "moonx:indexer"):
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
            
            logger.info("Connected to Redis", url=self.redis_url, db=self.db)
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.client:
            await self.client.close()
            logger.info("Disconnected from Redis")
    
    async def health_check(self) -> bool:
        """Check Redis health."""
        try:
            if not self.client:
                return False
            await self.client.ping()
            return True
        except Exception as e:
            logger.error("Redis health check failed", error=str(e))
            return False
    
    def _make_key(self, key: str) -> str:
        """Create prefixed key."""
        return f"{self.key_prefix}:{key}"
    
    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        """Set cache value."""
        try:
            full_key = self._make_key(key)
            if ttl:
                await self.client.setex(full_key, ttl, value)
            else:
                await self.client.set(full_key, value)
            
            logger.debug("Set cache value", key=key, ttl=ttl)
        except Exception as e:
            logger.error("Failed to set cache value", key=key, error=str(e))
            raise
    
    async def get(self, key: str) -> Optional[str]:
        """Get cache value."""
        try:
            full_key = self._make_key(key)
            value = await self.client.get(full_key)
            
            logger.debug("Got cache value", key=key, found=value is not None)
            return value
        except Exception as e:
            logger.error("Failed to get cache value", key=key, error=str(e))
            raise
    
    async def delete(self, key: str) -> None:
        """Delete cache value."""
        try:
            full_key = self._make_key(key)
            await self.client.delete(full_key)
            
            logger.debug("Deleted cache value", key=key)
        except Exception as e:
            logger.error("Failed to delete cache value", key=key, error=str(e))
            raise
    
    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        try:
            full_key = self._make_key(key)
            result = await self.client.exists(full_key)
            return bool(result)
        except Exception as e:
            logger.error("Failed to check key existence", key=key, error=str(e))
            raise
    
    async def acquire_lock(self, key: str, ttl: int) -> bool:
        """Acquire distributed lock."""
        try:
            lock_key = self._make_key(f"lock:{key}")
            lock_value = f"locked_{key}"
            
            # Use SET with NX (only if not exists) and EX (expiration)
            result = await self.client.set(lock_key, lock_value, nx=True, ex=ttl)
            
            if result:
                logger.debug("Acquired lock", key=key, ttl=ttl)
                return True
            else:
                logger.debug("Failed to acquire lock (already exists)", key=key)
                return False
        except Exception as e:
            logger.error("Failed to acquire lock", key=key, error=str(e))
            raise
    
    async def release_lock(self, key: str) -> None:
        """Release distributed lock."""
        try:
            lock_key = self._make_key(f"lock:{key}")
            await self.client.delete(lock_key)
            
            logger.debug("Released lock", key=key)
        except Exception as e:
            logger.error("Failed to release lock", key=key, error=str(e))
            raise
    
    async def extend_lock(self, key: str, ttl: int) -> bool:
        """Extend lock timeout."""
        try:
            lock_key = self._make_key(f"lock:{key}")
            
            # Check if lock exists and extend it
            if await self.client.exists(lock_key):
                await self.client.expire(lock_key, ttl)
                logger.debug("Extended lock", key=key, ttl=ttl)
                return True
            else:
                logger.debug("Cannot extend non-existent lock", key=key)
                return False
        except Exception as e:
            logger.error("Failed to extend lock", key=key, error=str(e))
            raise
    
    async def set_json(self, key: str, value: dict, ttl: Optional[int] = None) -> None:
        """Set JSON value in cache."""
        json_value = json.dumps(value)
        await self.set(key, json_value, ttl)
    
    async def get_json(self, key: str) -> Optional[dict]:
        """Get JSON value from cache."""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                logger.error("Failed to decode JSON from cache", key=key, error=str(e))
                return None
        return None
    
    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment counter."""
        try:
            full_key = self._make_key(key)
            result = await self.client.incrby(full_key, amount)
            
            logger.debug("Incremented counter", key=key, amount=amount, new_value=result)
            return result
        except Exception as e:
            logger.error("Failed to increment counter", key=key, error=str(e))
            raise
    
    async def add_to_set(self, key: str, value: str) -> None:
        """Add value to set."""
        try:
            full_key = self._make_key(key)
            await self.client.sadd(full_key, value)
            
            logger.debug("Added to set", key=key, value=value)
        except Exception as e:
            logger.error("Failed to add to set", key=key, error=str(e))
            raise
    
    async def is_in_set(self, key: str, value: str) -> bool:
        """Check if value is in set."""
        try:
            full_key = self._make_key(key)
            result = await self.client.sismember(full_key, value)
            return bool(result)
        except Exception as e:
            logger.error("Failed to check set membership", key=key, error=str(e))
            raise
    
    async def remove_from_set(self, key: str, value: str) -> None:
        """Remove value from set."""
        try:
            full_key = self._make_key(key)
            await self.client.srem(full_key, value)
            
            logger.debug("Removed from set", key=key, value=value)
        except Exception as e:
            logger.error("Failed to remove from set", key=key, error=str(e))
            raise