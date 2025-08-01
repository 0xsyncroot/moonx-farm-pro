import type { Network } from '@/types/api';

/**
 * Build transaction URL for blockchain explorer
 */
export const buildTransactionUrl = (network: Network, transactionHash: string): string => {
  return `${network.explorer}/tx/${transactionHash}`;
};

/**
 * Build address URL for blockchain explorer
 */
export const buildAddressUrl = (network: Network, address: string): string => {
  return `${network.explorer}/address/${address}`;
};

/**
 * Open transaction in new tab
 */
export const openTransactionInExplorer = (network: Network, transactionHash: string): void => {
  const url = buildTransactionUrl(network, transactionHash);
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Open address in new tab
 */
export const openAddressInExplorer = (network: Network, address: string): void => {
  const url = buildAddressUrl(network, address);
  window.open(url, '_blank', 'noopener,noreferrer');
};