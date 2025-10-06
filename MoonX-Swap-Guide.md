# Hướng dẫn tích hợp MoonX Swap - Version 1.0

## 1. Thông tin cơ bản

**Contract Address:** `0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630`

**ABI cần thiết:**
```javascript
const MOONX_ABI = [
    // Get quote from all Uniswap versions (V2, V3, V4) automatically
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))",
    
    // Execute swap with structured args
    "function moonxExec(bytes[] calldata args) external payable returns (uint256)",
    
    // Platform fee management
    "function getPlatformFee() external view returns (uint256)"
];
```

## 2. Cách sử dụng

### Bước 1: Kết nối Contract
```javascript
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider("YOUR_RPC_URL");
const signer = new ethers.Wallet("YOUR_PRIVATE_KEY", provider);
const moonxContract = new ethers.Contract(
    "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630", 
    MOONX_ABI, 
    signer
);
```

### Bước 2: Lấy quote giá (Auto-discovery across V2, V3, V4)

**Function signature thật:**
```solidity
function moonxGetQuote(bytes[] calldata args) external returns (
    tuple(
        uint256 amountOut,    // Expected output amount
        uint128 liquidity,    // Pool liquidity
        uint24 fee,          // Fee tier (V3/V4)
        uint8 version,       // Best version found (2, 3, or 4)
        address hooks,       // Hook address (V4 only)
        address[] path,      // Token path (V2 multihop)
        bytes routeData      // Route-specific data (V4: PathKey/PoolKey)
    )
)
```

**Input Structure:**
```javascript
// QuoteParams struct (encoded into args[0])
const quoteParams = {
    path: [tokenIn, tokenOut, ...],  // Token swap path - can be multihop [A,B,C]
    amountIn: "1000000000000000000",  // Input amount in wei (string recommended for big numbers)
    v4Data: "0x..."                  // Optional V4 PathKey data - "0x" để auto-detect, hoặc custom PathKey[]
};
```

**Giải thích QuoteParams:**
- `path`: Mảng địa chỉ tokens. Simple swap: `[A,B]`. Multihop: `[A,B,C]` = A→B→C
- `amountIn`: Số lượng token input (wei units). VD: "1000000000000000000" = 1 ETH
- `v4Data`: 
  - `"0x"` = Để contract tự động tìm best route V4
  - Custom PathKey data = Chỉ định cụ thể pool V4 và config

**Cách gọi:**
```javascript
async function getQuote(tokenIn, tokenOut, amountIn, v4PathKeyData = "0x") {
    // Prepare quote parameters
    const quoteParams = {
        path: [tokenIn, tokenOut],
        amountIn: amountIn,
        v4Data: v4PathKeyData  // Optional V4 PathKey data
    };
    
    // Encode into args[0]
    const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
        [quoteParams]
    );
    
    // Call moonxGetQuote (auto-scans V2, V3, V4)
    const quote = await moonxContract.moonxGetQuote.staticCall([encodedParams]);
    return quote;
}
```

**Quote Result:**
```javascript
const quote = await getQuote(
    "0x0000000000000000000000000000000000000000", // ETH
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "100000000000000000" // 0.1 ETH
);

console.log({
    amountOut: quote.amountOut.toString(),    // "95423041" (expected USDC)
    version: Number(quote.version),           // 3 (V3 is best)
    fee: Number(quote.fee),                   // 3000 (0.3% fee)
    liquidity: quote.liquidity.toString(),    // Pool liquidity
    path: quote.path,                         // [] for simple swap, [A,B,C] for multihop
    routeData: quote.routeData               // V4-specific data if version = 4
});
```

**Giải thích QuoteResult:**
- `amountOut`: Số token nhận được (wei). VD: "95423041" USDC = ~95.42 USDC
- `version`: Version tốt nhất được tìm thấy (2=V2, 3=V3, 4=V4, 0=không tìm thấy route)
- `fee`: Fee tier của pool tốt nhất (3000 = 0.3%, 500 = 0.05%, 10000 = 1%)
- `liquidity`: Tổng liquidity của pool (dùng để estimate slippage)
- `hooks`: Địa chỉ hooks contract (chỉ V4, V2/V3 = zero address)
- `path`: 
  - V2 multihop: `[A,B,C]` = full path
  - V3/V4 simple: `[]` = empty (chỉ tokenIn→tokenOut)
- `routeData`: 
  - V4: Encoded PoolKey hoặc PathKey data để execute
  - V2/V3: `"0x"` = empty

### Bước 3: V4 PathKey Data (Tùy chọn)

**Nếu muốn chỉ định routing V4 cụ thể:**
```javascript
// Helper function to build V4 PathKey data
function buildV4PathKeyData(path) {
    if (path.length < 2) return "0x";
    
    const pathKeys = [];
    for (let i = 0; i < path.length - 1; i++) {
        const token0 = BigInt(path[i]) < BigInt(path[i + 1]) ? path[i] : path[i + 1];
        const token1 = BigInt(path[i]) < BigInt(path[i + 1]) ? path[i + 1] : path[i];
        
        pathKeys.push([
            token0,           // currency0 (lower address)
            token1,           // currency1 (higher address)  
            3000,            // fee tier (500/3000/10000)
            60,              // tickSpacing (depends on fee)
            "0x0000000000000000000000000000000000000000", // hooks contract
            "0x"             // hookData (future use)
        ]);
    }
    
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,address,bytes)[]"],
        [pathKeys]
    );
}

// Get quote với V4 PathKey data
const v4Data = buildV4PathKeyData([tokenIn, tokenOut]);
const quoteWithV4 = await getQuote(tokenIn, tokenOut, amountIn, v4Data);
```

**Giải thích V4 PathKey fields:**
- `currency0/currency1`: Tokens được sort theo address (lower first)
- `fee`: Fee tier của pool V4 (500=0.05%, 3000=0.3%, 10000=1%)  
- `tickSpacing`: Tick spacing (60 cho fee=3000, 10 cho fee=500, 200 cho fee=10000)
- `hooks`: Hook contract address (zero = no hooks, custom address = có hooks)
- `hookData`: Data truyền cho hooks (thường là "0x" empty)

**Khi nào dùng custom V4 data:**
- `v4Data = "0x"`: Auto-detect best V4 pool (recommended)
- `v4Data = custom`: Chỉ định cụ thể pool V4 (advanced usage)

### Bước 4: Thực hiện swap

**Function signature thật:**
```solidity
function moonxExec(bytes[] calldata args) external payable nonReentrant returns (uint256)
```

**Args structure (9 elements):**
```javascript
args[0]: SwapRoute        // Route information từ quote result
args[1]: address          // Recipient - người nhận token (optional, defaults to msg.sender)
args[2]: RefConfiguration // Referral config - REQUIRED (có thể zero address + 0 fee)
args[3]: uint256          // Input amount - số token gửi vào
args[4]: uint256          // Expected output amount từ quote
args[5]: uint256          // Slippage tolerance (basis points: 300 = 3%)
args[6]: bool             // Use provided quote (true) hay fetch fresh (false)
args[7]: PlatformConfig   // Platform settings: gas optimization, MEV protection
args[8]: SwapMetadata     // Metadata cho integrators: app name, version, etc.
```

**Giải thích từng args:**
- **args[0] - SwapRoute**: Route info từ quote (version, fee, path, routeData)
- **args[1] - Recipient**: Địa chỉ nhận token cuối. Empty = msg.sender nhận
- **args[2] - RefConfiguration**: Referral setup. LUÔN PHẢI TRUYỀN, zero address nếu không có ref
- **args[3] - AmountIn**: Số token input gửi vào (wei units) 
- **args[4] - AmountOut**: Expected output từ quote (để validate)
- **args[5] - Slippage**: Tolerance cho price impact (300 = 3% max slippage)
- **args[6] - UseProvidedQuote**: `true` = dùng quote có sẵn, `false` = fetch fresh quote
- **args[7] - PlatformConfig**: Settings cho gas optimization & MEV protection
- **args[8] - SwapMetadata**: App identification & advanced features

**Struct definitions (từ IMoonXTypes.sol):**

```javascript
// SwapRoute struct - Route information
const swapRoute = {
    tokenIn: "0x...",          // Input token address
    tokenOut: "0x...",         // Output token address
    version: 3,                // Version from quote (2=V2, 3=V3, 4=V4)
    poolFee: 3000,            // Fee tier from quote (V3/V4: 500/3000/10000)
    path: [...],              // Token path (V2 multihop: [A,B,C], V3/V4: [])
    routeData: "0x...",       // Version-specific data (V4: PoolKey, V2/V3: empty)
    hookData: "0x"            // Hook data cho V4 (future extensibility)
};
```

**Giải thích SwapRoute:**
- `tokenIn/tokenOut`: Input/output token addresses
- `version`: DEX version tốt nhất từ quote (2/3/4)
- `poolFee`: Fee tier của pool tốt nhất (basis points)
- `path`: V2 dùng multihop path, V3/V4 để empty []
- `routeData`: V4 cần PoolKey/PathKey encoded data, V2/V3 để "0x"
- `hookData`: V4 hook data (hiện tại để "0x")

```javascript
// RefConfiguration struct - LUÔN PHẢI TRUYỀN
const refConfig = {
    refAddress: "0x0000000000000000000000000000000000000000", // Referral address (zero = no referral)
    refFee: 0                 // Referral fee in basis points (0 = no fee)
};
```

**Giải thích RefConfiguration:**
- `refAddress`: Địa chỉ nhận referral fee. Zero address = không có referral
- `refFee`: Fee % cho referral (basis points: 50 = 0.5%)

```javascript
// PlatformConfig struct - Platform optimization
const platformConfig = {
    gasOptimization: true,    // Enable gas savings optimizations
    mevProtection: false,     // Enable MEV (flashbot) protection
    routeType: 0             // Route preference: 0=best_price, 1=fastest, 2=safest
};
```

**Giải thích PlatformConfig:**
- `gasOptimization`: `true` = optimize gas usage, `false` = normal execution
- `mevProtection`: `true` = anti-MEV protection, `false` = normal execution
- `routeType`: Route optimization priority (0=giá tốt nhất, 1=nhanh nhất, 2=an toàn nhất)

```javascript
// SwapMetadata struct - Integrator identification
const metadata = {
    integratorId: "your-app-name",    // App/integrator identifier string
    userData: "0x",                   // Custom app data (optional)
    nonce: 0,                        // User nonce for replay protection
    signature: "0x",                 // Permit signature (optional)
    isPermit2: false,               // Use Permit2 standard (optional)
    aggregatorVersion: 2            // MoonX version tracking
};
```

**Giải thích SwapMetadata:**
- `integratorId`: Tên app của bạn (tracking & analytics)
- `userData`: Custom data cho app logic (optional)
- `nonce`: User nonce để prevent replay attacks
- `signature`: Permit signature cho gasless approvals (optional)
- `isPermit2`: Enable Permit2 approval standard
- `aggregatorVersion`: Version tracking cho MoonX system

### Bước 5: Complete Swap Function

```javascript
async function executeSwap(tokenIn, tokenOut, amountIn, slippage = 300, recipient = null) {
    // Step 1: Get quote
    const quote = await getQuote(tokenIn, tokenOut, amountIn);
    
    if (Number(quote.version) === 0) {
        throw new Error("Không tìm thấy route hợp lệ cho cặp token này");
    }
    
    console.log(`Best route found: V${quote.version}, Expected output: ${quote.amountOut}`);
    
    // Step 2: Build SwapRoute from quote result
    const swapRoute = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        version: Number(quote.version),
        poolFee: Number(quote.fee) || 0,
        path: quote.path || [],
        routeData: quote.routeData || "0x",
        hookData: "0x"
    };
    
    // Step 3: Prepare args
    const args = [
        // args[0]: SwapRoute
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,uint8,uint24,address[],bytes,bytes)"],
            [[
                swapRoute.tokenIn,
                swapRoute.tokenOut,
                swapRoute.version,
                swapRoute.poolFee,
                swapRoute.path,
                swapRoute.routeData,
                swapRoute.hookData
            ]]
        ),
        
        // args[1]: recipient (optional)
        recipient ? 
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [recipient]) : 
            "0x", // Empty = defaults to msg.sender
        
        // args[2]: RefConfiguration - LUÔN PHẢI TRUYỀN
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,uint256)"],
            [["0x0000000000000000000000000000000000000000", 0]] // No referral
        ),
        
        // args[3]: amountIn
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn]),
        
        // args[4]: amountOut (from quote)
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [quote.amountOut]),
        
        // args[5]: slippage (basis points)
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [slippage]),
        
        // args[6]: useProvidedQuote
        ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]),
        
        // args[7]: PlatformConfig
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(bool,bool,uint8)"],
            [[true, false, 0]] // gasOptimization=true, mevProtection=false, routeType=0
        ),
        
        // args[8]: SwapMetadata
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(string,bytes,uint256,bytes,bool,uint8)"],
            [["moonx-guide", "0x", 0, "0x", false, 2]]
        )
    ];
    
    // Step 4: Execute swap
    const value = tokenIn === "0x0000000000000000000000000000000000000000" ? amountIn : 0;
    const tx = await moonxContract.moonxExec(args, { value });
    
    return await tx.wait();
}
```

## 3. Ví dụ cụ thể

### Mua token bằng ETH
```javascript
// ETH → USDC swap
const tokenIn = "0x0000000000000000000000000000000000000000"; // ETH
const tokenOut = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC Base
const amountIn = "100000000000000000"; // 0.1 ETH
const slippage = 300; // 3%

const receipt = await executeSwap(tokenIn, tokenOut, amountIn, slippage);
console.log("Swap thành công:", receipt.transactionHash);
```

### Bán token lấy ETH
```javascript
// USDC → ETH swap
const tokenIn = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC
const tokenOut = "0x0000000000000000000000000000000000000000"; // ETH
const amountIn = "1000000"; // 1 USDC (6 decimals)
const slippage = 500; // 5%

// Approve token trước khi swap
const tokenContract = new ethers.Contract(tokenIn, [
    "function approve(address spender, uint256 amount) returns (bool)"
], signer);
await tokenContract.approve("0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630", amountIn);

const receipt = await executeSwap(tokenIn, tokenOut, amountIn, slippage);
console.log("Swap thành công:", receipt.transactionHash);
```

### Swap với Referral
```javascript
async function executeSwapWithReferral(tokenIn, tokenOut, amountIn, refAddress, refFee) {
    const quote = await getQuote(tokenIn, tokenOut, amountIn);
    
    // ... build swapRoute từ quote ...
    
    const args = [
        // ... args[0], args[1] ...
        
        // args[2]: RefConfiguration with referral
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,uint256)"],
            [[refAddress, refFee]] // refFee in basis points (50 = 0.5%)
        ),
        
        // ... rest of args ...
    ];
    
    const value = tokenIn === "0x0000000000000000000000000000000000000000" ? amountIn : 0;
    const tx = await moonxContract.moonxExec(args, { value });
    return await tx.wait();
}

// Ví dụ: Swap với 0.5% referral fee
await executeSwapWithReferral(
    tokenIn,
    tokenOut, 
    amountIn,
    "0x1234567890123456789012345678901234567890", // Referral address
    50 // 0.5% = 50 basis points
);
```

## 4. Lưu ý quan trọng

## 5. Parameter Reference & Best Practices

### 🔧 Common Parameter Values

**Slippage (basis points):**
- Conservative: `100` (1%)
- Normal: `300` (3%) 
- High volatility: `500-1000` (5-10%)
- Maximum allowed: `5000` (50%)

**Fee Tiers (V3/V4):**
- Stablecoins: `100` (0.01%) or `500` (0.05%)
- Standard pairs: `3000` (0.3%)
- Exotic pairs: `10000` (1%)

**RouteType priorities:**
- `0`: Best price (recommended)
- `1`: Fastest execution
- `2`: Safest/most liquid route

**Referral Fee (basis points):**
- Typical range: `10-100` (0.1% - 1%)
- Maximum allowed: `100` (1%)
- No referral: `0`

### 🔥 Critical Requirements:

1. **ETH address:** LUÔN dùng `0x0000000000000000000000000000000000000000` cho ETH
2. **Quote workflow:** `moonxGetQuote` → build SwapRoute → `moonxExec`
3. **Quote data binding:** TẤT CẢ SwapRoute fields phải từ quote result
4. **RefConfiguration:** args[2] LUÔN REQUIRED (zero address + 0 fee nếu không có referral)
5. **Version-specific data:** 
   - V2: `quote.path` → `swapRoute.path`
   - V3: `quote.fee` → `swapRoute.poolFee` 
   - V4: `quote.routeData` → `swapRoute.routeData`
6. **Token approval:** ERC20 tokens PHẢI approve contract trước khi swap
7. **Amount units:** Tất cả amounts tính bằng wei (use ethers.parseEther/parseUnits)

### 📋 Quick Reference - Struct Fields

| Struct | Field | Type | Purpose | Example/Default |
|--------|-------|------|---------|----------------|
| **QuoteParams** | path | address[] | Token swap path | `[ETH, USDC]` |
| | amountIn | uint256 | Input amount (wei) | `"1000000000000000000"` |
| | v4Data | bytes | V4 PathKey data | `"0x"` (auto) or encoded |
| **QuoteResult** | amountOut | uint256 | Expected output (wei) | `"95423041"` |
| | version | uint8 | Best DEX version | `3` (V3) |
| | fee | uint24 | Pool fee tier | `3000` (0.3%) |
| | path | address[] | V2 multihop path | `[]` or `[A,B,C]` |
| | routeData | bytes | V4-specific data | `"0x"` or PoolKey |
| **SwapRoute** | tokenIn/Out | address | Input/output tokens | Token addresses |
| | version | uint8 | DEX version | From quote |
| | poolFee | uint24 | Fee tier | From quote |
| | path | address[] | Token path | From quote (V2) |
| | routeData | bytes | Route data | From quote (V4) |
| **RefConfiguration** | refAddress | address | Referral address | Zero or real address |
| | refFee | uint256 | Referral fee (bp) | `0` or `10-100` |
| **PlatformConfig** | gasOptimization | bool | Gas optimization | `true` (recommended) |
| | mevProtection | bool | MEV protection | `false` (normal) |
| | routeType | uint8 | Route priority | `0` (best price) |
| **SwapMetadata** | integratorId | string | App identifier | `"your-app-name"` |
| | userData | bytes | Custom app data | `"0x"` (optional) |
| | isPermit2 | bool | Use Permit2 | `false` (standard) |
| | aggregatorVersion | uint8 | MoonX version | `2` (current) |

### Function Changes vs Old Version:
- ✅ **Function name:** `moonxExec` (không phải `execMoonXSwap`)
- ✅ **Auto-discovery:** `moonxGetQuote` tự động scan V2/V3/V4  
- ✅ **Structured args:** 9 structured arguments thay vì simple params
- ✅ **Quote integration:** Swap data từ quote result, không manual config
- ✅ **ETH handling:** `0x000...000` address, không phải WETH

## 5. Debug và troubleshooting

```javascript
async function debugSwap(tokenIn, tokenOut, amountIn) {
    try {
        // 1. Test quote
        console.log("🔍 Getting quote...");
        const quote = await getQuote(tokenIn, tokenOut, amountIn);
        
        console.log("📊 Quote Result:", {
            version: Number(quote.version),
            amountOut: quote.amountOut.toString(),
            fee: Number(quote.fee),
            pathLength: quote.path.length,
            routeDataLength: quote.routeData.length
        });
        
        if (Number(quote.version) === 0) {
            throw new Error("❌ No valid route found");
        }
        
        // 2. Test swap
        console.log("⚡ Executing swap...");
        const receipt = await executeSwap(tokenIn, tokenOut, amountIn);
        console.log("✅ Swap success:", receipt.transactionHash);
        
    } catch (error) {
        console.error("💥 Swap failed:", error.message);
        
        // Common error patterns
        if (error.message.includes("InvalidPathLength")) {
            console.error("🔥 Lỗi: Path không hợp lệ từ quote");
        }
        if (error.message.includes("tuple")) {
            console.error("🔥 Lỗi: Struct encoding sai - check args format");
        }
    }
}
```

## 6. Error handling patterns

```javascript
try {
    const receipt = await executeSwap(tokenIn, tokenOut, amountIn);
} catch (error) {
    if (error.message.includes("nonce")) {
        // Retry với fresh nonce
        console.log("🔄 Retrying with fresh nonce...");
    } else if (error.data) {
        // Decode contract error
        console.log("Contract error:", error.data);
    }
    throw error;
}
```

---

## 7. Migration từ version cũ

### Breaking Changes:
1. **Quote structure:** `moonxGetQuote` return struct mới với `routeData`
2. **Args structure:** `moonxExec` args từ simple → structured (10 elements)  
3. **ETH handling:** Zero address thay vì WETH
4. **Required params:** RefConfiguration bắt buộc (có thể zero)

### Migration Steps:
1. Update function calls: `execMoonXSwap` → `moonxExec`
2. Update quote calls: encode `QuoteParams` vào `args[0]`
3. Update swap args: restructure thành 10 elements
4. Add referral config: args[2] bắt buộc
5. Use quote data: routing từ quote result

---