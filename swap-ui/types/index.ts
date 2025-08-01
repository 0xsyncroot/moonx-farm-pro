import { EncryptedWallet } from '@/lib/crypto';
import type { Network, TokenBalance, SwapQuote } from '@/types/api';

// Re-export API types
export type {
  Network,
  Token,
  TokenBalance,
  SwapQuote
} from '@/types/api';

// Re-export crypto types
export type {
  EncryptedWallet,
  WalletSession
} from '@/lib/crypto';

// RPC and wallet configuration types  
export interface RPCSettings {
  baseRpcUrl: string;
  customRpcUrl?: string;
  useCustomRpc: boolean;
}

export interface WalletConfig {
  walletType: 'privy' | 'private';
  privateKey?: string;
}

// UI specific types
export interface SwapFormData {
  fromToken: TokenBalance | null;
  toToken: TokenBalance | null;
  fromAmount: string;
  slippage: number;
}

export interface WalletModalState {
  isOpen: boolean;
  mode: 'connect' | 'manage';
}

export interface LoadingState {
  isLoading: boolean;
  loadingMessage?: string;
}

export interface ErrorState {
  hasError: boolean;
  errorMessage?: string;
}

// App State
export interface AppState {
  // Network state
  selectedNetwork: Network | null;
  networks: Network[];
  
  // Wallet state
  walletAddress: string | null;
  savedWallets: EncryptedWallet[];
  activeWallet: EncryptedWallet | null;
  passkeySupported: boolean;
  
  // RPC and wallet configuration
  rpcSettings: RPCSettings;
  walletConfig: WalletConfig;
  
  // Token state
  tokens: TokenBalance[];
  
  // Swap state
  swapForm: SwapFormData;
  quote: SwapQuote | null;
  
  // UI state
  walletModal: WalletModalState;
  loading: LoadingState;
  error: ErrorState;
}

// Component Props
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  type?: 'text' | 'number' | 'password';
  className?: string;
} 