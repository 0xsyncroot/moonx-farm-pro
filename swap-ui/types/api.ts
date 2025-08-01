// API-related types - Independent from implementation

export interface Network {
  name: string;
  chainId: number; // Base network chainId: 8453
  rpc?: string; // Optional - not included in API response for security
  currency: string;
  multicall3Address: string;
  logoUrl: string;
  explorer: string;
}

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  // Extended Jupiter-style fields
  price?: number;           // Current USD price
  priceChange24h?: number;  // 24h price change %
  marketCap?: number;       // Market cap in USD
  volume24h?: number;       // 24h volume
  verified?: boolean;       // Verified token status
  tags?: string[];          // Token tags (e.g., "SOL", "Stablecoin")
}

export interface TokenBalance {
  token: Token;
  balance: string;
  formattedBalance: string;
  // Extended balance info
  balanceUSD?: number;      // Balance value in USD
  balanceFormatted?: string; // Better formatted balance (e.g., "1.23K")
}

export interface SwapQuote {
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  toAmount: string;
  minToAmount: string;
  priceImpact: string;
  slippage: string;
  fee: string;
  route: string[];
  moonxQuote: any;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Wallet-related types  
export interface EncryptedWallet {
  id: string;
  address: string;
  encryptedData: string;
  encryptedPrivateKey?: string; // For backward compatibility
  name: string;
  createdAt: number;
  lastUsed: number;
  credentialId: string;
  publicKey: string;
  requiresSession?: boolean;
}

// Configuration types
export interface RPCSettings {
  baseRpcUrl: string;
  customRpcUrl?: string;
  useCustomRpc: boolean;
}

export interface WalletConfig {
  walletType: 'privy' | 'private';
  privateKey?: string;
}

// Service result types
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}