# MoonX Swap

MoonX Swap là một ứng dụng swap token đa chuỗi với giao diện đẹp, tích hợp MoonX contract và hỗ trợ quản lý private key bảo mật.

## Tính năng

✅ **Backend (Fastify + TypeScript)**
- Clean Architecture với Repository pattern
- Tích hợp thật với MoonX contract (không mock)
- Multicall3 để lấy token balances nhanh
- Ethers.js v6 cho blockchain interactions
- Support Base chain (sẵn sàng mở rộng cho các chain khác)

✅ **Frontend (Next.js + TypeScript)**  
- Giao diện đẹp theo style MoonX Farm (đen/xanh lá/tím)
- **Passkey Authentication** - Mã hóa bằng WebAuthn/biometric
- Generate random wallet tự động
- Quản lý multiple wallets an toàn
- Real-time token balances
- Smart routing và MEV protection

## Cấu trúc project

```
.
├── swap-backend/          # Fastify API server
│   ├── src/
│   │   ├── controllers/   # HTTP request handlers
│   │   ├── services/      # Business logic
│   │   ├── repositories/  # Blockchain interactions
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Utilities & helpers
│   │   └── config/        # Network configurations
│   └── package.json
└── swap-ui/               # Next.js frontend
    ├── app/               # App Router
    ├── lib/               # Utilities
    └── package.json
```

## Setup và chạy

### 1. Backend Setup

```bash
cd swap-backend
pnpm install
pnpm build
pnpm dev       # Development
# hoặc
pnpm start     # Production
```

**Environment variables (.env):**
```bash
# Base RPC (required)
BASE_RPC=https://mainnet.base.org

# Server config
PORT=3001
HOST=0.0.0.0
```

### 2. Frontend Setup

```bash
cd swap-ui
pnpm install
pnpm dev       # Development
# hoặc
pnpm build && pnpm start  # Production
```

**Environment variables (.env.local):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Cách sử dụng

1. **Khởi động backend và frontend**
2. **Kết nối ví:**
   - Nhập private key có sẵn
   - Hoặc generate wallet mới tự động
   - Private key được mã hóa lưu local
3. **Chọn tokens để swap**
4. **Nhập số lượng và lấy quote**
5. **Thực hiện swap**

## Networks hỗ trợ

Hiện tại: **Base Chain** (Chain ID: 8453)

Sẵn sàng mở rộng: Ethereum, Polygon, Arbitrum, BSC...

## Technical Details

### Backend Architecture

- **Clean Architecture**: Controllers → Services → Repositories
- **Blockchain Integration**: 
  - MoonX contract cho swap quotes
  - Multicall3 cho batch token balances
  - Ethers.js v6 cho all blockchain operations
- **Error Handling**: Comprehensive error handling với proper HTTP status codes
- **Type Safety**: Full TypeScript với strict mode

### Frontend Features

- **Wallet Management**: 
  - **Passkey Authentication** with WebAuthn
  - Advanced encrypted private key storage
  - Multiple wallet support with biometric unlock
  - Random wallet generation
- **UI/UX**: 
  - Responsive design
  - MoonX Farm color scheme (black/green/purple)
  - Real-time updates
  - Loading states
  - Security status indicators

### Security

- **Passkey Authentication** - WebAuthn/biometric protection
- Private keys mã hóa PBKDF2 + AES-256 với device binding
- Client-side encryption/decryption only
- No private keys transmitted to server
- HMAC integrity verification
- Input validation cho all user inputs

## API Endpoints

- `GET /api/networks` - Lấy danh sách networks hỗ trợ
- `GET /api/tokens/:chainId` - Lấy tokens với balances
- `POST /api/quote` - Lấy swap quote từ MoonX
- `POST /api/swap` - Thực hiện swap transaction
- `GET /api/allowance` - Check token allowance
- `GET /health` - Health check

## Contributing

1. Code theo clean architecture pattern
2. Sử dụng TypeScript strict mode
3. Follow existing naming conventions
4. Update README khi thêm features mới

## License

MIT License 