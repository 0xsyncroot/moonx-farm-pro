# 🚀 MoonXFarm Swap Demo

Demo script để swap token A sang token B sử dụng MoonXFacet với ethers.js.

## 📋 Prerequisites

1. **Node.js** (v16 trở lên)
2. **Deployed MoonXFarm Diamond** với MoonXFacet
3. **Private key** của wallet có token để swap
4. **Token A** trong wallet (để swap đi)

## 🔧 Setup

### 1. Install Dependencies
```bash
cd contracts
npm install ethers
# hoặc
npm run install-deps
```

### 2. Configure
Mở file `demo-swap.js` và edit phần CONFIG:

```javascript
const CONFIG = {
    // ❗ CẦN THIẾT - Điền địa chỉ Diamond đã deploy
    DIAMOND_ADDRESS: "0x1234...", // YOUR DEPLOYED DIAMOND ADDRESS
    
    // ❗ CẦN THIẾT - RPC URL và Private Key  
    RPC_URL: "https://mainnet.base.org", // Base mainnet
    PRIVATE_KEY: "0x...", // YOUR PRIVATE KEY
    
    // 🔄 SWAP CONFIG - Tùy chỉnh token muốn swap
    TOKEN_A: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    TOKEN_B: "0x4200000000000000000000000000000000000006", // WETH  
    AMOUNT_IN: "1000000", // 1 USDC (6 decimals)
    SLIPPAGE: 300, // 3% (300 basis points)
    VERSION: 3, // Uniswap V3
    
    // 📊 V3 CONFIG
    POOL_FEE: 3000, // 0.3% pool fee
};
```

## 🎯 Supported Networks & Tokens

### Base Mainnet
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **WETH**: `0x4200000000000000000000000000000000000006`
- **DAI**: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb`

### Base Sepolia (Testnet)  
- **Mock USDC**: Deploy your own or use testnet tokens
- **WETH**: `0x4200000000000000000000000000000000000006`

## 🚀 Usage

### Quick Start
```bash
# Configure demo-swap.js first!
npm run swap
```

### Manual Run
```bash
node demo-swap.js
```

## 📊 Uniswap Versions

### V2 (VERSION: 2)
- Simple path routing
- Higher gas cost
- args[6]: path array `[tokenA, tokenB]`

### V3 (VERSION: 3) - Recommended  
- Better pricing
- Multiple fee tiers
- args[6]: pool fee `3000` (0.3%)

**Fee Tiers:**
- `500` = 0.05% (stable pairs)
- `3000` = 0.3% (standard)  
- `10000` = 1% (exotic pairs)

### V4 (VERSION: 4)
- Latest version
- Most efficient
- args[6]: route data (complex)

## 💡 Example Configurations

### USDC → WETH (Most Common)
```javascript
TOKEN_A: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
TOKEN_B: "0x4200000000000000000000000000000000000006", // WETH
AMOUNT_IN: "1000000", // 1 USDC
VERSION: 3,
POOL_FEE: 3000
```

### WETH → USDC  
```javascript
TOKEN_A: "0x4200000000000000000000000000000000000006", // WETH
TOKEN_B: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC  
AMOUNT_IN: "1000000000000000000", // 1 WETH (18 decimals)
VERSION: 3,
POOL_FEE: 3000
```

### ETH → USDC (Native ETH)
```javascript
TOKEN_A: "0x0000000000000000000000000000000000000000", // ETH
TOKEN_B: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
AMOUNT_IN: "1000000000000000000", // 1 ETH
```

## 🔍 Demo Output

```bash
🔧 MoonXFarm Token Swap Demo
===============================
🚀 MoonXFarm Swap Demo Starting...
👤 User Address: 0xf39F...
💎 Diamond Address: 0x1234...
🔄 Swapping 1000000 USDC → WETH  
📊 Version: Uniswap V3
💰 USDC Balance: 150.0
🔓 Approving token spend...
✅ Approval confirmed
📈 Expected Output: 0.000384 WETH
🔄 Executing swap...
📝 Transaction hash: 0xabc123...
✅ Swap completed!
⛽ Gas used: 234567

📊 Final Balances:
USDC: 149.0
WETH: 1.000384
```

## ⚠️ Security Notes

1. **Private Key**: Không commit private key vào git!
2. **Amount**: Double-check decimals (USDC=6, WETH=18)
3. **Slippage**: 3-5% là an toàn cho volatile tokens
4. **Gas**: Set sufficient gas limit (300k-500k)

## 🐛 Troubleshooting

### "Insufficient balance"
- Check token balance
- Verify amount decimals

### "Execution reverted"
- Check slippage tolerance
- Verify pool exists
- Check gas limit

### "Invalid aggregator"  
- Diamond chưa deploy MoonXFacet
- Network config sai

### "Allowance insufficient"
- Script tự động approve
- Check approval transaction

## 🎨 Customization

### Add Custom Tokens
```javascript
// Your custom token
TOKEN_A: "0xYourTokenAddress",
TOKEN_B: "0xAnotherTokenAddress", 
AMOUNT_IN: "1000000000000000000", // Check decimals!
```

### Multi-hop Swaps (V2 only)
```javascript
VERSION: 2,
// Modify prepareSwapArgs() for path: [TOKEN_A, WETH, TOKEN_B]
```

### Referral Fees
```javascript
REF_ADDRESS: "0xYourReferralAddress",
REF_FEE: 50, // 0.5% (max 100 = 1%)
```

## 📚 Integration

### Use in Your App
```javascript
const { swapTokens, prepareSwapArgs } = require('./demo-swap.js');

// Call swap function
await swapTokens();

// Or prepare args for custom transaction  
const args = await prepareSwapArgs();
```

### Frontend Integration  
```javascript
import { ethers } from 'ethers';
// Copy ABI and functions from demo-swap.js
```

Happy Swapping! 🎉 