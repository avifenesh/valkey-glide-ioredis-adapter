#!/bin/bash

# Dual Mode Test Runner - Tests both standalone and cluster modes
# Runs the same test suite against both deployment types

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Dual Mode Test Runner (Standalone + Cluster) ===${NC}"

# Check if dual-mode tests exist
DUAL_MODE_TESTS=($(find tests -name "*dual-mode*.test.mjs" | sort))

if [ ${#DUAL_MODE_TESTS[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No dual-mode tests found. Run: npm run convert-tests${NC}"
    echo -e "${YELLOW}   Or create tests using testBothModes() helper${NC}"
    exit 0
fi

echo -e "${YELLOW}Found ${#DUAL_MODE_TESTS[@]} dual-mode test files...${NC}"

# Phase 1: Test Standalone Mode (always available)
echo -e "\n${GREEN}=== Phase 1: Standalone Mode Tests ===${NC}"

# Start standalone infrastructure
find_free_port() {
    local port=$1
    while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
        ((port++))
    done
    echo $port
}

VALKEY_PORT=$(find_free_port 6380)
CONTAINER_NAME="dual-mode-standalone-$$"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found. Using system Valkey if available${NC}"
    export VALKEY_HOST=localhost
    export VALKEY_PORT=6379
    DOCKER_AVAILABLE=false
else
    DOCKER_AVAILABLE=true
    echo -e "${YELLOW}Starting standalone Valkey on port $VALKEY_PORT...${NC}"
    
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$VALKEY_PORT:6379" \
        --health-cmd "valkey-cli ping" \
        --health-interval 1s \
        --health-timeout 3s \
        --health-retries 5 \
        valkey/valkey-bundle:latest >/dev/null

    # Wait for health
    echo -e "${YELLOW}Waiting for container to be healthy...${NC}"
    while [ "$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo 'starting')" != "healthy" ]; do
        sleep 0.5
    done

    export VALKEY_HOST=localhost
    export VALKEY_PORT=$VALKEY_PORT
    echo -e "${GREEN}✓ Standalone Valkey ready on port $VALKEY_PORT${NC}"
fi

# Run standalone tests
STANDALONE_PASSED=0
STANDALONE_FAILED=0

for test_file in "${DUAL_MODE_TESTS[@]}"; do
    echo -e "\n🧪 ${test_file} (standalone)..."
    
    if timeout 60 node --test "$test_file" 2>/dev/null; then
        echo -e "${GREEN}✅ $test_file (standalone) - PASSED${NC}"
        ((STANDALONE_PASSED++))
    else
        echo -e "${RED}❌ $test_file (standalone) - FAILED${NC}"
        ((STANDALONE_FAILED++))
    fi
done

# Cleanup standalone infrastructure
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo -e "\n${YELLOW}Cleaning up standalone infrastructure...${NC}"
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

# Phase 2: Test Cluster Mode (if enabled)
if [ "$ENABLE_CLUSTER_TESTS" = "true" ]; then
    echo -e "\n${GREEN}=== Phase 2: Cluster Mode Tests ===${NC}"
    
    # Note: Cluster infrastructure would need to be set up here
    # For now, we'll just indicate it's not implemented
    echo -e "${YELLOW}⚠️  Cluster mode testing requires cluster infrastructure setup${NC}"
    echo -e "${YELLOW}   Set up Valkey cluster nodes and set VALKEY_CLUSTER_NODES${NC}"
    
    CLUSTER_PASSED=0
    CLUSTER_FAILED=0
    
    # If cluster nodes are configured, run tests
    if [ ! -z "$VALKEY_CLUSTER_NODES" ]; then
        export ENABLE_CLUSTER_TESTS=true
        
        for test_file in "${DUAL_MODE_TESTS[@]}"; do
            echo -e "\n🧪 ${test_file} (cluster)..."
            
            if timeout 60 node --test "$test_file" 2>/dev/null; then
                echo -e "${GREEN}✅ $test_file (cluster) - PASSED${NC}"
                ((CLUSTER_PASSED++))
            else
                echo -e "${RED}❌ $test_file (cluster) - FAILED${NC}"
                ((CLUSTER_FAILED++))
            fi
        done
    else
        echo -e "${YELLOW}Skipping cluster tests - VALKEY_CLUSTER_NODES not set${NC}"
    fi
else
    echo -e "\n${YELLOW}=== Phase 2: Cluster Mode Tests (Skipped) ===${NC}"
    echo -e "${YELLOW}Set ENABLE_CLUSTER_TESTS=true to run cluster tests${NC}"
    CLUSTER_PASSED=0
    CLUSTER_FAILED=0
fi

# Summary
echo -e "\n${GREEN}=== Dual Mode Test Summary ===${NC}"
echo -e "Dual-mode test files: ${#DUAL_MODE_TESTS[@]}"
echo -e "\n${GREEN}Standalone Mode:${NC}"
echo -e "  Passed: $STANDALONE_PASSED"
echo -e "  Failed: $STANDALONE_FAILED"

if [ "$ENABLE_CLUSTER_TESTS" = "true" ]; then
    echo -e "\n${GREEN}Cluster Mode:${NC}"
    echo -e "  Passed: $CLUSTER_PASSED"
    echo -e "  Failed: $CLUSTER_FAILED"
fi

TOTAL_FAILED=$((STANDALONE_FAILED + CLUSTER_FAILED))

if [ $TOTAL_FAILED -gt 0 ]; then
    echo -e "\n${RED}❌ Dual-mode testing failed with $TOTAL_FAILED failures${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 All dual-mode tests passed!${NC}"
    exit 0
fi