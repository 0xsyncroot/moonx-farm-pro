export interface Network {
  name: string;
  chainId: number;
  rpc: string;
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
  balance?: string;
  formattedBalance?: string;
  logoURI?: string;
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