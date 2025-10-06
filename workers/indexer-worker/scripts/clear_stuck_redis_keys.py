#!/usr/bin/env python3
"""
Script to clear stuck Redis keys that are preventing pool processing.
Use this to manually clear pool_processed keys that are stuck due to save failures.
"""

import asyncio
import sys
from pathlib import Path

# Add the current directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import get_settings
from repositories.redis_cache import RedisCacheRepository
import structlog

logger = structlog.get_logger()


async def clear_stuck_keys():
    """Clear stuck Redis keys."""
    print("🔧 Clearing stuck Redis keys...")
    
    # Initialize Redis repository
    settings = get_settings()
    cache_repo = RedisCacheRepository(
        redis_url=settings.redis_url,
        db=settings.redis_db,
        key_prefix=settings.redis_key_prefix
    )
    
    try:
        await cache_repo.connect()
        print("✅ Connected to Redis")
        
        # Get all keys matching pool_processed pattern
        pattern = f"{settings.redis_key_prefix}:pool_processed:*"
        print(f"🔍 Scanning for keys matching: {pattern}")
        
        # Use SCAN to get all matching keys
        keys = []
        async for key in cache_repo.client.scan_iter(match=pattern):
            keys.append(key)
        
        print(f"📋 Found {len(keys)} pool_processed keys")
        
        if not keys:
            print("✅ No stuck keys found")
            return
        
        # Show keys and ask for confirmation
        print("\n🔍 Keys found:")
        for i, key in enumerate(keys[:10]):  # Show first 10
            ttl = await cache_repo.client.ttl(key)
            print(f"  {i+1}. {key} (TTL: {ttl}s)")
        
        if len(keys) > 10:
            print(f"  ... and {len(keys) - 10} more")
        
        # Ask for confirmation
        response = input(f"\n❓ Clear all {len(keys)} keys? (y/N): ").strip().lower()
        
        if response != 'y':
            print("❌ Operation cancelled")
            return
        
        # Clear keys in batches
        batch_size = 100
        cleared = 0
        
        for i in range(0, len(keys), batch_size):
            batch = keys[i:i+batch_size]
            await cache_repo.client.delete(*batch)
            cleared += len(batch)
            print(f"🧹 Cleared {cleared}/{len(keys)} keys...")
        
        print(f"✅ Successfully cleared {cleared} stuck Redis keys")
        print("🔄 Pools can now be re-processed")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        raise
    finally:
        await cache_repo.disconnect()


async def clear_specific_pool(pool_address: str, chain_id: int = 8453):
    """Clear Redis key for a specific pool."""
    print(f"🔧 Clearing Redis key for pool: {pool_address}")
    
    settings = get_settings()
    cache_repo = RedisCacheRepository(
        redis_url=settings.redis_url,
        db=settings.redis_db,
        key_prefix=settings.redis_key_prefix
    )
    
    try:
        await cache_repo.connect()
        
        # Clear specific pool key
        key = f"pool_processed:{chain_id}:{pool_address}"
        await cache_repo.delete(key)
        
        print(f"✅ Cleared key: {key}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        raise
    finally:
        await cache_repo.disconnect()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Clear specific pool
        pool_address = sys.argv[1]
        chain_id = int(sys.argv[2]) if len(sys.argv) > 2 else 8453
        asyncio.run(clear_specific_pool(pool_address, chain_id))
    else:
        # Clear all stuck keys
        asyncio.run(clear_stuck_keys())