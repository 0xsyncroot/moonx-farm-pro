/**
 * Specific error types and codes for swap operations
 * Used to provide clear error handling without guessing error messages
 */

export enum SwapErrorCode {
  // Authentication/Session errors
  WALLET_SESSION_EXPIRED = 'WALLET_SESSION_EXPIRED',
  WALLET_LOCKED = 'WALLET_LOCKED', 
  PRIVATE_KEY_DECRYPT_FAILED = 'PRIVATE_KEY_DECRYPT_FAILED',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  DEVICE_FINGERPRINT_MISMATCH = 'DEVICE_FINGERPRINT_MISMATCH',
  
  // Wallet connection errors
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_CONNECTION_LOST = 'WALLET_CONNECTION_LOST',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  WALLET_ADDRESS_MISMATCH = 'WALLET_ADDRESS_MISMATCH',
  
  // Network/RPC errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_CONNECTION_FAILED = 'RPC_CONNECTION_FAILED',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  
  // Transaction errors
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  NONCE_TOO_LOW = 'NONCE_TOO_LOW',
  
  // Quote/Route errors
  NO_ROUTE_FOUND = 'NO_ROUTE_FOUND',
  QUOTE_EXPIRED = 'QUOTE_EXPIRED',
  SLIPPAGE_TOO_HIGH = 'SLIPPAGE_TOO_HIGH',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

export interface SwapError extends Error {
  code: SwapErrorCode;
  originalError?: Error;
  userMessage?: string;
  action?: 'unlock' | 'connect' | 'retry' | 'refresh';
}

export class CustomSwapError extends Error implements SwapError {
  public code: SwapErrorCode;
  public originalError?: Error;
  public userMessage?: string;
  public action?: 'unlock' | 'connect' | 'retry' | 'refresh';

  constructor(
    message: string,
    code: SwapErrorCode,
    userMessage?: string,
    action?: 'unlock' | 'connect' | 'retry' | 'refresh',
    originalError?: Error
  ) {
    super(message);
    this.name = 'SwapError';
    this.code = code;
    this.userMessage = userMessage;
    this.action = action;
    this.originalError = originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomSwapError);
    }
  }
}

export class SwapErrorFactory {
  static createSessionExpiredError(originalError?: Error): SwapError {
    return new CustomSwapError(
      'Wallet session has expired',
      SwapErrorCode.WALLET_SESSION_EXPIRED,
      'Your wallet session has expired. Please unlock your wallet to continue.',
      'unlock',
      originalError
    );
  }
  
  static createWalletLockedError(originalError?: Error): SwapError {
    const error = new Error('Wallet is locked') as SwapError;
    error.code = SwapErrorCode.WALLET_LOCKED;
    error.originalError = originalError;
    error.userMessage = 'Your wallet is locked. Please unlock your wallet to continue.';
    error.action = 'unlock';
    return error;
  }
  
  static createPrivateKeyDecryptError(originalError?: Error): SwapError {
    return new CustomSwapError(
      'Failed to decrypt private key',
      SwapErrorCode.PRIVATE_KEY_DECRYPT_FAILED,
      'Failed to access your wallet. Please unlock your wallet to continue.',
      'unlock',
      originalError
    );
  }
  
  static createAuthenticationRequiredError(originalError?: Error): SwapError {
    const error = new CustomSwapError(
      'Authentication required',
      SwapErrorCode.AUTHENTICATION_REQUIRED,
      'Authentication required to access your wallet.',
      'unlock',
      originalError
    );
    console.log('🔧 Created SwapError:', { code: error.code, action: error.action, message: error.message });
    return error;
  }
  
  static createDeviceFingerprintMismatchError(originalError?: Error): SwapError {
    const error = new Error('Device fingerprint mismatch') as SwapError;
    error.code = SwapErrorCode.DEVICE_FINGERPRINT_MISMATCH;
    error.originalError = originalError;
    error.userMessage = 'Device security check failed. Please re-authenticate your wallet.';
    error.action = 'unlock';
    return error;
  }
  
  static createWalletConnectionLostError(originalError?: Error): SwapError {
    return new CustomSwapError(
      'Wallet connection lost',
      SwapErrorCode.WALLET_CONNECTION_LOST,
      'Your wallet connection was lost. Please reconnect your wallet.',
      'connect',
      originalError
    );
  }
  
  static createWalletNotFoundError(originalError?: Error): SwapError {
    return new CustomSwapError(
      'Wallet not found',
      SwapErrorCode.WALLET_NOT_FOUND,
      'No wallet found. Please connect your wallet.',
      'connect',
      originalError
    );
  }
  
  static createNetworkError(originalError?: Error): SwapError {
    const error = new Error('Network error') as SwapError;
    error.code = SwapErrorCode.NETWORK_ERROR;
    error.originalError = originalError;
    error.userMessage = 'Unable to connect to the network. Please check your connection and try again.';
    error.action = 'retry';
    return error;
  }
  
  static createTransactionRejectedError(originalError?: Error): SwapError {
    const error = new Error('Transaction rejected by user') as SwapError;
    error.code = SwapErrorCode.TRANSACTION_REJECTED;
    error.originalError = originalError;
    error.userMessage = 'Transaction was rejected. Please try again.';
    error.action = 'retry';
    return error;
  }
  
  static createInsufficientFundsError(originalError?: Error): SwapError {
    const error = new Error('Insufficient funds') as SwapError;
    error.code = SwapErrorCode.INSUFFICIENT_FUNDS;
    error.originalError = originalError;
    error.userMessage = 'Insufficient funds for this transaction.';
    error.action = 'refresh';
    return error;
  }
  
  static createUnknownError(originalError?: Error, message?: string): SwapError {
    const error = new Error(message || 'Unknown error occurred') as SwapError;
    error.code = SwapErrorCode.UNKNOWN_ERROR;
    error.originalError = originalError;
    error.userMessage = message || 'An unexpected error occurred. Please try again.';
    error.action = 'retry';
    return error;
  }
}

/**
 * Helper function to map existing error messages to specific error types
 * This is temporary until all services are updated to throw SwapError directly
 */
export function mapErrorToSwapError(error: Error): SwapError {
  const message = error.message.toLowerCase();
  
  // Session/Authentication errors
  if (message.includes('session') && (message.includes('expired') || message.includes('invalid'))) {
    return SwapErrorFactory.createSessionExpiredError(error);
  }
  
  if (message.includes('authentication required') || message.includes('please unlock wallet')) {
    return SwapErrorFactory.createAuthenticationRequiredError(error);
  }
  
  if (message.includes('failed to decrypt private key')) {
    return SwapErrorFactory.createPrivateKeyDecryptError(error);
  }
  
  if (message.includes('device fingerprint mismatch')) {
    return SwapErrorFactory.createDeviceFingerprintMismatchError(error);
  }
  
  if (message.includes('data integrity check failed')) {
    return SwapErrorFactory.createPrivateKeyDecryptError(error);
  }
  
  // Connection errors
  if (message.includes('no active wallet') || message.includes('wallet not found')) {
    return SwapErrorFactory.createWalletNotFoundError(error);
  }
  
  if (message.includes('wallet connection') && message.includes('lost')) {
    return SwapErrorFactory.createWalletConnectionLostError(error);
  }
  
  // Network errors
  if (message.includes('network') || message.includes('timeout') || message.includes('connection') || message.includes('fetch failed')) {
    return SwapErrorFactory.createNetworkError(error);
  }
  
  // Transaction errors
  if (message.includes('user rejected')) {
    return SwapErrorFactory.createTransactionRejectedError(error);
  }
  
  if (message.includes('insufficient funds')) {
    return SwapErrorFactory.createInsufficientFundsError(error);
  }
  
  // Default to unknown error
  return SwapErrorFactory.createUnknownError(error, error.message);
}
