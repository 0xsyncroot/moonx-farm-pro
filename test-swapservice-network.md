# SwapService Network Support Test Guide

## 🔧 **Các thay đổi đã thực hiện:**

### **1. Cập nhật MoonX Contract Address Management:**
```typescript
// ✅ Trước: Hardcode single address
export const MOONX_CONTRACT_ADDRESS = '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630';

// ✅ Sau: Dynamic address by chainId
const MOONX_CONTRACT_ADDRESSES: Record<number, string> = {
  8453: '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630', // Base
  18453: '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630', // Dev Test
};

export const getMoonXContractAddress = (chainId: number): string => {
  const address = MOONX_CONTRACT_ADDRESSES[chainId];
  if (!address) {
    throw new Error(`MoonX contract not deployed on chain ${chainId}`);
  }
  return address;
};
```

### **2. Cập nhật SwapService Interfaces:**
```typescript
export interface SwapExecutionParams {
  // ... existing fields
  chainId: number; // ✅ NEW: Network chain ID for contract address
  // ... other fields
}

export interface DirectSwapParams {
  // ... existing fields  
  chainId: number; // ✅ NEW: Network chain ID for contract address
  // ... other fields
}
```

### **3. Cập nhật SwapService Methods:**
```typescript
// ✅ executeSwap now uses dynamic contract address
const contractAddress = getMoonXContractAddress(params.chainId);

// ✅ tokenApproval now uses correct contract address
await this.tokenApproval(
  tokenContract,
  userAddress,
  amountIn,
  tokenSymbol,
  decimals,
  signer,
  gasSettings,
  contractAddress // ✅ Pass contract address for this chain
);

// ✅ getQuoteFromContract now accepts chainId
async getQuoteFromContract(
  signer: ethers.Signer,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number // ✅ NEW parameter
): Promise<any>
```

### **4. Cập nhật useSwap Hook:**
```typescript
const result = await executeSwap({
  quote,
  fromToken: swapForm.fromToken,
  toToken: swapForm.toToken,
  fromAmount: swapForm.fromAmount,
  slippage: swapForm.slippage,
  chainId: selectedNetwork.chainId, // ✅ NEW: Use selected network's chainId
  userAddress: walletAddress,
  rpcSettings: effectiveRpcSettings,
  walletConfig,
  gasSettings,
});
```

## 🧪 **Test Cases:**

### **Test 1: Base Network Swap (chainId: 8453)**
1. Chọn network "Base" trong dropdown
2. Thực hiện swap ETH → USDC
3. Kiểm tra console logs:
   ```
   🔄 Executing swap on chain 8453: 0.1 ETH → USDC
   📋 Using nonce X for swap transaction
   ```
4. Verify transaction được gửi đến contract `0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630`

### **Test 2: Dev Test Network Swap (chainId: 18453)**
1. Chọn network "Dev Test" trong dropdown
2. Thực hiện swap ETH → USDC
3. Kiểm tra console logs:
   ```
   🔄 Executing swap on chain 18453: 0.1 ETH → USDC
   📋 Using nonce X for swap transaction
   ```
4. Verify transaction được gửi đến contract `0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630`

### **Test 3: Network Switching During Swap**
1. Bắt đầu với network "Base"
2. Get quote cho swap
3. Switch sang network "Dev Test"
4. Execute swap
5. Verify swap sử dụng contract address của "Dev Test" network

### **Test 4: Token Approval với Different Networks**
1. Chọn network "Base"
2. Thực hiện swap USDC → ETH (cần approval)
3. Kiểm tra approval transaction gửi đến đúng contract address
4. Switch sang "Dev Test"
5. Thực hiện swap tương tự
6. Verify approval sử dụng contract address của "Dev Test"

### **Test 5: Error Handling - Unsupported Network**
1. Mock một network với chainId không được support (ví dụ: 1337)
2. Thử execute swap
3. Verify error: `MoonX contract not deployed on chain 1337`

## 🎯 **Expected Behavior:**

### **✅ Trước khi sửa:**
- Tất cả swaps sử dụng hardcode contract address cho Base
- Không thể swap trên networks khác
- Contract address không thay đổi khi switch network

### **✅ Sau khi sửa:**
- Swap sử dụng đúng contract address theo network được chọn
- Support multiple networks với different contract addresses
- Error handling cho unsupported networks
- Logs hiển thị chainId và contract address rõ ràng

## 🔍 **Debug Commands:**

```javascript
// Check contract address for specific chain
import { getMoonXContractAddress } from '@/libs/moonx';
console.log('Base contract:', getMoonXContractAddress(8453));
console.log('Dev Test contract:', getMoonXContractAddress(18453));

// Check current network in swap
console.log('Current network:', useNetworkStore.getState().selectedNetwork);

// Check swap params
console.log('Swap params include chainId:', {
  chainId: selectedNetwork.chainId,
  contractAddress: getMoonXContractAddress(selectedNetwork.chainId)
});
```

## 📋 **Verification Checklist:**

- [ ] Contract address changes when switching networks
- [ ] Swap transactions use correct contract address
- [ ] Token approvals use correct contract address  
- [ ] Quote calls use correct contract address
- [ ] Error handling for unsupported networks
- [ ] Console logs show correct chainId
- [ ] No hardcoded contract addresses in swap flow
- [ ] MoonXService constructor accepts chainId parameter
- [ ] All SwapService methods use dynamic contract addresses

## 🚀 **Performance Impact:**

- ✅ **Minimal overhead** - chỉ thêm 1 lookup call `getMoonXContractAddress(chainId)`
- ✅ **Better error handling** - fail fast cho unsupported networks
- ✅ **Cleaner architecture** - centralized contract address management
- ✅ **Future-proof** - dễ dàng thêm networks mới
