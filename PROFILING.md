# Performance Profiling Features

This document describes the performance profiling features added to the MCP Debugger Tool.

## Overview

The profiling features enable comprehensive performance analysis of Node.js applications, including:
- CPU profiling with bottleneck detection
- Memory profiling with heap snapshots and leak detection
- Performance timeline tracking
- MCP tools for AI agent integration

## Features

### 1. CPU Profiling

**Implementation**: `packages/debugger-core/src/lib/cpu-profiler.ts`

The CPU profiler captures detailed CPU usage data and provides analysis capabilities:

- **Start/Stop Profiling**: Begin and end CPU profile collection
- **Flame Graph Generation**: Convert profile data into flame graph format for visualization
- **Call Tree Generation**: Generate call tree representation of function calls
- **Bottleneck Detection**: Automatically identify functions consuming >5% of execution time
- **Profile Analysis**: Calculate self-time and total time for each function

**Key Methods**:
```typescript
await session.startCPUProfile();
const profile = await session.stopCPUProfile();
const analysis = session.analyzeCPUProfile(profile);
```

**Analysis Output**:
- Total execution time
- Top functions by self-time
- Bottlenecks with impact percentage
- Function call counts and timing statistics

### 2. Memory Profiling

**Implementation**: `packages/debugger-core/src/lib/memory-profiler.ts`

The memory profiler provides heap analysis and leak detection:

- **Heap Snapshots**: Capture complete heap state at any point
- **Memory Usage Tracking**: Monitor memory consumption over time
- **Leak Detection**: Analyze heap growth to identify memory leaks
- **Object Type Analysis**: Break down memory usage by object type
- **Garbage Collection**: Trigger GC and track allocation patterns

**Key Methods**:
```typescript
const snapshot = await session.takeHeapSnapshot();
const memoryUsage = await session.getMemoryUsage();
const leakAnalysis = await session.detectMemoryLeaks();
const report = await session.generateMemoryReport();
```

**Memory Report Includes**:
- Total and used heap size
- Heap usage percentage
- Top object types by size and count
- Memory allocation patterns

### 3. Performance Timeline

**Implementation**: `packages/debugger-core/src/lib/performance-timeline.ts`

The performance timeline records execution events for detailed analysis:

- **Event Recording**: Track function calls, GC events, and script evaluation
- **Function Timing**: Measure execution time for individual functions
- **Slow Operation Detection**: Identify operations taking >100ms
- **GC Statistics**: Track garbage collection frequency and duration

**Key Methods**:
```typescript
await session.startPerformanceRecording();
const report = await session.stopPerformanceRecording();
```

**Performance Report Includes**:
- Total duration
- Event count and types
- Slow operations (>100ms)
- Top functions by total time
- GC time and count

### 4. MCP Tools

**Implementation**: `packages/mcp-server/src/lib/mcp-server.ts`

Four new MCP tools enable AI agents to perform profiling operations:

#### debugger_start_cpu_profile
Start CPU profiling for a debug session.

**Parameters**:
- `sessionId`: Debug session identifier

**Returns**: Success status

#### debugger_stop_cpu_profile
Stop CPU profiling and return analysis.

**Parameters**:
- `sessionId`: Debug session identifier

**Returns**:
- Profile summary (duration, node count, sample count)
- Analysis with top functions and bottlenecks
- Formatted analysis text

#### debugger_take_heap_snapshot
Take a heap snapshot and generate memory report.

**Parameters**:
- `sessionId`: Debug session identifier

**Returns**:
- Snapshot summary (node count, edge count)
- Memory report with heap usage and top object types
- Formatted report text

#### debugger_get_performance_metrics
Get comprehensive performance metrics.

**Parameters**:
- `sessionId`: Debug session identifier
- `includeLeakDetection`: Optional, run leak detection (takes 10s)
- `includePerformanceTimeline`: Optional, include timeline data

**Returns**:
- Current memory usage
- Optional leak detection results
- Optional performance timeline data

## Usage Examples

### Example 1: CPU Profiling

```typescript
// Start a debug session
const session = await sessionManager.createSession({
  command: 'node',
  args: ['app.js'],
});

// Start CPU profiling
await session.startCPUProfile();

// Let the application run
await session.resume();
await new Promise(resolve => setTimeout(resolve, 5000));

// Stop profiling and analyze
const profile = await session.stopCPUProfile();
const analysis = session.analyzeCPUProfile(profile);

console.log('Bottlenecks:', analysis.bottlenecks);
console.log('Top Functions:', analysis.topFunctions);
```

### Example 2: Memory Leak Detection

```typescript
// Start a debug session
const session = await sessionManager.createSession({
  command: 'node',
  args: ['app.js'],
});

// Detect memory leaks over 10 seconds
const leakAnalysis = await session.detectMemoryLeaks(10000, 2000);

if (leakAnalysis.isLeaking) {
  console.log(`Memory leak detected!`);
  console.log(`Growth rate: ${leakAnalysis.growthRate / (1024 * 1024)} MB/s`);
}
```

### Example 3: Performance Timeline

```typescript
// Start a debug session
const session = await sessionManager.createSession({
  command: 'node',
  args: ['app.js'],
});

// Start performance recording
await session.startPerformanceRecording();

// Run the application
await session.resume();
await new Promise(resolve => setTimeout(resolve, 5000));

// Stop and get report
const report = await session.stopPerformanceRecording();

console.log('Slow operations:', report.slowOperations);
console.log('Top functions:', report.functionTimings);
```

### Example 4: Using MCP Tools

```json
// Start CPU profiling via MCP
{
  "method": "tools/call",
  "params": {
    "name": "debugger_start_cpu_profile",
    "arguments": {
      "sessionId": "session-123"
    }
  }
}

// Stop CPU profiling and get analysis
{
  "method": "tools/call",
  "params": {
    "name": "debugger_stop_cpu_profile",
    "arguments": {
      "sessionId": "session-123"
    }
  }
}

// Take heap snapshot
{
  "method": "tools/call",
  "params": {
    "name": "debugger_take_heap_snapshot",
    "arguments": {
      "sessionId": "session-123"
    }
  }
}

// Get performance metrics with leak detection
{
  "method": "tools/call",
  "params": {
    "name": "debugger_get_performance_metrics",
    "arguments": {
      "sessionId": "session-123",
      "includeLeakDetection": true,
      "includePerformanceTimeline": true
    }
  }
}
```

## Integration Tests

Comprehensive integration tests are provided in:
- `packages/debugger-core/src/lib/profiling.integration.spec.ts`

Tests cover:
- CPU profiling start/stop
- Profile analysis and bottleneck detection
- Heap snapshot capture
- Memory usage statistics
- Memory report generation
- Performance timeline recording

## Architecture

The profiling features integrate seamlessly with the existing debug session architecture:

```
DebugSession
├── CPUProfiler (cpu-profiler.ts)
│   ├── Start/Stop profiling
│   ├── Generate flame graphs
│   └── Analyze bottlenecks
├── MemoryProfiler (memory-profiler.ts)
│   ├── Take heap snapshots
│   ├── Track memory usage
│   └── Detect leaks
└── PerformanceTimeline (performance-timeline.ts)
    ├── Record events
    ├── Track function timing
    └── Generate reports
```

Each profiler uses the Chrome DevTools Protocol (CDP) domains:
- **Profiler domain**: CPU profiling
- **HeapProfiler domain**: Memory profiling
- **Runtime domain**: Memory usage and performance events

## Performance Considerations

1. **CPU Profiling**: Minimal overhead (~5-10%), suitable for production use
2. **Memory Profiling**: Heap snapshots can be large (10-100MB+), use sparingly
3. **Leak Detection**: Takes 10+ seconds, run during off-peak times
4. **Performance Timeline**: Low overhead, can run continuously

## Future Enhancements

Potential improvements for future versions:
- Flame graph visualization in HTML format
- Heap snapshot comparison and diff
- Real-time performance monitoring
- Integration with external profiling tools
- Performance regression detection
- Automated performance testing

## References

- [Chrome DevTools Protocol - Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)
- [Chrome DevTools Protocol - HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/)
- [Node.js Inspector](https://nodejs.org/api/inspector.html)
