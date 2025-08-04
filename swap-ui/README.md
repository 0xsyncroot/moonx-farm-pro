# MoonX Swap UI

Modern, secure swap interface for EVM networks with clean architecture and dual wallet support.

## Features

### 🏗️ **Clean Architecture**
- **Layered Design**: UI → Hook → Store → Service → HTTP Client → API
- **Separation of Concerns**: Clear boundaries between presentation, business logic, and data access
- **Modular Store Architecture**: Domain-specific Zustand stores for better maintainability
- **Services Layer**: Independent business logic with proper error handling and caching
- **Toast Notifications**: User-friendly feedback system for all operations

### 🔐 **Dual Wallet Options**
- **Privy Wallet**: Social login (email, Google) with built-in security
- **Private Key**: Advanced encryption with Passkey/Device protection

### 🛡️ **Enterprise-Grade Security**
- **Session-Based Private Key Management**: Private keys never stored raw in memory
- **Auto-Lock Mechanisms**: Configurable session timeouts and browser event detection
- **Passkey Authentication**: Biometric authentication with secure fallback encryption
- **Secure Transaction Signing**: Protected signing without private key exposure
- **Real-time Session Monitoring**: Live session status with manual lock controls

### 🎨 **Modern UI**
- MoonX orange theme (#ff4d00)
- Clean component architecture
- Responsive design
- Loading states & error handling
- Toast notification system

### 💰 **Advanced Token Handling**
- React-number-format for proper display
- TokenInput with decimal precision
- TokenAmountDisplay with smart formatting
- Reusable TokenSelectorControl
- Intelligent caching and balance updates

## Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Environment Configuration

Create `.env.local` file:

```bash
# Privy Configuration (Required for Privy wallet)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here

# API Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Network Configuration
NEXT_PUBLIC_DEFAULT_CHAIN_ID=8453
NEXT_PUBLIC_SUPPORTED_CHAINS=8453,1,137,42161,56

# App Configuration
NEXT_PUBLIC_APP_NAME=MoonX Swap
NEXT_PUBLIC_APP_URL=https://pro.moonx.farm
```

### 3. Privy Setup (Optional)

To enable Privy wallet connection:

1. Sign up at [Privy Dashboard](https://dashboard.privy.io)
2. Create a new app
3. Copy your App ID
4. Add it to `.env.local` as `NEXT_PUBLIC_PRIVY_APP_ID`

**Without Privy**: Users can still connect via private key with advanced encryption.

### 4. Run Development

```bash
pnpm dev
```

## Wallet Connection

### Option 1: Privy Wallet
- Social login (email/Google)
- Built-in wallet creation
- Cross-device synchronization
- Enterprise-grade security

### Option 2: Private Key
- Manual private key input
- Passkey authentication (biometric)
- Device-bound encryption
- Generate new wallets

## Security Features

### 🔒 **Session-Based Security**
- Private keys encrypted with session-specific keys
- Configurable session timeouts (15min - 24h)
- Auto-lock on browser close/tab hidden
- Activity-based session extension

### 🛡️ **Multi-Layer Protection**
```typescript
// Private keys are NEVER stored raw
✅ Encrypted with session keys (AES-256)
✅ Session keys stored in memory only
✅ Auto-cleanup on browser events
✅ Passkey authentication for decryption
```

### 🔐 **Passkey Integration**
- Biometric authentication (fingerprint/face)
- Hardware security key support
- Graceful fallback to device encryption
- Multi-entropy PBKDF2 (100k iterations)

### 🚨 **Auto-Lock Triggers**
- Browser tab close (`beforeunload`)
- Tab visibility change (`visibilitychange`)
- Mobile page hide (`pagehide`)
- Configurable inactivity timeout
- Manual lock controls

## ⚙️ Configuration

### Session Security Settings

Access via Settings Modal → Session Security:

**Session Timeout Options:**
- 15 minutes - 24 hours (default: 8 hours)
- Configurable session duration before re-authentication required

**Inactivity Auto-Lock:**
- Off (default), 5min, 15min, 30min
- Auto-lock after period of no user activity

**Auto-Lock Triggers:**
- ✅ Lock on browser close (enabled by default)
- ❌ Lock on tab switch (disabled by default)
- Customizable based on security needs

### Usage Examples

#### 🔄 **Clean Architecture Usage**

```typescript
// ✅ CORRECT: UI components use hooks
const SwapContainer = () => {
  const { 
    swapForm, 
    quote, 
    executeSwapTransaction,
    getSwapQuote 
  } = useSwap(); // Hook handles all logic
  
  const toast = useToast();
  
  const handleSwap = async () => {
    try {
      const result = await executeSwapTransaction();
      if (result) {
        toast.success('Swap Completed!', 'Transaction successful');
      }
    } catch (error) {
      toast.error('Swap Failed', error.message);
    }
  };
};

// ✅ CORRECT: Hooks orchestrate stores
const useSwap = () => {
  const { executeSwap } = useSwapState();
  const { loadTokens } = useTokenState();
  const { selectedNetwork } = useNetworkState();
  
  const executeSwapTransaction = async () => {
    // Hook coordinates between stores
    const result = await executeSwap(params);
    if (result) {
      await loadTokens({ chainId: selectedNetwork.chainId }); // Refresh balances
    }
    return result;
  };
};

// ✅ CORRECT: Stores use services
const useSwapStore = create((set, get) => ({
  executeSwap: async (params) => {
    const result = await swapService.executeSwap(params); // Service handles business logic
    return result;
  }
}));

// ✅ CORRECT: Services use HTTP client
export class SwapService {
  async executeSwap(params) {
    const quote = await apiClient.post('/api/swap/quote', params); // Pure HTTP
    return quote;
  }
}
```

#### 🏪 **Store Usage Patterns**

```typescript
// ✅ Domain-specific store imports
import { 
  useNetworkState,
  useTokenState, 
  useSwapState,
  useUIState,
  useWalletState 
} from '@/stores';

const MyComponent = () => {
  // Network management
  const { networks, selectedNetwork, loadNetworks } = useNetworkState();
  
  // Token management  
  const { tokens, loadTokens, refreshSpecificTokens } = useTokenState();
  
  // Swap operations
  const { quote, swapForm, getSwapQuote, executeSwap } = useSwapState();
  
  // UI state
  const { loading, error, setError, clearError } = useUIState();
  
  // Wallet state
  const { walletAddress, isConnected } = useWalletState();
};
```

#### 🛡️ **Session Management**

```typescript
// Session management
const { 
  hasActiveSession,       // Check if session is active
  extendSession,          // Extend session timeout
  lockWallet,             // Manual lock
  getSessionConfig,       // Get current config
  updateSessionConfig,    // Update settings
} = useWallet();

// Configure session settings
updateSessionConfig({
  sessionTimeout: 240,      // 4 hours
  activityTimeout: 15,      // 15 min inactivity lock
  lockOnBrowserClose: true, // Lock on browser close
  lockOnTabHidden: false,   // Don't lock on tab switch
});

// Secure transaction signing
import { signTransaction } from '@/libs/secure-signer';
const signedTx = await signTransaction(txRequest);
```

#### 🎯 **Best Practices**

```typescript
// ❌ AVOID: Direct service calls in components
const BadComponent = () => {
  const handleClick = async () => {
    const result = await swapService.executeSwap(params); // Wrong!
  };
};

// ✅ PREFER: Use hooks that manage stores
const GoodComponent = () => {
  const { executeSwapTransaction } = useSwap(); // Correct!
  
  const handleClick = async () => {
    const result = await executeSwapTransaction();
  };
};

// ❌ AVOID: Multiple store imports for simple operations
const BadComponent = () => {
  const swapState = useSwapState();
  const uiState = useUIState();
  const walletState = useWalletState();
  // Too many direct store dependencies
};

// ✅ PREFER: Domain-specific hooks
const GoodComponent = () => {
  const { executeSwap, loading, error } = useSwap(); // Clean interface
};
```

## Core Architecture & Flows

### 🔄 **Dual Wallet System**

The dapp supports two distinct wallet types with different connection flows:

#### **1. Privy Wallets (External)**
- **Types**: MetaMask, Rabby, OKX, WalletConnect, Coinbase, etc.
- **Authentication**: Via Privy social login (email, Google, Discord)
- **Connection**: Privy manages wallet detection and connection
- **Signing**: Direct browser wallet signing
- **Auto-Connect**: Privy handles session restoration

```typescript
// Privy Wallet Flow
const { authenticated, user, connectWallet } = usePrivy();
const { wallets } = useWallets();

// Auto-connect on page load
if (authenticated && wallets.length > 0) {
  // Wallet automatically available through Privy
}

// Manual connection
await connectWallet(); // Opens Privy modal
```

#### **2. Private Key Wallets (Internal)**
- **Types**: Raw private key, Generated wallet, Imported wallet
- **Authentication**: Passkey (biometric) or device encryption
- **Connection**: Manual private key input or generation
- **Signing**: Internal ethers.js signer with encrypted key
- **Auto-Connect**: Session-based restoration with security verification

```typescript
// Private Key Wallet Flow
import { sessionManager, secureSigner } from '@/libs';

// Manual connection
await sessionManager.createSession(privateKey, { timeout: 480 }); // 8 hours

// Auto-connect on page load
if (secureSigner.hasActiveSession()) {
  const signer = await secureSigner.createProviderWallet(provider);
  // Ready to use
}
```

### 🎯 **Unified Wallet State Management**

Both wallet types are managed through a unified state system:

```typescript
// Single source of truth for wallet state
const {
  walletAddress,        // Current wallet address (from Zustand store)
  isConnected,          // Connection status (from Zustand store)
  currentWalletType,    // 'privy' | 'private' | null (computed)
  createWalletConfig    // Creates config for transactions
} = useUnifiedWalletState();

// Wallet type detection
const getWalletType = (): 'privy' | 'private' | null => {
  if (authenticated && user) return 'privy';           // Privy active
  if (secureSigner.hasActiveSession()) return 'private'; // Session active
  return null;                                         // Not connected
};
```

### ⛽ **Gas Estimation Strategy**

Smart 3-tier gas estimation system that works for both wallet types:

```typescript
// GasService.prepareTransactionParams()
let finalGasLimit: bigint;

if (estimatedGas) {
  // 1. Use provided estimate (highest priority)
  finalGasLimit = BigInt(estimatedGas);
} else if (populatedTx.gasLimit) {
  // 2. Use populated gas limit (works for private key wallets)
  finalGasLimit = BigInt(populatedTx.gasLimit.toString());
} else {
  // 3. Auto-estimate gas (fallback for EOA wallets)
  console.log('⛽ Auto-estimating gas as populateTransaction returned undefined gasLimit');
  const estimatedGasLimit = await provider.estimateGas({
    ...baseTxRequest,
    from: await signer.getAddress()
  });
  finalGasLimit = BigInt(estimatedGasLimit.toString());
}

// Apply safety buffer + user boost
const safetyMultiplier = 1.5; // 50% buffer
const userBoostMultiplier = 1 + (gasSettings.gasLimitBoost / 100);
finalGasLimit = BigInt(Math.floor(Number(finalGasLimit) * safetyMultiplier * userBoostMultiplier));
```

**Why 3-tier system needed:**
- **Private Key Wallets**: `populateTransaction()` returns valid `gasLimit`
- **EOA/Privy Wallets**: `populateTransaction()` may return `undefined gasLimit`
- **Fallback**: Auto-estimation ensures all wallet types work

### 🚀 **Auto-Connect Flow**

Automatic wallet reconnection on page load:

```typescript
// useAppInitialization.ts
const useAppInitialization = () => {
  useEffect(() => {
    const initializeApp = async () => {
      // 1. Load networks first
      await loadNetworks();
      
      // 2. Attempt auto-connect for private key wallets
      const autoConnectResult = await attemptAutoConnect();
      
      // 3. Privy auto-connect handled automatically by Privy provider
      setInitialized(true);
    };
    
    initializeApp();
  }, []);
};

// Private key auto-connect
const attemptAutoConnect = async () => {
  if (secureSigner.hasActiveSession()) {
    const activeWalletData = secureSigner.getActiveWallet();
    if (activeWalletData?.address) {
      // Restore wallet state
      store.setWalletAddress(activeWalletData.address);
      return { success: true, walletType: 'private' };
    }
  }
  return { success: false };
};
```

### 🔧 **Transaction Execution Flow**

Unified transaction flow for both wallet types:

```typescript
// SwapService.executeSwap()
const executeSwap = async (params) => {
  // 1. Create wallet provider with full config
  const provider = createWalletProvider(params.walletConfig);
  
  // 2. Initialize signer (handles both wallet types)
  await provider.initializeSigner();
  const signer = provider.getSigner();
  
  // 3. Handle token approval (if needed)
  if (needsApproval) {
    const approvalTx = await gasService.prepareTransactionParams(
      signer, approvalData, gasSettings
    ); // Auto gas estimation
    await signer.sendTransaction(approvalTx);
  }
  
  // 4. Execute swap transaction
  const swapTx = await gasService.prepareTransactionParams(
    signer, swapData, gasSettings
  ); // Auto gas estimation
  
  const txHash = await signer.sendTransaction(swapTx);
  return { success: true, txHash };
};
```

### 🔐 **Security Model**

**Private Key Wallets:**
```typescript
// Session-based security with auto-lock
const sessionConfig = {
  sessionTimeout: 480,          // 8 hours max session
  activityTimeout: 15,          // 15 min inactivity lock
  lockOnBrowserClose: true,     // Lock on browser close
  lockOnTabHidden: false,       // Don't lock on tab switch
};

// Private keys NEVER stored in plain text
✅ Encrypted with session-specific AES-256 keys
✅ Session keys stored in memory only
✅ Auto-cleanup on browser events
✅ Passkey authentication for decryption
```

**Privy Wallets:**
```typescript
// Managed by Privy with enterprise security
✅ Social authentication (email, Google, Discord)
✅ Secure wallet key management
✅ Cross-device synchronization
✅ Enterprise-grade infrastructure
```

### 🎯 **Wallet Config Creation**

Unified config creation for transaction execution:

```typescript
// useUnifiedWalletState.createWalletConfig()
const createWalletConfig = (rpcSettings, walletType, chainId) => ({
  rpcSettings,
  walletType,
  chainId,
  // Include Privy context ONLY for Privy wallets
  ...(walletType === 'privy' && {
    privyWallets: privyWallets,
    privyAuthenticated: privyAuthenticated,
    privyUser: privyUser,
    activeWalletInstance: privyWallets[0] || null,
  })
  // Private key wallets don't need additional context
});

// Usage in swap execution
const walletConfig = createWalletConfig(
  effectiveRpcSettings, 
  currentWalletType, 
  selectedNetwork.chainId
);
```

### 📊 **State Architecture**

**Single Source of Truth:**
```typescript
// Core wallet state (Zustand store)
const walletState = {
  walletAddress: string | null,    // SSOT for current address
  isConnected: boolean,            // SSOT for connection status
  walletConfig: WalletConfig,      // Wallet-specific config
  savedWallets: SavedWallet[],     // Saved private key wallets
  activeWallet: SavedWallet | null // Currently active saved wallet
};

// Derived state (computed from core state + external sources)
const derivedState = {
  currentWalletType: 'privy' | 'private' | null, // Computed
  privyWallets: Wallet[],                         // From Privy hooks
  hasActiveSession: boolean,                      // From sessionManager
};
```

**Store Hydration:**
```typescript
// Prevent false positive connection state
onRehydrateStorage: () => (state) => {
  // Only restore non-sensitive persistent data
  // walletAddress will be set by auto-connect after session verification
  // This prevents showing "connected" when session is actually expired
};
```

### 🔄 **Component Integration**

**Clean usage pattern:**
```typescript
const Header = () => {
  // Single hook provides all wallet state
  const {
    walletAddress,      // Direct from store (SSOT)
    isConnected,        // Direct from store (SSOT)
    currentWalletType,  // Computed helper
    disconnectPrivy     // Privy logout function
  } = useUnifiedWalletState();
  
  // Display logic based on actual wallet type
  const getWalletType = () => {
    return currentWalletType === 'private' ? 'PRK' : 'EOA';
  };
  
  const handleDisconnect = async () => {
    if (currentWalletType === 'privy') {
      await disconnectPrivy(); // Privy logout
    } else {
      lockWallet();           // Lock private key session
    }
  };
};
```

## Architecture

### 🏗️ **Clean Architecture Pattern**

```
UI → Hook → Store → Service → HTTP Client → API
│    │      │       │         │
│    │      │       │         └─ Pure HTTP operations
│    │      │       └─ Business logic & caching
│    │      └─ Domain-specific state management
│    └─ Presentation logic
└─ React components
```

### 📁 **Folder Structure**

```
swap-ui/
├── components/
│   ├── ui/           # Reusable UI components + Toast System
│   ├── wallet/       # Wallet connection components
│   ├── swap/         # Swap interface components
│   └── layout/       # Layout components
├── hooks/            # Presentation logic (useSwap, useWallet)
├── stores/           # Modular Zustand stores
│   ├── NetworkStore.ts    # Network & RPC management
│   ├── TokenStore.ts      # Token data & balances
│   ├── SwapStore.ts       # Swap state & quotes
│   ├── UIStore.ts         # UI state & loading
│   ├── WalletStore.ts     # Wallet management
│   └── index.ts           # Store exports
├── services/         # Business logic layer
│   ├── NetworkService.ts  # Network operations
│   ├── TokenService.ts    # Token operations
│   ├── SwapService.ts     # Swap operations
│   └── index.ts           # Service exports
├── lib/
│   ├── api.ts        # Pure HTTP client
│   ├── crypto.ts     # Security & encryption
│   └── wallet-provider.ts # Wallet abstractions
├── types/
│   └── api.ts        # Shared type definitions
└── providers/        # App providers
```

### 🔄 **Data Flow Example**

```typescript
// 1. UI Component
const SwapContainer = () => {
  const { executeSwapTransaction } = useSwap(); // Hook
  return <Button onClick={executeSwapTransaction} />;
};

// 2. Hook (Presentation Logic)
const useSwap = () => {
  const { executeSwap } = useSwapState(); // Store
  
  const executeSwapTransaction = async () => {
    return await executeSwap(params); // Calls store action
  };
};

// 3. Store (State Management)
const useSwapStore = create((set, get) => ({
  executeSwap: async (params) => {
    const result = await swapService.executeSwap(params); // Service
    return result;
  }
}));

// 4. Service (Business Logic)
export class SwapService {
  async executeSwap(params) {
    const result = await apiClient.post('/swap', params); // HTTP Client
    return result;
  }
}

// 5. HTTP Client (Pure HTTP)
export class ApiClient {
  async post(url, data) {
    return await this.client.post(url, data); // To API
  }
}
```

## Key Components

### 🎨 **UI Components**
- `TokenInput` - Number input with formatting
- `TokenAmountDisplay` - Formatted token amounts
- `TokenSelectorControl` - Reusable token selector
- `Button`, `Modal`, `Input` - Base UI components
- `Toast` & `ToastContainer` - Notification system
- `ErrorCard` - Consistent error display

### 🔄 **Toast Notification System**
```typescript
import { useToast } from '@/components/ui';

const toast = useToast();

// Success notifications
toast.success('Swap Completed!', 'Successfully swapped ETH → USDC');

// Error notifications  
toast.error('Swap Failed', 'Transaction was not completed');

// Warning & Info
toast.warning('High Price Impact', 'Consider reducing amount');
toast.info('Network Switching', 'Please confirm in wallet');

// With custom action
toast.showToast('error', 'Transaction Failed', {
  message: 'Click to retry',
  action: { label: 'Retry', onClick: () => retry() }
});
```

### 🏪 **Modular Store Architecture**
```typescript
// Individual domain stores
import { 
  useNetworkState,  // Network & RPC management
  useTokenState,    // Token data & balances  
  useSwapState,     // Swap state & quotes
  useUIState,       // Loading, errors, modals
  useWalletState    // Wallet management
} from '@/stores';

// Example usage
const SwapComponent = () => {
  const { networks, selectedNetwork } = useNetworkState();
  const { tokens, loadTokens } = useTokenState();
  const { quote, getSwapQuote } = useSwapState();
  const { loading, error } = useUIState();
  const { walletAddress, isConnected } = useWalletState();
};
```

### 🛠️ **Services Layer**
```typescript
// Independent business logic services
import { 
  networkService,  // Network operations & caching
  tokenService,    // Token operations & validation
  swapService      // Swap operations & execution
} from '@/services';

// Example: Direct service usage (for advanced cases)
const loadData = async () => {
  const networks = await networkService.loadNetworks();
  const tokens = await tokenService.loadTokens({ chainId: 8453 });
};
```

### 🔐 **Wallet Integration**
- `usePrivyWallet` - Privy wallet hook
- `useWallet` - Private key wallet hook with session management
- `WalletModal` - Unified connection modal
- `WalletSessionStatus` - Live session monitoring component

### 🛡️ **Security System**
- `sessionManager` - Session-based private key management
- `secureSigner` - Protected transaction signing
- `crypto.ts` - Passkey authentication & encryption

### 📡 **HTTP Client**
```typescript
// Pure HTTP client with retry logic
import { apiClient } from '@/libs/api';

// Automatic retry on network errors
const data = await apiClient.get('/api/networks');
const result = await apiClient.post('/api/swap', params);

// Built-in interceptors for logging and error handling
// Supports timeout, authentication, and custom headers
```

## Build & Deploy

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

## Bundle Size
- Main page: ~110kB (with Toast System)
- First load: ~220kB  
- Services layer: ~8kB (tree-shakeable)
- Modular stores: ~12kB (individual imports)
- Components are dynamically loaded to prevent SSR issues

## Architecture Benefits

### 🎯 **Maintainability**
- **Single Responsibility**: Each layer has a clear purpose
- **Separation of Concerns**: UI, business logic, and data access are separate
- **Testability**: Each layer can be tested independently
- **Scalability**: Easy to add new features without affecting existing code

### 🛠️ **Developer Experience**
- **Type Safety**: Full TypeScript coverage across all layers
- **Predictable Data Flow**: Clear path from UI to API
- **Reusable Services**: Business logic can be shared across components
- **Modular Architecture**: Import only what you need

### 🚀 **Performance**
- **Smart Caching**: Services layer handles intelligent caching
- **Tree Shaking**: Modular stores allow for optimized bundles
- **Lazy Loading**: Components and services load on demand
- **Efficient Updates**: Targeted re-renders with domain-specific stores

### 🔧 **Production Ready**
- **Error Boundaries**: Graceful error handling at each layer
- **Retry Logic**: Built-in HTTP retry mechanisms
- **User Feedback**: Toast notifications for all operations
- **Clean Logging**: Professional logging without console spam

---

🏗️ **Built with Clean Architecture principles**
📦 **Next.js 15, TypeScript, Tailwind CSS, Zustand**
🎨 **Designed for Enterprise & DeFi applications**
💙 **Made with ❤️ for the Web3 community**
