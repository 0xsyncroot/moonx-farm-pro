# Configuration Guide - MoonX Indexer Worker

## 📋 Overview

This guide covers all configuration options for the MoonX Indexer Worker, including environment variables, chain configurations, and performance tuning.

## 🔧 Environment Configuration

### Core Settings

```bash
# Application
MOONX_ENV=production                    # Environment: development, staging, production
MOONX_DEBUG=false                       # Enable debug mode
MOONX_LOG_LEVEL=INFO                   # DEBUG, INFO, WARNING, ERROR
MOONX_LOG_FORMAT=json                  # json, console

# Database Configuration
MOONX_MONGODB_URL=mongodb://localhost:27017
MOONX_MONGODB_DATABASE=moonx_indexer
MOONX_MONGODB_MIN_POOL_SIZE=5          # Minimum connection pool size
MOONX_MONGODB_MAX_POOL_SIZE=20         # Maximum connection pool size

# Redis Configuration  
MOONX_REDIS_URL=redis://localhost:6379
MOONX_REDIS_PASSWORD=""                # Redis password (if required)
MOONX_REDIS_DB=0                       # Redis database number
MOONX_REDIS_POOL_SIZE=10               # Redis connection pool size
```

### Blockchain Configuration

```bash
# RPC Configuration
MOONX_RPC_URL_BASE=https://mainnet.base.org
MOONX_RPC_TIMEOUT=30                   # RPC request timeout in seconds
MOONX_RPC_MAX_RETRIES=3               # Maximum retry attempts
MOONX_RPC_RETRY_DELAY=1               # Delay between retries in seconds

# Block Processing
MOONX_MAX_BLOCKS_PER_REQUEST=2000     # Maximum blocks per RPC request
MOONX_CONFIRMATION_BLOCKS=5           # Number of confirmation blocks
MOONX_BATCH_SIZE=100                  # Batch size for database operations
```

### Performance Configuration

```bash
# Parallel Processing
MOONX_ENABLE_DISTRIBUTED_PROCESSING=true
MOONX_WORKER_POOL_SIZE=4              # Base worker pool size
MOONX_MAX_CONCURRENT_PROTOCOLS=4      # Max protocols processed in parallel
MOONX_MAX_CONCURRENT_LOGS_PER_PROTOCOL=20  # Max logs per protocol in parallel
MOONX_LOG_BATCH_SIZE=10               # Logs per batch
MOONX_DATABASE_BATCH_SIZE=100         # Database operations per batch

# Resource Limits
MOONX_MAX_MEMORY_USAGE_MB=2048        # Maximum memory usage in MB
MOONX_MAX_PROCESSING_TIME_MINUTES=60  # Maximum processing time per batch
```

### Monitoring & Logging

```bash
# Monitoring
MOONX_ENABLE_METRICS=true             # Enable metrics collection
MOONX_METRICS_PORT=9090               # Metrics server port
MOONX_HEALTH_CHECK_PORT=8080          # Health check server port

# Logging
MOONX_LOG_FILE_PATH=""                # Log file path (empty for stdout)
MOONX_LOG_ROTATION_SIZE_MB=100        # Log rotation size
MOONX_LOG_RETENTION_DAYS=30           # Log retention days
```

## ⛓️ Chain Configuration

### Base Chain Configuration
**File**: `config/chains/base.json`

```json
{
  "chain_id": 8453,
  "name": "Base Mainnet",
  "rpc_url": "https://mainnet.base.org",
  "block_time": 2,
  "confirmation_blocks": 5,
  "start_block": 18000000,
  "max_block_range": 2000,
  "gas_price_strategy": "fast",
  
  "pools": [
    {
      "protocol": "uniswap_v3",
      "enabled": true,
      "factory": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      "pool_created_topic": "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
      "swap_topic": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
      "creation_block": 18000000
    },
    {
      "protocol": "uniswap_v4",
      "enabled": true,
      "pool_manager": "0x...",
      "pool_init_topic": "0x...",
      "swap_topic": "0x...",
      "creation_block": 18500000
    },
    {
      "protocol": "aerodrome",
      "enabled": true,
      "factory": "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
      "pool_created_topic": "0x...",
      "swap_topic": "0x...",
      "creation_block": 18000000
    }
  ]
}
```

### Configuration Fields Explained

| Field | Description | Example |
|-------|-------------|---------|
| `chain_id` | Blockchain chain identifier | `8453` |
| `rpc_url` | RPC endpoint URL | `"https://mainnet.base.org"` |
| `block_time` | Average block time in seconds | `2` |
| `start_block` | Block to start indexing from | `18000000` |
| `max_block_range` | Maximum blocks per request | `2000` |
| `factory` | DEX factory contract address | `"0x33128a8f..."` |
| `pool_created_topic` | Pool creation event topic | `"0x783cca1c..."` |
| `creation_block` | Block when protocol was deployed | `18000000` |

## ⚡ Performance Tuning

### 1. **Parallel Processing Configuration**

#### Conservative Settings (Low Resource Systems)
```bash
MOONX_MAX_CONCURRENT_PROTOCOLS=2
MOONX_MAX_CONCURRENT_LOGS_PER_PROTOCOL=10
MOONX_LOG_BATCH_SIZE=5
MOONX_WORKER_POOL_SIZE=2
```

#### Aggressive Settings (High Resource Systems)
```bash
MOONX_MAX_CONCURRENT_PROTOCOLS=8
MOONX_MAX_CONCURRENT_LOGS_PER_PROTOCOL=50
MOONX_LOG_BATCH_SIZE=20
MOONX_WORKER_POOL_SIZE=8
```

#### Production Recommended
```bash
MOONX_MAX_CONCURRENT_PROTOCOLS=4
MOONX_MAX_CONCURRENT_LOGS_PER_PROTOCOL=20
MOONX_LOG_BATCH_SIZE=10
MOONX_WORKER_POOL_SIZE=4
```

### 2. **RPC Optimization**

#### High-Throughput RPC
```bash
MOONX_RPC_TIMEOUT=10                  # Faster timeout
MOONX_MAX_BLOCKS_PER_REQUEST=5000     # Larger batch size
MOONX_RPC_MAX_RETRIES=5               # More retries
```

#### Rate-Limited RPC  
```bash
MOONX_RPC_TIMEOUT=60                  # Longer timeout
MOONX_MAX_BLOCKS_PER_REQUEST=500      # Smaller batch size
MOONX_RPC_MAX_RETRIES=2               # Fewer retries
```

### 3. **Database Optimization**

#### High-Write Load
```bash
MOONX_DATABASE_BATCH_SIZE=500         # Larger batches
MOONX_MONGODB_MAX_POOL_SIZE=50        # More connections
```

#### Memory-Constrained
```bash
MOONX_DATABASE_BATCH_SIZE=50          # Smaller batches
MOONX_MONGODB_MAX_POOL_SIZE=10        # Fewer connections
```

## 🔄 Runtime Configuration

### CLI Options

```bash
# Start with specific configuration
python main.py start \
  --chain-id 8453 \
  --log-level DEBUG \
  --log-format console \
  --reset-progress \
  --debug

# Benchmark performance
python main.py benchmark \
  --chain-id 8453 \
  --blocks 1000

# Debug blockchain connection
python main.py debug-blockchain \
  --chain-id 8453

# View current configuration
python main.py config
```

### Configuration Override Priority

1. **CLI Arguments** (highest priority)
2. **Environment Variables**
3. **Configuration Files**
4. **Default Values** (lowest priority)

```bash
# Example: Override log level
export MOONX_LOG_LEVEL=DEBUG          # Environment variable
python main.py start --log-level INFO # CLI override (wins)
```

## 🏗️ Production Setup

### Docker Environment
```dockerfile
# Dockerfile
ENV MOONX_LOG_LEVEL=INFO
ENV MOONX_LOG_FORMAT=json
ENV MOONX_MAX_CONCURRENT_PROTOCOLS=4
ENV MOONX_MONGODB_URL=mongodb://mongo:27017
ENV MOONX_REDIS_URL=redis://redis:6379
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  indexer:
    build: .
    environment:
      - MOONX_LOG_LEVEL=INFO
      - MOONX_MONGODB_URL=mongodb://mongo:27017
      - MOONX_REDIS_URL=redis://redis:6379
      - MOONX_RPC_URL_BASE=https://mainnet.base.org
    depends_on:
      - mongo
      - redis
      
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
      
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

### Kubernetes ConfigMap
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: indexer-config
data:
  MOONX_LOG_LEVEL: "INFO"
  MOONX_LOG_FORMAT: "json"
  MOONX_MAX_CONCURRENT_PROTOCOLS: "4"
  MOONX_WORKER_POOL_SIZE: "4"
  MOONX_MAX_BLOCKS_PER_REQUEST: "2000"
```

## 🔍 Monitoring Configuration

### Metrics Configuration
```bash
# Enable Prometheus metrics
MOONX_ENABLE_METRICS=true
MOONX_METRICS_PORT=9090
MOONX_METRICS_PATH="/metrics"

# Custom metrics
MOONX_TRACK_PROCESSING_TIME=true
MOONX_TRACK_ERROR_RATES=true
MOONX_TRACK_THROUGHPUT=true
```

### Health Check Configuration
```bash
# Health check endpoint
MOONX_HEALTH_CHECK_PORT=8080
MOONX_HEALTH_CHECK_PATH="/health"
MOONX_HEALTH_CHECK_TIMEOUT=30
```

### Log Configuration for Monitoring
```bash
# Structured logging for monitoring
MOONX_LOG_FORMAT=json
MOONX_LOG_LEVEL=INFO
MOONX_LOG_INCLUDE_FIELDS="timestamp,level,message,chain_id,protocol,duration,error"
```

## 🚨 Security Configuration

### Database Security
```bash
# MongoDB authentication
MOONX_MONGODB_USERNAME=indexer_user
MOONX_MONGODB_PASSWORD=secure_password
MOONX_MONGODB_AUTH_SOURCE=admin

# Redis authentication
MOONX_REDIS_PASSWORD=redis_password
MOONX_REDIS_USERNAME=indexer_user
```

### Network Security
```bash
# Rate limiting
MOONX_RATE_LIMIT_REQUESTS_PER_MINUTE=1000
MOONX_RATE_LIMIT_BURST_SIZE=100

# Connection security
MOONX_ENABLE_TLS=true
MOONX_TLS_CERT_PATH="/path/to/cert.pem"
MOONX_TLS_KEY_PATH="/path/to/key.pem"
```

## 🧪 Testing Configuration

### Development Settings
```bash
# Development environment
MOONX_ENV=development
MOONX_LOG_LEVEL=DEBUG
MOONX_LOG_FORMAT=console
MOONX_MAX_BLOCKS_PER_REQUEST=100      # Smaller batches for testing
MOONX_MAX_CONCURRENT_PROTOCOLS=1      # Sequential for debugging
```

### Testing Settings
```bash
# Testing environment
MOONX_ENV=testing
MOONX_MONGODB_DATABASE=moonx_indexer_test
MOONX_REDIS_DB=1                      # Separate Redis DB for tests
MOONX_RPC_TIMEOUT=5                   # Faster timeouts for tests
```

## 📊 Configuration Validation

### Environment Validation
```bash
# Validate configuration before starting
python main.py validate-config

# Check RPC connectivity
python main.py check-rpc --chain-id 8453

# Test database connection
python main.py check-db
```

### Configuration Templates

#### Minimal Configuration
```bash
# Minimal required settings
MOONX_MONGODB_URL=mongodb://localhost:27017
MOONX_REDIS_URL=redis://localhost:6379
MOONX_RPC_URL_BASE=https://mainnet.base.org
```

#### Full Production Configuration
```bash
# See environment.example for complete production configuration
cp environment.example .env
# Edit .env with your specific values
```

---

For more details on specific configuration options, refer to the `environment.example` file in the project root.