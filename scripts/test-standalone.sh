#!/bin/bash

# Standalone Test Runner - Tests against single Valkey instance
# Port: 6383 (default test port)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
VALKEY_HOST="localhost"
VALKEY_PORT="6383"
CONTAINER_NAME="test-valkey-standalone"

# Cleanup on exit
cleanup() {
    if [ "$STARTED_VALKEY" = "true" ]; then
        echo -e "${YELLOW}Stopping Valkey standalone...${NC}"
        ./scripts/valkey.sh stop standalone
    fi
}
trap cleanup EXIT

echo -e "${GREEN}Starting Standalone Tests${NC}"

# Check if Valkey is already running
if nc -z $VALKEY_HOST $VALKEY_PORT 2>/dev/null; then
    echo -e "${YELLOW}Valkey already running on port $VALKEY_PORT${NC}"
    STARTED_VALKEY="false"
else
    # Start Valkey using consolidated script
    ./scripts/valkey.sh start standalone
    STARTED_VALKEY="true"
fi

# Export connection details for tests
export VALKEY_HOST
export VALKEY_PORT
export DISABLE_CLUSTER_TESTS="true"

# Run tests
echo -e "${YELLOW}Running standalone tests...${NC}"

# Find all test files excluding cluster-specific ones
TEST_FILES=$(find tests -name "*.test.mjs" | grep -v cluster | sort)

# Run tests
node --test \
    --test-concurrency=1 \
    --test-reporter=spec \
    --import ./tests/global-setup.mjs \
    $TEST_FILES

TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
    echo -e "${GREEN}✓ Standalone tests completed successfully${NC}"
else
    echo -e "${RED}✗ Standalone tests failed${NC}"
fi

exit $TEST_EXIT