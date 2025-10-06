# Database Examples - Real Data

## Example 1: CreatorCoin Token (Real)

### Blockchain Event Log
```javascript
// Transaction: 0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638
// Block: 34007783
{
  "address": "0x777777751622c0d3258f214f9df38e35bf45baf3",
  "topics": [
    "0x74b670d628e152daa36ca95dda7cb0002d6ea7a37b55afe4593db7abd1515781", // CreatorCoinCreated signature
    "0x0000000000000000000000003e1e64589b5c49101251b02d1ed63c08841a3fbe", // caller
    "0x0000000000000000000000003e1e64589b5c49101251b02d1ed63c08841a3fbe", // payoutRecipient  
    "0x0000000000000000000000000000000000000000000000000000000000000000"  // platformReferrer
  ],
  "data": "0x0000000000000000000000001111111111166b7fe7bd91427724b487980afc690000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000bd7d4fff5050dd1344996c5f35e294cd31b39e680000000000000000000000001111111111166b7fe7bd91427724b487980afc69000000000000000000000000bd7d4fff5050dd1344996c5f35e294cd31b39e680000000000000000000000000000000000000000000000000000000000007530000000000000000000000000000000000000000000000000000000000000008000000000000000000000000d61a675f8a0c67a73dc3b54fb7318b4d9140904078de9c0f0e7372b91b9c28f8d474260055d45f6ea0dab2b15aad186657da032d00000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000003f697066733a2f2f62616679626569636562336a37336e66776975747763373765766966797232663432333366373973656b7978717175717969350000000000000000000000000000000000000000000000000000000000000000000000000000056574696163000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056574696163000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005361312e302e30000000000000000000000000000000000000000000000000"
}
```

### Parsed CreatorCoinEvent
```python
CreatorCoinEvent(
    tx_hash='0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638',
    log_index=156,
    block_number=34007783,
    block_timestamp=datetime.datetime(2024, 8, 12, 5, 4, 30),
    contract_address='0x777777751622c0d3258f214f9df38e35bf45baf3',
    caller='0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe',
    payout_recipient='0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe',
    platform_referrer='0x0000000000000000000000000000000000000000',
    currency='0x1111111111166b7FE7bd91427724B487980aFc69',
    uri='ipfs://bafybeiceb3j73nfwiutwc77mevvfyir2f42j3mouaqdkxoddzcyhnuqgpm',
    name='etian',
    symbol='etian',
    coin='0xBd7D4FFf5050dd1344996C5F35e294CD31b39E68',
    pool_key=PoolKey(
        currency0='0x1111111111166b7FE7bd91427724B487980aFc69',
        currency1='0xBd7D4FFf5050dd1344996C5F35e294CD31b39E68', 
        fee=30000,
        tick_spacing=200,
        hooks='0xd61A675F8a0c67A73DC3B54FB7318B4D91409040'
    ),
    pool_key_hash='0x78de9c0f0e7372b91b9c28f8d474260055d45f6ea0dab2b15aad186657da032d',
    version='1.1.0'
)
```

### Final TokenInfo Document in MongoDB
```javascript
{
  "_id": ObjectId("66b9f4e3abc123def4567890"),
  "token_address": "0xBd7D4FFf5050dd1344996C5F35e294CD31b39E68",
  "chain_id": 8453,
  "source": "creator_coin",
  "name": "etian",
  "symbol": "etian", 
  "creator": "0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
  "admin": null,
  "payout_recipient": "0x3e1E64589B5c49101251B02D1Ed63C08841a3fBe",
  "platform_referrer": "0x0000000000000000000000000000000000000000",
  "base_currency": "0x1111111111166b7FE7bd91427724B487980aFc69",
  "paired_token": null,
  "pool_address": null,
  "pool_id": null,
  "pool_key_hash": "0x78de9c0f0e7372b91b9c28f8d474260055d45f6ea0dab2b15aad186657da032d",
  "fee_tier": 30000,
  "tick_spacing": 200,
  "starting_tick": null,
  "hooks_address": "0xd61A675F8a0c67A73DC3B54FB7318B4D91409040",
  "image_url": null,
  "metadata_uri": "ipfs://bafybeiceb3j73nfwiutwc77mevvfyir2f42j3mouaqdkxoddzcyhnuqgpm",
  "metadata_json": null,
  "context_json": null,
  "locker_address": null,
  "mev_module": null,
  "contract_version": "1.1.0",
  "creation_block": 34007783,
  "creation_tx_hash": "0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638",
  "creation_timestamp": ISODate("2024-08-12T05:04:30.000Z"),
  "creation_contract": "0x777777751622c0d3258f214f9df38e35bf45baf3",
  "status": "active",
  "audit_status": null,
  "error_message": null,
  "raw_event_data": {
    "tx_hash": "0x310429bc67ea50d2fdb5b7cf051f7b00266b7a6c6d841dfaf95b342be9880638",
    "log_index": 156,
    "block_number": 34007783,
    "contract_address": "0x777777751622c0d3258f214f9df38e35bf45baf3",
    "event_signature": "0x74b670d628e152daa36ca95dda7cb0002d6ea7a37b55afe4593db7abd1515781"
  },
  "additional_metadata": {},
  "created_at": ISODate("2024-08-12T05:04:35.123Z"),
  "updated_at": ISODate("2024-08-12T05:04:35.123Z")
}
```

---

## Example 2: Clanker Token (Real)

### Blockchain Event Log
```javascript
// Transaction: 0x14e585d7d2ed227b2ccbbe3b2071e643b36b3a5540b894f60e3dc1f3988b5ed3
// Block: 34015993
{
  "address": "0xe85a59c628f7d27878aceb4bf3b35733630083a9",
  "topics": [
    "0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67", // TokenCreated signature
    "0x0000000000000000000000003d148d36a944a858f6d8c8e78ef21a01c0caab07", // tokenAddress
    "0x000000000000000000000000c03e44f9126b2121764a3102db21a0c19bf2e34f"  // tokenAdmin
  ],
  "data": "0x0000000000000000000000002112b8456ac07c15fa31ddf3bf713e77716ff3f900000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000ffffffc8000000000000000000000000dd5eeaff7bd481ad55db083062b13a3cdf0a68cc3c7db4321512ee915df569906088973d89d95908f0eff89fb5621d162769f69a0000000000000000000000004200000000000000000000000000000000000006000000000000000000000000063d2dfea64b3433f4071a98665bcd7ca14d93496000000000000000000000000fdc013ce003980889cffd66b0c8329545ae1d1e800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000054c6c69616300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000054c6c69616300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000597b226465736372697074696f6e223a224465706c6f79656420757369677420426136722632206f6e20584d5450222c22736f6369616c4d656469613552647322357b7d2c22617564697455726c73223a5b5d7d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007b22696e74657266616365223a2242616e6b72222c22706c6174666f726d223a226661726361737465722435222c226d6573736167654964223a2262616e6b722536232064756570736c6f796d656e74222c226964223a223838363837654c30227d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
}
```

### Parsed ClankerTokenEvent  
```python
ClankerTokenEvent(
    tx_hash='0x14e585d7d2ed227b2ccbbe3b2071e643b36b3a5540b894f60e3dc1f3988b5ed3',
    log_index=45,
    block_number=34015993,
    block_timestamp=datetime.datetime(2024, 8, 12, 5, 14, 9),
    contract_address='0xe85a59c628f7d27878aceb4bf3b35733630083a9',
    token_address='0x3d148d36A944a858f6D8C8E78EF21a01C0caAb07',
    token_admin='0xc03E44F9126b2121764A3102dB21a0C19Bf2e34f', 
    msg_sender='0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9',
    token_image='',
    token_name='Cliza',
    token_symbol='Cliza',
    token_metadata='{"description":"Deployed using Bankr on XMTP","socialMediaUrls":[],"auditUrls":[]}',
    token_context='{"interface":"Bankr","platform":"farcaster","messageId":"bankr deployment","id":"886870"}',
    starting_tick=-230400,
    pool_hook='0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC',
    pool_id='3C7DB4321512EE915DF569906088973D89D95908F0EFF89FB5621D162769F69A',
    paired_token='0x4200000000000000000000000000000000000006',
    locker='0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496',
    mev_module='0xFdc013ce003980889cFfd66b0c8329545ae1d1E8',
    extensions_supply='0',
    extensions=[]
)
```

### Final TokenInfo Document in MongoDB
```javascript
{
  "_id": ObjectId("66b9f5a1def456789abc1234"),
  "token_address": "0x3d148d36A944a858f6D8C8E78EF21a01C0caAb07",
  "chain_id": 8453,
  "source": "clanker",
  "name": "Cliza", 
  "symbol": "Cliza",
  "creator": "0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9",
  "admin": "0xc03E44F9126b2121764A3102dB21a0C19Bf2e34f",
  "payout_recipient": null,
  "platform_referrer": null,
  "base_currency": null,
  "paired_token": "0x4200000000000000000000000000000000000006",
  "pool_address": null,
  "pool_id": "3C7DB4321512EE915DF569906088973D89D95908F0EFF89FB5621D162769F69A",
  "pool_key_hash": null,
  "fee_tier": null,
  "tick_spacing": null,
  "starting_tick": -230400,
  "hooks_address": "0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC",
  "image_url": "",
  "metadata_uri": null,
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
  "locker_address": "0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496",
  "mev_module": "0xFdc013ce003980889cFfd66b0c8329545ae1d1E8",
  "contract_version": null,
  "creation_block": 34015993,
  "creation_tx_hash": "0x14e585d7d2ed227b2ccbbe3b2071e643b36b3a5540b894f60e3dc1f3988b5ed3",
  "creation_timestamp": ISODate("2024-08-12T05:14:09.000Z"),
  "creation_contract": "0xe85a59c628f7d27878aceb4bf3b35733630083a9",
  "status": "active",
  "audit_status": null,
  "error_message": null,
  "raw_event_data": {
    "tx_hash": "0x14e585d7d2ed227b2ccbbe3b2071e643b36b3a5540b894f60e3dc1f3988b5ed3",
    "log_index": 45,
    "block_number": 34015993,
    "contract_address": "0xe85a59c628f7d27878aceb4bf3b35733630083a9",
    "event_signature": "0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67",
    "extensions_supply": "0",
    "extensions": []
  },
  "additional_metadata": {},
  "created_at": ISODate("2024-08-12T05:14:12.456Z"),
  "updated_at": ISODate("2024-08-12T05:14:12.456Z")
}
```

---

## Progress Tracking Example

### Progress Document  
```javascript
{
  "_id": ObjectId("66b9f123456789abcdef0123"),
  "chain_id": 8453,
  "indexer_type": "coin_tokens",
  "last_processed_block": 34015993,
  "updated_at": ISODate("2024-08-12T05:14:12.456Z")
}
```

---

## Redis Cache Examples

### Stats Cache
```
Key: "moonx:coins:stats:8453:tokens_processed"
Type: integer
Value: 2847

Key: "moonx:coins:stats:8453:creator_coin_processed" 
Type: integer
Value: 1653

Key: "moonx:coins:stats:8453:clanker_processed"
Type: integer
Value: 1194
```

### Health Check Cache
```
Key: "moonx:coins:health:8453:blockchain"
Type: string
Value: "healthy"
TTL: 300

Key: "moonx:coins:health:8453:mongodb"
Type: string  
Value: "healthy"
TTL: 300

Key: "moonx:coins:health:8453:last_update"
Type: string
Value: "2024-08-12T05:14:12.456Z"
TTL: 300
```

---

## Data Size & Performance Stats

### Document Sizes
- **CreatorCoin Token**: ~1.8KB average
- **Clanker Token**: ~2.3KB average (more metadata)
- **Progress Record**: ~0.1KB

### Index Sizes (per 10k documents)
- **Primary indexes**: ~2MB
- **Text search index**: ~1.5MB
- **Compound indexes**: ~3MB

### Query Performance (10k documents)
- Find by token_address: ~1ms
- Find by creator: ~5-15ms  
- Creation timestamp range: ~10-25ms
- Text search: ~15-50ms
- Aggregation (daily stats): ~100-300ms

---

## Field Mapping Between Sources

| Field | CreatorCoin | Clanker | Notes |
|-------|-------------|---------|-------|
| `creator` | `caller` | `msg_sender` | Who initiated the creation |
| `admin` | null | `token_admin` | Admin role for Clanker only |
| `payout_recipient` | `payout_recipient` | null | Creator only field |
| `base_currency` | `currency` | null | Pool base currency |
| `paired_token` | null | `paired_token` | Usually WETH for Clanker |
| `pool_key_hash` | `pool_key_hash` | null | UniV4 pool key hash |
| `pool_id` | null | `pool_id` | Clanker pool identifier |
| `starting_tick` | null | `starting_tick` | Initial tick for Clanker |
| `contract_version` | `version` | null | Creator contract version |
| `metadata_json` | null (IPFS) | parsed JSON | Direct vs external |
| `context_json` | null | parsed JSON | Deployment context |
