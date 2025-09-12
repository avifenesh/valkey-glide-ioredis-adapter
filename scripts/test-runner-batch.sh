#!/bin/bash

# Batch Test Runner - runs tests in smaller groups to avoid resource issues

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Running Test Suite in Batches ===${NC}"

# Ensure Node version supports required test runner flags
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo -e "${RED}Node.js v${NODE_MAJOR} detected. Tests require Node >= 20 for --import/--test runner flags.${NC}"
  echo -e "${YELLOW}Please run: nvm use 20 (or 22/24) and re-run tests.${NC}"
  exit 1
fi

export VALKEY_HOST=${VALKEY_HOST:-localhost}
export VALKEY_PORT=${VALKEY_PORT:-6379}
export GLOBAL_TEST_SETUP=1
export NODE_OPTIONS="--enable-source-maps ${NODE_OPTIONS}"
export NODE_NO_WARNINGS=1

echo -e "${YELLOW}Using Valkey at ${VALKEY_HOST}:${VALKEY_PORT}${NC}"

# Find all test files (excluding hidden/problematic directories)
ALL_TEST_FILES=$(find tests -type f -name "*.test.mjs" -not -path "*/.*" | sort)
TOTAL_FILES=$(echo "$ALL_TEST_FILES" | wc -w)

if [ "$TOTAL_FILES" -eq 0 ]; then
  echo -e "${YELLOW}No test files found${NC}"
  exit 0
fi

echo -e "${YELLOW}Found ${GREEN}$TOTAL_FILES${YELLOW} test files${NC}"

# Run tests in batches of 5
BATCH_SIZE=5
BATCH_NUM=0
FAILED_TESTS=""
GLOBAL_IMPORT="./tests/global-setup.mjs"

for i in $(seq 0 $BATCH_SIZE $TOTAL_FILES); do
  BATCH_NUM=$((BATCH_NUM + 1))
  BATCH_FILES=$(echo "$ALL_TEST_FILES" | head -n $((i + BATCH_SIZE)) | tail -n $BATCH_SIZE)
  
  if [ -z "$BATCH_FILES" ]; then
    break
  fi
  
  FILE_COUNT=$(echo "$BATCH_FILES" | wc -w)
  echo -e "\n${YELLOW}Running batch $BATCH_NUM (${FILE_COUNT} files)...${NC}"
  
  if [ "$COVERAGE" = "1" ] && command -v c8 &> /dev/null; then
    if ! c8 --silent node --test --test-concurrency=1 --import "$GLOBAL_IMPORT" $BATCH_FILES; then
      FAILED_TESTS="$FAILED_TESTS Batch $BATCH_NUM"
    fi
  else
    if ! node --test --test-concurrency=1 --import "$GLOBAL_IMPORT" $BATCH_FILES; then
      FAILED_TESTS="$FAILED_TESTS Batch $BATCH_NUM"
    fi
  fi
done

# Generate coverage report if running with coverage
if [ "$COVERAGE" = "1" ] && command -v c8 &> /dev/null; then
  echo -e "\n${YELLOW}Generating coverage report...${NC}"
  c8 report --reporter=text --reporter=html --reporter=lcov
fi

if [ -z "$FAILED_TESTS" ]; then
  echo -e "\n${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Failed batches:$FAILED_TESTS${NC}"
  exit 1
fi
