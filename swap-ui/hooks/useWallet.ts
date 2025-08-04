import { useCallback, useEffect } from 'react';
import { useWalletState, useUIState, useNetworkState } from '@/stores';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  saveWalletToStorage,
  getWalletsFromStorage,
  removeWalletFromStorage,
  setActiveWallet as setActiveWalletStorage,
  getActiveWallet,
  isValidPrivateKey,
  getAddressFromPrivateKey,
  generateRandomWallet,
  generateWalletName,
  isPasskeySupported,
  clearAllWalletData,
  clearWalletFromStorage,
  type EncryptedWallet,
} from '@/libs/crypto';
import { sessionManager } from '@/libs/session-manager';
import { secureSigner } from '@/libs/secure-signer';

export const useWallet = () => {
  const {
    walletAddress,
    savedWallets,
    activeWallet,
    passkeySupported,
    isConnected,
    setWalletAddress,
    setSavedWallets,
    setActiveWallet,
    addWallet,
    removeWallet,
    setPasskeySupported,
    setWalletConfig,
  } = useWalletState();

  const { setLoading, setError, clearError } = useUIState();



  // Load saved wallets from storage
  const loadSavedWallets = useCallback(() => {
    try {
      const wallets = getWalletsFromStorage();
      setSavedWallets(wallets);
    } catch (error) {
      setError(true, 'Failed to load saved wallets');
    }
  }, [setSavedWallets, setError]);

  // Load active wallet from storage
  const loadActiveWallet = useCallback(async () => {
    try {
      const activeAddress = getActiveWallet();
      
      if (activeAddress) {
        setWalletAddress(activeAddress);
        const wallet = savedWallets.find(w => w.address === activeAddress);
        
        if (wallet) {
          setActiveWallet(wallet);
          
          // 🔒 SECURE: Show wallet as connected but DON'T auto-decrypt
          // Following web3 best practices: never auto-connect/auto-decrypt on page load
          // Session will be restored only when user explicitly needs it (e.g., signing transaction)
          
          // Set wallet config (private key handled by session manager)
          setWalletConfig({
            walletType: 'private',
            privateKey: undefined, // Never auto-store private key
          });
        }
      }
    } catch (error) {
      // Handle error silently
    }
  }, [setWalletAddress, setActiveWallet, savedWallets, setWalletConfig]);

  // Connect wallet with private key
  const connectWithPrivateKey = useCallback(async (privateKey: string): Promise<boolean> => {
    
    if (!isValidPrivateKey(privateKey)) {
      setError(true, 'Invalid private key format');
      return false;
    }

    const address = getAddressFromPrivateKey(privateKey);
    if (!address) {
      setError(true, 'Failed to derive address from private key');
      return false;
    }

    setLoading(true, 'Encrypting wallet...');

    try {
      const walletName = generateWalletName();
      const encryptionResult = await encryptPrivateKey(privateKey, walletName);

      if (!encryptionResult) {
        setError(true, 'Failed to encrypt private key');
        return false;
      }

      const wallet: EncryptedWallet = {
        id: encryptionResult.walletId,
        address,
        encryptedData: encryptionResult.encryptedData,
        credentialId: encryptionResult.credentialId,
        publicKey: encryptionResult.publicKey,
        name: walletName,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        requiresSession: encryptionResult.requiresSession, // New session requirement flag
      };

      // Save to storage
      saveWalletToStorage(wallet);
      setActiveWalletStorage(address);

      // Update state
      addWallet(wallet);
      setWalletAddress(address);
      setActiveWallet(wallet);

      // 🔒 SECURE: Create hardware-backed session (authentication included)
      const sessionCreated = await sessionManager.createSession(wallet);
      if (!sessionCreated) {
        setError(true, 'Failed to create secure session');
        return false;
      }

      // Set wallet config without private key
      setWalletConfig({
        walletType: 'private',
        privateKey: undefined, // Private key handled by session manager
      });

      clearError();
      return true;
    } catch (error) {
      setError(true, 'Failed to save wallet. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [addWallet, setWalletAddress, setActiveWallet, setLoading, setError, clearError, setWalletConfig]);

  // Generate new random wallet
  const generateNewWallet = useCallback(async (): Promise<string | null> => {
    try {
      const newWallet = generateRandomWallet();
      return newWallet.privateKey;
    } catch (error) {
      setError(true, 'Failed to generate new wallet');
      return null;
    }
  }, [setError]);

  // Switch to different wallet
  const switchWallet = useCallback(async (wallet: EncryptedWallet): Promise<boolean> => {
    try {
      setLoading(true, 'Connecting to wallet...');
      
      // 🔒 SECURE: Create new session for switched wallet FIRST
      // This includes authentication automatically
      const sessionCreated = await sessionManager.createSession(wallet);
      if (!sessionCreated) {
        setError(true, 'Authentication failed. Please try again.');
        return false;
      }

      // Only update wallet state after successful authentication
      setActiveWalletStorage(wallet.address);
      setWalletAddress(wallet.address);
      setActiveWallet(wallet);
      
      // Update last used timestamp
      const updatedWallet = { ...wallet, lastUsed: Date.now() };
      saveWalletToStorage(updatedWallet);
      addWallet(updatedWallet);

      // Set wallet config without private key
      setWalletConfig({
        walletType: 'private',
        privateKey: undefined, // Private key handled by session manager
      });
      
      clearError();
      return true;
    } catch (error) {
      setError(true, 'Failed to connect wallet. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [setWalletAddress, setActiveWallet, addWallet, setError, setWalletConfig, setLoading, clearError]);

  // Disconnect current wallet
  const disconnectWallet = useCallback(() => {
    // Clear UI state
    setWalletAddress(null);
    setActiveWallet(null);
    
    // 🔒 SECURE: Permanently clear session and all data
    sessionManager.clearSession();
    
    // Clear from secure signer
    secureSigner.setActiveWallet(null);
    
    // Clear active wallet from storage (but keep saved wallets)
    setActiveWalletStorage('');
    
    // Clear wallet config
    setWalletConfig({
      walletType: 'privy',
      privateKey: undefined,
    });
    
    // Clear error state
    clearError();
  }, [setWalletAddress, setActiveWallet, setWalletConfig, clearError]);

  // Completely remove all wallet data (nuclear option)
  const clearAllWalletDataCompletely = useCallback(() => {
    // Clear UI state
    setWalletAddress(null);
    setActiveWallet(null);
    setSavedWallets([]);
    
    // Clear all storage data
    clearAllWalletData();
    
    // Clear session and secure signer
    sessionManager.clearSession();
    secureSigner.setActiveWallet(null);
    
    // Reset wallet config
    setWalletConfig({
      walletType: 'privy',
      privateKey: undefined,
    });
    
    // Clear error state
    clearError();
  }, [setWalletAddress, setActiveWallet, setSavedWallets, setWalletConfig, clearError]);

  // Delete wallet permanently
  const deleteWallet = useCallback((address: string) => {
    try {
      // Remove from storage and clear if it was active
      clearWalletFromStorage(address);
      removeWallet(address);
      
      // If this was the active wallet, disconnect
      if (walletAddress === address) {
        disconnectWallet();
      }
    } catch (error) {
      setError(true, 'Failed to delete wallet');
    }
  }, [removeWallet, walletAddress, disconnectWallet, setError]);

  // Get private key for transactions
  const getPrivateKey = useCallback(async (): Promise<string | null> => {
    if (!activeWallet) {
      setError(true, 'No active wallet found');
      return null;
    }

    // Try to get from active session first
    const sessionPrivateKey = await sessionManager.getPrivateKey(activeWallet);
    if (sessionPrivateKey) {
      return sessionPrivateKey;
    }

    // No active session or session expired, create new session with authentication
    setLoading(true, 'Authenticating wallet access...');

    try {
      // 🔐 SECURE: Create session (includes authentication automatically)
      const sessionCreated = await sessionManager.createSession(activeWallet);
      if (!sessionCreated) {
        setError(true, 'Failed to authenticate wallet. Please try again.');
        return null;
      }
      
      // Now get private key from newly created session
      const privateKey = await sessionManager.getPrivateKey(activeWallet);
      if (!privateKey) {
        setError(true, 'Failed to access wallet after authentication.');
        return null;
      }
      
      return privateKey;
    } catch (error) {
      setError(true, 'Failed to access wallet');
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeWallet, setLoading, setError]);

  // Initialize wallet data on mount
  useEffect(() => {
    loadSavedWallets();
    setPasskeySupported(isPasskeySupported());
  }, [loadSavedWallets, setPasskeySupported]);

  // Load active wallet when savedWallets changes
  useEffect(() => {
    if (savedWallets.length > 0) {
      loadActiveWallet();
    }
  }, [savedWallets, loadActiveWallet]);

  // Setup session lock callback
  useEffect(() => {
    const unsubscribe = sessionManager.onLock(() => {
      // Auto-disconnect when session is locked
      setWalletAddress(null);
      setActiveWallet(null);
      setActiveWalletStorage('');
      setWalletConfig({
        walletType: 'privy',
        privateKey: undefined,
      });
      // Clear active wallet from secure signer
      secureSigner.setActiveWallet(null);
    });

    return unsubscribe;
  }, [setWalletAddress, setActiveWallet, setWalletConfig]);

  // Sync active wallet with secure signer
  useEffect(() => {
    secureSigner.setActiveWallet(activeWallet);
  }, [activeWallet]);



  // Helper functions for session management
  const hasActiveSession = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return sessionManager.hasActiveSession();
  }, []);

  const extendSession = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return sessionManager.extendSession();
  }, []);

  const lockWallet = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionManager.lockWallet();
  }, []);

  const clearSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionManager.clearSession();
  }, []);

  const getSessionConfig = useCallback(() => {
    return sessionManager.getConfig();
  }, []);

  const updateSessionConfig = useCallback((config: any) => {
    if (typeof window === 'undefined') return;
    sessionManager.updateConfig(config);
  }, []);

  const resetSessionConfig = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionManager.resetConfig();
  }, []);

  return {
    // State
    walletAddress,
    savedWallets,
    activeWallet,
    passkeySupported,
    isConnected,
    
    // Actions
    connectWithPrivateKey,
    generateNewWallet,
    switchWallet,
    disconnectWallet,
    deleteWallet,
    getPrivateKey,
    loadSavedWallets,
    clearAllWalletDataCompletely,
    
    // Session management
    hasActiveSession,
    extendSession,
    lockWallet,
    clearSession,
    getSessionConfig,
    updateSessionConfig,
    resetSessionConfig,
  };
}; 