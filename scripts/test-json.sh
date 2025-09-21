#!/bin/bash

# JSON Module Test Runner - Tests ValkeyJSON functionality
# Port: 6380 (using valkey-bundle with JSON module)

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
VALKEY_PORT="6380"
CONTAINER_NAME="valkey-bundle"

# Cleanup on exit
cleanup() {
    if [ "$STARTED_VALKEY" = "true" ]; then
        echo -e "${YELLOW}Stopping Valkey bundle...${NC}"
        ./scripts/valkey.sh stop bundle
    fi
}
trap cleanup EXIT

echo -e "${GREEN}Starting JSON Module Tests${NC}"

# Check if Valkey bundle is already running
if nc -z $VALKEY_HOST $VALKEY_PORT 2>/dev/null; then
    echo -e "${YELLOW}Valkey bundle already running on port $VALKEY_PORT${NC}"
    STARTED_VALKEY="false"
else
    # Start Valkey bundle using consolidated script
    ./scripts/valkey.sh start bundle
    STARTED_VALKEY="true"
fi

# Export connection details for tests
export VALKEY_BUNDLE_HOST=$VALKEY_HOST
export VALKEY_BUNDLE_PORT=$VALKEY_PORT
export VALKEY_HOST
export VALKEY_PORT
export DISABLE_CLUSTER_TESTS="true"

# Run JSON tests
echo -e "${YELLOW}Running JSON module tests...${NC}"

# Run only JSON-specific tests
TEST_FILES="tests/unit/json-commands.test.mjs"

# Check if the test file exists
if [ ! -f "$TEST_FILES" ]; then
    echo -e "${YELLOW}No JSON tests found, skipping...${NC}"
    exit 0
fi

# Run tests
node --test \
    --test-concurrency=1 \
    --test-reporter=spec \
    --import ./tests/global-setup.mjs \
    $TEST_FILES

TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
    echo -e "${GREEN}✓ JSON module tests completed successfully${NC}"
else
    echo -e "${RED}✗ JSON module tests failed${NC}"
fi

exit $TEST_EXIT