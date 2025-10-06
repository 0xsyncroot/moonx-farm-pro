import { Network, Token } from '../types';
import { networkManager } from '../managers';
import { NetworkConfig } from '../models';
import { networkCacheManager } from '../utils/network-cache';
import dotenv from 'dotenv';

dotenv.config();
// MoonX contract addresses by chain ID  
const MOONX_CONTRACT_ADDRESSES: Record<number, string> = {
  8453: process.env.MOONX_BASE_CONTRACT_ADDRESS || '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630', // Base
  18453: process.env.MOONX_DEV_TEST_CONTRACT_ADDRESS || '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630', // Dev Test
  // 1: process.env.MOONX_ETHEREUM_CONTRACT_ADDRESS || '', // Ethereum
  // 137: process.env.MOONX_POLYGON_CONTRACT_ADDRESS || '', // Polygon
};

// Get MoonX contract address by chain ID (async version - from MongoDB)
export const getMoonXContractAddress = async (chainId: number): Promise<string> => {
  try {
    const network = await networkManager.getNetworkByChainId(chainId);
    if (network && network.moonxContractAddress) {
      return network.moonxContractAddress;
    }
    
    // Fallback to hardcoded addresses if not in DB
    const address = MOONX_CONTRACT_ADDRESSES[chainId];
    if (!address) {
      throw new Error(`MoonX contract not deployed on chain ${chainId}`);
    }
    return address;
  } catch (error) {
    console.error('Error getting MoonX contract address:', error);
    throw error;
  }
};

// Synchronous version for backward compatibility
export const getMoonXContractAddressSync = (chainId: number): string => {
  const address = MOONX_CONTRACT_ADDRESSES[chainId];
  if (!address) {
    throw new Error(`MoonX contract not deployed on chain ${chainId}`);
  }
  return address;
};

// Legacy export for backward compatibility
export const MOONX_CONTRACT_ADDRESS = getMoonXContractAddressSync(8453);

// Initialize network cache manager
let networkCacheInitialized = false;

// Convert NetworkConfig to Network format
const convertNetworkConfig = (config: NetworkConfig): Network => ({
  id: config.id,
  name: config.name,
  chainId: config.chainId,
  rpc: config.rpc,
  defaultRpc: config.defaultRpc,
  fallbackRpcs: config.fallbackRpcs,
  currency: config.currency,
  logoUrl: config.logoUrl,
  explorer: config.explorer,
  multicall3Address: config.multicall3Address
});

// Initialize Redis cache if not already done
const ensureCacheInitialized = async () => {
  if (!networkCacheInitialized) {
    await networkCacheManager.initialize();
    networkCacheInitialized = true;
  }
};

// Load networks from MongoDB with Redis caching
export const loadNetworks = async (): Promise<Record<string, Network>> => {
  try {
    // Initialize cache if needed
    await ensureCacheInitialized();
    
    // Try to get from Redis cache first
    const cachedNetworks = await networkCacheManager.getAllNetworks();
    if (cachedNetworks) {
      return cachedNetworks;
    }

    // Cache miss - load from MongoDB
    const networkConfigs = await networkManager.getNetworks();
    
    if (networkConfigs.length === 0) {
      console.log('🔄 No networks found in DB, initializing defaults...');
      await networkManager.initializeDefaultNetworks();
      const defaultConfigs = await networkManager.getNetworks();
      networkConfigs.push(...defaultConfigs);
    }

    const networks: Record<string, Network> = {};
    networkConfigs.forEach((config: NetworkConfig) => {
      networks[config.id] = convertNetworkConfig(config);
    });

    // Cache to Redis
    await networkCacheManager.cacheAllNetworks(networks);
    
    console.log(`✅ Loaded ${Object.keys(networks).length} networks from MongoDB`);
    return networks;
  } catch (error) {
    console.error('❌ Error loading networks from MongoDB:', error);
    
    // Fallback to hardcoded networks if MongoDB fails
    console.log('🔄 Falling back to hardcoded networks...');
    return getFallbackNetworks();
  }
};

// Fallback hardcoded networks (same as original)
const getFallbackNetworks = (): Record<string, Network> => ({
  base: {
    id: 'base',
    name: 'Base',
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    defaultRpc: 'https://mainnet.base.org',
    fallbackRpcs: [
      process.env.BASE_BACKUP_RPC_URL || 'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
      'https://base.drpc.org',
      'https://1rpc.io/base',
      'https://base.gateway.tenderly.co'
    ],
    currency: 'ETH',
    logoUrl: 'https://raw.githubusercontent.com/base/brand-kit/refs/heads/main/logo/TheSquare/Digital/Base_square_blue.png',
    explorer: 'https://basescan.org',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  },
  devTest: {
    id: 'baseDevTest',
    name: 'Dev Test',
    chainId: 18453,
    rpc: process.env.DEV_TEST_RPC_URL || 'http://localhost:8645',
    defaultRpc: 'http://localhost:8645',
    fallbackRpcs: [
      process.env.DEV_TEST_RPC_URL || 'http://localhost:8645',
    ],
    currency: 'ETH',
    logoUrl: 'https://raw.githubusercontent.com/base/brand-kit/refs/heads/main/logo/TheSquare/Digital/Base_square_blue.png',
    explorer: 'https://basescan.org',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  }
});

// Get networks (async version)
export const getNetworks = async (): Promise<Record<string, Network>> => {
  return await loadNetworks();
};

// Synchronous version for backward compatibility (uses cache or fallback)
export const NETWORKS: Record<string, Network> = getFallbackNetworks();

// Common tokens cho từng network
export const COMMON_TOKENS: Record<string, Token[]> = {
  base: [
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      address: '0x0000000000000000000000000000000000000000', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      useBinance: true
    },
    { 
      symbol: 'USDC', 
      name: 'USD Coin', 
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
      useBinance: true
    },
    { 
      symbol: 'WETH', 
      name: 'Wrapped Ether', 
      address: '0x4200000000000000000000000000000000000006', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
      useBinance: true
    },
    { 
      symbol: 'DAI', 
      name: 'Dai Stablecoin', 
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/9956/small/4943.png',
      useBinance: true
    },
    { 
      symbol: 'USDT', 
      name: 'Tether USD', 
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
      useBinance: true
    },
    {
      symbol: 'ZORA',
      name: 'Zora',
      address: '0x1111111111166b7FE7bd91427724B487980aFc69',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/54693/standard/zora.jpg'
      // useBinance: false (không set vì ZORA không có trên Binance)
    },
    {
      symbol: 'VIRTUAL',
      name: 'Virtual Protocol',
      address: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/36190/standard/virtual.jpg'
      // useBinance: false (không set vì VIRTUAL không có trên Binance)
    }
  ],
  devTest: [
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      address: '0x0000000000000000000000000000000000000000', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      useBinance: true
    },
    { 
      symbol: 'USDC', 
      name: 'USD Coin', 
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
      useBinance: true
    },
    { 
      symbol: 'WETH', 
      name: 'Wrapped Ether', 
      address: '0x4200000000000000000000000000000000000006', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
      useBinance: true
    },
    { 
      symbol: 'DAI', 
      name: 'Dai Stablecoin', 
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/9956/small/4943.png',
      useBinance: true
    },
    { 
      symbol: 'USDT', 
      name: 'Tether USD', 
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png',
      useBinance: true
    },
    {
      symbol: 'ZORA',
      name: 'Zora',
      address: '0x1111111111166b7FE7bd91427724B487980aFc69',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/54693/standard/zora.jpg'
      // useBinance: false (không set vì ZORA không có trên Binance)
    },
    {
      symbol: 'VIRTUAL',
      name: 'Virtual Protocol',
      address: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/36190/standard/virtual.jpg'
      // useBinance: false (không set vì VIRTUAL không có trên Binance)
    }
  ]
  // Templates cho networks khác:
  // ethereum: [
  //   { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  //   { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86a33E6417c0b93F5e8E75C078B4a8F93E7A2', decimals: 6 },
  //   { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  //   { symbol: 'WETH', name: 'Wrapped Ether', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 }
  // ]
};

// Network utilities (async versions)
export const getNetworkByChainId = async (chainId: number): Promise<Network | null> => {
  try {
    // Initialize cache if needed
    await ensureCacheInitialized();
    
    // Try Redis cache first
    const cachedNetwork = await networkCacheManager.getNetworkByChainId(chainId);
    if (cachedNetwork) {
      return cachedNetwork;
    }

    // Cache miss - get from MongoDB
    const networkConfig = await networkManager.getNetworkByChainId(chainId);
    if (networkConfig) {
      const network = convertNetworkConfig(networkConfig);
      // Cache the individual network for future requests
      await networkCacheManager.cacheAllNetworks({ [network.id]: network });
      return network;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting network by chain ID from MongoDB:', error);
    // Fallback to hardcoded networks
    const networks = getFallbackNetworks();
    return Object.values(networks).find(network => network.chainId === chainId) || null;
  }
};

// Synchronous version for backward compatibility
export const getNetworkByChainIdSync = (chainId: number): Network | null => {
  const networks = getFallbackNetworks();
  return Object.values(networks).find(network => network.chainId === chainId) || null;
};

export const getNetworkKeyByChainId = async (chainId: number): Promise<string | null> => {
  try {
    const networkConfig = await networkManager.getNetworkByChainId(chainId);
    return networkConfig ? networkConfig.id : null;
  } catch (error) {
    console.error('Error getting network key by chain ID from MongoDB:', error);
    // Fallback to hardcoded networks
    const networks = getFallbackNetworks();
    return Object.keys(networks).find(key => networks[key].chainId === chainId) || null;
  }
};

// Synchronous version for backward compatibility
export const getNetworkKeyByChainIdSync = (chainId: number): string | null => {
  const networks = getFallbackNetworks();
  return Object.keys(networks).find(key => networks[key].chainId === chainId) || null;
};

export const getSupportedChainIds = async (): Promise<number[]> => {
  try {
    // Initialize cache if needed
    await ensureCacheInitialized();
    
    // Try Redis cache first
    const cachedChainIds = await networkCacheManager.getSupportedChainIds();
    if (cachedChainIds) {
      return cachedChainIds;
    }

    // Cache miss - get from MongoDB
    const chainIds = await networkManager.getSupportedChainIds();
    
    // Update cache
    const networks = await loadNetworks(); // This will cache the networks
    return Object.values(networks).map(network => network.chainId);
  } catch (error) {
    console.error('Error getting supported chain IDs from MongoDB:', error);
    // Fallback to hardcoded networks
    const networks = getFallbackNetworks();
    return Object.values(networks).map(network => network.chainId);
  }
};

// Synchronous version for backward compatibility
export const getSupportedChainIdsSync = (): number[] => {
  const networks = getFallbackNetworks();
  return Object.values(networks).map(network => network.chainId);
};

export const isChainSupported = async (chainId: number): Promise<boolean> => {
  try {
    const supportedChainIds = await getSupportedChainIds();
    return supportedChainIds.includes(chainId);
  } catch (error) {
    console.error('Error checking if chain is supported:', error);
    // Fallback to hardcoded networks
    const networks = getFallbackNetworks();
    return Object.values(networks).some(network => network.chainId === chainId);
  }
};

// Synchronous version for backward compatibility
export const isChainSupportedSync = (chainId: number): boolean => {
  const networks = getFallbackNetworks();
  return Object.values(networks).some(network => network.chainId === chainId);
};

// Default network (Base) - will be loaded dynamically
export let DEFAULT_NETWORK: Network;
export let DEFAULT_CHAIN_ID: number;

// Initialize default network
const initializeDefaults = async () => {
  try {
    const networks = await loadNetworks();
    DEFAULT_NETWORK = networks.base || Object.values(networks)[0];
    DEFAULT_CHAIN_ID = DEFAULT_NETWORK.chainId;
  } catch (error) {
    console.error('Error initializing default network:', error);
    const fallbackNetworks = getFallbackNetworks();
    DEFAULT_NETWORK = fallbackNetworks.base;
    DEFAULT_CHAIN_ID = DEFAULT_NETWORK.chainId;
  }
};

// Initialize on module load
initializeDefaults().catch(console.error);

// Network-specific configurations (will be loaded from MongoDB)
export const getNetworkConfig = async (networkKey: string) => {
  try {
    const networkConfig = await networkManager.getNetworkById(networkKey);
    if (networkConfig) {
      return {
        blockExplorer: networkConfig.blockExplorer,
        blockTime: networkConfig.blockTime,
        confirmations: networkConfig.confirmations
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting network config:', error);
    return null;
  }
};

// Synchronous version with fallback
export const getNetworkConfigSync = (networkKey: string) => {
  const fallbackConfigs: Record<string, any> = {
    base: {
      blockExplorer: 'https://basescan.org',
      blockTime: 2,
      confirmations: 1
    },
    devTest: {
      blockExplorer: 'https://basescan.org',
      blockTime: 2,
      confirmations: 1
    }
  };
  
  return fallbackConfigs[networkKey] || null;
};



// Get all available RPC URLs for a network (primary + default + fallbacks)
export const getAllRpcUrls = (network: Network): string[] => {
  const rpcUrls = [network.rpc].filter(url => url && url.trim() !== '');
  
  // Add default RPC if different and not empty
  if (network.defaultRpc && 
      network.defaultRpc.trim() !== '' && 
      network.defaultRpc !== network.rpc) {
    rpcUrls.push(network.defaultRpc);
  }
  
  // Add fallback RPCs, filtering out empty/invalid URLs
  if (network.fallbackRpcs && network.fallbackRpcs.length > 0) {
    const validFallbacks = network.fallbackRpcs.filter(url => 
      url && 
      url.trim() !== '' && 
      !rpcUrls.includes(url) &&
      (url.startsWith('http://') || url.startsWith('https://'))
    );
    rpcUrls.push(...validFallbacks);
  }
  
  return rpcUrls;
};

// Get RPC URLs by chain ID (async version)
export const getRpcUrlsByChainId = async (chainId: number): Promise<string[]> => {
  const network = await getNetworkByChainId(chainId);
  return network ? getAllRpcUrls(network) : [];
};

// Synchronous version for backward compatibility
export const getRpcUrlsByChainIdSync = (chainId: number): string[] => {
  const network = getNetworkByChainIdSync(chainId);
  return network ? getAllRpcUrls(network) : [];
};

// Cache management utilities
export const clearNetworksCache = async (): Promise<void> => {
  await ensureCacheInitialized();
  await networkCacheManager.invalidateAllCache();
  console.log('🔄 Networks cache cleared');
};

export const refreshNetworksCache = async (): Promise<void> => {
  await clearNetworksCache();
  await loadNetworks();
  console.log('🔄 Networks cache refreshed');
};

// Network management utilities
export const addNetwork = async (networkConfig: Omit<NetworkConfig, 'createdAt' | 'updatedAt'>): Promise<NetworkConfig | null> => {
  try {
    const result = await networkManager.upsertNetwork(networkConfig);
    if (result) {
      await refreshNetworksCache();
      console.log(`✅ Network ${networkConfig.name} added/updated`);
    }
    return result;
  } catch (error) {
    console.error('Error adding network:', error);
    return null;
  }
};

export const removeNetwork = async (chainId: number): Promise<boolean> => {
  try {
    const result = await networkManager.deactivateNetwork(chainId);
    if (result) {
      await refreshNetworksCache();
      console.log(`✅ Network with chain ID ${chainId} deactivated`);
    }
    return result;
  } catch (error) {
    console.error('Error removing network:', error);
    return false;
  }
}; 