import { AbiCoder, formatUnits, parseUnits, isAddress } from 'ethers';

// MoonX Contract ABI từ guide
export const MOONX_ABI = [
  "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
  "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))"
] as const;

// ERC20 ABI cho token operations
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
] as const;

// Multicall3 ABI cho batch calls
export const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)"
] as const;

// Helper function để build referral data theo guide
export function buildRefData(refAddress: string = "0x0000000000000000000000000000000000000000", refFee: number = 0): string {
  if (refAddress === "0x0000000000000000000000000000000000000000" || refFee <= 0) {
    return "0x40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  }
  
  // Encode referral data array using ethers.js AbiCoder
  const abiCoder = AbiCoder.defaultAbiCoder();
  
  const refDataArray = [
    abiCoder.encode(["address"], [refAddress]),
    abiCoder.encode(["uint256"], [refFee])
  ];
  
  return abiCoder.encode(["bytes[]"], [refDataArray]);
}

// Helper để format balance với decimals
export function formatBalance(balance: bigint, decimals: number | string): string {
  return formatUnits(balance, decimals);
}

// Helper để parse amount với decimals
export function parseAmount(amount: string, decimals: number | string): bigint {
  return parseUnits(amount, decimals);
}

// Utility để check address format
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

// Utility để normalize address (chuyển về lowercase)
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

// Utility để compare addresses (case-insensitive)
export function addressEquals(address1: string, address2: string): boolean {
  return normalizeAddress(address1) === normalizeAddress(address2);
}

// Utility để shorten address for display
export function shortenAddress(address: string, chars: number = 4): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

// Constants
export const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Gas limit recommendations
export const GAS_LIMITS = {
  ERC20_TRANSFER: 65000,
  ERC20_APPROVE: 55000,
  SWAP_SIMPLE: 300000,
  SWAP_COMPLEX: 500000,
  MULTICALL: 1000000
} as const; 