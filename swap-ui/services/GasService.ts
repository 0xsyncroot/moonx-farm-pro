import { ethers } from 'ethers';

export interface GasSettings {
  gasLimitBoost: number; // Percentage boost for gas limit (0-100)
  priorityFeeTip: string; // User-specified additional tip for miners in gwei (will be added to base fee)
  baseFeePerGas: string; // Current network base fee (auto-fetched, read-only)
  useCustomGas: boolean; // Whether user is setting custom gas values
  gasSpeed: 'standard' | 'fast' | 'instant'; // Preset for gas speed
}

export interface TransactionForEstimate {
  to: string;
  data?: string;
  value?: string;
  from: string;
}

export interface GasRecommendations {
  standard: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
  fast: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
  instant: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
  baseFeePerGas: string;
}

export interface GasCostEstimate {
  totalCostGwei: string;
  totalCostEth: string;
  baseFee: string;
  priorityFee: string;
  gasLimit: string;
}

/**
 * GasService - Business logic for gas price calculations and recommendations
 * Following Clean Architecture: Store → Service → HTTP Client → API
 */
export class GasService {
  private static instance: GasService;

  private constructor() {}

  static getInstance(): GasService {
    if (!GasService.instance) {
      GasService.instance = new GasService();
    }
    return GasService.instance;
  }



  /**
   * Get gas recommendations for a specific network - no fallbacks
   */
  async getGasRecommendations(chainId: number, rpcUrl?: string): Promise<GasRecommendations | null> {
    // Use provided RPC URL or get default based on chainId
    const providerUrl = rpcUrl || this.getDefaultRpcUrl(chainId);
    const provider = new ethers.JsonRpcProvider(providerUrl);

    // Get current base fee and fee data - will throw if unsupported
    const [latestBlock, feeData] = await Promise.all([
      provider.getBlock('latest'),
      provider.getFeeData()
    ]);

    if (!latestBlock?.baseFeePerGas) {
      throw new Error('EIP-1559 not supported - no base fee available');
    }

    if (!feeData.maxPriorityFeePerGas) {
      throw new Error('Priority fee not available from provider');
    }

    const baseFeePerGas = latestBlock.baseFeePerGas;
    const standardPriorityFee = feeData.maxPriorityFeePerGas;

    // Calculate recommendations for different speeds
    const recommendations: GasRecommendations = {
      baseFeePerGas: ethers.formatUnits(baseFeePerGas, 'gwei'),
      standard: {
        maxFeePerGas: ethers.formatUnits(
          baseFeePerGas * BigInt(2) + standardPriorityFee, 
          'gwei'
        ),
        maxPriorityFeePerGas: ethers.formatUnits(standardPriorityFee, 'gwei'),
      },
      fast: {
        maxFeePerGas: ethers.formatUnits(
          baseFeePerGas * BigInt(2) + standardPriorityFee * BigInt(15) / BigInt(10), // +50% priority
          'gwei'
        ),
        maxPriorityFeePerGas: ethers.formatUnits(
          standardPriorityFee * BigInt(15) / BigInt(10), 
          'gwei'
        ),
      },
      instant: {
        maxFeePerGas: ethers.formatUnits(
          baseFeePerGas * BigInt(2) + standardPriorityFee * BigInt(2), // +100% priority
          'gwei'
        ),
        maxPriorityFeePerGas: ethers.formatUnits(
          standardPriorityFee * BigInt(2), 
          'gwei'
        ),
      },
    };

    return recommendations;
  }

  /**
   * Pure gas cost estimation - no fallbacks, let ethers handle everything
   */
  async estimateGasCost(
    provider: ethers.Provider,
    transaction: TransactionForEstimate,
    gasSettings: GasSettings
  ): Promise<GasCostEstimate> {
    // 🎯 100% ethers native - no manual calculations
    const baseTxRequest = {
      to: transaction.to,
      data: transaction.data || '0x',
      value: transaction.value ? BigInt(transaction.value) : BigInt(0),
      from: transaction.from
    };

    const [estimatedGas, feeData] = await Promise.all([
      provider.estimateGas(baseTxRequest), // Will throw if transaction fails
      provider.getFeeData() // Will throw if network unsupported
    ]);

    // Only safety buffer - no manual overrides
    const safetyMultiplier = 1.5; // 50% buffer to prevent out-of-gas
    const userBoostMultiplier = 1 + (gasSettings.gasLimitBoost / 100);
    const finalGasLimit = BigInt(Math.floor(Number(estimatedGas) * safetyMultiplier * userBoostMultiplier));

    // Use whatever ethers provides - no manual fee calculations
    let totalCostWei: bigint;
    let baseFee = '0';
    let priorityFee = '0';

    if (feeData.maxFeePerGas) {
      // EIP-1559 - use maxFeePerGas
      totalCostWei = feeData.maxFeePerGas * finalGasLimit;
      if (feeData.maxPriorityFeePerGas) {
        priorityFee = ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei');
      }
    } else if (feeData.gasPrice) {
      // Legacy - use gasPrice
      totalCostWei = feeData.gasPrice * finalGasLimit;
    } else {
      // Should not happen with proper provider
      throw new Error('Provider returned invalid fee data');
    }

    return {
      totalCostGwei: ethers.formatUnits(totalCostWei, 'gwei'),
      totalCostEth: ethers.formatEther(totalCostWei),
      baseFee,
      priorityFee,
      gasLimit: finalGasLimit.toString(),
    };
  }

  /**
   * Transaction preparation with custom gas support
   * Uses user's custom gas settings if enabled, otherwise falls back to ethers auto-populate
   */
  async prepareTransactionParams(
    signer: ethers.Signer,
    baseTx: { to: string; data?: string; value?: string },
    gasSettings: GasSettings,
    estimatedGas?: string
  ): Promise<ethers.TransactionRequest> {
    const provider = signer.provider;
    if (!provider) {
      throw new Error('Provider not available');
    }

    // 🎯 Base transaction request
    const baseTxRequest = {
      to: baseTx.to,
      data: baseTx.data || '0x',
      value: baseTx.value ? BigInt(baseTx.value) : BigInt(0)
    };

    // Let ethers auto-populate everything first
    const populatedTx = await signer.populateTransaction(baseTxRequest);

    // Calculate gas limit with safety buffer + user boost
    let finalGasLimit = estimatedGas ? BigInt(estimatedGas) : populatedTx.gasLimit;
    if (!finalGasLimit) {
      throw new Error('Could not determine gas limit');
    }

    const safetyMultiplier = 1.5; // 50% buffer to prevent out-of-gas
    const userBoostMultiplier = 1 + (gasSettings.gasLimitBoost / 100);
    finalGasLimit = BigInt(Math.floor(Number(finalGasLimit) * safetyMultiplier * userBoostMultiplier));

    // 🎯 Apply custom gas settings if user enabled custom mode
    if (gasSettings.useCustomGas) {
      // Convert gwei to wei for gas prices
      const priorityFeeWei = gasSettings.priorityFeeTip 
        ? ethers.parseUnits(gasSettings.priorityFeeTip, 'gwei')
        : undefined;

      let maxFeeWei: bigint | undefined;
      
      // Calculate maxFeePerGas = baseFee + tip
      if (gasSettings.baseFeePerGas && gasSettings.priorityFeeTip) {
        const baseFeeWei = ethers.parseUnits(gasSettings.baseFeePerGas, 'gwei');
        maxFeeWei = baseFeeWei + (priorityFeeWei || BigInt(0));
      } else if (gasSettings.priorityFeeTip) {
        // If no base fee available, use priority fee as max fee (fallback)
        maxFeeWei = priorityFeeWei;
      }

      // Return transaction with custom gas settings
      return {
        ...populatedTx,
        gasLimit: finalGasLimit,
        maxFeePerGas: maxFeeWei,
        maxPriorityFeePerGas: priorityFeeWei,
        type: 2, // Ensure EIP-1559 transaction
      };
    }

    // Auto mode - only override gas limit, keep ethers' auto-detected values
    return {
      ...populatedTx,
      gasLimit: finalGasLimit
    };
  }

  /**
   * Get default RPC URL for chain ID (fallback when no user settings)
   */
  private getDefaultRpcUrl(chainId: number): string {
    // Default RPC URLs for each network
    const rpcMap: Record<number, string> = {
      1: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://base.llamarpc.com',
      137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon.llamarpc.com',
      42161: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com',
      56: process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc.llamarpc.com',
    };

    return rpcMap[chainId] || rpcMap[1]; // Default to Ethereum
  }

  /**
   * Get effective RPC URL based on user settings
   */
  getRpcUrl(chainId: number, rpcSettings?: { useCustomRpc: boolean; customRpcUrl?: string; baseRpcUrl?: string }): string {
    // Use custom RPC if user has configured it
    if (rpcSettings?.useCustomRpc && rpcSettings.customRpcUrl) {
      return rpcSettings.customRpcUrl;
    }
    
    // Use base RPC from settings if available
    if (rpcSettings?.baseRpcUrl) {
      return rpcSettings.baseRpcUrl;
    }

    // Fallback to default RPC URL
    return this.getDefaultRpcUrl(chainId);
  }
}

// Export singleton instance
export const gasService = GasService.getInstance();