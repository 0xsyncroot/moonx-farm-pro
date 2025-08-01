import { apiClient } from '@/lib/api';
import type { Network, ServiceResult } from '@/types/api';

export type NetworkServiceResult<T> = ServiceResult<T>;

/**
 * NetworkService - Handles all network-related operations
 * Wraps API calls and provides business logic for network management
 */
export class NetworkService {
  private static instance: NetworkService;
  private cache: { networks?: Network[]; timestamp?: number } = {};
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  private constructor() {}

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  /**
   * Load supported networks with caching
   */
  async loadNetworks(): Promise<NetworkServiceResult<Network[]>> {
    try {
      // Check cache first
      if (this.cache.networks && this.cache.timestamp) {
        const isExpired = Date.now() - this.cache.timestamp > this.CACHE_TTL;
        if (!isExpired) {
          return {
            success: true,
            data: this.cache.networks
          };
        }
      }
      const result = await apiClient.get<{ networks: Network[] }>('/api/networks');
      if (!result || !result.networks || !Array.isArray(result.networks) || result.networks.length === 0) {
        throw new Error('No networks available');
      }

      // Update cache
      this.cache.networks = result.networks;
      this.cache.timestamp = Date.now();

      return {
        success: true,
        data: result.networks
      };
    } catch (error) {
      // Return fallback Base network if API fails
      const fallbackNetworks: Network[] = [{
        name: 'Base',
        chainId: 8453,
        rpc: 'https://mainnet.base.org',
        currency: 'ETH',
        multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      }];

      return {
        success: false,
        data: fallbackNetworks,
        error: error instanceof Error ? error.message : 'Failed to load networks'
      };
    }
  }

  /**
   * Get default network (prioritize Base network)
   */
  getDefaultNetwork(networks: Network[]): Network {
    const baseNetwork = networks.find(network => network.chainId === 8453);
    return baseNetwork || networks[0];
  }

  /**
   * Validate if a network is supported
   */
  isNetworkSupported(chainId: number, networks: Network[]): boolean {
    return networks.some(network => network.chainId === chainId);
  }

  /**
   * Find network by chainId
   */
  findNetworkByChainId(chainId: number, networks: Network[]): Network | null {
    return networks.find(network => network.chainId === chainId) || null;
  }

  /**
   * Clear cache (useful for forced refresh)
   */
  clearCache(): void {
    this.cache = {};
  }
}

// Export singleton instance
export const networkService = NetworkService.getInstance();