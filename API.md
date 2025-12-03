# MCP Debugger Core - API Documentation

## Overview

The MCP Debugger Core provides a comprehensive debugging API for Node.js and TypeScript applications. This document describes the core modules, their APIs, and how to use them programmatically.

For MCP tool documentation, see [TOOL-REFERENCE.md](../mcp-debugger-server/TOOL-REFERENCE.md) in the mcp-debugger-server package.

---

## Table of Contents

1. [Core Modules](#core-modules)
2. [Session Management](#session-management)
3. [Breakpoint Management](#breakpoint-management)
4. [Execution Control](#execution-control)
5. [Variable Inspection](#variable-inspection)
6. [Security Features](#security-features)
7. [Observability](#observability)
8. [Performance Profiling](#performance-profiling)
9. [Error Handling](#error-handling)

---

## Core Modules

### DebuggerCore

Main entry point for the debugging system.

```typescript
import { DebuggerCore } from '@mcp-debugger/core';

const debugger = new DebuggerCore({
  maxSessions: 10,
  defaultTimeout: 30000,
  enableMetrics: true
});
```

**Configuration Options:**
- `maxSessions` (number): Maximum concurrent debug sessions
- `defaultTimeout` (number): Default timeout for operations in ms
- `enableMetrics` (boolean): Enable metrics collection
- `enableAuditLog` (boolean): Enable audit logging
- `logLevel` (string): Log level (debug, info, warn, error)

---

## Session Management

### SessionManager

Manages multiple concurrent debug sessions with isolation.

```typescript
import { SessionManager } from '@mcp-debugger/core';

const sessionManager = new SessionManager();

// Create a new session
const session = await sessionManager.createSession({
  command: 'node',
  args: ['app.js'],
  cwd: '/path/to/project'
});

// Get session by ID
const session = sessionManager.getSession(sessionId);

// List all sessions
const sessions = sessionManager.listSessions();

// Cleanup session
await sessionManager.cleanupSession(sessionId);
```

**API Methods:**

#### `createSession(options: SessionOptions): Promise<DebugSession>`
Creates a new debug session.

**Parameters:**
- `command` (string): Command to execute
- `args` (string[]): Command arguments
- `cwd` (string): Working directory
- `timeout` (number): Timeout in milliseconds
- `env` (object): Environment variables

**Returns:** Promise<DebugSession>

#### `getSession(sessionId: string): DebugSession | undefined`
Retrieves a session by ID.

#### `listSessions(): DebugSession[]`
Lists all active sessions.

#### `cleanupSession(sessionId: string): Promise<void>`
Cleans up and removes a session.

---

## Breakpoint Management

### BreakpointManager

Manages breakpoints within a debug session.

```typescript
import { BreakpointManager } from '@mcp-debugger/core';

const bpManager = new BreakpointManager();

// Set a breakpoint
const bp = await bpManager.setBreakpoint({
  file: '/path/to/file.ts',
  line: 42,
  condition: 'x > 10'
});

// List breakpoints
const breakpoints = bpManager.listBreakpoints();

// Remove breakpoint
await bpManager.removeBreakpoint(bp.id);

// Toggle breakpoint
await bpManager.toggleBreakpoint(bp.id);
```

**API Methods:**

#### `setBreakpoint(options: BreakpointOptions): Promise<Breakpoint>`
Sets a new breakpoint.

**Parameters:**
- `file` (string): Absolute file path
- `line` (number): Line number (1-indexed)
- `condition` (string, optional): Conditional expression
- `hitCount` (number, optional): Hit count condition
- `logMessage` (string, optional): Log message for logpoints

**Returns:** Promise<Breakpoint>

#### `listBreakpoints(): Breakpoint[]`
Lists all breakpoints.

#### `removeBreakpoint(id: string): Promise<void>`
Removes a breakpoint.

#### `toggleBreakpoint(id: string): Promise<void>`
Toggles breakpoint enabled/disabled state.

---

## Execution Control

### DebugSession

Controls program execution flow.

```typescript
// Continue execution
await session.continue();

// Step over
await session.stepOver();

// Step into
await session.stepInto();

// Step out
await session.stepOut();

// Pause execution
await session.pause();
```

**API Methods:**

#### `continue(): Promise<void>`
Resumes execution until next breakpoint or completion.

#### `stepOver(): Promise<ExecutionLocation>`
Steps over the current line.

#### `stepInto(): Promise<ExecutionLocation>`
Steps into function calls.

#### `stepOut(): Promise<ExecutionLocation>`
Steps out of current function.

#### `pause(): Promise<ExecutionLocation>`
Pauses execution at current location.

---

## Variable Inspection

### VariableInspector

Inspects variables and evaluates expressions.

```typescript
import { VariableInspector } from '@mcp-debugger/core';

const inspector = new VariableInspector(session);

// Get local variables
const locals = await inspector.getLocalVariables();

// Get global variables
const globals = await inspector.getGlobalVariables();

// Evaluate expression
const result = await inspector.evaluateExpression('x + y');

// Inspect object
const props = await inspector.inspectObject(objectRef, { depth: 2 });
```

**API Methods:**

#### `getLocalVariables(): Promise<Variable[]>`
Gets all local variables in current scope.

#### `getGlobalVariables(): Promise<Variable[]>`
Gets accessible global variables.

#### `evaluateExpression(expression: string): Promise<EvaluationResult>`
Evaluates a JavaScript expression.

**Parameters:**
- `expression` (string): JavaScript expression to evaluate

**Returns:** Promise<EvaluationResult>

#### `inspectObject(objectRef: string, options?: InspectOptions): Promise<ObjectProperties>`
Inspects an object's properties.

**Parameters:**
- `objectRef` (string): Object reference ID
- `options.depth` (number): Maximum depth to inspect
- `options.maxProperties` (number): Maximum properties to return

**Returns:** Promise<ObjectProperties>

---

## Security Features

### AuthManager

Manages authentication and authorization.

```typescript
import { AuthManager } from '@mcp-debugger/core';

const authManager = new AuthManager({
  tokenSecret: 'your-secret-key',
  tokenExpiry: 3600000 // 1 hour
});

// Validate token
const isValid = await authManager.validateToken(token);

// Generate token
const token = await authManager.generateToken(userId);
```

### RateLimiter

Implements rate limiting for operations.

```typescript
import { RateLimiter } from '@mcp-debugger/core';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000 // 1 minute
});

// Check if allowed
const allowed = await limiter.checkLimit(userId, operation);
```

### DataMasker

Masks sensitive data in variable inspection.

```typescript
import { DataMasker } from '@mcp-debugger/core';

const masker = new DataMasker({
  patterns: ['email', 'ssn', 'creditCard'],
  maskChar: '*'
});

// Mask sensitive data
const masked = masker.maskValue(value);
```

---

## Observability

### StructuredLogger

Provides structured logging with correlation IDs.

```typescript
import { StructuredLogger } from '@mcp-debugger/core';

const logger = new StructuredLogger({
  level: 'info',
  format: 'json'
});

logger.info('Session started', {
  sessionId: 'abc123',
  userId: 'user456'
});

logger.error('Operation failed', {
  error: err,
  context: { operation: 'setBreakpoint' }
});
```

### MetricsCollector

Collects and exposes metrics.

```typescript
import { MetricsCollector } from '@mcp-debugger/core';

const metrics = new MetricsCollector();

// Record metric
metrics.recordSessionDuration(sessionId, duration);
metrics.recordBreakpointHit(breakpointId);
metrics.recordOperationLatency('stepOver', latency);

// Get metrics
const summary = metrics.getSummary();
```

### HealthChecker

Provides health check endpoints.

```typescript
import { HealthChecker } from '@mcp-debugger/core';

const health = new HealthChecker();

// Check health
const status = await health.check();
// Returns: { status: 'healthy', checks: {...} }

// Check readiness
const ready = await health.checkReadiness();

// Check liveness
const alive = await health.checkLiveness();
```

---

## Performance Profiling

### CPUProfiler

Profiles CPU usage and identifies bottlenecks.

```typescript
import { CPUProfiler } from '@mcp-debugger/core';

const profiler = new CPUProfiler(session);

// Start profiling
await profiler.startProfiling();

// Stop and get profile
const profile = await profiler.stopProfiling();

// Analyze profile
const analysis = profiler.analyzeProfile(profile);
// Returns: { hotspots, callTree, recommendations }
```

### MemoryProfiler

Profiles memory usage and detects leaks.

```typescript
import { MemoryProfiler } from '@mcp-debugger/core';

const profiler = new MemoryProfiler(session);

// Take heap snapshot
const snapshot = await profiler.takeHeapSnapshot();

// Detect memory leaks
const leaks = await profiler.detectLeaks();

// Get memory usage
const usage = await profiler.getMemoryUsage();
```

### PerformanceTimeline

Records and analyzes performance events.

```typescript
import { PerformanceTimeline } from '@mcp-debugger/core';

const timeline = new PerformanceTimeline();

// Record event
timeline.recordEvent({
  type: 'breakpoint-hit',
  timestamp: Date.now(),
  duration: 150,
  metadata: { breakpointId: 'bp-123' }
});

// Get timeline
const events = timeline.getEvents();

// Generate report
const report = timeline.generateReport();
```

---

## Error Handling

### Error Types

All errors extend `DebuggerError` with specific error codes:

```typescript
class DebuggerError extends Error {
  code: string;
  details?: any;
}
```

**Common Error Codes:**

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | Session ID not found |
| `SESSION_START_FAILED` | Failed to start debug session |
| `BREAKPOINT_NOT_SET` | Failed to set breakpoint |
| `INVALID_EXPRESSION` | Expression evaluation failed |
| `PROCESS_CRASHED` | Target process crashed |
| `TIMEOUT` | Operation timed out |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `UNAUTHORIZED` | Authentication failed |

### Error Handling Example

```typescript
try {
  await session.setBreakpoint({
    file: '/path/to/file.ts',
    line: 42
  });
} catch (error) {
  if (error.code === 'BREAKPOINT_NOT_SET') {
    console.error('Failed to set breakpoint:', error.message);
    console.error('Details:', error.details);
  } else {
    throw error;
  }
}
```

---

## Advanced Features

### Multi-Target Debugging

Debug multiple processes simultaneously:

```typescript
import { MultiTargetDebugger } from '@mcp-debugger/core';

const multiDebugger = new MultiTargetDebugger();

// Add targets
await multiDebugger.addTarget({
  name: 'main-process',
  command: 'node',
  args: ['main.js']
});

await multiDebugger.addTarget({
  name: 'worker-process',
  command: 'node',
  args: ['worker.js']
});

// Set coordinated breakpoints
await multiDebugger.setCoordinatedBreakpoint({
  targets: ['main-process', 'worker-process'],
  file: 'shared.js',
  line: 10
});
```

### Workspace Management

Manage monorepo and workspace debugging:

```typescript
import { WorkspaceManager } from '@mcp-debugger/core';

const workspace = new WorkspaceManager('/path/to/monorepo');

// Auto-detect workspace structure
await workspace.detectStructure();

// Get packages
const packages = workspace.getPackages();

// Resolve workspace-relative paths
const absolutePath = workspace.resolvePath('packages/app/src/index.ts');
```

### Debug Presets

Use predefined debugging configurations:

```typescript
import { DebugPresets } from '@mcp-debugger/core';

const presets = new DebugPresets();

// Use preset
const config = presets.getPreset('jest-tests');
// Returns: { command: 'node', args: [...], env: {...} }

// Create custom preset
presets.createPreset('my-app', {
  command: 'node',
  args: ['--inspect-brk', 'dist/main.js'],
  env: { NODE_ENV: 'development' }
});
```

---

## TypeScript Types

### Core Types

```typescript
interface DebugSession {
  id: string;
  state: 'paused' | 'running' | 'stopped';
  process: ChildProcess;
  inspector: InspectorClient;
  breakpoints: Map<string, Breakpoint>;
}

interface Breakpoint {
  id: string;
  file: string;
  line: number;
  condition?: string;
  enabled: boolean;
  verified: boolean;
}

interface Variable {
  name: string;
  value: any;
  type: string;
  scope: 'local' | 'global';
}

interface ExecutionLocation {
  file: string;
  line: number;
  column: number;
  functionName?: string;
}

interface CallFrame {
  functionName: string;
  file: string;
  line: number;
  column: number;
  scope: Scope;
}
```

---

## Best Practices

### 1. Session Management
- Always clean up sessions when done
- Use appropriate timeouts
- Handle session crashes gracefully

### 2. Breakpoint Management
- Use absolute file paths
- Validate breakpoint locations
- Clean up breakpoints before session end

### 3. Error Handling
- Always catch and handle errors
- Check error codes for specific handling
- Log errors with context

### 4. Performance
- Limit object inspection depth
- Use conditional breakpoints wisely
- Clean up resources promptly

### 5. Security
- Validate all user input
- Use authentication in production
- Enable rate limiting
- Mask sensitive data

---

## Examples

### Complete Debugging Session

```typescript
import { DebuggerCore } from '@mcp-debugger/core';

async function debugApplication() {
  const debugger = new DebuggerCore();
  
  try {
    // Start session
    const session = await debugger.createSession({
      command: 'node',
      args: ['app.js'],
      cwd: '/path/to/project'
    });
    
    // Set breakpoint
    const bp = await session.setBreakpoint({
      file: '/path/to/project/app.js',
      line: 10,
      condition: 'user.age > 18'
    });
    
    // Continue to breakpoint
    await session.continue();
    
    // Inspect variables
    const locals = await session.getLocalVariables();
    console.log('Local variables:', locals);
    
    // Evaluate expression
    const result = await session.evaluateExpression('user.name');
    console.log('User name:', result.value);
    
    // Step over
    await session.stepOver();
    
    // Continue to end
    await session.continue();
    
  } catch (error) {
    console.error('Debugging failed:', error);
  } finally {
    // Cleanup
    await debugger.cleanup();
  }
}
```

---

## See Also

- [TOOL-REFERENCE.md](../mcp-debugger-server/TOOL-REFERENCE.md) - MCP tool documentation
- [README.md](README.md) - Getting started guide
- [TESTING.md](TESTING.md) - Testing documentation
- [AI-AGENT-INTEGRATION.md](../mcp-debugger-server/AI-AGENT-INTEGRATION.md) - AI agent integration
- [VSCODE-INTEGRATION.md](../mcp-debugger-server/VSCODE-INTEGRATION.md) - VS Code integration

---

**Version:** 1.0.0  
**Last Updated:** 2025-11-27
