/**
 * Tests for WebSocket Mocking Utilities
 *
 * These tests verify that the mock WebSocket infrastructure works correctly
 * and can be used for testing inspector-based functionality.
 */

import { Server as MockWebSocketServer, WebSocket } from 'mock-socket';
import {
  MockInspectorServer,
  createMockInspectorServer,
  mockCDPEvents,
  mockCDPResponses,
  waitForCondition,
} from './mock-websocket';

describe('Mock WebSocket Infrastructure', () => {
  describe('MockInspectorServer', () => {
    let mockServer: MockInspectorServer | null = null;

    afterEach(() => {
      if (mockServer) {
        mockServer.close();
        mockServer = null;
      }
    });

    it('should create a mock server with default configuration', () => {
      mockServer = new MockInspectorServer();
      expect(mockServer).toBeDefined();
      expect(mockServer.getUrl()).toMatch(/^ws:\/\//);
    });

    it('should accept WebSocket connections', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9229/test-session',
      });

      const client = new WebSocket('ws://localhost:9229/test-session');

      client.onopen = () => {
        // Give a small delay for connection tracking to update
        setTimeout(() => {
          expect(mockServer!.getConnectionCount()).toBeGreaterThanOrEqual(1);
          client.close();
          done();
        }, 10);
      };
    });

    it('should respond to CDP commands', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9230/test-session',
      });

      const client = new WebSocket('ws://localhost:9230/test-session');

      client.onopen = () => {
        const request = {
          id: 1,
          method: 'Debugger.enable',
          params: {},
        };
        client.send(JSON.stringify(request));
      };

      client.onmessage = (event) => {
        const response = JSON.parse(event.data as string);
        expect(response.id).toBe(1);
        expect(response.result).toBeDefined();
        expect(response.result.debuggerId).toBe('mock-debugger-id');
        client.close();
        done();
      };
    });

    it('should emit CDP events', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9231/test-session',
      });

      const client = new WebSocket('ws://localhost:9231/test-session');
      const events: any[] = [];

      client.onmessage = (event) => {
        const message = JSON.parse(event.data as string);
        if (message.method) {
          events.push(message);
          expect(message.method).toBe('Debugger.paused');
          expect(message.params).toBeDefined();
          client.close();
          done();
        }
      };

      client.onopen = () => {
        // Give a small delay for connection to be fully established
        setTimeout(() => {
          mockServer!.emitEvent(mockCDPEvents.paused());
        }, 10);
      };
    });

    it('should handle custom response handlers', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9232/test-session',
        customHandlers: {
          'Debugger.enable': () => ({
            customField: 'custom value',
          }),
        },
      });

      const client = new WebSocket('ws://localhost:9232/test-session');

      client.onopen = () => {
        client.send(
          JSON.stringify({
            id: 1,
            method: 'Debugger.enable',
          }),
        );
      };

      client.onmessage = (event) => {
        const response = JSON.parse(event.data as string);
        expect(response.result.customField).toBe('custom value');
        client.close();
        done();
      };
    });

    it('should handle error responses', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9233/test-session',
        errorHandlers: {
          'Debugger.setBreakpointByUrl': {
            code: -32000,
            message: 'Breakpoint not resolved',
          },
        },
      });

      const client = new WebSocket('ws://localhost:9233/test-session');

      client.onopen = () => {
        client.send(
          JSON.stringify({
            id: 1,
            method: 'Debugger.setBreakpointByUrl',
          }),
        );
      };

      client.onmessage = (event) => {
        const response = JSON.parse(event.data as string);
        expect(response.error).toBeDefined();
        expect(response.error.code).toBe(-32000);
        expect(response.error.message).toBe('Breakpoint not resolved');
        client.close();
        done();
      };
    });

    it('should support delayed responses', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9234/test-session',
        responseDelay: 100,
      });

      const client = new WebSocket('ws://localhost:9234/test-session');
      let requestTime: number;

      client.onopen = () => {
        requestTime = Date.now();
        client.send(
          JSON.stringify({
            id: 1,
            method: 'Debugger.enable',
          }),
        );
      };

      client.onmessage = (event) => {
        const elapsed = Date.now() - requestTime;
        expect(elapsed).toBeGreaterThanOrEqual(100);
        client.close();
        done();
      };
    });

    it('should auto-emit events on connection', (done) => {
      mockServer = new MockInspectorServer({
        url: 'ws://localhost:9235/test-session',
        autoEmitEvents: [
          mockCDPEvents.scriptParsed('script-1', 'file:///test.js'),
          mockCDPEvents.paused(),
        ],
      });

      const client = new WebSocket('ws://localhost:9235/test-session');
      const events: any[] = [];

      client.onmessage = (event) => {
        const message = JSON.parse(event.data as string);
        if (message.method) {
          events.push(message);
          if (events.length === 2) {
            expect(events[0].method).toBe('Debugger.scriptParsed');
            expect(events[1].method).toBe('Debugger.paused');
            client.close();
            done();
          }
        }
      };
    });
  });

  describe('createMockInspectorServer', () => {
    let mockServer: MockInspectorServer | null = null;

    afterEach(() => {
      if (mockServer) {
        mockServer.close();
        mockServer = null;
      }
    });

    it('should create basic scenario server', () => {
      mockServer = createMockInspectorServer('basic');
      expect(mockServer).toBeDefined();
    });

    it('should create breakpoint scenario server', () => {
      mockServer = createMockInspectorServer('breakpoint');
      expect(mockServer).toBeDefined();
    });

    it('should create error scenario server', () => {
      mockServer = createMockInspectorServer('error');
      expect(mockServer).toBeDefined();
    });

    it('should create timeout scenario server', () => {
      mockServer = createMockInspectorServer('timeout');
      expect(mockServer).toBeDefined();
    });

    it('should create custom scenario server', () => {
      mockServer = createMockInspectorServer('custom', {
        url: 'ws://localhost:9236/custom',
      });
      expect(mockServer).toBeDefined();
      expect(mockServer.getUrl()).toBe('ws://localhost:9236/custom');
    });
  });

  describe('CDP Event Fixtures', () => {
    it('should create scriptParsed event', () => {
      const event = mockCDPEvents.scriptParsed('script-1', 'file:///test.js');
      expect(event.method).toBe('Debugger.scriptParsed');
      expect(event.params.scriptId).toBe('script-1');
      expect(event.params.url).toBe('file:///test.js');
    });

    it('should create paused event', () => {
      const event = mockCDPEvents.paused();
      expect(event.method).toBe('Debugger.paused');
      expect(event.params.callFrames).toBeDefined();
      expect(event.params.reason).toBeDefined();
    });

    it('should create resumed event', () => {
      const event = mockCDPEvents.resumed();
      expect(event.method).toBe('Debugger.resumed');
    });

    it('should create breakpointResolved event', () => {
      const event = mockCDPEvents.breakpointResolved('bp-1', {
        scriptId: 'script-1',
        lineNumber: 10,
      });
      expect(event.method).toBe('Debugger.breakpointResolved');
      expect(event.params.breakpointId).toBe('bp-1');
    });

    it('should create consoleAPICalled event', () => {
      const event = mockCDPEvents.consoleAPICalled('log', [
        { type: 'string', value: 'test' },
      ]);
      expect(event.method).toBe('Runtime.consoleAPICalled');
      expect(event.params.type).toBe('log');
    });

    it('should create exceptionThrown event', () => {
      const event = mockCDPEvents.exceptionThrown();
      expect(event.method).toBe('Runtime.exceptionThrown');
      expect(event.params.exceptionDetails).toBeDefined();
    });
  });

  describe('CDP Response Fixtures', () => {
    it('should have Debugger.enable response', () => {
      expect(mockCDPResponses['Debugger.enable']).toBeDefined();
      expect(mockCDPResponses['Debugger.enable'].debuggerId).toBeDefined();
    });

    it('should have Runtime.enable response', () => {
      expect(mockCDPResponses['Runtime.enable']).toBeDefined();
    });

    it('should have setBreakpointByUrl response', () => {
      const response = mockCDPResponses['Debugger.setBreakpointByUrl'];
      expect(response.breakpointId).toBeDefined();
      expect(response.locations).toBeDefined();
    });

    it('should have evaluate response', () => {
      const response = mockCDPResponses['Runtime.evaluate'];
      expect(response.result).toBeDefined();
      expect(response.result.type).toBe('number');
    });

    it('should have getProperties response', () => {
      const response = mockCDPResponses['Runtime.getProperties'];
      expect(response.result).toBeInstanceOf(Array);
      expect(response.result.length).toBeGreaterThan(0);
    });
  });

  describe('waitForCondition', () => {
    it('should resolve when condition becomes true', async () => {
      let value = false;
      setTimeout(() => {
        value = true;
      }, 50);

      const result = await waitForCondition(() => value, 1000, 10);
      expect(result).toBe(true);
    });

    it('should timeout when condition never becomes true', async () => {
      const result = await waitForCondition(() => false, 100, 10);
      expect(result).toBe(false);
    });

    it('should resolve immediately if condition is already true', async () => {
      const startTime = Date.now();
      const result = await waitForCondition(() => true, 1000, 10);
      const elapsed = Date.now() - startTime;

      expect(result).toBe(true);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
