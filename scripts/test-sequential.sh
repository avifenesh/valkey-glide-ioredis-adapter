#!/bin/bash

# Sequential Test Runner - Runs each test file individually to prevent handle accumulation
# This solves the hanging issue caused by third-party libraries not cleaning up properly

# Exit on any error in script setup
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_FILES=()
SKIPPED_FILES=()

# Configuration from environment
VALKEY_HOST=${VALKEY_HOST:-localhost}
VALKEY_PORT=${VALKEY_PORT:-6383}
ENABLE_CLUSTER_TESTS=${ENABLE_CLUSTER_TESTS:-true}
DISABLE_STANDALONE_TESTS=${DISABLE_STANDALONE_TESTS:-false}
DISABLE_CLUSTER_TESTS=${DISABLE_CLUSTER_TESTS:-false}

echo -e "${GREEN}=== Sequential Test Runner ===${NC}"
echo -e "${YELLOW}Running tests one file at a time to prevent handle accumulation${NC}\n"

# Function to run a single test file
run_test_file() {
    local test_file=$1
    local test_name=$(basename "$test_file" .test.mjs)
    
    echo -e "${YELLOW}Running: $test_name${NC}"
    
    # Run the test with generous timeout (120s for integration, 60s for unit tests)
    local timeout_val=60
    if [[ "$test_file" == *"integration"* ]] || [[ "$test_file" == *"bullmq"* ]] || [[ "$test_file" == *"bull"* ]]; then
        timeout_val=120
    fi
    
    if timeout $timeout_val node --test --test-concurrency=1 --import ./tests/global-setup.mjs "$test_file" > /tmp/test_output_$$.txt 2>&1; then
        # Extract test counts from output
        local tests_run=$(grep "^ℹ tests" /tmp/test_output_$$.txt | awk '{print $3}')
        local tests_pass=$(grep "^ℹ pass" /tmp/test_output_$$.txt | awk '{print $3}')
        
        if [ -n "$tests_run" ]; then
            TOTAL_TESTS=$((TOTAL_TESTS + tests_run))
            PASSED_TESTS=$((PASSED_TESTS + tests_pass))
        fi
        
        echo -e "${GREEN}  ✓ $test_name passed${NC}"
        return 0
    else
        local exit_code=$?
        FAILED_TESTS=$((FAILED_TESTS + 1))
        FAILED_FILES+=("$test_file")
        
        # Show failure details
        echo -e "${RED}  ✗ $test_name failed (exit code: $exit_code)${NC}"
        
        # Show last few lines of output for debugging
        if [ -f /tmp/test_output_$$.txt ]; then
            echo "    Last output:"
            tail -5 /tmp/test_output_$$.txt | sed 's/^/      /'
        fi
        
        return 1
    fi
}

# Clean up temp files and ensure clean exit
cleanup() {
    rm -f /tmp/test_output_$$*.txt
    # Kill any remaining node processes from this script
    pkill -P $$ 2>/dev/null || true
    # Ensure all child processes are terminated
    wait 2>/dev/null || true
}
trap cleanup EXIT

# Find all test files
TEST_FILES=$(find tests -name "*.test.mjs" -type f | sort)
FILE_COUNT=$(echo "$TEST_FILES" | wc -l | tr -d ' ')

echo -e "${YELLOW}Found $FILE_COUNT test files${NC}\n"

# Check if infrastructure is available
if ! nc -z "$VALKEY_HOST" "$VALKEY_PORT" 2>/dev/null; then
    echo -e "${RED}Error: Valkey server not available at $VALKEY_HOST:$VALKEY_PORT${NC}"
    echo "Please start the test infrastructure first:"
    echo "  docker-compose -f docker-compose.test.yml up -d"
    exit 1
fi

# Run each test file
CURRENT=0
for test_file in $TEST_FILES; do
    CURRENT=$((CURRENT + 1))
    echo -e "\n${YELLOW}[$CURRENT/$FILE_COUNT]${NC} Testing: $test_file"
    
    # Skip cluster tests if disabled
    if [[ "$test_file" == *"cluster"* ]] && [ "$DISABLE_CLUSTER_TESTS" = "true" ]; then
        echo -e "${YELLOW}  ⊘ Skipping cluster test (DISABLE_CLUSTER_TESTS=true)${NC}"
        continue
    fi
    
    
    # Skip standalone tests if disabled
    if [[ "$test_file" != *"cluster"* ]] && [ "$DISABLE_STANDALONE_TESTS" = "true" ]; then
        echo -e "${YELLOW}  ⊘ Skipping standalone test (DISABLE_STANDALONE_TESTS=true)${NC}"
        continue
    fi
    
    # Run the test (continue even if it fails)
    set +e
    run_test_file "$test_file"
    set -e
done

# Summary
echo -e "\n${GREEN}=== Test Summary ===${NC}"
echo -e "Total test cases run: ${TOTAL_TESTS}"
echo -e "Passed: ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed files: ${RED}${FAILED_TESTS}${NC}"
echo -e "Skipped files: ${YELLOW}${#SKIPPED_FILES[@]}${NC}"

if [ ${#SKIPPED_FILES[@]} -gt 0 ]; then
    echo -e "\n${YELLOW}Skipped test files (known hanging issues):${NC}"
    for skipped_file in "${SKIPPED_FILES[@]}"; do
        echo -e "  ${YELLOW}⊘${NC} $(basename $skipped_file)"
    done
fi

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
    echo -e "\n${RED}Failed test files:${NC}"
    for failed_file in "${FAILED_FILES[@]}"; do
        echo -e "  ${RED}✗${NC} $(basename $failed_file)"
    done
    echo -e "\n${YELLOW}Note: Test suite completed without hanging!${NC}"
    echo -e "${YELLOW}Failed tests can be fixed separately without blocking development.${NC}"
    # Force cleanup before exit
    cleanup
    exit 1
else
    echo -e "\n${GREEN}All tests completed successfully!${NC}"
    # Force cleanup before exit
    cleanup
    exit 0
fi

# This should never be reached, but ensure exit
exit 0