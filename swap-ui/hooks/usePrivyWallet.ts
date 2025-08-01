/**
 * ✅ FLEXIBLE WALLET PROVIDER HOOK
 * 
 * Supports different wallet preferences for maximum flexibility:
 * - 'external-only': Only MetaMask, Rabby, OKX, etc. (current default)
 * - 'embedded-only': Only Privy embedded wallets
 * - 'external-preferred': External first, fallback to embedded
 * - 'embedded-preferred': Embedded first, fallback to external  
 * - 'any': Any available wallet
 * 
 * USAGE EXAMPLES:
 * - usePrivyWallet() // Default: external-only (backward compatible)
 * - usePrivyWallet({ walletPreference: 'any' }) // Support all wallets
 * - usePrivyWallet({ walletPreference: 'external-preferred' }) // External first
 */

import { useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWalletState, useUIState, useNetworkState } from '@/stores';

// Wallet preference configuration
export type WalletPreference = 
  | 'external-only'           // Only external wallets (MetaMask, Rabby, etc.)
  | 'embedded-only'          // Only embedded wallets (Privy)
  | 'external-preferred'     // External first, fallback to embedded
  | 'embedded-preferred'     // Embedded first, fallback to external
  | 'any';                   // Any wallet available

interface UsePrivyWalletConfig {
  walletPreference?: WalletPreference;
}

// Helper function to filter wallets based on preference
export const getWalletsByPreference = (wallets: any[], preference: WalletPreference) => {
  const externalWallets = wallets.filter(w => w.walletClientType !== 'privy');
  const embeddedWallets = wallets.filter(w => w.walletClientType === 'privy');

  switch (preference) {
    case 'external-only':
      return externalWallets;
    case 'embedded-only':
      return embeddedWallets;
    case 'external-preferred':
      return [...externalWallets, ...embeddedWallets];
    case 'embedded-preferred':
      return [...embeddedWallets, ...externalWallets];
    case 'any':
    default:
      return wallets;
  }
};

export const usePrivyWallet = (config: UsePrivyWalletConfig = {}) => {
  // Simply use hooks - PrivyProvider will handle errors gracefully
  const { login, logout, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { setWalletAddress, setActiveWallet } = useWalletState();
  const { closeWalletModal, setError, clearError, walletModal } = useUIState();
  const { walletConfig } = useNetworkState();

  // Default to external-only for backward compatibility
  const walletPreference = config.walletPreference || 'external-only';
  
  // Get wallets based on preference
  const filteredWallets = getWalletsByPreference(wallets, walletPreference);
  const primaryWallet = filteredWallets.find(wallet => wallet.address); // First wallet with address
  const isConnected = authenticated && !!primaryWallet;

  // Sync wallet state when wallets change (after login)
  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      // Find wallet based on preference
      const availableWallet = filteredWallets.find(w => w.address);
      if (availableWallet) {
        setWalletAddress(availableWallet.address);
        const walletInfo = {
          id: `privy-${availableWallet.address}`,
          address: availableWallet.address,
          name: `${availableWallet.walletClientType.charAt(0).toUpperCase() + availableWallet.walletClientType.slice(1)} Wallet`,
          type: 'privy' as const,
        };
        
        // Auto-close wallet modal if it's open
        if (walletModal.isOpen) {
          closeWalletModal();
        }
      }
    } else if (!authenticated && walletConfig.walletType === 'privy') {
      // Only clear wallet for Privy wallets, not private key wallets
      setWalletAddress(null);
    }
  }, [authenticated, wallets, filteredWallets, setWalletAddress, walletModal.isOpen, closeWalletModal, walletConfig.walletType]);

  // Connect with Privy
  const connectWithPrivy = useCallback(async () => {
    try {
      clearError();
      await login();
      
      // Don't close modal immediately - let useEffect handle wallet sync
      // The modal will close when wallet address is set
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('rejected')) {
        setError(true, 'Login was cancelled. Please try again.');
      } else if (errorMessage.includes('wallet must has at least one account')) {
        setError(true, 'Wallet connection failed. Please ensure your wallet has at least one account and try again.');
      } else {
        setError(true, `Failed to connect with Privy: ${errorMessage}`);
      }
    }
  }, [login, setError, clearError]);

  // Disconnect Privy
  const disconnectPrivy = useCallback(async () => {
    try {
      await logout();
      setWalletAddress(null);
      setActiveWallet(null);
    } catch (error) {
      setError(true, 'Failed to disconnect');
    }
  }, [logout, setWalletAddress, setActiveWallet, setError]);

  // Get wallet info
  const getWalletInfo = useCallback(() => {
    if (!primaryWallet) return null;
    
    return {
      address: primaryWallet.address,
      type: 'privy',
      name: `${primaryWallet.walletClientType.charAt(0).toUpperCase() + primaryWallet.walletClientType.slice(1)} Wallet`,
      chainId: primaryWallet.chainId,
    };
  }, [primaryWallet]);

  return {
    // State
    isConnected,
    walletAddress: primaryWallet?.address || null,
    walletInfo: getWalletInfo(),
    user,
    
    // Actions
    connectWithPrivy,
    disconnectPrivy,
    
    // Privy specific
    authenticated,
    wallets: filteredWallets, // Wallets based on preference
    allWallets: wallets, // All wallets (embedded + external)
    availableWallets: filteredWallets.map(wallet => ({
      id: `privy-${wallet.address}`,
      address: wallet.address,
      name: `${wallet.walletClientType.charAt(0).toUpperCase() + wallet.walletClientType.slice(1)} Wallet`,
      type: 'privy' as const,
      chainId: wallet.chainId,
    })),
    
    // Configuration
    walletPreference,
    hasExternalWallets: wallets.some(w => w.walletClientType !== 'privy'),
    hasEmbeddedWallets: wallets.some(w => w.walletClientType === 'privy'),
  };
}; 