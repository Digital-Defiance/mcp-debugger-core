# MCP Debugger Core

Enterprise-grade debugging engine for Node.js and TypeScript applications. Provides comprehensive debugging capabilities including Inspector Protocol integration, breakpoint management, variable inspection, execution control, CPU/memory profiling, hang detection, and source map support.

[![npm version](https://img.shields.io/npm/v/@ai-capabilities-suite/mcp-debugger-core)](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-debugger-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

### Core Debugging
- **Inspector Protocol Integration** - Full Chrome DevTools Protocol (CDP) support
- **Breakpoint Management** - Set, remove, toggle, and list breakpoints with conditions
- **Variable Inspection** - Inspect local/global variables, evaluate expressions, watch variables
- **Execution Control** - Continue, step over/into/out, pause execution
- **Call Stack Navigation** - View and navigate through stack frames
- **Source Map Support** - Full TypeScript debugging with source map resolution

### Advanced Features
- **Hang Detection** - Detect infinite loops and hanging processes
- **CPU Profiling** - Profile CPU usage and identify bottlenecks
- **Memory Profiling** - Heap snapshots and memory leak detection
- **Performance Timeline** - Track performance events and metrics
- **Test Framework Integration** - Debug Jest, Mocha, and Vitest tests

### Enterprise Features
- **Authentication & Authorization** - Token-based auth with session management
- **Rate Limiting** - Configurable rate limits per operation
- **Audit Logging** - Comprehensive audit trail with structured logging
- **Data Masking** - PII detection and masking for sensitive data
- **Health Monitoring** - Health checks and metrics collection
- **Session Recording** - Record and replay debugging sessions
- **Circuit Breakers** - Fault tolerance with automatic recovery
- **Resource Limiting** - Memory and CPU usage limits
- **Prometheus Integration** - Export metrics for monitoring

## Installation

```bash
npm install @ai-capabilities-suite/mcp-debugger-core
```

## Quick Start

### Basic Debugging Session

```typescript
import { DebugSession, ProcessSpawner } from '@ai-capabilities-suite/mcp-debugger-core';

// Spawn a Node.js process with inspector
const spawner = new ProcessSpawner();
const { process, inspectorUrl } = await spawner.spawn({
  command: 'node',
  args: ['app.js'],
  cwd: '/path/to/project'
});

// Create debug session
const session = new DebugSession(process, inspectorUrl);
await session.start();

// Set a breakpoint
await session.setBreakpoint({
  file: '/path/to/app.js',
  line: 42,
  condition: 'x > 10' // Optional condition
});

// Continue execution
await session.continue();

// When paused, inspect variables
const locals = await session.getLocalVariables();
console.log('Local variables:', locals);

// Step through code
await session.stepOver();
await session.stepInto();
await session.stepOut();

// Clean up
await session.stop();
```

### Hang Detection

```typescript
import { HangDetector } from '@ai-capabilities-suite/mcp-debugger-core';

const detector = new HangDetector();

const result = await detector.detect({
  command: 'node',
  args: ['potentially-hanging-script.js'],
  timeout: 5000,
  sampleInterval: 100
});

if (result.hung) {
  console.log('Process hung at:', result.location);
  console.log('Stack trace:', result.stack);
} else {
  console.log('Process completed successfully');
}
```

### CPU Profiling

```typescript
import { CPUProfiler } from '@ai-capabilities-suite/mcp-debugger-core';

const profiler = new CPUProfiler(session);

// Start profiling
await profiler.start();

// Run your code...
await session.continue();

// Stop and analyze
const profile = await profiler.stop();
const analysis = profiler.analyzeProfile(profile);

console.log('Bottlenecks:', analysis.bottlenecks);
console.log('Hot functions:', analysis.hotFunctions);
```

### Memory Profiling

```typescript
import { MemoryProfiler } from '@ai-capabilities-suite/mcp-debugger-core';

const profiler = new MemoryProfiler(session);

// Take heap snapshot
const snapshot = await profiler.takeHeapSnapshot();

// Detect memory leaks
const leaks = await profiler.detectMemoryLeaks({
  snapshots: [snapshot1, snapshot2, snapshot3],
  threshold: 1024 * 1024 // 1MB growth
});

console.log('Memory leaks detected:', leaks);
```

### Source Map Support

```typescript
import { SourceMapManager } from '@ai-capabilities-suite/mcp-debugger-core';

const sourceMapManager = new SourceMapManager();

// Load source maps
await sourceMapManager.loadSourceMap('/path/to/app.js.map');

// Map TypeScript location to JavaScript
const jsLocation = await sourceMapManager.mapToGenerated({
  source: '/path/to/app.ts',
  line: 42,
  column: 10
});

// Map JavaScript location back to TypeScript
const tsLocation = await sourceMapManager.mapToOriginal({
  source: '/path/to/app.js',
  line: 156,
  column: 5
});
```

## API Reference

### Core Classes

#### DebugSession
Main debugging session manager.

```typescript
class DebugSession {
  constructor(process: ChildProcess, inspectorUrl: string);
  
  // Lifecycle
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  // Breakpoints
  async setBreakpoint(options: BreakpointOptions): Promise<string>;
  async removeBreakpoint(id: string): Promise<void>;
  async toggleBreakpoint(id: string): Promise<void>;
  async listBreakpoints(): Promise<Breakpoint[]>;
  
  // Execution Control
  async continue(): Promise<void>;
  async stepOver(): Promise<void>;
  async stepInto(): Promise<void>;
  async stepOut(): Promise<void>;
  async pause(): Promise<void>;
  
  // Variable Inspection
  async getLocalVariables(): Promise<Variable[]>;
  async getGlobalVariables(): Promise<Variable[]>;
  async evaluateExpression(expr: string): Promise<any>;
  async inspectObject(objectId: string): Promise<ObjectProperties>;
  
  // Call Stack
  async getCallStack(): Promise<StackFrame[]>;
  async switchStackFrame(index: number): Promise<void>;
  
  // Watching
  async addWatch(expression: string): Promise<string>;
  async removeWatch(id: string): Promise<void>;
  async getWatches(): Promise<Watch[]>;
}
```

#### InspectorClient
Chrome DevTools Protocol client.

```typescript
class InspectorClient {
  constructor(wsUrl: string);
  
  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async sendCommand(method: string, params?: any): Promise<any>;
  on(event: string, handler: Function): void;
}
```

#### BreakpointManager
Manages breakpoints across sessions.

```typescript
class BreakpointManager {
  createBreakpoint(options: BreakpointOptions): Breakpoint;
  getBreakpoint(id: string): Breakpoint | undefined;
  listBreakpoints(): Breakpoint[];
  removeBreakpoint(id: string): boolean;
  toggleBreakpoint(id: string): boolean;
}
```

#### HangDetector
Detects hanging processes and infinite loops.

```typescript
class HangDetector {
  async detect(options: HangDetectionOptions): Promise<HangResult>;
}

interface HangDetectionOptions {
  command: string;
  args?: string[];
  cwd?: string;
  timeout: number;
  sampleInterval?: number;
}
```

#### CPUProfiler
CPU profiling and performance analysis.

```typescript
class CPUProfiler {
  constructor(session: DebugSession);
  
  async start(): Promise<void>;
  async stop(): Promise<CPUProfile>;
  analyzeProfile(profile: CPUProfile): ProfileAnalysis;
}
```

#### MemoryProfiler
Memory profiling and leak detection.

```typescript
class MemoryProfiler {
  constructor(session: DebugSession);
  
  async takeHeapSnapshot(): Promise<HeapSnapshot>;
  async detectMemoryLeaks(options: LeakDetectionOptions): Promise<MemoryLeak[]>;
  async getMemoryUsage(): Promise<MemoryUsage>;
}
```

### Enterprise Features

#### AuthManager
Authentication and authorization.

```typescript
class AuthManager {
  async authenticate(token: string): Promise<Session>;
  async validateSession(sessionId: string): Promise<boolean>;
  async revokeSession(sessionId: string): Promise<void>;
}
```

#### RateLimiter
Rate limiting for operations.

```typescript
class RateLimiter {
  constructor(options: RateLimitOptions);
  
  async checkLimit(key: string): Promise<boolean>;
  async consumeToken(key: string): Promise<void>;
  getRemainingTokens(key: string): number;
}
```

#### AuditLogger
Comprehensive audit logging.

```typescript
class AuditLogger {
  log(event: AuditEvent): void;
  query(filter: AuditFilter): AuditEvent[];
  export(format: 'json' | 'csv'): string;
}
```

#### DataMasker
PII detection and masking.

```typescript
class DataMasker {
  mask(data: any): any;
  addPattern(pattern: RegExp, replacement: string): void;
  detectPII(text: string): PIIMatch[];
}
```

#### MetricsCollector
Metrics collection and reporting.

```typescript
class MetricsCollector {
  recordMetric(name: string, value: number, tags?: Tags): void;
  getMetrics(filter?: MetricFilter): Metric[];
  export(format: 'prometheus' | 'json'): string;
}
```

## Configuration

### Debug Session Options

```typescript
interface DebugSessionOptions {
  timeout?: number;              // Session timeout (default: 30000ms)
  enableSourceMaps?: boolean;    // Enable source map support (default: true)
  maxCallStackDepth?: number;    // Max call stack depth (default: 50)
  maxObjectDepth?: number;       // Max object inspection depth (default: 3)
}
```

### Hang Detection Options

```typescript
interface HangDetectionOptions {
  command: string;               // Command to execute
  args?: string[];              // Command arguments
  cwd?: string;                 // Working directory
  timeout: number;              // Timeout in milliseconds
  sampleInterval?: number;      // Sample interval (default: 100ms)
  minSamples?: number;          // Min samples for hang (default: 50)
}
```

### Rate Limiting Options

```typescript
interface RateLimitOptions {
  maxRequests: number;          // Max requests per window
  windowMs: number;             // Time window in milliseconds
  keyGenerator?: (req: any) => string;  // Custom key generator
}
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:profiling     # Profiling tests only
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (MCP Server, CLI, Custom Apps)         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      MCP Debugger Core Library          │
├─────────────────────────────────────────┤
│  DebugSession  │  SessionManager        │
│  Breakpoints   │  Variable Inspector    │
│  Execution     │  Call Stack            │
│  Profiling     │  Hang Detection        │
│  Source Maps   │  Test Integration      │
├─────────────────────────────────────────┤
│  Enterprise Features                    │
│  Auth │ Rate Limit │ Audit │ Metrics    │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│    Inspector Protocol (CDP)             │
│    Chrome DevTools Protocol             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      Node.js Inspector                  │
│      (Target Process)                   │
└─────────────────────────────────────────┘
```

## Use Cases

### 1. Building Debugging Tools
Use the core library to build custom debugging tools, IDEs, or CLI debuggers.

### 2. Automated Testing
Integrate debugging capabilities into your test infrastructure for better test failure analysis.

### 3. Production Debugging
Use in production environments with enterprise features like auth, rate limiting, and audit logging.

### 4. Performance Analysis
Profile CPU and memory usage to identify bottlenecks and optimize performance.

### 5. AI Agent Integration
Power AI agents with debugging capabilities through the MCP server (see [@ai-capabilities-suite/mcp-debugger-server](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-debugger-server)).

## Examples

### Example 1: Debug a Failing Test

```typescript
import { DebugSession, ProcessSpawner } from '@ai-capabilities-suite/mcp-debugger-core';

async function debugTest() {
  const spawner = new ProcessSpawner();
  const { process, inspectorUrl } = await spawner.spawn({
    command: 'node',
    args: ['node_modules/.bin/jest', 'failing-test.spec.js', '--runInBand']
  });

  const session = new DebugSession(process, inspectorUrl);
  await session.start();

  // Set breakpoint in test
  await session.setBreakpoint({
    file: '/path/to/failing-test.spec.js',
    line: 25
  });

  await session.continue();

  // When paused, inspect test state
  const locals = await session.getLocalVariables();
  console.log('Test variables:', locals);

  await session.stop();
}
```

### Example 2: Detect Memory Leaks

```typescript
import { DebugSession, MemoryProfiler } from '@ai-capabilities-suite/mcp-debugger-core';

async function detectLeaks() {
  // ... create session ...
  
  const profiler = new MemoryProfiler(session);
  const snapshots = [];

  // Take snapshots over time
  for (let i = 0; i < 5; i++) {
    await session.continue();
    await new Promise(resolve => setTimeout(resolve, 1000));
    snapshots.push(await profiler.takeHeapSnapshot());
  }

  // Analyze for leaks
  const leaks = await profiler.detectMemoryLeaks({
    snapshots,
    threshold: 1024 * 1024 // 1MB
  });

  console.log('Memory leaks:', leaks);
}
```

### Example 3: Profile Performance

```typescript
import { DebugSession, CPUProfiler, PerformanceTimeline } from '@ai-capabilities-suite/mcp-debugger-core';

async function profilePerformance() {
  // ... create session ...
  
  const cpuProfiler = new CPUProfiler(session);
  const timeline = new PerformanceTimeline();

  // Start profiling
  await cpuProfiler.start();
  timeline.startRecording();

  // Run code
  await session.continue();

  // Stop and analyze
  const cpuProfile = await cpuProfiler.stop();
  const events = timeline.stopRecording();

  const analysis = cpuProfiler.analyzeProfile(cpuProfile);
  console.log('CPU bottlenecks:', analysis.bottlenecks);
  console.log('Performance events:', events);
}
```

## Related Packages

- **[@ai-capabilities-suite/mcp-debugger-server](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-debugger-server)** - MCP server that exposes debugging tools to AI agents

## Requirements

- Node.js >= 18.0.0
- npm >= 8.0.0

## Platform Support

- ✅ Linux (x64, arm64)
- ✅ macOS (x64, arm64)
- ✅ Windows (x64)

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/digital-defiance/ai-capabilities-suite) for contribution guidelines.

## License

MIT License - See [LICENSE](./LICENSE) file for details.

## Support

- **GitHub Issues**: [ai-capabilities-suite/issues](https://github.com/digital-defiance/ai-capabilities-suite/issues)
- **NPM Package**: [@ai-capabilities-suite/mcp-debugger-core](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-debugger-core)
- **Email**: info@digitaldefiance.org

## Changelog

### Version 1.0.1
- Improved README documentation
- Added comprehensive API reference
- Added usage examples

### Version 1.0.0
- Initial release
- Core debugging engine with Inspector Protocol integration
- Breakpoint management and execution control
- Variable inspection and call stack navigation
- CPU and memory profiling
- Hang detection
- Source map support
- Enterprise features (auth, rate limiting, audit logging)
- Test framework integration

---

**Built by [Digital Defiance](https://digitaldefiance.org)**
