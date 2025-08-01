import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { 
  swapService, 
  type SwapServiceResult,
  type QuoteParams,
  type SwapExecutionParams 
} from '@/services';
import type { TokenBalance, SwapQuote } from '@/types/api';

// Swap form state
interface SwapForm {
  fromToken: TokenBalance | null;
  toToken: TokenBalance | null;
  fromAmount: string;
  slippage: number;
}

// Swap state
interface SwapState {
  swapForm: SwapForm;
  quote: SwapQuote | null;
}

// Swap actions
interface SwapActions {
  // Form actions
  setFromToken: (token: TokenBalance | null) => void;
  setToToken: (token: TokenBalance | null) => void;
  setFromAmount: (amount: string) => void;
  setSlippage: (slippage: number) => void;
  swapTokens: () => void;
  
  // Quote actions
  setQuote: (quote: SwapQuote | null) => void;
  getSwapQuote: (params: QuoteParams) => Promise<void>;
  
  // Swap execution
  executeSwap: (params: SwapExecutionParams) => Promise<string | false>;
  
  // Reset actions
  resetSwapForm: () => void;
  resetSwapState: () => void;
}

type SwapStore = SwapState & SwapActions;

const initialSwapForm: SwapForm = {
  fromToken: null,
  toToken: null,
  fromAmount: '',
  slippage: 0.5,
};

const initialState: SwapState = {
  swapForm: initialSwapForm,
  quote: null,
};

export const useSwapStore = create<SwapStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Form actions
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

      // Quote actions
      setQuote: (quote) => set({ quote }),

      getSwapQuote: async (params: QuoteParams) => {
        try {
          const result: SwapServiceResult<SwapQuote> = await swapService.getQuote(params);
          
          if (result.success && result.data) {
            set({ quote: result.data });
          } else {
            set({ quote: null });
          }
        } catch (error) {
          set({ quote: null });
        }
      },

      // Swap execution
      executeSwap: async (params: SwapExecutionParams) => {
        try {
          const result: SwapServiceResult<string> = await swapService.executeSwap(params);
          
          if (result.success && result.data) {
            return result.data; // Transaction hash
          } else {
            return false;
          }
        } catch (error) {
          return false;
        }
      },

      // Reset actions
      resetSwapForm: () => set({
        swapForm: initialSwapForm,
        quote: null,
      }),

      resetSwapState: () => set(initialState),
    }),
    { name: 'swap-store' }
  )
);

// Selectors
export const useSwapState = () => useSwapStore(useShallow((state) => ({
  swapForm: state.swapForm,
  quote: state.quote,
  setFromToken: state.setFromToken,
  setToToken: state.setToToken,
  setFromAmount: state.setFromAmount,
  setSlippage: state.setSlippage,
  swapTokens: state.swapTokens,
  setQuote: state.setQuote,
  getSwapQuote: state.getSwapQuote,
  executeSwap: state.executeSwap,
  resetSwapForm: state.resetSwapForm,
  resetSwapState: state.resetSwapState,
})));

// Granular selectors
export const useSwapForm = () => useSwapStore(state => state.swapForm);
export const useSwapQuote = () => useSwapStore(state => state.quote);
export const useFromToken = () => useSwapStore(state => state.swapForm.fromToken);
export const useToToken = () => useSwapStore(state => state.swapForm.toToken);
export const useFromAmount = () => useSwapStore(state => state.swapForm.fromAmount);
export const useSlippage = () => useSwapStore(state => state.swapForm.slippage);

// Action selectors
export const useSwapActions = () => useSwapStore(useShallow((state) => ({
  setFromToken: state.setFromToken,
  setToToken: state.setToToken,
  setFromAmount: state.setFromAmount,
  setSlippage: state.setSlippage,
  swapTokens: state.swapTokens,
  resetSwapForm: state.resetSwapForm,
})));

export const useQuoteActions = () => useSwapStore(useShallow((state) => ({
  setQuote: state.setQuote,
  getSwapQuote: state.getSwapQuote,
  executeSwap: state.executeSwap,
})));