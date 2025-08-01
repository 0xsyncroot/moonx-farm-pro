import { Network, Token } from '../types';
import dotenv from 'dotenv';

dotenv.config();
// MoonX contract addresses by chain ID  
const MOONX_CONTRACT_ADDRESSES: Record<number, string> = {
  8453: process.env.MOONX_BASE_CONTRACT_ADDRESS || '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630', // Base
  // 1: process.env.MOONX_ETHEREUM_CONTRACT_ADDRESS || '', // Ethereum
  // 137: process.env.MOONX_POLYGON_CONTRACT_ADDRESS || '', // Polygon
};

// Get MoonX contract address by chain ID
export const getMoonXContractAddress = (chainId: number): string => {
  const address = MOONX_CONTRACT_ADDRESSES[chainId];
  if (!address) {
    throw new Error(`MoonX contract not deployed on chain ${chainId}`);
  }
  return address;
};

// Legacy export for backward compatibility
export const MOONX_CONTRACT_ADDRESS = getMoonXContractAddress(8453);

// Supported networks - hiện tại focus vào Base
export const NETWORKS: Record<string, Network> = {
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    defaultRpc: 'https://mainnet.base.org',
    currency: 'ETH',
    logoUrl: 'https://raw.githubusercontent.com/base/brand-kit/refs/heads/main/logo/TheSquare/Digital/Base_square_blue.png',
    explorer: 'https://basescan.org',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  }
  // Sẵn sàng thêm networks khác:
  // ethereum: {
  //   name: 'Ethereum',
  //   chainId: 1,
  //   rpc: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
  //   currency: 'ETH',
  //   multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  // },
  // polygon: {
  //   name: 'Polygon',
  //   chainId: 137,
  //   rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
  //   currency: 'MATIC',
  //   multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  // }
};

// Common tokens cho từng network
export const COMMON_TOKENS: Record<string, Token[]> = {
  base: [
    { 
      symbol: 'ETH', 
      name: 'Ethereum', 
      address: '0x0000000000000000000000000000000000000000', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png'
    },
    { 
      symbol: 'USDC', 
      name: 'USD Coin', 
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
    },
    { 
      symbol: 'WETH', 
      name: 'Wrapped Ether', 
      address: '0x4200000000000000000000000000000000000006', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png'
    },
    { 
      symbol: 'DAI', 
      name: 'Dai Stablecoin', 
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/9956/small/4943.png'
    },
    { 
      symbol: 'USDT', 
      name: 'Tether USD', 
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png'
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

// Network utilities
export const getNetworkByChainId = (chainId: number): Network | null => {
  return Object.values(NETWORKS).find(network => network.chainId === chainId) || null;
};

export const getNetworkKeyByChainId = (chainId: number): string | null => {
  return Object.keys(NETWORKS).find(key => NETWORKS[key].chainId === chainId) || null;
};

export const getSupportedChainIds = (): number[] => {
  return Object.values(NETWORKS).map(network => network.chainId);
};

export const isChainSupported = (chainId: number): boolean => {
  return getSupportedChainIds().includes(chainId);
};

// Default network (Base)
export const DEFAULT_NETWORK = NETWORKS.base;
export const DEFAULT_CHAIN_ID = DEFAULT_NETWORK.chainId;

// Network-specific configurations
export const NETWORK_CONFIG = {
  base: {
    blockExplorer: 'https://basescan.org',
    blockTime: 2, // seconds
    confirmations: 1
  }
  // Có thể thêm config cho networks khác
} as const;

export const getNetworkConfig = (networkKey: string) => {
  return NETWORK_CONFIG[networkKey as keyof typeof NETWORK_CONFIG] || null;
}; 