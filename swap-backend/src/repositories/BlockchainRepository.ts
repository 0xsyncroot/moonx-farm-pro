import { ethers, Contract, JsonRpcProvider, Interface } from 'ethers';
import { Network, Token, TokenBalance, MoonXQuoteResult } from '../types';
import { ERC20_ABI, MULTICALL3_ABI, MOONX_ABI, formatBalance, isValidAddress, ETH_ADDRESS } from '../utils/contracts';
import { MOONX_CONTRACT_ADDRESS, getAllRpcUrls } from '../config/networks';
import { withRetry, RetryError } from '../utils/retry';

export class BlockchainRepository {
  private providers: Map<number, JsonRpcProvider> = new Map();
  private providerCreationLocks: Map<number, Promise<JsonRpcProvider>> = new Map();

  constructor() {}

  // Cleanup method for graceful shutdown
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up blockchain connections...');
    
    for (const [chainId, provider] of this.providers) {
      try {
        // Close provider connection if available
        if (provider && typeof provider.destroy === 'function') {
          await provider.destroy();
        }
      } catch (error) {
        console.warn(`Warning: Failed to cleanup provider for chain ${chainId}:`, error);
      }
    }
    
    this.providers.clear();
    this.providerCreationLocks.clear();
    console.log('✅ Blockchain connections cleaned up');
  }

  // Get or create provider for network with retry and fallback
  async getProvider(network: Network): Promise<JsonRpcProvider> {
    // If provider already exists, return it
    if (this.providers.has(network.chainId)) {
      return this.providers.get(network.chainId)!;
    }

    // If provider is being created, wait for it
    if (this.providerCreationLocks.has(network.chainId)) {
      return await this.providerCreationLocks.get(network.chainId)!;
    }

    // Create new provider with lock to prevent concurrent creation
    const creationPromise = this.createProviderWithFallbackAsync(network);
    this.providerCreationLocks.set(network.chainId, creationPromise);

    try {
      const provider = await creationPromise;
      this.providers.set(network.chainId, provider);
      return provider;
    } finally {
      this.providerCreationLocks.delete(network.chainId);
    }
  }

  // Synchronous version for backwards compatibility (creates provider without testing)
  getProviderSync(network: Network): JsonRpcProvider {
    if (!this.providers.has(network.chainId)) {
      const rpcUrls = getAllRpcUrls(network);
      const provider = new ethers.JsonRpcProvider(rpcUrls[0] || network.rpc);
      this.providers.set(network.chainId, provider);
      
      // Test connection in background
      this.testProviderConnection(provider, network, rpcUrls[0] || network.rpc)
        .catch(error => console.warn('Background provider test failed:', error));
    }
    return this.providers.get(network.chainId)!;
  }

  // Create provider with fallback RPC URLs (sync version)
  private createProviderWithFallback(network: Network): JsonRpcProvider {
    const rpcUrls = getAllRpcUrls(network);
    console.log(`🔌 Available RPC endpoints for ${network.name}: ${rpcUrls.length} URLs`);

    // Use first available URL
    const primaryUrl = rpcUrls[0] || network.rpc;
    console.log(`🔌 Creating provider for ${network.name} via ${primaryUrl}`);
    const provider = new ethers.JsonRpcProvider(primaryUrl);
    
    // Test connection in background
    this.testProviderConnection(provider, network, primaryUrl)
      .catch(error => console.warn('Background provider test failed:', error));
    
    return provider;
  }

  // Create provider with fallback RPC URLs (async version with testing)
  private async createProviderWithFallbackAsync(network: Network): Promise<JsonRpcProvider> {
    const rpcUrls = getAllRpcUrls(network);
    console.log(`🔌 Available RPC endpoints for ${network.name}: ${rpcUrls.length} URLs`);

    if (rpcUrls.length === 0) {
      console.warn(`⚠️  No valid RPC URLs for ${network.name}, using default: ${network.rpc}`);
      return new ethers.JsonRpcProvider(network.rpc);
    }

    // Try each RPC URL until one works
    for (const rpcUrl of rpcUrls) {
      try {
        console.log(`🔌 Testing connection to ${network.name} via ${rpcUrl}`);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Test connection immediately
        await this.testProviderConnection(provider, network, rpcUrl);
        
        console.log(`✅ Successfully connected to ${network.name} via ${rpcUrl}`);
        return provider;
      } catch (error) {
        console.warn(`❌ Failed to connect to ${rpcUrl}:`, error instanceof Error ? error.message : String(error));
        continue;
      }
    }

    // If all RPCs fail, use the primary one and log warning
    console.warn(`⚠️  All RPC URLs failed for ${network.name}, falling back to primary: ${network.rpc}`);
    return new ethers.JsonRpcProvider(network.rpc);
  }

  // Test provider connection asynchronously
  private async testProviderConnection(provider: JsonRpcProvider, network: Network, rpcUrl: string): Promise<void> {
    await withRetry(
      async () => {
        const blockNumber = await provider.getBlockNumber();
        if (blockNumber <= 0) {
          throw new Error('Invalid block number received');
        }
        console.log(`✅ Provider connected to ${network.name} via ${rpcUrl} (block: ${blockNumber})`);
      },
      {
        maxAttempts: 2,
        initialDelay: 500,
        retryCondition: (error: any) => {
          // Retry on network errors and timeouts, but not on permanent failures
          return error.code === 'NETWORK_ERROR' || 
                 error.code === 'TIMEOUT' ||
                 error.message?.includes('failed to detect network') ||
                 error.message?.includes('could not detect network');
        }
      }
    );
  }

  // Health check for provider
  async checkProviderHealth(network: Network): Promise<boolean> {
    try {
      const provider = this.getProviderSync(network);
      const blockNumber = await provider.getBlockNumber();
      return blockNumber > 0;
    } catch (error) {
      console.warn(`Provider health check failed for ${network.name}:`, error);
      return false;
    }
  }

  // Refresh provider for a network (useful when current provider fails)
  async refreshProvider(network: Network): Promise<JsonRpcProvider> {
    console.log(`🔄 Refreshing provider for ${network.name}`);
    
    // Remove existing provider
    this.providers.delete(network.chainId);
    this.providerCreationLocks.delete(network.chainId);
    
    // Create new provider with full testing
    return await this.getProvider(network);
  }

  // Get token info from contract with retry
  async getTokenInfo(tokenAddress: string, network: Network): Promise<Token | null> {
    try {
      if (!isValidAddress(tokenAddress)) {
        return null;
      }

      // Handle native token
      if (tokenAddress === ETH_ADDRESS) {
        return {
          symbol: network.currency,
          name: network.currency,
          address: ETH_ADDRESS,
          decimals: 18
        };
      }

      const retryResult = await withRetry(
        async () => {
          const provider = this.getProviderSync(network);
          const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);

          const [symbol, name, decimals] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.name(),
            tokenContract.decimals()
          ]);

          return {
            symbol: symbol as string,
            name: name as string,
            address: tokenAddress,
            decimals: Number(decimals)
          };
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          retryCondition: (error: any) => {
            // Retry on RPC errors, network issues, and rate limits
            return error.code === 'NETWORK_ERROR' ||
                   error.code === 'SERVER_ERROR' ||
                   error.code === 'TIMEOUT' ||
                   error.code === 'CALL_EXCEPTION' ||
                   error.message?.includes('could not detect network') ||
                   error.message?.includes('rate limit') ||
                   error.message?.includes('too many requests');
          }
        }
      );

      return retryResult.data;
    } catch (error) {
      console.error(`Error getting token info for ${tokenAddress}:`, error);
      return null;
    }
  }

  // Get multiple token balances using Multicall3 with retry
  async getTokenBalances(tokens: Token[], userAddress: string, network: Network): Promise<TokenBalance[]> {
    try {
      if (!isValidAddress(userAddress) || tokens.length === 0) {
        return [];
      }

      const retryResult = await withRetry(
        async () => {
          const provider = this.getProviderSync(network);
          const multicall = new Contract(network.multicall3Address, MULTICALL3_ABI, provider);
          
          // Prepare multicall data
          const calls = tokens.map(token => {
            if (token.address === ETH_ADDRESS) {
              // For native token, we'll handle separately
              return {
                target: multicall.target, // dummy target
                allowFailure: true,
                callData: "0x"
              };
            } else {
              // For ERC20 tokens
              const tokenInterface = new Interface(ERC20_ABI);
              const callData = tokenInterface.encodeFunctionData("balanceOf", [userAddress]);
              return {
                target: token.address,
                allowFailure: true,
                callData: callData
              };
            }
          });

          // Execute multicall as static call (view function, not transaction)
          const [results, nativeBalance] = await Promise.all([
            multicall.aggregate3.staticCall(calls),
            provider.getBalance(userAddress)
          ]);
          
          return { results, nativeBalance };
        },
        {
          maxAttempts: 3,
          initialDelay: 800,
          retryCondition: (error: any) => {
            return error.code === 'NETWORK_ERROR' ||
                   error.code === 'SERVER_ERROR' ||
                   error.code === 'TIMEOUT' ||
                   error.code === 'CALL_EXCEPTION' ||
                   error.message?.includes('could not detect network') ||
                   error.message?.includes('rate limit') ||
                   error.message?.includes('too many requests');
          }
        }
      );

      const { results, nativeBalance } = retryResult.data;

      // Process results
      const tokenBalances: TokenBalance[] = [];
      
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let balance = BigInt(0);

        if (token.address === ETH_ADDRESS) {
          balance = nativeBalance;
        } else {
          const result = results[i];
          if (result.success && result.returnData !== "0x") {
            try {
              // Decode ABI-encoded balance from multicall result
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result.returnData);
              balance = BigInt(decoded[0]);
            } catch (error) {
              console.error(`Error parsing balance for ${token.symbol}:`, error);
            }
          }
        }

        tokenBalances.push({
          token,
          balance: balance.toString(),
          formattedBalance: formatBalance(balance, token.decimals)
        });
      }

      return tokenBalances;
    } catch (error) {
      console.error('Error getting token balances:', error);
      return tokens.map(token => ({
        token,
        balance: '0',
        formattedBalance: '0'
      }));
    }
  }

  // Get MoonX quote for direct path [tokenIn, tokenOut] using QuoteParams
  async getMoonXQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    network: Network
  ): Promise<MoonXQuoteResult | null> {
    return this.getMoonXQuoteByPath([tokenIn, tokenOut], amountIn, network);
  }

  // Get MoonX quote for an arbitrary path [A,B] or [A,B,C] using QuoteParams
  async getMoonXQuoteByPath(
    path: string[],
    amountIn: string,
    network: Network,
    v4Data: string = "0x"
  ): Promise<MoonXQuoteResult | null> {
    try {
      const retryResult = await withRetry(
        async () => {
          const provider = this.getProviderSync(network);
          const moonxContract = new Contract(MOONX_CONTRACT_ADDRESS, MOONX_ABI, provider);

          const quoteParams = {
            path,
            amountIn,
            v4Data
          };

          const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
            [quoteParams]
          );

          const quote = await moonxContract.moonxGetQuote.staticCall([encodedParams]);

          return {
            amountOut: BigInt(quote.amountOut),
            liquidity: BigInt(quote.liquidity),
            fee: Number(quote.fee),
            version: Number(quote.version),
            hooks: quote.hooks,
            path: (quote.path && quote.path.length > 0) ? quote.path : path,
            routeData: quote.routeData || '0x'
          };
        },
        {
          maxAttempts: 3,
          initialDelay: 500,
          retryCondition: (error: any) => {
            if (error.message?.includes('insufficient') || 
                error.message?.includes('liquidity') ||
                error.message?.includes('pool not found')) {
              return false;
            }
            return error.code === 'NETWORK_ERROR' ||
                   error.code === 'SERVER_ERROR' ||
                   error.code === 'TIMEOUT' ||
                   error.code === 'CALL_EXCEPTION' ||
                   error.message?.includes('could not detect network') ||
                   error.message?.includes('rate limit');
          }
        }
      );

      return retryResult.data;
    } catch (error) {
      console.error('Error getting MoonX quote by path:', error);
      return null;
    }
  }

  // Get MoonX quote with pool key information and retry
  async getMoonXQuoteWithPoolKey(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    network: Network,
    poolKeyInfo: any
  ): Promise<MoonXQuoteResult | null> {
    try {
      const retryResult = await withRetry(
        async () => {
          // Build v4 PathKey data according to MoonX-Swap-Guide.md and use QuoteParams
          const tIn = BigInt(tokenIn);
          const tOut = BigInt(tokenOut);
          const token0 = tIn < tOut ? tokenIn : tokenOut;
          const token1 = tIn < tOut ? tokenOut : tokenIn;

          const v4Data = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,uint24,int24,address,bytes)[]"],
            [[[
              token0,
              token1,
              poolKeyInfo.fee,
              poolKeyInfo.tickSpacing,
              poolKeyInfo.hooks,
              "0x"
            ]]]
          );

          const quoteByPath = await this.getMoonXQuoteByPath([tokenIn, tokenOut], amountIn, network, v4Data);
          return quoteByPath ? { ...quoteByPath, poolKey: poolKeyInfo } : null;
        },
        {
          maxAttempts: 3,
          initialDelay: 500,
          retryCondition: (error: any) => {
            // Don't retry on pool-specific errors
            if (error.message?.includes('insufficient') || 
                error.message?.includes('liquidity') ||
                error.message?.includes('pool not found') ||
                error.message?.includes('invalid pool key')) {
              return false;
            }
            
            return error.code === 'NETWORK_ERROR' ||
                   error.code === 'SERVER_ERROR' ||
                   error.code === 'TIMEOUT' ||
                   error.code === 'CALL_EXCEPTION' ||
                   error.message?.includes('could not detect network') ||
                   error.message?.includes('rate limit');
          }
        }
      );

      return retryResult.data;
    } catch (error) {
      console.error('Error getting MoonX quote with pool key:', error);
      return null;
    }
  }

  // Get MoonX quote with specific hooks and retry
  async getMoonXQuoteWithHooks(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    network: Network,
    hooks: string
  ): Promise<MoonXQuoteResult | null> {
    try {
      const retryResult = await withRetry(
        async () => {
          const provider = this.getProviderSync(network);
          const moonxContract = new Contract(MOONX_CONTRACT_ADDRESS, MOONX_ABI, provider);

          // Build quote args with specific hooks
          const quoteArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [hooks])
          ];

          const quote = await moonxContract.moonxGetQuote.staticCall(quoteArgs);

          return {
            amountOut: BigInt(quote.amountOut),
            liquidity: BigInt(quote.liquidity),
            fee: Number(quote.fee),
            version: Number(quote.version),
            hooks: quote.hooks,
            path: quote.path || [],
            routeData: quote.routeData || '0x'
          };
        },
        {
          maxAttempts: 3,
          initialDelay: 500,
          retryCondition: (error: any) => {
            // Don't retry on hooks-specific errors
            if (error.message?.includes('insufficient') || 
                error.message?.includes('liquidity') ||
                error.message?.includes('pool not found') ||
                error.message?.includes('invalid hooks')) {
              return false;
            }
            
            return error.code === 'NETWORK_ERROR' ||
                   error.code === 'SERVER_ERROR' ||
                   error.code === 'TIMEOUT' ||
                   error.code === 'CALL_EXCEPTION' ||
                   error.message?.includes('could not detect network') ||
                   error.message?.includes('rate limit');
          }
        }
      );

      return retryResult.data;
    } catch (error) {
      console.error('Error getting MoonX quote with hooks:', error);
      return null;
    }
  }
} 