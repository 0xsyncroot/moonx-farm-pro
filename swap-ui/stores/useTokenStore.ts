import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { 
  tokenService, 
  type TokenServiceResult,
  type TokenLoadParams,
  type SpecificTokenParams 
} from '@/services';
import type { TokenBalance } from '@/types/api';

// Token state
interface TokenState {
  tokens: TokenBalance[];
}

// Token actions
interface TokenActions {
  setTokens: (tokens: TokenBalance[]) => void;
  loadTokens: (params: TokenLoadParams) => Promise<void>;
  refreshSpecificTokens: (params: SpecificTokenParams) => Promise<void>;
  setDefaultTokens: () => void;
  clearTokens: () => void;
  resetTokenState: () => void;
}

type TokenStore = TokenState & TokenActions;

const initialState: TokenState = {
  tokens: [],
};

export const useTokenStore = create<TokenStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Basic setters
      setTokens: (tokens) => set({ tokens }),
      clearTokens: () => set({ tokens: [] }),

      // Load tokens using TokenService
      loadTokens: async (params: TokenLoadParams) => {
        try {
          const result: TokenServiceResult<TokenBalance[]> = await tokenService.loadTokens(params);
          
          if (result.success && result.data) {
            set({ tokens: result.data });
          } else {
            set({ tokens: result.data || [] });
          }
        } catch (error) {
          set({ tokens: [] });
        }
      },

      // Refresh specific tokens (for post-swap balance update)
      refreshSpecificTokens: async (params: SpecificTokenParams) => {
        try {
          if (params.tokenAddresses.length === 0) return;

          const result: TokenServiceResult<TokenBalance[]> = await tokenService.loadSpecificTokens(params);
          
          if (result.success && result.data) {
            // Update specific tokens in the existing list
            const { tokens } = get();
            const updatedTokens = tokenService.updateTokensInList(tokens, result.data);
            set({ tokens: updatedTokens });
          }
        } catch (error) {
          // Fallback: could reload all tokens, but for now just log error
        }
      },

      // Set default tokens using TokenService
      setDefaultTokens: () => {
        const { tokens } = get();
        if (tokens.length === 0) return;

        const { native, stablecoin } = tokenService.findDefaultTokens(tokens);

        // Store just returns the found tokens - UI will use them
        // This is pure state management, business logic is in TokenService
      },

      // Reset state
      resetTokenState: () => set(initialState),
    }),
    { name: 'token-store' }
  )
);

// Selectors
export const useTokenState = () => useTokenStore(useShallow((state) => ({
  tokens: state.tokens,
  setTokens: state.setTokens,
  loadTokens: state.loadTokens,
  refreshSpecificTokens: state.refreshSpecificTokens,
  setDefaultTokens: state.setDefaultTokens,
  clearTokens: state.clearTokens,
  resetTokenState: state.resetTokenState,
})));

export const useTokens = () => useTokenStore(state => state.tokens);

// Helper selectors
export const useTokenByAddress = (address: string) => 
  useTokenStore(state => 
    tokenService.getLatestTokenData(address, state.tokens)
  );

export const useDefaultTokens = () => 
  useTokenStore(state => 
    tokenService.findDefaultTokens(state.tokens)
  );