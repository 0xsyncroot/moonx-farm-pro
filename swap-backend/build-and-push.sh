#!/bin/bash

# Script to build and push moonx-auth-service Docker image
# Usage: ./build-and-push.sh [version]
# If no version provided, it will use timestamp

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Function to cleanup on exit
cleanup() {
    if [ -n "$IMAGE_NAME" ] && [ -n "$CLEANUP_ON_ERROR" ]; then
        print_warning "Cleaning up local image due to error..."
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Check if we're in the correct directory structure
print_step "Validating directory structure..."

# Check if we're in the auth service directory
if [ ! -f "Dockerfile" ]; then
    print_error "Dockerfile not found. Please run this script from the services/auth-service directory."
    exit 1
fi
print_info "Found Dockerfile in current directory"

# Check if Docker is running
print_step "Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi
print_info "Docker is running"

# Get version from parameter or timestamp
print_step "Determining version..."
if [ -n "$1" ]; then
    VERSION="$1"
    print_info "Using provided version: $VERSION"
else
    VERSION=$(date +%Y%m%d-%H%M%S)
    print_info "Using timestamp as version: $VERSION"
fi

# Validate version format (basic check)
if [[ ! "$VERSION" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    print_error "Invalid version format: $VERSION. Use only alphanumeric characters, dots, underscores, and hyphens."
    exit 1
fi

# Docker image details
DOCKER_USERNAME="hiepht"
REPO_NAME="moonx-farm"
SERVICE_NAME="pro-backend-service"
IMAGE_NAME="${DOCKER_USERNAME}/${REPO_NAME}:${SERVICE_NAME}-${VERSION}"
LATEST_IMAGE="${DOCKER_USERNAME}/${REPO_NAME}:${SERVICE_NAME}-latest"

print_step "Building Docker image: ${IMAGE_NAME}"

print_info "Building Docker image from project root with workspace support..."
print_info "Dockerfile: Dockerfile"

if docker build -f Dockerfile -t "${IMAGE_NAME}" -t "${LATEST_IMAGE}" .; then
    print_info "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    CLEANUP_ON_ERROR=true
    exit 1
fi

# Check if user is logged in to Docker Hub
print_step "Checking Docker Hub authentication..."
if docker info | grep -q "Username:"; then
    print_info "Already logged in to Docker Hub"
else
    print_warning "Not logged in to Docker Hub. Please login:"
    if ! docker login; then
        print_error "Failed to login to Docker Hub"
        CLEANUP_ON_ERROR=true
        exit 1
    fi
fi

# Push the versioned image
print_step "Pushing versioned image to Docker Hub..."
if docker push "${IMAGE_NAME}"; then
    print_info "Versioned image pushed successfully: ${IMAGE_NAME}"
else
    print_error "Failed to push versioned Docker image"
    CLEANUP_ON_ERROR=true
    exit 1
fi

# Push the latest image
print_step "Pushing latest image to Docker Hub..."
if docker push "${LATEST_IMAGE}"; then
    print_info "Latest image pushed successfully: ${LATEST_IMAGE}"
else
    print_error "Failed to push latest Docker image"
    CLEANUP_ON_ERROR=true
    exit 1
fi

# Remove local images
print_step "Cleaning up local images..."
if docker rmi "${IMAGE_NAME}" "${LATEST_IMAGE}"; then
    print_info "Local images removed successfully"
else
    print_warning "Failed to remove local images"
fi

# Clear trap since we're done
trap - EXIT

print_info "Build and push completed successfully!"
print_info "Images available at:"
print_info "  - Versioned: docker pull ${IMAGE_NAME}"
print_info "  - Latest: docker pull ${LATEST_IMAGE}"
print_info ""
print_info "To run the image:"
print_info "  docker run -p 3001:3001 ${LATEST_IMAGE}"
print_info ""
print_info "Or use docker-compose:"
print_info "  docker-compose up -d" 