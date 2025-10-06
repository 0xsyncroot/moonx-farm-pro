# MoonXFarm Smart Contracts

**Diamond Proxy Architecture with Multi-Aggregator Integration**

MoonXFarm smart contracts implement the EIP-2535 Diamond Proxy pattern to provide a modular, upgradeable decentralized exchange platform with support for multiple aggregators: LiFi (cross-chain), 1inch (price optimization), and in-house Universal Uniswap V2/V3/V4 integration.

## 🏗️ Architecture Overview

### Diamond Proxy Pattern (EIP-2535)
The contracts use the Diamond Proxy standard for maximum flexibility and upgradeability:

```
Diamond (Proxy)
├── DiamondCutFacet     // Contract upgrade management
├── DiamondLoupeFacet   // Introspection functionality  
├── OwnershipFacet      // Access control
├── PauseFacet          // Emergency pause controls
├── FeeCollectorFacet   // Fee management
├── LifiProxyFacet      // LiFi cross-chain aggregator
├── OneInchProxyFacet   // 1inch DEX aggregator
└── MoonXFacet          // In-house Uniswap aggregator
    ├── MoonxAggregator // Quote aggregation engine
    ├── ReentrancyGuard // Security protection
    └── Pause           // Emergency controls
```

### Core Components

#### **LifiProxyFacet** - Cross-Chain Aggregator
- **Bridge Integration**: Cross-chain asset transfers
- **Multi-Chain Support**: Seamless cross-chain swaps
- **Proxy Pattern**: Secure integration with LiFi protocol
- **Fee Handling**: Automatic fee deduction and forwarding

#### **OneInchProxyFacet** - Price Optimization Aggregator  
- **Best Price Discovery**: Across multiple DEX protocols
- **Slippage Optimization**: Minimal price impact routing
- **Proxy Pattern**: Secure integration with 1inch protocol
- **Gas Efficiency**: Optimized execution paths

#### **MoonXFacet** - In-House Uniswap Aggregator
- **Universal Uniswap Support**: Native V2, V3, V4 integration
- **Fee Management**: Platform and referral fees with ETH conversion
- **Quote Validation**: Real-time price freshness checks
- **MEV Protection**: Slippage controls and sandwich attack prevention
- **Security**: Reentrancy guards, pause mechanisms, access controls

#### **MoonxAggregator** - Quote Engine (MoonXFacet)
- **Multi-Version Quoting**: Parallel quotes across Uniswap versions
- **Best Route Selection**: Automatic optimal path detection
- **Circuit Breaker**: Fallback protection for failed quotes
- **Gas Optimization**: Via-IR compilation for complex operations

## 🔧 Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Language** | Solidity | 0.8.23 |
| **Framework** | Foundry | Latest |
| **Pattern** | Diamond Proxy | EIP-2535 |
| **Dependencies** | Git Submodules | - |
| **Compiler** | Via-IR | Enabled |
| **Testing** | Forge | Native Solidity |

## 🚀 Features

### Multi-Aggregator Support
- **LiFi Integration**: Cross-chain bridges and multi-chain DEX aggregation
- **1inch Integration**: Best price discovery across 100+ DEX protocols
- **Universal Uniswap (In-house)**: Native V2, V3, V4 with advanced features

### Universal Uniswap Integration (MoonXFacet)
- **Uniswap V2**: Direct pair trading with optimal routing
- **Uniswap V3**: Concentrated liquidity with fee tier selection
- **Uniswap V4**: Hooks-enabled trading with custom pools
- **Universal Router**: Single interface for all versions

### Advanced Fee System (MoonXFacet)
- **Platform Fees**: Configurable basis points (max 10%)
- **Referral Commissions**: Up to 1% referral rewards
- **ETH Conversion**: All fees automatically converted to ETH using existing swap logic
- **Fee Validation**: Real-time limits and safety checks
- **Unified Collection**: Fee recipients only receive ETH (simplified management)

### Security Features
- **Reentrancy Protection**: OpenZeppelin-style guards
- **Access Control**: Role-based permissions
- **Pause Mechanism**: Emergency stop functionality
- **Input Validation**: Comprehensive parameter checking
- **Amount Limits**: Min/max swap amount enforcement
- **Slippage Protection**: Maximum 50% slippage limit

### Quote Validation System
- **Price Freshness**: Real-time re-quoting before execution
- **Deviation Threshold**: Configurable price movement limits
- **Stale Quote Prevention**: Auto-rejection of outdated quotes
- **MEV Protection**: Front-running and sandwich attack mitigation

## 📁 Contract Structure

```
contracts/src/
├── Diamond.sol                 # Main diamond proxy contract
├── facets/
│   ├── DiamondCutFacet.sol    # Upgrade functionality
│   ├── DiamondLoupeFacet.sol  # Introspection
│   ├── OwnershipFacet.sol     # Access control
│   ├── PauseFacet.sol         # Emergency pause controls
│   ├── FeeCollectorFacet.sol  # Fee management
│   ├── LifiProxyFacet.sol     # LiFi aggregator proxy
│   ├── OneInchProxyFacet.sol  # 1inch aggregator proxy
│   └── MoonXFacet.sol         # In-house Uniswap aggregator
├── helpers/
│   ├── AggregatorProxy.sol    # Base proxy for external aggregators
│   ├── MoonxAggregator.sol    # Uniswap quote aggregation
│   ├── ReentrancyGuard.sol    # Security helper
│   └── Pause.sol              # Emergency controls
├── interfaces/
│   ├── IUniversalRouter.sol   # Uniswap Universal Router
│   ├── IV4Router.sol          # Uniswap V4 interface
│   ├── IV4Quoter.sol          # V4 quoter interface
│   └── IERC20.sol             # ERC20 standard
├── libraries/
│   ├── LibDiamond.sol         # Diamond proxy logic
│   ├── LibFeeCollector.sol    # Fee management
│   └── UniversalRouterCommands.sol # Router commands
└── errors/
    └── RouterErrors.sol       # Custom error definitions
```

## 🔧 Development Setup

### Prerequisites
- **Foundry**: Latest version installed
- **Git**: For submodule management
- **Node.js**: 18+ for additional tooling

### Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/your-org/moonx-farm.git
   cd moonx-farm/contracts
   ```

2. **Install Dependencies**
   ```bash
   forge install
   git submodule update --init --recursive
   ```

3. **Build Contracts**
   ```bash
   forge build
   ```

### Development Commands

```bash
# Compilation
forge build                    # Compile all contracts
forge build --force            # Force recompilation

# Testing
forge test                     # Run all tests
forge test -vvv                # Verbose test output
forge test --match-test testSwap # Run specific test

# Code Quality
forge fmt                      # Format Solidity code
forge snapshot                 # Generate gas snapshots

# Local Development
anvil                          # Start local blockchain
forge script script/Deploy.s.sol --rpc-url http://localhost:8545
```

## 🧪 Testing

### Test Coverage
- **Unit Tests**: Individual function testing
- **Integration Tests**: Cross-contract functionality
- **Fork Tests**: Mainnet fork simulations
- **Gas Optimization**: Snapshot-based tracking

### Key Test Cases
- **Swap Execution**: All Uniswap versions
- **Fee Handling**: Platform and referral fees
- **Quote Validation**: Price freshness checks
- **Security**: Reentrancy and access control
- **Edge Cases**: Slippage limits, failed swaps

```bash
# Run specific test suites
forge test --match-contract MoonXFacetTest
forge test --match-test testUniswapV4Swap
forge test --fork-url $MAINNET_RPC_URL
```

## 🚢 Deployment

### Deployment Scripts
```bash
# Deploy to local network
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify

# Deploy to mainnet
forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC --broadcast --verify
```

### Environment Configuration
```bash
# Network RPCs
BASE_MAINNET_RPC=https://mainnet.base.org
BASE_SEPOLIA_RPC=https://sepolia.base.org
BSC_MAINNET_RPC=https://bsc-dataseed.binance.org

# Deployment Keys
PRIVATE_KEY=your-deployment-private-key
ETHERSCAN_API_KEY=your-etherscan-api-key

# Contract Addresses
UNIVERSAL_ROUTER=0x...
V4_ROUTER=0x...
WETH=0x...
```

## 📊 Gas Optimization

### Compiler Optimizations
- **Via-IR**: Enabled for stack-too-deep resolution
- **Optimizer**: 200 runs for balanced optimization
- **Yul Optimizer**: Advanced IR-level optimization

### Gas Usage Benchmarks
| Function | Gas Usage | Optimization |
|----------|-----------|--------------|
| **execMoonXSwap** | ~150-200k | Via-IR compilation |
| **getQuote** | ~50-80k | Parallel processing |
| **V2 Swap** | ~120k | Direct router call |
| **V3 Swap** | ~140k | Fee tier optimization |
| **V4 Swap** | ~160k | Hook-aware routing |

## 🔐 Security

### Security Measures
- **Reentrancy Guards**: All external calls protected
- **Access Control**: Multi-role permission system
- **Input Validation**: Comprehensive parameter checking
- **Pause Mechanism**: Emergency stop functionality
- **Amount Limits**: Min/max constraints on all operations

### Custom Errors
Gas-efficient error handling with descriptive error types:
```solidity
error InvalidAmount();
error InvalidTokenAddress();
error SameTokenSwap();
error ReturnAmountIsNotEnough(uint256 actual, uint256 expected);
error NativeAssetTransferFailed();
error InvalidMsgValue();
```

### Audit Checklist
- [ ] Reentrancy protection on all external calls
- [ ] Access control on administrative functions
- [ ] Input validation on all user-facing functions
- [ ] Proper error handling and revert reasons
- [ ] Gas optimization without security compromise
- [ ] Integration test coverage for all swap paths

## 📚 Integration Guide

### Multi-Aggregator Usage

#### Using LiFi for Cross-Chain Swaps
```solidity
// Cross-chain swap via LiFi
lifiProxyFacet.callLifi{value: ethAmount}(
    fromTokenWithFee,  // Encoded token address + fee
    fromAmount,        // Input amount
    toTokenWithFee,    // Encoded destination token + fee
    callData          // LiFi call data
);
```

#### Using 1inch for Best Prices
```solidity
// Optimized swap via 1inch
oneInchProxyFacet.callOneInch{value: ethAmount}(
    fromTokenWithFee,  // Encoded token address + fee
    fromAmount,        // Input amount  
    toTokenWithFee,    // Encoded destination token + fee
    callData          // 1inch call data
);
```

#### Using MoonXFacet for Uniswap
```solidity
// Direct Uniswap swap with advanced features
bytes[] memory args = new bytes[](8);
args[0] = abi.encode(tokenIn);      // Input token
args[1] = abi.encode(tokenOut);     // Output token  
args[2] = abi.encode(amountIn);     // Input amount
args[3] = abi.encode(slippage);     // Slippage tolerance
args[4] = abi.encode(refData);      // Referral data
args[5] = abi.encode(version);      // Uniswap version (2,3,4)
args[6] = abi.encode(pathData);     // Path/fee data

uint256 amountOut = moonXFacet.execMoonXSwap{value: ethAmount}(args);
```

### Quote Integration (MoonXFacet)
```solidity
// Get best quote across Uniswap versions
bytes[] memory quoteArgs = new bytes[](3);
quoteArgs[0] = abi.encode(tokenIn);
quoteArgs[1] = abi.encode(tokenOut);  
quoteArgs[2] = abi.encode(amountIn);

QuoteResult memory quote = moonXFacet.getQuote(quoteArgs);
```

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch (`git checkout -b feature/new-feature`)
3. Write tests for new functionality
4. Implement changes with security focus
5. Run full test suite (`forge test`)
6. Submit pull request with documentation

### Code Standards
- **Solidity Style**: Follow official Solidity style guide
- **Documentation**: NatSpec comments for all public functions
- **Testing**: Minimum 90% test coverage for new code
- **Security**: Security-first development approach

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

**MoonXFarm Smart Contracts** - Universal Uniswap Integration with Diamond Proxy Architecture

*Secure, Modular, and Upgradeable DeFi Infrastructure*
