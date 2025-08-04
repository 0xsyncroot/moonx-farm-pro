// Modular Store Exports - Import only what you need

// Network Store
export {
  useNetworkStore,
  useNetworkState,
  useSelectedNetwork,
  useNetworks,
  useRpcSettings,
  type RPCSettings,
} from './useNetworkStore';

// Token Store
export {
  useTokenStore,
  useTokenState,
  useTokens,
  useTokenByAddress,
  useDefaultTokens,
} from './useTokenStore';

// Swap Store
export {
  useSwapStore,
  useSwapState,
  useSwapForm,
  useSwapQuote,
  useFromToken,
  useToToken,
  useFromAmount,
  useSlippage,
  useSwapActions,
  useQuoteActions,
} from './useSwapStore';

// Wallet Store
export {
  useWalletStore,
  useWalletState,
  useWalletAddress,
  useIsConnected,
  useSavedWallets,
  useActiveWallet,
  usePasskeySupported,
  useWalletConfig,
  useWalletActions,
  type EncryptedWallet,
  type WalletConfig,
} from './useWalletStore';

// Unified Wallet Hook (RECOMMENDED)
export { useUnifiedWalletState } from '../hooks/useUnifiedWalletState';

// UI Store
export {
  useUIStore,
  useUIState,
  useLoading,
  useError,
  useWalletModal,
  useLoadingActions,
  useErrorActions,
  useWalletModalActions,
} from './useUIStore';