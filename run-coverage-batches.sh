#!/bin/bash

# Run tests in batches with coverage to avoid timeouts
# This script runs tests in smaller groups and combines coverage reports

set -e

echo "🧪 Running tests in batches with coverage..."
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Clean up any orphaned processes
echo "🧹 Cleaning up orphaned processes..."
pkill -f "node --inspect-brk" || true
sleep 1

# Create coverage directory
mkdir -p test-output/jest/coverage

# Track failures
FAILED_BATCHES=()

# Function to run a batch of tests
run_batch() {
    local batch_name=$1
    local pattern=$2
    
    echo ""
    echo "📦 Running batch: $batch_name"
    echo "   Pattern: $pattern"
    echo "   ---"
    
    if npx jest --testPathPattern="$pattern" --coverage --maxWorkers=2 --forceExit --testTimeout=30000 2>&1 | tee "test-output/batch-$batch_name.log"; then
        echo -e "${GREEN}✅ PASSED: $batch_name${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED: $batch_name${NC}"
        FAILED_BATCHES+=("$batch_name")
        return 1
    fi
}

# Batch 1: Core Session Management
run_batch "core-session" "(session-manager|session-timeout)" || true

# Batch 2: Breakpoint Management
run_batch "breakpoints" "(breakpoint-manager|cdp-breakpoint)" || true

# Batch 3: Inspector and Process
run_batch "inspector" "(inspector-client|process-spawner)" || true

# Batch 4: Variable Inspection
run_batch "variables" "(variable-inspector|source-map)" || true

# Batch 5: Execution Control
run_batch "execution" "(debug-session\.coverage|hang-detector)" || true

# Batch 6: Profiling
run_batch "profiling" "(cpu-profiler|memory-profiler|performance-timeline)" || true

# Batch 7: Metrics and Monitoring
run_batch "metrics" "(metrics-collector|prometheus|health-checker)" || true

# Batch 8: Security
run_batch "security" "(auth-manager|rate-limiter|data-masker|audit-logger)" || true

# Batch 9: Resilience
run_batch "resilience" "(circuit-breaker|retry-handler|shutdown-handler|resource-limiter)" || true

# Batch 10: Integration Tests
run_batch "integration" "integration" || true

# Batch 11: Testing Infrastructure
run_batch "testing" "(compatibility|security-testing|performance-benchmark)" || true

# Batch 12: Remaining Tests
run_batch "remaining" "spec\.ts$" || true

echo ""
echo "=============================================="
echo "📊 Test Batch Summary"
echo "=============================================="

if [ ${#FAILED_BATCHES[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All batches passed!${NC}"
    echo ""
    echo "Coverage reports are in: test-output/jest/coverage"
    exit 0
else
    echo -e "${RED}❌ Failed batches: ${FAILED_BATCHES[*]}${NC}"
    echo ""
    echo "Check logs in: test-output/batch-*.log"
    exit 1
fi
