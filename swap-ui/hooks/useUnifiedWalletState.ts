import { useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWalletState } from '@/stores';
import { secureSigner } from '@/libs/secure-signer';
import { getWalletsByPreference, type WalletPreference } from './usePrivyWallet';
import type { RPCSettings, WalletProviderConfig } from '@/libs/wallet-provider';

/**
 * Unified Wallet State Hook
 * 
 * Consolidates wallet state access without changing core logic:
 * - Store state (walletAddress, isConnected) remains single source of truth
 * - Auto-connect, manual connect still update store normally  
 * - Adds Privy state + wallet type detection for convenience
 * - Does NOT override store state with computed values
 * 
 * Safe replacement for useWalletState + useUnifiedWallet
 */
export const useUnifiedWalletState = (walletPreference: WalletPreference = 'external-only') => {
  // Core wallet state from Zustand store
  const {
    walletAddress,
    savedWallets,
    activeWallet,
    passkeySupported,
    walletConfig,
    isConnected,
    setWalletAddress,
    setSavedWallets,
    setActiveWallet,
    setPasskeySupported,
    setWalletConfig,
    addWallet,
    removeWallet,
    clearWalletData,
    resetWalletState,
  } = useWalletState();

  // Privy state
  const { ready: privyReady, authenticated: privyAuthenticated, user: privyUser, connectWallet, logout } = usePrivy();
  const { wallets: allPrivyWallets } = useWallets();

  // Derived state - computed from both sources
  const derivedState = useMemo(() => {
    // Filter Privy wallets based on preference
    const privyWallets = getWalletsByPreference(allPrivyWallets || [], walletPreference);

    // Determine current wallet type
    const getCurrentWalletType = (): 'privy' | 'private' | null => {
      // Priority 1: Check active wallet in store (single source of truth)
      if (walletAddress && isConnected) {
        // Check if this address belongs to a private key wallet
        if (activeWallet) {
          return 'private';
        }

        // Check if this address belongs to a Privy wallet
        if (privyAuthenticated && privyWallets.length > 0) {
          const matchingPrivyWallet = privyWallets.find(
            wallet => wallet.address.toLowerCase() === walletAddress.toLowerCase()
          );
          if (matchingPrivyWallet) {
            return 'privy';
          }
        }
      }

      // Priority 2: Fallback to session detection (for edge cases)
      if (secureSigner.hasActiveSession()) {
        return 'private';
      }

      // Priority 3: Fallback to Privy authentication (for edge cases)
      if (privyAuthenticated && privyUser && privyWallets.length > 0) {
        return 'privy';
      }

      // No wallet available
      return null;
    };

    const currentWalletType = getCurrentWalletType();

    // Wallet capability detection
    const hasEmbeddedWallet = privyUser?.wallet?.walletClientType === 'privy';
    const hasLinkedWallet = privyUser?.linkedAccounts?.some(account => account.type === 'wallet');
    const hasExternalWallet = allPrivyWallets?.some(wallet =>
      wallet.walletClientType !== 'privy'
    ) || false;
    const hasAvailableWallets = privyWallets.length > 0;

    // ✅ KEEP SIMPLE: Store walletAddress is single source of truth
    // Don't override with computed addresses - let auto-connect/manual connect handle this

    return {
      // Derived wallet type
      currentWalletType,

      // Privy wallets (filtered by preference)
      privyWallets,

      // Wallet capabilities
      hasEmbeddedWallet,
      hasLinkedWallet,
      hasExternalWallet,
      hasAvailableWallets,
      hasEmbeddedWallets: allPrivyWallets?.some(w => w.walletClientType === 'privy') || false,
      hasExternalWallets: allPrivyWallets?.some(w => w.walletClientType !== 'privy') || false,

      // Verified wallets
      getVerifiedWallets: () => {
        if (!privyAuthenticated || !allPrivyWallets) return [];
        return privyWallets;
      },

      getVerifiedExternalWallets: () => {
        if (!privyAuthenticated || !allPrivyWallets) return [];
        return allPrivyWallets.filter(wallet =>
          wallet.walletClientType !== 'privy'
        );
      },

      // Create secure wallet config (similar to useUnifiedWallet)
      createWalletConfig: (rpcSettings: RPCSettings, walletType: 'privy' | 'private', chainId?: number): WalletProviderConfig => ({
        rpcSettings,
        walletType,
        chainId,
        // Only include Privy context for 'privy' wallet type
        ...(walletType === 'privy' && {
          privyWallets: privyWallets,
          privyAuthenticated: privyAuthenticated,
          privyUser: privyUser,
          // Pass the first external wallet instance for direct use
          activeWalletInstance: privyWallets.length > 0 ? privyWallets[0] : null,
        })
      }),
    };
  }, [
    privyAuthenticated,
    privyUser,
    allPrivyWallets,
    walletPreference,
    walletAddress,
    isConnected,
    activeWallet
  ]);

  return {
    // Core state from Zustand store (SINGLE SOURCE OF TRUTH)
    walletAddress,
    savedWallets,
    activeWallet,
    passkeySupported,
    walletConfig,
    isConnected,

    // Store actions
    setWalletAddress,
    setSavedWallets,
    setActiveWallet,
    setPasskeySupported,
    setWalletConfig,
    addWallet,
    removeWallet,
    clearWalletData,
    resetWalletState,

    // Privy state
    privyReady,
    privyAuthenticated,
    privyUser,
    allPrivyWallets: allPrivyWallets || [],
    connectPrivy: connectWallet,
    disconnectPrivy: logout,

    // Derived state (helpers only, don't override core state)
    ...derivedState,

    // Configuration
    walletPreference,
  };
};

export default useUnifiedWalletState;