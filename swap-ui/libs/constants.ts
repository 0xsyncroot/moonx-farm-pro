// Network constants are now managed by NetworkService
// This file only contains API endpoints and error messages

// API endpoints - Real backend integration
export const API_ENDPOINTS = {
  NETWORKS: '/api/networks',
  TOKENS: '/api/tokens',
  QUOTE: '/api/quote',
  SWAP: '/api/swap',
  ALLOWANCE: '/api/allowance',
  HEALTH: '/health',
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection error. Please check your internet connection and try again.',
  TOKEN_NOT_FOUND: 'Token not found on this network. Please verify the token address.',
  INSUFFICIENT_LIQUIDITY: 'Insufficient liquidity for this trade. Try a smaller amount.',
  QUOTE_FAILED: 'Unable to get quote. Please try again or use different tokens.',
  SWAP_FAILED: 'Transaction failed. Please try again.',
  WALLET_NOT_CONNECTED: 'Please connect your wallet first.',
  INVALID_AMOUNT: 'Please enter a valid amount.',
};

// Default token addresses on Base network (real addresses, not mocked)
export const DEFAULT_TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000', // Native ETH
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Real USDC on Base
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // Real USDT on Base
};

export default {
  API_ENDPOINTS,
  ERROR_MESSAGES,
  DEFAULT_TOKENS,
}; 