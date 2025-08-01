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

interface SwapSettings {
  slippage: number; // Slippage tolerance in percentage (0.1 = 0.1%)
  transactionDeadline: number; // Transaction deadline in minutes
  expertMode: boolean; // Allow high price impact trades
}

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  skipped: boolean;
  required: boolean; // If true, tutorial ends if this step is skipped
}

interface TutorialState {
  isActive: boolean;
  currentStepIndex: number;
  steps: TutorialStep[];
  isFirstTime: boolean; // Track if this is first time user
}

// UI state
interface UIState {
  loading: LoadingState;
  error: ErrorState;
  walletModal: WalletModalState;
  swapExecution: SwapExecutionState;
  gasSettings: GasSettings;
  swapSettings: SwapSettings;
  tutorial: TutorialState;
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
  
  // Swap settings actions
  setSlippage: (slippage: number) => void;
  setTransactionDeadline: (deadline: number) => void;
  setExpertMode: (expertMode: boolean) => void;
  resetSwapSettings: () => void;

  // Tutorial actions
  startTutorial: () => void;
  nextTutorialStep: () => void;
  skipTutorialStep: () => void;
  completeTutorialStep: (stepId: string) => void;
  endTutorial: () => void;
  setFirstTimeUser: (isFirstTime: boolean) => void;
  setTutorialStepIndex: (index: number) => void;
  
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
  swapSettings: {
    slippage: 0.5, // Default 0.5% slippage
    transactionDeadline: 20, // Default 20 minutes
    expertMode: false, // Expert mode off by default
  },
  tutorial: {
    isActive: false,
    currentStepIndex: 0,
    isFirstTime: true,
    steps: [
      {
        id: 'connect-wallet',
        title: 'Connect Wallet',
        description: 'Connect your wallet using private key mode for secure access to DeFi features.',
        completed: false,
        skipped: false,
        required: true,
      },
      {
        id: 'add-funds',
        title: 'Add Funds',
        description: 'Learn how to deposit tokens to your wallet for trading.',
        completed: false,
        skipped: false,
        required: false,
      },
      {
        id: 'first-swap',
        title: 'Make Your First Swap',
        description: 'Experience seamless token swapping with best rates.',
        completed: false,
        skipped: false,
        required: false,
      },
    ],
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

      // Swap settings actions
      setSlippage: (slippage) => set((state) => ({
        swapSettings: { ...state.swapSettings, slippage }
      })),
      setTransactionDeadline: (transactionDeadline) => set((state) => ({
        swapSettings: { ...state.swapSettings, transactionDeadline }
      })),
      setExpertMode: (expertMode) => set((state) => ({
        swapSettings: { ...state.swapSettings, expertMode }
      })),
      resetSwapSettings: () => set((state) => ({
        swapSettings: initialState.swapSettings
      })),

      // Tutorial actions
      startTutorial: () => set((state) => ({
        tutorial: {
          ...state.tutorial,
          isActive: true,
          currentStepIndex: 0,
          steps: state.tutorial.steps.map(step => ({
            ...step,
            completed: false,
            skipped: false,
          })),
        }
      })),
      
      nextTutorialStep: () => set((state) => {
        const nextIndex = state.tutorial.currentStepIndex + 1;
        const isComplete = nextIndex >= state.tutorial.steps.length;
        
        return {
          tutorial: {
            ...state.tutorial,
            currentStepIndex: isComplete ? state.tutorial.steps.length - 1 : nextIndex,
            isActive: !isComplete,
          }
        };
      }),
      
      skipTutorialStep: () => set((state) => {
        const currentStep = state.tutorial.steps[state.tutorial.currentStepIndex];
        if (!currentStep) return state;
        
        // If current step is required and being skipped, end tutorial
        if (currentStep.required) {
          return {
            tutorial: {
              ...state.tutorial,
              isActive: false,
            }
          };
        }
        
        // Mark step as skipped and move to next
        const updatedSteps = state.tutorial.steps.map((step, index) => 
          index === state.tutorial.currentStepIndex 
            ? { ...step, skipped: true }
            : step
        );
        
        const nextIndex = state.tutorial.currentStepIndex + 1;
        const isComplete = nextIndex >= state.tutorial.steps.length;
        
        return {
          tutorial: {
            ...state.tutorial,
            steps: updatedSteps,
            currentStepIndex: isComplete ? state.tutorial.steps.length - 1 : nextIndex,
            isActive: !isComplete,
          }
        };
      }),
      
      completeTutorialStep: (stepId) => set((state) => {
        const updatedSteps = state.tutorial.steps.map(step => 
          step.id === stepId 
            ? { ...step, completed: true }
            : step
        );
        
        return {
          tutorial: {
            ...state.tutorial,
            steps: updatedSteps,
          }
        };
      }),
      
      endTutorial: () => set((state) => ({
        tutorial: {
          ...state.tutorial,
          isActive: false,
          isFirstTime: false,
        }
      })),
      
      setFirstTimeUser: (isFirstTime) => set((state) => ({
        tutorial: {
          ...state.tutorial,
          isFirstTime,
        }
      })),

      setTutorialStepIndex: (index) => set((state) => ({
        tutorial: {
          ...state.tutorial,
          currentStepIndex: Math.max(0, Math.min(index, state.tutorial.steps.length - 1)),
        }
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
  swapSettings: state.swapSettings,
  tutorial: state.tutorial,
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
  setSlippage: state.setSlippage,
  setTransactionDeadline: state.setTransactionDeadline,
  setExpertMode: state.setExpertMode,
  resetSwapSettings: state.resetSwapSettings,
  startTutorial: state.startTutorial,
  nextTutorialStep: state.nextTutorialStep,
  skipTutorialStep: state.skipTutorialStep,
  completeTutorialStep: state.completeTutorialStep,
  endTutorial: state.endTutorial,
  setFirstTimeUser: state.setFirstTimeUser,
  resetUIState: state.resetUIState,
})));

// Granular selectors for better performance
export const useLoading = () => useUIStore(state => state.loading);
export const useError = () => useUIStore(state => state.error);
export const useWalletModal = () => useUIStore(state => state.walletModal);
export const useSwapExecution = () => useUIStore(state => state.swapExecution);
export const useTutorial = () => useUIStore(state => state.tutorial);

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

export const useTutorialActions = () => useUIStore(useShallow((state) => ({
  startTutorial: state.startTutorial,
  nextTutorialStep: state.nextTutorialStep,
  skipTutorialStep: state.skipTutorialStep,
  completeTutorialStep: state.completeTutorialStep,
  endTutorial: state.endTutorial,
  setFirstTimeUser: state.setFirstTimeUser,
  setTutorialStepIndex: state.setTutorialStepIndex,
})));