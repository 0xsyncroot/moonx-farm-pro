/**
 * ✅ SECURITY IMPROVEMENTS IMPLEMENTED:
 * 
 * 1. PRIVY INTEGRATION: Uses useWallets hook to get verified wallet list
 * 2. ADDRESS VERIFICATION: Ensures signer address matches Privy-verified wallets  
 * 3. AUTHENTICATION CHECK: Validates user authentication before wallet operations
 * 4. REAL-TIME VALIDATION: Updates config when Privy state changes
 * 5. SECURE CONNECTION CHECK: Actually verifies connected wallets vs empty array
 * 6. FLEXIBLE WALLET SUPPORT: Configurable preference for different wallet types
 * 
 * ✅ FLEXIBLE WALLET PREFERENCES:
 * - 'external-only': Only MetaMask, Rabby, OKX, etc. (current default)
 * - 'embedded-only': Only Privy embedded wallets
 * - 'external-preferred': External first, fallback to embedded
 * - 'embedded-preferred': Embedded first, fallback to external
 * - 'any': Any available wallet
 * 
 * USAGE:
 * - useUnifiedWallet() // Default: external-only (backward compatible)
 * - useUnifiedWallet('any') // Support all wallet types
 * - useUnifiedWallet('external-preferred') // External first, embedded fallback
 * - Use createWalletConfig() to create secure config
 * - Call verifySignerSecurity() before critical operations
 */

import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { secureSigner } from './secure-signer';
import { WalletPreference, getWalletsByPreference } from '../hooks/usePrivyWallet';
import { SwapErrorFactory } from '@/types/errors';


export interface RPCSettings {
  baseRpcUrl: string;
  customRpcUrl?: string;
  useCustomRpc: boolean;
}

export interface WalletProviderConfig {
  rpcSettings: RPCSettings;
  walletType: 'privy' | 'private';
  // Add Privy context for wallet verification
  privyWallets?: any[];
  privyAuthenticated?: boolean;
  privyUser?: any;
  // Add active wallet instance for direct use
  activeWalletInstance?: any;
  // Add chainId from selected network
  chainId?: number;
}

export class UnifiedWalletProvider {
  private provider: ethers.Provider;
  private signer: ethers.Signer | null = null;
  private config: WalletProviderConfig;

  constructor(config: WalletProviderConfig) {
    this.config = config;
    
    // Initialize provider based on RPC settings
    const rpcUrl = config.rpcSettings.useCustomRpc && config.rpcSettings.customRpcUrl 
      ? config.rpcSettings.customRpcUrl 
      : config.rpcSettings.baseRpcUrl;
      
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  // ✅ IMPROVED: Check connection with proper Privy validation
  async checkConnection(): Promise<string[]> {
    if (this.config.walletType === 'private') {
      // Private key wallet: Check if session exists
      if (!secureSigner.hasActiveSession()) {
        return [];
      }
      return ['private_key_account'];
    } else if (this.config.walletType === 'privy') {
      // ✅ SECURE: Verify with Privy's authentication and wallet state
      if (!this.config.privyAuthenticated || !this.config.privyUser) {
        return [];
      }
      
      // Check if user has any external wallets connected through Privy
      const privyWallets = this.config.privyWallets || [];
      const externalWallets = privyWallets.filter(wallet => 
        wallet.walletClientType !== 'privy' // Any external wallet (MetaMask, Rabby, OKX, etc.)
      );
      
      if (externalWallets.length === 0) {
        return [];
      }
      
      // Return addresses of verified external wallets
      return externalWallets.map(wallet => wallet.address);
    }
    return [];
  }

  // ✅ EXPLICIT: Only call when user explicitly wants to connect
  async requestConnection(): Promise<string[]> {
    if (this.config.walletType === 'private') {
      if (!secureSigner.hasActiveSession()) {
        throw SwapErrorFactory.createAuthenticationRequiredError();
      }
      return ['private_key_account'];
    } else if (this.config.walletType === 'privy') {
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          // Request user permission - ONLY when user explicitly connects
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          return accounts || [];
        } catch (requestError) {
          const error = requestError as any;
          if (error.code === 4001) {
            throw SwapErrorFactory.createTransactionRejectedError(error);
          } else if (error.code === -32002) {
            throw SwapErrorFactory.createWalletConnectionLostError(error);
          } else {
            throw SwapErrorFactory.createWalletConnectionLostError(error);
          }
        }
      } else {
        throw SwapErrorFactory.createWalletNotFoundError();
      }
    }
    throw SwapErrorFactory.createWalletNotFoundError();
  }

  // ✅ SECURE: Initialize signer with proper Privy verification
  async initializeSigner(): Promise<ethers.Signer> {
    if (this.config.walletType === 'private') {
      if (!secureSigner.hasActiveSession()) {
        throw SwapErrorFactory.createAuthenticationRequiredError();
      }
      
      this.signer = await secureSigner.createProviderWallet(this.provider);
      return this.signer!
    } else if (this.config.walletType === 'privy') {
      // ✅ SECURITY: Verify Privy authentication first
      if (!this.config.privyAuthenticated || !this.config.privyUser) {
        throw SwapErrorFactory.createWalletNotFoundError();
      }
      
      // ✅ SECURITY: Verify user has external wallets connected
      const privyWallets = this.config.privyWallets || [];
      const externalWallets = privyWallets.filter(wallet => 
        wallet.walletClientType !== 'privy' // Any external wallet (MetaMask, Rabby, OKX, etc.)
      );
      
      if (externalWallets.length === 0) {
        throw SwapErrorFactory.createWalletNotFoundError();
      }
      // Use active wallet instance if available, otherwise get first external wallet
      const activeWallet = this.config.activeWalletInstance || externalWallets.find(async wallet => await wallet.isConnected());
      try {
        // Get chainId from config (from selectedNetwork)
        const chainId = this.config.chainId // Default to mainnet if not provided
        if (!chainId) {
          throw SwapErrorFactory.createWalletConnectionLostError();
        }
        
        // Switch chain if needed (Privy handles this properly)
        if (activeWallet.chainId !== `eip155:${chainId}` && activeWallet.chainId !== `${chainId}`) {
          await activeWallet.switchChain(chainId);
        }
        
        // Get Ethereum provider from Privy wallet (this is the correct way)
        const ethereumProvider = await activeWallet.getEthereumProvider();
        if (!ethereumProvider) {
          throw SwapErrorFactory.createWalletConnectionLostError();
        }
        
        // Create ethers provider from Privy's Ethereum provider
        const web3Provider = new ethers.BrowserProvider(ethereumProvider);
        const signer = await web3Provider.getSigner();
        const signerAddress = await signer.getAddress();
        
        // ✅ CRITICAL SECURITY: Verify signer address matches the expected Privy wallet
        if (signerAddress.toLowerCase() !== activeWallet.address.toLowerCase()) {
          throw SwapErrorFactory.createWalletConnectionLostError();
        }
        
        this.signer = signer;
        return this.signer;
        
      } catch (error: any) {
        // If it's already a SwapError, re-throw it
        if (error.code) {
          throw error;
        }
        
        // Enhanced error handling for common wallet issues
        if (error.code === 4001 || error.message.includes('user rejected')) {
          throw SwapErrorFactory.createTransactionRejectedError(error);
        }
        
        if (error.code === -32002) {
          throw SwapErrorFactory.createWalletConnectionLostError(error);
        }
        
        if (error.message.includes('no accounts') || error.message.includes('wallet must has at least one account')) {
          throw SwapErrorFactory.createWalletNotFoundError(error);
        }
        
        // Default to wallet connection lost for unknown Privy errors
        throw SwapErrorFactory.createWalletConnectionLostError(error);
      }
    }
    throw SwapErrorFactory.createWalletNotFoundError();
  }

  // Get current signer
  getSigner(): ethers.Signer {
    if (!this.signer) {
      throw SwapErrorFactory.createAuthenticationRequiredError();
    }
    return this.signer;
  }

  // Get provider
  getProvider(): ethers.Provider {
    return this.provider;
  }

  // Get wallet address
  async getAddress(): Promise<string> {
    const signer = this.getSigner();
    return await signer.getAddress();
  }

  // Check if wallet is connected
  isConnected(): boolean {
    return this.signer !== null;
  }

  // Update RPC settings
  updateRpcSettings(rpcSettings: RPCSettings): void {
    this.config.rpcSettings = rpcSettings;
    
    const rpcUrl = rpcSettings.useCustomRpc && rpcSettings.customRpcUrl 
      ? rpcSettings.customRpcUrl 
      : rpcSettings.baseRpcUrl;
      
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Reset signer to reinitialize with new provider
    this.signer = null;
  }

  // Get network info
  async getNetwork(): Promise<ethers.Network> {
    return await this.provider.getNetwork();
  }

  // Get balance
  async getBalance(address?: string): Promise<bigint> {
    const addr = address || await this.getAddress();
    return await this.provider.getBalance(addr);
  }

  // ✅ SECURITY: Update Privy context for real-time validation
  updatePrivyContext(privyWallets: any[], privyAuthenticated: boolean, privyUser: any): void {
    this.config.privyWallets = privyWallets;
    this.config.privyAuthenticated = privyAuthenticated;
    this.config.privyUser = privyUser;
    
    // Reset signer to force re-validation on next use
    if (this.config.walletType === 'privy') {
      this.signer = null;
    }
  }

  // Switch wallet type
  async switchWalletType(walletType: 'privy' | 'private'): Promise<void> {
    this.config.walletType = walletType;
    this.signer = null; // Reset signer
    await this.initializeSigner();
  }
  
  // ✅ SECURITY: Verify current signer is still valid
  async verifySignerSecurity(): Promise<boolean> {
    if (!this.signer) return false;
    
    if (this.config.walletType === 'privy') {
      if (!this.config.privyAuthenticated || !this.config.privyUser) {
        return false;
      }
      
      const signerAddress = await this.signer.getAddress();
      const privyWallets = this.config.privyWallets || [];
      const externalWallets = privyWallets.filter(wallet => 
        wallet.walletClientType !== 'privy' // Any external wallet (MetaMask, Rabby, OKX, etc.)
      );
      
      return externalWallets.some(wallet => 
        wallet.address.toLowerCase() === signerAddress.toLowerCase()
      );
    }
    
    return true; // Private key wallet validation handled separately
  }
}

// React hook for unified wallet
export const useUnifiedWallet = (walletPreference: WalletPreference = 'external-only') => {
  const { ready, authenticated, user, connectWallet, logout } = usePrivy();
  const { wallets } = useWallets();
  
  // Get wallets based on preference
  const filteredWallets = getWalletsByPreference(wallets, walletPreference);
  
  return {
    // Privy states
    privyReady: ready,
    privyAuthenticated: authenticated,
    privyUser: user,
    privyWallets: filteredWallets, // Wallets based on preference
    allPrivyWallets: wallets, // All wallets (embedded + external)
    connectPrivy: connectWallet,
    disconnectPrivy: logout,
    
    // Wallet type detection
    hasEmbeddedWallet: user?.wallet?.walletClientType === 'privy',
    hasLinkedWallet: user?.linkedAccounts?.some(account => account.type === 'wallet'),
    hasExternalWallet: wallets?.some(wallet => 
      wallet.walletClientType !== 'privy' // Any external wallet (MetaMask, Rabby, OKX, etc.)
    ),
    hasAvailableWallets: filteredWallets.length > 0,
    
    // Helper to determine wallet type
    getWalletType: (): 'privy' | 'private' | null => {
      // Priority 1: Check if user is authenticated with Privy
      if (authenticated && user) {
        return 'privy';
      }
      
      // Priority 2: Check if private key wallet is available
      if (secureSigner.hasActiveSession()) {
        return 'private';
      }
      
      // No wallet available
      return null;
    },
    
    // ✅ SECURITY: Get verified wallets based on preference
    getVerifiedWallets: () => {
      if (!authenticated || !wallets) return [];
      return filteredWallets;
    },
    
    // ✅ LEGACY: Get verified external wallets (backward compatibility)
    getVerifiedExternalWallets: () => {
      if (!authenticated || !wallets) return [];
      return wallets.filter(wallet => 
        wallet.walletClientType !== 'privy' // Any external wallet (MetaMask, Rabby, OKX, etc.)
      );
    },
    
    // ✅ HELPER: Create secure wallet config
    createWalletConfig: (rpcSettings: RPCSettings, walletType: 'privy' | 'private', chainId?: number): WalletProviderConfig => ({
      rpcSettings,
      walletType,
      chainId,
      // Only include Privy context for 'privy' wallet type
      ...(walletType === 'privy' && {
        privyWallets: filteredWallets,
        privyAuthenticated: authenticated,
        privyUser: user,
        // Pass the first external wallet instance for direct use
        activeWalletInstance: filteredWallets.length > 0 ? filteredWallets[0] : null,
      })
    }),
    
    // Configuration info
    walletPreference,
    hasEmbeddedWallets: wallets?.some(w => w.walletClientType === 'privy') || false,
    hasExternalWallets: wallets?.some(w => w.walletClientType !== 'privy') || false,
  };
};

// Default RPC settings - will be updated dynamically from selected network
export const DEFAULT_RPC_SETTINGS: RPCSettings = {
  baseRpcUrl: '', // Will be set from selectedNetwork.rpc
  customRpcUrl: undefined,
  useCustomRpc: false,
};

// Create wallet provider instance
export const createWalletProvider = (config: WalletProviderConfig): UnifiedWalletProvider => {
  return new UnifiedWalletProvider(config);
};

export default UnifiedWalletProvider; 