# Testing Documentation

## Overview

The MCP Debugger Core uses a comprehensive testing strategy combining unit tests, integration tests, property-based tests, and enterprise-grade testing suites. This document describes our testing approach, how to run tests, and how to write new tests.

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Running Tests](#running-tests)
3. [Test Types](#test-types)
4. [Writing Tests](#writing-tests)
5. [Coverage Requirements](#coverage-requirements)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## Testing Strategy

### Multi-Layered Approach

We use a multi-layered testing strategy to ensure comprehensive coverage:

```
┌─────────────────────────────────────┐
│   Property-Based Tests (PBT)       │  ← Universal properties
├─────────────────────────────────────┤
│   Integration Tests                 │  ← End-to-end scenarios
├─────────────────────────────────────┤
│   Unit Tests                        │  ← Individual components
├─────────────────────────────────────┤
│   Enterprise Tests                  │  ← Load, chaos, security
└─────────────────────────────────────┘
```

### Test Distribution

- **Unit Tests:** ~60% of test suite
  - Test individual functions and classes
  - Fast execution (< 1ms per test)
  - High coverage of code paths

- **Integration Tests:** ~20% of test suite
  - Test component interactions
  - Use real processes and WebSocket connections
  - Moderate execution time (10-100ms per test)

- **Property-Based Tests:** ~15% of test suite
  - Test universal properties across many inputs
  - Run 100+ iterations per property
  - Catch edge cases automatically

- **Enterprise Tests:** ~5% of test suite
  - Load testing (100+ concurrent sessions)
  - Chaos testing (random failures)
  - Security testing (auth, rate limiting, PII)
  - Compatibility testing (Node.js versions, OS)

---

## Running Tests

### Quick Start

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run specific test file
yarn test breakpoint-manager.spec.ts

# Run tests in watch mode
yarn test:watch

# Run tests with specific pattern
yarn test --testNamePattern="should set breakpoint"
```

### Test Scripts

| Command | Description |
|---------|-------------|
| `yarn test` | Run all tests |
| `yarn test:coverage` | Run tests with coverage report |
| `yarn test:watch` | Run tests in watch mode |
| `yarn test:unit` | Run only unit tests |
| `yarn test:integration` | Run only integration tests |
| `yarn test:e2e` | Run end-to-end tests |

### Running Specific Test Suites

```bash
# Unit tests
yarn test src/lib/breakpoint-manager.spec.ts

# Integration tests
yarn test src/lib/debug-session.integration.spec.ts

# Property-based tests
yarn test src/lib/breakpoint-manager.spec.ts --testNamePattern="Property"

# Enterprise tests
yarn test src/lib/load-testing.spec.ts
yarn test src/lib/chaos-testing.spec.ts
yarn test src/lib/security-testing.spec.ts
```

---

## Test Types

### 1. Unit Tests

Test individual components in isolation.

**Example:**
```typescript
describe('BreakpointManager', () => {
  let manager: BreakpointManager;

  beforeEach(() => {
    manager = new BreakpointManager();
  });

  it('should create a breakpoint', () => {
    const bp = manager.createBreakpoint({
      file: '/path/to/file.ts',
      line: 42
    });

    expect(bp.id).toBeDefined();
    expect(bp.file).toBe('/path/to/file.ts');
    expect(bp.line).toBe(42);
  });

  it('should list all breakpoints', () => {
    manager.createBreakpoint({ file: 'a.ts', line: 1 });
    manager.createBreakpoint({ file: 'b.ts', line: 2 });

    const breakpoints = manager.listBreakpoints();
    expect(breakpoints).toHaveLength(2);
  });
});
```

### 2. Integration Tests

Test component interactions with real dependencies.

**Example:**
```typescript
describe('DebugSession Integration', () => {
  let session: DebugSession;

  beforeEach(async () => {
    session = await createDebugSession({
      command: 'node',
      args: ['test-fixtures/simple-script.js']
    });
  });

  afterEach(async () => {
    await session.cleanup();
  });

  it('should set breakpoint and pause execution', async () => {
    const bp = await session.setBreakpoint({
      file: 'test-fixtures/simple-script.js',
      line: 5
    });

    await session.continue();

    expect(session.state).toBe('paused');
    expect(session.currentLocation.line).toBe(5);
  });
});
```

### 3. Property-Based Tests

Test universal properties across many generated inputs.

**Example:**
```typescript
import fc from 'fast-check';

describe('BreakpointManager Properties', () => {
  // Feature: mcp-debugger-tool, Property 1: Breakpoint creation and retrieval consistency
  it('Property: created breakpoints can be retrieved', () => {
    fc.assert(
      fc.property(
        fc.string(), // file path
        fc.integer({ min: 1, max: 10000 }), // line number
        (file, line) => {
          const manager = new BreakpointManager();
          const bp = manager.createBreakpoint({ file, line });
          
          const retrieved = manager.getBreakpoint(bp.id);
          
          expect(retrieved).toBeDefined();
          expect(retrieved?.file).toBe(file);
          expect(retrieved?.line).toBe(line);
        }
      ),
      { numRuns: 100 } // Run 100 iterations
    );
  });
});
```

### 4. Enterprise Tests

#### Load Testing

Test system under high concurrent load.

**Example:**
```typescript
describe('Load Testing', () => {
  it('should handle 100 concurrent debug sessions', async () => {
    const sessions = await Promise.all(
      Array.from({ length: 100 }, () =>
        createDebugSession({
          command: 'node',
          args: ['test-fixtures/simple-script.js']
        })
      )
    );

    expect(sessions).toHaveLength(100);
    expect(sessions.every(s => s.state === 'paused')).toBe(true);

    // Cleanup
    await Promise.all(sessions.map(s => s.cleanup()));
  }, 60000); // 60 second timeout
});
```

#### Chaos Testing

Test system resilience to random failures.

**Example:**
```typescript
describe('Chaos Testing', () => {
  it('should handle random process crashes', async () => {
    const session = await createDebugSession({
      command: 'node',
      args: ['test-fixtures/crash-script.js']
    });

    // Process will crash randomly
    await expect(session.continue()).rejects.toThrow('PROCESS_CRASHED');

    // Session should be cleaned up
    expect(session.state).toBe('stopped');
  });
});
```

#### Security Testing

Test security features.

**Example:**
```typescript
describe('Security Testing', () => {
  it('should mask PII in variable inspection', async () => {
    const masker = new DataMasker();
    
    const data = {
      email: 'user@example.com',
      ssn: '123-45-6789',
      name: 'John Doe'
    };

    const masked = masker.maskValue(data);

    expect(masked.email).toBe('****@example.com');
    expect(masked.ssn).toBe('***-**-****');
    expect(masked.name).toBe('John Doe'); // Not PII
  });
});
```

---

## Writing Tests

### Test File Naming

- Unit tests: `*.spec.ts`
- Integration tests: `*.integration.spec.ts`
- Coverage tests: `*.coverage.spec.ts`
- E2E tests: `*.e2e.spec.ts`

### Test Structure

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
it('should do something', () => {
  // Arrange - Set up test data and dependencies
  const manager = new BreakpointManager();
  const file = '/path/to/file.ts';
  const line = 42;

  // Act - Execute the code under test
  const bp = manager.createBreakpoint({ file, line });

  // Assert - Verify the results
  expect(bp.file).toBe(file);
  expect(bp.line).toBe(line);
});
```

### Best Practices

1. **One assertion per test** (when possible)
   ```typescript
   // Good
   it('should set file path', () => {
     const bp = manager.createBreakpoint({ file: 'a.ts', line: 1 });
     expect(bp.file).toBe('a.ts');
   });

   it('should set line number', () => {
     const bp = manager.createBreakpoint({ file: 'a.ts', line: 1 });
     expect(bp.line).toBe(1);
   });

   // Avoid
   it('should create breakpoint', () => {
     const bp = manager.createBreakpoint({ file: 'a.ts', line: 1 });
     expect(bp.file).toBe('a.ts');
     expect(bp.line).toBe(1);
     expect(bp.enabled).toBe(true);
     // ... many more assertions
   });
   ```

2. **Use descriptive test names**
   ```typescript
   // Good
   it('should throw error when file path is empty', () => { ... });

   // Avoid
   it('test1', () => { ... });
   ```

3. **Clean up resources**
   ```typescript
   afterEach(async () => {
     await session?.cleanup();
     await closeConnections();
   });
   ```

4. **Use test fixtures**
   ```typescript
   const FIXTURES_DIR = path.join(__dirname, '../test-fixtures');
   const SIMPLE_SCRIPT = path.join(FIXTURES_DIR, 'simple-script.js');
   ```

5. **Mock external dependencies**
   ```typescript
   jest.mock('ws', () => ({
     WebSocket: MockWebSocket
   }));
   ```

### Property-Based Test Guidelines

1. **Tag with property reference**
   ```typescript
   // Feature: mcp-debugger-tool, Property 1: Breakpoint creation and retrieval consistency
   it('Property: created breakpoints can be retrieved', () => {
     // Test implementation
   });
   ```

2. **Run 100+ iterations**
   ```typescript
   fc.assert(
     fc.property(...),
     { numRuns: 100 }
   );
   ```

3. **Use appropriate generators**
   ```typescript
   // Good - constrained to valid inputs
   fc.integer({ min: 1, max: 10000 })

   // Avoid - unconstrained
   fc.integer()
   ```

4. **Handle edge cases in generators**
   ```typescript
   const validFilePath = fc.string().filter(s => s.length > 0 && !s.includes('\0'));
   ```

---

## Coverage Requirements

### Targets

- **Line Coverage:** ≥ 90%
- **Branch Coverage:** ≥ 85%
- **Function Coverage:** ≥ 90%

### Current Status

```
Lines:     93.71% ✅ (Target: 90%)
Branches:  82.51% ⚠️  (Target: 85%, Gap: 2.49%)
Functions: 96.83% ✅ (Target: 90%)
```

### Checking Coverage

```bash
# Generate coverage report
yarn test:coverage

# View HTML report
open coverage/lcov-report/index.html

# View summary
cat coverage/coverage-summary.json | jq '.total'
```

### Coverage Reports

Coverage reports are generated in multiple formats:

- **HTML:** `coverage/lcov-report/index.html`
- **JSON:** `coverage/coverage-summary.json`
- **LCOV:** `coverage/lcov.info`
- **Text:** Console output

### Improving Coverage

1. **Identify uncovered code**
   ```bash
   yarn test:coverage
   # Look for red/yellow lines in HTML report
   ```

2. **Write tests for uncovered paths**
   ```typescript
   // Cover error path
   it('should handle invalid input', () => {
     expect(() => manager.createBreakpoint({ file: '', line: 0 }))
       .toThrow('Invalid file path');
   });
   ```

3. **Test edge cases**
   ```typescript
   it('should handle empty breakpoint list', () => {
     const breakpoints = manager.listBreakpoints();
     expect(breakpoints).toEqual([]);
   });
   ```

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Push to main branch
- Pull requests
- Scheduled nightly builds

### Coverage Gates

Builds fail if coverage drops below thresholds:

```yaml
# .github/workflows/test.yml
- name: Check coverage
  run: |
    yarn test:coverage
    # Fail if below thresholds
    node scripts/check-coverage.js
```

### Test Batching

For large test suites, tests run in batches:

```bash
# Run tests in batches to avoid timeouts
yarn test --maxWorkers=2 --testPathPattern="src/lib/[a-m]"
yarn test --maxWorkers=2 --testPathPattern="src/lib/[n-z]"
```

---

## Troubleshooting

### Common Issues

#### 1. Tests Timeout

**Problem:** Tests hang or timeout

**Solution:**
```typescript
// Increase timeout for slow tests
it('should handle long operation', async () => {
  // Test code
}, 30000); // 30 second timeout

// Or use jest.setTimeout
jest.setTimeout(30000);
```

#### 2. WebSocket Connection Errors

**Problem:** WebSocket tests fail with connection errors

**Solution:**
```typescript
// Use mock WebSocket
import { MockWebSocket } from '../test-utils/mock-websocket';

jest.mock('ws', () => ({
  WebSocket: MockWebSocket
}));
```

#### 3. Process Not Cleaning Up

**Problem:** Child processes remain after tests

**Solution:**
```typescript
afterEach(async () => {
  // Always cleanup
  await session?.cleanup();
  
  // Force kill if needed
  if (session?.process && !session.process.killed) {
    session.process.kill('SIGKILL');
  }
});
```

#### 4. Flaky Tests

**Problem:** Tests pass/fail randomly

**Solution:**
```typescript
// Add retries for flaky tests
jest.retryTimes(3);

// Or use waitFor
await waitFor(() => {
  expect(session.state).toBe('paused');
}, { timeout: 5000 });
```

#### 5. Coverage Not Generated

**Problem:** Coverage reports missing

**Solution:**
```bash
# Clean coverage directory
rm -rf coverage

# Regenerate
yarn test:coverage --no-cache
```

### Debug Tests

```bash
# Run tests with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Run specific test with logs
DEBUG=* yarn test breakpoint-manager.spec.ts

# Run with verbose output
yarn test --verbose
```

---

## Test Utilities

### Mock WebSocket

```typescript
import { MockWebSocket } from '../test-utils/mock-websocket';

const ws = new MockWebSocket('ws://localhost:9229');
ws.mockResponse({ id: 1, result: { breakpointId: 'bp-123' } });
```

### Test Fixtures

Located in `test-fixtures/`:

- `simple-script.js` - Basic script for testing
- `infinite-loop.js` - Script with infinite loop
- `crash-script.js` - Script that crashes
- `typescript-sample.ts` - TypeScript file with source maps

### Helper Functions

```typescript
// Create test session
async function createTestSession(options?: Partial<SessionOptions>) {
  return await createDebugSession({
    command: 'node',
    args: ['test-fixtures/simple-script.js'],
    ...options
  });
}

// Wait for condition
async function waitFor(condition: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await sleep(100);
  }
}
```

---

## Performance Testing

### Benchmarks

Run performance benchmarks:

```bash
yarn test src/lib/performance-benchmarks.spec.ts
```

**Benchmark Targets:**
- Breakpoint set/remove: < 10ms
- Variable inspection: < 50ms
- Session creation: < 500ms
- Step operation: < 100ms

### Profiling Tests

```bash
# Profile test execution
node --prof node_modules/.bin/jest

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

---

## Contributing

### Before Submitting PR

1. Run all tests: `yarn test`
2. Check coverage: `yarn test:coverage`
3. Ensure coverage meets thresholds (90% lines, 85% branches)
4. Run linter: `yarn lint`
5. Format code: `yarn format`

### Writing New Tests

1. Follow naming conventions
2. Add property-based tests for new features
3. Include integration tests for component interactions
4. Update this documentation if adding new test types

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [fast-check Documentation](https://github.com/dubzzz/fast-check)
- [Testing Best Practices](https://testingjavascript.com/)
- [Property-Based Testing Guide](https://hypothesis.works/articles/what-is-property-based-testing/)

---

**Version:** 1.0.0  
**Last Updated:** 2025-11-27
