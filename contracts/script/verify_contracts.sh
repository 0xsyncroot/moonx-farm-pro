#!/bin/bash

# MoonXFarm Contract Verification Script for Base Mainnet
# Verify all deployed contracts from DeployDeterministic.s.sol

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contract addresses from deployment
DIAMOND_ADDRESS="0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630"
DIAMOND_CUT_FACET="0x30b65Fa74cC21c26eb96C500F07086a20CbF878b"
DIAMOND_LOUPE_FACET="0xbb595Ff88Ccc9A778c4F064C3980b0F8EBB52578"
OWNERSHIP_FACET="0xeb0147d451F5eA7b919F96B8a088dD755fA74658"
FEE_COLLECTOR_FACET="0x37AfF8B27465790e44a50d325C660Be378DB525b"
RESCUE_FACET="0xB6b4eA82F36e40f86c1d4357cd1cbdF0659067a1"
LIFI_PROXY_FACET="0x394cd06689AD5503f62d5d5fc0Ff11c9F656c46a"
ONEINCH_PROXY_FACET="0xE0FD0922842Ad0A9ec5981f25F979D7981515621"
MOONX_FACET="0x2A48f0806B7F1E28A2dB96d90374c366b93b3912"
DIAMOND_INIT="0x8aD408F326729Fa5A48cF7892a9DF73573e8F9D2"

# Verification settings
CHAIN_ID="1"
DELAY="25"  # 25 seconds delay between verifications
RETRIES="2"
SCAN_URL="https://api.etherscan.io/api"

# Load environment variables
if [ -f ".env" ]; then
    source .env
    echo "✅ Loaded .env file"
else
    echo "⚠️  No .env file found. Using system environment variables."
fi

# Check if API key is set
if [[ -z "$ETHERSCAN_API_KEY" ]]; then
    echo -e "${RED}Error: ETHERSCAN_API_KEY environment variable is required${NC}"
    exit 1
fi

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}🔍 MoonXFarm Contract Verification on Base${NC}"
echo -e "${BLUE}===============================================${NC}"
echo -e "${GREEN}Chain ID:${NC} $CHAIN_ID (Base Mainnet)"
echo -e "${GREEN}Delay between verifications:${NC} ${DELAY}s"
echo ""

# Function to verify a contract
verify_contract() {
    local address=$1
    local contract_path=$2
    local contract_name=$3
    local description=$4
    local constructor_args=$5

    echo -e "${YELLOW}🔍 Verifying $description...${NC}"
    echo -e "${BLUE}   Address: $address${NC}"
    echo -e "${BLUE}   Contract: $contract_path:$contract_name${NC}"
    
    if [[ -n "$constructor_args" ]]; then
        echo -e "${BLUE}   Constructor Args: $constructor_args${NC}"
        forge verify-contract \
            "$address" \
            "$contract_path:$contract_name" \
            --verifier etherscan \
            --verifier-url "$SCAN_URL" \
            --etherscan-api-key "$ETHERSCAN_API_KEY" \
            --chain "$CHAIN_ID" \
            --delay "$DELAY" \
            --retries "$RETRIES" \
            --constructor-args "$constructor_args" \
            --watch
    else
        forge verify-contract \
            "$address" \
            "$contract_path:$contract_name" \
            --verifier etherscan \
            --verifier-url "$SCAN_URL" \
            --etherscan-api-key "$ETHERSCAN_API_KEY" \
            --chain "$CHAIN_ID" \
            --delay "$DELAY" \
            --retries "$RETRIES" \
            --watch
    fi

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}   ✅ $description verified successfully!${NC}"
    else
        echo -e "${RED}   ❌ $description verification failed!${NC}"
    fi
    
    # Add 5 second delay to avoid rate limiting
    echo -e "${YELLOW}   ⏳ Waiting 5 seconds before next verification...${NC}"
    sleep 5
    echo ""
}

echo -e "${YELLOW}📝 Starting verification process...${NC}"
echo ""

# 1. Verify DiamondCutFacet (no constructor args)
verify_contract \
    "$DIAMOND_CUT_FACET" \
    "src/facets/DiamondCutFacet.sol" \
    "DiamondCutFacet" \
    "DiamondCutFacet"
sleep 5
# 2. Verify DiamondInit (no constructor args)
verify_contract \
    "$DIAMOND_INIT" \
    "src/upgradeInitializers/DiamondInit.sol" \
    "DiamondInit" \
    "DiamondInit"
sleep 5
# 3. Verify DiamondLoupeFacet (no constructor args)
verify_contract \
    "$DIAMOND_LOUPE_FACET" \
    "src/facets/DiamondLoupeFacet.sol" \
    "DiamondLoupeFacet" \
    "DiamondLoupeFacet"
sleep 5
# 4. Verify OwnershipFacet (no constructor args)
verify_contract \
    "$OWNERSHIP_FACET" \
    "src/facets/OwnershipFacet.sol" \
    "OwnershipFacet" \
    "OwnershipFacet"
sleep 5
# 5. Verify FeeCollectorFacet (no constructor args)
verify_contract \
    "$FEE_COLLECTOR_FACET" \
    "src/facets/FeeCollectorFacet.sol" \
    "FeeCollectorFacet" \
    "FeeCollectorFacet"
sleep 5
# 6. Verify RescueFacet (no constructor args)
verify_contract \
    "$RESCUE_FACET" \
    "src/facets/RescueFacet.sol" \
    "RescueFacet" \
    "RescueFacet"
sleep 5
# 7. Verify LifiProxyFacet (constructor: lifi address)
LIFI_ADDRESS="0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE"
LIFI_CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address)" "$LIFI_ADDRESS")
verify_contract \
    "$LIFI_PROXY_FACET" \
    "src/facets/LifiProxyFacet.sol" \
    "LifiProxyFacet" \
    "LifiProxyFacet" \
    "$LIFI_CONSTRUCTOR_ARGS"
sleep 5
# 8. Verify OneInchProxyFacet (constructor: 1inch address)
ONEINCH_ADDRESS="0x111111125421cA6dc452d289314280a0f8842A65"
ONEINCH_CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address)" "$ONEINCH_ADDRESS")
verify_contract \
    "$ONEINCH_PROXY_FACET" \
    "src/facets/OneInchProxyFacet.sol" \
    "OneInchProxyFacet" \
    "OneInchProxyFacet" \
    "$ONEINCH_CONSTRUCTOR_ARGS"
sleep 5
# 9. Verify MoonXFacet (complex constructor with many parameters)
WETH_ADDRESS="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
UNIVERSAL_ROUTER="0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af"
V2_FACTORY="0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"
V2_ROUTER="0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
V3_FACTORY="0x1F98431c8aD98523631AE4a59f267346ea31F984"
V3_QUOTER="0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
V4_QUOTER="0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203"
STATE_LIBRARY="0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227"
POOL_MANAGER="0x000000000004444c5dc75cB358380D2e3dE08A90"
PERMIT2="0x000000000022D473030F116dDEE9F6B43aC78BA3"

MOONX_CONSTRUCTOR_ARGS=$(cast abi-encode \
    "constructor(address,address,address,address,address,address,address,address,address,address)" \
    "$WETH_ADDRESS" \
    "$UNIVERSAL_ROUTER" \
    "$V2_FACTORY" \
    "$V2_ROUTER" \
    "$V3_FACTORY" \
    "$V3_QUOTER" \
    "$V4_QUOTER" \
    "$STATE_LIBRARY" \
    "$POOL_MANAGER" \
    "$PERMIT2")

verify_contract \
    "$MOONX_FACET" \
    "src/facets/MoonXFacet.sol" \
    "MoonXFacet" \
    "MoonXFacet" \
    "$MOONX_CONSTRUCTOR_ARGS"
sleep 5
# 10. Verify Diamond (constructor: owner, diamondCutFacet)
DEPLOYER_ADDRESS="0x9F218b1d40C14B13ce1a0963784821dCa512000D"
DIAMOND_CONSTRUCTOR_ARGS=$(cast abi-encode \
    "constructor(address,address)" \
    "$DEPLOYER_ADDRESS" \
    "$DIAMOND_CUT_FACET")

verify_contract \
    "$DIAMOND_ADDRESS" \
    "src/Diamond.sol" \
    "MoonXFarmRouter" \
    "MoonXFarmRouter Diamond" \
    "$DIAMOND_CONSTRUCTOR_ARGS"
sleep 5
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🎉 ALL CONTRACTS VERIFICATION COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo -e "${YELLOW}📋 Summary of verified contracts:${NC}"
echo -e "${BLUE}   1. DiamondCutFacet: $DIAMOND_CUT_FACET${NC}"
echo -e "${BLUE}   2. DiamondInit: $DIAMOND_INIT${NC}"
echo -e "${BLUE}   3. DiamondLoupeFacet: $DIAMOND_LOUPE_FACET${NC}"
echo -e "${BLUE}   4. OwnershipFacet: $OWNERSHIP_FACET${NC}"
echo -e "${BLUE}   5. FeeCollectorFacet: $FEE_COLLECTOR_FACET${NC}"
echo -e "${BLUE}   6. RescueFacet: $RESCUE_FACET${NC}"
echo -e "${BLUE}   7. LifiProxyFacet: $LIFI_PROXY_FACET${NC}"
echo -e "${BLUE}   8. OneInchProxyFacet: $ONEINCH_PROXY_FACET${NC}"
echo -e "${BLUE}   9. MoonXFacet: $MOONX_FACET${NC}"
echo -e "${BLUE}  10. MoonXFarmRouter: $DIAMOND_ADDRESS${NC}"
echo ""
echo -e "${YELLOW}🔗 Check all contracts on Basescan:${NC}"
echo -e "${BLUE}https://basescan.org/address/$DIAMOND_ADDRESS${NC}"
echo ""

