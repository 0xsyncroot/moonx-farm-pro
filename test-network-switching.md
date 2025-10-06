# Network Switching Test Guide

## 🔧 **Các thay đổi đã thực hiện:**

### **1. Bổ sung trường `id` cho Network:**
- ✅ Backend: `NETWORKS` đã có trường `id` 
- ✅ Frontend: `Network` interface đã có trường `id`
- ✅ Constants: `BASE_NETWORK` đã có `id: 'base'`
- ✅ Fallback: NetworkService fallback network đã có `id: 'base'`

### **2. Cập nhật logic so sánh network:**
- ✅ NetworkStore: `validateSelectedNetwork()` sử dụng `network.id === currentNetwork.id`
- ✅ Header: `handleNetworkSwitch()` sử dụng `network.id === selectedNetwork?.id`
- ✅ Header: Tất cả disabled/styling logic sử dụng `network.id`
- ✅ SettingsModal: Network comparison sử dụng `network.id`

### **3. Cải thiện debug logging:**
- ✅ Tất cả logs hiển thị `{ id, name, chainId }`
- ✅ Persist merge function log network id
- ✅ setSelectedNetwork log from/to với id

## 🧪 **Test Cases:**

### **Test 1: App Initialization**
1. Mở app lần đầu
2. Kiểm tra console logs:
   ```
   🔧 NetworkStore: Merging persisted state: { persisted: null }
   🔧 NetworkStore: Updating selectedNetwork: { from: null, to: { id: 'base', name: 'Base' }, reason: 'no_selection' }
   ```

### **Test 2: Network Switching**
1. Click network dropdown
2. Chọn network khác (Dev Test)
3. Kiểm tra console logs:
   ```
   🔧 NetworkStore: setSelectedNetwork called: { from: { id: 'base', name: 'Base', chainId: 8453 }, to: { id: 'devTest', name: 'Dev Test', chainId: 18453 } }
   ```
4. Kiểm tra UI:
   - Network dropdown hiển thị "Dev Test"
   - Current badge hiển thị đúng network
   - Network khác không bị disabled

### **Test 3: Persistence**
1. Chọn network "Dev Test"
2. Refresh page
3. Kiểm tra console logs:
   ```
   🔧 NetworkStore: Merging persisted state: { persisted: { id: 'devTest', name: 'Dev Test', chainId: 18453 } }
   🔧 NetworkStore: Updating selectedNetwork: { from: { id: 'devTest', name: 'Dev Test' }, to: { id: 'devTest', name: 'Dev Test' }, reason: 'network_not_found' }
   ```
4. Kiểm tra selectedNetwork vẫn là "Dev Test"

### **Test 4: API Calls**
1. Chọn network "Dev Test"
2. Thực hiện swap hoặc load tokens
3. Kiểm tra Network tab trong DevTools
4. Verify API calls sử dụng `chainId: 18453`

## 🎯 **Expected Behavior:**

### **✅ Trước khi sửa:**
- selectedNetwork có thể bị stuck với chainId cũ
- Network comparison không reliable
- Persist/restore không consistent

### **✅ Sau khi sửa:**
- selectedNetwork luôn sync với available networks
- Network comparison dựa trên unique `id`
- Persist/restore hoạt động đúng
- API calls sử dụng đúng chainId của network được chọn

## 🔍 **Debug Commands:**

```javascript
// Check current network state
console.log('Current Network:', useNetworkStore.getState().selectedNetwork);

// Check all networks
console.log('All Networks:', useNetworkStore.getState().networks);

// Force sync (if needed)
useNetworkStore.getState().syncSelectedNetwork();
```
