#!/bin/bash

# Script to run tests in batches with coverage to identify hanging tests
# This helps isolate which test files cause timeouts

echo "Running tests in batches with coverage..."
echo "=========================================="

# Get all test files
TEST_FILES=$(find src -name "*.spec.ts" -o -name "*.test.ts")

# Run each test file individually with coverage
for test_file in $TEST_FILES; do
    echo ""
    echo "Testing: $test_file"
    echo "---"
    
    # Run with 30 second timeout
    timeout 30s npx jest "$test_file" --coverage --maxWorkers=1 2>&1 | tail -20
    
    if [ $? -eq 124 ]; then
        echo "❌ TIMEOUT: $test_file"
    elif [ $? -eq 0 ]; then
        echo "✅ PASSED: $test_file"
    else
        echo "⚠️  FAILED: $test_file"
    fi
done

echo ""
echo "=========================================="
echo "Batch testing complete"
