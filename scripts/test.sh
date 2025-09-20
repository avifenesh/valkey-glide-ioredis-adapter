#!/bin/bash

# Main Test Orchestrator - Runs all test suites in sequence
# Usage: ./scripts/test.sh [options]
#   Options:
#     --junit       Generate JUnit XML reports
#     --quick       Run only standalone tests (skip cluster and JSON)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
JUNIT=0
QUICK=0
for arg in "$@"; do
    case "$arg" in
        --junit) JUNIT=1 ;;
        --quick) QUICK=1 ;;
        *) echo "Unknown argument: $arg" ;;
    esac
done

# Export for child scripts
export JUNIT

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Valkey GLIDE ioredis Adapter Test Suite          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Track overall status
FAILED=0

# Phase 1: Standalone Tests
echo -e "${GREEN}═══ Phase 1: Standalone Tests ═══${NC}"
echo -e "${YELLOW}Starting Valkey standalone server on port 6383...${NC}"

./scripts/test-standalone.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Standalone tests failed${NC}"
    FAILED=1
else
    echo -e "${GREEN}✓ Standalone tests passed${NC}"
fi

if [ $QUICK -eq 1 ]; then
    echo -e "\n${YELLOW}Quick mode - skipping cluster and JSON tests${NC}"
    exit $FAILED
fi

# Phase 2: Cluster Tests
echo -e "\n${GREEN}═══ Phase 2: Cluster Tests ═══${NC}"
echo -e "${YELLOW}Starting Valkey cluster on ports 17000-17002...${NC}"

./scripts/test-cluster.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Cluster tests failed${NC}"
    FAILED=1
else
    echo -e "${GREEN}✓ Cluster tests passed${NC}"
fi

# Phase 3: JSON Module Tests
echo -e "\n${GREEN}═══ Phase 3: JSON Module Tests ═══${NC}"
echo -e "${YELLOW}Starting Valkey with JSON module on port 6380...${NC}"

./scripts/test-json.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ JSON module tests failed${NC}"
    FAILED=1
else
    echo -e "${GREEN}✓ JSON module tests passed${NC}"
fi

# Final Summary
echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${BLUE}║                  ${GREEN}ALL TESTS PASSED! 🎉${BLUE}                    ║${NC}"
else
    echo -e "${BLUE}║                  ${RED}SOME TESTS FAILED ✗${BLUE}                     ║${NC}"
fi
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"


exit $FAILED