import axios from 'axios';
import { redisManager } from './redis';
import { COMMON_TOKENS, getNetworkKeyByChainIdSync } from '../config/networks';
import { withHttpRetry } from './retry';

export interface TokenPrice {
  address: string;
  priceUsd: number;
  priceChange24h?: number;
  volume24h?: number;
  source: 'dexscreener' | 'binance';
  lastUpdated: number;
}

export interface BinancePriceResponse {
  symbol: string;
  price: string;
  priceChangePercent?: string;
}

export interface DexScreenerTokenResponse {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
  };
  priceChange: {
    h24: number;
  };
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerTokenResponse[];
}

export class PriceService {
  private static instance: PriceService;
  private readonly PRICE_CACHE_PREFIX = 'moonx:price:';
  private readonly PRICE_CACHE_TTL = 60; // 1 minute
  private readonly BINANCE_API_URL = 'https://api.binance.com/api/v3';
  private readonly DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex';
  
  // Binance symbol mappings
  private readonly BINANCE_SYMBOLS: Record<string, string> = {
    'WETH': 'ETHUSDT',
    'ETH': 'ETHUSDT',
    'USDC': 'USDCUSDT', // USDC to USD
    'DAI': 'DAIUSDT',   // DAI to USD
    'BTC': 'BTCUSDT',
    'SOL': 'SOLUSDT',
    // USDT removed - always return 1.0
  };

  private constructor() {}

  public static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  // Get token prices with caching
  async getTokenPrices(tokenAddresses: string[], chainId: number): Promise<Record<string, TokenPrice | null>> {
    const result: Record<string, TokenPrice | null> = {};
    const uncachedTokens: string[] = [];

    // Step 1: Try to get prices from cache
    const cachePromises = tokenAddresses.map(async (address) => {
      const cached = await this.getCachedPrice(address, chainId);
      if (cached && this.isPriceFresh(cached)) {
        result[address.toLowerCase()] = cached;
      } else {
        uncachedTokens.push(address);
      }
    });

    await Promise.all(cachePromises);

    // Step 2: Fetch uncached prices
    if (uncachedTokens.length > 0) {
      await this.fetchAndCacheTokenPrices(uncachedTokens, chainId, result);
    }

    console.log(`💰 Price fetch: ${Object.values(result).filter(p => p !== null).length}/${tokenAddresses.length} prices found`);
    return result;
  }

  // Fetch prices for uncached tokens
  private async fetchAndCacheTokenPrices(
    tokenAddresses: string[], 
    chainId: number, 
    result: Record<string, TokenPrice | null>
  ): Promise<void> {
    // Separate common tokens for Binance vs others for DexScreener
    const commonTokens = tokenAddresses.filter(addr => this.isCommonToken(addr, chainId));
    const dexTokens = tokenAddresses.filter(addr => !this.isCommonToken(addr, chainId));

    const fetchPromises: Promise<void>[] = [];

    // Fetch common tokens from Binance
    if (commonTokens.length > 0) {
      fetchPromises.push(this.fetchBinancePrices(commonTokens, chainId, result));
    }

    // Fetch other tokens from DexScreener
    if (dexTokens.length > 0) {
      fetchPromises.push(this.fetchDexScreenerPrices(dexTokens, chainId, result));
    }

    await Promise.all(fetchPromises);
  }

  // Fetch prices from Binance API
  private async fetchBinancePrices(
    tokenAddresses: string[], 
    chainId: number, 
    result: Record<string, TokenPrice | null>
  ): Promise<void> {
    try {
      // Handle USDT special case first (always 1.0)
      tokenAddresses.forEach(address => {
        const symbol = this.getTokenSymbolForBinance(address, chainId);
        if (symbol === 'USDT') {
          const tokenPrice: TokenPrice = {
            address: address.toLowerCase(),
            priceUsd: 1.0, // USDT always = 1 USD
            priceChange24h: 0, // Stable coin
            source: 'binance',
            lastUpdated: Date.now()
          };
          result[address.toLowerCase()] = tokenPrice;
          this.cachePrice(address, chainId, tokenPrice).catch(error => 
            console.error('Error caching USDT price:', error)
          );
        }
      });

      // Get unique symbols to fetch (excluding USDT)
      const symbolsToFetch = new Set<string>();
      tokenAddresses.forEach(address => {
        const symbol = this.getTokenSymbolForBinance(address, chainId);
        if (symbol !== 'USDT') { // Skip USDT - already handled above
          const binanceSymbol = this.BINANCE_SYMBOLS[symbol];
          if (binanceSymbol) {
            symbolsToFetch.add(binanceSymbol);
          }
        }
      });

      if (symbolsToFetch.size === 0) {
        console.log('No Binance symbols to fetch (USDT handled or no valid symbols)');
        // Set null for tokens that don't have USDT and don't have valid Binance symbols
        tokenAddresses.forEach(address => {
          const symbol = this.getTokenSymbolForBinance(address, chainId);
          if (symbol !== 'USDT' && !result[address.toLowerCase()]) {
            result[address.toLowerCase()] = null;
          }
        });
        return;
      }

      const symbolsArray = Array.from(symbolsToFetch);
      const retryResult = await withHttpRetry(
        () => axios.get(`${this.BINANCE_API_URL}/ticker/24hr`, {
          params: { symbols: JSON.stringify(symbolsArray) },
          timeout: 5000,
          headers: {
            'User-Agent': 'MoonX-Farm-Pro/1.0.0'
          }
        }),
        {
          maxAttempts: 3,
          initialDelay: 500,
          retryOn4xx: true // Retry on rate limits
        }
      );
      const response = retryResult.data;

      const prices = Array.isArray(response.data) ? response.data : [response.data];

      // Map common tokens to their prices (skip USDT - already handled)
      tokenAddresses.forEach(address => {
        const symbol = this.getTokenSymbolForBinance(address, chainId);
        
        // Skip USDT - already handled above
        if (symbol === 'USDT') {
          return;
        }

        const binanceSymbol = this.BINANCE_SYMBOLS[symbol];
        const binanceData = prices.find((p: BinancePriceResponse) => 
          p.symbol === binanceSymbol
        );

        if (binanceData && !isNaN(parseFloat(binanceData.price))) {
          const tokenPrice: TokenPrice = {
            address: address.toLowerCase(),
            priceUsd: parseFloat(binanceData.price),
            priceChange24h: binanceData.priceChangePercent ? parseFloat(binanceData.priceChangePercent) : undefined,
            source: 'binance',
            lastUpdated: Date.now()
          };

          result[address.toLowerCase()] = tokenPrice;
          this.cachePrice(address, chainId, tokenPrice).catch(error => 
            console.error('Error caching Binance price:', error)
          );
        } else {
          result[address.toLowerCase()] = null;
        }
      });

      console.log(`🟡 Binance prices fetched for ${tokenAddresses.length} tokens`);
    } catch (error: any) {
      console.error('Error fetching Binance prices:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      // Set all as null on error
      tokenAddresses.forEach(address => {
        result[address.toLowerCase()] = null;
      });
    }
  }

  // Fetch prices from DexScreener API
  private async fetchDexScreenerPrices(
    tokenAddresses: string[], 
    chainId: number, 
    result: Record<string, TokenPrice | null>
  ): Promise<void> {
    try {
      if (tokenAddresses.length === 0) {
        return;
      }

      const addressesQuery = tokenAddresses.map(addr => addr.toLowerCase()).join(',');
      
      const retryResult = await withHttpRetry(
        () => axios.get(`${this.DEXSCREENER_API_URL}/tokens/${addressesQuery}`, {
          timeout: 10000,
          headers: {
            'User-Agent': 'MoonX-Farm-Pro/1.0.0'
          }
        }),
        {
          maxAttempts: 3,
          initialDelay: 1000,
          retryOn4xx: false // DexScreener doesn't typically rate limit
        }
      );
      const response = retryResult.data;

      const data: DexScreenerResponse = response.data;

      if (data.pairs && Array.isArray(data.pairs) && data.pairs.length > 0) {
        // Group pairs by token address
        const pairsByToken = new Map<string, DexScreenerTokenResponse[]>();
        
        data.pairs.forEach(pair => {
          if (!pair.baseToken || !pair.baseToken.address) {
            return; // Skip invalid pairs
          }
          
          const tokenAddr = pair.baseToken.address.toLowerCase();
          if (tokenAddresses.some(addr => addr.toLowerCase() === tokenAddr)) {
            if (!pairsByToken.has(tokenAddr)) {
              pairsByToken.set(tokenAddr, []);
            }
            pairsByToken.get(tokenAddr)!.push(pair);
          }
        });

        // Process each token
        tokenAddresses.forEach(address => {
          const pairs = pairsByToken.get(address.toLowerCase());
          if (pairs && pairs.length > 0) {
            // Use the pair with highest volume for price
            const bestPair = pairs.reduce((best, current) => {
              const currentVolume = current.volume?.h24 || 0;
              const bestVolume = best.volume?.h24 || 0;
              return currentVolume > bestVolume ? current : best;
            });

            const priceUsd = parseFloat(bestPair.priceUsd);
            if (!isNaN(priceUsd) && priceUsd > 0) {
              const tokenPrice: TokenPrice = {
                address: address.toLowerCase(),
                priceUsd: priceUsd,
                priceChange24h: bestPair.priceChange?.h24,
                volume24h: bestPair.volume?.h24,
                source: 'dexscreener',
                lastUpdated: Date.now()
              };

              result[address.toLowerCase()] = tokenPrice;
              this.cachePrice(address, chainId, tokenPrice).catch(error => 
                console.error('Error caching DexScreener price:', error)
              );
            } else {
              result[address.toLowerCase()] = null;
            }
          } else {
            result[address.toLowerCase()] = null;
          }
        });
      } else {
        // No pairs found
        tokenAddresses.forEach(address => {
          result[address.toLowerCase()] = null;
        });
      }

      const successCount = tokenAddresses.filter(addr => result[addr.toLowerCase()] !== null).length;
      console.log(`🔵 DexScreener prices: ${successCount}/${tokenAddresses.length} tokens found`);
    } catch (error: any) {
      console.error('Error fetching DexScreener prices:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        tokensCount: tokenAddresses.length
      });
      // Set all as null on error
      tokenAddresses.forEach(address => {
        result[address.toLowerCase()] = null;
      });
    }
  }

  // Check if token should use Binance API
  private isCommonToken(address: string, chainId: number): boolean {
    const networkKey = getNetworkKeyByChainIdSync(chainId);
    if (!networkKey) return false;
    
    const commonTokens = COMMON_TOKENS[networkKey];
    if (!commonTokens) return false;
    
    // Check if address matches any common token with useBinance = true
    const token = commonTokens.find(token => 
      token.address.toLowerCase() === address.toLowerCase()
    );
    
    return token ? (token.useBinance === true) : false;
  }

  // Get token symbol for Binance mapping
  private getTokenSymbolForBinance(address: string, chainId: number): string {
    const networkKey = getNetworkKeyByChainIdSync(chainId);
    if (!networkKey) return 'ETH'; // Default fallback
    
    const commonTokens = COMMON_TOKENS[networkKey];
    if (!commonTokens) return 'ETH';
    
    // Find the token by address in common tokens
    const token = commonTokens.find(token => 
      token.address.toLowerCase() === address.toLowerCase()
    );
    
    if (token) {
      // Map token symbol to Binance symbol, handle special cases
      switch (token.symbol) {
        case 'ETH':
        case 'WETH':
          return 'ETH';
        case 'USDC':
          return 'USDC';
        case 'USDT':
          return 'USDT';
        case 'DAI':
          return 'DAI';
        default:
          return token.symbol;
      }
    }
    
    return 'ETH'; // Default fallback
  }

  // Get chain ID string for DexScreener
  private getChainIdForDexScreener(chainId: number): string {
    const mapping: Record<number, string> = {
      1: 'ethereum',
      8453: 'base',
      56: 'bsc',
      137: 'polygon',
      42161: 'arbitrum',
      10: 'optimism'
    };
    return mapping[chainId] || 'ethereum';
  }

  // Cache token price
  private async cachePrice(address: string, chainId: number, price: TokenPrice): Promise<void> {
    try {
      const cacheKey = `${this.PRICE_CACHE_PREFIX}${chainId}:${address.toLowerCase()}`;
      await redisManager.getClient()?.setex(
        cacheKey,
        this.PRICE_CACHE_TTL,
        JSON.stringify(price)
      );
    } catch (error) {
      console.error('Error caching price:', error);
    }
  }

  // Get cached price
  private async getCachedPrice(address: string, chainId: number): Promise<TokenPrice | null> {
    try {
      const cacheKey = `${this.PRICE_CACHE_PREFIX}${chainId}:${address.toLowerCase()}`;
      const cached = await redisManager.getClient()?.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as TokenPrice;
      }
      return null;
    } catch (error) {
      console.error('Error getting cached price:', error);
      return null;
    }
  }

  // Check if price is fresh (within 1 minute)
  private isPriceFresh(price: TokenPrice): boolean {
    return Date.now() - price.lastUpdated < this.PRICE_CACHE_TTL * 1000;
  }

  // Clear all price cache
  async clearPriceCache(): Promise<number> {
    try {
      const client = redisManager.getClient();
      if (!client) return 0;

      const pattern = `${this.PRICE_CACHE_PREFIX}*`;
      const keys = await client.keys(pattern);
      
      if (keys.length > 0) {
        const deleted = await client.del(...keys);
        console.log(`🧹 Cleared ${deleted} cached prices`);
        return deleted;
      }
      
      return 0;
    } catch (error) {
      console.error('Error clearing price cache:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const priceService = PriceService.getInstance();
