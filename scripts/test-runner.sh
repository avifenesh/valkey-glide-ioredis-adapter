#!/bin/bash

# Unified Test Runner - single process, optional coverage, with infrastructure bootstrap

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Running Test Suite ===${NC}"

# Optional Docker Valkey bundle bootstrap for tests that rely on it
VALKEY_PORT=${VALKEY_PORT:-6379}
export VALKEY_HOST=${VALKEY_HOST:-localhost}
export VALKEY_PORT

echo -e "${YELLOW}Using Valkey at ${VALKEY_HOST}:${VALKEY_PORT}${NC}"

# Indicate that a global test setup is active
export GLOBAL_TEST_SETUP=1
export ADAPTER_DIAG_HANDLES=${ADAPTER_DIAG_HANDLES:-1}

# Enable source maps for better TS remapping in coverage
export NODE_OPTIONS="--enable-source-maps ${NODE_OPTIONS}"

# Require Node >= 18 for the built-in test runner
NODE_VERSION=$(node -v | sed 's/^v//; s/\..*$//')
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}Node.js >= 18 is required to run the built-in test runner (--test). Detected: $(node -v)${NC}"
  echo -e "${YELLOW}Please use Node 18 or 20 (e.g., nvm use 20) and re-run: npm run test:cov${NC}"
  exit 1
fi

# Collect test files (only .test.mjs to avoid TS runtime)
TEST_FILES=$(find tests -type f -name "*.test.mjs" | sort)
if [ -z "$TEST_FILES" ]; then
  echo -e "${YELLOW}No *.test.mjs files found under tests/. Skipping.${NC}"
  TEST_EXIT=0
else
  set +e
  GLOBAL_IMPORT="./tests/global-setup.mjs"
  if [ "$COVERAGE" = "1" ] && command -v c8 &> /dev/null; then
    c8 --silent node --test --test-concurrency=1 --import "$GLOBAL_IMPORT" $TEST_FILES
    TEST_EXIT=$?
  else
    node --test --test-concurrency=1 --import "$GLOBAL_IMPORT" $TEST_FILES
    TEST_EXIT=$?
  fi
  set -e
fi

# Coverage report
if [ "$COVERAGE" = "1" ] && command -v c8 &> /dev/null; then
  echo -e "\n${YELLOW}Generating coverage report...${NC}"
  c8 report --reporter=text --reporter=lcov --reporter=html || true
fi

if [ $TEST_EXIT -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed.${NC}"
else
  echo -e "\n${RED}There were test failures (exit code $TEST_EXIT).${NC}"
fi

exit $TEST_EXIT
