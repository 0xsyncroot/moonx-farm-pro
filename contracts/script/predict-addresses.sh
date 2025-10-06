#!/bin/bash

# ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
# ┃                                                    MOONX FARM ROUTER - ADDRESS PREDICTION UTILITY                                                                                ┃
# ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮"
echo "┃                                                    🔮 MOONX ADDRESS PREDICTOR 🎯                                                                                ┃"
echo "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
echo -e "${NC}"

echo -e "${PURPLE}🚀 Predicting MoonXFacet addresses for all networks...${NC}"
echo ""

echo -e "${BLUE}📍 Base Mainnet (Chain ID: 8453):${NC}"
forge script script/UpgradeMoonXFacet.s.sol:UpgradeMoonXFacetScript \
    --sig "predictMoonXFacetAddress()" \
    --chain-id 8453 \
    --rpc-url https://mainnet.base.org \
    2>/dev/null | grep -E "0x[a-fA-F0-9]{40}" | tail -1

echo ""
echo -e "${BLUE}📍 Ethereum Mainnet (Chain ID: 1):${NC}"
forge script script/UpgradeMoonXFacet.s.sol:UpgradeMoonXFacetScript \
    --sig "predictMoonXFacetAddress()" \
    --chain-id 1 \
    --rpc-url https://ethereum.publicnode.com \
    2>/dev/null | grep -E "0x[a-fA-F0-9]{40}" | tail -1

echo ""
echo -e "${BLUE}📍 Base Sepolia (Chain ID: 84532):${NC}"
forge script script/UpgradeMoonXFacet.s.sol:UpgradeMoonXFacetScript \
    --sig "predictMoonXFacetAddress()" \
    --chain-id 84532 \
    --rpc-url https://sepolia.base.org \
    2>/dev/null | grep -E "0x[a-fA-F0-9]{40}" | tail -1

echo ""
echo -e "${GREEN}✨ All addresses should be IDENTICAL across chains due to CREATE2! ✨${NC}"
echo ""
echo -e "${CYAN}💡 To check current Diamond address:${NC}"
echo "   export DIAMOND_ADDRESS=0x<your_diamond_address>"
echo "   forge script script/UpgradeMoonXFacet.s.sol:UpgradeMoonXFacetScript --sig \"_getCurrentMoonXFacetAddress(address)\" \$DIAMOND_ADDRESS"
echo ""
echo -e "${CYAN}🔧 To run upgrade:${NC}"
echo "   ./script/upgrade-moonx-facet.sh <network> <diamond_address>"
echo ""