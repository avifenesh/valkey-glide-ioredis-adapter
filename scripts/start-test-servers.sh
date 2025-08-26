#!/bin/bash

# Enhanced script to start Valkey test servers with dynamic port allocation
# This prevents conflicts when multiple test instances are running and provides better discovery

set -e

# Color output for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_PORT_ATTEMPTS=10
PORT_RANGE_START=10000
PORT_RANGE_END=60000
HEALTH_CHECK_TIMEOUT=30
CONTAINER_PREFIX="valkey-test"

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

# Function to check if a port is available
is_port_available() {
    local port=$1
    ! nc -z localhost $port 2>/dev/null
}

# Function to generate a random available port
generate_random_port() {
    local attempts=0
    while [ $attempts -lt $MAX_PORT_ATTEMPTS ]; do
        local port=$((RANDOM % (PORT_RANGE_END - PORT_RANGE_START + 1) + PORT_RANGE_START))
        if is_port_available $port; then
            echo $port
            return 0
        fi
        attempts=$((attempts + 1))
    done
    
    log_error "Failed to find available port after $MAX_PORT_ATTEMPTS attempts"
    return 1
}

# Function to find next available port starting from a given port
find_available_port() {
    local start_port=$1
    local port=$start_port
    
    while [ $port -le $PORT_RANGE_END ]; do
        if is_port_available $port; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done
    
    log_error "No available ports found starting from $start_port"
    return 1
}

# Function to clean up existing test containers
cleanup_existing_containers() {
    log "🧹 Cleaning up existing test containers..."
    
    # Stop and remove containers with our prefix
    local containers=$(docker ps -a --filter "name=${CONTAINER_PREFIX}" --format "{{.Names}}" 2>/dev/null || true)
    
    if [ -n "$containers" ]; then
        echo "$containers" | while read container; do
            log "Removing container: $container"
            docker stop "$container" >/dev/null 2>&1 || true
            docker rm "$container" >/dev/null 2>&1 || true
        done
    else
        log "No existing test containers found"
    fi
}

# Function to wait for Redis server to be ready
wait_for_redis() {
    local host=$1
    local port=$2
    local timeout=$3
    local start_time=$(date +%s)
    
    log "⏳ Waiting for Redis server at $host:$port to be ready..."
    
    while true; do
        if nc -z $host $port 2>/dev/null; then
            # Port is open, now check if Redis is responding
            if timeout 2 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
                log_success "✅ Redis server at $host:$port is ready"
                return 0
            fi
        fi
        
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $timeout ]; then
            log_error "❌ Timeout waiting for Redis server at $host:$port"
            return 1
        fi
        
        sleep 1
    done
}

# Function to start a Redis container with retry logic
start_redis_container() {
    local name=$1
    local port=$2
    local max_retries=3
    local retry=0
    
    while [ $retry -lt $max_retries ]; do
        log "🚀 Starting Redis container '$name' on port $port (attempt $((retry + 1))/$max_retries)..."
        
        if docker run -d --name "$name" -p "$port:6379" redis:latest >/dev/null 2>&1; then
            if wait_for_redis localhost $port $HEALTH_CHECK_TIMEOUT; then
                return 0
            else
                log_warning "Redis container started but health check failed, retrying..."
                docker stop "$name" >/dev/null 2>&1 || true
                docker rm "$name" >/dev/null 2>&1 || true
            fi
        else
            log_warning "Failed to start container, retrying..."
        fi
        
        retry=$((retry + 1))
        sleep 2
    done
    
    log_error "Failed to start Redis container '$name' after $max_retries attempts"
    return 1
}

# Function to discover running Redis servers
discover_existing_servers() {
    log "🔍 Discovering existing Redis servers..."
    local found_servers=()
    
    # Check common Redis ports
    for port in 6379 6380 6381; do
        if ! is_port_available $port; then
            # Try to ping Redis
            if timeout 2 bash -c "echo 'PING' | nc localhost $port" 2>/dev/null | grep -q PONG; then
                found_servers+=("localhost:$port")
                log_success "Found existing Redis server at localhost:$port"
            fi
        fi
    done
    
    if [ ${#found_servers[@]} -gt 0 ]; then
        log_success "Found ${#found_servers[@]} existing Redis server(s): ${found_servers[*]}"
        return 0
    else
        log "No existing Redis servers found on standard ports"
        return 1
    fi
}

# Main execution
main() {
    log "🔧 Starting enhanced Valkey test server setup..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running or not accessible"
        exit 1
    fi
    
    # Check if nc (netcat) is available
    if ! command -v nc &> /dev/null; then
        log_warning "netcat not found, installing..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update >/dev/null 2>&1 && sudo apt-get install -y netcat >/dev/null 2>&1
        elif command -v yum &> /dev/null; then
            sudo yum install -y nc >/dev/null 2>&1
        else
            log_error "Cannot install netcat automatically. Please install it manually."
            exit 1
        fi
    fi
    
    # Clean up any existing test containers
    cleanup_existing_containers
    
    # Try to discover existing Redis servers first
    if discover_existing_servers; then
        log_success "✨ Using existing Redis servers. No new containers needed."
        log "💡 To start fresh containers anyway, run: $0 --force"
        
        # Still export configuration for consistency
        export VALKEY_STANDALONE_HOST="localhost"
        export VALKEY_STANDALONE_PORT="6379"
        
        # Save configuration to .env.test
        cat > .env.test << EOF
# Auto-discovered Redis configuration - $(date)
VALKEY_STANDALONE_HOST=localhost
VALKEY_STANDALONE_PORT=6379
EOF
        log_success "📋 Configuration saved to .env.test"
        return 0
    fi
    
    # Generate dynamic ports
    log "🎲 Generating dynamic port configuration..."
    
    # Try to use standard Redis port first, fall back to random if busy
    if is_port_available 6379; then
        export VALKEY_STANDALONE_PORT=6379
        log "Using standard Redis port: 6379"
    else
        export VALKEY_STANDALONE_PORT=$(generate_random_port)
        log "Standard port busy, using random port: $VALKEY_STANDALONE_PORT"
    fi
    
    export VALKEY_STANDALONE_HOST="localhost"
    
    # Generate cluster ports
    export VALKEY_CLUSTER_PORT_1=$(find_available_port 7000)
    export VALKEY_CLUSTER_PORT_2=$(find_available_port $((VALKEY_CLUSTER_PORT_1 + 1)))
    export VALKEY_CLUSTER_PORT_3=$(find_available_port $((VALKEY_CLUSTER_PORT_2 + 1)))
    export VALKEY_CLUSTER_PORT_4=$(find_available_port $((VALKEY_CLUSTER_PORT_3 + 1)))
    export VALKEY_CLUSTER_PORT_5=$(find_available_port $((VALKEY_CLUSTER_PORT_4 + 1)))
    export VALKEY_CLUSTER_PORT_6=$(find_available_port $((VALKEY_CLUSTER_PORT_5 + 1)))
    
    log_success "🚀 Starting Valkey test servers with dynamic ports:"
    log "   📡 Standalone: localhost:$VALKEY_STANDALONE_PORT"
    log "   🔗 Cluster nodes: $VALKEY_CLUSTER_PORT_1, $VALKEY_CLUSTER_PORT_2, $VALKEY_CLUSTER_PORT_3, $VALKEY_CLUSTER_PORT_4, $VALKEY_CLUSTER_PORT_5, $VALKEY_CLUSTER_PORT_6"
    
    # Start standalone Redis server
    if start_redis_container "${CONTAINER_PREFIX}-standalone" "$VALKEY_STANDALONE_PORT"; then
        log_success "✅ Standalone Redis server started successfully"
    else
        log_error "❌ Failed to start standalone Redis server"
        exit 1
    fi
    
    # Save environment variables to .env.test file for tests to read
    cat > .env.test << EOF
# Auto-generated test environment configuration - $(date)
# Standalone Redis/Valkey server
VALKEY_STANDALONE_HOST=$VALKEY_STANDALONE_HOST
VALKEY_STANDALONE_PORT=$VALKEY_STANDALONE_PORT

# Cluster Redis/Valkey servers (for future use)
VALKEY_CLUSTER_PORT_1=$VALKEY_CLUSTER_PORT_1
VALKEY_CLUSTER_PORT_2=$VALKEY_CLUSTER_PORT_2
VALKEY_CLUSTER_PORT_3=$VALKEY_CLUSTER_PORT_3
VALKEY_CLUSTER_PORT_4=$VALKEY_CLUSTER_PORT_4
VALKEY_CLUSTER_PORT_5=$VALKEY_CLUSTER_PORT_5
VALKEY_CLUSTER_PORT_6=$VALKEY_CLUSTER_PORT_6

# Container information
CONTAINER_PREFIX=$CONTAINER_PREFIX
STARTED_AT=$(date -Iseconds)
EOF
    
    log_success "📋 Environment configuration saved to .env.test"
    log_success "🎉 All Valkey test servers are ready!"
    log "📊 Server Details:"
    log "   🔸 Standalone server: localhost:$VALKEY_STANDALONE_PORT"
    log "   🔸 Container name: ${CONTAINER_PREFIX}-standalone"
    log ""
    log "💡 Usage:"
    log "   📝 Run tests: npm test"
    log "   🔍 Check server status: docker ps --filter name=${CONTAINER_PREFIX}"
    log "   🛑 Stop servers: ./scripts/stop-test-servers.sh"
    log "   📋 View logs: docker logs ${CONTAINER_PREFIX}-standalone"
}

# Handle command line arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [--force] [--help]"
    echo ""
    echo "Options:"
    echo "  --force    Force start new containers even if Redis servers are running"
    echo "  --help     Show this help message"
    echo ""
    echo "This script will:"
    echo "1. Discover existing Redis servers on standard ports"
    echo "2. If found, use them instead of starting new containers"
    echo "3. If not found, start new Redis containers with dynamic ports"
    echo "4. Export configuration to .env.test for tests to use"
    exit 0
fi

if [ "$1" = "--force" ]; then
    log "🔧 Force mode: Will start new containers regardless of existing servers"
    # Skip discovery by setting a flag
    discover_existing_servers() { return 1; }
fi

# Run main function
main