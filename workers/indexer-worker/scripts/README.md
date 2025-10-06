# Creation Block Validation

## Problem
The `creation_block` values in pool configurations can be inaccurate, leading to:
- ❌ **Wasted resources**: Scanning blocks that don't have any pools
- ❌ **Slow indexing**: Unnecessary RPC calls to empty blocks  
- ❌ **Missing data**: Starting from wrong block number

## Solution

### 1. Automatic Detection Script

Run the validation script to automatically detect correct creation blocks:

```bash
# Validate Base chain (default)
python scripts/validate_creation_blocks.py

# Validate specific chain
python scripts/validate_creation_blocks.py 1  # Ethereum
python scripts/validate_creation_blocks.py 137  # Polygon
```

### 2. What the script does

1. **Contract Creation Detection**: Finds when the factory/manager contract was deployed
2. **First Event Search**: Binary search to find first pool creation event
3. **Validation**: Compares detected vs configured values
4. **Auto-update**: Optionally updates config files with correct values

### 3. Example Output

```
🔍 Validating creation blocks for Base (Chain ID: 8453)

📊 [1/4] Validating uniswap_v2...
   Current config: 18,000,000
   🎯 Detected: 17,856,234
   ✅ Close match (diff: 143,766 blocks)

📊 [2/4] Validating aerodrome...
   Current config: 2,500,000
   🎯 Detected: 7,845,123
   ⚠️  Large difference: 5,345,123 blocks

📊 VALIDATION SUMMARY
✅ OK: uniswap_v2, uniswap_v3
⚠️  UPDATE_NEEDED: aerodrome
📝 ADD_DETECTED: uniswap_v4
```

### 4. Fallback Strategy

The indexer now uses protocol-specific creation blocks:

```python
# Before (only used global start_block)
start_block = max(latest_block - max_scan_blocks, chain_config.start_block)

# After (respects protocol creation_block)  
protocol_creation_block = pool_config.get("creation_block")
actual_start_block = max(start_block, protocol_creation_block)
```

## Benefits

- 🚀 **Faster indexing**: Skip irrelevant blocks
- 💰 **Lower costs**: Fewer RPC calls
- 🎯 **Accurate data**: Start from correct deployment block
- 🔄 **Auto-validation**: Scripts handle the hard work

## Current Values (Base Chain)

| Protocol | Current Config | Status | Notes |
|----------|---------------|--------|-------|
| Uniswap V2 | 18,000,000 | ✅ Reasonable | Factory deployed around this time |
| Uniswap V3 | 18,000,000 | ✅ Reasonable | Similar deployment period |  
| Uniswap V4 | 18,500,000 | ⚠️ Estimate | **Needs validation** - V4 is newer |
| Aerodrome | 7,000,000 | ⚠️ Estimate | **Needs validation** - Native Base DEX |

> **Note**: Run the validation script to get exact values for your chain!
