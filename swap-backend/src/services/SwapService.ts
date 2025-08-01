import { 
  Token, 
  TokenBalance, 
  SwapQuote, 
  QuoteRequest, 
  SwapRequest, 
  TokenSearchParams,
  MoonXQuoteResult 
} from '../types';
import { BlockchainRepository } from '../repositories/BlockchainRepository';
import { getNetworkByChainId, getNetworkKeyByChainId, COMMON_TOKENS } from '../config/networks';
import { formatBalance, parseAmount, isValidAddress, ETH_ADDRESS } from '../utils/contracts';
import { ethers } from 'ethers';

export class SwapService {
  private blockchainRepository: BlockchainRepository;

  constructor() {
    this.blockchainRepository = new BlockchainRepository();
  }

  // Cleanup method for graceful shutdown
  async cleanup(): Promise<void> {
    await this.blockchainRepository.cleanup();
  }

  // Get tokens with balances
  async getTokensWithBalances(params: TokenSearchParams): Promise<{ tokens: TokenBalance[] }> {
    try {
      const network = getNetworkByChainId(params.chainId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      const networkKey = getNetworkKeyByChainId(params.chainId);
      if (!networkKey) {
        throw new Error('Network key not found');
      }

      let tokens: Token[] = [...(COMMON_TOKENS[networkKey] || [])];

      // If search parameter provided, filter or fetch custom token
      if (params.search) {
        if (isValidAddress(params.search)) {
          // Search is a token address - fetch token info
          const customToken = await this.blockchainRepository.getTokenInfo(params.search, network);
          if (customToken) {
            // Add to beginning of list if not already present
            const exists = tokens.find(t => t.address.toLowerCase() === customToken.address.toLowerCase());
            if (!exists) {
              tokens = [customToken, ...tokens];
            }
          }
        } else {
          // Search by symbol/name
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
      const network = getNetworkByChainId(params.chainId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      const networkKey = getNetworkKeyByChainId(params.chainId);
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
    calldata: string;
    value: string;
    gasEstimate: string;
    route: string[];
    moonxQuote: any;
  }> {
    try {
      const network = getNetworkByChainId(params.chainId);
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

      if (!moonxQuote || moonxQuote.amountOut === 0n) {
        throw new Error('Insufficient liquidity for this trade');
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
        route: [params.fromTokenAddress, params.toTokenAddress], // Simplified route
        moonxQuote: {
          amountOut: moonxQuote.amountOut.toString(),
          liquidity: moonxQuote.liquidity.toString(),
          fee: moonxQuote.fee,
          version: moonxQuote.version,
          hooks: moonxQuote.hooks,
          path: moonxQuote.path || '0x',
          routeData: moonxQuote.routeData || '0x'
        }
      };
    } catch (error) {
      console.error('Error in getSwapQuote:', error);
      throw error;
    }
  }

  // Build calldata for MoonX swap according to MoonX-Swap-Guide.md
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

      // Build args array according to MoonX-Swap-Guide.md
      const args = [];
      
      // args[0]: tokenIn
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [fromTokenAddress]));
      
      // args[1]: tokenOut  
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [toTokenAddress]));
      
      // args[2]: amountIn
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [params.fromAmount]));
      
      // args[3]: slippage (in basis points)
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [slippageBasisPoints]));
      
      // args[4]: refData (referral data) - according to MoonX-Swap-Guide.md
      // Must include zero address and 0 fee even when no referral
      const refDataArray: string[] = [];
      refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [ethers.ZeroAddress])); // No specific referrer
      refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [0])); // No referral fee
      const refData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [refDataArray]);
      args.push(refData);
      
      // args[5]: version (from quote)
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [params.moonxQuote.version]));
      
      // args[6]: version-specific data (FROM QUOTE RESULT)
      const version = Number(params.moonxQuote.version);
      if (version === 2) {
        // V2: use path from quote
        const path = params.moonxQuote.path || [fromTokenAddress, toTokenAddress];
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]));
      } else if (version === 3) {
        // V3: use fee from quote
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [params.moonxQuote.fee || 3000]));
      } else if (version === 4) {
        // V4: use routeData from quote (ALREADY ENCODED)
        if (params.moonxQuote.routeData && params.moonxQuote.routeData !== "0x") {
          args.push(params.moonxQuote.routeData); // routeData is already encoded
        } else {
          args.push("0x"); // Empty bytes if no routeData
        }
      }
      
      // args[7]: recipient
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [recipient]));

      // MoonX execMoonXSwap function ABI (correct format from guide)
      const moonxABI = [
        "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)"
      ];

      const iface = new ethers.Interface(moonxABI);
      const calldata = iface.encodeFunctionData('execMoonXSwap', [args]);

      return calldata;
    } catch (error) {
      console.error('Error building calldata:', error);
      throw new Error('Failed to build swap calldata');
    }
  }

  // Estimate gas for transaction
  private async estimateGas(calldata: string, value: string, chainId: number): Promise<string> {
    try {
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
      return '250000'; // Safe fallback
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

  // Get MoonX quote with retry logic to handle rate limiting
  private async getMoonXQuoteWithRetry(
    fromTokenAddress: string,
    toTokenAddress: string,
    amount: string,
    network: any,
    maxRetries: number = 3
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const quote = await this.blockchainRepository.getMoonXQuote(
          fromTokenAddress,
          toTokenAddress,
          amount,
          network
        );
        
        // If successful, return the quote
        if (quote && quote.amountOut > 0n) {
          return quote;
        }
        
        // If quote is null or amountOut is 0, treat as temporary failure
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

    // If all retries failed, throw the last error or a generic one
    throw lastError || new Error('Failed to get MoonX quote after retries');
  }

  // Helper function for delays
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 