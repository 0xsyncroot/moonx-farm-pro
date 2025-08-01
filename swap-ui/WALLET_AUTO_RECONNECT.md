# Wallet Auto-Reconnect Implementation

## Overview

Đã implement tính năng tự động kết nối lại ví private khi còn session hợp lệ. Logic này đảm bảo user không cần phải authenticate lại sau khi refresh page hoặc mở lại tab.

## Architecture

### 1. Session Management (`session-manager.ts`)
- Quản lý session của wallet với hardware-backed security
- `hasValidStoredSession()`: Check session hợp lệ trong storage
- `createSession()`: Tạo/restore session cho wallet

### 2. Secure Signer (`secure-signer.ts`) 
- Thêm method `hasValidStoredSession()` để check session
- `setActiveWallet()`: Set active wallet cho signer

### 3. Auto-Connect Hook (`useWalletAutoConnect.ts`)
- Hook chính để handle auto-reconnection
- Check session → Load wallet từ storage → Set active wallet → Connect
- Return states: `isChecking`, `isAutoConnected`, `error`

### 4. App Initialization (`useAppInitialization.ts`)
- Integrate `useWalletAutoConnect` vào app initialization
- Chạy song song với network loading

### 5. App Layout (`AppInitializer.tsx`)
- Sử dụng auto-connect states để logging và debugging
- Show states trong development mode

## How It Works

1. **App Startup**: `AppInitializer` khởi động `useAppInitialization`
2. **Session Check**: `useWalletAutoConnect` check session hợp lệ trong `sessionStorage`
3. **Session Restore**: Nếu có session hợp lệ (chưa expired), restore **KHÔNG CẦN authentication**
4. **Load Wallet**: Load wallet từ `localStorage` và set active wallet
5. **Auto Connect**: Wallet được kết nối tự động với session restored

### Key Improvement: No Authentication for Valid Sessions
- **Before**: Luôn yêu cầu authentication (passkey/biometric) dù có session
- **After**: Nếu có `moonx-session` hợp lệ → auto-connect không cần authentication
- **Security**: Session có expiry time và device binding, vẫn đảm bảo an toàn

## Usage

### Automatic (Default)
- Hook tự động chạy khi app khởi động
- Không cần code thêm từ components khác

### Manual Trigger
```typescript
import { manualWalletAutoConnect } from '@/hooks/useWalletAutoConnect';

const success = await manualWalletAutoConnect();
if (success) {
  console.log('Wallet auto-connected');
}
```

### Check States
```typescript
import { useAppInitialization } from '@/hooks/useAppInitialization';

const { 
  isWalletAutoConnecting, 
  isWalletAutoConnected, 
  walletAutoConnectError 
} = useAppInitialization();
```

## Security Features

- **Session-based**: Sử dụng hardware-backed session keys
- **Device binding**: Session gắn với device fingerprint  
- **Auto expiry**: Session tự động hết hạn
- **Authentication required**: Luôn yêu cầu authentication để tạo session

## Error Handling

- **No session**: Quietly skip auto-connect
- **Invalid session**: Clear và skip
- **Authentication failed**: Log error nhưng không crash app
- **Mount safety**: Handle component unmount properly

## Testing

1. Create và authenticate wallet
2. Refresh page → Wallet auto-connects
3. Close tab → Session persists in sessionStorage
4. Reopen → Wallet auto-connects (if within session timeout)
5. Wait for session expiry → Auto-connect fails gracefully

## Files Modified

- `swap-ui/hooks/useWalletAutoConnect.ts` (new)
- `swap-ui/hooks/useAppInitialization.ts`
- `swap-ui/lib/secure-signer.ts`
- `swap-ui/components/layout/AppInitializer.tsx`

## Configuration

Session timeout được config trong `session-manager.ts`:
- Default: 480 minutes (8 hours)
- Activity timeout: 0 (disabled)
- Configurable via session config