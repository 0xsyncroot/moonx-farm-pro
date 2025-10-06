# 🚀 Quick Reference - Facet Management

## One-time Setup
```bash
npm run setup     # Tạo .env file
# Edit .env với PRIVATE_KEY và FEE_RECIPIENT
```

## Daily Commands

### 📋 List Facets
```bash
npm run facet list base-test 0x1234...     # Base testnet
npm run facet list base 0x1234...          # Base mainnet
```

### ➕ Add Facet  
```bash
npm run facet add base-test 0x1234... RescueFacet
npm run facet add base 0x1234... RescueFacet        # With confirmation
```

### 🗑️ Remove Facet
```bash
npm run facet remove base-test 0x1234... 0x5678...
npm run facet remove base 0x1234... 0x5678...       # With double confirmation
```

### 🔄 Replace Facet (Upgrade)
```bash
npm run facet replace base-test 0x1234... MoonXFacet 0x5678...
npm run facet replace base 0x1234... MoonXFacet 0x5678...
```

## Available Networks
- `local` - Local dev
- `base-test` - Base Sepolia  
- `base` - Base mainnet
- `bsc-test` - BSC testnet
- `bsc` - BSC mainnet

## Available Facets
- `DiamondLoupeFacet` - Diamond introspection
- `OwnershipFacet` - Owner management
- `FeeCollectorFacet` - Fee collection  
- `RescueFacet` - Emergency rescue
- `LifiProxyFacet` - LiFi integration
- `OneInchProxyFacet` - 1inch integration
- `MoonXFacet` - Custom logic

## Safety Features ✅
- Auto gas price optimization
- Mainnet confirmation prompts  
- ENV validation
- Network validation
- Colored output

## Troubleshooting
```bash
npm run facet help              # Show help
chmod +x script/facet-manager.sh # Fix permissions
npm run setup                   # Recreate .env
``` 