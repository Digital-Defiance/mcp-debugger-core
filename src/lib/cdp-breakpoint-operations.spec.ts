import { CdpBreakpointOperations } from './cdp-breakpoint-operations';
import { InspectorClient } from './inspector-client';
import { Breakpoint, BreakpointType } from './debug-session';
import { EventEmitter } from 'events';

describe('CdpBreakpointOperations', () => {
  let mockInspector: jest.Mocked<InspectorClient>;
  let cdpOps: CdpBreakpointOperations;

  beforeEach(() => {
    // Create a mock inspector that extends EventEmitter
    mockInspector = Object.assign(new EventEmitter(), {
      send: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    }) as any;

    // Make the real on/emit work for script parsing
    mockInspector.on = EventEmitter.prototype.on.bind(mockInspector);
    mockInspector.emit = EventEmitter.prototype.emit.bind(mockInspector);

    cdpOps = new CdpBreakpointOperations(mockInspector);
  });

  describe('constructor', () => {
    it('should register script parsed event listener', () => {
      const newMockInspector = Object.assign(new EventEmitter(), {
        send: jest.fn(),
        on: jest.fn(),
      }) as any;

      new CdpBreakpointOperations(newMockInspector);

      expect(newMockInspector.on).toHaveBeenCalledWith(
        'Debugger.scriptParsed',
        expect.any(Function),
      );
    });

    it('should track scripts when scriptParsed events are emitted', () => {
      const scriptParams = {
        scriptId: 'script-123',
        url: 'file:///test/file.js',
      };

      mockInspector.emit('Debugger.scriptParsed', scriptParams);

      const scripts = cdpOps.getScripts();
      expect(scripts).toHaveLength(1);
      expect(scripts[0]).toEqual({
        scriptId: 'script-123',
        url: 'file:///test/file.js',
      });
    });

    it('should ignore scriptParsed events without url', () => {
      mockInspector.emit('Debugger.scriptParsed', { scriptId: 'script-123' });

      const scripts = cdpOps.getScripts();
      expect(scripts).toHaveLength(0);
    });

    it('should ignore scriptParsed events without scriptId', () => {
      mockInspector.emit('Debugger.scriptParsed', { url: 'file:///test.js' });

      const scripts = cdpOps.getScripts();
      expect(scripts).toHaveLength(0);
    });
  });

  describe('setBreakpoint', () => {
    it('should set a regular breakpoint by URL', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-1',
        file: '/test/file.js',
        line: 10,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-bp-1' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-bp-1');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        {
          lineNumber: 9, // 0-indexed
          url: 'file:///test/file.js',
          columnNumber: 0,
          condition: undefined,
        },
      );
    });

    it('should set a conditional breakpoint', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-2',
        file: '/test/file.js',
        line: 15,
        enabled: true,
        type: BreakpointType.REGULAR,
        condition: 'x > 10',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-bp-2' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-bp-2');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        {
          lineNumber: 14,
          url: 'file:///test/file.js',
          columnNumber: 0,
          condition: 'x > 10',
        },
      );
    });

    it('should fallback to setBreakpoint by scriptId if setBreakpointByUrl fails', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-3',
        file: '/test/file.js',
        line: 20,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      // Emit a script parsed event first
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-456',
        url: 'file:///test/file.js',
      });

      // First call fails, second succeeds
      mockInspector.send
        .mockRejectedValueOnce(new Error('URL not found'))
        .mockResolvedValueOnce({ breakpointId: 'cdp-bp-3' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-bp-3');
      expect(mockInspector.send).toHaveBeenCalledTimes(2);
      expect(mockInspector.send).toHaveBeenNthCalledWith(
        2,
        'Debugger.setBreakpoint',
        {
          location: {
            scriptId: 'script-456',
            lineNumber: 19,
            columnNumber: 0,
          },
          condition: undefined,
        },
      );
    });

    it('should return undefined if both setBreakpointByUrl and setBreakpoint fail', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-4',
        file: '/test/file.js',
        line: 25,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      // Emit a script parsed event
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-789',
        url: 'file:///test/file.js',
      });

      // Both calls fail
      mockInspector.send.mockRejectedValue(new Error('Failed'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return undefined if setBreakpointByUrl fails and no script found', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-5',
        file: '/test/unknown.js',
        line: 30,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      mockInspector.send.mockRejectedValue(new Error('URL not found'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should delegate to setLogpoint for logpoint breakpoints', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-6',
        file: '/test/file.js',
        line: 35,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'Value is {x}',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-bp-6' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-bp-6');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        expect.objectContaining({
          lineNumber: 34,
          url: 'file:///test/file.js',
          condition: expect.stringContaining('console.log'),
        }),
      );
    });

    it('should delegate to setFunctionBreakpoint for function breakpoints', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-7',
        file: '/test/file.js',
        line: 40,
        enabled: true,
        type: BreakpointType.FUNCTION,
        functionName: 'myFunction',
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Function breakpoints are not yet fully implemented',
        ),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('setLogpoint', () => {
    it('should return undefined if logMessage is missing', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-1',
        file: '/test/file.js',
        line: 10,
        enabled: true,
        type: BreakpointType.LOGPOINT,
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Logpoint requires a log message',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should create logpoint with simple message', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-2',
        file: '/test/file.js',
        line: 15,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'Hello World',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-lp-2' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-lp-2');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        {
          lineNumber: 14,
          url: 'file:///test/file.js',
          columnNumber: 0,
          condition: 'console.log("Hello World"), false',
        },
      );
    });

    it('should create logpoint with variable interpolation', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-3',
        file: '/test/file.js',
        line: 20,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'Value is {x}',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-lp-3' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-lp-3');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        {
          lineNumber: 19,
          url: 'file:///test/file.js',
          columnNumber: 0,
          condition: 'console.log("Value is %s", x), false',
        },
      );
    });

    it('should create logpoint with multiple variables', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-4',
        file: '/test/file.js',
        line: 25,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'x={x}, y={y}',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-lp-4' });

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBe('cdp-lp-4');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        {
          lineNumber: 24,
          url: 'file:///test/file.js',
          columnNumber: 0,
          condition: 'console.log("x=%s, y=%s", x, y), false',
        },
      );
    });

    it('should handle logpoint creation failure', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-5',
        file: '/test/file.js',
        line: 30,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'Test',
      };

      mockInspector.send.mockRejectedValue(new Error('Failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('setFunctionBreakpoint', () => {
    it('should return undefined if functionName is missing', async () => {
      const breakpoint: Breakpoint = {
        id: 'fb-1',
        file: '/test/file.js',
        line: 10,
        enabled: true,
        type: BreakpointType.FUNCTION,
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Function breakpoint requires a function name',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should return undefined with warning for function breakpoints', async () => {
      const breakpoint: Breakpoint = {
        id: 'fb-2',
        file: '/test/file.js',
        line: 15,
        enabled: true,
        type: BreakpointType.FUNCTION,
        functionName: 'testFunc',
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await cdpOps.setBreakpoint(breakpoint);

      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Function breakpoints are not yet fully implemented in CDP operations',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('removeBreakpoint', () => {
    it('should remove a breakpoint successfully', async () => {
      mockInspector.send.mockResolvedValue({});

      const result = await cdpOps.removeBreakpoint('cdp-bp-1');

      expect(result).toBe(true);
      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.removeBreakpoint',
        {
          breakpointId: 'cdp-bp-1',
        },
      );
    });

    it('should return false if removal fails', async () => {
      mockInspector.send.mockRejectedValue(new Error('Failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cdpOps.removeBreakpoint('cdp-bp-2');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('findScriptByFile', () => {
    beforeEach(() => {
      // Add some scripts
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-1',
        url: 'file:///absolute/path/to/file.js',
      });
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-2',
        url: 'file:///another/test.js',
      });
    });

    it('should find script by exact file path match', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-1',
        file: '/absolute/path/to/file.js',
        line: 10,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      // Force fallback to scriptId lookup
      mockInspector.send
        .mockRejectedValueOnce(new Error('URL not found'))
        .mockResolvedValueOnce({ breakpointId: 'cdp-bp-1' });

      await cdpOps.setBreakpoint(breakpoint);

      expect(mockInspector.send).toHaveBeenNthCalledWith(
        2,
        'Debugger.setBreakpoint',
        expect.objectContaining({
          location: expect.objectContaining({
            scriptId: 'script-1',
          }),
        }),
      );
    });

    it('should find script by filename match', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-2',
        file: 'test.js',
        line: 15,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      mockInspector.send
        .mockRejectedValueOnce(new Error('URL not found'))
        .mockResolvedValueOnce({ breakpointId: 'cdp-bp-2' });

      await cdpOps.setBreakpoint(breakpoint);

      expect(mockInspector.send).toHaveBeenNthCalledWith(
        2,
        'Debugger.setBreakpoint',
        expect.objectContaining({
          location: expect.objectContaining({
            scriptId: 'script-2',
          }),
        }),
      );
    });

    it('should find script by partial path match', async () => {
      const breakpoint: Breakpoint = {
        id: 'bp-3',
        file: 'path/to/file.js',
        line: 20,
        enabled: true,
        type: BreakpointType.REGULAR,
      };

      mockInspector.send
        .mockRejectedValueOnce(new Error('URL not found'))
        .mockResolvedValueOnce({ breakpointId: 'cdp-bp-3' });

      await cdpOps.setBreakpoint(breakpoint);

      expect(mockInspector.send).toHaveBeenNthCalledWith(
        2,
        'Debugger.setBreakpoint',
        expect.objectContaining({
          location: expect.objectContaining({
            scriptId: 'script-1',
          }),
        }),
      );
    });
  });

  describe('getScripts', () => {
    it('should return empty array initially', () => {
      const scripts = cdpOps.getScripts();
      expect(scripts).toEqual([]);
    });

    it('should return all tracked scripts', () => {
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-1',
        url: 'file:///test1.js',
      });
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-2',
        url: 'file:///test2.js',
      });

      const scripts = cdpOps.getScripts();
      expect(scripts).toHaveLength(2);
      expect(scripts).toContainEqual({
        scriptId: 'script-1',
        url: 'file:///test1.js',
      });
      expect(scripts).toContainEqual({
        scriptId: 'script-2',
        url: 'file:///test2.js',
      });
    });
  });

  describe('clearScripts', () => {
    it('should clear all tracked scripts', () => {
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-1',
        url: 'file:///test1.js',
      });
      mockInspector.emit('Debugger.scriptParsed', {
        scriptId: 'script-2',
        url: 'file:///test2.js',
      });

      expect(cdpOps.getScripts()).toHaveLength(2);

      cdpOps.clearScripts();

      expect(cdpOps.getScripts()).toHaveLength(0);
    });
  });

  describe('createLogpointCondition', () => {
    it('should handle variables with spaces in braces', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-6',
        file: '/test/file.js',
        line: 35,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'Value is { x }',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-lp-6' });

      await cdpOps.setBreakpoint(breakpoint);

      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        expect.objectContaining({
          condition: 'console.log("Value is %s", x), false',
        }),
      );
    });

    it('should handle complex expressions in braces', async () => {
      const breakpoint: Breakpoint = {
        id: 'lp-7',
        file: '/test/file.js',
        line: 40,
        enabled: true,
        type: BreakpointType.LOGPOINT,
        logMessage: 'Result: {obj.prop}',
      };

      mockInspector.send.mockResolvedValue({ breakpointId: 'cdp-lp-7' });

      await cdpOps.setBreakpoint(breakpoint);

      expect(mockInspector.send).toHaveBeenCalledWith(
        'Debugger.setBreakpointByUrl',
        expect.objectContaining({
          condition: 'console.log("Result: %s", obj.prop), false',
        }),
      );
    });
  });
});
