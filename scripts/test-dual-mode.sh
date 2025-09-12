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

# Track child process
CHILD_PID=""
DOCKER_CLEANUP=false
CLUSTER_CLEANUP=false

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Interrupted - cleaning up...${NC}"
    
    # Kill any running test process
    if [ ! -z "$CHILD_PID" ]; then
        kill -TERM "$CHILD_PID" 2>/dev/null || true
        wait "$CHILD_PID" 2>/dev/null || true
    fi
    
    # Kill any node test processes
    pkill -f "node --test" 2>/dev/null || true
    pkill -f "test-runner.sh" 2>/dev/null || true
    
    # Clean up infrastructure if we started it
    if [ "$DOCKER_CLEANUP" = true ]; then
        echo -e "${YELLOW}Cleaning up standalone infrastructure...${NC}"
        docker compose -f docker-compose.test.yml down >/dev/null 2>&1 || true
    fi
    
    if [ "$CLUSTER_CLEANUP" = "local" ]; then
        echo -e "${YELLOW}Cleaning up local cluster...${NC}"
        ./scripts/stop-test-cluster.sh >/dev/null 2>&1 || true
    elif [ "$CLUSTER_CLEANUP" = "docker" ]; then
        echo -e "${YELLOW}Cleaning up Docker cluster...${NC}"
        docker compose -f docker-compose.cluster.yml down >/dev/null 2>&1 || true
    fi
    
    exit 130
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

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

# Use environment variables for connection details
export VALKEY_HOST=${VALKEY_HOST:-localhost}
export VALKEY_PORT=${VALKEY_PORT:-6383}

# Check for existing infrastructure or use environment-provided service
if docker ps | grep -q test-valkey-standalone; then
    echo -e "${YELLOW}Using existing standalone infrastructure${NC}"
    DOCKER_CLEANUP=false
elif [ -f "docker-compose.test.yml" ]; then
    # Try to use docker-compose.test.yml infrastructure
    echo -e "${YELLOW}Starting test infrastructure...${NC}"
    docker compose -f docker-compose.test.yml up -d valkey-standalone >/dev/null 2>&1 || true
    
    # Wait for container to be ready
    for i in {1..30}; do
        if docker exec test-valkey-standalone valkey-cli ping 2>/dev/null | grep -q PONG; then
            break
        fi
        sleep 1
    done
    
    # Check if container is reachable
    if ! nc -z "$VALKEY_HOST" "$VALKEY_PORT" 2>/dev/null; then
        echo -e "${YELLOW}Docker compose container not reachable. Checking environment service...${NC}"
        DOCKER_CLEANUP=false
    else
        DOCKER_CLEANUP=true
        echo -e "${GREEN}✓ Standalone infrastructure ready${NC}"
    fi
else
    echo -e "${YELLOW}No docker-compose files found. Using environment-provided service...${NC}"
    DOCKER_CLEANUP=false
fi

# Check if service is reachable (either from docker or environment)
if ! nc -z "$VALKEY_HOST" "$VALKEY_PORT" 2>/dev/null; then
    echo -e "${RED}Failed to connect to Valkey service at ${VALKEY_HOST}:${VALKEY_PORT}${NC}"
    echo -e "${YELLOW}Please ensure Valkey is running and accessible${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Valkey service is accessible at ${VALKEY_HOST}:${VALKEY_PORT}${NC}"
fi

# Run standalone tests
echo -e "${YELLOW}Running standalone tests...${NC}"
export DISABLE_CLUSTER_TESTS=true
export SKIP_INFRA_MANAGEMENT=true

if [ "$COVERAGE" = "1" ]; then
    COVERAGE=1 JUNIT="$JUNIT" SKIP_INFRA_MANAGEMENT=true ./scripts/test-runner.sh $TEST_PATHS &
    CHILD_PID=$!
else
    JUNIT="$JUNIT" SKIP_INFRA_MANAGEMENT=true ./scripts/test-runner.sh $TEST_PATHS &
    CHILD_PID=$!
fi
wait $CHILD_PID
STANDALONE_EXIT=$?
CHILD_PID=""

# Phase 2: Test Cluster Mode
echo -e "\n${GREEN}=== Phase 2: Cluster Mode Tests ===${NC}"

# Check for existing cluster infrastructure or start new
if nc -z localhost 17000 2>/dev/null; then
    echo -e "${YELLOW}Using existing cluster infrastructure${NC}"
    CLUSTER_CLEANUP=false
else
    # Try to use local valkey-server if available
    if command -v valkey-server &> /dev/null; then
        echo -e "${YELLOW}Starting local cluster infrastructure...${NC}"
        ./scripts/start-test-cluster.sh
        
        # Wait for cluster to be ready
        for i in {1..10}; do
            if nc -z localhost 17000 2>/dev/null && nc -z localhost 17001 2>/dev/null && nc -z localhost 17002 2>/dev/null; then
                break
            fi
            sleep 1
        done
        
        CLUSTER_CLEANUP=local
        echo -e "${GREEN}✓ Local cluster infrastructure ready${NC}"
    else
        # Fall back to Docker
        echo -e "${YELLOW}Starting Docker cluster infrastructure...${NC}"
        docker compose -f docker-compose.cluster.yml up -d valkey-cluster-all >/dev/null 2>&1
        
        # Wait for cluster to be ready (it self-initializes)
        for i in {1..30}; do
            if nc -z localhost 17000 2>/dev/null && nc -z localhost 17001 2>/dev/null && nc -z localhost 17002 2>/dev/null; then
                break
            fi
            sleep 1
        done
        
        # Extra wait for cluster formation
        sleep 3
        
        CLUSTER_CLEANUP=docker
        echo -e "${GREEN}✓ Docker cluster infrastructure ready${NC}"
    fi
fi

# Run cluster tests
echo -e "${YELLOW}Running cluster tests...${NC}"
unset DISABLE_CLUSTER_TESTS
export ENABLE_CLUSTER_TESTS=true
export DISABLE_STANDALONE_TESTS=true
export VALKEY_CLUSTER_NODES="localhost:17000,localhost:17001,localhost:17002"
export SKIP_INFRA_MANAGEMENT=true

if [ "$COVERAGE" = "1" ]; then
    COVERAGE=1 JUNIT="$JUNIT" SKIP_INFRA_MANAGEMENT=true ./scripts/test-runner.sh $TEST_PATHS &
    CHILD_PID=$!
else
    JUNIT="$JUNIT" SKIP_INFRA_MANAGEMENT=true ./scripts/test-runner.sh $TEST_PATHS &
    CHILD_PID=$!
fi
wait $CHILD_PID
CLUSTER_EXIT=$?
CHILD_PID=""

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

# Cleanup if we started infrastructure (only if not interrupted)
if [ "$DOCKER_CLEANUP" = true ]; then
    echo -e "\n${YELLOW}Cleaning up standalone infrastructure...${NC}"
    docker compose -f docker-compose.test.yml down >/dev/null 2>&1 || true
fi

if [ "$CLUSTER_CLEANUP" = "local" ]; then
    echo -e "\n${YELLOW}Cleaning up local cluster...${NC}"
    ./scripts/stop-test-cluster.sh >/dev/null 2>&1 || true
elif [ "$CLUSTER_CLEANUP" = "docker" ]; then
    echo -e "\n${YELLOW}Cleaning up Docker cluster...${NC}"
    docker compose -f docker-compose.cluster.yml down >/dev/null 2>&1 || true
fi

# Clear the trap to avoid double cleanup
trap - SIGINT SIGTERM

# Exit with failure if either mode failed
if [ $STANDALONE_EXIT -ne 0 ] || [ $CLUSTER_EXIT -ne 0 ]; then
    echo -e "\n${RED}❌ Dual-mode testing failed${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 All dual-mode tests passed!${NC}"
    exit 0
fi
