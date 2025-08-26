#!/bin/bash

# Enhanced script to stop Valkey test servers with better cleanup and discovery

set -e

# Color output for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_PREFIX="valkey-test"
ENV_FILE=".env.test"

# Function to log with timestamp
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Function to stop and remove containers by prefix
stop_test_containers() {
    log "🛑 Stopping test containers..."
    
    # Find all containers with our prefix
    local containers=$(docker ps -a --filter "name=${CONTAINER_PREFIX}" --format "{{.Names}}" 2>/dev/null || true)
    
    if [ -z "$containers" ]; then
        log "📍 No test containers found with prefix '${CONTAINER_PREFIX}'"
        return 0
    fi
    
    local stopped_count=0
    echo "$containers" | while read container; do
        if [ -n "$container" ]; then
            log "Stopping container: $container"
            if docker stop "$container" >/dev/null 2>&1; then
                log_success "Stopped: $container"
            else
                log_warning "Failed to stop or container already stopped: $container"
            fi
            
            log "Removing container: $container"
            if docker rm "$container" >/dev/null 2>&1; then
                log_success "Removed: $container"
            else
                log_warning "Failed to remove container: $container"
            fi
            
            stopped_count=$((stopped_count + 1))
        fi
    done
    
    log_success "🎉 Container cleanup completed"
}

# Function to clean up docker-compose services (fallback)
stop_docker_compose() {
    if [ -f "docker-compose.test.yml" ]; then
        log "🐳 Stopping docker-compose services..."
        
        if command -v docker-compose &> /dev/null; then
            sudo docker-compose -f docker-compose.test.yml down -v >/dev/null 2>&1 || true
            log_success "Docker-compose services stopped"
        else
            log_warning "docker-compose not found, skipping compose cleanup"
        fi
    else
        log "No docker-compose.test.yml found, skipping compose cleanup"
    fi
}

# Function to clean up environment files
cleanup_env_files() {
    log "🧹 Cleaning up environment files..."
    
    if [ -f "$ENV_FILE" ]; then
        log "Removing $ENV_FILE"
        rm -f "$ENV_FILE"
        log_success "Environment file cleaned up"
    else
        log "No $ENV_FILE found"
    fi
    
    # Also clean up any backup files
    if [ -f "${ENV_FILE}.backup" ]; then
        log "Removing ${ENV_FILE}.backup"
        rm -f "${ENV_FILE}.backup"
    fi
}

# Main execution
main() {
    log "🛑 Starting enhanced test server cleanup..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running or not accessible"
        exit 1
    fi
    
    # Stop test containers
    stop_test_containers
    
    # Fallback: stop docker-compose services
    stop_docker_compose
    
    # Clean up environment files
    cleanup_env_files
    
    log_success "🏁 Cleanup completed successfully!"
    log "💡 To start fresh test servers, run: ./scripts/start-test-servers.sh"
}

# Handle command line arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [--help]"
    echo ""
    echo "This script will:"
    echo "1. Stop and remove all test containers with prefix '${CONTAINER_PREFIX}'"
    echo "2. Stop docker-compose services if applicable"
    echo "3. Clean up .env.test and related files"
    exit 0
fi

# Run main function
main