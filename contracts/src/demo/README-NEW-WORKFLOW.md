# MoonX New Workflow Demo

## 🌟 Overview

Demo cho workflow mới của MoonX Aggregator:
- **moonxGetQuote**: Tự động tìm kiếm best quote trên tất cả Uniswap versions
- **moonxExec**: Execute swap với path optimized từ quote result

## 📁 Files

### 1. `demo-get-quote.js`
Demo cho **moonxGetQuote** với các loại path khác nhau:
```javascript
// Simple direct swap
{ path: [ETH, USDC], amountIn: "0.1 ETH", v4Data: "0x" }

// Multihop swap  
{ path: [ETH, USDC, DAI], amountIn: "0.1 ETH", v4Data: "0x" }

// V4 với PathKey data
{ path: [ETH, USDC], amountIn: "0.1 ETH", v4Data: encodedPathKeys }
```

### 2. `demo-swap.js` 
Demo full workflow **moonxGetQuote → moonxExec**:
- ETH → USDC (Buy direction)
- USDC → ETH (Sell direction)  
- ETH → USDC → DAI (Multihop)

### 3. `demo-new-workflow.js`
Demo tổng hợp với usage examples và best practices.

## 🚀 Quick Start

### 1. Cấu hình
Cập nhật `CONFIG` trong mỗi file:
```javascript
const CONFIG = {
    DIAMOND_ADDRESS: "0xYourDiamondAddress",
    RPC_URL: "http://localhost:8545",
    PRIVATE_KEY: "0xYourPrivateKey",
    
    // Token addresses  
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0xYourWETHAddress",
    USDC: "0xYourUSDCAddress", 
    DAI: "0xYourDAIAddress",
};
```

### 2. Chạy Demo

#### Quote Only:
```bash
node demo-get-quote.js
```

#### Full Swap:
```bash
node demo-swap.js
```

#### Complete Workflow:
```bash
node demo-new-workflow.js  
```

## 🔧 New Workflow

### Step 1: Get Quote
```javascript
const quoteParams = {
    path: [ETH_ADDRESS, USDC_ADDRESS],        // Token path
    amountIn: ethers.parseEther("0.1"),       // Input amount
    v4Data: "0x"                              // Optional V4 PathKey data
};

// Encode QuoteParams into args[0]
const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
    [quoteParams]
);

const quoteResult = await contract.moonxGetQuote([encodedParams]);
```

**Quote Result:**
```javascript
{
    amountOut: "150.123456",      // Expected output amount
    version: 3,                   // Best version (2=V2, 3=V3, 4=V4)
    fee: 3000,                    // Optimal fee tier
    path: [ETH, USDC],           // Optimized path (có thể khác input path)
    liquidity: "1000000",        // Pool liquidity
    hooks: "0x0000...",          // V4 hooks address
    routeData: "0x..."           // Additional route data
}
```

### Step 2: Execute Swap
```javascript
// Sử dụng data từ quote result
const swapRoute = {
    tokenIn: quoteParams.path[0],
    tokenOut: quoteParams.path[quoteParams.path.length - 1],
    path: quoteResult.path,           // ✨ Optimized path from quote
    version: quoteResult.version,     // ✨ Best version from quote  
    poolFee: quoteResult.fee,         // ✨ Optimal fee from quote
    routeData: quoteResult.routeData, // ✨ Route data from quote
    hookData: "0x"
};

// moonxExec arguments (structure không đổi)
const args = [
    encode("SwapRoute", swapRoute),   // args[0] - Route with optimized data
    encode("address", recipient),     // args[1] - Recipient
    encode("RefConfig", refConfig),   // args[2] - Referral config
    encode("uint256", amountIn),      // args[3] - Input amount
    encode("uint256", expectedOut),   // args[4] - Expected output từ quote
    encode("uint256", slippage),      // args[5] - Slippage tolerance
    encode("bool", useProvided),      // args[6] - Use provided quote
    encode("PlatformConfig", platform), // args[7] - Platform config
    encode("SwapMetadata", metadata)  // args[8] - App metadata (SwapCache tự tạo internally)
];

const actualAmountOut = await contract.moonxExec(args);
```

## 💡 Key Features

### ✅ Auto Version Selection
```javascript
// moonxGetQuote tự động chọn version tốt nhất
const quoteParams = { path: [ETH, USDC], amountIn: ethers.parseEther("1"), v4Data: "0x" };
const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address[] path, uint256 amountIn, bytes v4Data)"], [quoteParams]
);
const quote = await contract.moonxGetQuote([encodedParams]);
// quote.version = 2, 3, hoặc 4 (best option)
```

### ✅ Multihop Support  
```javascript
// V2/V3 Multihop
const multihopParams = { path: [ETH, USDC, DAI, USDT], amountIn: ethers.parseEther("1"), v4Data: "0x" };
const encodedMultihop = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address[] path, uint256 amountIn, bytes v4Data)"], [multihopParams]
);
const multihopQuote = await contract.moonxGetQuote([encodedMultihop]);

// V4 Multihop với PathKey
const v4Params = { path: [ETH, USDT], amountIn: ethers.parseEther("1"), v4Data: encodedPathKeyArray };
const encodedV4 = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address[] path, uint256 amountIn, bytes v4Data)"], [v4Params]
);
const v4MultihopQuote = await contract.moonxGetQuote([encodedV4]);
```

### ✅ Path Optimization
```javascript
// Input path
const inputPath = [ETH, DAI];
const quoteParams = { path: inputPath, amountIn: ethers.parseEther("1"), v4Data: "0x" };
const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address[] path, uint256 amountIn, bytes v4Data)"], [quoteParams]
);

// moonxGetQuote có thể return optimized path
const quote = await contract.moonxGetQuote([encodedParams]);
// quote.path = [ETH, USDC, DAI]  ← Better intermediate route

// moonxExec sẽ dùng optimized path
const swapRoute = {
    path: quote.path,  // ← Optimized path, not input path
    // ...
};
```

## 🔍 Path Examples

### Direct Swaps
```javascript
[ETH, USDC]        // ETH → USDC direct
[USDC, DAI]        // USDC → DAI direct  
[DAI, USDT]        // DAI → USDT direct
```

### Multihop Swaps
```javascript
[ETH, USDC, DAI]         // ETH → USDC → DAI
[ETH, USDC, DAI, USDT]   // ETH → USDC → DAI → USDT
[USDC, WETH, DAI]        // USDC → WETH → DAI
```

### V4 Custom Routing
```javascript
const pathKeys = [
    {
        intermediateCurrency: Currency.wrap(USDC_ADDRESS),
        fee: 3000,
        tickSpacing: 60,
        hooks: IHooks.wrap(HOOKS_ADDRESS),
        hookData: "0x"
    },
    // ... more PathKeys for multihop
];

const quoteParams = {
    path: [ETH, DAI],
    amountIn: ethers.parseEther("1"),
    v4Data: abi.encode("PathKey[]", pathKeys)
};
```

## 🎯 Benefits

1. **Simplified Interface**: Chỉ cần `path + amountIn`
2. **Auto Optimization**: Best version + route tự động
3. **Multihop Ready**: Support path với nhiều tokens
4. **V4 Compatible**: Hỗ trợ PathKey cho custom routing
5. **Backward Compatible**: moonxExec không đổi
6. **Gas Efficient**: Optimized routing giảm gas cost

## 🛠️ Customization

### Custom V4 PathKeys
```javascript
// Tạo PathKey cho V4 custom routing
const pathKey = {
    intermediateCurrency: Currency.wrap(INTERMEDIATE_TOKEN),
    fee: 3000,                    // Fee tier
    tickSpacing: 60,              // Tick spacing
    hooks: IHooks.wrap(HOOKS_ADDRESS),  // Custom hooks
    hookData: customHookData      // Hook-specific data  
};

const pathKeys = [pathKey1, pathKey2]; // Multihop PathKeys
const v4Data = abi.encode("PathKey[]", pathKeys);
```

### Custom Slippage & MEV Protection
```javascript
const platformConfig = {
    gasOptimization: true,
    mevProtection: true,    // Enable MEV protection
    routeType: 0           // 0=best_price, 1=fastest, 2=safest
};
```

## 🚨 Important Notes

1. **Token Addresses**: Cập nhật addresses thật trong CONFIG
2. **Network**: Đảm bảo RPC_URL đúng network
3. **Approvals**: ERC20 tokens cần approval trước khi swap
4. **Gas Limits**: Set gas limit phù hợp cho multihop swaps
5. **Slippage**: Adjust slippage tolerance based on market conditions
6. **Nonce Management**: Demo automatically handles nonce conflicts and retries

## ⚡ V4 Architecture Notes

**V4 khác biệt hoàn toàn với V2/V3:**

### Data Priority:
- **V2/V3**: Dựa vào `path[]` array để routing
- **V4**: Dựa vào `routeData` chứa PathKey/PoolKey với đầy đủ pool config

### V4 RouteData Contains:
```javascript
// Single Hop: PoolKey + direction
routeData = abi.encode(PoolKey{
    currency0, currency1, fee, tickSpacing, hooks
}, zeroForOne)

// Multihop: PathKey array
routeData = abi.encode(PathKey[]{
    {intermediateCurrency, fee, tickSpacing, hooks, hookData},
    {intermediateCurrency, fee, tickSpacing, hooks, hookData}
})
```

### Why V4 Needs More Than Simple Path:
- **Custom Hooks**: Mỗi pool có thể có custom logic
- **Variable Fees**: Fee không cố định như V3
- **Tick Spacing**: Pool configuration khác nhau
- **Hook Data**: Additional data cho hook execution

**⚠️ Lưu ý**: `path[]` trong V4 chỉ để display, execution dựa vào `routeData`!

## 🔢 Nonce Management

Demo includes automatic nonce management to prevent transaction conflicts:

### Features:
- **Auto Nonce Detection**: Gets fresh nonce for each transaction
- **Conflict Handling**: Detects "nonce already used" errors
- **Automatic Retry**: Retries failed transactions with fresh nonce
- **Network Settling**: Waits between transactions to prevent conflicts

### Error Handling:
```javascript
// Automatic retry on nonce conflicts
if (error.message.includes("nonce") || error.message.includes("already been used")) {
    console.log("🔄 Nonce conflict detected. Getting fresh nonce and retrying...");
    await delay(2000); // Wait for network to settle
    const freshNonce = await getNonceWithRetry(signer);
    const retryTx = await contract.moonxExec(args, { value, nonce: freshNonce });
}
```

### Transaction Flow:
```
🔢 Initial account nonce: 45
   🔢 Current nonce: 45
   ⏳ Token Approval: 0x1234...
   🔢 Transaction nonce: 45
   ✅ Token Approval confirmed in block 12345

   🔢 Getting nonce for swap execution...
   🔢 Current nonce: 46
   ⏳ Swap Execution: 0x5678...
   🔢 Transaction nonce: 46
   ✅ Swap Execution confirmed in block 12346

🔢 Final account nonce: 47
📊 Total transactions executed: 2
```

## 🛠️ V4 PathKey Builder Functions

Demos include smart V4 data builders to create proper PathKey arrays:

### buildSmartV4Data(path)
```javascript
// Automatically builds V4 PathKey data with smart configs
const v4Data = buildSmartV4Data([ETH_ADDRESS, USDC_ADDRESS]);

// Uses pair-specific configurations:
// ETH-USDC: fee=3000 (0.3%), tickSpacing=60
// ETH-DAI:  fee=500 (0.05%), tickSpacing=10  
// USDC-DAI: fee=100 (0.01%), tickSpacing=1
```

### buildV4PathKeyData(path, customConfig)
```javascript
// Build with custom configuration
const customV4Data = buildV4PathKeyData([ETH_ADDRESS, USDC_ADDRESS], {
    fee: 2500,           // Custom fee tier
    tickSpacing: 50,     // Custom tick spacing
    hooks: "0x1234...",  // Hook contract address
    hookData: "0x..."    // Hook-specific data
});
```

### PathKey Structure:
```javascript
// Each PathKey contains:
{
    intermediateCurrency: "0x...",  // Target token address
    fee: 3000,                      // Pool fee (not limited to V3 tiers)
    tickSpacing: 60,                // Pool tick spacing configuration  
    hooks: "0x...",                 // Hook contract address
    hookData: "0x..."               // Hook execution data
}
```

### Demo Integration:
```javascript
// All demo files now use smart V4 builders:
const quoteParams = {
    path: [CONFIG.ETH, CONFIG.USDC],
    amountIn: ethers.parseEther("0.1"),
    v4Data: buildSmartV4Data([CONFIG.ETH, CONFIG.USDC]) // ✅ Smart builder
    // Not: v4Data: "0x" ❌ Empty/dummy data
};
```

## 📞 Support

Nếu có issues với demo:
1. Check token addresses trong CONFIG
2. Verify contract deployment  
3. Check network connection
4. Review console errors for debugging
