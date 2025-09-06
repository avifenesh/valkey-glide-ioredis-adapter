#!/bin/bash

# Unified Test Runner - single process, optional coverage, with infrastructure bootstrap

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track child process PID
TEST_PID=""

# Cleanup function to kill child processes
cleanup() {
    echo -e "\n${YELLOW}Interrupted - cleaning up...${NC}"
    if [ ! -z "$TEST_PID" ]; then
        kill -TERM "$TEST_PID" 2>/dev/null || true
        wait "$TEST_PID" 2>/dev/null || true
    fi
    # Kill any remaining node test processes
    pkill -f "node --test" 2>/dev/null || true
    
    # Stop infrastructure if we started it
    if [ "$INFRA_STARTED" = true ]; then
        echo -e "${YELLOW}Stopping test infrastructure...${NC}"
        if [ "$ENABLE_CLUSTER_TESTS" = "true" ]; then
            docker compose -f docker-compose.test.yml down >/dev/null 2>&1 || true
        else
            docker stop test-valkey-standalone >/dev/null 2>&1 || true
        fi
    fi
    
    exit 130
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}=== Running Test Suite ===${NC}"

# Infrastructure management
VALKEY_PORT=${VALKEY_PORT:-6383}
export VALKEY_HOST=${VALKEY_HOST:-localhost}
export VALKEY_PORT
INFRA_STARTED=false

# Function to check if Valkey is accessible
check_valkey() {
    if command -v valkey-cli &> /dev/null; then
        valkey-cli -h "$VALKEY_HOST" -p "$VALKEY_PORT" ping 2>/dev/null | grep -q PONG
    elif command -v redis-cli &> /dev/null; then
        redis-cli -h "$VALKEY_HOST" -p "$VALKEY_PORT" ping 2>/dev/null | grep -q PONG
    elif [ -x "$(command -v docker)" ]; then
        docker exec test-valkey-standalone valkey-cli ping 2>/dev/null | grep -q PONG
    else
        return 1
    fi
}

# Check if we're in cluster mode
if [ "$ENABLE_CLUSTER_TESTS" = "true" ]; then
    echo -e "${YELLOW}Cluster mode detected - checking cluster infrastructure...${NC}"
    CLUSTER_NODES=${VALKEY_CLUSTER_NODES:-"localhost:17000,localhost:17001,localhost:17002"}
    
    # Check if cluster is running
    FIRST_NODE=$(echo $CLUSTER_NODES | cut -d',' -f1)
    CLUSTER_HOST=$(echo $FIRST_NODE | cut -d':' -f1)
    CLUSTER_PORT=$(echo $FIRST_NODE | cut -d':' -f2)
    
    if ! docker ps | grep -q test-valkey-cluster; then
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
        
        INFRA_STARTED=true
        echo -e "${GREEN}✓ Cluster infrastructure ready${NC}"
    fi
    
    echo -e "${YELLOW}Using Valkey Cluster at ${CLUSTER_NODES}${NC}"
else
    # Standalone mode
    echo -e "${YELLOW}Checking Valkey at ${VALKEY_HOST}:${VALKEY_PORT}...${NC}"
    
    if ! check_valkey; then
        echo -e "${YELLOW}Valkey not accessible, starting test infrastructure...${NC}"
        
        # Try Docker first
        if [ -x "$(command -v docker)" ]; then
            # Check if container exists but is stopped
            if docker ps -a | grep -q test-valkey-standalone; then
                docker start test-valkey-standalone >/dev/null 2>&1
            else
                # Start using docker-compose
                docker compose -f docker-compose.test.yml up -d test-valkey-standalone >/dev/null 2>&1
            fi
            
            # Wait for container to be ready
            for i in {1..30}; do
                if docker exec test-valkey-standalone valkey-cli ping 2>/dev/null | grep -q PONG; then
                    break
                fi
                sleep 1
            done
            
            if check_valkey || docker exec test-valkey-standalone valkey-cli ping 2>/dev/null | grep -q PONG; then
                INFRA_STARTED=true
                echo -e "${GREEN}✓ Test infrastructure started${NC}"
            else
                echo -e "${RED}Failed to start test infrastructure${NC}"
                echo -e "${YELLOW}Please ensure Docker is running or start Valkey manually${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Valkey is not running and Docker is not available${NC}"
            echo -e "${YELLOW}Please start Valkey on ${VALKEY_HOST}:${VALKEY_PORT} or install Docker${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Valkey is accessible${NC}"
    fi
    
    echo -e "${YELLOW}Using Valkey at ${VALKEY_HOST}:${VALKEY_PORT}${NC}"
fi

# Indicate that a global test setup is active
export GLOBAL_TEST_SETUP=1
export ADAPTER_DIAG_HANDLES=${ADAPTER_DIAG_HANDLES:-1}

# Enable source maps for better TS remapping in coverage
# Set max listeners to avoid warnings with many tests
export NODE_OPTIONS="--enable-source-maps --max-old-space-size=4096 ${NODE_OPTIONS}"
export NODE_NO_WARNINGS=1

# Require Node >= 18 for the built-in test runner
NODE_VERSION=$(node -v | sed 's/^v//; s/\..*$//')
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}Node.js >= 18 is required to run the built-in test runner (--test). Detected: $(node -v)${NC}"
  echo -e "${YELLOW}Please use Node 18 or 20 (e.g., nvm use 20) and re-run: npm run test:cov${NC}"
  exit 1
fi

# Collect test files - use arguments if provided, otherwise find all .test.mjs files
if [ $# -gt 0 ]; then
  # Resolve provided args into actual test files (.test.mjs)
  RESOLVED=""
  for path in "$@"; do
    if [ -d "$path" ]; then
      FILES=$(find "$path" -type f -name "*.test.mjs" -not -path "*/.*" | sort)
      RESOLVED="$RESOLVED $FILES"
    else
      RESOLVED="$RESOLVED $path"
    fi
  done
  TEST_FILES=$(echo "$RESOLVED" | xargs)
  echo -e "${YELLOW}Running specified test files: ${TEST_FILES}${NC}"
else
  # Find all .test.mjs files (only .test.mjs to avoid TS runtime, excluding hidden dirs)
  TEST_FILES=$(find tests -type f -name "*.test.mjs" -not -path "*/.*" | sort)
  echo -e "${YELLOW}Running all test files${NC}"
fi

if [ -z "$TEST_FILES" ]; then
  echo -e "${YELLOW}No *.test.mjs files found. Skipping.${NC}"
  TEST_EXIT=0
else
  set +e
  # Conditionally include global diagnostics import
  OPT_IMPORT=""
  if [ "$ADAPTER_DIAG_HANDLES" = "1" ]; then
    OPT_IMPORT="--import ./tests/global-setup.mjs"
  fi

  # Configure test reporter based on JUNIT environment variable
  if [ "$JUNIT" = "1" ]; then
    # Set up JUnit reporter output
    RESULTS_DIR=${TEST_RESULTS_DIR:-"test-results"}
    mkdir -p "$RESULTS_DIR"
    RESULTS_FILE=${TEST_RESULTS_FILE:-"$RESULTS_DIR/junit.xml"}
    REPORTER_ARGS="--test-reporter=junit --test-reporter-destination=$RESULTS_FILE"
  else
    # Default to spec reporter for console output
    REPORTER_ARGS="--test-reporter=spec"
  fi

  if [ "$COVERAGE" = "1" ] && command -v c8 &> /dev/null; then
    c8 node --test --test-concurrency=1 $OPT_IMPORT \
      $REPORTER_ARGS \
      $TEST_FILES &
    TEST_PID=$!
    wait $TEST_PID
    TEST_EXIT=$?
  else
    node --test --test-concurrency=1 $OPT_IMPORT \
      $REPORTER_ARGS \
      $TEST_FILES &
    TEST_PID=$!
    wait $TEST_PID
    TEST_EXIT=$?
  fi
  TEST_PID=""
  set -e

  # If JUnit output was used, preserve a timestamped copy
  if [ "$JUNIT" = "1" ] && [ -f "$RESULTS_FILE" ]; then
    TS_NAME=$(date +"%Y%m%d-%H%M%S")
    cp "$RESULTS_FILE" "$RESULTS_DIR/junit-$TS_NAME.xml" 2>/dev/null || true
    echo -e "${YELLOW}Saved test report (JUnit): ${RESULTS_FILE}${NC}"
  fi
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

# Optionally stop infrastructure if we started it (can be overridden with KEEP_INFRA=1)
if [ "$INFRA_STARTED" = true ] && [ "$KEEP_INFRA" != "1" ]; then
  echo -e "${YELLOW}Stopping test infrastructure...${NC}"
  if [ "$ENABLE_CLUSTER_TESTS" = "true" ]; then
    docker compose -f docker-compose.test.yml down >/dev/null 2>&1 || true
  else
    docker stop test-valkey-standalone >/dev/null 2>&1 || true
  fi
fi

exit $TEST_EXIT
