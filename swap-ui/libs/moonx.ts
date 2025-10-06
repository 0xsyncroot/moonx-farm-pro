import { ethers } from 'ethers';
import type { Network } from '@/types/api';

// Get MoonX contract address from network object
export const getMoonXContractAddress = (network: Network): string => {
  if (!network.moonxContractAddress) {
    console.error(`🚨 MoonX contract address not configured for network ${network.name} (chain ${network.chainId})`);
    throw new Error(`MoonX contract address not configured for network ${network.name} (chain ${network.chainId})`);
  }
  
  console.log(`🔗 Using MoonX contract ${network.moonxContractAddress} for chain ${network.chainId} (${network.name})`);
  return network.moonxContractAddress;
};

// Get MoonX contract address by chain ID from networks array
export const getMoonXContractAddressByChainId = (chainId: number, networks: Network[]): string => {
  const network = networks.find(n => n.chainId === chainId);
  
  if (!network) {
    const supportedChains = networks.map(n => n.chainId).join(', ');
    console.error(`🚨 Network not found for chain ${chainId}. Available networks: ${supportedChains}`);
    throw new Error(`Network not found for chain ${chainId}. Available networks: ${supportedChains}`);
  }
  
  return getMoonXContractAddress(network);
};

// Get all supported chain IDs from networks array
export const getSupportedChainIds = (networks: Network[]): number[] => {
  return networks
    .filter(n => n.moonxContractAddress) // Only networks with MoonX contract
    .map(n => n.chainId);
};

// Check if network supports MoonX
export const isNetworkSupported = (network: Network): boolean => {
  return !!network.moonxContractAddress;
};

// Check if chain is supported by checking networks array
export const isChainSupported = (chainId: number, networks: Network[]): boolean => {
  const network = networks.find(n => n.chainId === chainId);
  return network ? isNetworkSupported(network) : false;
};

export const MOONX_ABI = [
  "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
  "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))"
];

export interface MoonXQuote {
  amountOut: bigint;
  liquidity: bigint;  
  fee: number;
  version: number;
  hooks: string;
  path: string[];
  routeData: string;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  recipient: string;
  refAddress?: string;
  refFee?: number;
}

export class MoonXService {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private network: Network;

  constructor(provider: ethers.Provider, signer: ethers.Signer, network: Network) {
    this.signer = signer;
    this.network = network;
    const contractAddress = getMoonXContractAddress(network);
    this.contract = new ethers.Contract(contractAddress, MOONX_ABI, signer);
  }

  // Helper function cho referral data
  private buildRefData(refAddress = ethers.ZeroAddress, refFee = 0): string {
    const refDataArray = [];
    if (refAddress !== ethers.ZeroAddress && refFee > 0) {
      refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [refAddress]));
      refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [refFee]));
    }
    return ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [refDataArray]);
  }

  // Lấy quote từ MoonX contract
  async getQuote(tokenIn: string, tokenOut: string, amountIn: string): Promise<MoonXQuote> {
    const quoteArgs = [
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]),
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]),
      ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn])
    ];

    try {
      const quote = await this.contract.moonxGetQuote.staticCall(quoteArgs);
      
      const result: MoonXQuote = {
        amountOut: quote.amountOut,
        liquidity: quote.liquidity,
        fee: Number(quote.fee),
        version: Number(quote.version),
        hooks: quote.hooks,
        path: quote.path,
        routeData: quote.routeData
      };

      if (result.version === 0) {
        throw new Error("No valid route found for this token pair");
      }

      return result;
    } catch (error) {
      console.error('MoonX quote failed:', error);
      throw new Error(`Failed to get quote: ${(error as Error).message}`);
    }
  }

  // Thực hiện swap
  async executeSwap(params: SwapParams): Promise<ethers.ContractTransactionResponse> {
    const { tokenIn, tokenOut, amountIn, slippage, recipient, refAddress, refFee } = params;

    // 1. Lấy quote trước - QUAN TRỌNG: Tất cả data cho swap đều lấy từ quote
    const quote = await this.getQuote(tokenIn, tokenOut, amountIn);

    if (quote.version === 0) {
      throw new Error("Không tìm thấy route hợp lệ cho cặp token này");
    }

    // 2. Chuẩn bị tham số - SỬ DỤNG DATA TỪ QUOTE
    const args = [];

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
    if (quote.version === 2) {
      // V2: sử dụng path từ quote
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [quote.path]));
    } else if (quote.version === 3) {
      // V3: sử dụng fee từ quote
      args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [quote.fee]));
    } else if (quote.version === 4) {
      // V4: sử dụng routeData từ quote (ĐÃ ENCODED)
      if (quote.routeData && quote.routeData !== "0x") {
        args.push(quote.routeData); // routeData đã được encoded sẵn
      } else {
        args.push("0x"); // Empty bytes nếu không có routeData
      }
    }

    // args[7]: recipient
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [recipient]));

    // 3. Thực hiện swap
    const value = tokenIn === ethers.ZeroAddress ? amountIn : 0;
    
    try {
      const tx = await this.contract.execMoonXSwap(args, { 
        value,
        gasLimit: 800000 // High gas limit for complex swaps
      });
      
      return tx;
    } catch (error) {
      console.error('MoonX swap failed:', error);
      throw new Error(`Swap execution failed: ${(error as Error).message}`);
    }
  }

  // Kiểm tra allowance của token
  async checkTokenAllowance(tokenAddress: string, ownerAddress: string): Promise<bigint> {
    if (tokenAddress === ethers.ZeroAddress) return ethers.MaxUint256; // ETH không cần approve

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ["function allowance(address owner, address spender) view returns (uint256)"],
      this.signer
    );

    const contractAddress = getMoonXContractAddress(this.network);
    return await tokenContract.allowance(ownerAddress, contractAddress);
  }

  // Approve token
  async approveToken(tokenAddress: string, amount: string): Promise<ethers.ContractTransactionResponse> {
    if (tokenAddress === ethers.ZeroAddress) {
      throw new Error("ETH doesn't need approval");
    }

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ["function approve(address spender, uint256 amount) returns (bool)"],
      this.signer
    );

    const contractAddress = getMoonXContractAddress(this.network);
    return await tokenContract.approve(contractAddress, amount);
  }

  // Debug quote
  async debugQuote(tokenIn: string, tokenOut: string, amountIn: string): Promise<MoonXQuote | null> {
    try {
      const quote = await this.getQuote(tokenIn, tokenOut, amountIn);

      console.log("📊 MoonX Quote Result:", {
        version: quote.version,
        amountOut: quote.amountOut.toString(),
        fee: quote.fee || "N/A",
        path: quote.path || "N/A",
        routeData: quote.routeData || "N/A"
      });

      if (quote.version === 0) {
        console.log("❌ Không tìm thấy route hợp lệ cho cặp token này");
        return null;
      }

      console.log("✅ Quote OK, có thể thực hiện swap");
      return quote;
    } catch (error) {
      console.error("Quote debug failed:", error);
      return null;
    }
  }
} 