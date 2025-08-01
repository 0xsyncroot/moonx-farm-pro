import { ethers, Contract, JsonRpcProvider, Interface } from 'ethers';
import { Network, Token, TokenBalance, MoonXQuoteResult } from '../types';
import { ERC20_ABI, MULTICALL3_ABI, MOONX_ABI, formatBalance, isValidAddress, ETH_ADDRESS } from '../utils/contracts';
import { MOONX_CONTRACT_ADDRESS } from '../config/networks';

export class BlockchainRepository {
  private providers: Map<number, JsonRpcProvider> = new Map();

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
    console.log('✅ Blockchain connections cleaned up');
  }

  // Get or create provider for network
  getProvider(network: Network): JsonRpcProvider {
    if (!this.providers.has(network.chainId)) {
      const provider = new ethers.JsonRpcProvider(network.rpc);
      this.providers.set(network.chainId, provider);
    }
    return this.providers.get(network.chainId)!;
  }

  // Get token info from contract
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

      const provider = this.getProvider(network);
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
    } catch (error) {
      console.error('Error getting token info:', error);
      return null;
    }
  }

  // Get multiple token balances using Multicall3
  async getTokenBalances(tokens: Token[], userAddress: string, network: Network): Promise<TokenBalance[]> {
    try {
      if (!isValidAddress(userAddress) || tokens.length === 0) {
        return [];
      }

      const provider = this.getProvider(network);
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
      const results = await multicall.aggregate3.staticCall(calls);
      
      // Get native token balance separately
      const nativeBalance = await provider.getBalance(userAddress);

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

  // Get MoonX quote - Updated to match MoonX-Swap-Guide.md format
  async getMoonXQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    network: Network
  ): Promise<MoonXQuoteResult | null> {
    try {
      const provider = this.getProvider(network);
      const moonxContract = new Contract(MOONX_CONTRACT_ADDRESS, MOONX_ABI, provider);

      // Build quote args according to MoonX-Swap-Guide.md
      const quoteArgs = [
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]),
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]),
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn])
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
    } catch (error) {
      console.error('Error getting MoonX quote:', error);
      return null;
    }
  }
} 