#!/bin/bash

# Isolated Test Runner - Runs each test in a separate process to avoid hanging issues
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Isolated Test Runner (Valkey) ===${NC}"

# Find available ports
find_free_port() {
    local port=$1
    while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
        ((port++))
    done
    echo $port
}

# Start infrastructure
VALKEY_PORT=$(find_free_port 6380)
CONTAINER_NAME="isolated-test-valkey-$$"

echo -e "${YELLOW}Starting Valkey test infrastructure on port $VALKEY_PORT...${NC}"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found. Running tests without Valkey Bundle infrastructure.${NC}"
    echo -e "${YELLOW}   Tests that require Valkey modules will be skipped or may fail.${NC}"
    DOCKER_AVAILABLE=false
else
    DOCKER_AVAILABLE=true
    
    # Start container
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$VALKEY_PORT:6379" \
        --health-cmd "valkey-cli ping" \
        --health-interval 1s \
        --health-timeout 3s \
        --health-retries 5 \
        valkey/valkey-bundle:latest >/dev/null

    # Wait for health
    while [ "$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo 'starting')" != "healthy" ]; do
        sleep 0.5
    done
fi

echo -e "${GREEN}✓ Valkey infrastructure ready${NC}"

# Set environment
export VALKEY_HOST=localhost
export VALKEY_PORT=$VALKEY_PORT

# Find all test files
TEST_FILES=($(find tests -name "*.test.mjs" | sort))

# Run each test in isolation
PASSED=0
FAILED=0
FAILED_TESTS=()

echo -e "${YELLOW}Running ${#TEST_FILES[@]} test files...${NC}"

for test_file in "${TEST_FILES[@]}"; do
    echo -e "\n🧪 ${test_file}..."
    
    # Run test with timeout and proper environment
    if timeout 60 node --test "$test_file" 2>/dev/null; then
        echo -e "${GREEN}✅ $test_file - PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ $test_file - FAILED${NC}"
        ((FAILED++))
        FAILED_TESTS+=("$test_file")
    fi
done

# Cleanup
echo -e "\n${YELLOW}Cleaning up Valkey infrastructure...${NC}"
if [ "$DOCKER_AVAILABLE" = true ]; then
    # Ensure cleanup doesn't affect exit code
    if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
        echo -e "${YELLOW}Stopping container $CONTAINER_NAME...${NC}"
        docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || echo -e "${YELLOW}Container already stopped${NC}"
    fi
    
    if docker ps -aq --filter "name=$CONTAINER_NAME" | grep -q .; then
        echo -e "${YELLOW}Removing container $CONTAINER_NAME...${NC}"
        docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || echo -e "${YELLOW}Container already removed${NC}"
    fi
    
    echo -e "${GREEN}✓ Valkey Docker cleanup completed${NC}"
else
    echo -e "${YELLOW}No Valkey Docker cleanup needed${NC}"
fi

# Summary
echo -e "\n${GREEN}=== Test Summary ===${NC}"
echo -e "Total files: ${#TEST_FILES[@]}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

# Explicit exit handling
if [ $FAILED -gt 0 ]; then
    echo -e "\n${RED}Failed tests:${NC}"
    for failed_test in "${FAILED_TESTS[@]}"; do
        echo -e "  - $failed_test"
    done
    echo -e "\n${RED}❌ Test run failed with $FAILED failed tests${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    echo -e "${GREEN}✅ Test run completed successfully with $PASSED passed tests${NC}"
    # Force successful exit
    exit 0
fi