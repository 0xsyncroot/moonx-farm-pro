import { Redis } from 'ioredis';

export interface CachedPoolInfo {
  hooks: string;
  fee: number;
  tickSpacing: number;
  pairedToken: string;
  source: string;
  cached_at: number;
}

export class RedisManager {
  private static instance: RedisManager;
  private client: Redis | null = null;
  private readonly CACHE_PREFIX = 'moonx:pool:';
  private readonly CACHE_TTL = 300; // 5 minutes

  private constructor() {}

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  // Initialize Redis connection
  async initialize(): Promise<void> {
    if (this.client?.status === 'ready') {
      return; // Already connected
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        // Connection options
        connectTimeout: 5000,
        commandTimeout: 3000,
        // Retry options  
        enableReadyCheck: true,
        // Ensure we use database 0 (default)
        db: 0
      });

      await this.client.connect();
      console.log('✅ Redis connected');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      // Don't throw error to allow app to work without Redis
      this.client = null;
    }
  }

  // Get cached pool info
  async getPoolInfo(tokenAddress: string, chainId: number): Promise<CachedPoolInfo | null> {
    if (!this.client) {
      return null;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${chainId}:${tokenAddress.toLowerCase()}`;
      const cached = await this.client.get(cacheKey);
      
      if (cached) {
        const poolInfo = JSON.parse(cached) as CachedPoolInfo;
        // Check if cache is still valid (not expired)
        if (Date.now() - poolInfo.cached_at < this.CACHE_TTL * 1000) {
          return poolInfo;
        } else {
          // Remove expired cache
          await this.client.del(cacheKey);
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting from cache:', error);
      return null;
    }
  }

  // Cache pool info
  async setPoolInfo(tokenAddress: string, chainId: number, poolInfo: Omit<CachedPoolInfo, 'cached_at'>): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${chainId}:${tokenAddress.toLowerCase()}`;
      const cachedData: CachedPoolInfo = {
        ...poolInfo,
        cached_at: Date.now()
      };

      await this.client.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(cachedData)
      );
    } catch (error) {
      console.error('Error caching pool info:', error);
    }
  }

  // Delete cached pool info
  async deletePoolInfo(tokenAddress: string, chainId: number): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${chainId}:${tokenAddress.toLowerCase()}`;
      await this.client.del(cacheKey);
    } catch (error) {
      console.error('Error deleting cache:', error);
    }
  }

  // Get multiple pool infos at once
  async getMultiplePoolInfos(tokenAddresses: string[], chainId: number): Promise<Record<string, CachedPoolInfo | null>> {
    if (!this.client || tokenAddresses.length === 0) {
      return {};
    }

    const result: Record<string, CachedPoolInfo | null> = {};

    try {
      const cacheKeys = tokenAddresses.map(addr => 
        `${this.CACHE_PREFIX}${chainId}:${addr.toLowerCase()}`
      );

      const cachedValues = await this.client.mget(...cacheKeys);

      tokenAddresses.forEach((tokenAddress, index) => {
        const cached = cachedValues[index];
        if (cached) {
          try {
            const poolInfo = JSON.parse(cached) as CachedPoolInfo;
            // Check if cache is still valid
            if (Date.now() - poolInfo.cached_at < this.CACHE_TTL * 1000) {
              result[tokenAddress.toLowerCase()] = poolInfo;
            } else {
              result[tokenAddress.toLowerCase()] = null;
              // Remove expired cache asynchronously
              this.client!.del(cacheKeys[index]).catch(console.error);
            }
          } catch (parseError) {
            result[tokenAddress.toLowerCase()] = null;
          }
        } else {
          result[tokenAddress.toLowerCase()] = null;
        }
      });

      console.log(`🎯 Batch cache check: ${Object.values(result).filter(v => v !== null).length}/${tokenAddresses.length} hits`);
      return result;
    } catch (error) {
      console.error('Error getting multiple from cache:', error);
      return {};
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  // Get raw Redis client for advanced operations
  getClient(): Redis | null {
    return this.client;
  }

  // Cleanup connection
  async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('✅ Redis disconnected');
      } catch (error) {
        console.error('Error disconnecting Redis:', error);
      }
      this.client = null;
    }
  }

  // Clear all cache (use with caution)
  async clearAllPoolCache(): Promise<number> {
    if (!this.client) {
      return 0;
    }

    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        const deleted = await this.client.del(...keys);
        console.log(`🧹 Cleared ${deleted} cached pool entries`);
        return deleted;
      }
      
      return 0;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const redisManager = RedisManager.getInstance();
