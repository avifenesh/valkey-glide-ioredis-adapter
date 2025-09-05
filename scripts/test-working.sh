#!/bin/bash

# Test runner for working tests only

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Running Working Tests ===${NC}"

# Set environment
export VALKEY_HOST=${VALKEY_HOST:-localhost}
export VALKEY_PORT=${VALKEY_PORT:-6383}
export GLOBAL_TEST_SETUP=1
export NODE_OPTIONS="--enable-source-maps ${NODE_OPTIONS}"

echo -e "${YELLOW}Using Valkey at ${VALKEY_HOST}:${VALKEY_PORT}${NC}"

# List of working test files
WORKING_TESTS="
tests/unit/smoke.test.mjs
tests/unit/clean-smoke.test.mjs
tests/unit/string-commands.test.mjs
tests/unit/hash-commands.test.mjs
tests/unit/set-commands.test.mjs
tests/unit/list-commands.test.mjs
tests/unit/zset-commands.test.mjs
tests/unit/geo-commands.test.mjs
tests/unit/hll-commands.test.mjs
tests/unit/scripting-commands.test.mjs
tests/unit/enhanced-stream-commands.test.mjs
tests/integration/fastify-redis.test.mjs
"

# Filter for existing files
TEST_FILES=""
for file in $WORKING_TESTS; do
  if [ -f "$file" ]; then
    TEST_FILES="$TEST_FILES $file"
  fi
done

echo -e "${YELLOW}Running ${GREEN}$(echo $TEST_FILES | wc -w)${YELLOW} test files${NC}"

# Run tests with optional coverage
if [ "$COVERAGE" = "1" ] && command -v c8 &> /dev/null; then
  echo -e "${YELLOW}Running with coverage...${NC}"
  c8 node --test --test-concurrency=1 --test-timeout=60000 --import ./tests/global-setup.mjs $TEST_FILES
else
  node --test --test-concurrency=1 --test-timeout=60000 --import ./tests/global-setup.mjs $TEST_FILES
fi

TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
  echo -e "${GREEN}✓ All working tests passed!${NC}"
else
  echo -e "${RED}✗ Some tests failed (exit code $TEST_EXIT)${NC}"
fi

exit $TEST_EXIT