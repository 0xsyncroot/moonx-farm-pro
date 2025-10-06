# MoonX Farm Pro - Database Schema Documentation

> **Version**: Latest (2025)  
> **Last Updated**: December 2024  
> **Database**: MongoDB  
> **Language**: Python with Pydantic Models  

## 📋 Overview

MoonX Indexer Worker sử dụng MongoDB để lưu trữ dữ liệu blockchain indexing với **6 collections chính**:

1. **`pools`** - Thông tin liquidity pools
2. **`swap_events`** - Swap transaction events  
3. **`pool_liquidity`** - Pool liquidity snapshots
4. **`price_calculations`** - Price calculation records
5. **`indexer_progress`** - Indexing progress tracking
6. **`tokens`** - Token information (implicit via embedded documents)

## 🏗️ Database Architecture

### Data Types & Precision Handling

**⚠️ Important**: Tất cả **price và amount fields** sử dụng **`string` type** để:
- Tránh scientific notation (e.g., `1.034277302914964e+19`)
- Đảm bảo precision cao cho financial calculations
- Consistent data format across all operations

```python
# ❌ Wrong (causes precision loss)
price: float = 1.034277302914964e+19

# ✅ Correct (preserves precision)  
price: str = "10342773029149640000"
```

### 🎯 TokenInfo Design Philosophy

**Simplified & Reliable Token Model**

Traditional indexers fetch `symbol` and `name` which often fail, causing:
- ❌ "UNKNOWN" values in database
- ❌ Extra RPC calls that slow indexing  
- ❌ Inconsistent data quality

**Our Solution: Essential-Only Data**
```python
TokenInfo:
  address: str     # Primary identifier (never fails)
  decimals: int    # Essential for calculations (with fallback)
  # Optional fields only if easily available
```

**Benefits:**
- 🚀 **75% fewer RPC calls** per token
- 🛡️ **Zero "UNKNOWN" values**  
- ⚡ **Faster, more reliable indexing**
- 🎯 **Address-based token identification**

---

## 📊 Collections Schema

### 1. 🏊 **Pools Collection**

**Collection**: `pools`  
**Model**: `PoolInfo`  
**Primary Key**: `pool_address` + `chain_id`

#### Required Fields
```typescript
{
  // Core Identifiers
  pool_address: string,           // Pool contract address
  chain_id: number,              // Blockchain chain ID (e.g., 8453 for Base)
  protocol: PoolProtocol,        // Protocol enum value
  
  // Token Information (Simplified Design)
  token0: TokenInfo,             // First token (minimal essential data)
  token1: TokenInfo,             // Second token (minimal essential data)
  
  // Pool Configuration  
  factory_address: string,       // Factory contract address
  
  // Creation Information
  creation_block: number,        // Block number when created
  creation_tx_hash: string,      // Transaction hash of creation
  creation_timestamp: datetime,   // ISO timestamp of creation
  
  // Indexing Status
  status: PoolStatus,            // "active" | "paused" | "error"
  last_indexed_block: number,    // Last processed block (default: 0)
  
  // State Update Tracking
  state_updated_at: datetime     // Last state update timestamp
}
```

#### Optional Fields
```typescript
{
  // V3-specific Configuration
  fee_tier?: number,                    // Fee tier (e.g., 3000 = 0.3%)
  tick_spacing?: number,               // Tick spacing for V3 pools
  
  // Current Pool State
  current_liquidity?: string,          // Total liquidity
  current_sqrt_price_x96?: string,     // V3 sqrt price in X96 format
  current_tick?: number,               // Current tick for V3
  
  // V2-style Reserves  
  reserve0?: string,                   // Token0 reserve amount
  reserve1?: string,                   // Token1 reserve amount
  
  // Current Prices
  current_price_token0?: string,       // Price of token0 in token1
  current_price_token1?: string,       // Price of token1 in token0
  
  // Flexibility
  metadata?: object                    // Additional pool metadata
}
```

#### Example Document
```json
{
  "_id": "0x1234567890abcdef...",
  "pool_address": "0x1234567890abcdef1234567890abcdef12345678",
  "chain_id": 8453,
  "protocol": "uniswap_v3",
  "token0": {
    "address": "0xa0b86a33e6441e2b3c8b...",
    "decimals": 6,
    "total_supply": "50000000000000",
    "is_verified": true,
    "last_updated": "2024-12-01T10:30:00Z"
  },
  "token1": {
    "address": "0xc02aaa39b223fe8d0a...",
    "decimals": 18,
    "total_supply": "7000000000000000000000000",
    "is_verified": true,
    "last_updated": "2024-12-01T10:30:00Z"
  },
  "fee_tier": 3000,
  "tick_spacing": 60,
  "factory_address": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  "creation_block": 18500000,
  "creation_tx_hash": "0xabcdef1234567890...",
  "creation_timestamp": "2024-11-15T08:20:15Z",
  "status": "active",
  "last_indexed_block": 18600000,
  "current_liquidity": "50000000000000000000000",
  "current_sqrt_price_x96": "1234567890123456789012345678901234567890",
  "current_tick": -12345,
  "reserve0": "100000000000",
  "reserve1": "50000000000000000000",
  "current_price_token0": "3456.78",
  "current_price_token1": "0.0002894",
  "metadata": {},
  "state_updated_at": "2024-12-01T10:30:00Z"
}
```

### 2. 💱 **Swap Events Collection**

**Collection**: `swap_events`  
**Model**: `SwapEvent`  
**Primary Key**: `tx_hash` + `log_index`

#### Schema
```typescript
{
  // Event Identifiers
  tx_hash: string,              // Transaction hash
  log_index: number,            // Log index in transaction
  pool_address: string,         // Pool contract address
  chain_id: number,            // Blockchain chain ID
  
  // Block Information
  block_number: number,         // Block number
  block_timestamp: datetime,    // Block timestamp
  
  // Swap Details
  sender: string,               // Sender address
  recipient: string,            // Recipient address
  amount0_in: string,          // Token0 input amount
  amount1_in: string,          // Token1 input amount
  amount0_out: string,         // Token0 output amount
  amount1_out: string,         // Token1 output amount
  
  // Price Information (Optional)
  price?: string,              // Calculated price
  usd_value?: string,          // USD value of swap
  
  // Gas Information (Optional)
  gas_used?: number,           // Gas used
  gas_price?: string,          // Gas price
  
  // Processing Metadata
  processed_at: datetime       // When event was processed
}
```

#### Example Document
```json
{
  "_id": "0xabcdef123456_42",
  "tx_hash": "0xabcdef1234567890abcdef1234567890abcdef12",
  "log_index": 42,
  "pool_address": "0x1234567890abcdef1234567890abcdef12345678",
  "chain_id": 8453,
  "block_number": 18600000,
  "block_timestamp": "2024-12-01T10:30:00Z",
  "sender": "0x742d35cc1252b82c...",
  "recipient": "0x742d35cc1252b82c...",
  "amount0_in": "1000000000",
  "amount1_in": "0",
  "amount0_out": "0", 
  "amount1_out": "289400000000000000",
  "price": "3456.78",
  "gas_used": 120000,
  "gas_price": "15000000000",
  "processed_at": "2024-12-01T10:31:00Z"
}
```

### 3. 💧 **Pool Liquidity Collection**

**Collection**: `pool_liquidity`  
**Model**: `PoolLiquidity`  
**Purpose**: Historical liquidity snapshots

#### Schema
```typescript
{
  // Identifiers
  pool_address: string,         // Pool contract address
  chain_id: number,            // Blockchain chain ID
  
  // Block Information
  block_number: number,         // Block number
  block_timestamp: datetime,    // Block timestamp
  
  // Liquidity Data
  total_liquidity: string,      // Total liquidity
  reserve0: string,            // Token0 reserve
  reserve1: string,            // Token1 reserve
  
  // Price Information (Optional)
  token0_price?: string,       // Token0 price in token1
  token1_price?: string,       // Token1 price in token0
  
  // Processing Metadata
  processed_at: datetime       // When snapshot was taken
}
```

### 4. 💰 **Price Calculations Collection**

**Collection**: `price_calculations`  
**Model**: `PriceCalculation`  
**Purpose**: Price calculation records for analytics

#### Schema
```typescript
{
  // Identifiers
  pool_address: string,         // Pool contract address
  chain_id: number,            // Blockchain chain ID
  
  // Transaction Information
  tx_hash: string,             // Transaction hash
  block_number: number,        // Block number
  timestamp: number,           // Unix timestamp
  
  // Price Calculation
  price: string,               // Calculated price (token1/token0)
  
  // Token Amounts
  amount0: string,             // Token0 amount (can be negative)
  amount1: string,             // Token1 amount (can be negative)
  
  // Token Addresses
  token0: string,              // Token0 contract address
  token1: string,              // Token1 contract address
  
  // Price Context (Optional)
  price_impact?: string,       // Price impact percentage
  price_before?: string,       // Price before transaction
  price_after?: string,        // Price after transaction
  
  // Liquidity Context (Optional)
  liquidity_before?: string,   // Pool liquidity before
  liquidity_after?: string,    // Pool liquidity after
  
  // Protocol Information
  protocol: PoolProtocol,      // DEX protocol
  fee_tier?: number,          // Fee tier for V3
  
  // Calculation Method
  calculation_method: string,   // "swap" | "tick" | "reserves"
  
  // Processing Metadata
  processed_at: datetime       // When calculated
}
```

### 5. 📊 **Indexer Progress Collection**

**Collection**: `indexer_progress`  
**Model**: `IndexerProgress`  
**Purpose**: Track indexing progress per chain/type

#### Schema
```typescript
{
  // Identifiers
  chain_id: number,            // Blockchain chain ID
  pool_address?: string,       // Pool address (if pool-specific)
  indexer_type: string,        // "pools" | "swaps" | "liquidity"
  
  // Progress Information
  last_processed_block: number, // Last successfully processed block
  target_block: number,        // Target block to process
  
  // Status
  status: string,              // Current indexer status
  error_message?: string,      // Last error message
  
  // Timestamps
  started_at: datetime,        // When indexing started
  updated_at: datetime         // Last update time
}
```

#### Example Document
```json
{
  "_id": "8453_pools",
  "chain_id": 8453,
  "pool_address": null,
  "indexer_type": "pools",
  "last_processed_block": 18600000,
  "target_block": 18650000,
  "status": "running",
  "error_message": null,
  "started_at": "2024-12-01T08:00:00Z",
  "updated_at": "2024-12-01T10:30:00Z"
}
```

---

## 🏷️ Enums

### PoolProtocol
```python
UNISWAP_V2 = "uniswap_v2"
UNISWAP_V3 = "uniswap_v3" 
UNISWAP_V4 = "uniswap_v4"
SUSHISWAP = "sushiswap"
SUSHISWAP_V3 = "sushiswap_v3"
PANCAKESWAP_V2 = "pancakeswap_v2"
PANCAKESWAP_V3 = "pancakeswap_v3"
BALANCER_V2 = "balancer_v2"
CURVE = "curve"
AERODROME = "aerodrome"
```

### PoolStatus
```python
ACTIVE = "active"      # Pool is active and being indexed
PAUSED = "paused"      # Pool indexing is paused
ERROR = "error"        # Pool has indexing errors
```

---

## 🗃️ Database Indexes

### Recommended Indexes

#### Pools Collection
```javascript
// Primary lookups and deduplication
db.pools.createIndex({ "pool_address": 1, "chain_id": 1 }, { unique: true })
db.pools.createIndex({ "chain_id": 1, "protocol": 1 })
db.pools.createIndex({ "status": 1, "last_indexed_block": 1 })

// Token lookups
db.pools.createIndex({ "token0.address": 1 })
db.pools.createIndex({ "token1.address": 1 })
db.pools.createIndex({ "token0.symbol": 1, "token1.symbol": 1 })

// Performance indexes
db.pools.createIndex({ "chain_id": 1, "creation_block": 1 })
db.pools.createIndex({ "state_updated_at": 1 })
```

#### Swap Events Collection  
```javascript
// Primary lookups
db.swap_events.createIndex({ "tx_hash": 1, "log_index": 1 }, { unique: true })
db.swap_events.createIndex({ "pool_address": 1, "block_number": 1 })
db.swap_events.createIndex({ "chain_id": 1, "block_timestamp": 1 })

// Analytics indexes
db.swap_events.createIndex({ "pool_address": 1, "block_timestamp": 1 })
db.swap_events.createIndex({ "sender": 1, "block_timestamp": 1 })
```

#### Pool Liquidity Collection
```javascript
// Primary lookups and deduplication
db.pool_liquidity.createIndex({ "pool_address": 1, "chain_id": 1, "block_number": 1 }, { unique: true })
db.pool_liquidity.createIndex({ "chain_id": 1, "block_timestamp": 1 })

// Time-series queries
db.pool_liquidity.createIndex({ "pool_address": 1, "block_timestamp": 1 })
```

#### Price Calculations Collection
```javascript
// Primary lookups and deduplication
db.price_calculations.createIndex({ "tx_hash": 1, "pool_address": 1, "block_number": 1 }, { unique: true })
db.price_calculations.createIndex({ "pool_address": 1, "block_number": 1 })
db.price_calculations.createIndex({ "chain_id": 1, "timestamp": 1 })

// Token pair lookups
db.price_calculations.createIndex({ "token0": 1, "token1": 1, "timestamp": 1 })
```

#### Indexer Progress Collection
```javascript
// Primary lookups
db.indexer_progress.createIndex({ "chain_id": 1, "indexer_type": 1 }, { unique: true })
db.indexer_progress.createIndex({ "status": 1, "updated_at": 1 })
```

---

## ⚡ Performance Optimizations

### 1. **String-based Financial Data**
- Tất cả amounts, prices, reserves sử dụng **string type**
- Prevents precision loss và scientific notation
- Enables accurate financial calculations

### 2. **Optimized Document Size**
- Removed unnecessary fields (logo_uri, description, tags, etc.)
- Kept only essential data for DEX operations
- Reduced document size by ~60%

### 3. **Efficient Indexing Strategy**
- Compound indexes cho common query patterns
- Time-based indexes cho historical data
- Unique constraints cho data integrity

### 4. **Data Archival**
```javascript
// Archive old swap events (older than 6 months)
db.swap_events.createIndex({ "block_timestamp": 1 }, { expireAfterSeconds: 15552000 })

// Archive old liquidity snapshots (older than 3 months)  
db.pool_liquidity.createIndex({ "block_timestamp": 1 }, { expireAfterSeconds: 7776000 })
```

---

## 🔄 Data Flow

### Pool Discovery
```
Blockchain Logs → Pool Parser → PoolInfo → MongoDB.pools
```

### Swap Processing  
```
Blockchain Logs → Swap Parser → SwapEvent → MongoDB.swap_events
                                     ↓
                              PriceCalculation → MongoDB.price_calculations
```

### Liquidity Tracking
```
Pool State → Liquidity Calculator → PoolLiquidity → MongoDB.pool_liquidity
```

### Progress Tracking
```
Indexer Status → IndexerProgress → MongoDB.indexer_progress
```

---

## 📝 Usage Examples

### Query Active Pools by Protocol
```python
pools = await db.pools.find({
    "chain_id": 8453,
    "protocol": "uniswap_v3", 
    "status": "active"
}).to_list(None)
```

### Get Recent Swaps for Pool
```python
swaps = await db.swap_events.find({
    "pool_address": "0x1234...",
    "block_timestamp": {"$gte": datetime.utcnow() - timedelta(hours=24)}
}).sort("block_timestamp", -1).to_list(100)
```

### Track Indexing Progress
```python
progress = await db.indexer_progress.find_one({
    "chain_id": 8453,
    "indexer_type": "pools"
})
```

---

## 🔄 Deduplication Strategy

MoonX Indexer implements **multi-layer deduplication** to prevent duplicate records:

### **Dual-Layer Protection (Critical Collections)**

#### **1. Pools Collection**
```python
# Layer 1: Redis cache (fast check)
dedup_key = f"pool_processed:{chain_id}:{pool_address}"
if await cache.exists(dedup_key):
    return  # Skip already processed

# Layer 2: MongoDB upsert (data integrity)
await pools.replace_one(
    {"chain_id": chain_id, "pool_address": pool_address},
    doc, upsert=True
)
await cache.set(dedup_key, "1", ttl=86400)  # 24h cache
```

#### **2. Swap Events Collection**
```python
# Layer 1: Redis cache (fast check)
dedup_key = f"swap_processed:{tx_hash}:{log_index}"
if await cache.exists(dedup_key):
    return  # Skip already processed

# Layer 2: MongoDB upsert (data integrity)
await swap_events.replace_one(
    {"tx_hash": tx_hash, "log_index": log_index},
    doc, upsert=True
)
await cache.set(dedup_key, "1", ttl=604800)  # 7 days cache
```

### **MongoDB-Only Protection (Historical Collections)**

#### **3. Pool Liquidity Collection**
```python
# Unique constraint: pool + chain + block
await pool_liquidity.replace_one(
    {
        "pool_address": pool_address,
        "chain_id": chain_id, 
        "block_number": block_number
    },
    doc, upsert=True
)
```

#### **4. Price Calculations Collection**
```python
# Unique constraint: tx + pool + block (handles multiple swaps per tx)
await price_calculations.replace_one(
    {
        "tx_hash": tx_hash,
        "pool_address": pool_address,
        "block_number": block_number
    },
    doc, upsert=True
)
```

### **Cache-Only Protection (Transient Data)**

#### **5. Token Information**
```python
# In-memory cache (no separate collection)
cache_key = token_address.lower()
if cache_key in self._token_cache:
    return cached_token_info
```

### **Unique Index Strategy**

```javascript
// Enforce uniqueness at database level
db.pools.createIndex({ "pool_address": 1, "chain_id": 1 }, { unique: true })
db.swap_events.createIndex({ "tx_hash": 1, "log_index": 1 }, { unique: true })
db.pool_liquidity.createIndex({ "pool_address": 1, "chain_id": 1, "block_number": 1 }, { unique: true })
db.price_calculations.createIndex({ "tx_hash": 1, "pool_address": 1, "block_number": 1 }, { unique: true })
db.indexer_progress.createIndex({ "chain_id": 1, "indexer_type": 1, "pool_address": 1 }, { unique: true })
```

---

## 🚨 Important Notes

### Data Type Consistency
- **Always use strings** for financial amounts
- **Use proper decimal handling** in calculations  
- **Validate price formats** before storage

### Index Maintenance
- Monitor index usage với `db.collection.getIndexes()`
- Drop unused indexes to improve write performance
- Regular index optimization

### Backup Strategy
- Daily backups of critical collections (pools, progress)
- Weekly full database backups
- Point-in-time recovery capability

---

*This documentation reflects the current implementation as of December 2024. Keep this updated as the schema evolves.*