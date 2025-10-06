import { Redis } from 'ioredis';
import { Network } from '../types';

export interface CachedNetworkData {
  networks: Record<string, Network>;
  supportedChainIds: number[];
  networkByChainId: Record<number, Network>;
  cached_at: number;
}

export class NetworkCacheManager {
  private static instance: NetworkCacheManager;
  private client: Redis | null = null;
  private readonly CACHE_PREFIX = 'moonx:networks:';
  private readonly NETWORKS_KEY = 'all_networks';
  private readonly CHAIN_IDS_KEY = 'chain_ids'; 
  private readonly NETWORK_BY_CHAIN_PREFIX = 'by_chain:';
  private readonly CACHE_TTL = 300; // 5 minutes

  private constructor() {}

  public static getInstance(): NetworkCacheManager {
    if (!NetworkCacheManager.instance) {
      NetworkCacheManager.instance = new NetworkCacheManager();
    }
    return NetworkCacheManager.instance;
  }

  // Initialize Redis connection (reuse existing Redis setup)
  async initialize(): Promise<void> {
    if (this.client?.status === 'ready') {
      return; // Already connected
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 3000,
        enableReadyCheck: true,
        db: 0
      });

      await this.client.connect();
      console.log('✅ Network Redis Cache connected');
    } catch (error) {
      console.error('❌ Network Redis Cache connection failed:', error);
      this.client = null;
    }
  }

  // Cache all networks
  async cacheAllNetworks(networks: Record<string, Network>): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${this.NETWORKS_KEY}`;
      const cachedData = {
        networks,
        cached_at: Date.now()
      };

      await this.client.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(cachedData)
      );

      // Cache supported chain IDs separately for faster access
      const chainIds = Object.values(networks).map(network => network.chainId);
      const chainIdsCacheKey = `${this.CACHE_PREFIX}${this.CHAIN_IDS_KEY}`;
      await this.client.setex(
        chainIdsCacheKey,
        this.CACHE_TTL,
        JSON.stringify({ chainIds, cached_at: Date.now() })
      );

      // Cache individual networks by chain ID for faster lookups
      const pipeline = this.client.pipeline();
      Object.values(networks).forEach(network => {
        const networkCacheKey = `${this.CACHE_PREFIX}${this.NETWORK_BY_CHAIN_PREFIX}${network.chainId}`;
        pipeline.setex(
          networkCacheKey,
          this.CACHE_TTL,
          JSON.stringify({ network, cached_at: Date.now() })
        );
      });
      
      await pipeline.exec();
      
      console.log(`✅ Cached ${Object.keys(networks).length} networks to Redis`);
    } catch (error) {
      console.error('Error caching networks:', error);
    }
  }

  // Get all cached networks
  async getAllNetworks(): Promise<Record<string, Network> | null> {
    if (!this.client) {
      return null;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${this.NETWORKS_KEY}`;
      const cached = await this.client.get(cacheKey);
      
      if (cached) {
        const data = JSON.parse(cached);
        // Check if cache is still valid
        if (Date.now() - data.cached_at < this.CACHE_TTL * 1000) {
          console.log('🎯 Networks cache hit');
          return data.networks;
        } else {
          // Remove expired cache
          await this.client.del(cacheKey);
        }
      }

      console.log('🚫 Networks cache miss');
      return null;
    } catch (error) {
      console.error('Error getting networks from cache:', error);
      return null;
    }
  }

  // Get network by chain ID from cache
  async getNetworkByChainId(chainId: number): Promise<Network | null> {
    if (!this.client) {
      return null;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${this.NETWORK_BY_CHAIN_PREFIX}${chainId}`;
      const cached = await this.client.get(cacheKey);
      
      if (cached) {
        const data = JSON.parse(cached);
        // Check if cache is still valid
        if (Date.now() - data.cached_at < this.CACHE_TTL * 1000) {
          console.log(`🎯 Network cache hit for chain ${chainId}`);
          return data.network;
        } else {
          // Remove expired cache
          await this.client.del(cacheKey);
        }
      }

      console.log(`🚫 Network cache miss for chain ${chainId}`);
      return null;
    } catch (error) {
      console.error(`Error getting network ${chainId} from cache:`, error);
      return null;
    }
  }

  // Get supported chain IDs from cache
  async getSupportedChainIds(): Promise<number[] | null> {
    if (!this.client) {
      return null;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${this.CHAIN_IDS_KEY}`;
      const cached = await this.client.get(cacheKey);
      
      if (cached) {
        const data = JSON.parse(cached);
        // Check if cache is still valid
        if (Date.now() - data.cached_at < this.CACHE_TTL * 1000) {
          console.log('🎯 Chain IDs cache hit');
          return data.chainIds;
        } else {
          // Remove expired cache
          await this.client.del(cacheKey);
        }
      }

      console.log('🚫 Chain IDs cache miss');
      return null;
    } catch (error) {
      console.error('Error getting chain IDs from cache:', error);
      return null;
    }
  }

  // Invalidate all network cache
  async invalidateAllCache(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(...keys);
        console.log(`🧹 Cleared ${keys.length} network cache entries`);
      }
    } catch (error) {
      console.error('Error invalidating network cache:', error);
    }
  }

  // Invalidate cache for specific network
  async invalidateNetworkCache(chainId: number): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const networkCacheKey = `${this.CACHE_PREFIX}${this.NETWORK_BY_CHAIN_PREFIX}${chainId}`;
      await this.client.del(networkCacheKey);
      
      // Also invalidate global caches since they contain all networks
      const globalKeys = [
        `${this.CACHE_PREFIX}${this.NETWORKS_KEY}`,
        `${this.CACHE_PREFIX}${this.CHAIN_IDS_KEY}`
      ];
      await this.client.del(...globalKeys);
      
      console.log(`🧹 Invalidated cache for chain ${chainId}`);
    } catch (error) {
      console.error(`Error invalidating cache for chain ${chainId}:`, error);
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
      console.error('Network cache health check failed:', error);
      return false;
    }
  }

  // Get cache stats
  async getCacheStats(): Promise<{
    totalKeys: number;
    networksKeyExists: boolean;
    chainIdsKeyExists: boolean;
    networkByChainKeys: number;
  }> {
    if (!this.client) {
      return { totalKeys: 0, networksKeyExists: false, chainIdsKeyExists: false, networkByChainKeys: 0 };
    }

    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.client.keys(pattern);
      
      const networksKey = `${this.CACHE_PREFIX}${this.NETWORKS_KEY}`;
      const chainIdsKey = `${this.CACHE_PREFIX}${this.CHAIN_IDS_KEY}`;
      
      const [networksExists, chainIdsExists] = await Promise.all([
        this.client.exists(networksKey),
        this.client.exists(chainIdsKey)
      ]);

      const networkByChainKeys = keys.filter(key => 
        key.includes(this.NETWORK_BY_CHAIN_PREFIX)
      ).length;

      return {
        totalKeys: keys.length,
        networksKeyExists: networksExists === 1,
        chainIdsKeyExists: chainIdsExists === 1,
        networkByChainKeys
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { totalKeys: 0, networksKeyExists: false, chainIdsKeyExists: false, networkByChainKeys: 0 };
    }
  }

  // Cleanup connection
  async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('✅ Network Redis Cache disconnected');
      } catch (error) {
        console.error('Error disconnecting Network Redis Cache:', error);
      }
      this.client = null;
    }
  }
}

// Export singleton instance
export const networkCacheManager = NetworkCacheManager.getInstance();
