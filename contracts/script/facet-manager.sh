#!/bin/bash

# Diamond Facet Manager Script
# Usage: ./script/facet-manager.sh <action> <args...>

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ File .env không tồn tại. Chạy 'npm run setup' trước."
    exit 1
fi

# Required env vars check
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ PRIVATE_KEY chưa được set trong .env"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function
print_usage() {
    echo "🔧 Diamond Facet Manager"
    echo ""
    echo "Usage: ./script/facet-manager.sh <action> [args...]"
    echo ""
    echo "Actions:"
    echo "  list <network> <diamond_address>           - Liệt kê tất cả facets"
    echo "  add <network> <diamond_address> <facet>    - Thêm facet mới"
    echo "  remove <network> <diamond_address> <facet> - Xóa facet"
    echo "  replace <network> <diamond> <new> <old>    - Thay thế facet"
    echo ""
    echo "Networks:"
    echo "  local       - Local development (localhost:8545)"
    echo "  base-test   - Base Sepolia testnet"
    echo "  base        - Base mainnet"
    echo "  bsc-test    - BSC testnet"
    echo "  bsc         - BSC mainnet"
    echo ""
    echo "Available Facets:"
    echo "  DiamondLoupeFacet, OwnershipFacet, FeeCollectorFacet"
    echo "  RescueFacet, LifiProxyFacet, OneInchProxyFacet, MoonXFacet"
    echo ""
    echo "Examples:"
    echo "  ./script/facet-manager.sh list base-test 0x1234..."
    echo "  ./script/facet-manager.sh add base-test 0x1234... RescueFacet"
    echo "  ./script/facet-manager.sh remove base-test 0x1234... 0x5678..."
}

# Get RPC URL based on network
get_rpc_url() {
    case $1 in
        "local")
            echo "http://localhost:8545"
            ;;
        "mainnet")
            if [ -z "$MAINNET_RPC_URL" ]; then
                echo "https://eth.llamarpc.com"
            else
                echo "$MAINNET_RPC_URL"
            fi
            ;;
        "base-test")
            if [ -z "$BASE_SEPOLIA_RPC_URL" ]; then
                echo "https://sepolia.base.org"
            else
                echo "$BASE_SEPOLIA_RPC_URL"
            fi
            ;;
        "base")
            if [ -z "$BASE_RPC_URL" ]; then
                echo "https://mainnet.base.org"
            else
                echo "$BASE_RPC_URL"
            fi
            ;;
        "zora")
            if [ -z "$ZORA_RPC_URL" ]; then
                echo "https://rpc.zora.energy"
            else
                echo "$ZORA_RPC_URL"
            fi
            ;;
        "bsc-test")
            if [ -z "$BSC_TESTNET_RPC_URL" ]; then
                echo "https://data-seed-prebsc-1-s1.binance.org:8545"
            else
                echo "$BSC_TESTNET_RPC_URL"
            fi
            ;;
        "bsc")
            if [ -z "$BSC_RPC_URL" ]; then
                echo "https://bsc-dataseed.binance.org"
            else
                echo "$BSC_RPC_URL"
            fi
            ;;
        *)
            echo "❌ Network không hợp lệ: $1"
            exit 1
            ;;
    esac
}

# Get gas price for network
get_gas_price() {
    case $1 in
        "base")
            echo "--gas-price 2000000000"
            ;;
        "bsc")
            echo "--gas-price 5000000000"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Main script
ACTION=$1
shift

case $ACTION in
    "list")
        if [ $# -lt 2 ]; then
            echo "❌ Usage: list <network> <diamond_address>"
            exit 1
        fi
        
        NETWORK=$1
        DIAMOND=$2
        RPC_URL=$(get_rpc_url $NETWORK)
        
        echo -e "${BLUE}📋 Listing facets for Diamond: $DIAMOND${NC}"
        echo -e "${YELLOW}Network: $NETWORK${NC}"
        echo -e "${YELLOW}RPC: $RPC_URL${NC}"
        echo ""
        
        forge script script/FacetManager.s.sol:FacetManagerScript \
            --sig "listFacets(address)" $DIAMOND \
            --rpc-url $RPC_URL
        ;;
        
    "add")
        if [ $# -lt 3 ]; then
            echo "❌ Usage: add <network> <diamond_address> <facet_name>"
            exit 1
        fi
        
        NETWORK=$1
        DIAMOND=$2
        FACET=$3
        RPC_URL=$(get_rpc_url $NETWORK)
        GAS_PRICE=$(get_gas_price $NETWORK)
        
        echo -e "${GREEN}➕ Adding facet: $FACET${NC}"
        echo -e "${YELLOW}Diamond: $DIAMOND${NC}"
        echo -e "${YELLOW}Network: $NETWORK${NC}"
        echo ""
        
        forge script script/FacetManager.s.sol:FacetManagerScript \
            --sig "addFacet(address,string)" $DIAMOND $FACET \
            --rpc-url $RPC_URL \
            --broadcast \
            $GAS_PRICE
        ;;
        
    "remove")
        if [ $# -lt 3 ]; then
            echo "❌ Usage: remove <network> <diamond_address> <facet_address>"
            exit 1
        fi
        
        NETWORK=$1
        DIAMOND=$2
        FACET_ADDR=$3
        RPC_URL=$(get_rpc_url $NETWORK)
        GAS_PRICE=$(get_gas_price $NETWORK)
        
        echo -e "${RED}🗑️  Removing facet: $FACET_ADDR${NC}"
        echo -e "${YELLOW}Diamond: $DIAMOND${NC}"
        echo -e "${YELLOW}Network: $NETWORK${NC}"
        echo ""
        
        # Confirmation prompt for mainnet
        if [[ $NETWORK == "base" || $NETWORK == "bsc" ]]; then
            echo -e "${RED}⚠️  CẢNH BÁO: Bạn đang xóa facet trên MAINNET!${NC}"
            read -p "Tiếp tục? (yes/no): " confirm
            if [ "$confirm" != "yes" ]; then
                echo "Hủy bỏ."
                exit 0
            fi
        fi
        
        forge script script/FacetManager.s.sol:FacetManagerScript \
            --sig "removeFacet(address,address)" $DIAMOND $FACET_ADDR \
            --rpc-url $RPC_URL \
            --broadcast \
            $GAS_PRICE
        ;;
        
    "replace")
        if [ $# -lt 4 ]; then
            echo "❌ Usage: replace <network> <diamond_address> <new_facet_name> <old_facet_address>"
            exit 1
        fi
        
        NETWORK=$1
        DIAMOND=$2
        NEW_FACET=$3
        OLD_FACET_ADDR=$4
        RPC_URL=$(get_rpc_url $NETWORK)
        GAS_PRICE=$(get_gas_price $NETWORK)
        
        echo -e "${BLUE}🔄 Replacing facet${NC}"
        echo -e "${YELLOW}Diamond: $DIAMOND${NC}"
        echo -e "${YELLOW}Old facet: $OLD_FACET_ADDR${NC}"
        echo -e "${YELLOW}New facet: $NEW_FACET${NC}"
        echo -e "${YELLOW}Network: $NETWORK${NC}"
        echo ""
        
        # Confirmation prompt for mainnet
        if [[ $NETWORK == "base" || $NETWORK == "bsc" ]]; then
            echo -e "${RED}⚠️  CẢNH BÁO: Bạn đang thay thế facet trên MAINNET!${NC}"
            read -p "Tiếp tục? (yes/no): " confirm
            if [ "$confirm" != "yes" ]; then
                echo "Hủy bỏ."
                exit 0
            fi
        fi
        
        forge script script/FacetManager.s.sol:FacetManagerScript \
            --sig "replaceFacet(address,string,address)" $DIAMOND $NEW_FACET $OLD_FACET_ADDR \
            --rpc-url $RPC_URL \
            --broadcast \
            $GAS_PRICE
        ;;
        
    "help"|"")
        print_usage
        ;;
        
    *)
        echo "❌ Action không hợp lệ: $ACTION"
        print_usage
        exit 1
        ;;
esac 