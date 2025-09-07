#!/bin/bash

echo "🧪 Running all tests by category..."
echo "=================================="

# Set environment variables
export VALKEY_HOST=${VALKEY_HOST:-localhost}
export VALKEY_PORT=${VALKEY_PORT:-6383}

# Track results
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_CATEGORIES=""

# Function to run tests and track results
run_test_category() {
    local category=$1
    local pattern=$2
    
    echo ""
    echo "📦 Testing: $category"
    echo "-----------------------------------"
    
    if timeout 30 node --test $pattern 2>&1 | tee /tmp/test-output.log | grep -E "(pass|fail|tests|suites)" | tail -5; then
        local pass=$(grep "ℹ pass" /tmp/test-output.log | awk '{print $3}')
        local fail=$(grep "ℹ fail" /tmp/test-output.log | awk '{print $3}')
        
        if [ -z "$pass" ]; then pass=0; fi
        if [ -z "$fail" ]; then fail=0; fi
        
        TOTAL_PASS=$((TOTAL_PASS + pass))
        TOTAL_FAIL=$((TOTAL_FAIL + fail))
        
        if [ "$fail" -gt 0 ]; then
            FAILED_CATEGORIES="$FAILED_CATEGORIES\n  ❌ $category: $fail failures"
        else
            echo "  ✅ $category: All tests passed!"
        fi
    else
        echo "  ⚠️  $category: Tests timed out or errored"
        FAILED_CATEGORIES="$FAILED_CATEGORIES\n  ⚠️  $category: Timeout/Error"
    fi
}

# Run tests by category
echo "🔍 Unit Tests - Core"
run_test_category "Unit/Core" "tests/unit/smoke*.test.mjs tests/unit/clean-smoke.test.mjs"

echo ""
echo "🔍 Unit Tests - String Commands"
run_test_category "Unit/String" "tests/unit/string-commands.test.mjs"

echo ""
echo "🔍 Unit Tests - Hash Commands"
run_test_category "Unit/Hash" "tests/unit/hash-commands.test.mjs"

echo ""
echo "🔍 Unit Tests - List Commands"
run_test_category "Unit/List" "tests/unit/list-commands.test.mjs"

echo ""
echo "🔍 Unit Tests - Set Commands"
run_test_category "Unit/Set" "tests/unit/set-commands.test.mjs"

echo ""
echo "🔍 Unit Tests - ZSet Commands"
run_test_category "Unit/ZSet" "tests/unit/zset-commands.test.mjs"

echo ""
echo "🔍 Unit Tests - Other Commands"
run_test_category "Unit/Other" "tests/unit/geo-commands.test.mjs tests/unit/hll-commands.test.mjs tests/unit/stream-commands.test.mjs"

echo ""
echo "🔍 Unit Tests - Features"
run_test_category "Unit/Features" "tests/unit/connection-*.test.mjs tests/unit/transaction-*.test.mjs"

echo ""
echo "🔍 Unit Tests - PubSub"
run_test_category "Unit/PubSub" "tests/unit/pubsub-*.test.mjs"

echo ""
echo "🔍 Integration Tests - Frameworks"
run_test_category "Integration/Frameworks" "tests/integration/fastify-redis.test.mjs tests/integration/simple-adapter.test.mjs"

echo ""
echo "🔍 Integration Tests - Queues"
run_test_category "Integration/Queues" "tests/integration/bullmq/*.test.mjs tests/integration/message-queues/*.test.mjs"

echo ""
echo "🔍 Integration Tests - Real-time"
run_test_category "Integration/Realtime" "tests/integration/socketio/*.test.mjs"

echo ""
echo "🔍 Cluster Tests"
run_test_category "Cluster" "tests/cluster/**/*.test.mjs"

echo ""
echo "=================================="
echo "📊 Test Summary"
echo "=================================="
echo "✅ Total Passed: $TOTAL_PASS"
echo "❌ Total Failed: $TOTAL_FAIL"

if [ -n "$FAILED_CATEGORIES" ]; then
    echo ""
    echo "Failed Categories:"
    echo -e "$FAILED_CATEGORIES"
fi

echo ""
if [ $TOTAL_FAIL -eq 0 ]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "💔 Some tests failed. Please review the failures above."
    exit 1
fi