#!/bin/bash

# Run tests in batches to avoid timeouts
# This script runs tests in smaller groups to prevent resource exhaustion

set -e

echo "Running tests in batches..."

# Build fixtures first
bash "$(dirname "$0")/build-test-fixtures.sh"

# Define test batches
BATCHES=(
  "health|audit|structured|metrics|prometheus"
  "session-manager|session-timeout|session-recorder"
  "breakpoint|cdp-breakpoint"
  "inspector|spawner"
  "hang-detector|execution"
  "variable|call-stack"
  "source-map|typescript-debugging"
  "test-runner|test-framework"
  "profiling|cpu-profiler|memory-profiler|performance"
  "auth|rate-limit|resource-limit|data-mask"
  "circuit-breaker|retry|shutdown"
  "load-testing|chaos-testing|compatibility"
  "security-testing|performance-benchmarks"
  "debug-session"
)

FAILED_BATCHES=()
TOTAL_BATCHES=${#BATCHES[@]}
CURRENT_BATCH=0

for batch in "${BATCHES[@]}"; do
  CURRENT_BATCH=$((CURRENT_BATCH + 1))
  echo ""
  echo "=========================================="
  echo "Running batch $CURRENT_BATCH/$TOTAL_BATCHES: $batch"
  echo "=========================================="
  
  if npm test -- --testPathPattern="($batch)" --coverage --maxWorkers=1 --forceExit --bail; then
    echo "✓ Batch $CURRENT_BATCH passed"
  else
    echo "✗ Batch $CURRENT_BATCH failed"
    FAILED_BATCHES+=("$batch")
  fi
done

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total batches: $TOTAL_BATCHES"
echo "Passed: $((TOTAL_BATCHES - ${#FAILED_BATCHES[@]}))"
echo "Failed: ${#FAILED_BATCHES[@]}"

if [ ${#FAILED_BATCHES[@]} -gt 0 ]; then
  echo ""
  echo "Failed batches:"
  for batch in "${FAILED_BATCHES[@]}"; do
    echo "  - $batch"
  done
  exit 1
else
  echo ""
  echo "All batches passed!"
  exit 0
fi
