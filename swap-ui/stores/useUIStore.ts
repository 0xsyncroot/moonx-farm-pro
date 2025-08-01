import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// UI state interfaces
interface LoadingState {
  isLoading: boolean;
  loadingMessage?: string;
}

interface ErrorState {
  hasError: boolean;
  errorMessage?: string;
}

interface WalletModalState {
  isOpen: boolean;
  mode: 'connect' | 'manage';
}

interface SwapExecutionState {
  status: 'idle' | 'pending' | 'completed';
  lockedQuote: any | null; // Quote that was locked during swap execution
}

interface GasSettings {
  gasLimitBoost: number; // Additional boost % on top of 50% safety buffer (0 = 1.5x, 25 = 1.875x)
  priorityFeeTip: string; // User-specified additional tip for miners in gwei (will be added to base fee)
  useCustomGas: boolean; // Whether user wants custom gas settings
  gasSpeed: 'standard' | 'fast' | 'instant'; // Preset speeds
  baseFeePerGas: string; // Current network base fee (auto-fetched, read-only)
}

// UI state
interface UIState {
  loading: LoadingState;
  error: ErrorState;
  walletModal: WalletModalState;
  swapExecution: SwapExecutionState;
  gasSettings: GasSettings;
}

// UI actions
interface UIActions {
  // Loading actions
  setLoading: (loading: boolean, message?: string) => void;
  clearLoading: () => void;
  
  // Error actions
  setError: (error: boolean, message?: string) => void;
  clearError: () => void;
  
  // Wallet modal actions
  openWalletModal: (mode?: 'connect' | 'manage') => void;
  closeWalletModal: () => void;
  
  // Swap execution actions
  setSwapPending: (quote: any) => void;
  setSwapCompleted: () => void;
  resetSwapExecution: () => void;
  
  // Gas settings actions
  setGasLimitBoost: (boost: number) => void;
  setPriorityFeeTip: (tip: string) => void;
  setBaseFeePerGas: (baseFee: string) => void;
  setUseCustomGas: (useCustom: boolean) => void;
  setGasSpeed: (speed: 'standard' | 'fast' | 'instant') => void;
  resetGasSettings: () => void;
  
  // Reset all UI state
  resetUIState: () => void;
}

type UIStore = UIState & UIActions;

const initialState: UIState = {
  loading: {
    isLoading: false,
  },
  error: {
    hasError: false,
  },
  walletModal: {
    isOpen: false,
    mode: 'connect',
  },
  swapExecution: {
    status: 'idle',
    lockedQuote: null,
  },
  gasSettings: {
    gasLimitBoost: 0, // No extra boost (uses default 1.5x safety buffer)
    priorityFeeTip: '0.1', // Default 1 gwei tip for miners
    baseFeePerGas: '0', // Will be auto-fetched from network
    useCustomGas: false, // Use auto gas by default
    gasSpeed: 'standard', // Standard speed by default
  },
};

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      ...initialState,

      // Loading actions
      setLoading: (isLoading, loadingMessage) => set({
        loading: { isLoading, loadingMessage }
      }),
      clearLoading: () => set({
        loading: { isLoading: false }
      }),

      // Error actions
      setError: (hasError, errorMessage) => set({
        error: { hasError, errorMessage }
      }),
      clearError: () => set({
        error: { hasError: false }
      }),

      // Wallet modal actions
      openWalletModal: (mode = 'connect') => set({
        walletModal: { isOpen: true, mode }
      }),
      closeWalletModal: () => set({
        walletModal: { isOpen: false, mode: 'connect' }
      }),

      // Swap execution actions
      setSwapPending: (quote) => set({
        swapExecution: { status: 'pending', lockedQuote: quote }
      }),
      setSwapCompleted: () => set({
        swapExecution: { status: 'completed', lockedQuote: null }
      }),
      resetSwapExecution: () => set({
        swapExecution: { status: 'idle', lockedQuote: null }
      }),

      // Gas settings actions
      setGasLimitBoost: (gasLimitBoost) => set((state) => ({
        gasSettings: { ...state.gasSettings, gasLimitBoost }
      })),
      setPriorityFeeTip: (priorityFeeTip) => set((state) => ({
        gasSettings: { ...state.gasSettings, priorityFeeTip }
      })),
      setBaseFeePerGas: (baseFeePerGas) => set((state) => ({
        gasSettings: { ...state.gasSettings, baseFeePerGas }
      })),
      setUseCustomGas: (useCustomGas) => set((state) => ({
        gasSettings: { ...state.gasSettings, useCustomGas }
      })),
      setGasSpeed: (gasSpeed) => set((state) => ({
        gasSettings: { ...state.gasSettings, gasSpeed }
      })),
      resetGasSettings: () => set((state) => ({
        gasSettings: initialState.gasSettings
      })),

      // Reset all UI state
      resetUIState: () => set(initialState),
    }),
    { name: 'ui-store' }
  )
);

// Selectors
export const useUIState = () => useUIStore(useShallow((state) => ({
  loading: state.loading,
  error: state.error,
  walletModal: state.walletModal,
  swapExecution: state.swapExecution,
  gasSettings: state.gasSettings,
  setLoading: state.setLoading,
  clearLoading: state.clearLoading,
  setError: state.setError,
  clearError: state.clearError,
  openWalletModal: state.openWalletModal,
  closeWalletModal: state.closeWalletModal,
  setSwapPending: state.setSwapPending,
  setSwapCompleted: state.setSwapCompleted,
  resetSwapExecution: state.resetSwapExecution,
  setGasLimitBoost: state.setGasLimitBoost,
  setPriorityFeeTip: state.setPriorityFeeTip,
  setBaseFeePerGas: state.setBaseFeePerGas,
  setUseCustomGas: state.setUseCustomGas,
  setGasSpeed: state.setGasSpeed,
  resetGasSettings: state.resetGasSettings,
  resetUIState: state.resetUIState,
})));

// Granular selectors for better performance
export const useLoading = () => useUIStore(state => state.loading);
export const useError = () => useUIStore(state => state.error);
export const useWalletModal = () => useUIStore(state => state.walletModal);
export const useSwapExecution = () => useUIStore(state => state.swapExecution);

// Action selectors
export const useLoadingActions = () => useUIStore(useShallow((state) => ({
  setLoading: state.setLoading,
  clearLoading: state.clearLoading,
})));

export const useErrorActions = () => useUIStore(useShallow((state) => ({
  setError: state.setError,
  clearError: state.clearError,
})));

export const useSwapExecutionActions = () => useUIStore(useShallow((state) => ({
  setSwapPending: state.setSwapPending,
  setSwapCompleted: state.setSwapCompleted,
  resetSwapExecution: state.resetSwapExecution,
})));

export const useWalletModalActions = () => useUIStore(useShallow((state) => ({
  openWalletModal: state.openWalletModal,
  closeWalletModal: state.closeWalletModal,
})));