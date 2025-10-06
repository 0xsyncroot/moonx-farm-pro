import { ethers } from 'ethers';
import { apiClient } from '@/libs/api';
import { getMoonXContractAddress, MOONX_ABI, isNetworkSupported } from '@/libs/moonx';
import { createWalletProvider, type WalletProviderConfig } from '@/libs/wallet-provider';
import type { TokenBalance, SwapQuote, ServiceResult, RPCSettings, Network } from '@/types/api';
import { gasService, type GasSettings } from './GasService';
import { mapErrorToSwapError, SwapErrorCode, type SwapError } from '@/types/errors';

// MoonX Contract ABI is imported from @/libs/moonx

export type SwapServiceResult<T> = ServiceResult<T>;

export interface QuoteParams {
  fromToken: TokenBalance;
  toToken: TokenBalance;
  fromAmount: string;
  slippage: number;
  network: Network; // Changed from chainId to network object
  userAddress: string;
}

// Gas settings are imported below with other dependencies

export interface SwapExecutionParams {
  quote: SwapQuote;
  fromToken: TokenBalance;
  toToken: TokenBalance;
  fromAmount: string;
  slippage: number;
  network: Network; // Network object containing chain ID and contract address
  userAddress: string;
  rpcSettings: RPCSettings;
  walletConfig: WalletProviderConfig;
  gasSettings: GasSettings; // Required - no fallbacks
}

// Direct swap params theo MoonX Guide
export interface DirectSwapParams {
  tokenIn: string; // Token address hoặc ETH (0x0000...)
  tokenOut: string; // Token address hoặc ETH (0x0000...)
  amountIn: string; // Amount in wei
  slippage: number; // Slippage in basis points (300 = 3%)
  network: Network; // Network object containing chain ID and contract address
  recipient: string; // Recipient address
  refAddress?: string; // Referral address
  refFee?: number; // Referral fee in basis points
  rpcSettings: RPCSettings;
  walletConfig: WalletProviderConfig;
  gasSettings: GasSettings;
}

/**
 * SwapService - Handles all swap-related operations
 * 
 * Architecture:
 * 1. Quote: Get quote with calldata from backend API
 * 2. Execute: Use calldata from quote to execute swap transaction
 * 
 * Flow:
 * - Quote API returns ready-to-execute calldata
 * - Client only needs to approve tokens and send transaction
 * - No direct MoonX contract calls for swap execution
 */
export class SwapService {
  private static instance: SwapService;

  private constructor() {}

  static getInstance(): SwapService {
    if (!SwapService.instance) {
      SwapService.instance = new SwapService();
    }
    return SwapService.instance;
  }

  /**
   * Get swap quote with ready-to-execute calldata from API
   * Returns quote object with calldata, value, and gas estimate for direct execution
   */
  async getQuote(params: QuoteParams): Promise<SwapServiceResult<SwapQuote>> {
    try {
      // Validation
      const validationError = this.validateQuoteParams(params);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }



      // Convert amount to wei
      const amountInWei = ethers.parseUnits(
        params.fromAmount, 
        params.fromToken.token.decimals
      ).toString();

      const response = await apiClient.post<{ quote: any }>('/api/quote', {
        fromTokenAddress: params.fromToken.token.address,
        toTokenAddress: params.toToken.token.address,
        amount: amountInWei,
        slippage: params.slippage,
        chainId: params.network.chainId,
        userAddress: params.userAddress
      });
      if (!response || !response.quote) {
        throw new Error('No quote received from API');
      }

      const quoteResult = response.quote;

      // Build standardized quote object
      const quote: SwapQuote = {
        fromToken: params.fromToken.token,
        toToken: params.toToken.token,
        fromAmount: params.fromAmount,
        toAmount: quoteResult.toAmount,
        minToAmount: quoteResult.minToAmount,
        priceImpact: quoteResult.priceImpact,
        slippage: quoteResult.slippage,
        fee: quoteResult.fee,
        route: quoteResult.route,
        moonxQuote: {
          ...quoteResult.moonxQuote,
          calldata: quoteResult.calldata,
          value: quoteResult.value,
          gasEstimate: quoteResult.gasEstimate,
          platformFee: quoteResult.platformFee
        }
      };

      return {
        success: true,
        data: quote
      };
    } catch (error) {
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to get quote';
      
      // Provide more specific error messages
      if (errorMessage.includes('No valid route')) {
        return {
          success: false,
          error: 'No swap route found. Try different tokens or amount.'
        };
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        return {
          success: false,
          error: 'Network error. Please try again.'
        };
      }

      return {
        success: false,
        error: `Unable to get quote: ${errorMessage}`
      };
    }
  }

  /**
   * Execute swap transaction using calldata from quote
   */
  async executeSwap(params: SwapExecutionParams): Promise<SwapServiceResult<string>> {
    try {

      // Validation
      const validationError = this.validateSwapParams(params);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Validate quote has calldata
      if (!params.quote.moonxQuote?.calldata) {
        return {
          success: false,
          error: 'Invalid quote: missing calldata. Please get a new quote.'
        };
      }

      // Validate network support and get contract address
      if (!isNetworkSupported(params.network)) {
        return {
          success: false,
          error: `Network ${params.network.name} (chain ${params.network.chainId}) is not supported for swaps`
        };
      }
      
      const contractAddress = getMoonXContractAddress(params.network);
      
      // Create wallet provider using the full config from params (includes Privy context)
      const provider = createWalletProvider(params.walletConfig);

      await provider.initializeSigner();
      const signer = provider.getSigner();
      
      // Convert amount to wei for approval check
      const amountIn = ethers.parseUnits(
        params.fromAmount, 
        params.fromToken.token.decimals
      ).toString();

      // Use provided gas settings - no fallbacks, fail if missing
      const gasSettings = params.gasSettings;
      if (!gasSettings) {
        throw new Error('Gas settings are required');
      }

      // Initialize nonce variable
      let nextNonce: number;

      // Check allowance and approve if needed (for non-ETH tokens)
      if (params.fromToken.token.address !== ethers.ZeroAddress) {
        const tokenContract = new ethers.Contract(
          params.fromToken.token.address,
          ['function allowance(address owner, address spender) view returns (uint256)', 
           'function approve(address spender, uint256 amount) returns (bool)'],
          signer
        );
        
        // Use helper function to ensure proper approval and get next nonce
        nextNonce = await this.tokenApproval(
          tokenContract,
          params.userAddress,
          amountIn,
          params.fromToken.token.symbol,
          params.fromToken.token.decimals,
          signer,
          gasSettings,
          contractAddress // Pass contract address for this chain
        );
      } else {
        // For ETH swaps, get current nonce
        nextNonce = await signer.getNonce('pending');
      }

      // Prepare swap transaction with explicit nonce to prevent replacement
      const swapTxParams = await gasService.prepareTransactionParams(
        signer,
        {
          to: contractAddress,
          data: params.quote.moonxQuote.calldata,
          value: params.quote.moonxQuote.value || '0'
        },
        gasSettings
      );
      
      // Use explicit nonce to prevent replacement
      swapTxParams.nonce = nextNonce;
      
      // Execute transaction with retry logic for nonce conflicts
      const tx = await this.executeTransactionWithRetry(signer, swapTxParams, 'swap');

      const receipt = await tx.wait(1);

      if (!receipt) {
        throw new Error('Transaction receipt not received');
      }

      return {
        success: true,
        data: receipt.hash
      };
    } catch (error: any) {  
      // If it's already a SwapError from wallet-provider/secure-signer, throw it directly
      if (error.code && Object.values(SwapErrorCode).includes(error.code)) {
        throw error;
      }
      
      // For other errors, map to SwapError for consistent handling
      const swapError = error instanceof Error ? mapErrorToSwapError(error) : mapErrorToSwapError(new Error('Unknown error'));
      
      // For wallet/session errors, throw the SwapError directly so UI can handle them properly
      if (swapError.action === 'unlock' || swapError.action === 'connect') {
        throw swapError;
      }
      
      // For other errors, return as before for backward compatibility
      return {
        success: false,
        error: swapError.userMessage || swapError.message
      };
    }
  }

  /**
   * Validate quote parameters
   */
  private validateQuoteParams(params: QuoteParams): string | null {
    if (!params.fromToken || !params.toToken) {
      return 'Please select tokens';
    }

    if (!params.fromAmount) {
      return 'Please enter amount';
    }

    if (!params.userAddress) {
      return 'Please connect wallet';
    }

    const amount = parseFloat(params.fromAmount);
    if (amount <= 0) {
      return 'Please enter a valid amount';
    }

    // Check if tokens are different
    if (params.fromToken.token.address === params.toToken.token.address) {
      return 'Cannot swap identical tokens';
    }

    // Check balance
    const balance = parseFloat(params.fromToken.formattedBalance || '0');
    if (amount > balance) {
      return 'Insufficient balance';
    }

    return null;
  }

  /**
   * Validate swap execution parameters
   */
  private validateSwapParams(params: SwapExecutionParams): string | null {
    if (!params.quote) {
      return 'Please get a quote first';
    }

    if (!params.userAddress) {
      return 'Please connect wallet first';
    }

    if (!params.fromToken || !params.toToken) {
      return 'Please select tokens';
    }

    return null;
  }

  /**
   * Check if quote is still valid (not expired)
   */
  isQuoteValid(quote: SwapQuote, maxAgeMinutes: number = 2): boolean {
    if (!quote.moonxQuote?.timestamp) {
      return false;
    }

    const now = Date.now();
    const quoteTime = new Date(quote.moonxQuote.timestamp).getTime();
    const ageMinutes = (now - quoteTime) / (1000 * 60);

    return ageMinutes <= maxAgeMinutes;
  }

  /**
   * Calculate price impact percentage
   */
  calculatePriceImpact(quote: SwapQuote): number {
    return parseFloat(quote.priceImpact || '0');
  }

  // Gas transaction preparation is now handled by GasService
  // This follows Clean Architecture: SwapService → GasService

  /**
   * Helper function to ensure token approval with proper confirmation and verification
   * Returns the next nonce to use for subsequent transactions
   */
  private async tokenApproval(
    tokenContract: ethers.Contract,
    userAddress: string,
    amountIn: string,
    tokenSymbol: string,
    decimals: number,
    signer: ethers.Signer,
    gasSettings: GasSettings,
    contractAddress: string
  ): Promise<number> {
    const allowance = await tokenContract.allowance(userAddress, contractAddress);

    if (allowance < BigInt(amountIn)) {
      
      // Get current nonce explicitly to avoid race conditions
      const currentNonce = await signer.getNonce('pending');
      
      // Prepare approval transaction with explicit nonce
      const approvalTxParams = await gasService.prepareTransactionParams(
        signer,
        {
          to: await tokenContract.getAddress(),
          data: tokenContract.interface.encodeFunctionData('approve', [contractAddress, amountIn])
        },
        gasSettings
      );
      
      // Override with explicit nonce to prevent replacement
      approvalTxParams.nonce = currentNonce;
      
      const approveTx = await signer.sendTransaction(approvalTxParams);
      
      // Wait for at least 1 confirmation to ensure state is updated
      const receipt = await approveTx.wait(1);
      if (!receipt) {
        throw new Error('Approval transaction failed - no receipt received');
      }
      
      
      // Verify allowance was actually updated - retry up to 3 times
      let retryCount = 0;
      const maxRetries = 3;
      let updatedAllowance = BigInt(0);
      
      while (retryCount < maxRetries) {
        updatedAllowance = await tokenContract.allowance(userAddress, contractAddress);
        
        if (updatedAllowance >= BigInt(amountIn)) {
          console.log(`✅ ${tokenSymbol} allowance verified: ${ethers.formatUnits(updatedAllowance, decimals)}`);
          break;
        }
        
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }
      
      // Final check
      if (updatedAllowance < BigInt(amountIn)) {
        throw new Error(`Approval failed: allowance ${ethers.formatUnits(updatedAllowance, decimals)} is still less than required ${ethers.formatUnits(amountIn, decimals)}`);
      }
      
      // Return next nonce for subsequent transactions
      return currentNonce + 1;
    }
    
    // If no approval needed, get current nonce for next transaction
    const currentNonce = await signer.getNonce('pending');
    return currentNonce;
  }

  /**
   * Execute transaction with retry logic for nonce conflicts
   */
  private async executeTransactionWithRetry(
    signer: ethers.Signer, 
    txParams: ethers.TransactionRequest, 
    txType: string,
    maxRetries: number = 3
  ): Promise<ethers.TransactionResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await signer.sendTransaction(txParams);
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message?.toLowerCase() || '';
        
        // Check if it's a nonce-related error
        if (errorMessage.includes('nonce too low') || 
            errorMessage.includes('replacement transaction underpriced') ||
            errorMessage.includes('already known')) {
          
          if (attempt < maxRetries) {
            
            // Get fresh nonce and update transaction
            const freshNonce = await signer.getNonce('pending');
            txParams.nonce = freshNonce;
            
            // Add small delay to avoid rapid retries
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        
        // For other errors or max retries reached, throw immediately
        if (attempt === maxRetries) break;
        
        // Add delay before retry for non-nonce errors
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw lastError || new Error(`${txType} transaction failed after ${maxRetries} attempts`);
  }

  /**
   * Helper function để build referral data theo MoonX Guide
   */
  private buildRefData(refAddress?: string, refFee?: number): string {
    const refDataArray: string[] = [];
    
    if (refAddress && refAddress !== "0x0000000000000000000000000000000000000000" && refFee && refFee > 0) {
      refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [refAddress]));
      refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [refFee]));
    }
    
    return ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [refDataArray]);
  }

  /**
   * Lấy quote từ MoonX contract theo tài liệu
   */
  async getQuoteFromContract(
    signer: ethers.Signer,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    network: Network
  ): Promise<any> {
    const contractAddress = getMoonXContractAddress(network);
    const moonxContract = new ethers.Contract(contractAddress, MOONX_ABI, signer);
    
    const quoteArgs = [
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]),
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]),
      ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn])
    ];
    
    // Sử dụng staticCall để lấy quote
    const quote = await moonxContract.moonxGetQuote.staticCall(quoteArgs);
    
    if (Number(quote.version) === 0) {
      throw new Error("Không tìm thấy route hợp lệ cho cặp token này");
    }
    
    return quote;
  }

  /**
   * Build args array theo MoonX Guide
   */
  private buildSwapArgs(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippage: number,
    recipient: string,
    quote: any,
    refAddress?: string,
    refFee?: number
  ): string[] {
    const args: string[] = [];
    
    // args[0]: tokenIn
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]));
    
    // args[1]: tokenOut  
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]));
    
    // args[2]: amountIn
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn]));
    
    // args[3]: slippage
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [slippage]));
    
    // args[4]: refData (referral data)
    args.push(this.buildRefData(refAddress, refFee));
    
    // args[5]: version (từ quote)
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [quote.version]));
    
    // args[6]: version-specific data (TỪ QUOTE RESULT)
    const version = Number(quote.version);
    if (version === 2) {
      // V2: sử dụng path từ quote
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [quote.path]));
    } else if (version === 3) {
      // V3: sử dụng fee từ quote
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [quote.fee]));
    } else if (version === 4) {
      // V4: sử dụng routeData từ quote (ĐÃ ENCODED)
      if (quote.routeData && quote.routeData !== "0x") {
        args.push(quote.routeData); // routeData đã được encoded sẵn
      } else {
        args.push("0x"); // Empty bytes nếu không có routeData
      }
    }
    
    // args[7]: recipient
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [recipient]));
    
    return args;
  }

  /**
   * Execute swap direct theo MoonX Guide - build args tự động
   */
  async executeSwapDirect(params: DirectSwapParams): Promise<SwapServiceResult<string>> {
    try {
      // Validate network support
      if (!isNetworkSupported(params.network)) {
        return {
          success: false,
          error: `Network ${params.network.name} (chain ${params.network.chainId}) is not supported for direct swaps`
        };
      }

      // 1. Tạo wallet provider
      const walletProvider = await createWalletProvider(params.walletConfig);
      const signer = await walletProvider.getSigner();

      // 2. Lấy quote từ contract - QUAN TRỌNG
      const quote = await this.getQuoteFromContract(signer, params.tokenIn, params.tokenOut, params.amountIn, params.network);
      
      // Initialize nonce variable
      let nextNonce: number;

      // 3. Kiểm tra và approve token nếu cần (không phải ETH)
      if (params.tokenIn !== "0x0000000000000000000000000000000000000000") {
        const tokenContract = new ethers.Contract(params.tokenIn, [
          "function approve(address spender, uint256 amount) returns (bool)",
          "function allowance(address owner, address spender) view returns (uint256)"
        ], signer);

        const userAddress = await signer.getAddress();
        const contractAddress = getMoonXContractAddress(params.network);
        
        // Use helper function to ensure proper approval and get next nonce
        nextNonce = await this.tokenApproval(
          tokenContract,
          userAddress,
          params.amountIn,
          'Token', // Generic symbol for direct swap
          18, // Default decimals for direct swap
          signer,
          params.gasSettings,
          contractAddress
        );
      } else {
        // For ETH swaps, get current nonce
        nextNonce = await signer.getNonce('pending');
      }

      // 4. Build args array theo MoonX Guide
      const args = this.buildSwapArgs(
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.slippage,
        params.recipient,
        quote,
        params.refAddress,
        params.refFee
      );

      // 5. Create contract instance
      const contractAddress = getMoonXContractAddress(params.network);
      const moonxContract = new ethers.Contract(contractAddress, MOONX_ABI, signer);

      // 6. Prepare transaction với ethers estimate gas
      const value = params.tokenIn === "0x0000000000000000000000000000000000000000" ? params.amountIn : "0";
      
      const swapTxParams = await gasService.prepareTransactionParams(
        signer,
        {
          to: contractAddress,
          data: moonxContract.interface.encodeFunctionData('execMoonXSwap', [args]),
          value
        },
        params.gasSettings
      );

      // Use explicit nonce to prevent replacement
      swapTxParams.nonce = nextNonce;
      
      // 7. Execute swap with retry logic for nonce conflicts
      const tx = await this.executeTransactionWithRetry(signer, swapTxParams, 'direct swap');
      
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error('Transaction failed - no receipt received');
      }

      return {
        success: true,
        data: receipt.hash
      };

    } catch (error: any) {
      console.error('❌ Direct swap execution failed:', error);
      
      return {
        success: false,
        error: error.message || 'Unknown error occurred during direct swap'
      };
    }
  }

  /**
   * Format quote for display
   * Note: Quote contains ready-to-execute calldata in moonxQuote.calldata
   */
  formatQuoteForDisplay(quote: SwapQuote): {
    exchangeRate: string;
    priceImpact: string;
    minimumReceived: string;
    fee: string;
  } {
    const fromAmount = parseFloat(quote.fromAmount);
    const toAmount = parseFloat(quote.toAmount);
    const rate = fromAmount > 0 ? (toAmount / fromAmount).toFixed(6) : '0';

    return {
      exchangeRate: `1 ${quote.fromToken.symbol} = ${rate} ${quote.toToken.symbol}`,
      priceImpact: `${quote.priceImpact}%`,
      minimumReceived: `${quote.minToAmount} ${quote.toToken.symbol}`,
      fee: quote.fee
    };
  }
}

// Export singleton instance
export const swapService = SwapService.getInstance();