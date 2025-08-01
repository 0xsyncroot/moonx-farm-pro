import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { EncryptedWallet } from '@/types/api';

// Re-export types for convenience
export type { EncryptedWallet } from '@/types/api';

// Wallet state
interface WalletState {
  walletAddress: string | null;
  savedWallets: EncryptedWallet[];
  activeWallet: EncryptedWallet | null;
  passkeySupported: boolean;
}

// Wallet actions
interface WalletActions {
  setWalletAddress: (address: string | null) => void;
  setSavedWallets: (wallets: EncryptedWallet[]) => void;
  setActiveWallet: (wallet: EncryptedWallet | null) => void;
  setPasskeySupported: (supported: boolean) => void;
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
};

export const useWalletStore = create<WalletStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Basic setters
      setWalletAddress: (walletAddress) => set({ walletAddress }),
      setSavedWallets: (savedWallets) => set({ savedWallets }),
      setActiveWallet: (activeWallet) => set({ activeWallet }),
      setPasskeySupported: (passkeySupported) => set({ passkeySupported }),

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
        // Keep savedWallets and passkeySupported as they persist
      }),

      // Reset all state
      resetWalletState: () => set(initialState),
    }),
    { name: 'wallet-store' }
  )
);

// Selectors
export const useWalletState = () => useWalletStore(useShallow((state) => ({
  walletAddress: state.walletAddress,
  savedWallets: state.savedWallets,
  activeWallet: state.activeWallet,
  passkeySupported: state.passkeySupported,
  isConnected: !!state.walletAddress,
  setWalletAddress: state.setWalletAddress,
  setSavedWallets: state.setSavedWallets,
  setActiveWallet: state.setActiveWallet,
  setPasskeySupported: state.setPasskeySupported,
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

// Action selectors
export const useWalletActions = () => useWalletStore(useShallow((state) => ({
  setWalletAddress: state.setWalletAddress,
  setSavedWallets: state.setSavedWallets,
  setActiveWallet: state.setActiveWallet,
  setPasskeySupported: state.setPasskeySupported,
  addWallet: state.addWallet,
  removeWallet: state.removeWallet,
  clearWalletData: state.clearWalletData,
})));