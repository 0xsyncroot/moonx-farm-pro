# MoonX Indexer - Deployment Guide

## Tổng quan

Hướng dẫn chi tiết để deploy MoonX Indexer Worker cho các protocols và chains khác nhau.

## Chain Configuration Examples

### Base Chain (Hiện tại - Production Ready)

```json
// config/chains/base.json
{
  "chain_id": 8453,
  "name": "Base",
  "rpc_url": "https://mainnet.base.org",
  "block_time": 2,
  "confirmation_blocks": 5,
  "pools": [
    {
      "protocol": "uniswap_v3",
      "factory": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      "router": "0x2626664c2603336E57B271c5C0b26F421741e481",
      "pool_created_topic": "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
      "swap_topic": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
      "fee_tiers": [100, 500, 3000, 10000]
    }
  ]
}
```

### Ethereum Mainnet (Multi-Protocol)

```json
// config/chains/ethereum.json
{
  "chain_id": 1,
  "name": "Ethereum",
  "rpc_url": "https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY",
  "block_time": 12,
  "confirmation_blocks": 12,
  "pools": [
    {
      "protocol": "uniswap_v2",
      "factory": "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      "router": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      "pool_created_topic": "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
      "swap_topic": "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
    },
    {
      "protocol": "uniswap_v3",
      "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      "router": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      "pool_created_topic": "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
      "swap_topic": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
      "fee_tiers": [100, 500, 3000, 10000]
    },
    {
      "protocol": "sushiswap",
      "factory": "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
      "router": "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
      "pool_created_topic": "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
      "swap_topic": "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
    },
    {
      "protocol": "balancer_v2",
      "vault": "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      "factory": "0x8E9aa87E45f71F1697B55e1C4e14fD60D5a01c1C",
      "pool_registered_topic": "0x3c13bc30b8e878c53fd2a36b679409c073afd75950be43d8858768e956fbc20e",
      "swap_topic": "0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b"
    }
  ]
}
```

### BSC (PancakeSwap Focus)

```json
// config/chains/bsc.json
{
  "chain_id": 56,
  "name": "BSC",
  "rpc_url": "https://bsc-dataseed1.binance.org",
  "block_time": 3,
  "confirmation_blocks": 15,
  "pools": [
    {
      "protocol": "pancakeswap_v2",
      "factory": "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
      "router": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      "pool_created_topic": "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
      "swap_topic": "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
    },
    {
      "protocol": "pancakeswap_v3",
      "factory": "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
      "router": "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
      "pool_created_topic": "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
      "swap_topic": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
      "fee_tiers": [100, 500, 2500, 10000]
    }
  ]
}
```

### Polygon (Multi-Protocol)

```json
// config/chains/polygon.json
{
  "chain_id": 137,
  "name": "Polygon",
  "rpc_url": "https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID",
  "block_time": 2,
  "confirmation_blocks": 10,
  "pools": [
    {
      "protocol": "uniswap_v3",
      "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      "router": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      "pool_created_topic": "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
      "swap_topic": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
      "fee_tiers": [100, 500, 3000, 10000]
    },
    {
      "protocol": "sushiswap",
      "factory": "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
      "router": "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
      "pool_created_topic": "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
      "swap_topic": "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
    }
  ]
}
```

## Environment Configuration

### Production Environment

```env
# .env.production
NODE_ENV=production

# Database
MONGODB_URL=mongodb://mongodb-cluster:27017/moonx_indexer_prod
REDIS_URL=redis://redis-cluster:6379

# Worker Settings
WORKER_INTERVAL_SECONDS=60
WORKER_POOL_SIZE=50
WORKER_RETRY_DELAY=30
LOCK_TIMEOUT_SECONDS=300

# Chain Configuration
CHAIN_ID=8453
CHAIN_CONFIG_PATH=config/chains/base.json

# Monitoring
HEALTH_CHECK_PORT=8080
METRICS_PORT=9090

# Logging
LOG_LEVEL=INFO
STRUCTURED_LOGGING=true

# Performance
MAX_BLOCK_RANGE=1000
RPC_TIMEOUT_SECONDS=30
MAX_CONCURRENT_REQUESTS=20
```

### Development Environment

```env
# .env.development
NODE_ENV=development

# Database
MONGODB_URL=mongodb://localhost:27017/moonx_indexer_dev
REDIS_URL=redis://localhost:6379

# Worker Settings
WORKER_INTERVAL_SECONDS=30
WORKER_POOL_SIZE=10
WORKER_RETRY_DELAY=5
LOCK_TIMEOUT_SECONDS=60

# Chain Configuration
CHAIN_ID=8453
CHAIN_CONFIG_PATH=config/chains/base.json

# Monitoring
HEALTH_CHECK_PORT=8080
METRICS_PORT=9090

# Logging
LOG_LEVEL=DEBUG
STRUCTURED_LOGGING=true

# Performance
MAX_BLOCK_RANGE=100
RPC_TIMEOUT_SECONDS=10
MAX_CONCURRENT_REQUESTS=5
```

## Deployment Strategies

### 1. Single Chain Deployment

```bash
# Deploy cho Base chain
cd workers/indexer-worker

# Set environment
export CHAIN_ID=8453
export CHAIN_CONFIG_PATH=config/chains/base.json

# Deploy using Docker
./deploy.sh --mode docker --chain base --env production

# Hoặc Kubernetes
./deploy.sh --mode k8s --chain base --namespace moonx-prod
```

### 2. Multi-Chain Deployment

```yaml
# k8s-multi-chain.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: moonx-indexer-ethereum
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: indexer
        image: moonx-indexer:latest
        env:
        - name: CHAIN_ID
          value: "1"
        - name: CHAIN_CONFIG_PATH
          value: "config/chains/ethereum.json"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: apps/v1
kind: Deployment  
metadata:
  name: moonx-indexer-bsc
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: indexer
        image: moonx-indexer:latest
        env:
        - name: CHAIN_ID
          value: "56"
        - name: CHAIN_CONFIG_PATH
          value: "config/chains/bsc.json"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: moonx-indexer-polygon
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: indexer
        image: moonx-indexer:latest
        env:
        - name: CHAIN_ID
          value: "137"
        - name: CHAIN_CONFIG_PATH  
          value: "config/chains/polygon.json"
```

### 3. Protocol-Specific Deployment

```bash
# Deploy chỉ Uniswap V3 trên multiple chains
for chain in ethereum base polygon arbitrum; do
  kubectl create namespace moonx-${chain}
  
  # Custom config chỉ V3
  cat > temp-${chain}.json << EOF
{
  "pools": [
    {
      "protocol": "uniswap_v3",
      "factory": "${UNISWAP_V3_FACTORIES[$chain]}",
      "pool_created_topic": "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"
    }
  ]
}
EOF
  
  kubectl create configmap chain-config --from-file=config.json=temp-${chain}.json -n moonx-${chain}
  kubectl apply -f k8s-deployment.yaml -n moonx-${chain}
done
```

## Docker Compose for Development

```yaml
# docker-compose.development.yml
version: '3.8'

services:
  # Ethereum Indexer
  indexer-ethereum:
    build: .
    environment:
      - CHAIN_ID=1
      - CHAIN_CONFIG_PATH=config/chains/ethereum.json
      - MONGODB_URL=mongodb://mongodb:27017/moonx_indexer_eth
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./config:/app/config
    restart: unless-stopped

  # BSC Indexer  
  indexer-bsc:
    build: .
    environment:
      - CHAIN_ID=56
      - CHAIN_CONFIG_PATH=config/chains/bsc.json
      - MONGODB_URL=mongodb://mongodb:27017/moonx_indexer_bsc
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./config:/app/config
    restart: unless-stopped

  # Base Indexer
  indexer-base:
    build: .
    environment:
      - CHAIN_ID=8453
      - CHAIN_CONFIG_PATH=config/chains/base.json
      - MONGODB_URL=mongodb://mongodb:27017/moonx_indexer_base
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./config:/app/config
    restart: unless-stopped

  # Shared MongoDB
  mongodb:
    image: mongo:7.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      - ./init-mongo.js:/docker-entrypoint-initdb.d/init-mongo.js
    restart: unless-stopped

  # Shared Redis
  redis:
    image: redis:7.0-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  # Monitoring
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  mongodb_data:
  redis_data:
  grafana_data:
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'moonx-indexer'
    static_configs:
      - targets:
        - 'indexer-ethereum:9090'
        - 'indexer-bsc:9090'
        - 'indexer-base:9090'
        - 'indexer-polygon:9090'
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'mongodb'
    static_configs:
      - targets: ['mongodb-exporter:9216']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "MoonX Indexer Dashboard",
    "panels": [
      {
        "title": "Pools Indexed by Chain",
        "type": "stat",
        "targets": [
          {
            "expr": "sum by (chain_id) (pools_indexed_total)"
          }
        ]
      },
      {
        "title": "Swap Events Processed",
        "type": "graph", 
        "targets": [
          {
            "expr": "rate(swap_events_processed_total[5m])"
          }
        ]
      },
      {
        "title": "Price Calculation Latency",
        "type": "heatmap",
        "targets": [
          {
            "expr": "price_calculation_duration_seconds"
          }
        ]
      }
    ]
  }
}
```

## Performance Tuning

### 1. RPC Optimization

```env
# Optimize for high throughput
MAX_CONCURRENT_REQUESTS=50
RPC_TIMEOUT_SECONDS=60
BATCH_SIZE=1000

# Use premium RPC providers
ETH_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
BSC_RPC_URL=https://speedy-nodes-nyc.moralis.io/YOUR_KEY/bsc/mainnet
```

### 2. Database Tuning

```javascript
// MongoDB optimization
db.pools.createIndex({ "chain_id": 1, "protocol": 1, "creation_block": -1 })
db.swap_events.createIndex({ "chain_id": 1, "pool_address": 1, "block_number": -1 })
db.price_calculations.createIndex({ "chain_id": 1, "pool_address": 1, "timestamp": -1 })

// Connection pool settings
mongodb_url = "mongodb://mongodb:27017/moonx_indexer?maxPoolSize=50&minPoolSize=5"
```

### 3. Redis Configuration

```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000

# Connection settings
tcp-keepalive 300
timeout 0
```

### 4. Kubernetes Resource Limits

```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi" 
    cpu: "1000m"

# HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: indexer-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: moonx-indexer
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource  
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Troubleshooting

### Common Issues

1. **RPC Rate Limiting**
```bash
# Check logs
kubectl logs -f deployment/moonx-indexer | grep "rate limit"

# Solution: Reduce concurrency
export MAX_CONCURRENT_REQUESTS=10
```

2. **MongoDB Connection Issues**
```bash
# Check connection
python main.py health

# Solution: Increase connection pool
export MONGODB_MAX_POOL_SIZE=100
```

3. **Redis Memory Issues**
```bash
# Check Redis memory
redis-cli info memory

# Solution: Increase Redis memory or adjust TTL
export CACHE_TTL_SECONDS=3600
```

### Health Check Commands

```bash
# Overall health
curl http://localhost:8080/health

# Specific component health
curl http://localhost:8080/health/database
curl http://localhost:8080/health/cache
curl http://localhost:8080/health/rpc

# Metrics
curl http://localhost:9090/metrics
```

Deployment guide này cung cấp tất cả thông tin cần thiết để deploy worker trên các environment và chains khác nhau một cách hiệu quả.