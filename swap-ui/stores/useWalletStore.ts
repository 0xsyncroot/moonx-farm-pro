import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { EncryptedWallet, WalletConfig } from '@/types/api';

// Re-export types for convenience
export type { EncryptedWallet, WalletConfig } from '@/types/api';

// Wallet state
interface WalletState {
  walletAddress: string | null;
  savedWallets: EncryptedWallet[];
  activeWallet: EncryptedWallet | null;
  passkeySupported: boolean;
  walletConfig: WalletConfig;
}

// Wallet actions
interface WalletActions {
  setWalletAddress: (address: string | null) => void;
  setSavedWallets: (wallets: EncryptedWallet[]) => void;
  setActiveWallet: (wallet: EncryptedWallet | null) => void;
  setPasskeySupported: (supported: boolean) => void;
  setWalletConfig: (config: WalletConfig) => void;
  addWallet: (wallet: EncryptedWallet) => void;
  removeWallet: (address: string) => void;
  clearWalletData: () => void;
  resetWalletState: () => void;
}

type WalletStore = WalletState & WalletActions;

const initialState: WalletState = {
  walletAddress: null,
  savedWallets: [],
  activeWallet: null,
  passkeySupported: false,
  walletConfig: {
    walletType: 'privy',
    privateKey: undefined,
  },
};

export const useWalletStore = create<WalletStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Basic setters
        setWalletAddress: (walletAddress) => set({ walletAddress }),
        setSavedWallets: (savedWallets) => set({ savedWallets }),
        setActiveWallet: (activeWallet) => set({ activeWallet }),
        setPasskeySupported: (passkeySupported) => set({ passkeySupported }),
        setWalletConfig: (walletConfig) => set({ walletConfig }),

        // Add wallet (prevents duplicates)
        addWallet: (wallet) => {
          const { savedWallets } = get();
          const updatedWallets = savedWallets.filter(w => w.address !== wallet.address);
          updatedWallets.push(wallet);
          set({ savedWallets: updatedWallets });
        },

        // Remove wallet
        removeWallet: (address) => {
          const { savedWallets, activeWallet } = get();
          const updatedWallets = savedWallets.filter(w => w.address !== address);
          set({ 
            savedWallets: updatedWallets,
            // Clear active wallet if it was removed
            activeWallet: activeWallet?.address === address ? null : activeWallet
          });
        },

        // Clear all wallet data (for logout)
        clearWalletData: () => set({
          walletAddress: null,
          activeWallet: null,
          walletConfig: {
            walletType: 'privy',
            privateKey: undefined,
          },
          // Keep savedWallets and passkeySupported as they persist
        }),

        // Reset all state
        resetWalletState: () => set(initialState),
      }),
      {
        name: 'moonx-wallet-store',
        // Only persist non-sensitive data
        partialize: (state) => ({
          // Don't persist walletAddress for security (will be restored from activeWallet)
          savedWallets: state.savedWallets,
          activeWallet: state.activeWallet,
          passkeySupported: state.passkeySupported,
          walletConfig: {
            walletType: state.walletConfig.walletType,
            // Don't persist private key for security
            privateKey: undefined,
          },
        }),
      }
    ),
    { name: 'wallet-store' }
  )
);

// Selectors
export const useWalletState = () => useWalletStore(useShallow((state) => ({
  walletAddress: state.walletAddress,
  savedWallets: state.savedWallets,
  activeWallet: state.activeWallet,
  passkeySupported: state.passkeySupported,
  walletConfig: state.walletConfig,
  isConnected: !!state.walletAddress,
  setWalletAddress: state.setWalletAddress,
  setSavedWallets: state.setSavedWallets,
  setActiveWallet: state.setActiveWallet,
  setPasskeySupported: state.setPasskeySupported,
  setWalletConfig: state.setWalletConfig,
  addWallet: state.addWallet,
  removeWallet: state.removeWallet,
  clearWalletData: state.clearWalletData,
  resetWalletState: state.resetWalletState,
})));

// Granular selectors
export const useWalletAddress = () => useWalletStore(state => state.walletAddress);
export const useIsConnected = () => useWalletStore(state => !!state.walletAddress);
export const useSavedWallets = () => useWalletStore(state => state.savedWallets);
export const useActiveWallet = () => useWalletStore(state => state.activeWallet);
export const usePasskeySupported = () => useWalletStore(state => state.passkeySupported);
export const useWalletConfig = () => useWalletStore(state => state.walletConfig);

// Action selectors
export const useWalletActions = () => useWalletStore(useShallow((state) => ({
  setWalletAddress: state.setWalletAddress,
  setSavedWallets: state.setSavedWallets,
  setActiveWallet: state.setActiveWallet,
  setPasskeySupported: state.setPasskeySupported,
  setWalletConfig: state.setWalletConfig,
  addWallet: state.addWallet,
  removeWallet: state.removeWallet,
  clearWalletData: state.clearWalletData,
})));