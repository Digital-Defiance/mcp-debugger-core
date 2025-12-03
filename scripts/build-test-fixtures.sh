#!/bin/bash

# Build test fixtures script
# Compiles TypeScript test fixtures to JavaScript with source maps

set -e

echo "Building test fixtures..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/test-fixtures"

# Navigate to project root
cd "$PROJECT_ROOT"

# Compile TypeScript files
if [ -f "$FIXTURES_DIR/typescript-sample.ts" ]; then
  echo "Compiling typescript-sample.ts..."
  npx tsc "$FIXTURES_DIR/typescript-sample.ts" --sourceMap --target ES2020 --module commonjs
fi

# Compile other TypeScript files in src directory
if [ -d "$FIXTURES_DIR/src" ]; then
  echo "Compiling TypeScript files in src/..."
  for ts_file in "$FIXTURES_DIR/src"/*.ts; do
    if [ -f "$ts_file" ]; then
      filename=$(basename "$ts_file" .ts)
      echo "  - Compiling $filename.ts..."
      npx tsc "$ts_file" --sourceMap --target ES2020 --module commonjs
    fi
  done
fi

echo "Test fixtures built successfully!"
