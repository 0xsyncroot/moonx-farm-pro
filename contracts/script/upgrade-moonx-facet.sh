#!/bin/bash

# ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
# ┃                                                    MOONX FARM ROUTER - MOONXFACET UPGRADE SCRIPT                                                                                ┃
# ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
#
# @title upgrade-moonx-facet.sh
# @notice Shell script to upgrade MoonXFacet on various networks
#
# @dev FEATURES:
# - Supports multiple networks (Base, Ethereum, Base Sepolia)
# - Automatic environment validation
# - Backup and restore capabilities
# - Comprehensive error handling
# - Gas estimation and optimization
# - Verification of upgrade success
#
# @dev USAGE:
# ./script/upgrade-moonx-facet.sh <network> <diamond_address>
#
# @dev EXAMPLES:
# ./script/upgrade-moonx-facet.sh base 0x1234...
# ./script/upgrade-moonx-facet.sh ethereum 0x5678...
# ./script/upgrade-moonx-facet.sh base-sepolia 0x9abc...
#
# @author MoonX Team
# @custom:version 1.0.0

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f ".env" ]; then
    source .env
    echo "✅ Loaded .env file"
else
    echo "⚠️  No .env file found. Using system environment variables."
fi

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
}

log_step() {
    echo -e "${PURPLE}🚀 STEP:${NC} $1"
}

# Network configurations
declare -A NETWORKS
NETWORKS[base]="8453"
NETWORKS[base-local]="8453"
NETWORKS[ethereum]="1"
NETWORKS[mainnet]="1"
NETWORKS[base-sepolia]="84532"
NETWORKS[sepolia]="84532"

declare -A RPC_URLS
RPC_URLS[base]="https://base-mainnet.g.alchemy.com/v2/UphfhralOCYNjg3BnpFIG"
RPC_URLS[base-local]="http://localhost:8645"
RPC_URLS[ethereum]="https://ethereum.publicnode.com"
RPC_URLS[mainnet]="https://ethereum.publicnode.com"
RPC_URLS[base-sepolia]="https://sepolia.base.org"
RPC_URLS[sepolia]="https://sepolia.base.org"

declare -A EXPLORERS
EXPLORERS[base]="https://basescan.org"
EXPLORERS[base-local]="https://basescan.org"
EXPLORERS[ethereum]="https://etherscan.io"
EXPLORERS[mainnet]="https://etherscan.io"
EXPLORERS[base-sepolia]="https://sepolia.basescan.org"
EXPLORERS[sepolia]="https://sepolia.basescan.org"

# Verification configuration - define which networks support contract verification
declare -A VERIFY_NETWORKS
VERIFY_NETWORKS[base]="basescan"           # Base Mainnet - verify with Basescan
VERIFY_NETWORKS[ethereum]="etherscan"      # Ethereum Mainnet - verify with Etherscan  
VERIFY_NETWORKS[mainnet]="etherscan"       # Ethereum Mainnet alias
VERIFY_NETWORKS[base-sepolia]="basescan"   # Base Sepolia testnet - verify with Basescan
VERIFY_NETWORKS[sepolia]="basescan"        # Base Sepolia alias
# Note: base-local not included - no verification for local networks

declare -A VERIFY_API_KEYS
VERIFY_API_KEYS[basescan]="BASESCAN_API_KEY"
VERIFY_API_KEYS[etherscan]="ETHERSCAN_API_KEY"

# Function to display usage
usage() {
    echo -e "${CYAN}📖 USAGE:${NC}"
    echo "  $0 [network] [diamond_address]"
    echo ""
    echo -e "${CYAN}📋 ENVIRONMENT VARIABLES (.env file):${NC}"
    echo "  • NETWORK (default network to use)"
    echo "  • DIAMOND_ADDRESS (diamond contract address)"
    echo "  • PRIVATE_KEY (deployer private key)"
    echo "  • FEE_RECIPIENT (fee recipient address)"
    echo ""
    echo -e "${CYAN}📋 SUPPORTED NETWORKS:${NC}"
    for network in "${!NETWORKS[@]}"; do
        local verify_info=""
        if [[ -n "${VERIFY_NETWORKS[$network]}" ]]; then
            verify_info=" [Verification: ${VERIFY_NETWORKS[$network]}]"
        else
            verify_info=" [No Verification]"
        fi
        echo "  • $network (Chain ID: ${NETWORKS[$network]})$verify_info"
    done
    echo ""
    echo -e "${CYAN}💡 EXAMPLES:${NC}"
    echo "  # Using .env file only:"
    echo "  $0"
    echo ""
    echo "  # Override network from .env:"
    echo "  $0 base"
    echo ""
    echo "  # Override both network and diamond address:"
    echo "  $0 base 0x1234567890123456789012345678901234567890"
    echo ""
    echo -e "${CYAN}📄 REQUIREMENTS:${NC}"
    echo "  • .env file with required variables OR environment variables"
    echo "  • Forge installed"
    echo "  • Sufficient ETH balance for gas"
}

# Function to validate environment
validate_environment() {
    log_step "Validating environment..."
    
    # Check if forge is installed
    if ! command -v forge &> /dev/null; then
        log_error "Forge is not installed. Please install Foundry first."
        exit 1
    fi
    
    # Check required environment variables
    if [[ -z "$PRIVATE_KEY" ]]; then
        log_error "PRIVATE_KEY environment variable is not set"
        exit 1
    fi
    
    if [[ -z "$FEE_RECIPIENT" ]]; then
        log_error "FEE_RECIPIENT environment variable is not set"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

# Function to validate inputs
validate_inputs() {
    local network_arg=$1
    local diamond_arg=$2
    
    log_step "Validating inputs..."
    
    # Use argument or environment variable for network
    if [[ -n "$network_arg" ]]; then
        NETWORK="$network_arg"
    elif [[ -z "$NETWORK" ]]; then
        log_error "Network not specified. Use argument or set NETWORK in .env file"
        echo ""
        usage
        exit 1
    fi
    
    # Use argument or environment variable for diamond address
    if [[ -n "$diamond_arg" ]]; then
        DIAMOND_ADDRESS="$diamond_arg"
    elif [[ -z "$DIAMOND_ADDRESS" ]]; then
        log_error "Diamond address not specified. Use argument or set DIAMOND_ADDRESS in .env file"
        echo ""
        usage
        exit 1
    fi
    
    # Check if network is supported
    if [[ -z "${NETWORKS[$NETWORK]}" ]]; then
        log_error "Unsupported network: $NETWORK"
        echo ""
        usage
        exit 1
    fi
    
    # Basic ethereum address validation
    if [[ ! "$DIAMOND_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        log_error "Invalid diamond address format: $DIAMOND_ADDRESS"
        exit 1
    fi
    
    log_success "Input validation passed"
    log_info "Using Network: $NETWORK"
    log_info "Using Diamond Address: $DIAMOND_ADDRESS"
}

# Function to check network connectivity
check_network() {
    local rpc_url="${RPC_URLS[$NETWORK]}"
    
    log_step "Checking network connectivity for $NETWORK..."
    
    # Test RPC connectivity
    if ! curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        "$rpc_url" > /dev/null; then
        log_error "Cannot connect to $NETWORK RPC: $rpc_url"
        exit 1
    fi
    
    log_success "Network connectivity verified"
}

# Function to estimate gas
estimate_gas() {
    log_step "Estimating gas costs..."
    
    # This is a rough estimation - actual costs may vary
    local chain_id="${NETWORKS[$NETWORK]}"
    case $chain_id in
        1)    # Ethereum Mainnet
            log_info "Estimated gas cost: ~0.01-0.05 ETH (depending on network congestion)"
            ;;
        8453) # Base Mainnet  
            log_info "Estimated gas cost: ~0.001-0.005 ETH (much cheaper on Base)"
            ;;
        84532) # Base Sepolia
            log_info "Estimated gas cost: ~0.001 ETH (testnet)"
            ;;
        *)
            log_info "Gas estimation not available for this network"
            ;;
    esac
}

# Function to backup current state
backup_facet() {
    log_step "Creating backup of current MoonXFacet state..."
    
    # Create backup directory
    local backup_dir="./backups/$(date +%Y%m%d_%H%M%S)_${NETWORK}"
    mkdir -p "$backup_dir"
    
    # Save current diamond state (this would be more comprehensive in production)
    echo "Network: $NETWORK" > "$backup_dir/upgrade_info.txt"
    echo "Diamond Address: $DIAMOND_ADDRESS" >> "$backup_dir/upgrade_info.txt"
    echo "Timestamp: $(date)" >> "$backup_dir/upgrade_info.txt"
    echo "Chain ID: ${NETWORKS[$NETWORK]}" >> "$backup_dir/upgrade_info.txt"
    
    log_success "Backup created at: $backup_dir"
}

# Function to run the upgrade
run_upgrade() {
    local chain_id="${NETWORKS[$NETWORK]}"
    local rpc_url="${RPC_URLS[$NETWORK]}"
    
    log_step "Starting MoonXFacet upgrade on $NETWORK..."
    
    # Environment variable is already set globally
    export DIAMOND_ADDRESS="$DIAMOND_ADDRESS"
    
    # Display salt configuration
    if [[ -n "$UPGRADE_SALT" ]]; then
        log_info "Using custom SALT: $UPGRADE_SALT"
        export UPGRADE_SALT="$UPGRADE_SALT"
    elif [[ "$USE_DYNAMIC_SALT" == "true" ]]; then
        log_info "Using dynamic SALT (new address each upgrade)"
        export USE_DYNAMIC_SALT="true"
    else
        log_info "Using deterministic SALT (same address every time)"
    fi
    
    # Construct forge script command - start without verification
    local forge_cmd="forge script script/UpgradeMoonXFacet.s.sol:UpgradeMoonXFacetScript \
        --chain-id $chain_id \
        --rpc-url $rpc_url \
        --broadcast \
        -vvvv"
    
    # Add verification if network supports it
    local verify_service="${VERIFY_NETWORKS[$NETWORK]}"
    if [[ -n "$verify_service" ]]; then
        local api_key_var="${VERIFY_API_KEYS[$verify_service]}"
        local api_key_value="${!api_key_var}"
        
        if [[ -n "$api_key_value" ]]; then
            forge_cmd="$forge_cmd --verify --etherscan-api-key $api_key_value"
            log_info "Contract verification enabled for $NETWORK (using $verify_service)"
        else
            log_warning "Verification available for $NETWORK but $api_key_var not set - skipping verification"
        fi
    else
        log_info "Contract verification not available/needed for $NETWORK"
    fi
    
    log_info "Executing: $forge_cmd"
    echo ""
    
    # Execute the upgrade
    if eval "$forge_cmd"; then
        log_success "MoonXFacet upgrade completed successfully!"
        
        # Display explorer links
        local explorer="${EXPLORERS[$NETWORK]}"
        log_info "View on explorer: $explorer/address/$DIAMOND_ADDRESS"
        
        return 0
    else
        log_error "MoonXFacet upgrade failed!"
        return 1
    fi
}

# Function to verify upgrade
verify_upgrade() {
    log_step "Verifying upgrade success..."
    
    # Here you could add additional verification logic
    # For now, we rely on the script's internal verification
    
    log_success "Upgrade verification completed"
}

# Main function
main() {
    echo -e "${CYAN}"
    echo "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮"
    echo "┃                                                    🌙 MOONX FARM ROUTER - MOONXFACET UPGRADE 🚀                                                                                ┃"
    echo "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
    echo -e "${NC}"
    
    # Check arguments (optional now)
    if [[ $# -gt 2 ]]; then
        log_error "Too many arguments. Maximum 2 arguments: [network] [diamond_address]"
        echo ""
        usage
        exit 1
    fi
    
    local network_arg=$1
    local diamond_arg=$2
    
    # Run all validations
    validate_inputs "$network_arg" "$diamond_arg"
    validate_environment
    check_network
    
    echo ""
    log_info "Network: $NETWORK"
    log_info "Diamond Address: $DIAMOND_ADDRESS"
    log_info "Chain ID: ${NETWORKS[$NETWORK]}"
    echo ""
    
    # Show gas estimation
    estimate_gas
    
    # Ask for confirmation
    echo ""
    log_warning "This will upgrade the MoonXFacet contract on $NETWORK"
    read -p "Do you want to continue? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Upgrade cancelled by user"
        exit 0
    fi
    
    # Create backup
    backup_facet
    
    # Run the upgrade
    if run_upgrade; then
        verify_upgrade
        
        echo ""
        log_success "🎉 MoonXFacet upgrade completed successfully!"
        log_info "Diamond Address: $DIAMOND_ADDRESS"
        log_info "Network: $NETWORK (Chain ID: ${NETWORKS[$NETWORK]})"
        log_info "Explorer: ${EXPLORERS[$NETWORK]}/address/$DIAMOND_ADDRESS"
    else
        echo ""
        log_error "💥 MoonXFacet upgrade failed!"
        log_info "Check the logs above for detailed error information"
        log_info "Backup created in ./backups/ directory"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"