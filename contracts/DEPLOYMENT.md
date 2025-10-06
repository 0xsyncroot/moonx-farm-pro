# MoonXFarm Diamond Deployment Guide

## Prerequisites

1. **Foundry**: Install from [getfoundry.sh](https://getfoundry.sh/)
2. **Environment Variables**: Set up the required variables
3. **Network Access**: RPC endpoints for target networks

## Environment Setup

Create a `.env` file in the `contracts/` directory:

```bash
# Deployment Configuration
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
FEE_RECIPIENT=0x1234567890123456789012345678901234567890

# Network RPC URLs
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BSC_RPC_URL=https://bsc-dataseed.binance.org

# Block Explorer API Keys (for verification)
BASESCAN_API_KEY=your-basescan-api-key
ETHERSCAN_API_KEY=your-etherscan-api-key
```

## Supported Networks

### Production Networks
- **Base Mainnet (8453)**: Full Uniswap V2/V3/V4 + Universal Router support
- **BSC Mainnet (56)**: Uniswap V2/V3 (PancakeSwap) support

### Testnet Networks  
- **Base Sepolia (84532)**: Full Uniswap V2/V3/V4 + Universal Router support
- **Local (31337)**: Anvil/Hardhat local development

## Deployment Commands

### 1. Base Sepolia (Testnet)
```bash
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

### 2. Base Mainnet (Production)
```bash
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify --gas-price 2000000000
```

### 3. BSC Mainnet (Production)
```bash
forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --verify
```

### 4. Local Development
```bash
# Start Anvil in separate terminal
anvil

# Deploy to local network
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

## Deployed Components

### Core Infrastructure
1. **MoonXFarmRouter (Diamond)**: Main proxy contract
2. **DiamondCutFacet**: Upgrade management
3. **DiamondLoupeFacet**: Contract introspection
4. **OwnershipFacet**: Access control
5. **FeeCollectorFacet**: Fee management
6. **PauseFacet**: Emergency controls

### Multi-Aggregator Facets
1. **LifiProxyFacet**: Cross-chain bridge integration
2. **OneInchProxyFacet**: Price optimization aggregator
3. **MoonXFacet**: In-house Universal Uniswap aggregator

## Network-Specific Configurations

### Base Mainnet (8453)
- **Universal Router**: `0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af` (V4 Compatible)
- **V4 Quoter**: `0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203`
- **LiFi**: `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`
- **1inch**: `0x111111125421cA6dc452d289314280a0f8842A65`

### Base Sepolia (84532)  
- **Universal Router**: `0x4a5C956e6626c552c9e830beFDDf8F5e02bBf60a` (V4 Compatible)
- **V4 Quoter**: `0x7C594D9B533ac43D3595dd4117549111Ec48F8B2`
- **LiFi**: `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`
- **1inch**: `0x111111125421cA6dc452d289314280a0f8842A65`

## Verification

After deployment, verify contracts on block explorers:

```bash
# Base networks
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> --chain base --etherscan-api-key $BASESCAN_API_KEY

# BSC networks  
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> --chain bsc --etherscan-api-key $BSCSCAN_API_KEY
```

## Usage Examples

### 1. Cross-Chain Swap (LiFi)
```solidity
// Call through diamond proxy
ILifiProxyFacet(diamondAddress).callLifi{value: ethAmount}(
    fromTokenWithFee,
    fromAmount, 
    toTokenWithFee,
    lifiCallData
);
```

### 2. Best Price Swap (1inch)
```solidity
// Call through diamond proxy
IOneInchProxyFacet(diamondAddress).callOneInch{value: ethAmount}(
    fromTokenWithFee,
    fromAmount,
    toTokenWithFee, 
    oneInchCallData
);
```

### 3. Direct Uniswap Swap (MoonXFacet)
```solidity
// Call through diamond proxy
bytes[] memory args = new bytes[](7);
args[0] = abi.encode(tokenIn);
args[1] = abi.encode(tokenOut);
args[2] = abi.encode(amountIn);
args[3] = abi.encode(slippage);
args[4] = abi.encode(refData);
args[5] = abi.encode(version); // 2, 3, or 4
args[6] = abi.encode(pathData);

IMoonXFacet(diamondAddress).execMoonXSwap{value: ethAmount}(args);
```

## Gas Optimization

- **Via-IR Compilation**: Enabled in `foundry.toml`
- **Optimizer**: 200 runs for balanced gas costs
- **Diamond Proxy**: Upgradeable without redeployment

## Security Considerations

1. **Multi-signature**: Use multi-sig wallet for production deployments
2. **Timelock**: Consider timelock for upgrade functions
3. **Fee Limits**: Platform fee capped at 10%, referral fee at 1%
4. **Pause Mechanism**: Emergency pause available for all facets
5. **Access Control**: Owner-only functions for critical operations

## Troubleshooting

### Common Issues

1. **Insufficient Gas**: Increase `--gas-limit` for complex deployments
2. **Nonce Issues**: Use `--with-gas-price` for faster inclusion
3. **Verification Failures**: Ensure correct compiler version and settings
4. **RPC Limits**: Use paid RPC endpoints for production deployments

### Debug Commands

```bash
# Dry run deployment
forge script script/Deploy.s.sol --rpc-url $RPC_URL

# Check gas estimates
forge script script/Deploy.s.sol --rpc-url $RPC_URL --gas-estimate

# View deployment logs
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vvv
```

## Production Checklist

- [ ] Multi-signature wallet configured
- [ ] Fee recipient address verified
- [ ] Network configurations tested
- [ ] Gas prices optimized
- [ ] Block explorer verification prepared
- [ ] Emergency pause procedures documented
- [ ] Upgrade procedures tested

---

**MoonXFarm Multi-Aggregator Diamond** - Production-Ready Deployment

*LiFi + 1inch + Universal Uniswap V2/V3/V4 Integration* 