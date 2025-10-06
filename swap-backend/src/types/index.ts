export interface Network {
  id: string;
  name: string;
  chainId: number;
  rpc: string;
  defaultRpc: string;
  fallbackRpcs?: string[]; // Additional RPC URLs for redundancy
  currency: string;
  multicall3Address: string;
  logoUrl: string;
  explorer: string;
  moonxContractAddress?: string;
}

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance?: string;
  formattedBalance?: string;
  logoURI?: string;
  useBinance?: boolean; // Internal: true if token price available from Binance API (not in response)
  // Price information
  priceUsd?: number;
  priceChange24h?: number;
  volume24h?: number;
}

export interface TokenBalance {
  token: Token;
  balance: string;
  formattedBalance: string;
}

export interface MoonXQuoteResult {
  amountOut: bigint;
  liquidity: bigint;
  fee: number;
  version: number;
  hooks: string;
  path: string[];
  routeData: string;
  poolKey?: any; // Optional pool key information
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
  moonxQuote: MoonXQuoteResult;
}

export interface QuoteRequest {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage?: number;
  chainId: number;
}

export interface SwapRequest {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage: number;
  recipientAddress: string;
  referralAddress?: string;
  referralFee?: number;
  chainId: number;
}

export interface TokenSearchParams {
  search?: string;
  userAddress?: string;
  chainId: number;
}

export interface SwapTransaction {
  hash: string;
  status: 'pending' | 'success' | 'failed';
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
} 