# Test Calldata Building Fix

## 🎯 **Objective:**
Test that SwapService builds correct calldata according to MoonX-Swap-Guide.md specifications.

## 🚨 **Issues Fixed:**

### **1. Quote Result Type Mismatch:**
```javascript
// ❌ BEFORE: String/BigInt mismatch
moonxQuote: {
  amountOut: moonxQuote.amountOut.toString(), // String
  // ...
}

// In buildSwapCalldata:
args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [params.moonxQuote.amountOut])); // Expected BigInt

// ✅ AFTER: Handle both types
const expectedAmountOut = typeof params.moonxQuote.amountOut === 'string' 
  ? params.moonxQuote.amountOut 
  : params.moonxQuote.amountOut.toString();
args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [expectedAmountOut]));
```

### **2. SwapRoute Building Logic:**
```javascript
// ❌ BEFORE: Complex if-else chains
if (version === 2) {
  swapRoute = { tokenIn, tokenOut, version, poolFee: 0, path: [...], routeData: "0x", hookData: "0x" };
} else if (version === 3) {
  swapRoute = { tokenIn, tokenOut, version, poolFee: fee, path: [], routeData: "0x", hookData: "0x" };
} else if (version === 4) {
  // ...
}

// ✅ AFTER: Clean version-specific logic
const swapRoute = {
  tokenIn: fromTokenAddress,
  tokenOut: toTokenAddress,
  version: version,
  poolFee: version === 2 ? 0 : (params.moonxQuote.fee || 3000), // V2 has no poolFee
  path: version === 2 ? (params.moonxQuote.path || []) : [], // V2 uses path, V3/V4 don't
  routeData: version === 4 ? (params.moonxQuote.routeData || "0x") : "0x", // Only V4 uses routeData
  hookData: "0x" // Future extensibility
};
```

### **3. Added Validation & Logging:**
```javascript
// ✅ NEW: Input validation
if (!params.moonxQuote || !params.moonxQuote.version) {
  throw new Error('Invalid moonxQuote: missing version');
}
if (!params.moonxQuote.amountOut || params.moonxQuote.amountOut === '0') {
  throw new Error('Invalid moonxQuote: missing or zero amountOut');
}

// ✅ NEW: Comprehensive logging
console.log('🔧 Building calldata with params:', {
  fromToken: params.fromTokenAddress,
  toToken: params.toTokenAddress,
  fromAmount: params.fromAmount,
  slippage: params.slippage,
  quoteVersion: params.moonxQuote.version,
  quoteFee: params.moonxQuote.fee,
  quoteAmountOut: params.moonxQuote.amountOut
});

console.log('🔧 SwapRoute built:', {
  version,
  poolFee: swapRoute.poolFee,
  pathLength: swapRoute.path.length,
  routeDataLength: swapRoute.routeData.length,
  hasRouteData: swapRoute.routeData !== "0x"
});

console.log('✅ Calldata built successfully:', {
  calldataLength: calldata.length,
  argsCount: args.length,
  functionName: 'moonxExec',
  version: version,
  slippageBP: slippageBasisPoints
});
```

## 🔧 **Calldata Structure (9 Args):**

According to MoonX-Swap-Guide.md:

```javascript
args[0]: SwapRoute        // Route information từ quote result
args[1]: address          // Recipient - người nhận token
args[2]: RefConfiguration // Referral config - REQUIRED (zero address + 0 fee)
args[3]: uint256          // Input amount - số token gửi vào
args[4]: uint256          // Expected output amount từ quote
args[5]: uint256          // Slippage tolerance (basis points: 300 = 3%)
args[6]: bool             // Use provided quote (true) hay fetch fresh (false)
args[7]: PlatformConfig   // Platform settings: gas optimization, MEV protection
args[8]: SwapMetadata     // Metadata cho integrators: app name, version, etc.
```

## 🧪 **Test Steps:**

### **Step 1: Start Backend**
```bash
cd swap-backend
npm run dev
```

### **Step 2: Test Quote API**
```bash
curl -X POST http://localhost:3001/api/swap/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromTokenAddress": "0x0000000000000000000000000000000000000000",
    "toTokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "100000000000000000",
    "slippage": 3,
    "chainId": 8453,
    "userAddress": "0x1234567890123456789012345678901234567890"
  }'
```

### **Step 3: Check Console Logs**
Look for these log patterns:

```javascript
// Quote building logs:
🔧 Building calldata with params: {
  fromToken: '0x0000000000000000000000000000000000000000',
  toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  fromAmount: '100000000000000000',
  slippage: 3,
  quoteVersion: 3,
  quoteFee: 3000,
  quoteAmountOut: '95423041'
}

// SwapRoute building logs:
🔧 SwapRoute built: {
  version: 3,
  poolFee: 3000,
  pathLength: 0,
  routeDataLength: 2,
  hasRouteData: false
}

// Final calldata logs:
✅ Calldata built successfully: {
  calldataLength: 1234,
  argsCount: 9,
  functionName: 'moonxExec',
  version: 3,
  slippageBP: 300
}
```

### **Step 4: Verify Calldata Structure**
The response should include:

```json
{
  "fromToken": { ... },
  "toToken": { ... },
  "fromAmount": "0.1",
  "toAmount": "95.423041",
  "calldata": "0x...", // Should be long hex string
  "moonxQuote": {
    "amountOut": "95423041",
    "version": 3,
    "fee": 3000,
    "path": [],
    "routeData": "0x"
  }
}
```

### **Step 5: Test Different Versions**
Test with different DEX versions to verify SwapRoute building:

- **V2 Test:** Should have `path` array, `poolFee: 0`
- **V3 Test:** Should have empty `path`, `poolFee: 3000`
- **V4 Test:** Should have `routeData` if available

### **Step 6: Test Error Handling**
Test with invalid inputs:

```bash
# Missing quote version
curl -X POST http://localhost:3001/api/swap/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromTokenAddress": "0x0000000000000000000000000000000000000000",
    "toTokenAddress": "0xInvalidAddress",
    "amount": "100000000000000000",
    "slippage": 3,
    "chainId": 8453,
    "userAddress": "0x1234567890123456789012345678901234567890"
  }'
```

Should see error logs:
```javascript
❌ Invalid moonxQuote: missing version
// or
❌ Invalid moonxQuote: missing or zero amountOut
```

## ✅ **Expected Results:**

### **✅ Correct Calldata Structure:**
- **9 args total** (not more, not less)
- **Proper encoding** for each arg type
- **Version-specific** SwapRoute building
- **String/BigInt handling** for amountOut

### **✅ Comprehensive Logging:**
- **Input validation** logs
- **SwapRoute building** logs  
- **Final calldata** logs
- **Error handling** logs

### **✅ Guide Compliance:**
- **Function name:** `moonxExec` ✅
- **Args structure:** 9 structured args ✅
- **SwapRoute fields:** tokenIn, tokenOut, version, poolFee, path, routeData, hookData ✅
- **RefConfiguration:** Always included (zero address + 0 fee) ✅
- **PlatformConfig:** gasOptimization, mevProtection, routeType ✅
- **SwapMetadata:** integratorId, userData, nonce, signature, isPermit2, aggregatorVersion ✅

### **✅ Version-Specific Logic:**
- **V2:** `poolFee: 0`, uses `path` array, `routeData: "0x"`
- **V3:** `poolFee: fee`, empty `path`, `routeData: "0x"`
- **V4:** `poolFee: fee`, empty `path`, uses `routeData` from quote

## 🚨 **Failure Cases:**

### **❌ If calldata is malformed:**
- Check args count (should be exactly 9)
- Check encoding types match Guide specifications
- Verify SwapRoute struct fields

### **❌ If version-specific logic fails:**
- V2 should have path array, not empty
- V3/V4 should have poolFee, not 0
- V4 should use routeData if available

### **❌ If type conversion fails:**
- Check amountOut handling (string vs BigInt)
- Verify address normalization
- Check slippage basis points calculation

## 📋 **Files Changed:**
- `swap-backend/src/services/SwapService.ts` - Fixed calldata building logic

The calldata building now fully complies with **MoonX-Swap-Guide.md** specifications with proper validation, logging, and error handling!
