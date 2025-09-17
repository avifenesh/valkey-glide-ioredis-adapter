#!/bin/bash

# Helper script to simulate CI test environment locally
# Mimics the new CI structure for local development and testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Local CI Test Simulation${NC}"
echo -e "${YELLOW}This script simulates the new CI structure locally${NC}"
echo ""

# Build project first
echo -e "${BLUE}Building project...${NC}"
npm run build

# Show what tests would be run in each CI job
echo -e "\n${BLUE}📋 CI Test Distribution:${NC}"

echo -e "\n${GREEN}🔹 Standalone Job (Non-JSON tests):${NC}"
find tests/unit -name "*.test.mjs" ! -name "*json*" | wc -l | xargs echo "  Unit tests:"
find tests/integration -name "*.test.mjs" | wc -l | xargs echo "  Integration tests:"

echo -e "\n${GREEN}🔹 Cluster Job:${NC}"
find tests/cluster -name "*.test.mjs" | wc -l | xargs echo "  Cluster tests:"

echo -e "\n${GREEN}🔹 JSON Module Job (Docker):${NC}"
find tests/unit -name "*json*.test.mjs" | wc -l | xargs echo "  JSON tests:"

echo -e "\n${BLUE}🚀 Running local tests (requires Redis/Valkey on localhost:6379):${NC}"

# Check if Redis/Valkey is available
if ! command -v redis-cli &> /dev/null; then
    echo -e "${YELLOW}⚠️  redis-cli not found. Install Redis to test locally.${NC}"
    echo -e "${YELLOW}   Ubuntu/Debian: sudo apt-get install redis-server${NC}"
    echo -e "${YELLOW}   macOS: brew install redis or brew install valkey${NC}"
    exit 1
fi

if ! redis-cli ping &> /dev/null; then
    echo -e "${YELLOW}⚠️  Redis/Valkey not running on localhost:6379${NC}"
    echo -e "${YELLOW}   Start with: redis-server --port 6379${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Redis/Valkey detected on localhost:6379${NC}"

# Run a few representative tests (not all for speed)
echo -e "\n${BLUE}Running sample tests...${NC}"

# Set environment variables like CI
export CI=true
export VALKEY_HOST=127.0.0.1
export VALKEY_PORT=6379
export SKIP_MODULE_TESTS=true

# Run a few core tests
SAMPLE_TESTS="tests/unit/string-commands.test.mjs tests/unit/hash-commands.test.mjs"
echo -e "${YELLOW}Running: $SAMPLE_TESTS${NC}"

./scripts/test-runner.sh $SAMPLE_TESTS

echo -e "\n${GREEN}✅ Sample tests completed successfully!${NC}"
echo -e "${BLUE}ℹ️  This demonstrates the new CI structure works locally.${NC}"
echo -e "${BLUE}ℹ️  JSON tests require Docker with valkey-bundle (run separately).${NC}"