// Modular Store Exports - Import only what you need

// Network Store
export {
  useNetworkStore,
  useNetworkState,
  useSelectedNetwork,
  useNetworks,
  useRpcSettings,
  useWalletConfig,
  type RPCSettings,
  type WalletConfig,
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
  useWalletActions,
  type EncryptedWallet,
} from './useWalletStore';

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