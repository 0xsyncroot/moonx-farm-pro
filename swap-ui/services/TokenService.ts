import { apiClient } from '@/lib/api';
import type { TokenBalance, ServiceResult } from '@/types/api';

export type TokenServiceResult<T> = ServiceResult<T>;

export interface TokenLoadParams {
  chainId: number;
  search?: string;
  userAddress?: string;
}

export interface SpecificTokenParams {
  chainId: number;
  userAddress: string;
  tokenAddresses: string[];
}

/**
 * TokenService - Handles all token-related operations
 * Wraps API calls and provides business logic for token management
 */
export class TokenService {
  private static instance: TokenService;
  private cache: Map<string, { data: TokenBalance[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 2 * 60 * 1000; // 2 minutes (shorter than networks since balances can change)

  private constructor() {}

  static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  /**
   * Load tokens for a specific network with optional search and user address
   */
  async loadTokens(params: TokenLoadParams): Promise<TokenServiceResult<TokenBalance[]>> {
    try {
      const cacheKey = this.getCacheKey(params);
      
      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return {
          success: true,
          data: cached.data
        };
      }
      
      const requestParams: any = { chainId: params.chainId };
      if (params.search) requestParams.search = params.search;
      if (params.userAddress) requestParams.userAddress = params.userAddress;

      const result = await apiClient.get<{ tokens: TokenBalance[] }>('/api/tokens', {
        params: requestParams
      });
      if (!result || !result.tokens || !Array.isArray(result.tokens) || result.tokens.length === 0) {
        throw new Error(`No tokens found for network chainId: ${params.chainId}`);
      }

      // Update cache
      this.cache.set(cacheKey, {
        data: result.tokens,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: result.tokens
      };
    } catch (error) {
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to load tokens';
      
      // Provide more specific error messages
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return {
          success: false,
          data: [],
          error: `Token list not available for this network. Try switching networks or check back later.`
        };
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        return {
          success: false,
          data: [],
          error: 'Network connection error. Please check your internet connection and try again.'
        };
      }

      return {
        success: false,
        data: [],
        error: errorMessage
      };
    }
  }

  /**
   * Load specific tokens by addresses (for balance refresh after swap)
   */
  async loadSpecificTokens(params: SpecificTokenParams): Promise<TokenServiceResult<TokenBalance[]>> {
    try {
      if (params.tokenAddresses.length === 0) {
        return {
          success: true,
          data: []
        };
      }


      
      const addresses = params.tokenAddresses.join(',');
      const requestParams = { 
        chainId: params.chainId, 
        userAddress: params.userAddress, 
        addresses 
      };

      const result = await apiClient.get<{ tokens: TokenBalance[] }>('/api/tokens/specific', {
        params: requestParams
      });
      if (!result || !result.tokens || !Array.isArray(result.tokens)) {
        throw new Error('No specific tokens found');
      }

      return {
        success: true,
        data: result.tokens
      };
    } catch (error) {
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to load specific tokens';
      
      return {
        success: false,
        data: [],
        error: errorMessage
      };
    }
  }

  /**
   * Update specific tokens in existing token list
   */
  updateTokensInList(
    existingTokens: TokenBalance[], 
    newTokens: TokenBalance[]
  ): TokenBalance[] {
    return existingTokens.map(existingToken => {
      const updatedToken = newTokens.find(newToken => 
        newToken.token.address.toLowerCase() === existingToken.token.address.toLowerCase()
      );
      return updatedToken || existingToken;
    });
  }

  /**
   * Find default tokens (native and stablecoin)
   */
  findDefaultTokens(tokens: TokenBalance[]): { native?: TokenBalance; stablecoin?: TokenBalance } {
    if (tokens.length === 0) {
      return {};
    }

    // Find native token (address = 0x0000...)
    const native = tokens.find(t => 
      t.token.address === '0x0000000000000000000000000000000000000000'
    );
    
    // Find popular stablecoin (USDC or USDT)
    const stablecoin = tokens.find(t => 
      t.token.symbol === 'USDC' || t.token.symbol === 'USDT'
    ) || (tokens.length > 1 ? tokens.find(t => t !== native) : undefined);

    return { native, stablecoin };
  }

  /**
   * Validate token balance for swap
   */
  validateTokenBalance(token: TokenBalance, requestedAmount: string): {
    isValid: boolean;
    hasInsufficientBalance: boolean;
    error?: string;
  } {
    const numAmount = parseFloat(requestedAmount);
    const balance = parseFloat(token.formattedBalance || '0');

    if (numAmount <= 0) {
      return {
        isValid: false,
        hasInsufficientBalance: false,
        error: 'Please enter a valid amount'
      };
    }

    if (numAmount > balance) {
      return {
        isValid: false,
        hasInsufficientBalance: true,
        error: 'Insufficient balance'
      };
    }

    return {
      isValid: true,
      hasInsufficientBalance: false
    };
  }

  /**
   * Get latest token data from tokens list
   */
  getLatestTokenData(
    tokenAddress: string, 
    tokens: TokenBalance[]
  ): TokenBalance | null {
    return tokens.find(t => 
      t.token.address.toLowerCase() === tokenAddress.toLowerCase()
    ) || null;
  }

  /**
   * Generate cache key for token requests
   */
  private getCacheKey(params: TokenLoadParams): string {
    return `tokens_${params.chainId}_${params.search || 'all'}_${params.userAddress || 'nouser'}`;
  }

  /**
   * Clear all cached tokens
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for specific parameters
   */
  clearCacheFor(params: TokenLoadParams): void {
    const cacheKey = this.getCacheKey(params);
    this.cache.delete(cacheKey);
  }
}

// Export singleton instance
export const tokenService = TokenService.getInstance();