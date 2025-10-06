# MoonX Farm Router - Upgrade Scripts

## 🎯 Overview

This directory contains scripts for upgrading the MoonXFacet in the MoonX Farm Router Diamond pattern deployment.

## 📁 Files

### 1. `UpgradeMoonXFacet.s.sol`
Solidity script that handles the upgrade process:
- ✅ Removes old MoonXFacet from Diamond
- ✅ Deploys new MoonXFacet with CREATE2 (deterministic address)
- ✅ Adds new MoonXFacet to Diamond
- ✅ Verifies upgrade success

### 2. `upgrade-moonx-facet.sh`
Comprehensive shell script for easy upgrades:
- 🌐 Supports multiple networks (Base, Ethereum, Base Sepolia)
- 🔍 Validates environment and inputs
- 💾 Creates backups before upgrade
- ⛽ Estimates gas costs
- 📊 Shows detailed progress and results

### 3. `predict-addresses.sh`
Utility script to predict MoonXFacet addresses across all networks.

### 4. `env.template`
Template file for environment configuration. Copy to `.env` and fill in your values.

### 5. `multiple-upgrades.example`
Example configuration for multiple upgrades with dynamic/custom salt options.

## 🚀 Quick Start

### Prerequisites

1. **Create .env file:**
   ```bash
   cp script/env.template .env
   # Edit .env with your values
   ```

2. **Required Environment Variables (.env file):**
   ```bash
   NETWORK=base                    # base, ethereum, base-sepolia
   DIAMOND_ADDRESS=0x...          # Your deployed Diamond address
   PRIVATE_KEY=abc123...          # Deployer private key (no 0x prefix)
   FEE_RECIPIENT=0x...           # Fee recipient address
   ```

3. **Optional (for contract verification):**
   ```bash
   ETHERSCAN_API_KEY=...         # For Ethereum networks
   BASESCAN_API_KEY=...          # For Base networks
   ```
   
   **Verification Support:**
   - ✅ `base` → Uses Basescan
   - ✅ `ethereum/mainnet` → Uses Etherscan  
   - ✅ `base-sepolia` → Uses Basescan
   - ❌ `base-local` → No verification (local network)

4. **Tools:**
   - Forge (Foundry) installed
   - Sufficient ETH for gas fees

### Multiple Upgrades Support

The script supports multiple upgrades with different salt configurations:

**🔄 For Multiple Upgrades (Recommended):**
```bash
# Option 1: Use dynamic salt (new address each time)
USE_DYNAMIC_SALT=true

# Option 2: Use versioned custom salt
UPGRADE_SALT=MoonXFarmRouter.v2.0.0  # For version 2
UPGRADE_SALT=MoonXFarmRouter.v3.0.0  # For version 3
```

**🎯 For Deterministic Addresses (Cross-chain consistency):**
```bash
# Default behavior - same address on all chains
# (Only works for first deployment)
USE_DYNAMIC_SALT=false
```

**🔍 Key Points:**
- ✅ **Diamond address never changes** - only facet addresses change
- ✅ Multiple upgrades supported with dynamic/custom salt
- ✅ Deterministic deployment for cross-chain consistency (first deploy only)
- ✅ No conflicts when upgrading multiple times

### Step 1: Predict Addresses (Optional)

**Note:** Address prediction only works with deterministic salt (default behavior).

```bash
# Only works if USE_DYNAMIC_SALT=false (default)
./script/predict-addresses.sh
```

**Address Prediction Behavior:**
- 🎯 **Deterministic Salt:** Same address across all chains
- 🔄 **Dynamic Salt:** Address changes each upgrade (cannot predict)  
- 🎨 **Custom Salt:** Address depends on your custom salt value

### Step 2: Run Upgrade

Execute the upgrade on your target network:

```bash
# Using .env file only (recommended):
./script/upgrade-moonx-facet.sh

# Override network from .env:
./script/upgrade-moonx-facet.sh base

# Override both network and diamond address:
./script/upgrade-moonx-facet.sh base 0x<your_diamond_address>

# Examples for different networks:
./script/upgrade-moonx-facet.sh ethereum     # Override to Ethereum
./script/upgrade-moonx-facet.sh base-sepolia # Override to Base Sepolia

# Examples for multiple upgrades:
USE_DYNAMIC_SALT=true ./script/upgrade-moonx-facet.sh        # Dynamic salt
UPGRADE_SALT=v2.0.0 ./script/upgrade-moonx-facet.sh          # Custom salt
```

### Step 3: Verify

The script automatically verifies the upgrade, but you can also check manually:

```bash
# Check Diamond on Base
cast call 0x<diamond_address> "facetAddress(bytes4)" 0x<moonx_selector> --rpc-url https://mainnet.base.org
```

## 🔧 Manual Usage

If you prefer to run the Solidity script directly:

```bash
# Make sure .env file is configured first
source .env

# Run on Base
forge script script/UpgradeMoonXFacet.s.sol:UpgradeMoonXFacetScript \
    --chain-id 8453 \
    --rpc-url https://mainnet.base.org \
    --broadcast \
    --verify \
    -vvvv
```

## 🛡️ Security Features

- **CREATE2 Deterministic Deployment**: Same addresses across all chains
- **Backup Creation**: Automatic backup before each upgrade
- **Comprehensive Validation**: Input, environment, and network checks
- **Upgrade Verification**: Confirms successful upgrade completion
- **Gas Estimation**: Shows expected costs before execution

## 🌐 Supported Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Base Mainnet | 8453 | https://mainnet.base.org |
| Ethereum Mainnet | 1 | https://ethereum.publicnode.com |
| Base Sepolia | 84532 | https://sepolia.base.org |

## 📊 Gas Costs (Estimates)

- **Ethereum Mainnet**: ~0.01-0.05 ETH (varies with congestion)
- **Base Mainnet**: ~0.001-0.005 ETH (much cheaper)
- **Base Sepolia**: ~0.001 ETH (testnet)

## 🔍 Troubleshooting

### Common Issues

1. **"Invalid diamond address"**
   - Make sure `DIAMOND_ADDRESS` is set correctly
   - Verify the Diamond contract exists on the target network

2. **"Unsupported network"**
   - Check network name spelling (base, ethereum, base-sepolia)
   - Ensure network is configured in the script

3. **"Cannot connect to RPC"**
   - Check internet connection
   - Try alternative RPC endpoints

4. **"Upgrade verification failed"**
   - Check if another transaction modified the Diamond
   - Verify you have proper ownership permissions

### Debug Mode

Run with extra verbosity:

```bash
./script/upgrade-moonx-facet.sh base 0x<diamond> 2>&1 | tee upgrade.log
```

## 📚 Additional Resources

- [Diamond Pattern Documentation](https://eips.ethereum.org/EIPS/eip-2535)
- [CREATE2 Address Prediction](https://docs.openzeppelin.com/cli/2.8/deploying-with-create2)
- [Forge Script Documentation](https://book.getfoundry.sh/tutorials/solidity-scripting)

## 🤝 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs in `./backups/` directory
3. Verify your environment variables
4. Contact the MoonX team

---

**⚠️ Important**: Always test on testnet first before mainnet deployments!