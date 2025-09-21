#!/bin/bash

# Cluster Test Runner - Tests against Valkey cluster
# Ports: 17000, 17001, 17002

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
CLUSTER_PORTS=(17000 17001 17002)
CLUSTER_NODES="localhost:17000,localhost:17001,localhost:17002"

# Cleanup on exit
cleanup() {
    if [ "$STARTED_CLUSTER" = "true" ]; then
        echo -e "${YELLOW}Stopping Valkey cluster...${NC}"
        ./scripts/valkey.sh stop cluster
    fi
}
trap cleanup EXIT

echo -e "${GREEN}Starting Cluster Tests${NC}"

# Check if cluster is already running
CLUSTER_RUNNING="true"
for port in "${CLUSTER_PORTS[@]}"; do
    if ! nc -z localhost $port 2>/dev/null; then
        CLUSTER_RUNNING="false"
        break
    fi
done

if [ "$CLUSTER_RUNNING" = "true" ]; then
    echo -e "${YELLOW}Valkey cluster already running on ports ${CLUSTER_PORTS[*]}${NC}"
    STARTED_CLUSTER="false"
else
    # Start cluster using consolidated script
    ./scripts/valkey.sh start cluster
    STARTED_CLUSTER="true"
fi

# Export cluster configuration
export VALKEY_CLUSTER_NODES="$CLUSTER_NODES"
export ENABLE_CLUSTER_TESTS="true"
export DISABLE_STANDALONE_TESTS="true"

# Run tests
echo -e "${YELLOW}Running cluster tests...${NC}"

# Find cluster test files
TEST_FILES=$(find tests/cluster -name "*.test.mjs" | sort)

# Run tests
node --test \
    --test-concurrency=1 \
    --test-reporter=spec \
    --import ./tests/global-setup.mjs \
    $TEST_FILES

TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
    echo -e "${GREEN}✓ Cluster tests completed successfully${NC}"
else
    echo -e "${RED}✗ Cluster tests failed${NC}"
fi

exit $TEST_EXIT