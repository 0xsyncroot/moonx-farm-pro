# API Reference - MoonX Indexer Worker

## 📋 Overview

This document provides a comprehensive reference for interacting with the MoonX Indexer Worker system, including CLI commands, database queries, and monitoring endpoints.

## 🖥️ CLI Commands

### Main Commands

#### `start` - Start the Indexer Worker
```bash
python main.py start [OPTIONS]
```

**Options:**
- `--chain-id INTEGER` - Specific chain ID to index (optional)
- `--log-level [DEBUG|INFO|WARNING|ERROR]` - Set logging level
- `--log-format [json|console]` - Set log output format  
- `--debug` - Enable debug logging (same as --log-level DEBUG)
- `--reset-progress` - Reset indexing progress and start fresh

**Examples:**
```bash
# Start with default settings
python main.py start

# Start with specific chain and debug logging
python main.py start --chain-id 8453 --debug --log-format console

# Reset progress and start fresh
python main.py start --reset-progress --log-level INFO
```

#### `config` - Display Current Configuration
```bash
python main.py config
```
Shows all current configuration values including environment variables and chain configurations.

#### `debug-blockchain` - Test Blockchain Connection
```bash
python main.py debug-blockchain [OPTIONS]
```

**Options:**
- `--chain-id INTEGER` - Chain ID to test (default: 8453)

**Output Example:**
```
🔍 Testing blockchain connection for Base (8453)...
✅ RPC connection: SUCCESS
✅ Latest block: 18,650,123
✅ Block time: 2.1s average

📊 Protocol Testing:
   • uniswap_v3: 45 logs found
   • aerodrome: 23 logs found  
   • sushiswap: 12 logs found
```

#### `benchmark` - Performance Benchmark
```bash
python main.py benchmark [OPTIONS]
```

**Options:**
- `--chain-id INTEGER` - Chain ID to benchmark (default: 8453)
- `--blocks INTEGER` - Number of blocks to test (default: 100)

**Output Example:**
```
🏁 Running performance benchmark...
⛓️  Chain ID: 8453
📊 Blocks to test: 1000

📊 BENCHMARK RESULTS:
   ⏰ Sequential: 45.23s
   🚀 Parallel: 8.76s
   ⚡ Speedup: 5.16x
   📈 Improvement: 80.6%
   📋 Total logs: 2,347
```

#### `test-logging` - Test Log Configuration
```bash
python main.py test-logging [OPTIONS]
```

**Options:**
- `--log-format [json|console]` - Log format to test
- `--log-level [DEBUG|INFO|WARNING|ERROR]` - Log level to test

### Utility Commands

#### Environment Variable Testing
```bash
# Test with specific environment
MOONX_LOG_LEVEL=DEBUG python main.py test-logging

# Test configuration loading
MOONX_RPC_URL_BASE=https://custom-rpc.com python main.py config
```

## 🗃️ Database API

### MongoDB Query Examples

#### Pool Queries

##### Get All Active Pools
```python
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def get_active_pools(chain_id: int):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    pools = await db.pools.find({
        "chain_id": chain_id,
        "status": "active"
    }).to_list(None)
    
    return pools

# Usage
pools = asyncio.run(get_active_pools(8453))
```

##### Get Pool by Address
```python
async def get_pool_by_address(pool_address: str, chain_id: int):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    pool = await db.pools.find_one({
        "pool_address": pool_address,
        "chain_id": chain_id
    })
    
    return pool

# Usage
pool = asyncio.run(get_pool_by_address("0x1234...", 8453))
```

##### Get Pools by Protocol
```python
async def get_pools_by_protocol(protocol: str, chain_id: int):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    pools = await db.pools.find({
        "chain_id": chain_id,
        "protocol": protocol,
        "status": "active"
    }).sort("creation_block", -1).to_list(100)
    
    return pools

# Usage
uniswap_pools = asyncio.run(get_pools_by_protocol("uniswap_v3", 8453))
```

##### Get Pools by Token
```python
async def get_pools_by_token(token_address: str, chain_id: int):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    pools = await db.pools.find({
        "chain_id": chain_id,
        "$or": [
            {"token0.address": token_address},
            {"token1.address": token_address}
        ],
        "status": "active"
    }).to_list(None)
    
    return pools

# Usage
usdc_pools = asyncio.run(get_pools_by_token("0xa0b86a33e...", 8453))
```

#### Swap Event Queries

##### Get Recent Swaps for Pool
```python
from datetime import datetime, timedelta

async def get_recent_swaps(pool_address: str, hours: int = 24):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    swaps = await db.swap_events.find({
        "pool_address": pool_address,
        "block_timestamp": {"$gte": since}
    }).sort("block_timestamp", -1).to_list(1000)
    
    return swaps

# Usage
recent_swaps = asyncio.run(get_recent_swaps("0x1234...", 24))
```

##### Get Swaps by Transaction
```python
async def get_swaps_by_tx(tx_hash: str):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    swaps = await db.swap_events.find({
        "tx_hash": tx_hash
    }).to_list(None)
    
    return swaps

# Usage
tx_swaps = asyncio.run(get_swaps_by_tx("0xabcdef..."))
```

##### Get Large Swaps (Volume Filter)
```python
async def get_large_swaps(min_usd_value: float, chain_id: int, hours: int = 24):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    swaps = await db.swap_events.find({
        "chain_id": chain_id,
        "block_timestamp": {"$gte": since},
        "usd_value": {"$gte": str(min_usd_value)}  # Note: string comparison
    }).sort("usd_value", -1).to_list(100)
    
    return swaps

# Usage
large_swaps = asyncio.run(get_large_swaps(10000.0, 8453))
```

#### Price Calculation Queries

##### Get Latest Price for Pool
```python
async def get_latest_price(pool_address: str):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    price_calc = await db.price_calculations.find_one({
        "pool_address": pool_address
    }, sort=[("timestamp", -1)])
    
    return price_calc

# Usage
latest_price = asyncio.run(get_latest_price("0x1234..."))
```

##### Get Price History
```python
async def get_price_history(pool_address: str, hours: int = 24):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    since_timestamp = int((datetime.utcnow() - timedelta(hours=hours)).timestamp())
    
    prices = await db.price_calculations.find({
        "pool_address": pool_address,
        "timestamp": {"$gte": since_timestamp}
    }).sort("timestamp", 1).to_list(1000)
    
    return prices

# Usage
price_history = asyncio.run(get_price_history("0x1234...", 168))  # 1 week
```

#### Progress Tracking Queries

##### Get Indexing Progress
```python
async def get_indexing_progress(chain_id: int, indexer_type: str = "pools"):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    progress = await db.indexer_progress.find_one({
        "chain_id": chain_id,
        "indexer_type": indexer_type
    })
    
    return progress

# Usage
pool_progress = asyncio.run(get_indexing_progress(8453, "pools"))
swap_progress = asyncio.run(get_indexing_progress(8453, "swaps"))
```

##### Get All Chain Progress
```python
async def get_all_progress():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    progress_records = await db.indexer_progress.find({}).to_list(None)
    
    return progress_records

# Usage
all_progress = asyncio.run(get_all_progress())
```

### Aggregation Pipeline Examples

#### Pool Statistics
```python
async def get_pool_statistics(chain_id: int):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    pipeline = [
        {"$match": {"chain_id": chain_id, "status": "active"}},
        {"$group": {
            "_id": "$protocol",
            "pool_count": {"$sum": 1},
            "avg_creation_block": {"$avg": "$creation_block"}
        }},
        {"$sort": {"pool_count": -1}}
    ]
    
    stats = await db.pools.aggregate(pipeline).to_list(None)
    return stats

# Usage
stats = asyncio.run(get_pool_statistics(8453))
```

#### Daily Swap Volume
```python
async def get_daily_swap_volume(chain_id: int, days: int = 7):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.moonx_indexer
    
    since = datetime.utcnow() - timedelta(days=days)
    
    pipeline = [
        {"$match": {
            "chain_id": chain_id,
            "block_timestamp": {"$gte": since},
            "usd_value": {"$exists": True, "$ne": None}
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$block_timestamp"},
                "month": {"$month": "$block_timestamp"},
                "day": {"$dayOfMonth": "$block_timestamp"}
            },
            "total_volume": {"$sum": {"$toDouble": "$usd_value"}},
            "swap_count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    volume_data = await db.swap_events.aggregate(pipeline).to_list(None)
    return volume_data

# Usage
daily_volume = asyncio.run(get_daily_swap_volume(8453, 30))
```

## 🔧 Repository Layer API

### Pool Repository

```python
from repositories.mongodb import MongoPoolRepository

# Initialize repository
pool_repo = MongoPoolRepository(database_url, database_name)
await pool_repo.connect()

# Save a pool
await pool_repo.save_pool(pool_info)

# Get pools by chain
pools = await pool_repo.get_pools_by_chain(8453)

# Update pool status
await pool_repo.update_pool_status(8453, "0x1234...", "active", 18600000)
```

### Swap Event Repository

```python
from repositories.mongodb import MongoSwapEventRepository

# Initialize repository
swap_repo = MongoSwapEventRepository(database_url, database_name)
await swap_repo.connect()

# Save swap event
await swap_repo.save_swap_event(swap_event)

# Get swaps by pool
swaps = await swap_repo.get_swaps_by_pool("0x1234...", limit=100)
```

### Progress Repository

```python
from repositories.mongodb import MongoProgressRepository

# Initialize repository
progress_repo = MongoProgressRepository(database_url, database_name)
await progress_repo.connect()

# Get progress
progress = await progress_repo.get_progress(8453, "pools")

# Update progress
await progress_repo.update_progress(8453, "pools", 18600000, "running")

# Delete progress (for reset)
await progress_repo.delete_progress(8453, "pools")
```

## 📊 Monitoring API

### Health Check Endpoint
```bash
# Check application health
curl http://localhost:8080/health

# Response
{
  "status": "healthy",
  "timestamp": "2024-12-01T10:30:00Z",
  "uptime_seconds": 3600,
  "version": "1.0.0",
  "services": {
    "mongodb": "connected",
    "redis": "connected",
    "blockchain_rpc": "connected"
  }
}
```

### Metrics Endpoint
```bash
# Get Prometheus metrics
curl http://localhost:9090/metrics

# Sample metrics
# HELP moonx_pools_indexed_total Total number of pools indexed
# TYPE moonx_pools_indexed_total counter
moonx_pools_indexed_total{chain_id="8453",protocol="uniswap_v3"} 1250

# HELP moonx_swaps_processed_total Total number of swaps processed  
# TYPE moonx_swaps_processed_total counter
moonx_swaps_processed_total{chain_id="8453",pool_address="0x1234"} 5420

# HELP moonx_processing_duration_seconds Time spent processing blocks
# TYPE moonx_processing_duration_seconds histogram
moonx_processing_duration_seconds_bucket{protocol="uniswap_v3",le="1.0"} 100
```

## 🚨 Error Handling

### Common Error Patterns

#### RPC Connection Errors
```python
try:
    await blockchain_service.get_latest_block()
except RPCTimeoutError as e:
    logger.error("RPC timeout", error=str(e))
    # Retry logic
except RPCConnectionError as e:
    logger.error("RPC connection failed", error=str(e))
    # Fallback RPC or circuit breaker
```

#### Database Errors
```python
try:
    await pool_repo.save_pool(pool_info)
except DatabaseConnectionError as e:
    logger.error("Database connection lost", error=str(e))
    # Reconnection logic
except ValidationError as e:
    logger.error("Invalid pool data", error=str(e))
    # Data validation and cleanup
```

#### Processing Errors
```python
try:
    await indexer_service.process_protocols()
except ProcessingError as e:
    logger.error("Processing failed", error=str(e))
    # Update progress with error status
    # Continue with next batch
```

## 📚 Python SDK Examples

### Basic Usage
```python
import asyncio
from services.indexer import IndexerService
from config.settings import get_settings
from config.chains import load_chain_configs

async def main():
    # Load configuration
    settings = get_settings()
    chain_configs = load_chain_configs()
    
    # Initialize indexer for Base chain
    base_config = chain_configs[8453]
    indexer = IndexerService(base_config, settings)
    
    # Connect to services
    await indexer.connect()
    
    try:
        # Start indexing pools
        await indexer.index_pools()
        
        # Process swaps for discovered pools
        await indexer.index_swaps()
        
    finally:
        # Cleanup
        await indexer.disconnect()

# Run
asyncio.run(main())
```

### Custom Pool Processing
```python
async def process_custom_protocol():
    # Load specific protocol configuration
    protocol_config = {
        "protocol": "custom_dex",
        "factory": "0x...",
        "pool_created_topic": "0x...",
        "swap_topic": "0x...",
        "enabled": True
    }
    
    # Process pools for custom protocol
    indexer = IndexerService(chain_config, settings)
    await indexer.connect()
    
    try:
        await indexer._index_pools_for_protocol(
            protocol_config, 
            start_block=18000000, 
            end_block=18100000
        )
    finally:
        await indexer.disconnect()
```

---

This API reference provides comprehensive examples for interacting with the MoonX Indexer Worker. For implementation details, refer to the source code and model definitions.