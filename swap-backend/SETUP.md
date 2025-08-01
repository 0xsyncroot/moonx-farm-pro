# MoonX Swap Backend - Setup Guide

## Quick Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Environment Setup**
```bash
# Copy template
cp .env.template .env

# Edit .env với RPC URLs
nano .env
```

3. **Required Environment Variables**
```env
PORT=3001
BASE_RPC_URL=https://mainnet.base.org
```

4. **Run**
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

## API Testing

```bash
# Health check
curl http://localhost:3001/health

# Get networks
curl http://localhost:3001/api/networks

# Get quote
curl -X POST http://localhost:3001/api/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromTokenAddress":"0x0000000000000000000000000000000000000000",
    "toTokenAddress":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount":"1000000000000000000",
    "chainId":8453,
    "userAddress":"0x742d35Cc6634C0532925a3b8D07dC09E5F8b6b2f"
  }'
```

See [README.md](README.md) for full documentation. 