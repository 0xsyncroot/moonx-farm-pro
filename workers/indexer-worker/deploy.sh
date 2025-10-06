#!/bin/bash

# MoonX Indexer Worker Deployment Script
# Supports local development, Docker, and Kubernetes deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="local"
CHAIN_ID=""
BUILD_IMAGE=false
PUSH_IMAGE=false
NAMESPACE="default"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} MoonX Indexer Worker Deployment${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Function to show usage
show_help() {
    cat << EOF
MoonX Indexer Worker Deployment Script

Usage: $0 [OPTIONS]

Options:
    -m, --mode MODE          Deployment mode: local, docker, k8s (default: local)
    -c, --chain-id ID        Specific chain ID to index (optional)
    -b, --build              Build Docker image
    -p, --push               Push Docker image to registry
    -n, --namespace NS       Kubernetes namespace (default: default)
    -h, --help               Show this help message

Examples:
    # Local development
    $0 --mode local

    # Docker deployment
    $0 --mode docker --build

    # Kubernetes deployment
    $0 --mode k8s --namespace moonx-prod

    # Specific chain only
    $0 --mode local --chain-id 8453
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -c|--chain-id)
            CHAIN_ID="$2"
            shift 2
            ;;
        -b|--build)
            BUILD_IMAGE=true
            shift
            ;;
        -p|--push)
            PUSH_IMAGE=true
            shift
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate mode
if [[ ! "$MODE" =~ ^(local|docker|k8s)$ ]]; then
    print_error "Invalid mode: $MODE. Must be local, docker, or k8s"
    exit 1
fi

print_header

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    case $MODE in
        local)
            if ! command -v python3 &> /dev/null; then
                print_error "Python 3 is required for local deployment"
                exit 1
            fi
            if ! command -v pip &> /dev/null; then
                print_error "pip is required for local deployment"
                exit 1
            fi
            ;;
        docker)
            if ! command -v docker &> /dev/null; then
                print_error "Docker is required for Docker deployment"
                exit 1
            fi
            if ! command -v docker-compose &> /dev/null; then
                print_error "docker-compose is required for Docker deployment"
                exit 1
            fi
            ;;
        k8s)
            if ! command -v kubectl &> /dev/null; then
                print_error "kubectl is required for Kubernetes deployment"
                exit 1
            fi
            ;;
    esac
    
    print_status "Prerequisites check passed"
}

# Setup environment
setup_environment() {
    print_status "Setting up environment..."
    
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            print_status "Creating .env from .env.example"
            cp .env.example .env
            print_warning "Please edit .env file with your configuration"
        else
            print_error ".env.example not found. Please create .env file manually"
            exit 1
        fi
    fi
    
    print_status "Environment setup complete"
}

# Local deployment
deploy_local() {
    print_status "Starting local deployment..."
    
    # Install dependencies
    print_status "Installing Python dependencies..."
    pip install -r requirements.txt
    
    # Check configuration
    print_status "Validating configuration..."
    python main.py config
    
    # Test connections
    if [[ -n "$CHAIN_ID" ]]; then
        print_status "Testing connection for chain $CHAIN_ID..."
        python main.py test-connection $CHAIN_ID
    fi
    
    # Start worker
    print_status "Starting indexer worker..."
    if [[ -n "$CHAIN_ID" ]]; then
        python main.py start --chain-id $CHAIN_ID
    else
        python main.py start
    fi
}

# Docker deployment
deploy_docker() {
    print_status "Starting Docker deployment..."
    
    if [[ "$BUILD_IMAGE" == true ]]; then
        print_status "Building Docker image..."
        docker build -t moonx/indexer-worker:latest .
        
        if [[ "$PUSH_IMAGE" == true ]]; then
            print_status "Pushing Docker image..."
            docker push moonx/indexer-worker:latest
        fi
    fi
    
    print_status "Starting services with docker-compose..."
    docker-compose up -d
    
    print_status "Checking service health..."
    sleep 10
    docker-compose ps
    
    print_status "Docker deployment complete"
    print_status "Health check: http://localhost:8080/health"
}

# Kubernetes deployment
deploy_k8s() {
    print_status "Starting Kubernetes deployment..."
    
    # Check if namespace exists, create if not
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        print_status "Creating namespace: $NAMESPACE"
        kubectl create namespace $NAMESPACE
    fi
    
    # Apply configurations
    print_status "Applying Kubernetes configurations..."
    kubectl apply -f k8s-deployment.yaml -n $NAMESPACE
    
    # Wait for deployment to be ready
    print_status "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/moonx-indexer-worker -n $NAMESPACE
    
    # Show status
    print_status "Deployment status:"
    kubectl get pods -l app=moonx-indexer-worker -n $NAMESPACE
    
    # Get service info
    print_status "Service information:"
    kubectl get service moonx-indexer-worker-service -n $NAMESPACE
    
    print_status "Kubernetes deployment complete"
}

# Health check
check_health() {
    case $MODE in
        local)
            python main.py health
            ;;
        docker)
            curl -s http://localhost:8080/health | python -m json.tool
            ;;
        k8s)
            kubectl exec -n $NAMESPACE deployment/moonx-indexer-worker -- python main.py health
            ;;
    esac
}

# Main deployment logic
main() {
    check_prerequisites
    setup_environment
    
    case $MODE in
        local)
            deploy_local
            ;;
        docker)
            deploy_docker
            ;;
        k8s)
            deploy_k8s
            ;;
    esac
    
    print_status "Deployment completed successfully!"
    
    # Show next steps
    echo ""
    print_header
    print_status "Next steps:"
    case $MODE in
        local)
            echo "  - Worker is running locally"
            echo "  - Check logs for indexing progress"
            echo "  - Use Ctrl+C to stop"
            ;;
        docker)
            echo "  - Services are running in Docker"
            echo "  - Health check: http://localhost:8080/health"
            echo "  - View logs: docker-compose logs -f"
            echo "  - Stop services: docker-compose down"
            ;;
        k8s)
            echo "  - Services are running in Kubernetes namespace: $NAMESPACE"
            echo "  - Check pods: kubectl get pods -n $NAMESPACE"
            echo "  - View logs: kubectl logs -f deployment/moonx-indexer-worker -n $NAMESPACE"
            echo "  - Port forward for health check: kubectl port-forward service/moonx-indexer-worker-service 8080:8080 -n $NAMESPACE"
            ;;
    esac
}

# Run main function
main