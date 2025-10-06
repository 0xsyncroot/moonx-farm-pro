#!/bin/bash

# MoonXFarm Multi-Aggregator Diamond Deployment Script
# Supports: Base, Base Sepolia, BSC, Zora, Local

set -e  # Exit on any error

# Load environment variables
if [ -f ".env" ]; then
    source .env
    echo "✅ Loaded .env file"
else
    echo "⚠️  No .env file found. Using system environment variables."
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NETWORK=""
VERIFY="true"
GAS_PRICE=""
GAS_LIMIT=""
DRY_RUN="false"

# Help function
show_help() {
    cat << EOF
MoonXFarm Diamond Deployment Script

Usage: $0 [OPTIONS]

OPTIONS:
    -n, --network NETWORK       Target network (base, base-sepolia, bsc, zora, local)
    -v, --verify               Verify contracts on block explorer (default: true)
    --no-verify                Skip contract verification
    --gas-price PRICE          Gas price in wei (optional)
    --gas-limit LIMIT          Gas limit (optional)
    --dry-run                  Simulate deployment without broadcasting
    -h, --help                 Show this help message

NETWORKS:
    mainnet                    Mainnet (1)
    mainnet-local              Mainnet Local (1)
    base                       Base Mainnet (8453)
    base-sepolia              Base Sepolia Testnet (84532)
    bsc                       BSC Mainnet (56)
    zora                      Zora Mainnet (7777777)
    local                     Local development (31337)

EXAMPLES:
    # Deploy to Base Sepolia (testnet)
    $0 --network base-sepolia

    # Deploy to Base Mainnet with custom gas price
    $0 --network base --gas-price 2000000000

    # Dry run deployment
    $0 --network local --dry-run

    # Deploy without verification
    $0 --network bsc --no-verify

ENVIRONMENT VARIABLES:
    PRIVATE_KEY               Deployer private key (required)
    FEE_RECIPIENT            Fee recipient address (required)
    BASE_RPC_URL             Base Mainnet RPC (required for base)
    BASE_SEPOLIA_RPC_URL     Base Sepolia RPC (required for base-sepolia)
    BSC_RPC_URL              BSC Mainnet RPC (required for bsc)
    ZORA_RPC_URL             Zora Mainnet RPC (required for zora)
    BASESCAN_API_KEY         Base explorer API key (for verification)
    ETHERSCAN_API_KEY        Etherscan API key (for verification)
    BSCSCAN_API_KEY          BSC explorer API key (for verification)

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--network)
            NETWORK="$2"
            shift 2
            ;;
        -v|--verify)
            VERIFY="true"
            shift
            ;;
        --no-verify)
            VERIFY="false"
            shift
            ;;
        --gas-price)
            GAS_PRICE="$2"
            shift 2
            ;;
        --gas-limit)
            GAS_LIMIT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$NETWORK" ]]; then
    echo -e "${RED}Error: Network is required${NC}"
    show_help
    exit 1
fi

# Validate network
case $NETWORK in
    base|base-sepolia|bsc|zora|local|base-local|mainnet|mainnet-local)
        ;;
    *)
        echo -e "${RED}Error: Invalid network '$NETWORK'${NC}"
        echo -e "${YELLOW}Supported networks: base, base-sepolia, bsc, zora, local, base-local, mainnet, mainnet-local${NC}"
        exit 1
        ;;
esac

# Validate environment variables
if [[ -z "$PRIVATE_KEY" ]]; then
    echo -e "${RED}Error: PRIVATE_KEY environment variable is required${NC}"
    exit 1
fi

if [[ -z "$FEE_RECIPIENT" ]]; then
    echo -e "${RED}Error: FEE_RECIPIENT environment variable is required${NC}"
    exit 1
fi

# Set network-specific variables
case $NETWORK in
    base)
        RPC_URL="$BASE_RPC_URL"
        EXPLORER_API_KEY="$BASESCAN_API_KEY"
        CHAIN_NAME="Base Mainnet"
        CHAIN_ID="8453"
        if [[ -z "$GAS_PRICE" ]]; then
            GAS_PRICE="2000000000"  # 2 gwei
        fi
        ;;
    base-sepolia)
        RPC_URL="$BASE_SEPOLIA_RPC_URL"
        EXPLORER_API_KEY="$BASESCAN_API_KEY"
        CHAIN_NAME="Base Sepolia"
        CHAIN_ID="84532"
        if [[ -z "$GAS_PRICE" ]]; then
            GAS_PRICE="1000000000"  # 1 gwei
        fi
        ;;
    bsc)
        RPC_URL="$BSC_RPC_URL"
        EXPLORER_API_KEY="$BSCSCAN_API_KEY"
        CHAIN_NAME="BSC Mainnet"
        CHAIN_ID="56"
        if [[ -z "$GAS_PRICE" ]]; then
            GAS_PRICE="5000000000"  # 5 gwei
        fi
        ;;
    zora)
        RPC_URL="$ZORA_RPC_URL"
        EXPLORER_API_KEY="$ETHERSCAN_API_KEY"  # Zora uses Etherscan format
        CHAIN_NAME="Zora Mainnet"
        CHAIN_ID="7777777"
        if [[ -z "$GAS_PRICE" ]]; then
            GAS_PRICE="1000000000"  # 1 gwei
        fi
        ;;
    local)
        RPC_URL="http://localhost:8545"
        EXPLORER_API_KEY=""
        CHAIN_NAME="Local Development"
        CHAIN_ID="7777777"
        VERIFY="false"  # No verification for local
        ;;
    base-local)
        RPC_URL="http://localhost:8645"
        EXPLORER_API_KEY=""
        CHAIN_NAME="Base Local"
        CHAIN_ID="8453"
        VERIFY="false"  # No verification for local
        ;;
    mainnet)
        RPC_URL="$MAINNET_RPC_URL"
        EXPLORER_API_KEY="$ETHERSCAN_API_KEY"
        CHAIN_NAME="Mainnet"
        CHAIN_ID="1"
        ;;
    mainnet-local)
        RPC_URL="http://localhost:8545"
        EXPLORER_API_KEY=""
        CHAIN_NAME="Mainnet Local"
        CHAIN_ID="1"
        VERIFY="false"  # No verification for local
        ;;
esac

# Validate RPC URL
if [[ -z "$RPC_URL" ]]; then
    case $NETWORK in
        base)
            echo -e "${RED}Error: BASE_RPC_URL environment variable is required for Base network${NC}"
            ;;
        base-sepolia)
            echo -e "${RED}Error: BASE_SEPOLIA_RPC_URL environment variable is required for Base Sepolia network${NC}"
            ;;
        bsc)
            echo -e "${RED}Error: BSC_RPC_URL environment variable is required for BSC network${NC}"
            ;;
        zora)
            echo -e "${RED}Error: ZORA_RPC_URL environment variable is required for Zora network${NC}"
            ;;
        mainnet)
            echo -e "${RED}Error: MAINNET_RPC_URL environment variable is required for Mainnet network${NC}"
            ;;
    esac
    exit 1
fi

# Build forge command
FORGE_CMD="forge script script/DeployDeterministic.s.sol"
FORGE_CMD="$FORGE_CMD --rpc-url $RPC_URL"

if [[ "$DRY_RUN" == "false" ]]; then
    FORGE_CMD="$FORGE_CMD --broadcast"
fi

if [[ "$VERIFY" == "true" && -n "$EXPLORER_API_KEY" ]]; then
    FORGE_CMD="$FORGE_CMD --verify --etherscan-api-key $EXPLORER_API_KEY"
fi

if [[ -n "$GAS_PRICE" ]]; then
    FORGE_CMD="$FORGE_CMD --gas-price $GAS_PRICE"
fi

if [[ -n "$GAS_LIMIT" ]]; then
    FORGE_CMD="$FORGE_CMD --gas-limit $GAS_LIMIT"
fi

# Add verbosity for debugging
FORGE_CMD="$FORGE_CMD -vvv"

# Print deployment info
echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}🚀 MoonXFarm Multi-Aggregator Diamond Deployment${NC}"
echo -e "${BLUE}===============================================${NC}"
echo ""
echo -e "${GREEN}Network:${NC} $CHAIN_NAME ($CHAIN_ID)"
echo -e "${GREEN}RPC URL:${NC} $RPC_URL"
echo -e "${GREEN}Deployer:${NC} $(cast wallet address $PRIVATE_KEY)"
echo -e "${GREEN}Fee Recipient:${NC} $FEE_RECIPIENT"
echo -e "${GREEN}Gas Price:${NC} $GAS_PRICE wei"
echo -e "${GREEN}Verification:${NC} $VERIFY"
echo -e "${GREEN}Dry Run:${NC} $DRY_RUN"
echo ""

# Confirm deployment
if [[ "$DRY_RUN" == "false" ]]; then
    echo -e "${YELLOW}⚠️  This will deploy contracts to $CHAIN_NAME${NC}"
    echo -e "${YELLOW}Continue? (y/N)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Check forge installation
if ! command -v forge &> /dev/null; then
    echo -e "${RED}Error: Forge is not installed${NC}"
    echo -e "${YELLOW}Install from: https://getfoundry.sh/${NC}"
    exit 1
fi

# Check cast installation
if ! command -v cast &> /dev/null; then
    echo -e "${RED}Error: Cast is not installed${NC}"
    echo -e "${YELLOW}Install from: https://getfoundry.sh/${NC}"
    exit 1
fi

# Build contracts first
echo -e "${BLUE}🔨 Building contracts...${NC}"
forge build
if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful${NC}"
echo ""

# Function to validate contract addresses
validate_addresses() {
    local network=$1
    echo -e "${BLUE}🔍 Validating contract addresses...${NC}"
    
    case $network in
        base|base-local)
            # Validate key contracts exist on Base
            check_contract "WETH" "0x4200000000000000000000000000000000000006"
            check_contract "Universal Router" "0x6fF5693b99212Da76ad316178A184AB56D299b43"
            check_contract "V3 Factory" "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"
            check_contract "V3 Quoter" "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
            check_contract "V4 Quoter" "0x0d5e0F971ED27FBfF6c2837bf31316121532048D"
            
            # Optional checks for aggregators
            check_contract "LiFi (optional)" "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" optional
            check_contract "1inch (optional)" "0x111111125421cA6dc452d289314280a0f8842A65" optional
            ;;
        base-sepolia)
            check_contract "WETH" "0x4200000000000000000000000000000000000006"
            check_contract "Universal Router" "0x492E6456D9528771018DeB9E87ef7750EF184104"
            check_contract "V3 Factory" "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
            check_contract "V3 Quoter" "0xC5290058841028F1614F3A6F0F5816cAd0df5E27"
            check_contract "V4 Quoter" "0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa"
            echo -e "${YELLOW}  ⚠️  LiFi: SKIPPED (not deployed on testnet)${NC}"
            echo -e "${YELLOW}  ⚠️  1inch: SKIPPED (not deployed on testnet)${NC}"
            ;;
        bsc)
            check_contract "WBNB" "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
            check_contract "Universal Router" "0x1906c1d672b88cD1B9aC7593301cA990F94Eae07"
            check_contract "V3 Factory" "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7"
            check_contract "V3 Quoter" "0x78D78E420Da98ad378D7799bE8f4AF69033EB077"
            check_contract "V4 Quoter" "0x9F75dD27D6664c475B90e105573E550ff69437B0"
            ;;
        zora|local)
            echo -e "${YELLOW}⚠️  Skipping validation for $network (limited/test contracts)${NC}"
            ;;
        mainnet)
            echo -e "${YELLOW}⚠️  Skipping validation for $network (limited/test contracts)${NC}"
            ;;
        mainnet-local)
            echo -e "${YELLOW}⚠️  Skipping validation for $network (limited/test contracts)${NC}"
            ;;
    esac
    echo ""
}

# Function to check if contract exists
check_contract() {
    local name=$1
    local address=$2
    local optional=${3:-""}
    
    if [[ "$address" == "0x0000000000000000000000000000000000000000" ]]; then
        if [[ "$optional" == "optional" ]]; then
            echo -e "${YELLOW}  ⚠️  $name: SKIPPED (address(0))${NC}"
        else
            echo -e "${RED}  ❌ $name: MISSING (address(0))${NC}"
        fi
        return
    fi
    
    # Check if contract exists using cast
    if command -v cast &> /dev/null; then
        local code=$(cast code "$address" --rpc-url "$RPC_URL" 2>/dev/null)
        if [[ -n "$code" && "$code" != "0x" ]]; then
            echo -e "${GREEN}  ✅ $name: OK${NC}"
        else
            if [[ "$optional" == "optional" ]]; then
                echo -e "${YELLOW}  ⚠️  $name: NOT FOUND (optional)${NC}"
            else
                echo -e "${RED}  ❌ $name: NOT FOUND${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}  ⚠️  $name: SKIPPED (cast not available)${NC}"
    fi
}

# Validate contract addresses before deployment
if [[ "$DRY_RUN" == "false" ]]; then
    validate_addresses "$NETWORK"
fi

# Before deployment, show network configuration for audit
echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}🔍 Network Configuration Audit${NC}"
echo -e "${BLUE}===============================================${NC}"

# Get network addresses using cast
case $NETWORK in
    base|base-local)
        echo -e "${GREEN}📍 Base Mainnet (8453) Configuration:${NC}"
        echo -e "${YELLOW}  WETH:${NC} 0x4200000000000000000000000000000000000006"
        echo -e "${YELLOW}  Universal Router:${NC} 0x6fF5693b99212Da76ad316178A184AB56D299b43"
        echo -e "${YELLOW}  LiFi:${NC} 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE"
        echo -e "${YELLOW}  1inch:${NC} 0x111111125421cA6dc452d289314280a0f8842A65"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V2:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"
        echo -e "${YELLOW}    Router:${NC} 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V3:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x33128a8fC17869897dcE68Ed026d694621f6FDfD"
        echo -e "${YELLOW}    Quoter:${NC} 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V4:${NC}"
        echo -e "${YELLOW}    Quoter:${NC} 0x0d5e0F971ED27FBfF6c2837bf31316121532048D"
        ;;
    base-sepolia)
        echo -e "${GREEN}📍 Base Sepolia (84532) Configuration:${NC}"
        echo -e "${YELLOW}  WETH:${NC} 0x4200000000000000000000000000000000000006"
        echo -e "${YELLOW}  Universal Router:${NC} 0x492E6456D9528771018DeB9E87ef7750EF184104"
        echo -e "${YELLOW}  LiFi:${NC} address(0) - ${RED}SKIPPED${NC}"
        echo -e "${YELLOW}  1inch:${NC} address(0) - ${RED}SKIPPED${NC}"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V2:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x4648a43B2C14Da09FdF82B161150d3F634f40491"
        echo -e "${YELLOW}    Router:${NC} 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V3:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
        echo -e "${YELLOW}    Quoter:${NC} 0xC5290058841028F1614F3A6F0F5816cAd0df5E27"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V4:${NC}"
        echo -e "${YELLOW}    Quoter:${NC} 0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa"
        ;;
    bsc)
        echo -e "${GREEN}📍 BSC Mainnet (56) Configuration:${NC}"
        echo -e "${YELLOW}  WBNB:${NC} 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
        echo -e "${YELLOW}  Universal Router:${NC} 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07"
        echo -e "${YELLOW}  LiFi:${NC} 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE"
        echo -e "${YELLOW}  1inch:${NC} 0x111111125421cA6dc452d289314280a0f8842A65"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V2:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"
        echo -e "${YELLOW}    Router:${NC} 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V3:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7"
        echo -e "${YELLOW}    Quoter:${NC} 0x78D78E420Da98ad378D7799bE8f4AF69033EB077"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V4:${NC}"
        echo -e "${YELLOW}    Quoter:${NC} 0x9F75dD27D6664c475B90e105573E550ff69437B0"
        ;;
    zora)
        echo -e "${GREEN}📍 Zora Mainnet (7777777) Configuration:${NC}"
        echo -e "${YELLOW}  WETH:${NC} 0x4200000000000000000000000000000000000006"
        echo -e "${YELLOW}  Universal Router:${NC} 0x3315ef7cA28dB74aBADC6c44570efDF06b04B020"
        echo -e "${YELLOW}  LiFi:${NC} address(0) - ${RED}SKIPPED${NC}"
        echo -e "${YELLOW}  1inch:${NC} address(0) - ${RED}SKIPPED${NC}"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V2:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x0F797dC7efaEA995bB916f268D919d0a1950eE3C"
        echo -e "${YELLOW}    Router:${NC} 0xa00F34A632630EFd15223B1968358bA4845bEEC7"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V3:${NC}"
        echo -e "${YELLOW}    Factory:${NC} 0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb"
        echo -e "${YELLOW}    Quoter:${NC} 0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap V4:${NC}"
        echo -e "${YELLOW}    Quoter:${NC} 0x5EDACcc0660E0a2C44b06E07Ce8B915E625DC2c6"
        ;;
    local)
        echo -e "${GREEN}📍 Local Development (31337) Configuration:${NC}"
        echo -e "${YELLOW}  WETH:${NC} 0x4200000000000000000000000000000000000006"
        echo -e "${YELLOW}  Universal Router:${NC} 0x3315ef7cA28dB74aBADC6c44570efDF06b04B020"
        echo -e "${YELLOW}  LiFi:${NC} address(0) - ${RED}SKIPPED${NC}"
        echo -e "${YELLOW}  1inch:${NC} address(0) - ${RED}SKIPPED${NC}"
        echo ""
        echo -e "${YELLOW}  📊 Uniswap (Using Zora config):${NC}"
        echo -e "${YELLOW}    V2 Factory:${NC} 0x0F797dC7efaEA995bB916f268D919d0a1950eE3C"
        echo -e "${YELLOW}    V2 Router:${NC} 0xa00F34A632630EFd15223B1968358bA4845bEEC7"
        echo -e "${YELLOW}    V3 Factory:${NC} 0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb"
        echo -e "${YELLOW}    V3 Quoter:${NC} 0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df"
        echo -e "${YELLOW}    V4 Quoter:${NC} 0x5EDACcc0660E0a2C44b06E07Ce8B915E625DC2c6"
        ;;
esac

echo ""
echo -e "${BLUE}⚠️  Please verify these addresses are correct for the target network${NC}"
echo -e "${BLUE}💡 Official sources:${NC}"
echo -e "${BLUE}   - Uniswap: https://docs.uniswap.org/contracts/v3/reference/deployments${NC}"
echo -e "${BLUE}   - Base: https://docs.base.org/tools/network-information${NC}"
echo -e "${BLUE}   - 1inch: https://docs.1inch.io/docs/aggregation-protocol/api/swagger${NC}"
echo -e "${BLUE}   - LiFi: https://docs.li.fi/integrate-li.fi/li.fi-api/getting-started${NC}"
echo ""

# Add validation step
if [[ "$DRY_RUN" == "false" ]]; then
    echo -e "${YELLOW}⚠️  Addresses will be used for deployment. Continue? (y/N)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

eval $FORGE_CMD

if [[ $? -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        echo -e "${BLUE}===============================================${NC}"
        echo -e "${BLUE}📊 Deployment Summary${NC}"
        echo -e "${BLUE}===============================================${NC}"
        echo -e "${GREEN}Network:${NC} $CHAIN_NAME"
        echo -e "${GREEN}Total Facets:${NC} 7"
        echo -e "${GREEN}  - Core Facets:${NC} 4 (DiamondLoupe, Ownership, FeeCollector, Pause)"
        echo -e "${GREEN}  - Proxy Facets:${NC} 2 (LiFi, 1inch)"
        echo -e "${GREEN}  - In-house Facets:${NC} 1 (MoonXFacet - Universal Uniswap)"
        echo ""
        echo -e "${YELLOW}🔗 Check deployment details in broadcast/ directory${NC}"
        
        if [[ "$VERIFY" == "true" ]]; then
            echo -e "${YELLOW}🔍 Contract verification in progress...${NC}"
        fi
    else
        echo -e "${YELLOW}💡 This was a dry run. Use --broadcast flag to deploy${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🎉 MoonXFarm deployment complete!${NC}"
echo -e "${BLUE}Multi-aggregator support: LiFi + 1inch + Universal Uniswap V2/V3/V4${NC}" 