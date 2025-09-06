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

# Determine test files to run
if [ $# -gt 0 ]; then
    # Use provided test paths
    TEST_PATHS="$@"
    echo -e "${YELLOW}Running tests from: ${TEST_PATHS}${NC}"
else
    # Run all tests
    TEST_PATHS="tests"
    echo -e "${YELLOW}Running all tests${NC}"
fi

# Phase 1: Test Standalone Mode
echo -e "\n${GREEN}=== Phase 1: Standalone Mode Tests ===${NC}"

# Check for existing infrastructure or start new
if docker ps | grep -q test-valkey-standalone; then
    echo -e "${YELLOW}Using existing standalone infrastructure${NC}"
    export VALKEY_HOST=localhost
    export VALKEY_PORT=6379
    DOCKER_CLEANUP=false
else
    # Try to use docker-compose.test.yml infrastructure
    echo -e "${YELLOW}Starting test infrastructure...${NC}"
    docker compose -f docker-compose.test.yml up -d test-valkey-standalone >/dev/null 2>&1
    
    # Wait for container to be ready
    for i in {1..30}; do
        if docker exec test-valkey-standalone valkey-cli ping 2>/dev/null | grep -q PONG; then
            break
        fi
        sleep 1
    done
    
    export VALKEY_HOST=localhost
    export VALKEY_PORT=6379
    DOCKER_CLEANUP=true
    echo -e "${GREEN}✓ Standalone infrastructure ready${NC}"
fi

# Run standalone tests
echo -e "${YELLOW}Running standalone tests...${NC}"
export DISABLE_CLUSTER_TESTS=true

if [ "$COVERAGE" = "1" ]; then
    COVERAGE=1 ./scripts/test-runner.sh $TEST_PATHS
else
    ./scripts/test-runner.sh $TEST_PATHS
fi
STANDALONE_EXIT=$?

# Phase 2: Test Cluster Mode
echo -e "\n${GREEN}=== Phase 2: Cluster Mode Tests ===${NC}"

# Check for existing cluster infrastructure or start new
if docker ps | grep -q test-valkey-cluster; then
    echo -e "${YELLOW}Using existing cluster infrastructure${NC}"
    CLUSTER_CLEANUP=false
else
    # Try to use docker-compose.test.yml infrastructure
    echo -e "${YELLOW}Starting cluster infrastructure...${NC}"
    docker compose -f docker-compose.test.yml up -d test-valkey-cluster-1 test-valkey-cluster-2 test-valkey-cluster-3 test-valkey-cluster-4 test-valkey-cluster-5 test-valkey-cluster-6 >/dev/null 2>&1
    
    # Wait for cluster to be ready
    for i in {1..30}; do
        if docker exec test-valkey-cluster-1 valkey-cli ping 2>/dev/null | grep -q PONG; then
            break
        fi
        sleep 1
    done
    
    # Initialize cluster if needed
    docker compose -f docker-compose.test.yml --profile cluster up -d cluster-init >/dev/null 2>&1
    sleep 5
    
    CLUSTER_CLEANUP=true
    echo -e "${GREEN}✓ Cluster infrastructure ready${NC}"
fi

# Run cluster tests
echo -e "${YELLOW}Running cluster tests...${NC}"
unset DISABLE_CLUSTER_TESTS
export ENABLE_CLUSTER_TESTS=true
export DISABLE_STANDALONE_TESTS=true
export VALKEY_CLUSTER_NODES="localhost:17000,localhost:17001,localhost:17002"

if [ "$COVERAGE" = "1" ]; then
    COVERAGE=1 ./scripts/test-runner.sh $TEST_PATHS
else
    ./scripts/test-runner.sh $TEST_PATHS
fi
CLUSTER_EXIT=$?

# Summary
echo -e "\n${GREEN}=== Dual Mode Test Summary ===${NC}"

if [ $STANDALONE_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ Standalone Mode: PASSED${NC}"
else
    echo -e "${RED}❌ Standalone Mode: FAILED (exit code: $STANDALONE_EXIT)${NC}"
fi

if [ $CLUSTER_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ Cluster Mode: PASSED${NC}"
else
    echo -e "${RED}❌ Cluster Mode: FAILED (exit code: $CLUSTER_EXIT)${NC}"
fi

# Cleanup if we started infrastructure
if [ "$DOCKER_CLEANUP" = true ]; then
    echo -e "\n${YELLOW}Cleaning up test infrastructure...${NC}"
    docker compose -f docker-compose.test.yml down >/dev/null 2>&1 || true
fi

# Exit with failure if either mode failed
if [ $STANDALONE_EXIT -ne 0 ] || [ $CLUSTER_EXIT -ne 0 ]; then
    echo -e "\n${RED}❌ Dual-mode testing failed${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 All dual-mode tests passed!${NC}"
    exit 0
fi