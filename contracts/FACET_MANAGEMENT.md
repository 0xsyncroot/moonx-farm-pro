# Diamond Facet Management Guide

## Tổng quan
Script `facet-manager.sh` đơn giản hóa việc quản lý facet trong Diamond proxy:
- ✅ **Tự động load .env** variables
- ✅ **Network presets** với RPC URLs
- ✅ **Gas price optimization** cho từng network  
- ✅ **Safety confirmations** cho mainnet
- ✅ **Colored output** dễ đọc

## Setup một lần

### 1. Tạo .env file
```bash
npm run setup
```

### 2. Configure .env
```bash
# Deployment Configuration
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
FEE_RECIPIENT=0x1234567890123456789012345678901234567890

# Network RPC URLs (optional - có defaults)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
BSC_RPC_URL=https://bsc-dataseed.binance.org

# Block Explorer API Keys (for verification)
BASESCAN_API_KEY=your-basescan-api-key
BSCSCAN_API_KEY=your-bscscan-api-key
```

## Cách sử dụng đơn giản

### Command format
```bash
npm run facet <action> <network> <args...>
```

### Networks có sẵn
- `local` - Local development (localhost:8545)
- `base-test` - Base Sepolia testnet
- `base` - Base mainnet 
- `bsc-test` - BSC testnet
- `bsc` - BSC mainnet

## 1. Xem danh sách facets

```bash
# Base testnet
npm run facet list base-test 0x1234...

# Base mainnet
npm run facet list base 0x1234...

# Local development
npm run facet list local 0x1234...
```

## 2. Thêm facet mới

```bash
# Thêm RescueFacet vào Base testnet
npm run facet add base-test 0x1234... RescueFacet

# Thêm LifiProxyFacet vào Base mainnet (có confirmation)
npm run facet add base 0x1234... LifiProxyFacet
```

### Facets có sẵn:
- `DiamondLoupeFacet` - Diamond introspection
- `OwnershipFacet` - Ownership management  
- `FeeCollectorFacet` - Fee collection
- `RescueFacet` - Emergency fund rescue
- `LifiProxyFacet` - LiFi aggregator proxy
- `OneInchProxyFacet` - 1inch aggregator proxy
- `MoonXFacet` - Custom trading logic

## 3. Xóa facet

```bash
# Xóa facet từ Base testnet
npm run facet remove base-test 0x1234... 0x5678...

# Xóa facet từ Base mainnet (có confirmation + cảnh báo)
npm run facet remove base 0x1234... 0x5678...
```

⚠️ **Cảnh báo**: Không xóa DiamondCutFacet - sẽ brick Diamond!

## 4. Thay thế facet (upgrade)

```bash
# Upgrade MoonXFacet trên Base testnet
npm run facet replace base-test 0x1234... MoonXFacet 0x5678...

# Upgrade trên mainnet (có double confirmation)
npm run facet replace base 0x1234... MoonXFacet 0x5678...
```

## 5. Ví dụ workflow thực tế

### Scenario: Emergency - Thêm RescueFacet
```bash
# 1. Check facets hiện tại
npm run facet list base-test 0x1234...

# 2. Add RescueFacet
npm run facet add base-test 0x1234... RescueFacet

# 3. Verify deployment
npm run facet list base-test 0x1234...

# 4. Production deployment  
npm run facet add base 0x1234... RescueFacet
```

### Scenario: Upgrade MoonXFacet
```bash
# 1. Deploy trên testnet trước
npm run facet replace base-test 0x1234... MoonXFacet 0xOLD...

# 2. Test thoroughly on testnet
# ... testing ...

# 3. Production upgrade
npm run facet replace base 0x1234... MoonXFacet 0xOLD...
```

## 6. Features nâng cao

### Automatic Gas Price
- **Base mainnet**: 2 gwei
- **BSC mainnet**: 5 gwei  
- **Testnets**: Standard gas

### Safety Features
- ✅ Mainnet confirmation prompts
- ✅ ENV validation trước khi chạy
- ✅ Network validation
- ✅ Colored output cho dễ đọc

### Error Handling
- ❌ Missing .env → Auto suggest `npm run setup`
- ❌ Invalid network → Show available options  
- ❌ Missing PRIVATE_KEY → Clear error message

## 7. Troubleshooting

### Script không chạy được
```bash
# Check executable permission
chmod +x script/facet-manager.sh

# Run directly
./script/facet-manager.sh help
```

### Environment issues  
```bash
# Recreate .env
npm run setup

# Check .env content
cat .env
```

### RPC issues
```bash
# Use default RPC (remove custom RPC từ .env)
# Script sẽ fallback to public RPCs
```

## 8. Command Reference

```bash
# Help
npm run facet help

# List facets
npm run facet list <network> <diamond_address>

# Add facet  
npm run facet add <network> <diamond_address> <facet_name>

# Remove facet
npm run facet remove <network> <diamond_address> <facet_address>

# Replace facet
npm run facet replace <network> <diamond_address> <new_facet_name> <old_facet_address>
```

## So sánh với cách cũ

### ❌ Cách cũ (phức tạp)
```bash
forge script script/FacetManager.s.sol:FacetManagerScript \
    --sig "addFacet(address,string)" 0x1234... RescueFacet \
    --rpc-url $BASE_SEPOLIA_RPC_URL \
    --broadcast \
    --gas-price 2000000000
```

### ✅ Cách mới (đơn giản)
```bash
npm run facet add base-test 0x1234... RescueFacet
```

**Lợi ích**: 
- 🔥 **80% ít typing hơn**
- 🛡️ **Safety built-in** 
- 🎯 **No mistakes** với RPC URLs
- 🎨 **Better UX** với colors 