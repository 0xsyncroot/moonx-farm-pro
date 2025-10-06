# Database Schema Documentation

## Tổng quan

Coin Indexer Worker sử dụng MongoDB làm database chính để lưu trữ thông tin token và Redis làm cache layer. Dữ liệu được thu thập từ các blockchain events và được chuẩn hóa theo format chung.

## MongoDB Collections

### 1. Collection: `tokens`

**Mục đích**: Lưu trữ thông tin chi tiết về các token được tạo từ các events blockchain.

**Indexes được tạo**:
```javascript
// Unique index cho token identification
db.tokens.createIndex({"chain_id": 1, "token_address": 1}, {unique: true})

// Query indexes
db.tokens.createIndex({"chain_id": 1, "source": 1})
db.tokens.createIndex({"creator": 1})
db.tokens.createIndex({"creation_block": 1})
db.tokens.createIndex({"creation_timestamp": -1})
db.tokens.createIndex({"status": 1})
db.tokens.createIndex({"creation_tx_hash": 1})

// Text search index
db.tokens.createIndex({"name": "text", "symbol": "text"})
```

**Cấu trúc Document**:

```javascript
{
  // Core identification
  "_id": ObjectId("..."),
  "token_address": "0xBd7D4FFf5050dd1344996C5F35e294CD31b39E68",
  "chain_id": 8453,
  "source": "creator_coin", // hoặc "clanker"
  
  // Token metadata
  "name": "etian",
  "symbol": "etian",
  "creator": "0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
  "admin": null, // chỉ có với Clanker tokens
  "payout_recipient": "0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe", // chỉ có với Creator tokens
  "platform_referrer": "0x0000000000000000000000000000000000000000",
  
  // Pool/Liquidity information
  "base_currency": "0x1111111111166b7FE7bd91427724B487980aFc69",
  "paired_token": "0x4200000000000000000000000000000000000006", // WETH cho Clanker
  "pool_address": null,
  "pool_id": "3C7DB4321512EE915DF569906088973D89D95908F0EFF89FB5621D162769F69A", // Clanker
  "pool_key_hash": "0x78de9c0f0e7372b91b9c28f8d474260055d45f6ea0dab2b15aad186657da032d", // Creator
  
  // Pool configuration
  "fee_tier": 30000,
  "tick_spacing": 200,
  "starting_tick": -230400, // Clanker only
  "hooks_address": "0xd61A675F8a0c67A73DC3B54FB7318B4D91409040",
  
  // Metadata
  "image_url": null,
  "metadata_uri": "ipfs://bafybeiceb3j73nfwiutwc77mevvfyir2f42j3mouaqdkxoddzcyhnuqgpm",
  "metadata_json": {
    "description": "Deployed using Bankr on XMTP",
    "socialMediaUrls": [],
    "auditUrls": []
  },
  "context_json": {
    "interface": "Bankr",
    "platform": "farcaster", 
    "messageId": "bankr deployment",
    "id": "886870"
  },
  
  // Contract information
  "locker_address": "0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496",
  "mev_module": "0xFdc013ce003980889cFfd66b0c8329545ae1d1E8",
  "contract_version": "1.1.0",
  
  // Creation tracking
  "creation_block": 34007783,
  "creation_tx_hash": "0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638",
  "creation_timestamp": ISODate("2024-08-12T05:04:30.000Z"),
  "creation_contract": "0x777777751622c0d3258f214f9df38e35bf45baf3",
  
  // Processing status
  "status": "active", // active | processing | error | audited
  "audit_status": null,
  "error_message": null,
  
  // Raw event data (for debugging/auditing)
  "raw_event_data": {
    "tx_hash": "0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638",
    "log_index": 156,
    "block_number": 34007783,
    "event_signature": "0x74b670d628e152daa36ca95dda7cb0002d6ea7a37b55afe4593db7abd1515781"
  },
  
  // Additional extensible data
  "additional_metadata": {},
  
  // Repository timestamps
  "created_at": ISODate("2024-08-12T05:04:35.123Z"),
  "updated_at": ISODate("2024-08-12T05:04:35.123Z")
}
```

### 2. Collection: `indexer_progress`

**Mục đích**: Tracking tiến độ indexing để resume từ block cuối cùng đã process.

**Indexes được tạo**:
```javascript
// Unique constraint để tránh duplicate progress records
db.indexer_progress.createIndex({"chain_id": 1, "indexer_type": 1}, {unique: true})
```

**Cấu trúc Document**:
```javascript
{
  "_id": ObjectId("..."),
  "chain_id": 8453,
  "indexer_type": "coin_tokens",
  "last_processed_block": 34015993,
  "updated_at": ISODate("2024-08-12T05:14:09.902Z")
}
```

## Redis Cache Structure

**Namespace**: `moonx:coins:*`

### 1. Stats Tracking
```
Key: "moonx:coins:stats:8453:tokens_processed"
Type: Integer
Value: 1247 (số lượng tokens đã process)
TTL: No expiration
```

### 2. Health Check Cache
```
Key: "moonx:coins:health:8453:last_check"
Type: String (timestamp)
Value: "2024-08-12T05:14:09.902Z"
TTL: 300 seconds (5 minutes)
```

### 3. Block Progress Cache
```
Key: "moonx:coins:progress:8453:last_block"
Type: Integer
Value: 34015993
TTL: No expiration (updated real-time)
```

## Data Transformation Flow

### 1. CreatorCoinCreated Event → Database

**Blockchain Event (Raw Log)**:
```javascript
{
  "topics": [
    "0x74b670d628e152daa36ca95dda7cb0002d6ea7a37b55afe4593db7abd1515781", // event signature
    "0x0000000000000000000000003e1e64589b5c49101251b02d1ed63c08841a3fbe", // caller
    "0x0000000000000000000000003e1e64589b5c49101251b02d1ed63c08841a3fbe", // payoutRecipient
    "0x0000000000000000000000000000000000000000000000000000000000000000"  // platformReferrer
  ],
  "data": "0x0000000000000000000000001111111111166b7fe7bd91427724b487980afc69...", // ABI encoded data
  "address": "0x777777751622c0d3258f214f9df38e35bf45baf3",
  "blockNumber": 34007783,
  "transactionHash": "0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638",
  "logIndex": 156
}
```

**Parsed CreatorCoinEvent**:
```python
CreatorCoinEvent(
    tx_hash="0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638",
    log_index=156,
    block_number=34007783,
    block_timestamp=datetime(2024, 8, 12, 5, 4, 30),
    contract_address="0x777777751622c0d3258f214f9df38e35bf45baf3",
    caller="0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
    payout_recipient="0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
    platform_referrer="0x0000000000000000000000000000000000000000",
    currency="0x1111111111166b7FE7bd91427724B487980aFc69",
    uri="ipfs://bafybeiceb3j73nfwiutwc77mevvfyir2f42j3mouaqdkxoddzcyhnuqgpm",
    name="etian",
    symbol="etian",
    coin="0xBd7D4FFf5050dd1344996C5F35e294CD31b39E68",
    pool_key=PoolKey(...),
    pool_key_hash="0x78de9c0f0e7372b91b9c28f8d474260055d45f6ea0dab2b15aad186657da032d",
    version="1.1.0"
)
```

**TokenInfo (Normalized)**:
```python
TokenInfo(
    token_address="0xBd7D4FFf5050dd1344996C5F35e294CD31b39E68",
    chain_id=8453,
    source=TokenSource.CREATOR_COIN,
    name="etian",
    symbol="etian",
    creator="0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
    # ... other fields mapped from event
)
```

### 2. TokenCreated (Clanker) Event → Database

**Blockchain Event**:
```javascript
{
  "topics": [
    "0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67", // event signature  
    "0x0000000000000000000000003d148d36a944a858f6d8c8e78ef21a01c0caab07", // tokenAddress
    "0x000000000000000000000000c03e44f9126b2121764a3102db21a0c19bf2e34f"  // tokenAdmin
  ],
  "data": "0x000000000000000000000000...", // ABI encoded: msgSender, tokenImage, tokenName, etc.
  "address": "0xe85a59c628f7d27878aceb4bf3b35733630083a9"
}
```

**Parsed ClankerTokenEvent**:
```python
ClankerTokenEvent(
    tx_hash="0x14e585d7d2ed227b2ccbbe3b2071e643b36b3a5540b894f60e3dc1f3988b5ed3",
    token_address="0x3d148d36A944a858f6D8C8E78EF21a01C0caAb07", 
    token_admin="0xc03E44F9126b2121764A3102dB21a0C19Bf2e34f",
    msg_sender="0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9",
    token_name="Cliza",
    token_symbol="Cliza",
    token_metadata='{"description":"Deployed using Bankr on XMTP",...}',
    token_context='{"interface":"Bankr","platform":"farcaster",...}',
    starting_tick=-230400,
    pool_id="3C7DB4321512EE915DF569906088973D89D95908F0EFF89FB5621D162769F69A",
    extensions_supply="0", # String để handle large uint256
    # ... other fields
)
```

## Performance Considerations

### 1. Indexing Strategy

**Primary Query Patterns**:
- Tìm token theo address + chain: `{chain_id: 1, token_address: 1}` (unique)
- Tìm tokens theo creator: `{creator: 1}`
- Timeline queries: `{creation_timestamp: -1}`
- Status filtering: `{status: 1}`
- Text search: `{name: "text", symbol: "text"}`

**Compound Indexes cho Complex Queries**:
```javascript
// Tìm tokens theo chain + source + status
db.tokens.createIndex({"chain_id": 1, "source": 1, "status": 1})

// Timeline với status filter
db.tokens.createIndex({"status": 1, "creation_timestamp": -1})
```

### 2. Data Size Estimates

**Per Token Document**: ~2-5KB (depending on metadata)
**Daily Volume**: ~1000-5000 tokens (Base chain)
**Monthly Storage**: ~150MB-750MB
**Index Overhead**: ~20-30% of data size

### 3. Optimization Strategies

**Write Performance**:
- Batch inserts trong `_process_tokens_batch_parallel()`
- Upsert strategy để handle duplicates
- Minimal indexes during bulk operations

**Read Performance**:  
- Compound indexes cho common queries
- TTL indexes cho temporary data
- Read preferences cho replica sets

## Data Integrity & Validation

### 1. Unique Constraints

```javascript
// Prevent duplicate tokens per chain
{chain_id: 8453, token_address: "0x..."}
```

### 2. Field Validation (Pydantic Models)

```python
# Address validation
token_address: str = Field(..., regex=r'^0x[a-fA-F0-9]{40}$')

# Enum validation
source: TokenSource = Field(...) # creator_coin | clanker
status: TokenStatus = Field(...) # active | processing | error | audited

# Range validation
chain_id: int = Field(..., gt=0)
creation_block: int = Field(..., gt=0)
```

### 3. Data Consistency Checks

- Event parsing validation trước khi lưu DB
- Cross-reference với blockchain data
- Audit trail trong `raw_event_data`

## Query Examples

### 1. Tìm tokens mới nhất
```javascript
db.tokens.find({chain_id: 8453})
  .sort({creation_timestamp: -1})
  .limit(10)
```

### 2. Tokens theo creator
```javascript
db.tokens.find({
  creator: "0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
  chain_id: 8453
})
```

### 3. Text search
```javascript
db.tokens.find({
  $text: {$search: "etian"},
  chain_id: 8453
})
```

### 4. Analytics queries
```javascript
// Tokens per day
db.tokens.aggregate([
  {$match: {chain_id: 8453}},
  {$group: {
    _id: {$dateToString: {format: "%Y-%m-%d", date: "$creation_timestamp"}},
    count: {$sum: 1}
  }},
  {$sort: {_id: -1}}
])

// Tokens by source
db.tokens.aggregate([
  {$match: {chain_id: 8453}},
  {$group: {_id: "$source", count: {$sum: 1}}}
])
```

## Backup & Recovery

### 1. MongoDB Backup Strategy
```bash
# Daily backup
mongodump --db moonx_indexer --collection tokens --out backup_$(date +%Y%m%d)

# Point-in-time recovery với oplog
mongodump --oplog --db moonx_indexer
```

### 2. Redis Persistence
```
# Redis configuration  
save 900 1      # Snapshot if at least 1 key changed in 900 seconds
appendonly yes  # AOF for durability
```

### 3. Disaster Recovery
- Progress tracking cho re-indexing từ specific block
- Event reconstruction từ blockchain nếu cần
- Database replication cho high availability
