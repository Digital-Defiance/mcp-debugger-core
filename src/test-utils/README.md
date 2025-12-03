# Test Utilities

This directory contains utilities for testing the MCP Debugger Core functionality.

## WebSocket Mocking

The `mock-websocket.ts` module provides infrastructure for testing inspector-based functionality without spawning real Node.js processes. This makes tests faster, more reliable, and easier to debug.

### Overview

The WebSocket mocking infrastructure includes:

1. **MockInspectorServer**: A mock WebSocket server that simulates the Chrome DevTools Protocol (CDP)
2. **CDP Response Fixtures**: Pre-defined responses for common CDP commands
3. **CDP Event Fixtures**: Helper functions to create CDP events
4. **Scenario Builders**: Pre-configured servers for common testing scenarios

### Basic Usage

```typescript
import {
  MockInspectorServer,
  createMockInspectorServer,
  mockCDPEvents,
} from '../test-utils/mock-websocket';

describe('My Test Suite', () => {
  let mockServer: MockInspectorServer | null = null;

  afterEach(() => {
    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
  });

  it('should test something', async () => {
    // Create a mock server
    mockServer = createMockInspectorServer('basic');

    // Get the WebSocket URL
    const wsUrl = mockServer.getUrl();

    // Your test code here...
    // Connect to wsUrl and test your functionality
  });
});
```

### Creating Mock Servers

#### Using Scenario Builders

The easiest way to create a mock server is using the scenario builders:

```typescript
// Basic scenario - responds to common CDP commands
const server = createMockInspectorServer('basic');

// Breakpoint scenario - includes custom breakpoint handling
const server = createMockInspectorServer('breakpoint');

// Error scenario - returns errors for certain commands
const server = createMockInspectorServer('error');

// Timeout scenario - simulates command timeouts
const server = createMockInspectorServer('timeout');

// Custom scenario - full control over configuration
const server = createMockInspectorServer('custom', {
  url: 'ws://localhost:9999/my-session',
  customHandlers: {
    'Debugger.enable': () => ({ customField: 'value' }),
  },
});
```

#### Manual Configuration

For full control, create a server with custom configuration:

```typescript
const server = new MockInspectorServer({
  // WebSocket URL (optional, defaults to a random URL)
  url: 'ws://localhost:9229/session-id',

  // Custom response handlers for specific CDP methods
  customHandlers: {
    'Debugger.setBreakpointByUrl': (params) => ({
      breakpointId: `bp-${params.lineNumber}`,
      locations: [
        {
          scriptId: 'script-1',
          lineNumber: params.lineNumber,
          columnNumber: 0,
        },
      ],
    }),
  },

  // Events to emit automatically after connection
  autoEmitEvents: [
    mockCDPEvents.scriptParsed('script-1', 'file:///test.js'),
    mockCDPEvents.paused(),
  ],

  // Delay in ms before responding to commands
  responseDelay: 100,

  // Simulate connection errors
  simulateConnectionError: false,

  // Simulate command timeouts
  simulateTimeout: false,

  // Custom error responses for specific methods
  errorHandlers: {
    'Debugger.setBreakpointByUrl': {
      code: -32000,
      message: 'Breakpoint not resolved',
    },
  },
});
```

### Emitting Events

You can emit CDP events to connected clients at any time:

```typescript
const server = createMockInspectorServer('basic');

// Emit a paused event
server.emitEvent(mockCDPEvents.paused());

// Emit a script parsed event
server.emitEvent(mockCDPEvents.scriptParsed('script-1', 'file:///test.js'));

// Emit a breakpoint resolved event
server.emitEvent(
  mockCDPEvents.breakpointResolved('bp-1', {
    scriptId: 'script-1',
    lineNumber: 10,
  }),
);
```

### Available CDP Event Fixtures

```typescript
// Script parsed event
mockCDPEvents.scriptParsed(scriptId, url);

// Debugger paused event
mockCDPEvents.paused(callFrames?, reason?, data?);

// Debugger resumed event
mockCDPEvents.resumed();

// Breakpoint resolved event
mockCDPEvents.breakpointResolved(breakpointId, location);

// Console API called event
mockCDPEvents.consoleAPICalled(type, args);

// Exception thrown event
mockCDPEvents.exceptionThrown(exceptionDetails?);
```

### Available CDP Response Fixtures

The following CDP commands have pre-defined mock responses:

- `Debugger.enable`
- `Runtime.enable`
- `Debugger.disable`
- `Runtime.disable`
- `Debugger.pause`
- `Debugger.resume`
- `Debugger.stepOver`
- `Debugger.stepInto`
- `Debugger.stepOut`
- `Debugger.setBreakpointByUrl`
- `Debugger.removeBreakpoint`
- `Debugger.getScriptSource`
- `Runtime.evaluate`
- `Debugger.evaluateOnCallFrame`
- `Runtime.getProperties`
- `Profiler.start`
- `Profiler.stop`
- `HeapProfiler.takeHeapSnapshot`
- `HeapProfiler.collectGarbage`

### Helper Functions

#### waitForCondition

Wait for a condition to become true with timeout:

```typescript
import { waitForCondition } from '../test-utils/mock-websocket';

// Wait for a value to change
let connected = false;
setTimeout(() => {
  connected = true;
}, 100);

const result = await waitForCondition(
  () => connected,
  5000, // timeout in ms
  50, // check interval in ms
);

expect(result).toBe(true);
```

### Testing with Real WebSocket Clients

The mock server works with the standard `WebSocket` class from `mock-socket`:

```typescript
import { WebSocket } from 'mock-socket';
import { MockInspectorServer } from '../test-utils/mock-websocket';

const server = new MockInspectorServer({
  url: 'ws://localhost:9229/test',
});

const client = new WebSocket('ws://localhost:9229/test');

client.onopen = () => {
  // Send a CDP command
  client.send(
    JSON.stringify({
      id: 1,
      method: 'Debugger.enable',
      params: {},
    }),
  );
};

client.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log('Received:', response);
};
```

### Integration with Inspector Client

To test the `InspectorClient` class with mocked WebSockets, you need to mock the `ws` module:

```typescript
// At the top of your test file, before any imports
jest.mock('ws', () => {
  const { WebSocket } = require('mock-socket');
  return WebSocket;
});

import { InspectorClient } from './inspector-client';
import { MockInspectorServer } from '../test-utils/mock-websocket';

describe('InspectorClient with Mocks', () => {
  let mockServer: MockInspectorServer;
  let client: InspectorClient;

  beforeEach(() => {
    mockServer = createMockInspectorServer('basic');
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
    if (mockServer) {
      mockServer.close();
    }
  });

  it('should connect and send commands', async () => {
    client = new InspectorClient(mockServer.getUrl());
    await client.connect();

    const result = await client.send('Debugger.enable');
    expect(result).toBeDefined();
  });
});
```

**Note**: Due to how the `ws` module is imported in `inspector-client.ts` (`import * as WebSocket from 'ws'`), the Jest mock needs to be set up carefully. The current implementation may require adjustments to the import statement or the mock setup.

### Best Practices

1. **Always clean up**: Close mock servers in `afterEach` hooks to prevent resource leaks
2. **Use scenario builders**: Start with pre-configured scenarios before creating custom configurations
3. **Test timing**: Use `waitForCondition` for asynchronous operations instead of fixed delays
4. **Isolate tests**: Create a new mock server for each test to ensure isolation
5. **Verify connections**: Check connection count when testing connection management
6. **Test error paths**: Use error scenarios to test error handling code

### Examples

See `mock-websocket.spec.ts` for comprehensive examples of using the mocking infrastructure.

## Cleanup Utilities

The `cleanup.ts` module provides utilities for cleaning up test resources:

```typescript
import {
  setupTestCleanup,
  cleanupDebugProcesses,
  cleanupChildProcess,
  cleanupDebugSession,
  waitFor,
  cleanupAll,
} from '../test-utils/cleanup';

describe('My Test Suite', () => {
  // Automatic cleanup for all tests
  setupTestCleanup();

  // Manual cleanup
  afterAll(async () => {
    await cleanupAll();
  });
});
```

See `cleanup.ts` for detailed documentation on cleanup utilities.
