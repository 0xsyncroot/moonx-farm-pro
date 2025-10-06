# 🚀 MoonXFarm Demo - Quick Guide

Demo script để swap và get quote tokens sử dụng MoonXFacet với **event parsing** và **return value analysis**.

## 🔧 Setup

```bash
npm install ethers  # Install dependency
```

Edit `demo-swap.js` CONFIG section:
```javascript
const CONFIG = {
    DIAMOND_ADDRESS: "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f", // Your Diamond
    RPC_URL: "http://localhost:8545", // Your RPC
    PRIVATE_KEY: "0x...", // Your private key
    
    TOKEN_A: "0x4200000000000000000000000000000000000006", // WETH
    TOKEN_B: "0xcaf75598b8b9a6e645b60d882845d361f549f5ec", // USDC
    AMOUNT_IN: "100000000000000000", // 0.1 WETH
};
```

## 🚀 Usage

### 1. Get Quote Only (No Transaction)
```bash
# Using CONFIG values
npm run demo:quote

# Custom parameters
node src/demo/demo-swap.js quote [tokenA] [tokenB] [amount] [version]
node src/demo/demo-swap.js quote 0x420...006 0xcaf...5ec 100000000000000000 3
```

### 2. Execute Swap (Requires Private Key)
```bash
# Using CONFIG values  
npm run demo:swap

# Always uses CONFIG for swap
```

## 📊 Enhanced Output Examples

### Quote Output:
```bash
📊 Getting MoonXFarm Quote...
🔍 Token types: ERC20 → ERC20
✅ Diamond contract found
🔍 Validating Token A contract...
🔍 Validating Token B contract...
🪙 Tokens: WETH → USDC
💱 Quote: 0.1 WETH → USDC
📊 Version: Uniswap V3
📈 Expected Output: 374.123456 USDC
💵 Exchange Rate: 1 WETH = 3741.234560 USDC

✅ Quote Result:
374.123456 USDC
Exchange Rate: 1 WETH = 3741.234560 USDC
```

### Swap Output with Event Parsing:
```bash
🚀 MoonXFarm Swap Demo Starting...
👤 User Address: 0xf39F...
💎 Diamond Address: 0xa852...
📊 Getting quote...
📈 Expected Output: 374.123456 USDC
🔄 Swapping 0.1 WETH → USDC

💰 WETH Balance: 1.5
✅ Sufficient allowance available
🎯 Min Output (3% slippage): 362.899733 USDC
🎯 Expected return value: 374.089512 USDC

🔄 Executing swap...
📝 Transaction hash: 0x123...
✅ Swap completed!
⛽ Gas used: 185432

📋 Transaction Events: 3 transfers, 1 swaps, 1 moonx, 2 other
🌙 MoonX Events:
  1. Event: 0xabcd1234... (0x000000000000000000...)

📊 Transfer Events:
  1. 📤 WETH: 0.1 (0xf39F...→0xa852...)
  2. 📥 USDC: 374.089512 (0xa852...→0xf39F...)
  3. 🔄 USDC: 0.025 (0xa852...→0x0000...) // Fee

✅ Found output transfer: 374.089512 USDC

📊 Final Balances:
WETH: 1.4
USDC: 1374.089512

📈 Swap Result:
Expected: 374.123456 USDC
Actual (from events): 374.089512 USDC
📊 Price Impact: 0.09%
💱 Actual Rate: 1 WETH = 3740.895120 USDC
```

## 🎯 Function Usage in Code

```javascript
const { getQuote, swapTokens, parseSwapEvents } = require('./demo-swap.js');

// Get quote only
const quote = await getQuote(
    "0x4200000000000000000000000000000000000006", // WETH
    "0xcaf75598b8b9a6e645b60d882845d361f549f5ec", // USDC  
    "100000000000000000", // 0.1 WETH
    3 // Uniswap V3
);

console.log(`Expected: ${quote.amountOutFormatted} ${quote.symbolOut}`);

// Execute swap with event parsing
const swapResult = await swapTokens();
console.log(`Actual: ${swapResult.amountOutFormatted}`);
console.log(`Events parsed: ${swapResult.events}`);
console.log(`Transfer events:`, swapResult.transferEvents);
```

## 📝 Enhanced Return Format

### getQuote Result:
```javascript
{
    amountOut: "374123456789012345678", // Raw amount
    amountOutFormatted: "374.123456", // Formatted amount
    tokenIn: "0x420...", // Input token address
    tokenOut: "0xcaf...", // Output token address
    symbolIn: "WETH", // Input symbol
    symbolOut: "USDC", // Output symbol  
    decimalsIn: 18, // Input decimals
    decimalsOut: 6, // Output decimals
    exchangeRate: 3741.234560, // Rate per 1 input token
    version: 3, // Uniswap version used
    isTokenAETH: false, // Whether input is ETH
    isTokenBETH: false // Whether output is ETH
}
```

### swapTokens Result:
```javascript
{
    success: true,
    txHash: "0x123...",
    gasUsed: "185432",
    expectedAmountOut: "374123456789012345678",
    expectedReturnValue: "374089512345678901234", // From static call
    actualAmountOut: "374089512345678901234", // From events
    amountOutFormatted: "374.089512",
    priceImpact: "0.09",
    exchangeRate: "3740.895120",
    events: 3, // Number of transfer events
    transferEvents: [...], // Detailed transfer events
    swapEvents: [...] // Detailed swap events
}
```

## 🔍 Event Parsing Features

| Feature | Description |
|---------|-------------|
| **Transfer Events** | Track all token movements with direction indicators |
| **MoonX Events** | Custom events from Diamond contract |
| **Swap Events** | Uniswap pool swap events |
| **Return Value** | Get actual return from `execMoonXSwap` via static call |
| **Event vs Balance** | Compare event data with balance changes |
| **Fee Detection** | Identify protocol fees from transfer patterns |

## 💡 ETH Support

```javascript
// ETH → Token
TOKEN_A: "0x0000000000000000000000000000000000000000" // ETH
TOKEN_B: "0xcaf75598b8b9a6e645b60d882845d361f549f5ec" // USDC
AMOUNT_IN: "1000000000000000000" // 1 ETH

// Token → ETH  
TOKEN_A: "0xcaf75598b8b9a6e645b60d882845d361f549f5ec" // USDC
TOKEN_B: "0x0000000000000000000000000000000000000000" // ETH
AMOUNT_IN: "1000000000" // 1000 USDC
```

## ⚙️ Commands Summary

| Command | Description | Requires Private Key | Event Parsing |
|---------|-------------|---------------------|---------------|
| `npm run demo:quote` | Get quote only | ❌ | ❌ |
| `npm run demo:swap` | Execute swap | ✅ | ✅ |
| `npm run demo:setup` | Install dependencies | ❌ | ❌ |

## 🛠 Debugging

- **Events**: All transfer events with direction indicators
- **Static Call**: Pre-execution return value simulation  
- **Balance Comparison**: Event data vs actual balance changes
- **Gas Tracking**: Accurate rate calculation for ETH swaps
- **Error Details**: Comprehensive error messages with solutions

Happy Trading with Full Transparency! 🎉 