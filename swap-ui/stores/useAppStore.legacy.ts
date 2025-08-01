import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { AppState, Network, TokenBalance, SwapQuote, EncryptedWallet } from '@/types';
import { 
  networkService, 
  tokenService, 
  swapService,
  type TokenLoadParams,
  type SpecificTokenParams,
  type QuoteParams,
  type SwapExecutionParams
} from '@/services';

// Alternative approach: Use createWithEqualityFn with shallow as default
// import { createWithEqualityFn } from 'zustand/traditional';
// import { shallow } from 'zustand/shallow';
// export const useAppStore = createWithEqualityFn<AppStore>()(
//   devtools(...), shallow
// );

// Add RPC and wallet configuration to app state
export interface RPCSettings {
  baseRpcUrl: string;
  customRpcUrl?: string;
  useCustomRpc: boolean;
}

export interface WalletConfig {
  walletType: 'privy' | 'private';
  privateKey?: string;
}

interface AppActions {
  // Network actions
  setNetworks: (networks: Network[]) => void;
  setSelectedNetwork: (network: Network | null) => void;
  loadNetworks: () => Promise<void>;
  
  // Wallet actions
  setWalletAddress: (address: string | null) => void;
  setSavedWallets: (wallets: EncryptedWallet[]) => void;
  setActiveWallet: (wallet: EncryptedWallet | null) => void;
  addWallet: (wallet: EncryptedWallet) => void;
  removeWallet: (address: string) => void;
  setPasskeySupported: (supported: boolean) => void;
  
  // RPC actions
  setRpcSettings: (settings: RPCSettings) => void;
  setWalletConfig: (config: WalletConfig) => void;
  
  // Token actions
  setTokens: (tokens: TokenBalance[]) => void;
  loadTokens: (params?: Partial<TokenLoadParams>) => Promise<void>;
  refreshSpecificTokens: (tokenAddresses: string[]) => Promise<void>;
  setDefaultTokens: () => void;
  
  // Swap actions
  setFromToken: (token: TokenBalance | null) => void;
  setToToken: (token: TokenBalance | null) => void;
  setFromAmount: (amount: string) => void;
  setSlippage: (slippage: number) => void;
  swapTokens: () => void;
  setQuote: (quote: SwapQuote | null) => void;
  getSwapQuote: () => Promise<void>;
  executeSwap: (getWalletType: () => string | null) => Promise<string | false>;
  
  // UI actions
  openWalletModal: (mode?: 'connect' | 'manage') => void;
  closeWalletModal: () => void;
  setLoading: (loading: boolean, message?: string) => void;
  setError: (error: boolean, message?: string) => void;
  clearError: () => void;
  
  // Reset actions
  resetSwapForm: () => void;
  resetApp: () => void;
}

type AppStore = AppState & AppActions;

const initialState: AppState = {
  // Network state
  selectedNetwork: null,
  networks: [],
  
  // Wallet state
  walletAddress: null,
  savedWallets: [],
  activeWallet: null,
  passkeySupported: false,
  
  // RPC settings
  rpcSettings: {
    baseRpcUrl: 'https://mainnet.base.org',
    customRpcUrl: undefined,
    useCustomRpc: false,
  },
  
  // Wallet configuration
  walletConfig: {
    walletType: 'privy',
    privateKey: undefined,
  },
  
  // Token state
  tokens: [],
  
  // Swap state
  swapForm: {
    fromToken: null,
    toToken: null,
    fromAmount: '',
    slippage: 0.5,
  },
  quote: null,
  
  // UI state
  walletModal: {
    isOpen: false,
    mode: 'connect',
  },
  loading: {
    isLoading: false,
  },
  error: {
    hasError: false,
  },
};

// Simple store without complex middleware
export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      
      // Network actions
      setNetworks: (networks) => set({ networks }),
      setSelectedNetwork: (selectedNetwork) => set({ selectedNetwork }),
      loadNetworks: async () => {
        const { setLoading, setError, clearError } = get();
        try {
          setLoading(true, 'Loading networks...');
          const result = await networkService.loadNetworks();
          
          if (result.success && result.data) {
            set({ networks: result.data });
            
            // Set default network if none selected
            const { selectedNetwork: currentNetwork } = get();
            if (result.data.length > 0 && !currentNetwork) {
              const defaultNetwork = networkService.getDefaultNetwork(result.data);
              set({ selectedNetwork: defaultNetwork });
            }
            
            clearError();
          } else {
            // Even if not success, we might have fallback data
            if (result.data) {
              set({ networks: result.data });
            }
            if (result.error) {
              setError(true, result.error);
            }
          }
        } catch (error) {
          console.error('Store: Failed to load networks:', error);
          setError(true, 'Failed to load networks. Please check your connection and try again.');
        } finally {
          setLoading(false);
        }
      },
      
      // Wallet actions
      setWalletAddress: (walletAddress) => set({ walletAddress }),
      setSavedWallets: (savedWallets) => set({ savedWallets }),
      setActiveWallet: (activeWallet) => set({ activeWallet }),
      addWallet: (wallet) => {
        const { savedWallets } = get();
        const updatedWallets = savedWallets.filter(w => w.address !== wallet.address);
        updatedWallets.push(wallet);
        set({ savedWallets: updatedWallets });
      },
      removeWallet: (address) => {
        const { savedWallets } = get();
        const updatedWallets = savedWallets.filter(w => w.address !== address);
        set({ savedWallets: updatedWallets });
      },
      setPasskeySupported: (passkeySupported) => set({ passkeySupported }),
      
      // RPC actions
      setRpcSettings: (settings) => set({ rpcSettings: settings }),
      setWalletConfig: (config) => set({ walletConfig: config }),
      
      // Token actions
      setTokens: (tokens) => set({ tokens }),
      loadTokens: async (params) => {
        const { selectedNetwork, walletAddress, setLoading, setError, clearError } = get();
        if (!selectedNetwork) return;

        try {
          setLoading(true, 'Loading tokens...');
          
          const tokenParams: TokenLoadParams = {
            chainId: selectedNetwork.chainId,
            search: params?.search,
            userAddress: params?.userAddress || walletAddress || undefined,
            ...params
          };

          const result = await tokenService.loadTokens(tokenParams);
          
          if (result.success && result.data) {
            set({ tokens: result.data });
            clearError();
          } else {
            set({ tokens: result.data || [] });
            if (result.error) {
              setError(true, result.error);
            }
          }
        } catch (error) {
          console.error('Store: Failed to load tokens:', error);
          setError(true, 'Failed to load tokens. Please try again.');
          set({ tokens: [] });
        } finally {
          setLoading(false);
        }
      },
      refreshSpecificTokens: async (tokenAddresses) => {
        const { selectedNetwork, walletAddress, tokens } = get();
        if (!selectedNetwork || !walletAddress || tokenAddresses.length === 0) return;

        try {
          const params: SpecificTokenParams = {
            chainId: selectedNetwork.chainId,
            userAddress: walletAddress,
            tokenAddresses
          };

          const result = await tokenService.loadSpecificTokens(params);
          
          if (result.success && result.data) {
            // Update specific tokens in the existing list
            const updatedTokens = tokenService.updateTokensInList(tokens, result.data);
            set({ tokens: updatedTokens });
          }
        } catch (error) {
          console.error('Store: Failed to refresh specific tokens:', error);
          // Fallback to full token reload
          const { loadTokens } = get();
          loadTokens();
        }
      },
      setDefaultTokens: () => {
        const { tokens, swapForm, setFromToken, setToToken } = get();
        if (tokens.length === 0) return;

        const { native, stablecoin } = tokenService.findDefaultTokens(tokens);

        if (native && !swapForm.fromToken) {
          setFromToken(native);
        }
        
        if (stablecoin && !swapForm.toToken && stablecoin !== native) {
          setToToken(stablecoin);
        }
      },
      
      // Swap actions
      setFromToken: (fromToken) => set(state => ({
        swapForm: { ...state.swapForm, fromToken },
        quote: null // Clear quote when changing tokens
      })),
      setToToken: (toToken) => set(state => ({
        swapForm: { ...state.swapForm, toToken },
        quote: null // Clear quote when changing tokens
      })),
      setFromAmount: (fromAmount) => set(state => ({
        swapForm: { ...state.swapForm, fromAmount }
      })),
      setSlippage: (slippage) => set(state => ({
        swapForm: { ...state.swapForm, slippage }
      })),
      swapTokens: () => {
        const { swapForm } = get();
        set({
          swapForm: {
            ...swapForm,
            fromToken: swapForm.toToken,
            toToken: swapForm.fromToken,
            fromAmount: '',
          },
          quote: null,
        });
      },
      setQuote: (quote) => set({ quote }),
      getSwapQuote: async () => {
        const { 
          swapForm, 
          selectedNetwork, 
          walletAddress, 
          setLoading, 
          setError, 
          clearError 
        } = get();

        // Validation
        if (!swapForm.fromToken || !swapForm.toToken || !swapForm.fromAmount) {
          setError(true, 'Please select tokens and enter amount');
          return;
        }

        if (!walletAddress) {
          console.log('⚠️ Store: No wallet address - skipping quote');
          return;
        }

        if (!selectedNetwork) {
          setError(true, 'No network selected');
          return;
        }

        try {
          setLoading(true, 'Getting best quote...');
          
          const quoteParams: QuoteParams = {
            fromToken: swapForm.fromToken,
            toToken: swapForm.toToken,
            fromAmount: swapForm.fromAmount,
            slippage: swapForm.slippage,
            chainId: selectedNetwork.chainId,
            userAddress: walletAddress
          };

          const result = await swapService.getQuote(quoteParams);
          
          if (result.success && result.data) {
            set({ quote: result.data });
            clearError();
          } else {
            set({ quote: null });
            if (result.error) {
              setError(true, result.error);
            }
          }
        } catch (error) {
          console.error('Store: Failed to get quote:', error);
          setError(true, 'Failed to get quote. Please try again.');
          set({ quote: null });
        } finally {
          setLoading(false);
        }
      },
      executeSwap: async (getWalletType) => {
        const { 
          quote, 
          swapForm, 
          walletAddress, 
          rpcSettings, 
          walletConfig, 
          refreshSpecificTokens,
          resetSwapForm,
          setLoading, 
          setError, 
          clearError 
        } = get();

        if (!quote || !swapForm.fromToken || !swapForm.toToken || !walletAddress) {
          setError(true, 'Missing required data for swap');
          return false;
        }

        try {
          setLoading(true, 'Preparing transaction...');
          
          const swapParams: SwapExecutionParams = {
            quote,
            fromToken: swapForm.fromToken,
            toToken: swapForm.toToken,
            fromAmount: swapForm.fromAmount,
            slippage: swapForm.slippage,
            userAddress: walletAddress,
            rpcSettings,
            walletConfig,
            getWalletType
          };

          const result = await swapService.executeSwap(swapParams);
          
          if (result.success && result.data) {
            // Refresh balances for swapped tokens
            const tokensToRefresh = [
              swapForm.fromToken.token.address,
              swapForm.toToken.token.address
            ];
            await refreshSpecificTokens(tokensToRefresh);
            
            // Reset form
            resetSwapForm();
            clearError();
            
            return result.data; // Transaction hash
          } else {
            if (result.error) {
              setError(true, result.error);
            }
            return false;
          }
        } catch (error) {
          console.error('Store: Failed to execute swap:', error);
          setError(true, 'Swap execution failed. Please try again.');
          return false;
        } finally {
          setLoading(false);
        }
      },
      
      // UI actions
      openWalletModal: (mode = 'connect') => set({
        walletModal: { isOpen: true, mode }
      }),
      closeWalletModal: () => set({
        walletModal: { isOpen: false, mode: 'connect' }
      }),
      setLoading: (isLoading, loadingMessage) => set({
        loading: { isLoading, loadingMessage }
      }),
      setError: (hasError, errorMessage) => set({
        error: { hasError, errorMessage }
      }),
      clearError: () => set({
        error: { hasError: false }
      }),
      
      // Reset actions
      resetSwapForm: () => set({
        swapForm: initialState.swapForm,
        quote: null,
      }),
      resetApp: () => set(initialState),
    }),
    { name: 'moonx-swap' }
  )
);

// Stable selector functions to prevent SSR infinite loops
const networkSelector = (state: AppStore) => ({
  networks: state.networks,
  selectedNetwork: state.selectedNetwork,
  rpcSettings: state.rpcSettings,
  walletConfig: state.walletConfig,
  setNetworks: state.setNetworks,
  setSelectedNetwork: state.setSelectedNetwork,
  setRpcSettings: state.setRpcSettings,
  setWalletConfig: state.setWalletConfig,
  loadNetworks: state.loadNetworks,
});

const walletSelector = (state: AppStore) => ({
  walletAddress: state.walletAddress,
  savedWallets: state.savedWallets,
  activeWallet: state.activeWallet,
  passkeySupported: state.passkeySupported,
  isConnected: !!state.walletAddress,
  setWalletAddress: state.setWalletAddress,
  setSavedWallets: state.setSavedWallets,
  setActiveWallet: state.setActiveWallet,
  addWallet: state.addWallet,
  removeWallet: state.removeWallet,
  setPasskeySupported: state.setPasskeySupported,
});

const swapSelector = (state: AppStore) => ({
  swapForm: state.swapForm,
  quote: state.quote,
  tokens: state.tokens,
  setFromToken: state.setFromToken,
  setToToken: state.setToToken,
  setFromAmount: state.setFromAmount,
  setSlippage: state.setSlippage,
  swapTokens: state.swapTokens,
  setQuote: state.setQuote,
  setTokens: state.setTokens,
  resetSwapForm: state.resetSwapForm,
  // New service-based actions
  loadTokens: state.loadTokens,
  refreshSpecificTokens: state.refreshSpecificTokens,
  setDefaultTokens: state.setDefaultTokens,
  getSwapQuote: state.getSwapQuote,
  executeSwap: state.executeSwap,
});

const uiSelector = (state: AppStore) => ({
  walletModal: state.walletModal,
  loading: state.loading,
  error: state.error,
  openWalletModal: state.openWalletModal,
  closeWalletModal: state.closeWalletModal,
  setLoading: state.setLoading,
  setError: state.setError,
  clearError: state.clearError,
});

// Settings selector for RPC and wallet configuration
const settingsSelector = (state: AppStore) => ({
  rpcSettings: state.rpcSettings,
  walletConfig: state.walletConfig,
  setRpcSettings: state.setRpcSettings,
  setWalletConfig: state.setWalletConfig,
});

// Selectors using useShallow to prevent infinite loops
export const useNetworkState = () => useAppStore(useShallow(networkSelector));
export const useWalletState = () => useAppStore(useShallow(walletSelector));
export const useSwapState = () => useAppStore(useShallow(swapSelector));
export const useUIState = () => useAppStore(useShallow(uiSelector));
export const useSettingsState = () => useAppStore(useShallow(settingsSelector));

// Alternative: Granular selectors for better performance (no useShallow needed)
// export const useWalletAddress = () => useAppStore(state => state.walletAddress);
// export const useIsConnected = () => useAppStore(state => !!state.walletAddress);
// export const useSavedWallets = () => useAppStore(state => state.savedWallets);
// export const useActiveWallet = () => useAppStore(state => state.activeWallet); 