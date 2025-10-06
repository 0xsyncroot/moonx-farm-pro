# MongoDB Architecture - MoonX Swap Backend

Hệ thống đã được cải tiến với kiến trúc MongoDB mới, tách riêng Token và Network management.

## 🏗️ Kiến Trúc Mới

### Base Layer
- **BaseMongoManager**: Lớp base abstract quản lý MongoDB connections với singleton pattern
- **Models**: Token và Network models được tách riêng

### Token Management (Connection 1)
- **TokenManager**: Quản lý token operations
- **Connection**: `tokens` 
- **Database**: `moonx_indexer` (existing database)
- **Environment**: `TOKENS_MONGODB_URI` hoặc fallback `MONGODB_URI`

### Network Management (Connection 2) 
- **NetworkManager**: Quản lý network operations
- **Connection**: `networks_api`
- **Database**: `moonx_networks` (separate database)
- **Environment**: `NETWORKS_MONGODB_URI`

## 📁 Cấu Trúc Files

```
src/
├── managers/
│   ├── BaseMongoManager.ts     # Lớp base cho MongoDB operations
│   ├── TokenManager.ts         # Token management (connection hiện tại)
│   ├── NetworkManager.ts       # Network management (connection riêng)
│   └── index.ts                # Export tất cả managers
├── models/
│   ├── TokenModel.ts           # Token schema và interfaces
│   ├── NetworkModel.ts         # Network schema và interfaces
│   └── index.ts                # Export tất cả models
└── controllers/
    └── NetworkController.ts    # API endpoints cho networks
```

## 🔧 Sử Dụng

### Import Managers
```typescript
import { tokenManager, networkManager } from '../managers';
import { TokenPoolInfo, NetworkConfig } from '../models';
```

### Token Operations
```typescript
// Lấy token pool info
const poolInfo = await tokenManager.getTokenPoolInfo(tokenAddress, chainId);

// Lấy multiple tokens
const multipleInfos = await tokenManager.getMultipleTokenPoolInfos(addresses, chainId);

// Search tokens
const searchResults = await tokenManager.searchTokens(query, chainId);

// Get stats
const stats = await tokenManager.getTokenStats();
```

### Network Operations
```typescript
// Lấy all networks
const networks = await networkManager.getNetworks();

// Lấy network by chain ID
const network = await networkManager.getNetworkByChainId(8453);

// Lấy network by ID
const network = await networkManager.getNetworkById('base');

// Thêm/update network
const result = await networkManager.upsertNetwork(networkConfig);

// Deactivate network
const success = await networkManager.deactivateNetwork(chainId);

// Lấy supported chain IDs
const chainIds = await networkManager.getSupportedChainIds();

// Initialize default networks
await networkManager.initializeDefaultNetworks();

// Get stats
const stats = await networkManager.getNetworkStats();
```

## 🛠️ Migration

### Khởi tạo Networks
```bash
# Chạy migration để khởi tạo default networks
npm run migrate:networks

# Hoặc test networks system
npm run test:networks
```

### Script Migration
```typescript
import { networkManager } from '../managers';

// Initialize
await networkManager.initialize();

// Initialize default networks
await networkManager.initializeDefaultNetworks();
```

## 🌐 API Endpoints

### Networks API
- `GET /api/networks` - Lấy tất cả active networks
- `GET /api/networks/:chainId` - Lấy network theo chain ID  
- `GET /api/networks/supported-chains` - Lấy supported chain IDs
- `POST /api/networks/refresh-cache` - Refresh networks cache

**Note**: Đã bỏ API add/delete networks để tránh security risks. Networks chỉ được quản lý thông qua code/migration.

## 🔄 Cache System

### Networks Cache
- **Memory Cache**: 5 phút expiry
- **Fallback**: Hardcoded networks nếu MongoDB fail
- **Auto-refresh**: Tự động refresh khi có thay đổi

### Pool Cache (Unchanged)
- **Redis**: Primary cache cho pool info
- **MongoDB**: Secondary source từ TokenManager
- **Retry Logic**: Robust error handling

## ⚡ Performance Benefits

### Dual Connection Architecture
1. **Isolated Connections**: TokenManager và NetworkManager sử dụng connections hoàn toàn riêng biệt
2. **Database Separation**: Tokens và Networks có thể ở trên databases/servers khác nhau
3. **No Cross-Interference**: Operations trên tokens không ảnh hưởng đến networks và ngược lại
4. **Independent Scaling**: Có thể scale token database và network database độc lập

### Connection Management
1. **Connection Pooling**: Mỗi manager có connection pool riêng (maxPoolSize: 10)
2. **Singleton Pattern**: Tái sử dụng connections per connection name
3. **Automatic Failover**: Fallback mechanisms cho mỗi connection
4. **Health Monitoring**: Independent health checks cho từng connection

### Performance Optimizations
1. **Separate Databases**: `moonx_indexer` (tokens) vs `moonx_networks` (networks)
2. **Optimized Schemas**: Indexes riêng biệt cho từng use case
3. **Bulk Operations**: Batch upserts cho performance
4. **Caching Layers**: Memory cache (networks) + Redis cache (pools)

## 🛡️ Error Handling

### Database Errors
- **Connection Errors**: Auto-retry với exponential backoff
- **Timeout**: Configurable timeouts
- **Validation**: Schema validation
- **Graceful Fallback**: Fallback to hardcoded data

### Health Checks
```typescript
// Check individual managers
const tokenHealth = await tokenManager.healthCheck();
const networkHealth = await networkManager.healthCheck();

// Check overall system
const overallHealth = tokenHealth && networkHealth;
```

## 🔧 Configuration

### Environment Variables
```env
# MongoDB Connections - DUAL SETUP
# Connection 1: Tokens (existing database)
MONGODB_URI=mongodb://localhost:27017/moonx_indexer
TOKENS_MONGODB_URI=mongodb://localhost:27017/moonx_indexer

# Connection 2: Networks (separate database)  
NETWORKS_MONGODB_URI=mongodb://localhost:27017/moonx_networks

# Alternative: Completely separate MongoDB instances
# TOKENS_MONGODB_URI=mongodb://tokens-server:27017/moonx_tokens
# NETWORKS_MONGODB_URI=mongodb://networks-server:27017/moonx_networks

# MoonX Contract Addresses
MOONX_BASE_CONTRACT_ADDRESS=0x...
MOONX_DEV_TEST_CONTRACT_ADDRESS=0x...

# Network RPC
BASE_RPC_URL=https://mainnet.base.org
BASE_BACKUP_RPC_URL=https://mainnet.base.org
DEV_TEST_RPC_URL=http://localhost:8645
```

### Connection Names
- **TokenManager**: `'tokens'`
- **NetworkManager**: `'networks_api'`

## 🧪 Testing

### Test Dual Connections
```bash
# Test migrations (creates networks in separate database)
npm run migrate:networks

# Test complete system (both connections)
npm run test:networks

# Test individual managers
node -e "
import { tokenManager, networkManager } from './src/managers/index.js';

// Test token connection
console.log('Token DB health:', await tokenManager.healthCheck());

// Test network connection  
console.log('Network DB health:', await networkManager.healthCheck());

// Test connection info
console.log('Token stats:', await tokenManager.getStats());
console.log('Network stats:', await networkManager.getStats());
"
```

### Manual Connection Testing
```javascript
import { TokenManager, NetworkManager } from '../managers';

// Test with custom URIs
const tokenMgr = TokenManager.getInstance('mongodb://localhost:27017/tokens_db');
const networkMgr = NetworkManager.getInstance('mongodb://localhost:27017/networks_db');

await tokenMgr.initialize();
await networkMgr.initialize();

console.log('Connections established independently');
```

## 🚀 Migration từ Hệ Thống Cũ

### Before (Old)
```typescript
import { mongoManager } from '../utils/mongodb';
const poolInfo = await mongoManager.getTokenPoolInfo(addr, chainId);
```

### After (New)
```typescript
import { tokenManager } from '../managers';
const poolInfo = await tokenManager.getTokenPoolInfo(addr, chainId);
```

### Network Changes
```typescript
// Old - synchronous
import { getNetworkByChainIdSync } from '../config/networks';
const network = getNetworkByChainIdSync(chainId);

// New - asynchronous với fallback
import { getNetworkByChainId } from '../config/networks';
const network = await getNetworkByChainId(chainId); // MongoDB-backed
const networkSync = getNetworkByChainIdSync(chainId); // Cache/fallback
```

---

## ✅ Hoàn Thành

1. ✅ BaseMongoManager với singleton pattern
2. ✅ TokenManager với connection hiện tại  
3. ✅ NetworkManager với connection riêng
4. ✅ Tách Models riêng biệt
5. ✅ NetworkController với API endpoints cần thiết
6. ✅ Migration và test scripts
7. ✅ Pool cache integration
8. ✅ Error handling và fallbacks
9. ✅ TypeScript type safety
10. ✅ Documentation và examples
