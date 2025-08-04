import { useEffect, useState } from 'react';
import { sessionManager } from '@/libs/session-manager';
import { secureSigner } from '@/libs/secure-signer';
import { 
  getActiveWallet, 
  getWalletsFromStorage, 
  type EncryptedWallet 
} from '@/libs/crypto';
import { useWalletStore } from '@/stores/useWalletStore';

export interface AutoConnectResult {
  isChecking: boolean;
  isAutoConnected: boolean;
  error: string | null;
}

/**
 * Hook to automatically reconnect private wallet when valid session exists
 * Should be called once during app initialization
 */
export const useWalletAutoConnect = (): AutoConnectResult => {
  const [isChecking, setIsChecking] = useState(true);
  const [isAutoConnected, setIsAutoConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const autoConnectWallet = async () => {
      try {
        // Only run on client side
        if (typeof window === 'undefined') return;
        
        // Check if there's a valid session in storage
        if (!sessionManager.hasValidStoredSession()) {
          return;
        }
        // Load active wallet address from storage
        const activeWalletAddress = getActiveWallet();
        if (!activeWalletAddress) {
          return;
        }

        // Load all saved wallets from storage
        const savedWallets = getWalletsFromStorage();
        if (savedWallets.length === 0) {
          return;
        }

        // Find the active wallet in saved wallets
        const activeWalletData = savedWallets.find(
          w => w.address.toLowerCase() === activeWalletAddress.toLowerCase()
        );
        
        if (!activeWalletData) {
          console.warn('Active wallet not found in saved wallets');
          return;
        }

        // Verify session is for this specific wallet
        if (!sessionManager.hasValidStoredSession(activeWalletData.id, activeWalletData.address)) {
          return;
        }

        // Try to create/restore session for this wallet
        const sessionCreated = await sessionManager.createSession(activeWalletData);
        if (!sessionCreated) {
          return;
        }

        // Only update state if component is still mounted
        if (!mounted) return;

        // Update stores with restored wallet data (use getState to avoid infinite loops)
        const store = useWalletStore.getState();
        store.setSavedWallets(savedWallets);
        store.setActiveWallet(activeWalletData);
        store.setWalletAddress(activeWalletData.address);

        // Set active wallet in secure signer
        secureSigner.setActiveWallet(activeWalletData);

        setIsAutoConnected(true);
        
        console.log('Wallet auto-connected:', activeWalletData.address);
        
      } catch (error) {
        if (!mounted) return;
        
        const errorMessage = error instanceof Error ? error.message : 'Auto-connect failed';
        setError(errorMessage);
        console.warn('Wallet auto-connect failed:', errorMessage);
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    // Run auto-connect with a small delay to ensure proper initialization
    const timeoutId = setTimeout(() => {
      autoConnectWallet();
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // Empty dependency array - only run once on mount

  return {
    isChecking,
    isAutoConnected,
    error
  };
};

/**
 * Utility function to manually trigger wallet auto-connect
 * Useful for testing or manual reconnection
 */
export const manualWalletAutoConnect = async (): Promise<boolean> => {
  try {
    // Only run on client side
    if (typeof window === 'undefined') return false;
    
    // Check if there's a valid session in storage
    if (!sessionManager.hasValidStoredSession()) {
      return false;
    }

    // Load active wallet address from storage
    const activeWalletAddress = getActiveWallet();
    if (!activeWalletAddress) {
      return false;
    }

    // Load all saved wallets from storage
    const savedWallets = getWalletsFromStorage();
    if (savedWallets.length === 0) {
      return false;
    }

    // Find the active wallet in saved wallets
    const activeWalletData = savedWallets.find(
      w => w.address.toLowerCase() === activeWalletAddress.toLowerCase()
    );
    
    if (!activeWalletData) {
      return false;
    }

    // Verify session is for this specific wallet
    if (!sessionManager.hasValidStoredSession(activeWalletData.id, activeWalletData.address)) {
      return false;
    }

    // Try to create/restore session for this wallet
    const sessionCreated = await sessionManager.createSession(activeWalletData);
    if (!sessionCreated) {
      return false;
    }

    // Get store instance and update
    const store = useWalletStore.getState();
    store.setSavedWallets(savedWallets);
    store.setActiveWallet(activeWalletData);
    store.setWalletAddress(activeWalletData.address);

    // Set active wallet in secure signer
    secureSigner.setActiveWallet(activeWalletData);

    console.log('Manual wallet auto-connect successful:', activeWalletData.address);
    return true;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Manual auto-connect failed';
    console.warn('Manual wallet auto-connect failed:', errorMessage);
    return false;
  }
};