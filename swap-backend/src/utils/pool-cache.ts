import { redisManager, CachedPoolInfo } from './redis';
import { tokenManager } from '../managers';
import { TokenPoolInfo } from '../models';
import { withRetry } from './retry';

export interface PoolInfoWithHooks {
  hooks: string;
  fee: number;
  tickSpacing: number;
  pairedToken: string;
  source: string;
  poolKeyHash?: string;
  poolId?: string;
}

export class PoolCacheService {
  private static instance: PoolCacheService;

  private constructor() {}

  public static getInstance(): PoolCacheService {
    if (!PoolCacheService.instance) {
      PoolCacheService.instance = new PoolCacheService();
    }
    return PoolCacheService.instance;
  }

  // Initialize both Redis and MongoDB
  async initialize(): Promise<void> {
    await Promise.all([
      redisManager.initialize(),
      tokenManager.initialize()
    ]);
    console.log('✅ Pool cache service initialized');
  }

  // Get pool info with caching (Redis -> MongoDB -> Cache result) with retry
  async getPoolInfo(tokenAddress: string, chainId: number): Promise<PoolInfoWithHooks | null> {
    try {
      // Step 1: Try Redis cache first with retry
      const cached = await withRetry(
        () => redisManager.getPoolInfo(tokenAddress, chainId),
        {
          maxAttempts: 2,
          initialDelay: 200,
          retryCondition: (error: any) => {
            // Retry on connection errors, but not on missing data
            return error.message?.includes('connection') ||
                   error.message?.includes('timeout') ||
                   error.code === 'ECONNREFUSED' ||
                   error.code === 'ETIMEDOUT';
          }
        }
      ).catch(() => null); // Graceful fallback on cache errors

      if (cached?.data) {
        return {
          hooks: cached.data.hooks,
          fee: cached.data.fee,
          tickSpacing: cached.data.tickSpacing,
          pairedToken: cached.data.pairedToken,
          source: cached.data.source
        };
      }

      // Step 2: Cache miss - get from MongoDB with retry
      let dbPoolInfo: TokenPoolInfo | null = null;
      
      try {
        const result = await withRetry(
          () => tokenManager.getTokenPoolInfo(tokenAddress, chainId),
          {
            maxAttempts: 3,
            initialDelay: 500,
            retryCondition: (error: any) => {
              // Retry on network and database errors
              return error.name === 'MongoNetworkError' ||
                     error.name === 'MongoTimeoutError' ||
                     error.message?.includes('connection') ||
                     error.message?.includes('timeout') ||
                     error.code === 'ETIMEDOUT' ||
                     error.code === 'ENOTFOUND';
            }
          }
        );
        
        // Handle RetryResult or direct result
        if (result && typeof result === 'object' && 'data' in result) {
          dbPoolInfo = (result as any).data;
        } else {
          dbPoolInfo = result as TokenPoolInfo | null;
        }
      } catch (error) {
        console.error(`MongoDB retry failed for ${tokenAddress}:`, error);
        dbPoolInfo = null;
      }

      if (!dbPoolInfo) {
        return null;
      }

      // Step 3: Build pool info with hooks logic
      const poolInfoWithHooks = this.buildPoolInfoWithHooks(dbPoolInfo);

      // Step 4: Cache the result in Redis (with retry but don't fail if cache fails)
      withRetry(
        () => redisManager.setPoolInfo(tokenAddress, chainId, {
          hooks: poolInfoWithHooks.hooks,
          fee: poolInfoWithHooks.fee,
          tickSpacing: poolInfoWithHooks.tickSpacing,
          pairedToken: poolInfoWithHooks.pairedToken,
          source: poolInfoWithHooks.source
        }),
        {
          maxAttempts: 2,
          initialDelay: 100,
          retryCondition: (error: any) => {
            return error.message?.includes('connection') ||
                   error.message?.includes('timeout') ||
                   error.code === 'ECONNREFUSED';
          }
        }
      ).catch(error => console.warn('Cache write failed:', error));


      return poolInfoWithHooks;
    } catch (error) {
      console.error(`Error in getPoolInfo for ${tokenAddress}:`, error);
      return null;
    }
  }

  // Get multiple pool infos with batch processing and retry
  async getMultiplePoolInfos(tokenAddresses: string[], chainId: number): Promise<Record<string, PoolInfoWithHooks | null>> {
    const result: Record<string, PoolInfoWithHooks | null> = {};
    
    try {
      // Step 1: Try to get all from Redis cache with retry
      const cachedResults = await withRetry(
        () => redisManager.getMultiplePoolInfos(tokenAddresses, chainId),
        {
          maxAttempts: 2,
          initialDelay: 200,
          retryCondition: (error: any) => {
            return error.message?.includes('connection') ||
                   error.message?.includes('timeout') ||
                   error.code === 'ECONNREFUSED' ||
                   error.code === 'ETIMEDOUT';
          }
        }
      ).catch(() => ({ data: {} })); // Graceful fallback

      const uncachedAddresses: string[] = [];

      // Separate cached and uncached
      tokenAddresses.forEach(addr => {
        const cachedData = cachedResults.data as Record<string, CachedPoolInfo | null> || {};
        const cached = cachedData[addr.toLowerCase()];
        if (cached) {
          result[addr.toLowerCase()] = {
            hooks: cached.hooks,
            fee: cached.fee,
            tickSpacing: cached.tickSpacing,
            pairedToken: cached.pairedToken,
            source: cached.source
          };
        } else {
          uncachedAddresses.push(addr);
        }
      });

      // Step 2: Get uncached ones from MongoDB with retry
      if (uncachedAddresses.length > 0) {
        let dbData: Record<string, TokenPoolInfo | null> = {};
        
        try {
          const dbResults = await withRetry(
            () => tokenManager.getMultipleTokenPoolInfos(uncachedAddresses, chainId),
            {
              maxAttempts: 3,
              initialDelay: 500,
              retryCondition: (error: any) => {
                return error.name === 'MongoNetworkError' ||
                       error.name === 'MongoTimeoutError' ||
                       error.message?.includes('connection') ||
                       error.message?.includes('timeout') ||
                       error.code === 'ETIMEDOUT' ||
                       error.code === 'ENOTFOUND';
              }
            }
          );
          
          // Handle RetryResult or direct result
          if (dbResults && typeof dbResults === 'object' && 'data' in dbResults) {
            dbData = (dbResults as any).data || {};
          } else {
            dbData = dbResults as Record<string, TokenPoolInfo | null> || {};
          }
        } catch (error) {
          console.error('MongoDB batch retry failed:', error);
          dbData = {};
        }
        
        // Process DB results and cache them
        const cachePromises: Promise<any>[] = [];
        Object.entries(dbData).forEach(([addr, dbInfo]) => {
          if (dbInfo) {
            const poolInfoWithHooks = this.buildPoolInfoWithHooks(dbInfo);
            result[addr] = poolInfoWithHooks;

            // Cache asynchronously with retry
            cachePromises.push(
              withRetry(
                () => redisManager.setPoolInfo(addr, chainId, {
                  hooks: poolInfoWithHooks.hooks,
                  fee: poolInfoWithHooks.fee,
                  tickSpacing: poolInfoWithHooks.tickSpacing,
                  pairedToken: poolInfoWithHooks.pairedToken,
                  source: poolInfoWithHooks.source
                }),
                {
                  maxAttempts: 2,
                  initialDelay: 100,
                  retryCondition: (error: any) => {
                    return error.message?.includes('connection') ||
                           error.message?.includes('timeout') ||
                           error.code === 'ECONNREFUSED';
                  }
                }
              ).catch(error => console.warn(`Cache write failed for ${addr}:`, error))
            );
          } else {
            result[addr] = null;
          }
        });

        // Execute caching promises without waiting
        Promise.all(cachePromises).catch(error => 
          console.error('Error in batch caching:', error)
        );
      }


      return result;
    } catch (error) {
      console.error('Error in getMultiplePoolInfos:', error);
      return result;
    }
  }

  // Build pool info with hooks logic based on DATABASE_SCHEMA.md
  private buildPoolInfoWithHooks(dbInfo: TokenPoolInfo): PoolInfoWithHooks {
    // Build hooks address based on source and available data
    let hooksAddress = '0x0000000000000000000000000000000000000000';
    
    // Logic có hook: if hooks_address is provided and not zero address
    if (dbInfo.hooks_address && 
        dbInfo.hooks_address !== '0x0000000000000000000000000000000000000000' &&
        dbInfo.hooks_address !== '0x') {
      hooksAddress = dbInfo.hooks_address;
    }

    // Special logic based on source
    if (dbInfo.source === 'creator_coin') {
      // Creator coins might have specific hooks logic
      // Keep the hooks from database if available
    } else if (dbInfo.source === 'clanker') {
      // Clanker tokens might have different hooks logic
      // Keep the hooks from database if available
    }

    return {
      hooks: hooksAddress,
      fee: dbInfo.fee_tier || 3000, // Default to 0.3% if not specified
      tickSpacing: dbInfo.tick_spacing || 60, // Default tick spacing
      pairedToken: dbInfo.paired_token || '0x4200000000000000000000000000000000000006', // Default to WETH on Base
      source: dbInfo.source,
      poolKeyHash: dbInfo.pool_key_hash,
      poolId: dbInfo.pool_id
    };
  }

  // Invalidate cache for a token
  async invalidatePoolCache(tokenAddress: string, chainId: number): Promise<void> {
    await redisManager.deletePoolInfo(tokenAddress, chainId);
    console.log(`♻️  Invalidated cache for ${tokenAddress}`);
  }

  // Health check for both systems
  async healthCheck(): Promise<{ redis: boolean; mongodb: boolean; overall: boolean }> {
    const [redisOk, mongoOk] = await Promise.all([
      redisManager.healthCheck(),
      tokenManager.healthCheck()
    ]);

    return {
      redis: redisOk,
      mongodb: mongoOk,
      overall: redisOk && mongoOk // Both must be healthy
    };
  }

  // Cleanup both connections
  async cleanup(): Promise<void> {
    await Promise.all([
      redisManager.cleanup(),
      tokenManager.cleanup()
    ]);
    console.log('✅ Pool cache service cleaned up');
  }

  // Get cache statistics
  async getCacheStats(): Promise<{ dbStats: any; cacheHealth: boolean }> {
    const [dbStats, cacheHealth] = await Promise.all([
      tokenManager.getTokenStats(),
      redisManager.healthCheck()
    ]);

    return {
      dbStats,
      cacheHealth
    };
  }

  // Warm up cache for popular tokens
  async warmUpCache(popularTokens: Array<{ address: string; chainId: number }>): Promise<void> {
    console.log(`🔥 Warming up cache for ${popularTokens.length} tokens...`);
    
    const promises = popularTokens.map(({ address, chainId }) => 
      this.getPoolInfo(address, chainId).catch(error => 
        console.error(`Failed to warm cache for ${address}:`, error)
      )
    );

    await Promise.all(promises);
    console.log('✅ Cache warm-up completed');
  }

  // Clear all pool cache (use with caution)
  async clearAllCache(): Promise<number> {
    return await redisManager.clearAllPoolCache();
  }
}

// Export singleton instance
export const poolCacheService = PoolCacheService.getInstance();
