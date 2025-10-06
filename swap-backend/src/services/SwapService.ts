import { 
  Token, 
  TokenBalance, 
  TokenSearchParams,
  Network
} from '../types';
import { BlockchainRepository } from '../repositories/BlockchainRepository';
import { getNetworkByChainIdSync, getNetworkKeyByChainIdSync, COMMON_TOKENS } from '../config/networks';
import { isValidAddress, ETH_ADDRESS } from '../utils/contracts';
import { poolCacheService } from '../utils/pool-cache';
import { priceService } from '../utils/price-service';
import { ethers } from 'ethers';

export class SwapService {
  private blockchainRepository: BlockchainRepository;
  private dbInitialized: boolean = false;

  constructor() {
    this.blockchainRepository = new BlockchainRepository();
    this.initializeDatabase();
  }

  // Initialize database connections
  private async initializeDatabase(): Promise<void> {
    try {
      await poolCacheService.initialize();
      this.dbInitialized = true;
      console.log('✅ Pool cache service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize pool cache service:', error);
      this.dbInitialized = false;
    }
  }

  // Cleanup method for graceful shutdown
  async cleanup(): Promise<void> {
    await Promise.all([
      this.blockchainRepository.cleanup(),
      poolCacheService.cleanup()
    ]);
  }

  // Get tokens with balances
  async getTokensWithBalances(params: TokenSearchParams): Promise<{ tokens: TokenBalance[] }> {
    try {
      const network = getNetworkByChainIdSync(params.chainId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      const networkKey = getNetworkKeyByChainIdSync(params.chainId);
      if (!networkKey) {
        throw new Error('Network key not found');
      }

      let tokens: Token[] = [...(COMMON_TOKENS[networkKey] || [])];

      // If search parameter provided, filter or fetch custom token
      if (params.search) {
        if (isValidAddress(params.search)) {
          // Search is a token address - fetch token info and return only that token
          const customToken = await this.blockchainRepository.getTokenInfo(params.search, network);
          if (customToken) {
            tokens = [customToken]; // Only return the searched token
          } else {
            tokens = []; // No token found for this address
          }
        } else {
          // Search by symbol/name - filter existing tokens
          tokens = tokens.filter(token => 
            token.symbol.toLowerCase().includes(params.search!.toLowerCase()) ||
            token.name.toLowerCase().includes(params.search!.toLowerCase())
          );
        }
      }

      // Get balances if user address provided
      let tokenBalances: TokenBalance[];
      
      if (params.userAddress && isValidAddress(params.userAddress)) {
        tokenBalances = await this.blockchainRepository.getTokenBalances(tokens, params.userAddress, network);
      } else {
        // Return tokens without balances
        tokenBalances = tokens.map(token => ({
          token,
          balance: '0',
          formattedBalance: '0'
        }));
      }

      // Fetch token prices concurrently
      const tokenAddresses = tokens.map(token => token.address);
      const prices = await priceService.getTokenPrices(tokenAddresses, params.chainId);

      // Merge price information into tokens
      tokenBalances.forEach(tokenBalance => {
        const price = prices[tokenBalance.token.address.toLowerCase()];
        if (price) {
          tokenBalance.token.priceUsd = price.priceUsd;
          tokenBalance.token.priceChange24h = price.priceChange24h;
          tokenBalance.token.volume24h = price.volume24h;
        }
        
        // Remove useBinance from response (internal use only)
        delete tokenBalance.token.useBinance;
      });

      return { tokens: tokenBalances };
    } catch (error) {
      console.error('Error in getTokensWithBalances:', error);
      throw error;
    }
  }

  // Get specific tokens with balances (optimized for post-swap refresh)
  async getSpecificTokensWithBalances(params: {
    chainId: number;
    userAddress: string;
    tokenAddresses: string[];
  }): Promise<{ tokens: TokenBalance[] }> {
    try {
      const network = getNetworkByChainIdSync(params.chainId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      const networkKey = getNetworkKeyByChainIdSync(params.chainId);
      if (!networkKey) {
        throw new Error('Network key not found');
      }

      // Build tokens array from addresses
      const tokens: Token[] = [];
      
      for (const address of params.tokenAddresses) {
        if (!isValidAddress(address)) {
          console.warn(`Invalid token address: ${address}`);
          continue;
        }

        // Check if it's ETH (native token)
        if (address === ETH_ADDRESS || address === '0x0000000000000000000000000000000000000000') {
          // Find ETH from common tokens
          const ethToken = (COMMON_TOKENS[networkKey] || []).find(t => t.address === ETH_ADDRESS);
          if (ethToken) {
            tokens.push(ethToken);
          }
        } else {
          // First try to find in common tokens
          let token = (COMMON_TOKENS[networkKey] || []).find(t => 
            t.address.toLowerCase() === address.toLowerCase()
          );
          
          // If not found in common tokens, fetch from blockchain
          if (!token) {
            try {
              const fetchedToken = await this.blockchainRepository.getTokenInfo(address, network);
              if (fetchedToken) {
                token = fetchedToken;
              }
            } catch (error) {
              console.warn(`Failed to fetch token info for ${address}:`, error);
              continue;
            }
          }
          
          if (token) {
            tokens.push(token);
          }
        }
      }

      if (tokens.length === 0) {
        throw new Error('No valid tokens found');
      }

      // Get balances
      const tokenBalances = await this.blockchainRepository.getTokenBalances(
        tokens, 
        params.userAddress, 
        network
      );

      // Fetch token prices concurrently
      const tokenAddresses = tokens.map(token => token.address);
      const prices = await priceService.getTokenPrices(tokenAddresses, params.chainId);

      // Merge price information into tokens
      tokenBalances.forEach(tokenBalance => {
        const price = prices[tokenBalance.token.address.toLowerCase()];
        if (price) {
          tokenBalance.token.priceUsd = price.priceUsd;
          tokenBalance.token.priceChange24h = price.priceChange24h;
          tokenBalance.token.volume24h = price.volume24h;
        }
        
        // Remove useBinance from response (internal use only)
        delete tokenBalance.token.useBinance;
      });

      return { tokens: tokenBalances };
    } catch (error) {
      console.error('Error in getSpecificTokensWithBalances:', error);
      throw error;
    }
  }

  // Get swap quote with calldata for client-side execution
  async getSwapQuote(params: {
    fromTokenAddress: string;
    toTokenAddress: string;
    amount: string;
    slippage: number;
    chainId: number;
    userAddress: string;
  }): Promise<{
    fromToken: Token;
    toToken: Token;
    fromAmount: string;
    toAmount: string;
    minToAmount: string;
    priceImpact: string;
    slippage: string;
    fee: string;
    platformFee: number;
    calldata: string | null;
    value: string;
    gasEstimate: string;
    route: string[];
    moonxQuote: any;
  }> {
    try {
      const network = getNetworkByChainIdSync(params.chainId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      // Get MoonX quote from contract with retry logic
      const moonxQuote = await this.getMoonXQuoteWithRetry(
        params.fromTokenAddress,
        params.toTokenAddress,
        params.amount,
        network
      );

      // If no quote available, return zero values instead of throwing error
      if (!moonxQuote || moonxQuote.amountOut === 0n) {
        const [fromToken, toToken] = await Promise.all([
          this.blockchainRepository.getTokenInfo(params.fromTokenAddress, network),
          this.blockchainRepository.getTokenInfo(params.toTokenAddress, network)
        ]);

        if (!fromToken || !toToken) {
          throw new Error('Token information not found');
        }

        return {
          fromToken,
          toToken,
          fromAmount: ethers.formatUnits(params.amount, fromToken.decimals),
          toAmount: '0',
          minToAmount: '0',
          priceImpact: '0',
          slippage: params.slippage.toString(),
          fee: '0',
          platformFee: 0,
          calldata: null,
          value: '0',
          gasEstimate: '0',
          route: [params.fromTokenAddress, params.toTokenAddress],
          moonxQuote: {
            amountOut: '0',
            liquidity: '0',
            fee: 0,
            version: 0,
            hooks: ethers.ZeroAddress,
            path: [],
            routeData: '0x'
          }
        };
      }

             // Get token info
       const [fromToken, toToken] = await Promise.all([
         this.blockchainRepository.getTokenInfo(params.fromTokenAddress, network),
         this.blockchainRepository.getTokenInfo(params.toTokenAddress, network)
       ]);

       if (!fromToken || !toToken) {
         throw new Error('Token information not found');
       }

      // Calculate amounts with slippage only
      const minToAmount = (moonxQuote.amountOut * BigInt(Math.floor((100 - params.slippage) * 100))) / BigInt(10000);

      // Format amounts
      const fromAmount = ethers.formatUnits(params.amount, fromToken.decimals);
      const toAmount = ethers.formatUnits(moonxQuote.amountOut, toToken.decimals);
      const minToAmountFormatted = ethers.formatUnits(minToAmount, toToken.decimals);

      // Build calldata for MoonX swap
      const calldata = await this.buildSwapCalldata({
        fromTokenAddress: params.fromTokenAddress,
        toTokenAddress: params.toTokenAddress,
        fromAmount: params.amount,
        minToAmount: minToAmount.toString(),
        recipient: params.userAddress,
        slippage: params.slippage,
        moonxQuote
      });

      // Calculate value (for ETH swaps)
      const isETHSwap = params.fromTokenAddress === ethers.ZeroAddress || 
                       params.fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const value = isETHSwap ? params.amount : '0';

      // Estimate gas
      const gasEstimate = await this.estimateGas(calldata, value, params.chainId);

      return {
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        minToAmount: minToAmountFormatted,
        priceImpact: this.calculatePriceImpact(params.amount, moonxQuote.amountOut.toString()),
        slippage: params.slippage.toString(),
        fee: "0", // No platform fee for now
        platformFee: 0, // No platform fee for now
        calldata,
        value,
        gasEstimate,
        route: (moonxQuote.path && moonxQuote.path.length > 0) 
          ? moonxQuote.path 
          : [params.fromTokenAddress, params.toTokenAddress],
        moonxQuote: {
          amountOut: moonxQuote.amountOut.toString(),
          liquidity: moonxQuote.liquidity.toString(),
          fee: moonxQuote.fee,
          version: moonxQuote.version,
          hooks: moonxQuote.hooks,
          path: moonxQuote.path || [],
          routeData: moonxQuote.routeData || '0x'
        }
      };
    } catch (error) {
      console.error('Error in getSwapQuote:', error);
      throw error;
    }
  }

  // Build calldata for MoonX swap according to MoonX-Swap-Guide.md (NEW VERSION)
  private async buildSwapCalldata(params: {
    fromTokenAddress: string;
    toTokenAddress: string;
    fromAmount: string;
    minToAmount: string;
    recipient: string;
    slippage: number;
    moonxQuote: any;
  }): Promise<string> {
    try {
      // Normalize addresses to proper checksum format
      const fromTokenAddress = ethers.getAddress(params.fromTokenAddress);
      const toTokenAddress = ethers.getAddress(params.toTokenAddress);
      const recipient = ethers.getAddress(params.recipient);

      // Convert slippage percentage to basis points (e.g., 0.5% -> 50 basis points)
      const slippageBasisPoints = Math.floor(params.slippage * 100);

      // Validate quote data
      if (!params.moonxQuote || !params.moonxQuote.version) {
        throw new Error('Invalid moonxQuote: missing version');
      }
      if (!params.moonxQuote.amountOut || params.moonxQuote.amountOut === '0' || params.moonxQuote.amountOut === 0n) {
        throw new Error('Invalid moonxQuote: missing or zero amountOut');
      }
      
      // Validate amounts
      if (!params.fromAmount || params.fromAmount === '0') {
        throw new Error('Invalid fromAmount: missing or zero');
      }

      // Build args array according to MoonX-Swap-Guide.md (9 structured args)
      const args = [];
      const version = Number(params.moonxQuote.version);

      // args[0]: SwapRoute - Route information (build from quote result)
      // According to MoonX-Swap-Guide.md: Build SwapRoute from quote result
      const swapRoute = {
        tokenIn: fromTokenAddress,
        tokenOut: toTokenAddress,
        version: version,
        poolFee: Number(params.moonxQuote.fee) || 0,        // Direct from quote
        path: params.moonxQuote.path || [],                 // Direct from quote
        routeData: params.moonxQuote.routeData || "0x",     // Direct from quote
        hookData: "0x"
      };

      args.push(ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint8,uint24,address[],bytes,bytes)"],
        [[
          swapRoute.tokenIn,
          swapRoute.tokenOut,
          swapRoute.version,
          swapRoute.poolFee,
          swapRoute.path,
          swapRoute.routeData,
          swapRoute.hookData
        ]]
      ));

      // args[1]: recipient (optional - can be empty for msg.sender)
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [recipient]));

      // args[2]: RefConfiguration - ALWAYS REQUIRED (no referral in this case)
      const refConfig = {
        refAddress: ethers.ZeroAddress, // No referral
        refFee: 0 // No referral fee
      };
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,uint256)"],
        [[refConfig.refAddress, refConfig.refFee]]
      ));
      
      if (params.fromAmount.toString().includes('e') || params.fromAmount.toString().includes('E')) {
        throw new Error(`Invalid amountIn format (scientific notation): ${params.fromAmount}`);
      }
      
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [params.fromAmount]));

      // args[4]: amountOut (expected from quote) - handle BigInt properly
      let expectedAmountOut: string;
      if (typeof params.moonxQuote.amountOut === 'string') {
        expectedAmountOut = params.moonxQuote.amountOut;
      } else if (typeof params.moonxQuote.amountOut === 'bigint') {
        expectedAmountOut = params.moonxQuote.amountOut.toString();
      } else {
        // Handle BigNumber or other types
        expectedAmountOut = BigInt(params.moonxQuote.amountOut).toString();
      }
      
      if (expectedAmountOut.includes('e') || expectedAmountOut.includes('E')) {
        throw new Error(`Invalid amountOut format (scientific notation): ${expectedAmountOut}`);
      }
      
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [expectedAmountOut]));

      // args[5]: slippage (user-provided slippage in basis points)
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [slippageBasisPoints]));

      // args[6]: useProvidedQuote (true = use provided quote, false = fetch fresh)
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]));

      // args[7]: PlatformConfig - Platform configuration
      const platformConfig = {
        gasOptimization: true,
        mevProtection: false,
        routeType: 0 // 0=best_price, 1=fastest, 2=safest
      };
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(bool,bool,uint8)"],
        [[
          platformConfig.gasOptimization,
          platformConfig.mevProtection,
          platformConfig.routeType
        ]]
      ));

      // args[8]: SwapMetadata - Additional metadata
      const metadata = {
        integratorId: "moonx-farm-pro",
        userData: "0x",
        nonce: 0,
        signature: "0x",
        isPermit2: false,
        aggregatorVersion: 2
      };
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(string,bytes,uint256,bytes,bool,uint8)"],
        [[
          metadata.integratorId,
          metadata.userData,
          metadata.nonce,
          metadata.signature,
          metadata.isPermit2,
          metadata.aggregatorVersion
        ]]
      ));

      // MoonX function ABI according to MoonX-Swap-Guide.md
      const moonxABI = [
        "function moonxExec(bytes[] calldata args) external payable returns (uint256)"
      ];

      const iface = new ethers.Interface(moonxABI);
      const calldata = iface.encodeFunctionData('moonxExec', [args]);

      return calldata;
    } catch (error) {
      console.error('Error building calldata:', error);
      throw new Error('Failed to build swap calldata');
    }
  }

  // Estimate gas for transaction
  private async estimateGas(calldata: string | null, value: string, chainId: number): Promise<string> {
    try {
      // If no calldata, return 0 gas estimate
      if (!calldata) {
        return '0';
      }

      // Base gas estimates for different operations
      const baseGas = 200000; // Base gas for MoonX swap
      const tokenTransferGas = 65000; // Additional gas for token transfers
      
      // Add extra gas based on complexity
      let estimatedGas = baseGas;
      if (value === '0') {
        estimatedGas += tokenTransferGas; // ERC20 transfer requires more gas
      }
      
      // Add 20% buffer
      const gasWithBuffer = Math.floor(estimatedGas * 1.2);
      
      return gasWithBuffer.toString();
    } catch (error) {
      console.error('Error estimating gas:', error);
      return calldata ? '250000' : '0'; // Safe fallback or 0 if no calldata
    }
  }

  // Calculate price impact
  private calculatePriceImpact(amountIn: string, amountOut: string): string {
    try {
      // Simplified price impact calculation
      // In a real implementation, you'd compare with market rates
      const impact = 0.1; // Default 0.1% impact
      return impact.toString();
    } catch (error) {
      return '0.1';
    }
  }

  // Get MoonX quote with retry logic; try direct path and via-ETH multihop first
  private async getMoonXQuoteWithRetry(
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    network: any,
    maxRetries: number = 3
  ): Promise<any> {
    let lastError: Error | null = null;

    // First try: direct [A,B] and multihop [A,ETH,B]
    try {
      const directPromise = this.blockchainRepository.getMoonXQuoteByPath(
        [fromTokenAddress, toTokenAddress], amount, network
      ).then(q => q ? { ...q, routeType: 'direct' } : null);

      const tryViaEth = fromTokenAddress !== ETH_ADDRESS && toTokenAddress !== ETH_ADDRESS;
      const viaEthPromise = tryViaEth 
        ? this.blockchainRepository.getMoonXQuoteByPath(
            [fromTokenAddress, ETH_ADDRESS, toTokenAddress], amount, network
          ).then(q => q ? { ...q, routeType: 'via-eth' } : null)
        : Promise.resolve(null);

      const [q1, q2] = await Promise.all([directPromise, viaEthPromise]);
      const candidates = [q1, q2].filter(q => q && q.amountOut > 0n) as any[];
      if (candidates.length) {
        candidates.sort((a, b) => {
          const l = Number(b.liquidity - a.liquidity);
          if (l !== 0) return l;
          return Number(b.amountOut - a.amountOut);
        });
        return candidates[0];
      }
    } catch (error: any) {
      lastError = error;
    }

    // Second try: Check if tokens have getPoolKey method and use pool key approach
    try {
      const poolKeyQuote = await this.tryGetQuoteWithPoolKey(
        fromTokenAddress,
        toTokenAddress,
        amount,
        network
      );
      if (poolKeyQuote && poolKeyQuote.amountOut > 0n) {
        console.log('Successfully got quote using pool key approach');
        return poolKeyQuote;
      }
    } catch (error: any) {
      console.log('Pool key approach failed, falling back to DB lookup:', error.message);
    }

    // Third try: Get pool info from MongoDB and build quote with hooks
    if (this.dbInitialized) {
      try {
        const dbPoolQuote = await this.tryGetQuoteFromDatabase(
          fromTokenAddress,
          toTokenAddress,
          amount,
          network
        );
        if (dbPoolQuote && dbPoolQuote.amountOut > 0n) {
          console.log('Successfully got quote using database pool info');
          return dbPoolQuote;
        }
      } catch (error: any) {
        console.log('Database pool approach failed:', error.message);
      }
    }

    // Fourth try: Normal quote approach with retry logic
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try both direct and via-eth path in the last attempt loop
        const [direct, viaEth] = await Promise.all([
          this.blockchainRepository.getMoonXQuoteByPath([fromTokenAddress, toTokenAddress], amount, network),
          (fromTokenAddress !== ETH_ADDRESS && toTokenAddress !== ETH_ADDRESS)
            ? this.blockchainRepository.getMoonXQuoteByPath([fromTokenAddress, ETH_ADDRESS, toTokenAddress], amount, network)
            : Promise.resolve(null)
        ]);
        const quote = [direct, viaEth].filter(q => q && q.amountOut > 0n)[0] || direct;
        
        // If successful, return the quote
        if (quote && quote.amountOut > 0n) {
          return quote;
        }
        
        // If quote is null or amountOut is 0, treat as temporary failure
        console.warn(`Empty quote received on attempt ${attempt + 1}`);
        throw new Error('Empty quote received');
        
      } catch (error: any) {
        lastError = error;
        console.warn(`MoonX quote attempt ${attempt + 1} failed:`, error.message);
        
        // Check if it's a rate limit error
        const isRateLimit = error.message?.includes('rate limit') || 
                           error.message?.includes('too many requests') ||
                           error.code === 'CALL_EXCEPTION';
        
        // If it's the last attempt or not a rate limit error, don't retry
        if (attempt === maxRetries - 1 || !isRateLimit) {
          break;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 500;
        console.log(`Rate limit detected, retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    // If all approaches failed, return null instead of throwing error
    console.warn('All quote approaches failed, returning null:', lastError?.message);
    return null;
  }

  // Try to get quote using pool key approach
  private async tryGetQuoteWithPoolKey(
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    network: any
  ): Promise<any> {
    try {
      // Check if either token has getPoolKey method
      const poolKeyInfo = await this.checkTokenPoolKey(fromTokenAddress, toTokenAddress, network);
      
      if (poolKeyInfo) {
        console.log('Found pool key info:', poolKeyInfo);
        // Use the pool key information to get quote
        return await this.blockchainRepository.getMoonXQuoteWithPoolKey(
          fromTokenAddress,
          toTokenAddress,
          amount,
          network,
          poolKeyInfo
        );
      }
      
      return null;
    } catch (error) {
      throw error;
    }
  }

  // Check if tokens have getPoolKey method
  private async checkTokenPoolKey(
    fromTokenAddress: string,
    toTokenAddress: string,
    network: Network
  ): Promise<any> {
    try {
      const provider = this.blockchainRepository.getProviderSync(network);
      
      // ABI for getPoolKey method
      const poolKeyABI = [
        "function getPoolKey(address token0, address token1) external view returns (tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))"
      ];

      // Try to call getPoolKey on both tokens
      const tokens = [fromTokenAddress, toTokenAddress];
      
      for (const tokenAddress of tokens) {
        // Skip ETH address
        if (tokenAddress === ethers.ZeroAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
          continue;
        }

        try {
          const contract = new ethers.Contract(tokenAddress, poolKeyABI, provider);
          
          // Try calling getPoolKey with both token addresses
          const poolKey = await contract.getPoolKey(fromTokenAddress, toTokenAddress);
          
          if (poolKey && poolKey.length >= 5) {
            return {
              currency0: poolKey[0],
              currency1: poolKey[1],
              fee: poolKey[2],
              tickSpacing: poolKey[3],
              hooks: poolKey[4],
              sourceToken: tokenAddress
            };
          }
        } catch (error) {
          // Method doesn't exist or call failed, continue to next token
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error checking pool key:', error);
      return null;
    }
  }



  // Try to get quote using database pool information
  private async tryGetQuoteFromDatabase(
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    network: any
  ): Promise<any> {
    try {
      // Focus on toToken first (destination token usually has the pool info we need)
      const toTokenPoolInfo = await poolCacheService.getPoolInfo(toTokenAddress, network.chainId);
      
      if (toTokenPoolInfo) {

        // Build pool key from toToken pool info (ensure proper token ordering)
        const tIn = BigInt(fromTokenAddress);
        const tOut = BigInt(toTokenAddress);
        const dbPoolKey = {
          currency0: tIn < tOut ? fromTokenAddress : toTokenAddress,
          currency1: tIn < tOut ? toTokenAddress : fromTokenAddress,
          fee: toTokenPoolInfo.fee,
          tickSpacing: toTokenPoolInfo.tickSpacing,
          hooks: toTokenPoolInfo.hooks,
          sourceToken: toTokenAddress
        };

        // Use the database pool key to get quote
        return await this.blockchainRepository.getMoonXQuoteWithPoolKey(
          fromTokenAddress,
          toTokenAddress,
          amount,
          network,
          dbPoolKey
        );
      }

      // Fallback: try fromToken if toToken doesn't have pool info
      const fromTokenPoolInfo = await poolCacheService.getPoolInfo(fromTokenAddress, network.chainId);
      
      if (fromTokenPoolInfo) {

        // Build pool key from fromToken pool info (ensure proper token ordering)
        const tIn = BigInt(fromTokenAddress);
        const tOut = BigInt(toTokenAddress);
        const dbPoolKey = {
          currency0: tIn < tOut ? fromTokenAddress : toTokenAddress,
          currency1: tIn < tOut ? toTokenAddress : fromTokenAddress,
          fee: fromTokenPoolInfo.fee,
          tickSpacing: fromTokenPoolInfo.tickSpacing,
          hooks: fromTokenPoolInfo.hooks,
          sourceToken: fromTokenAddress
        };

        // Use the database pool key to get quote
        return await this.blockchainRepository.getMoonXQuoteWithPoolKey(
          fromTokenAddress,
          toTokenAddress,
          amount,
          network,
          dbPoolKey
        );
      }


      return null;
    } catch (error) {
      console.error('Error getting quote from pool cache service:', error);
      throw error;
    }
  }

  // Helper function for delays
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 