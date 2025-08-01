# Hướng dẫn tích hợp MoonX Swap

## 1. Thông tin cơ bản

**Contract Address:** `0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630`

**ABI cần thiết:**
```javascript
const MOONX_ABI = [
    "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))"
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

### Bước 2: Lấy quote giá
```javascript
async function getQuote(tokenIn, tokenOut, amountIn) {
    const quoteArgs = [
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]),
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]),
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn])
    ];
    
    const quote = await moonxContract.moonxGetQuote.staticCall(quoteArgs);
    
    // Quote result structure:
    // {
    //   amountOut: BigNumber,    // Số token sẽ nhận được  
    //   liquidity: BigNumber,    // Thông tin liquidity
    //   fee: Number,            // Fee cho V3 (nếu có)
    //   version: Number,        // Version của route (0,2,3,4)
    //   hooks: String,          // Hooks address (nếu có)
    //   path: Array,           // Path cho V2 (nếu có)
    //   routeData: String      // Route data cho V4 (đã encoded)
    // }
    
    return quote;
}
```

### Bước 3: Thực hiện swap

**Helper function cho referral data:**
```javascript
function buildRefData(refAddress = "0x0000000000000000000000000000000000000000", refFee = 0) {
    const refDataArray = [];
    if (refAddress !== "0x0000000000000000000000000000000000000000" && refFee > 0) {
        refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [refAddress]));
        refDataArray.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [refFee]));
    }
    return ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [refDataArray]);
}
```

**Function chính:**
```javascript
async function executeSwap(tokenIn, tokenOut, amountIn, slippage, recipient, refAddress, refFee) {
    // 1. Lấy quote trước - QUAN TRỌNG: Tất cả data cho swap đều lấy từ quote
    const quote = await getQuote(tokenIn, tokenOut, amountIn);
    
    if (Number(quote.version) === 0) {
        throw new Error("Không tìm thấy route hợp lệ cho cặp token này");
    }
    
    // 2. Chuẩn bị tham số - SỬ DỤNG DATA TỪ QUOTE
    const args = [];
    
    // args[0]: tokenIn
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenIn]));
    
    // args[1]: tokenOut  
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [tokenOut]));
    
    // args[2]: amountIn
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountIn]));
    
    // args[3]: slippage
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [slippage]));
    
    // args[4]: refData (referral data)
    args.push(buildRefData(refAddress, refFee));
    
    // args[5]: version (từ quote)
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [quote.version]));
    
    // args[6]: version-specific data (TỪ QUOTE RESULT)
    const version = Number(quote.version);
    if (version === 2) {
        // V2: sử dụng path từ quote
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [quote.path]));
    } else if (version === 3) {
        // V3: sử dụng fee từ quote
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [quote.fee]));
    } else if (version === 4) {
        // V4: sử dụng routeData từ quote (ĐÃ ENCODED)
        if (quote.routeData && quote.routeData !== "0x") {
            args.push(quote.routeData); // routeData đã được encoded sẵn
        } else {
            args.push("0x"); // Empty bytes nếu không có routeData
        }
    }
    
    // args[7]: recipient
    args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [recipient]));
    
    // 3. Thực hiện swap
    const value = tokenIn === "0x0000000000000000000000000000000000000000" ? amountIn : 0;
    const tx = await moonxContract.execMoonXSwap(args, { value });
    
    return await tx.wait();
}
```

## 3. Ví dụ cụ thể

### Mua token bằng ETH
```javascript
// Mua USDC bằng 0.1 ETH (không có referral)
const tokenIn = "0x0000000000000000000000000000000000000000"; // ETH
const tokenOut = "0x1f6e1d08368fd4d8b2250ab0600dd2cb7f643287"; // USDC
const amountIn = "100000000000000000"; // 0.1 ETH
const slippage = 300; // 3%
const recipient = signer.address;

const receipt = await executeSwap(tokenIn, tokenOut, amountIn, slippage, recipient);

// Hoặc với referral:
const refAddress = "0x1234567890123456789012345678901234567890"; // Referral address
const refFee = 50; // 0.5% referral fee
const receiptWithRef = await executeSwap(tokenIn, tokenOut, amountIn, slippage, recipient, refAddress, refFee);
```

### Bán token lấy ETH
```javascript
// Bán USDC lấy ETH (không có referral)
const tokenIn = "0x1f6e1d08368fd4d8b2250ab0600dd2cb7f643287"; // USDC
const tokenOut = "0x0000000000000000000000000000000000000000"; // ETH
const amountIn = "1000000"; // 1 USDC (6 decimals)
const slippage = 300; // 3%
const recipient = signer.address;

// Lưu ý: Cần approve token trước khi swap
const tokenContract = new ethers.Contract(tokenIn, [
    "function approve(address spender, uint256 amount) returns (bool)"
], signer);
await tokenContract.approve("0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630", amountIn);

const receipt = await executeSwap(tokenIn, tokenOut, amountIn, slippage, recipient);
```

## 4. Lưu ý quan trọng

1. **ETH address:** Sử dụng `0x0000000000000000000000000000000000000000` cho ETH
2. **Slippage:** Tính theo basis points (300 = 3%)
3. **Approve:** Cần approve token trước khi swap (trừ ETH)
4. **Gas limit:** Nên đặt cao (khoảng 500,000 - 1,000,000)
5. **RefData:** 
   - Không có referral: `refDataArray = []` (mảng rỗng)
   - Có referral: `refDataArray = [encoded_address, encoded_fee]`
   - RefAddress phải khác `0x0000...` và refFee > 0
6. **🔥 QUAN TRỌNG - Quote Result:** 
   - **LUÔN** lấy quote trước khi swap
   - **TẤT CẢ** version-specific data phải lấy từ quote result
   - **Version 4:** `routeData` từ quote đã được encoded, không encode thêm
   - **Version 2:** Sử dụng `path` từ quote
   - **Version 3:** Sử dụng `fee` từ quote
   - **Version 0:** Không có route hợp lệ, cần báo lỗi

## 5. Debug và kiểm tra Quote

```javascript
async function debugQuote(tokenIn, tokenOut, amountIn) {
    const quote = await getQuote(tokenIn, tokenOut, amountIn);
    
    console.log("📊 Quote Result:", {
        version: Number(quote.version),
        amountOut: quote.amountOut.toString(),
        fee: quote.fee ? Number(quote.fee) : "N/A",
        path: quote.path ? quote.path : "N/A",
        routeData: quote.routeData ? quote.routeData : "N/A"
    });
    
    if (Number(quote.version) === 0) {
        console.log("❌ Không tìm thấy route hợp lệ cho cặp token này");
        return null;
    }
    
    console.log("✅ Quote OK, có thể thực hiện swap");
    return quote;
}
```

## 6. Error handling

```javascript
try {
    // Kiểm tra quote trước
    const quote = await debugQuote(tokenIn, tokenOut, amountIn);
    if (!quote) {
        throw new Error("Không thể lấy quote hợp lệ");
    }
    
    const receipt = await executeSwap(tokenIn, tokenOut, amountIn, slippage, recipient);
    console.log("Swap thành công:", receipt.transactionHash);
} catch (error) {
    console.error("Swap thất bại:", error.message);
    if (error.data) {
        console.error("Chi tiết lỗi:", error.data);
    }
}
```

---

**Lưu ý:** Đây là tài liệu cơ bản. Trong production, cần thêm validation, error handling và security checks. 