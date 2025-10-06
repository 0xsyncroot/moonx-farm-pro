# MoonX Swap Backend API

Backend service cho MoonX Swap DApp, cung cấp APIs để fetch networks, tokens và build swap calldata theo chuẩn MoonX-Swap-Guide.md.

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm hoặc yarn
- TypeScript
- MongoDB (for token indexer data)
- Redis (for caching)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd swap-backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env với các giá trị phù hợp

# Development
npm run dev

# Production build
npm run build
npm start
```

## 📋 Environment Variables

Tạo file `.env` với các biến sau:

```env
# Server Configuration
PORT=3001
HOST=0.0.0.0

# Database Configuration
# MongoDB connection string for token indexer data (from coin-indexer-worker)
MONGODB_URI=mongodb://localhost:27017/moonx_indexer

# Redis connection string for caching pool information and token prices
REDIS_URL=redis://localhost:6379

# Blockchain RPCs - Configure for networks you want to support
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://eth.llamarpc.com
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# MoonX Contract Addresses by Network
MOONX_BASE_CONTRACT_ADDRESS=0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630
# MOONX_ETHEREUM_CONTRACT_ADDRESS=
# MOONX_POLYGON_CONTRACT_ADDRESS=

# API Configuration (Optional)
CORS_ORIGIN=*
LOG_LEVEL=info

# Cache Settings (Optional)
ENABLE_CACHE=true
CACHE_TTL_NETWORKS=600000  # 10 minutes
CACHE_TTL_TOKENS=120000    # 2 minutes
```

### Environment Variables chi tiết:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | Port server sẽ listen |
| `HOST` | No | 0.0.0.0 | Host address để bind |
| `MONGODB_URI` | No | mongodb://localhost:27017/moonx_indexer | MongoDB connection cho token data từ indexer |
| `REDIS_URL` | No | redis://localhost:6379 | Redis connection cho caching pool info + prices |
| `BASE_RPC_URL` | Yes | - | RPC URL cho Base mainnet |
| `ETHEREUM_RPC_URL` | No | - | RPC URL cho Ethereum mainnet |
| `BASE_SEPOLIA_RPC_URL` | No | - | RPC URL cho Base testnet |
| `MOONX_BASE_CONTRACT_ADDRESS` | No | 0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630 | MoonX contract address trên Base |
| `MOONX_ETHEREUM_CONTRACT_ADDRESS` | No | - | MoonX contract address trên Ethereum |
| `MOONX_POLYGON_CONTRACT_ADDRESS` | No | - | MoonX contract address trên Polygon |
| `CORS_ORIGIN` | No | * | CORS origin settings |
| `LOG_LEVEL` | No | info | Log level (error, warn, info, debug) |

## 🗄️ Database Setup

### MongoDB Requirements

Backend cần MongoDB với token data từ `coin-indexer-worker`. MongoDB chứa:

- **Collection `tokens`**: Token information với pool data
- **Collection `indexer_progress`**: Indexing progress tracking

**Setup MongoDB:**
```bash
# Run MongoDB locally
docker run -d --name mongodb -p 27017:27017 mongo:latest

# Hoặc use cloud MongoDB Atlas
# Set MONGODB_URI in .env
```

**Database Schema**: Xem `workers/coin-indexer-worker/DATABASE_SCHEMA.md` để hiểu schema chi tiết.

### Redis Requirements

Redis được sử dụng cho caching:
- **Pool information**: 5 minutes TTL
- **Token prices**: 1 minute TTL

**Setup Redis:**
```bash
# Run Redis locally
docker run -d --name redis -p 6379:6379 redis:latest

# Hoặc use cloud Redis
# Set REDIS_URL in .env
```

**Cache Keys Structure:**
```
moonx:pool:{chainId}:{tokenAddress}  # Pool information
moonx:price:{chainId}:{tokenAddress} # Token prices
```

### Optional: Run without Database

Backend có thể chạy without MongoDB/Redis nhưng sẽ mất các features:
- ❌ Pool information từ database
- ❌ Price caching (mọi request sẽ call external APIs)
- ✅ Basic swap quote generation vẫn work

## 📡 API Documentation

### Base URL
```
http://localhost:3001
```

### Health Check

#### `GET /health`
Kiểm tra trạng thái server

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-30T04:30:00.000Z"
}
```

---

### API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/networks` | Get supported networks |
| GET | `/api/tokens` | Get tokens with balances + real-time prices |
| GET | `/api/tokens/specific` | Get specific tokens with balances + prices (optimized) |
| POST | `/api/quote` | Get swap quote with calldata |

---

### Networks API

#### `GET /api/networks`
Lấy danh sách các networks được hỗ trợ

**Response:**
```json
{
  "success": true,
  "data": {
    "networks": [
      {
        "name": "Base",
        "chainId": 8453,
        "rpc": "https://mainnet.base.org",
        "currency": "ETH",
        "multicall3Address": "0xcA11bde05977b3631167028862bE2a173976CA11"
      }
    ]
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Failed to load supported networks"
}
```

---

### Tokens API

#### `GET /api/tokens`
Lấy danh sách tokens với balance cho user (nếu có)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chainId` | number | Yes | Chain ID (8453 for Base) |
| `search` | string | No | Token symbol/name để filter |
| `userAddress` | string | No | User address để lấy balance |

**Example Request:**
```
GET /api/tokens?chainId=8453&search=USDC&userAddress=0x742d35cc6634C0532925a3b8D07dC09E5F8b6b2f
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "token": {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "decimals": 6,
          "logoURI": "https://...",
          "priceUsd": 1.0,
          "priceChange24h": 0.05,
          "volume24h": 50000000
        },
        "balance": "1000000",
        "formattedBalance": "1.0"
      }
    ]
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "error": "chainId is required as query parameter"
}
```

---

### Specific Tokens API

#### `GET /api/tokens/specific`
Lấy balance của các tokens cụ thể (tối ưu cho refresh sau swap)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chainId` | number | Yes | Chain ID (8453 for Base) |
| `userAddress` | string | Yes | User address để lấy balance |
| `addresses` | string | Yes | Comma-separated token addresses |

**Example Request:**
```
GET /api/tokens/specific?chainId=8453&userAddress=0x742d35cc6634C0532925a3b8D07dC09E5F8b6b2f&addresses=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x0000000000000000000000000000000000000000
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "token": {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "decimals": 6,
          "logoURI": "https://...",
          "priceUsd": 1.0,
          "priceChange24h": 0.05,
          "volume24h": 50000000
        },
        "balance": "1000000",
        "formattedBalance": "1.0"
      },
      {
        "token": {
          "symbol": "ETH", 
          "name": "Ethereum",
          "address": "0x0000000000000000000000000000000000000000",
          "decimals": 18,
          "logoURI": "https://...",
          "priceUsd": 3500.0,
          "priceChange24h": -2.5,
          "volume24h": 1000000000
        },
        "balance": "2000000000000000000",
        "formattedBalance": "2.0"
      }
    ]
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "error": "chainId, userAddress, and addresses are required"
}
```

```json
{
  "success": false,
  "error": "At least one token address is required"
}
```

---

### Token Price Information

Tất cả token responses đều bao gồm real-time price data:

**Price Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `priceUsd` | number | Current price in USD |
| `priceChange24h` | number | Price change percentage in last 24h |
| `volume24h` | number | Trading volume in last 24h (USD) |

**Price Data Sources:**
- **Binance API**: Cho common tokens (ETH, USDC, USDT, DAI, WETH) - faster response
- **DexScreener API**: Cho các tokens khác (ZORA, VIRTUAL, creator tokens, etc.)
- **USDT Special**: Luôn return 1.0 (không call API)
- **Caching**: Redis cache 1 phút để optimize performance

**Notes:**
- Price data được fetch song song với balance data
- Nếu không lấy được price → fields sẽ là `undefined`
- USDT price luôn stable = 1.0 USD

---

### Quote API

#### `POST /api/quote`
Lấy swap quote và calldata sẵn sàng để execute ở client-side

**Request Body:**
```json
{
  "fromTokenAddress": "0x0000000000000000000000000000000000000000",
  "toTokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "amount": "1000000000000000000",
  "slippage": 0.5,
  "chainId": 8453,
  "userAddress": "0x742d35cc6634C0532925a3b8D07dC09E5F8b6b2f"
}
```

**Request Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fromTokenAddress` | string | Yes | Token address to swap from (0x000...000 for ETH) |
| `toTokenAddress` | string | Yes | Token address to swap to |
| `amount` | string | Yes | Amount in wei/smallest unit |
| `slippage` | number | No | Slippage tolerance (default: 0.5%) |
| `chainId` | number | Yes | Network chain ID |
| `userAddress` | string | Yes | User wallet address |

**Response:**
```json
{
  "success": true,
  "data": {
    "quote": {
      "fromToken": {
        "symbol": "ETH",
        "name": "Ethereum",
        "address": "0x0000000000000000000000000000000000000000",
        "decimals": 18
      },
      "toToken": {
        "symbol": "USDC",
        "name": "USD Coin", 
        "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "decimals": 6
      },
      "fromAmount": "1.0",
      "toAmount": "3500.0",
      "minToAmount": "3482.5",
      "priceImpact": "0.1",
      "slippage": "0.5",
      "fee": "0",
      "platformFee": 0,
      "calldata": "0x...",
      "value": "1000000000000000000",
      "gasEstimate": "250000",
      "route": ["0x000...000", "0x833...913"],
      "moonxQuote": {
        "amountOut": "3500000000",
        "liquidity": "1000000000000000000",
        "fee": 3000,
        "version": 3,
        "hooks": "0x000...000",
        "path": [],
        "routeData": "0x"
      }
    }
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `calldata` | string | Ready-to-execute transaction data |
| `value` | string | ETH value to send (for ETH swaps only) |
| `gasEstimate` | string | Estimated gas limit |
| `platformFee` | number | Platform fee (currently 0 - no fees) |
| `slippage` | string | User slippage tolerance |

**Error Responses:**
```json
{
  "success": false,
  "error": "Missing required parameters: fromTokenAddress, toTokenAddress, amount, chainId, userAddress"
}
```

```json
{
  "success": false,
  "error": "Insufficient liquidity for this trade"
}
```

---

## 🔧 Client-side Usage

### Execute Swap với Calldata từ Quote API

```typescript
// 1. Get quote từ API
const quoteResponse = await fetch('http://localhost:3001/api/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromTokenAddress: "0x0000000000000000000000000000000000000000", // ETH
    toTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // USDC
    amount: "1000000000000000000", // 1 ETH
    slippage: 0.5,
    chainId: 8453,
    userAddress: walletAddress
  })
});

const { data: { quote } } = await quoteResponse.json();

// 2. Execute swap ở client (contract address được hardcode hoặc lấy từ config)
const MOONX_CONTRACT_ADDRESS = "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630"; // Base mainnet
const tx = await signer.sendTransaction({
  to: MOONX_CONTRACT_ADDRESS, // MoonX contract address
  data: quote.calldata,
  value: quote.value, // Only for ETH swaps
  gasLimit: quote.gasEstimate
});

const receipt = await tx.wait();
console.log('Swap completed:', receipt.hash);
```

## 🏗️ Architecture

### Core Components

1. **Controllers** (`src/controllers/`)
   - `SwapController.ts`: Handle HTTP requests

2. **Services** (`src/services/`)
   - `SwapService.ts`: Business logic, calldata building

3. **Repositories** (`src/repositories/`)
   - `BlockchainRepository.ts`: Blockchain interactions

4. **Utils** (`src/utils/`)
   - `contracts.ts`: Contract ABIs and helpers
   - `price-service.ts`: Token price fetching từ Binance & DexScreener
   - `redis.ts`: Redis caching management
   - `mongodb.ts`: MongoDB connection và token queries  
   - `pool-cache.ts`: Combined pool caching service (Redis + MongoDB)

### Key Features

- ✅ **Real MoonX Integration**: Uses actual MoonX contract với `bytes[]` args format
- ✅ **Referral System**: Ready for referral implementation (currently disabled)
- ✅ **Multi-chain Support**: Configurable contract addresses per network
- ✅ **Environment-based Config**: Contract addresses từ env variables
- ✅ **Real-time Price Data**: Token prices từ Binance & DexScreener APIs
- ✅ **Smart Price Routing**: Common tokens → Binance, others → DexScreener
- ✅ **Redis Caching**: Pool info (5 minutes) & prices (1 minute) caching
- ✅ **MongoDB Integration**: Pool information từ coin-indexer-worker
- ✅ **Database Fallback**: Quote generation từ database khi pool key fails
- ✅ **Error Handling**: Comprehensive error messages
- ✅ **Type Safety**: Full TypeScript support
- ✅ **Security**: No private keys - client-side signing only

### Security Model

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API    │    │   Blockchain    │
│                 │    │                  │    │                 │
│ • Private Key   │───▶│ • Build Calldata │───▶│ • MoonX Contract│
│ • Sign & Send   │    │ • Get Quotes     │    │ • Execute Swap  │
│ • No API calls  │    │ • No Private Key │    │ • Handle Tokens │
│   with keys     │    │   Never stored   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🧪 Testing

### Manual Testing

```bash
# Test health
curl http://localhost:3001/health

# Test networks
curl http://localhost:3001/api/networks

# Test tokens
curl "http://localhost:3001/api/tokens?chainId=8453"

# Test specific tokens
curl "http://localhost:3001/api/tokens/specific?chainId=8453&userAddress=0x742d35cc6634C0532925a3b8D07dC09E5F8b6b2f&addresses=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x0000000000000000000000000000000000000000"

# Test quote
curl -X POST http://localhost:3001/api/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromTokenAddress":"0x0000000000000000000000000000000000000000",
    "toTokenAddress":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 
    "amount":"1000000000000000000",
    "slippage":0.5,
    "chainId":8453,
    "userAddress":"0x742d35cc6634C0532925a3b8D07dC09E5F8b6b2f"
  }'
```

## 📝 Development

### Project Structure
```
swap-backend/
├── src/
│   ├── controllers/     # HTTP request handlers
│   │   └── SwapController.ts
│   ├── services/        # Business logic  
│   │   └── SwapService.ts
│   ├── repositories/    # Blockchain interactions
│   │   └── BlockchainRepository.ts
│   ├── utils/          # Helper functions & services
│   │   ├── contracts.ts        # Contract ABIs
│   │   ├── price-service.ts    # Price fetching (Binance + DexScreener)
│   │   ├── redis.ts           # Redis caching management
│   │   ├── mongodb.ts         # MongoDB queries
│   │   └── pool-cache.ts      # Combined caching service
│   ├── config/         # Configuration files
│   │   └── networks.ts        # Network + token configs
│   ├── types/          # TypeScript interfaces
│   │   └── index.ts
│   └── server.ts       # Entry point
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
└── README.md          # This file
```

### Available Scripts

```bash
npm run dev        # Start development server với hot reload
npm run build      # Build for production
npm start          # Start production server
npm run lint       # Run linter
npm run type-check # TypeScript type checking
```

### Adding New Networks

1. Thêm RPC URL và MoonX contract address vào `.env`:
```env
NEW_NETWORK_RPC_URL=https://rpc.newnetwork.com
MOONX_NEW_NETWORK_CONTRACT_ADDRESS=0x...
```

2. Update `src/config/networks.ts`:
```typescript
// Add to MOONX_CONTRACT_ADDRESSES
const MOONX_CONTRACT_ADDRESSES: Record<number, string> = {
  8453: process.env.MOONX_BASE_CONTRACT_ADDRESS || '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630',
  12345: process.env.MOONX_NEW_NETWORK_CONTRACT_ADDRESS || '', // New network
};

// Add to NETWORKS
export const NETWORKS = {
  // existing networks...
  newNetwork: {
    name: 'New Network',
    chainId: 12345,
    rpc: process.env.NEW_NETWORK_RPC_URL,
    currency: 'ETH',
    multicall3Address: '0x...'
  }
};
```

## 🐛 Troubleshooting

### Common Issues

**1. "bad address checksum" Error**
```
Error: bad address checksum (argument="address", value="0x742d35cc6634C0532925a3b8D07dC09E5F8b6b2f")
```
**Solution**: Sử dụng `ethers.getAddress()` để normalize addresses

**2. "EADDRINUSE: address already in use"**
```bash
# Kill existing process
pkill -f "ts-node src/server.ts"
# Hoặc change port trong .env
PORT=3002
```

**3. "Insufficient liquidity"**
- Check token addresses are correct
- Verify network supports the token pair
- Try smaller amounts

**4. RPC Connection Issues**
- Verify RPC URLs trong `.env`
- Check network connectivity
- Use alternative RPC providers

## 🤝 Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Related Documentation

- [MoonX-Swap-Guide.md](../MoonX-Swap-Guide.md) - Contract integration guide
- [Frontend README](../swap-ui/README.md) - Frontend documentation 