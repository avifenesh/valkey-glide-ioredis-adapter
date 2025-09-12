#!/bin/bash

# Script to start Valkey Bundle with JSON and Search modules for testing
# Integrates with existing test infrastructure

set -e

# Color output for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running or not accessible"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
        log_error "docker compose is not available (neither V2 'docker compose' nor V1 'docker-compose')"
        log "Please install docker compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
}

# Function to use appropriate docker compose command
docker_compose_cmd() {
    if docker compose version &> /dev/null; then
        docker compose "$@"
    else
        docker-compose "$@"
    fi
}

# Function to load environment configuration
load_env_config() {
    if [ -f ".env.test" ]; then
        log "📋 Loading configuration from .env.test..."
        export $(cat .env.test | grep -E "^VALKEY_STANDALONE_" | xargs)
        log "Using port: ${VALKEY_STANDALONE_PORT:-6379}"
    else
        log_warning "No .env.test file found, using default port 6379"
        export VALKEY_STANDALONE_PORT=6379
    fi
}

# Function to stop existing containers
stop_existing_containers() {
    log "🧹 Stopping existing test containers..."
    
    # Stop any running valkey-bundle containers
    if docker ps --filter "name=valkey-test" --format "{{.Names}}" | grep -q .; then
        docker_compose_cmd -f docker-compose.valkey-bundle.yml down --remove-orphans >/dev/null 2>&1 || true
    fi
    
    # Stop regular test containers if running
    if command -v ./scripts/stop-test-servers.sh >/dev/null 2>&1; then
        log "Stopping regular test servers..."
        ./scripts/stop-test-servers.sh >/dev/null 2>&1 || true
    fi
}

# Function to start valkey-bundle
start_valkey_bundle() {
    log "🚀 Starting Valkey Bundle with JSON and Search modules..."
    
    # Check if docker-compose file exists
    if [ -f "docker-compose.valkey-bundle.yml" ]; then
        # Start the container using docker-compose
        if docker_compose_cmd -f docker-compose.valkey-bundle.yml up -d; then
            log_success "✅ Valkey Bundle container started"
        else
            log_error "❌ Failed to start Valkey Bundle container"
            exit 1
        fi
    else
        # Fallback: start container directly with docker run
        log "📦 Docker-compose file not found, starting container directly..."
        if docker run -d \
            --name valkey-test-standalone \
            -p 6383:6379 \
            valkey/valkey-bundle:8.1-bookworm \
            valkey-server \
            --bind 0.0.0.0 \
            --port 6379 \
            --loadmodule /opt/valkey-stack/lib/valkey-json.so \
            --loadmodule /opt/valkey-stack/lib/valkey-search.so; then
            log_success "✅ Valkey Bundle container started directly"
        else
            log_error "❌ Failed to start Valkey Bundle container directly"
            exit 1
        fi
    fi
}

# Function to wait for valkey-bundle to be ready
wait_for_valkey_bundle() {
    local timeout=60
    local start_time=$(date +%s)
    
    log "⏳ Waiting for Valkey Bundle to be ready with all modules..."
    
    while true; do
        # Check if container is healthy (works for both docker-compose and direct run)
        if docker ps --filter "name=valkey-test-standalone" --format "{{.Status}}" | grep -q "Up"; then
            # Test if we can connect to the service
            if nc -z localhost 6383 2>/dev/null; then
                log_success "✅ Valkey Bundle is healthy and accessible"
                break
            fi
        fi
        
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $timeout ]; then
            log_error "❌ Timeout waiting for Valkey Bundle to be ready"
            log "Container status:"
            docker ps --filter "name=valkey-test-standalone"
            log "Container logs:"
            docker logs valkey-test-standalone 2>/dev/null || echo "No logs available"
            exit 1
        fi
        
        echo -n "."
        sleep 2
    done
}

# Function to verify modules are loaded
verify_modules() {
    log "🔍 Verifying JSON and Search modules are loaded..."
    
    local port=${VALKEY_STANDALONE_PORT:-6379}
    
    # Check if we can connect and list modules
    if timeout 5 docker exec valkey-test-standalone valkey-cli MODULE LIST > /tmp/modules.txt 2>/dev/null; then
        if grep -q "json" /tmp/modules.txt && grep -q "search" /tmp/modules.txt; then
            log_success "✅ JSON and Search modules are loaded"
            log "📋 Available modules:"
            cat /tmp/modules.txt | while read line; do
                if [[ $line =~ ^[0-9]+\) ]]; then
                    log "   🔸 $line"
                fi
            done
        else
            log_warning "⚠️ Some modules may not be loaded. Available modules:"
            cat /tmp/modules.txt
        fi
        rm -f /tmp/modules.txt
    else
        log_warning "⚠️ Could not verify modules, but container appears healthy"
    fi
}

# Function to run module tests
run_module_tests() {
    if [ "$1" = "--test" ]; then
        log "🧪 Running JSON and Search module tests..."
        
        log "Running JSON tests..."
        if npm test tests/unit/json-commands.test.ts; then
            log_success "✅ JSON tests passed"
        else
            log_error "❌ JSON tests failed"
        fi
        
        log "Running Search tests..."
        if npm test tests/unit/search-commands.test.ts; then
            log_success "✅ Search tests passed"
        else
            log_error "❌ Search tests failed"
        fi
    fi
}

# Function to show usage information
show_status() {
    log_success "🎉 Valkey Bundle is ready for JSON and Search testing!"
    log ""
    log "📊 Status:"
    log "   🔸 Container: valkey-test-standalone"
    log "   🔸 Port: ${VALKEY_STANDALONE_PORT:-6379}"
    log "   🔸 Modules: JSON, Search, and more"
    log ""
    log "💡 Usage:"
    log "   📝 Run JSON tests: npm test tests/unit/json-commands.test.ts"
    log "   📝 Run Search tests: npm test tests/unit/search-commands.test.ts"
    log "   📝 Run all tests: npm test"
    log "   🔍 Check status: docker compose -f docker-compose.valkey-bundle.yml ps"
    log "   📋 View logs: docker compose -f docker-compose.valkey-bundle.yml logs -f valkey-bundle"
    log "   🛑 Stop: docker compose -f docker-compose.valkey-bundle.yml down"
    log "   🔧 Interactive CLI: docker compose -f docker-compose.valkey-bundle.yml run --rm valkey-cli"
}

# Main execution
main() {
    log "🔧 Starting Valkey Bundle setup for JSON and Search testing..."
    
    check_docker
    load_env_config
    stop_existing_containers
    start_valkey_bundle
    wait_for_valkey_bundle
    verify_modules
    run_module_tests "$@"
    show_status
}

# Handle command line arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [--test] [--help]"
    echo ""
    echo "Options:"
    echo "  --test     Run JSON and Search tests after starting the container"
    echo "  --help     Show this help message"
    echo ""
    echo "This script will:"
    echo "1. Stop any existing test containers"
    echo "2. Start Valkey Bundle with JSON and Search modules"
    echo "3. Wait for the container to be healthy"
    echo "4. Verify modules are loaded"
    echo "5. Optionally run module tests"
    exit 0
fi

# Run main function
main "$@"