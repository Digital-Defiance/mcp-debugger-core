/**
 * Inspector Client Tests with WebSocket Mocking
 *
 * These tests use mock-socket to test inspector client functionality
 * without spawning real Node.js processes, providing faster and more
 * reliable test execution.
 */

// Mock the 'ws' module before importing InspectorClient
// The inspector-client uses: import WebSocket from 'ws'
// The 'ws' library uses EventEmitter API (.on, .emit)
// But mock-socket uses browser WebSocket API (.addEventListener)
// So we need to create a wrapper that bridges the two APIs
jest.mock('ws', () => {
  const { WebSocket: MockWebSocket } = require('mock-socket');
  const { EventEmitter } = require('events');

  // Create a wrapper class that extends EventEmitter and wraps mock-socket
  class WebSocketWrapper extends EventEmitter {
    private ws: any;

    constructor(url: string) {
      super();
      this.ws = new MockWebSocket(url);

      // Bridge browser WebSocket events to EventEmitter
      this.ws.addEventListener('open', () => this.emit('open'));
      this.ws.addEventListener('close', () => this.emit('close'));
      this.ws.addEventListener('error', (event: any) =>
        this.emit('error', event.error || new Error('WebSocket error')),
      );
      this.ws.addEventListener('message', (event: any) => {
        // ws library expects data property, not event.data
        this.emit('message', event.data);
      });
    }

    // Proxy send method
    send(data: any) {
      this.ws.send(data);
    }

    // Proxy close method
    close() {
      this.ws.close();
    }

    // Proxy readyState
    get readyState() {
      return this.ws.readyState;
    }
  }

  return WebSocketWrapper;
});

import { InspectorClient } from './inspector-client';
import {
  MockInspectorServer,
  createMockInspectorServer,
  mockCDPEvents,
  mockCDPResponses,
  waitForCondition,
} from '../test-utils/mock-websocket';

describe('InspectorClient (Mocked WebSocket)', () => {
  let mockServer: MockInspectorServer | null = null;
  let client: InspectorClient | null = null;

  afterEach(async () => {
    // Clean up after each test
    if (client) {
      await client.disconnect();
      client = null;
    }
    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
  });

  describe('Connection Management', () => {
    it('should connect to WebSocket server successfully', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());

      await client.connect();

      expect(client.isConnected()).toBe(true);
      expect(mockServer.getConnectionCount()).toBe(1);
    });

    it('should handle connection errors gracefully', async () => {
      // Create a server that immediately closes connections
      mockServer = createMockInspectorServer('custom', {
        simulateConnectionError: true,
      });
      client = new InspectorClient(mockServer.getUrl());

      // The connection will succeed but immediately close
      // This is effectively a connection error in practice
      await client.connect();

      // Wait a bit for the close event
      await new Promise((resolve) => setTimeout(resolve, 50));

      // After immediate close, client should not be connected
      expect(client.isConnected()).toBe(false);
    });

    it('should disconnect cleanly', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());

      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle multiple connect/disconnect cycles', async () => {
      mockServer = createMockInspectorServer('basic');

      for (let i = 0; i < 3; i++) {
        client = new InspectorClient(mockServer.getUrl());
        await client.connect();
        expect(client.isConnected()).toBe(true);

        await client.disconnect();
        expect(client.isConnected()).toBe(false);
        client = null;
      }
    });

    it('should reject commands when not connected', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());

      // Don't connect
      await expect(client.send('Debugger.enable')).rejects.toThrow(
        'Inspector client is not connected',
      );
    });

    it('should reject commands after disconnection', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());

      await client.connect();
      await client.disconnect();

      await expect(client.send('Debugger.enable')).rejects.toThrow(
        'Inspector client is not connected',
      );
    });
  });

  describe('CDP Command Handling', () => {
    it('should send and receive CDP commands', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const result = await client.send('Debugger.enable');

      expect(result).toBeDefined();
      expect(result.debuggerId).toBe('mock-debugger-id');
    });

    it('should handle multiple sequential commands', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const result1 = await client.send('Debugger.enable');
      const result2 = await client.send('Runtime.enable');
      const result3 = await client.send('Debugger.pause');

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });

    it('should handle concurrent commands', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const promises = [
        client.send('Debugger.enable'),
        client.send('Runtime.enable'),
        client.send('Debugger.pause'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toBeDefined());
    });

    it('should handle commands with parameters', async () => {
      mockServer = createMockInspectorServer('breakpoint');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const result = await client.send('Debugger.setBreakpointByUrl', {
        lineNumber: 42,
        url: 'file:///test.js',
      });

      expect(result).toBeDefined();
      expect(result.breakpointId).toBe('bp-42');
      expect(result.locations).toHaveLength(1);
      expect(result.locations[0].lineNumber).toBe(42);
    });

    it('should handle commands that return complex objects', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const result = await client.send('Runtime.getProperties', {
        objectId: 'mock-object-id',
      });

      expect(result).toBeDefined();
      expect(result.result).toBeInstanceOf(Array);
      expect(result.result.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle CDP error responses', async () => {
      mockServer = createMockInspectorServer('error');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      await expect(
        client.send('Debugger.setBreakpointByUrl', {
          lineNumber: 10,
          url: 'file:///test.js',
        }),
      ).rejects.toThrow('Breakpoint not resolved');
    });

    it('should handle command timeout', async () => {
      mockServer = createMockInspectorServer('timeout');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      await expect(client.send('Debugger.enable', {}, 100)).rejects.toThrow(
        /timed out/,
      );
    });

    it('should remain functional after error', async () => {
      mockServer = createMockInspectorServer('custom', {
        errorHandlers: {
          'Debugger.setBreakpointByUrl': {
            code: -32000,
            message: 'Test error',
          },
        },
      });
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      // First command fails
      await expect(
        client.send('Debugger.setBreakpointByUrl', {}),
      ).rejects.toThrow('Test error');

      // Client should still be connected and functional
      expect(client.isConnected()).toBe(true);

      // Subsequent commands should work
      const result = await client.send('Debugger.enable');
      expect(result).toBeDefined();
    });

    it('should handle malformed responses gracefully', async () => {
      mockServer = createMockInspectorServer('custom', {
        customHandlers: {
          'Debugger.enable': () => {
            // Return undefined to simulate malformed response
            return undefined;
          },
        },
      });
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      // Should not throw, just return undefined result
      const result = await client.send('Debugger.enable');
      expect(result).toBeUndefined();
    });

    it('should clean up pending requests on disconnect', async () => {
      mockServer = createMockInspectorServer('custom', {
        responseDelay: 1000, // Delay response
      });
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      // Send command but disconnect before response
      const promise = client.send('Debugger.enable');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await client.disconnect();

      // Promise should reject with disconnect error
      await expect(promise).rejects.toThrow('Inspector client disconnected');
    });
  });

  describe('Event Handling', () => {
    it('should receive and emit CDP events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const events: any[] = [];
      client.on('event', (event) => {
        events.push(event);
      });

      // Server should auto-emit scriptParsed event
      await waitForCondition(() => events.length > 0, 1000);

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].method).toBe('Debugger.scriptParsed');
    });

    it('should emit specific event types', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const scriptParsedEvents: any[] = [];
      client.on('Debugger.scriptParsed', (params) => {
        scriptParsedEvents.push(params);
      });

      // Wait for auto-emitted event
      await waitForCondition(() => scriptParsedEvents.length > 0, 1000);

      expect(scriptParsedEvents.length).toBeGreaterThan(0);
      expect(scriptParsedEvents[0].scriptId).toBeDefined();
    });

    it('should handle paused events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const pausedEvents: any[] = [];
      client.on('Debugger.paused', (params) => {
        pausedEvents.push(params);
      });

      // Emit paused event from server
      mockServer.emitEvent(mockCDPEvents.paused());

      await waitForCondition(() => pausedEvents.length > 0, 1000);

      expect(pausedEvents.length).toBe(1);
      expect(pausedEvents[0].callFrames).toBeDefined();
      expect(pausedEvents[0].reason).toBeDefined();
    });

    it('should handle resumed events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const resumedEvents: any[] = [];
      client.on('Debugger.resumed', () => {
        resumedEvents.push(true);
      });

      mockServer.emitEvent(mockCDPEvents.resumed());

      await waitForCondition(() => resumedEvents.length > 0, 1000);

      expect(resumedEvents.length).toBe(1);
    });

    it('should handle breakpoint resolved events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const resolvedEvents: any[] = [];
      client.on('Debugger.breakpointResolved', (params) => {
        resolvedEvents.push(params);
      });

      mockServer.emitEvent(
        mockCDPEvents.breakpointResolved('bp-1', {
          scriptId: 'script-1',
          lineNumber: 10,
        }),
      );

      await waitForCondition(() => resolvedEvents.length > 0, 1000);

      expect(resolvedEvents.length).toBe(1);
      expect(resolvedEvents[0].breakpointId).toBe('bp-1');
    });

    it('should handle console API events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const consoleEvents: any[] = [];
      client.on('Runtime.consoleAPICalled', (params) => {
        consoleEvents.push(params);
      });

      mockServer.emitEvent(
        mockCDPEvents.consoleAPICalled('log', [
          { type: 'string', value: 'test message' },
        ]),
      );

      await waitForCondition(() => consoleEvents.length > 0, 1000);

      expect(consoleEvents.length).toBe(1);
      expect(consoleEvents[0].type).toBe('log');
    });

    it('should handle exception events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const exceptionEvents: any[] = [];
      client.on('Runtime.exceptionThrown', (params) => {
        exceptionEvents.push(params);
      });

      mockServer.emitEvent(mockCDPEvents.exceptionThrown());

      await waitForCondition(() => exceptionEvents.length > 0, 1000);

      expect(exceptionEvents.length).toBe(1);
      expect(exceptionEvents[0].exceptionDetails).toBeDefined();
    });

    it('should handle multiple event listeners', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const listener1Events: any[] = [];
      const listener2Events: any[] = [];

      client.on('Debugger.paused', (params) => {
        listener1Events.push(params);
      });

      client.on('Debugger.paused', (params) => {
        listener2Events.push(params);
      });

      mockServer.emitEvent(mockCDPEvents.paused());

      await waitForCondition(
        () => listener1Events.length > 0 && listener2Events.length > 0,
        1000,
      );

      expect(listener1Events.length).toBe(1);
      expect(listener2Events.length).toBe(1);
    });
  });

  describe('Stress Testing', () => {
    it('should handle rapid command sequences', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const commands = Array(50)
        .fill(null)
        .map((_, i) => client!.send('Debugger.enable'));

      const results = await Promise.all(commands);

      expect(results).toHaveLength(50);
      results.forEach((result) => expect(result).toBeDefined());
    });

    it('should handle rapid event emissions', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const events: any[] = [];
      client.on('Debugger.paused', (params) => {
        events.push(params);
      });

      // Emit 20 events rapidly
      for (let i = 0; i < 20; i++) {
        mockServer.emitEvent(mockCDPEvents.paused());
      }

      await waitForCondition(() => events.length >= 20, 2000);

      expect(events.length).toBe(20);
    });

    it('should handle interleaved commands and events', async () => {
      mockServer = createMockInspectorServer('basic');
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const events: any[] = [];
      client.on('Debugger.paused', (params) => {
        events.push(params);
      });

      // Interleave commands and events
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(client.send('Debugger.enable'));
        mockServer.emitEvent(mockCDPEvents.paused());
      }

      await Promise.all(promises);
      await waitForCondition(() => events.length >= 10, 2000);

      expect(events.length).toBe(10);
    });
  });

  describe('Custom Scenarios', () => {
    it('should support custom CDP response handlers', async () => {
      mockServer = createMockInspectorServer('custom', {
        customHandlers: {
          'Debugger.enable': () => ({
            customField: 'custom value',
            debuggerId: 'custom-id',
          }),
        },
      });
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const result = await client.send('Debugger.enable');

      expect(result.customField).toBe('custom value');
      expect(result.debuggerId).toBe('custom-id');
    });

    it('should support delayed responses', async () => {
      mockServer = createMockInspectorServer('custom', {
        responseDelay: 100,
      });
      client = new InspectorClient(mockServer.getUrl());
      await client.connect();

      const startTime = Date.now();
      await client.send('Debugger.enable');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should support auto-emitted events on connection', async () => {
      const customEvents = [
        mockCDPEvents.scriptParsed('script-1', 'file:///test1.js'),
        mockCDPEvents.scriptParsed('script-2', 'file:///test2.js'),
        mockCDPEvents.paused(),
      ];

      mockServer = createMockInspectorServer('custom', {
        autoEmitEvents: customEvents,
      });
      client = new InspectorClient(mockServer.getUrl());

      const events: any[] = [];
      client.on('event', (event) => {
        events.push(event);
      });

      await client.connect();

      await waitForCondition(() => events.length >= 3, 1000);

      expect(events.length).toBeGreaterThanOrEqual(3);
    });
  });
});
