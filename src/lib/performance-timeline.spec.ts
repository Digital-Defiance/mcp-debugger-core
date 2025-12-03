import {
  PerformanceTimeline,
  PerformanceEventType,
  PerformanceEvent,
} from './performance-timeline';
import { InspectorClient } from './inspector-client';
import { EventEmitter } from 'events';

describe('PerformanceTimeline', () => {
  let mockInspector: jest.Mocked<InspectorClient>;
  let timeline: PerformanceTimeline;

  beforeEach(() => {
    mockInspector = Object.assign(new EventEmitter(), {
      send: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    }) as any;

    // Make the real on/off/emit work for event handling
    mockInspector.on = EventEmitter.prototype.on.bind(mockInspector);
    mockInspector.off = EventEmitter.prototype.off.bind(mockInspector);
    mockInspector.emit = EventEmitter.prototype.emit.bind(mockInspector);

    timeline = new PerformanceTimeline(mockInspector);
  });

  describe('startRecording', () => {
    it('should start recording performance events', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      expect(mockInspector.send).toHaveBeenCalledWith('Runtime.enable');
      expect(mockInspector.send).toHaveBeenCalledWith('Profiler.enable');
      expect(timeline.isRecording()).toBe(true);
    });

    it('should throw error if already recording', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      await expect(timeline.startRecording()).rejects.toThrow(
        'Performance recording is already active',
      );
    });

    it('should clear previous data when starting', async () => {
      mockInspector.send.mockResolvedValue({});

      // Record some events
      await timeline.startRecording();
      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'test',
        startTime: 0,
        endTime: 100,
        duration: 100,
      });
      await timeline.stopRecording();

      // Start again
      await timeline.startRecording();

      expect(timeline.getEvents()).toHaveLength(0);
    });
  });

  describe('stopRecording', () => {
    it('should stop recording and return report', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();
      const report = await timeline.stopRecording();

      expect(mockInspector.send).toHaveBeenCalledWith('Profiler.disable');
      expect(timeline.isRecording()).toBe(false);
      expect(report).toBeDefined();
      expect(report.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should throw error if not recording', async () => {
      await expect(timeline.stopRecording()).rejects.toThrow(
        'Performance recording is not active',
      );
    });
  });

  describe('recordEvent', () => {
    it('should record events when recording is active', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      const event: PerformanceEvent = {
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'testFunction',
        startTime: 1000,
        endTime: 1100,
        duration: 100,
        details: { file: 'test.js', line: 10 },
      };

      timeline.recordEvent(event);

      expect(timeline.getEvents()).toHaveLength(1);
      expect(timeline.getEvents()[0]).toEqual(event);
    });

    it('should not record events when not recording', () => {
      const event: PerformanceEvent = {
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'testFunction',
        startTime: 1000,
        endTime: 1100,
        duration: 100,
      };

      timeline.recordEvent(event);

      expect(timeline.getEvents()).toHaveLength(0);
    });

    it('should track function timings for function call events', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'myFunc',
        startTime: 1000,
        endTime: 1100,
        duration: 100,
        details: { file: 'test.js', line: 10 },
      });

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'myFunc',
        startTime: 2000,
        endTime: 2150,
        duration: 150,
        details: { file: 'test.js', line: 10 },
      });

      const timings = timeline.getFunctionTimings();
      expect(timings).toHaveLength(1);
      expect(timings[0].functionName).toBe('myFunc');
      expect(timings[0].callCount).toBe(2);
      expect(timings[0].totalTime).toBe(250);
      expect(timings[0].averageTime).toBe(125);
      expect(timings[0].minTime).toBe(100);
      expect(timings[0].maxTime).toBe(150);
    });

    it('should not track function timings for events without details', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'myFunc',
        startTime: 1000,
        endTime: 1100,
        duration: 100,
      });

      const timings = timeline.getFunctionTimings();
      expect(timings).toHaveLength(0);
    });
  });

  describe('recordFunctionCall', () => {
    it('should record a function call with timing', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordFunctionCall('testFunc', 'test.js', 20, 50000); // 50ms in microseconds

      const events = timeline.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(PerformanceEventType.FUNCTION_CALL);
      expect(events[0].name).toBe('testFunc');
      expect(events[0].duration).toBe(50);
      expect(events[0].details?.file).toBe('test.js');
      expect(events[0].details?.line).toBe(20);
    });
  });

  describe('recordGarbageCollection', () => {
    it('should record a garbage collection event', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordGarbageCollection(30000); // 30ms in microseconds

      const events = timeline.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(PerformanceEventType.GARBAGE_COLLECTION);
      expect(events[0].name).toBe('GC');
      expect(events[0].duration).toBe(30);
    });
  });

  describe('generateReport', () => {
    it('should generate a basic report', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'func1',
        startTime: 1000,
        endTime: 1050,
        duration: 50,
        details: { file: 'test.js', line: 10 },
      });

      const report = await timeline.stopRecording();

      expect(report.eventCount).toBe(1);
      expect(report.events).toHaveLength(1);
      expect(report.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should identify slow operations (>100ms)', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'slowFunc',
        startTime: 1000,
        endTime: 1250,
        duration: 250,
        details: { file: 'test.js', line: 10 },
      });

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'fastFunc',
        startTime: 2000,
        endTime: 2050,
        duration: 50,
        details: { file: 'test.js', line: 20 },
      });

      const report = await timeline.stopRecording();

      expect(report.slowOperations).toHaveLength(1);
      expect(report.slowOperations[0].name).toBe('slowFunc');
      expect(report.slowOperations[0].duration).toBe(250);
    });

    it('should sort slow operations by duration', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'slow1',
        startTime: 1000,
        endTime: 1150,
        duration: 150,
      });

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'slow2',
        startTime: 2000,
        endTime: 2300,
        duration: 300,
      });

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'slow3',
        startTime: 3000,
        endTime: 3200,
        duration: 200,
      });

      const report = await timeline.stopRecording();

      expect(report.slowOperations).toHaveLength(3);
      expect(report.slowOperations[0].name).toBe('slow2');
      expect(report.slowOperations[1].name).toBe('slow3');
      expect(report.slowOperations[2].name).toBe('slow1');
    });

    it('should calculate GC statistics', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordGarbageCollection(20000); // 20ms
      timeline.recordGarbageCollection(30000); // 30ms
      timeline.recordGarbageCollection(15000); // 15ms

      const report = await timeline.stopRecording();

      expect(report.gcCount).toBe(3);
      expect(report.gcTime).toBe(65); // 20 + 30 + 15
    });

    it('should include function timings in report', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordFunctionCall('func1', 'test.js', 10, 100000); // 100ms
      timeline.recordFunctionCall('func2', 'test.js', 20, 50000); // 50ms
      timeline.recordFunctionCall('func1', 'test.js', 10, 80000); // 80ms

      const report = await timeline.stopRecording();

      expect(report.functionTimings).toHaveLength(2);
      expect(report.functionTimings[0].functionName).toBe('func1');
      expect(report.functionTimings[0].totalTime).toBe(180);
      expect(report.functionTimings[1].functionName).toBe('func2');
    });

    it('should limit function timings to top 20', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      for (let i = 0; i < 30; i++) {
        timeline.recordFunctionCall(`func${i}`, 'test.js', i, (30 - i) * 1000);
      }

      const report = await timeline.stopRecording();

      expect(report.functionTimings.length).toBeLessThanOrEqual(20);
    });

    it('should handle empty timeline', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();
      const report = await timeline.stopRecording();

      expect(report.eventCount).toBe(0);
      expect(report.events).toHaveLength(0);
      expect(report.slowOperations).toHaveLength(0);
      expect(report.functionTimings).toHaveLength(0);
      expect(report.gcCount).toBe(0);
      expect(report.gcTime).toBe(0);
    });
  });

  describe('formatReport', () => {
    it('should format a basic report', () => {
      const report = {
        totalDuration: 1000,
        eventCount: 5,
        events: [],
        slowOperations: [],
        functionTimings: [],
        gcTime: 50,
        gcCount: 2,
      };

      const formatted = timeline.formatReport(report);

      expect(formatted).toContain('Performance Report');
      expect(formatted).toContain('Total Duration: 1000.00ms');
      expect(formatted).toContain('Total Events: 5');
      expect(formatted).toContain('GC Time: 50.00ms (2 collections)');
    });

    it('should format slow operations', () => {
      const report = {
        totalDuration: 1000,
        eventCount: 2,
        events: [],
        slowOperations: [
          {
            type: PerformanceEventType.FUNCTION_CALL,
            name: 'slowFunc',
            startTime: 1000,
            endTime: 1250,
            duration: 250,
            details: { file: 'test.js', line: 10 },
          },
          {
            type: PerformanceEventType.SCRIPT_EVALUATION,
            name: 'script',
            startTime: 2000,
            endTime: 2150,
            duration: 150,
          },
        ],
        functionTimings: [],
        gcTime: 0,
        gcCount: 0,
      };

      const formatted = timeline.formatReport(report);

      expect(formatted).toContain('Slow Operations (>100ms):');
      expect(formatted).toContain('250.00ms - slowFunc');
      expect(formatted).toContain('at test.js:10');
      expect(formatted).toContain('150.00ms - script');
    });

    it('should limit slow operations to top 10', () => {
      const slowOps = [];
      for (let i = 0; i < 15; i++) {
        slowOps.push({
          type: PerformanceEventType.FUNCTION_CALL,
          name: `func${i}`,
          startTime: i * 1000,
          endTime: i * 1000 + 200,
          duration: 200,
        });
      }

      const report = {
        totalDuration: 5000,
        eventCount: 15,
        events: [],
        slowOperations: slowOps,
        functionTimings: [],
        gcTime: 0,
        gcCount: 0,
      };

      const formatted = timeline.formatReport(report);

      const lines = formatted.split('\n');
      const slowOpLines = lines.filter((line) => line.includes('ms - func'));
      expect(slowOpLines.length).toBeLessThanOrEqual(10);
    });

    it('should format function timings', () => {
      const report = {
        totalDuration: 1000,
        eventCount: 3,
        events: [],
        slowOperations: [],
        functionTimings: [
          {
            functionName: 'func1',
            file: 'test.js',
            line: 10,
            callCount: 5,
            totalTime: 500,
            averageTime: 100,
            minTime: 80,
            maxTime: 120,
          },
          {
            functionName: 'func2',
            file: 'test.js',
            line: 20,
            callCount: 2,
            totalTime: 200,
            averageTime: 100,
            minTime: 90,
            maxTime: 110,
          },
        ],
        gcTime: 0,
        gcCount: 0,
      };

      const formatted = timeline.formatReport(report);

      expect(formatted).toContain('Top Functions by Total Time:');
      expect(formatted).toContain('500.00ms - func1 (5 calls, avg: 100.00ms)');
      expect(formatted).toContain('at test.js:10');
      expect(formatted).toContain('200.00ms - func2 (2 calls, avg: 100.00ms)');
    });

    it('should limit function timings to top 10', () => {
      const functionTimings = [];
      for (let i = 0; i < 15; i++) {
        functionTimings.push({
          functionName: `func${i}`,
          file: 'test.js',
          line: i,
          callCount: 1,
          totalTime: 100 - i,
          averageTime: 100 - i,
          minTime: 100 - i,
          maxTime: 100 - i,
        });
      }

      const report = {
        totalDuration: 1000,
        eventCount: 15,
        events: [],
        slowOperations: [],
        functionTimings,
        gcTime: 0,
        gcCount: 0,
      };

      const formatted = timeline.formatReport(report);

      const lines = formatted.split('\n');
      const funcLines = lines.filter((line) =>
        line.match(/^\s+\d+\.\d+ms - func/),
      );
      expect(funcLines.length).toBeLessThanOrEqual(10);
    });

    it('should handle report without file info', () => {
      const report = {
        totalDuration: 1000,
        eventCount: 1,
        events: [],
        slowOperations: [
          {
            type: PerformanceEventType.OTHER,
            name: 'operation',
            startTime: 1000,
            endTime: 1200,
            duration: 200,
          },
        ],
        functionTimings: [
          {
            functionName: 'func',
            file: '',
            line: 0,
            callCount: 1,
            totalTime: 100,
            averageTime: 100,
            minTime: 100,
            maxTime: 100,
          },
        ],
        gcTime: 0,
        gcCount: 0,
      };

      const formatted = timeline.formatReport(report);

      expect(formatted).toContain('200.00ms - operation');
      expect(formatted).toContain('100.00ms - func');
      // Should not crash when file is empty
    });
  });

  describe('handleConsoleAPI', () => {
    it('should record timeEnd events', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      // Simulate a console.timeEnd event
      mockInspector.emit('Runtime.consoleAPICalled', {
        type: 'timeEnd',
        args: [{ value: 'myTimer' }],
      });

      const events = timeline.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].name).toBe('myTimer');
    });

    it('should ignore console events when not recording', async () => {
      mockInspector.send.mockResolvedValue({});

      // Don't start recording
      mockInspector.emit('Runtime.consoleAPICalled', {
        type: 'timeEnd',
        args: [{ value: 'myTimer' }],
      });

      expect(timeline.getEvents()).toHaveLength(0);
    });

    it('should ignore non-timeEnd console events', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      mockInspector.emit('Runtime.consoleAPICalled', {
        type: 'log',
        args: [{ value: 'test' }],
      });

      expect(timeline.getEvents()).toHaveLength(0);
    });
  });

  describe('isRecording', () => {
    it('should return false initially', () => {
      expect(timeline.isRecording()).toBe(false);
    });

    it('should return true when recording', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      expect(timeline.isRecording()).toBe(true);
    });

    it('should return false after stopping', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();
      await timeline.stopRecording();

      expect(timeline.isRecording()).toBe(false);
    });
  });

  describe('getEvents', () => {
    it('should return empty array initially', () => {
      expect(timeline.getEvents()).toEqual([]);
    });

    it('should return all recorded events', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordEvent({
        type: PerformanceEventType.FUNCTION_CALL,
        name: 'func1',
        startTime: 1000,
        endTime: 1100,
        duration: 100,
      });

      timeline.recordEvent({
        type: PerformanceEventType.GARBAGE_COLLECTION,
        name: 'GC',
        startTime: 2000,
        endTime: 2050,
        duration: 50,
      });

      expect(timeline.getEvents()).toHaveLength(2);
    });
  });

  describe('clearEvents', () => {
    it('should clear all events and timings', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordFunctionCall('func1', 'test.js', 10, 100000);
      timeline.recordGarbageCollection(50000);

      expect(timeline.getEvents()).toHaveLength(2);
      expect(timeline.getFunctionTimings()).toHaveLength(1);

      timeline.clearEvents();

      expect(timeline.getEvents()).toHaveLength(0);
      expect(timeline.getFunctionTimings()).toHaveLength(0);
    });
  });

  describe('getFunctionTimings', () => {
    it('should return empty array initially', () => {
      expect(timeline.getFunctionTimings()).toEqual([]);
    });

    it('should return all function timings', async () => {
      mockInspector.send.mockResolvedValue({});

      await timeline.startRecording();

      timeline.recordFunctionCall('func1', 'test.js', 10, 100000);
      timeline.recordFunctionCall('func2', 'test.js', 20, 50000);

      const timings = timeline.getFunctionTimings();
      expect(timings).toHaveLength(2);
    });
  });
});
