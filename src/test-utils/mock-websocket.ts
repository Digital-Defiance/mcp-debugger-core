/**
 * WebSocket Mocking Utilities for Inspector Client Tests
 *
 * Provides mock WebSocket server and CDP message fixtures for testing
 * inspector-based functionality without spawning real Node.js processes.
 */

import { Server as MockWebSocketServer } from 'mock-socket';
import { CDPRequest, CDPResponse, CDPEvent } from '../lib/inspector-client';

/**
 * Mock CDP responses for common commands
 */
export const mockCDPResponses: Record<string, any> = {
  'Debugger.enable': { debuggerId: 'mock-debugger-id' },
  'Runtime.enable': {},
  'Debugger.disable': {},
  'Runtime.disable': {},
  'Debugger.pause': {},
  'Debugger.resume': {},
  'Debugger.stepOver': {},
  'Debugger.stepInto': {},
  'Debugger.stepOut': {},
  'Debugger.setBreakpointByUrl': {
    breakpointId: 'mock-breakpoint-id',
    locations: [
      {
        scriptId: 'mock-script-id',
        lineNumber: 10,
        columnNumber: 0,
      },
    ],
  },
  'Debugger.removeBreakpoint': {},
  'Debugger.getScriptSource': {
    scriptSource: 'console.log("test");',
  },
  'Runtime.evaluate': {
    result: {
      type: 'number',
      value: 42,
      description: '42',
    },
  },
  'Debugger.evaluateOnCallFrame': {
    result: {
      type: 'string',
      value: 'test value',
      description: 'test value',
    },
  },
  'Runtime.getProperties': {
    result: [
      {
        name: 'prop1',
        value: { type: 'string', value: 'value1' },
      },
      {
        name: 'prop2',
        value: { type: 'number', value: 123 },
      },
    ],
  },
  'Profiler.start': {},
  'Profiler.stop': {
    profile: {
      nodes: [],
      startTime: 0,
      endTime: 1000,
    },
  },
  'HeapProfiler.takeHeapSnapshot': {},
  'HeapProfiler.collectGarbage': {},
};

/**
 * Mock CDP events that can be emitted
 */
export const mockCDPEvents = {
  scriptParsed: (scriptId: string, url: string): CDPEvent => ({
    method: 'Debugger.scriptParsed',
    params: {
      scriptId,
      url,
      startLine: 0,
      startColumn: 0,
      endLine: 100,
      endColumn: 0,
      executionContextId: 1,
      hash: 'mock-hash',
    },
  }),

  paused: (
    callFrames: any[] = [],
    reason: string = 'other',
    data?: any,
  ): CDPEvent => ({
    method: 'Debugger.paused',
    params: {
      callFrames: callFrames.length
        ? callFrames
        : [
            {
              callFrameId: 'mock-frame-id',
              functionName: 'testFunction',
              location: {
                scriptId: 'mock-script-id',
                lineNumber: 10,
                columnNumber: 0,
              },
              url: 'file:///test.js',
              scopeChain: [
                {
                  type: 'local',
                  object: {
                    type: 'object',
                    objectId: 'mock-object-id',
                  },
                },
              ],
              this: {
                type: 'object',
                objectId: 'mock-this-id',
              },
            },
          ],
      reason,
      data,
    },
  }),

  resumed: (): CDPEvent => ({
    method: 'Debugger.resumed',
    params: {},
  }),

  breakpointResolved: (breakpointId: string, location: any): CDPEvent => ({
    method: 'Debugger.breakpointResolved',
    params: {
      breakpointId,
      location,
    },
  }),

  consoleAPICalled: (type: string, args: any[]): CDPEvent => ({
    method: 'Runtime.consoleAPICalled',
    params: {
      type,
      args,
      executionContextId: 1,
      timestamp: Date.now(),
    },
  }),

  exceptionThrown: (
    exceptionDetails: any = {
      text: 'Uncaught Error: test error',
      lineNumber: 10,
      columnNumber: 5,
    },
  ): CDPEvent => ({
    method: 'Runtime.exceptionThrown',
    params: {
      timestamp: Date.now(),
      exceptionDetails,
    },
  }),
};

/**
 * Configuration for mock WebSocket server behavior
 */
export interface MockWebSocketConfig {
  /** URL for the mock WebSocket server */
  url?: string;
  /** Custom response handlers for specific CDP methods */
  customHandlers?: Record<string, (params: any) => any>;
  /** Events to emit automatically after connection */
  autoEmitEvents?: CDPEvent[];
  /** Delay in ms before responding to commands */
  responseDelay?: number;
  /** Whether to simulate connection errors */
  simulateConnectionError?: boolean;
  /** Whether to simulate command timeouts */
  simulateTimeout?: boolean;
  /** Custom error to return for specific methods */
  errorHandlers?: Record<string, { code: number; message: string; data?: any }>;
}

/**
 * Create a mock WebSocket server for testing Inspector Client
 */
export class MockInspectorServer {
  private server: MockWebSocketServer;
  private config: MockWebSocketConfig;
  private messageId = 0;
  private connections: Set<any> = new Set();

  constructor(config: MockWebSocketConfig = {}) {
    this.config = {
      url: config.url || 'ws://localhost:9229/mock-session-id',
      customHandlers: config.customHandlers || {},
      autoEmitEvents: config.autoEmitEvents || [],
      responseDelay: config.responseDelay || 0,
      simulateConnectionError: config.simulateConnectionError || false,
      simulateTimeout: config.simulateTimeout || false,
      errorHandlers: config.errorHandlers || {},
    };

    this.server = new MockWebSocketServer(this.config.url!);
    this.setupServer();
  }

  private setupServer(): void {
    this.server.on('connection', (socket) => {
      // Add connection immediately
      this.connections.add(socket);

      if (this.config.simulateConnectionError) {
        socket.close();
        this.connections.delete(socket);
        return;
      }

      // Emit auto-events after connection
      if (this.config.autoEmitEvents && this.config.autoEmitEvents.length > 0) {
        setTimeout(() => {
          this.config.autoEmitEvents!.forEach((event) => {
            socket.send(JSON.stringify(event));
          });
        }, 10);
      }

      socket.on('message', (data: string) => {
        this.handleMessage(socket, data);
      });

      socket.on('close', () => {
        this.connections.delete(socket);
      });
    });
  }

  private async handleMessage(socket: any, data: string): Promise<void> {
    try {
      const request: CDPRequest = JSON.parse(data);

      // Check if we should simulate timeout
      if (this.config.simulateTimeout) {
        // Don't respond - let the client timeout
        return;
      }

      // Check for custom error handler
      if (this.config.errorHandlers?.[request.method]) {
        const error = this.config.errorHandlers[request.method];
        const response: CDPResponse = {
          id: request.id,
          error,
        };

        await this.sendResponse(socket, response);
        return;
      }

      // Check for custom handler
      if (this.config.customHandlers?.[request.method]) {
        const result = this.config.customHandlers[request.method](
          request.params,
        );
        const response: CDPResponse = {
          id: request.id,
          result,
        };

        await this.sendResponse(socket, response);
        return;
      }

      // Use default mock response
      const result = mockCDPResponses[request.method] || {};
      const response: CDPResponse = {
        id: request.id,
        result,
      };

      await this.sendResponse(socket, response);
    } catch (error) {
      console.error('Error handling mock WebSocket message:', error);
    }
  }

  private async sendResponse(
    socket: any,
    response: CDPResponse,
  ): Promise<void> {
    if (this.config.responseDelay && this.config.responseDelay > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.responseDelay),
      );
    }

    socket.send(JSON.stringify(response));
  }

  /**
   * Emit a CDP event to all connected clients
   */
  emitEvent(event: CDPEvent): void {
    const message = JSON.stringify(event);
    this.connections.forEach((socket) => {
      socket.send(message);
    });
  }

  /**
   * Get the WebSocket URL for this mock server
   */
  getUrl(): string {
    return this.config.url!;
  }

  /**
   * Get the number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Close the mock server and all connections
   */
  close(): void {
    this.connections.forEach((socket) => {
      socket.close();
    });
    this.connections.clear();
    this.server.close();
  }

  /**
   * Stop the server (alias for close)
   */
  stop(): void {
    this.close();
  }
}

/**
 * Create a mock inspector server with common debugging scenario
 */
export function createMockInspectorServer(
  scenario: 'basic' | 'breakpoint' | 'error' | 'timeout' | 'custom',
  customConfig?: MockWebSocketConfig,
): MockInspectorServer {
  switch (scenario) {
    case 'basic':
      return new MockInspectorServer({
        autoEmitEvents: [
          mockCDPEvents.scriptParsed('script-1', 'file:///test.js'),
        ],
        ...customConfig,
      });

    case 'breakpoint':
      return new MockInspectorServer({
        autoEmitEvents: [
          mockCDPEvents.scriptParsed('script-1', 'file:///test.js'),
        ],
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
          ...customConfig?.customHandlers,
        },
        ...customConfig,
      });

    case 'error':
      return new MockInspectorServer({
        errorHandlers: {
          'Debugger.setBreakpointByUrl': {
            code: -32000,
            message: 'Breakpoint not resolved',
          },
          ...customConfig?.errorHandlers,
        },
        ...customConfig,
      });

    case 'timeout':
      return new MockInspectorServer({
        simulateTimeout: true,
        ...customConfig,
      });

    case 'custom':
      return new MockInspectorServer(customConfig);

    default:
      return new MockInspectorServer(customConfig);
  }
}

/**
 * Helper to wait for a condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 50,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
