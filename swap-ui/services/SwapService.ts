import { ethers } from 'ethers';
import { apiClient } from '@/lib/api';
import { MOONX_CONTRACT_ADDRESS } from '@/lib/moonx';
import { createWalletProvider, type WalletProviderConfig } from '@/lib/wallet-provider';
import type { TokenBalance, SwapQuote, ServiceResult, RPCSettings } from '@/types/api';
import { gasService, type GasSettings } from './GasService';

// MoonX Contract ABI theo tài liệu
const MOONX_ABI = [
  "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
  "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))"
];

export type SwapServiceResult<T> = ServiceResult<T>;

export interface QuoteParams {
  fromToken: TokenBalance;
  toToken: TokenBalance;
  fromAmount: string;
  slippage: number;
  chainId: number;
  userAddress: string;
}

// Gas settings are imported below with other dependencies

export interface SwapExecutionParams {
  quote: SwapQuote;
  fromToken: TokenBalance;
  toToken: TokenBalance;
  fromAmount: string;
  slippage: number;
  userAddress: string;
  rpcSettings: RPCSettings;
  walletConfig: WalletProviderConfig;
  getWalletType: () => string | null;
  gasSettings: GasSettings; // Required - no fallbacks
}

// Direct swap params theo MoonX Guide
export interface DirectSwapParams {
  tokenIn: string; // Token address hoặc ETH (0x0000...)
  tokenOut: string; // Token address hoặc ETH (0x0000...)
  amountIn: string; // Amount in wei
  slippage: number; // Slippage in basis points (300 = 3%)
  recipient: string; // Recipient address
  refAddress?: string; // Referral address
  refFee?: number; // Referral fee in basis points
  rpcSettings: RPCSettings;
  walletConfig: WalletProviderConfig;
  getWalletType: () => string | null;
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
        chainId: params.chainId,
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
          gasSettings
        );
      } else {
        // For ETH swaps, get current nonce
        nextNonce = await signer.getNonce('pending');
      }

      // Execute swap using calldata from quote
      console.log(`🔄 Executing swap: ${params.fromAmount} ${params.fromToken.token.symbol} → ${params.toToken.token.symbol}`);
      
      // Prepare swap transaction with explicit nonce to prevent replacement
      const swapTxParams = await gasService.prepareTransactionParams(
        signer,
        {
          to: MOONX_CONTRACT_ADDRESS,
          data: params.quote.moonxQuote.calldata,
          value: params.quote.moonxQuote.value || '0'
        },
        gasSettings
      );
      
      // Use explicit nonce to prevent replacement
      swapTxParams.nonce = nextNonce;
      console.log(`📋 Using nonce ${nextNonce} for swap transaction`);
      
      // Execute transaction with retry logic for nonce conflicts
      const tx = await this.executeTransactionWithRetry(signer, swapTxParams, 'swap');

      console.log(`⏳ Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not received');
      }

      console.log(`✅ Swap completed successfully: ${receipt.hash}`);
      return {
        success: true,
        data: receipt.hash
      };
    } catch (error) {
      console.error('❌ Swap execution failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Swap execution failed';
      
      // Provide more specific error messages
      if (errorMessage.includes('user rejected')) {
        return {
          success: false,
          error: 'Transaction was rejected by user'
        };
      } else if (errorMessage.includes('insufficient funds')) {
        return {
          success: false,
          error: 'Insufficient funds for transaction'
        };
      } else if (errorMessage.includes('gas')) {
        return {
          success: false,
          error: 'Transaction failed due to gas issues. Try increasing gas limit.'
        };
      } else if (errorMessage.includes('allowance')) {
        return {
          success: false,
          error: 'Token approval failed. Please try again.'
        };
      }

      return {
        success: false,
        error: `Swap failed: ${errorMessage}`
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
    gasSettings: GasSettings
  ): Promise<number> {
    const allowance = await tokenContract.allowance(userAddress, MOONX_CONTRACT_ADDRESS);

    if (allowance < BigInt(amountIn)) {
      console.log(`🔓 Approving ${tokenSymbol} for swap...`);
      
      // Get current nonce explicitly to avoid race conditions
      const currentNonce = await signer.getNonce('pending');
      console.log(`📋 Using nonce ${currentNonce} for approval transaction`);
      
      // Prepare approval transaction with explicit nonce
      const approvalTxParams = await gasService.prepareTransactionParams(
        signer,
        {
          to: await tokenContract.getAddress(),
          data: tokenContract.interface.encodeFunctionData('approve', [MOONX_CONTRACT_ADDRESS, amountIn])
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
      
      console.log(`⏳ Approval transaction confirmed: ${receipt.hash}`);
      
      // Verify allowance was actually updated - retry up to 3 times
      let retryCount = 0;
      const maxRetries = 3;
      let updatedAllowance = BigInt(0);
      
      while (retryCount < maxRetries) {
        updatedAllowance = await tokenContract.allowance(userAddress, MOONX_CONTRACT_ADDRESS);
        
        if (updatedAllowance >= BigInt(amountIn)) {
          console.log(`✅ ${tokenSymbol} allowance verified: ${ethers.formatUnits(updatedAllowance, decimals)}`);
          break;
        }
        
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`⏳ Allowance not yet updated, retrying (${retryCount}/${maxRetries})...`);
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
        console.log(`🚀 Attempting ${txType} transaction (${attempt}/${maxRetries})...`);
        return await signer.sendTransaction(txParams);
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message?.toLowerCase() || '';
        
        // Check if it's a nonce-related error
        if (errorMessage.includes('nonce too low') || 
            errorMessage.includes('replacement transaction underpriced') ||
            errorMessage.includes('already known')) {
          
          if (attempt < maxRetries) {
            console.log(`⚠️  Nonce conflict detected, retrying with fresh nonce (${attempt}/${maxRetries})...`);
            
            // Get fresh nonce and update transaction
            const freshNonce = await signer.getNonce('pending');
            txParams.nonce = freshNonce;
            console.log(`📋 Updated to fresh nonce: ${freshNonce}`);
            
            // Add small delay to avoid rapid retries
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        
        // For other errors or max retries reached, throw immediately
        console.error(`❌ ${txType} transaction failed (attempt ${attempt}/${maxRetries}):`, error);
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
    amountIn: string
  ): Promise<any> {
    const moonxContract = new ethers.Contract(MOONX_CONTRACT_ADDRESS, MOONX_ABI, signer);
    
    const quoteArgs = [
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]),
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]),
      ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn])
    ];
    
    // Sử dụng staticCall để lấy quote
    const quote = await moonxContract.moonxGetQuote.staticCall(quoteArgs);
    
    console.log("📊 Quote from Contract:", {
      version: Number(quote.version),
      amountOut: quote.amountOut.toString(),
      fee: quote.fee ? Number(quote.fee) : "N/A",
      path: quote.path ? quote.path : "N/A",
      routeData: quote.routeData ? quote.routeData : "N/A"
    });
    
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
      console.log('🔄 Starting Direct MoonX Swap:', {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        slippage: params.slippage
      });

      // 1. Tạo wallet provider
      const walletProvider = await createWalletProvider(params.walletConfig);
      const signer = await walletProvider.getSigner();

      // 2. Lấy quote từ contract - QUAN TRỌNG
      const quote = await this.getQuoteFromContract(signer, params.tokenIn, params.tokenOut, params.amountIn);
      
      // Initialize nonce variable
      let nextNonce: number;

      // 3. Kiểm tra và approve token nếu cần (không phải ETH)
      if (params.tokenIn !== "0x0000000000000000000000000000000000000000") {
        console.log(`🔓 Checking allowance for ${params.tokenIn}...`);
        
        const tokenContract = new ethers.Contract(params.tokenIn, [
          "function approve(address spender, uint256 amount) returns (bool)",
          "function allowance(address owner, address spender) view returns (uint256)"
        ], signer);

        const userAddress = await signer.getAddress();
        
        // Use helper function to ensure proper approval and get next nonce
        nextNonce = await this.tokenApproval(
          tokenContract,
          userAddress,
          params.amountIn,
          'Token', // Generic symbol for direct swap
          18, // Default decimals for direct swap
          signer,
          params.gasSettings
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

      console.log('📋 Built swap args:', args.length, 'parameters');

      // 5. Create contract instance
      const moonxContract = new ethers.Contract(MOONX_CONTRACT_ADDRESS, MOONX_ABI, signer);

      // 6. Prepare transaction với ethers estimate gas
      const value = params.tokenIn === "0x0000000000000000000000000000000000000000" ? params.amountIn : "0";
      
      const swapTxParams = await gasService.prepareTransactionParams(
        signer,
        {
          to: MOONX_CONTRACT_ADDRESS,
          data: moonxContract.interface.encodeFunctionData('execMoonXSwap', [args]),
          value
        },
        params.gasSettings
      );

      // Use explicit nonce to prevent replacement
      swapTxParams.nonce = nextNonce;
      
      console.log('⚡ Prepared transaction with gas and nonce:', {
        gasLimit: swapTxParams.gasLimit?.toString(),
        nonce: nextNonce,
        value: value
      });

      // 7. Execute swap with retry logic for nonce conflicts
      const tx = await this.executeTransactionWithRetry(signer, swapTxParams, 'direct swap');
      console.log(`⏳ Direct swap transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error('Transaction failed - no receipt received');
      }

      console.log(`✅ Direct swap completed: ${receipt.hash}`);
      
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