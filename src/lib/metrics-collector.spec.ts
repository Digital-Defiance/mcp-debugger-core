import { MetricsCollector, MetricType } from './metrics-collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('Session Metrics', () => {
    it('should track session start', () => {
      collector.recordSessionStart('session-1');

      const metrics = collector.getMetricsByType(MetricType.SESSION_COUNT);
      expect(metrics.length).toBe(1);
      expect(metrics[0].labels?.action).toBe('start');
    });

    it('should track session end and calculate duration', () => {
      collector.recordSessionStart('session-1');

      // Wait a bit
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Busy wait
      }

      collector.recordSessionEnd('session-1');

      const durationMetrics = collector.getMetricsByType(
        MetricType.SESSION_DURATION,
      );
      expect(durationMetrics.length).toBe(1);
      expect(durationMetrics[0].value).toBeGreaterThan(0);
      expect(durationMetrics[0].labels?.sessionId).toBe('session-1');

      const countMetrics = collector.getMetricsByType(MetricType.SESSION_COUNT);
      expect(countMetrics.length).toBe(2); // start and end
    });

    it('should track multiple sessions', () => {
      collector.recordSessionStart('session-1');
      collector.recordSessionStart('session-2');
      collector.recordSessionStart('session-3');

      expect(collector.getActiveSessionCount()).toBe(3);

      collector.recordSessionEnd('session-1');
      expect(collector.getActiveSessionCount()).toBe(2);

      collector.recordSessionEnd('session-2');
      collector.recordSessionEnd('session-3');
      expect(collector.getActiveSessionCount()).toBe(0);
    });

    it('should handle session end without start gracefully', () => {
      collector.recordSessionEnd('nonexistent-session');

      const durationMetrics = collector.getMetricsByType(
        MetricType.SESSION_DURATION,
      );
      expect(durationMetrics.length).toBe(0);
    });
  });

  describe('Breakpoint Metrics', () => {
    it('should track breakpoint hits', () => {
      collector.recordBreakpointHit('bp-1');
      collector.recordBreakpointHit('bp-1');
      collector.recordBreakpointHit('bp-2');

      expect(collector.getBreakpointHitCount('bp-1')).toBe(2);
      expect(collector.getBreakpointHitCount('bp-2')).toBe(1);
    });

    it('should track breakpoint hits with session ID', () => {
      collector.recordBreakpointHit('bp-1', 'session-1');

      const metrics = collector.getMetricsByType(MetricType.BREAKPOINT_HIT);
      expect(metrics.length).toBe(1);
      expect(metrics[0].labels?.breakpointId).toBe('bp-1');
      expect(metrics[0].labels?.sessionId).toBe('session-1');
    });

    it('should return all breakpoint hit counts', () => {
      collector.recordBreakpointHit('bp-1');
      collector.recordBreakpointHit('bp-1');
      collector.recordBreakpointHit('bp-2');
      collector.recordBreakpointHit('bp-3');

      const counts = collector.getAllBreakpointHitCounts();
      expect(counts.size).toBe(3);
      expect(counts.get('bp-1')).toBe(2);
      expect(counts.get('bp-2')).toBe(1);
      expect(counts.get('bp-3')).toBe(1);
    });

    it('should return 0 for breakpoint with no hits', () => {
      expect(collector.getBreakpointHitCount('nonexistent')).toBe(0);
    });
  });

  describe('Operation Latency Metrics', () => {
    it('should track operation latency', () => {
      collector.startOperation('op-1', 'debugger_start');

      // Wait a bit
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Busy wait
      }

      collector.endOperation('op-1', 'debugger_start', true);

      const metrics = collector.getMetricsByType(MetricType.OPERATION_LATENCY);
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBeGreaterThan(0);
      expect(metrics[0].labels?.operationType).toBe('debugger_start');
      expect(metrics[0].labels?.success).toBe('true');
    });

    it('should track failed operations', () => {
      collector.startOperation('op-1', 'debugger_continue');
      collector.endOperation('op-1', 'debugger_continue', false);

      const latencyMetrics = collector.getMetricsByType(
        MetricType.OPERATION_LATENCY,
      );
      expect(latencyMetrics[0].labels?.success).toBe('false');

      const errorMetrics = collector.getMetricsByType(MetricType.ERROR_RATE);
      expect(errorMetrics.length).toBe(1);
    });

    it('should handle operation end without start gracefully', () => {
      collector.endOperation('nonexistent-op', 'debugger_pause', true);

      const metrics = collector.getMetricsByType(MetricType.OPERATION_LATENCY);
      expect(metrics.length).toBe(0);
    });

    it('should track multiple operations', () => {
      collector.startOperation('op-1', 'debugger_start');
      collector.startOperation('op-2', 'debugger_continue');
      collector.startOperation('op-3', 'debugger_pause');

      collector.endOperation('op-1', 'debugger_start', true);
      collector.endOperation('op-2', 'debugger_continue', true);
      collector.endOperation('op-3', 'debugger_pause', true);

      const metrics = collector.getMetricsByType(MetricType.OPERATION_LATENCY);
      expect(metrics.length).toBe(3);
    });
  });

  describe('Error Metrics', () => {
    it('should track errors by type', () => {
      collector.recordError('SESSION_NOT_FOUND');
      collector.recordError('SESSION_NOT_FOUND');
      collector.recordError('BREAKPOINT_FAILED');

      expect(collector.getErrorCount('SESSION_NOT_FOUND')).toBe(2);
      expect(collector.getErrorCount('BREAKPOINT_FAILED')).toBe(1);
    });

    it('should return all error counts', () => {
      collector.recordError('ERROR_1');
      collector.recordError('ERROR_2');
      collector.recordError('ERROR_1');

      const counts = collector.getAllErrorCounts();
      expect(counts.size).toBe(2);
      expect(counts.get('ERROR_1')).toBe(2);
      expect(counts.get('ERROR_2')).toBe(1);
    });

    it('should calculate total error count', () => {
      collector.recordError('ERROR_1');
      collector.recordError('ERROR_2');
      collector.recordError('ERROR_3');
      collector.recordError('ERROR_1');

      expect(collector.getTotalErrorCount()).toBe(4);
    });

    it('should return 0 for error type with no occurrences', () => {
      expect(collector.getErrorCount('NONEXISTENT_ERROR')).toBe(0);
    });
  });

  describe('Metrics Retrieval', () => {
    beforeEach(() => {
      collector.recordSessionStart('session-1');
      collector.recordBreakpointHit('bp-1');
      collector.startOperation('op-1', 'test');
      collector.endOperation('op-1', 'test', true);
      collector.recordError('TEST_ERROR');
    });

    it('should return all metrics', () => {
      const metrics = collector.getAllMetrics();
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should filter metrics by type', () => {
      const sessionMetrics = collector.getMetricsByType(
        MetricType.SESSION_COUNT,
      );
      expect(sessionMetrics.length).toBeGreaterThan(0);
      expect(
        sessionMetrics.every((m) => m.type === MetricType.SESSION_COUNT),
      ).toBe(true);
    });

    it('should filter metrics by time range', () => {
      const now = Date.now();
      const startTime = now - 1000;
      const endTime = now + 1000;

      const metrics = collector.getMetricsInRange(startTime, endTime);
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should return empty array for time range with no metrics', () => {
      const futureStart = Date.now() + 10000;
      const futureEnd = futureStart + 1000;

      const metrics = collector.getMetricsInRange(futureStart, futureEnd);
      expect(metrics.length).toBe(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      // Add some test data
      collector.startOperation('op-1', 'test');
      collector.endOperation('op-1', 'test', true);

      collector.startOperation('op-2', 'test');
      collector.endOperation('op-2', 'test', true);

      collector.startOperation('op-3', 'test');
      collector.endOperation('op-3', 'test', true);
    });

    it('should calculate summary statistics', () => {
      const summary = collector.getSummary();

      expect(summary[MetricType.OPERATION_LATENCY]).toBeDefined();
      expect(summary[MetricType.OPERATION_LATENCY].count).toBe(3);
      expect(summary[MetricType.OPERATION_LATENCY].avg).toBeGreaterThanOrEqual(
        0,
      );
      expect(summary[MetricType.OPERATION_LATENCY].min).toBeGreaterThanOrEqual(
        0,
      );
      expect(summary[MetricType.OPERATION_LATENCY].max).toBeGreaterThanOrEqual(
        summary[MetricType.OPERATION_LATENCY].min,
      );
    });

    it('should calculate percentiles', () => {
      const summary = collector.getSummary();
      const stats = summary[MetricType.OPERATION_LATENCY];

      expect(stats.p50).toBeDefined();
      expect(stats.p95).toBeDefined();
      expect(stats.p99).toBeDefined();
    });

    it('should handle empty metrics gracefully', () => {
      const emptyCollector = new MetricsCollector();
      const summary = emptyCollector.getSummary();

      expect(Object.keys(summary).length).toBe(0);
    });
  });

  describe('Export and Endpoint', () => {
    beforeEach(() => {
      collector.recordSessionStart('session-1');
      collector.recordBreakpointHit('bp-1');
      collector.recordError('TEST_ERROR');
    });

    it('should export all metrics data', () => {
      const exported = collector.exportMetrics();

      expect(exported.metrics).toBeDefined();
      expect(exported.summary).toBeDefined();
      expect(exported.activeSessionCount).toBe(1);
      expect(exported.breakpointHitCounts).toBeDefined();
      expect(exported.errorCounts).toBeDefined();
      expect(exported.totalErrors).toBe(1);
    });

    it('should provide metrics endpoint data as JSON string', () => {
      const endpointData = collector.getMetricsEndpointData();

      expect(() => JSON.parse(endpointData)).not.toThrow();

      const parsed = JSON.parse(endpointData);
      expect(parsed.metrics).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });
  });

  describe('Memory Management', () => {
    it('should limit metrics size to prevent memory issues', () => {
      // Add more than max size (10000)
      for (let i = 0; i < 10100; i++) {
        collector.recordError('TEST_ERROR');
      }

      const metrics = collector.getAllMetrics();
      expect(metrics.length).toBe(10000);
    });
  });

  describe('Clear Metrics', () => {
    beforeEach(() => {
      collector.recordSessionStart('session-1');
      collector.recordBreakpointHit('bp-1');
      collector.recordError('TEST_ERROR');
    });

    it('should clear all metrics and counters', () => {
      expect(collector.getAllMetrics().length).toBeGreaterThan(0);
      expect(collector.getActiveSessionCount()).toBe(1);
      expect(collector.getBreakpointHitCount('bp-1')).toBe(1);
      expect(collector.getTotalErrorCount()).toBe(1);

      collector.clearMetrics();

      expect(collector.getAllMetrics().length).toBe(0);
      expect(collector.getActiveSessionCount()).toBe(0);
      expect(collector.getBreakpointHitCount('bp-1')).toBe(0);
      expect(collector.getTotalErrorCount()).toBe(0);
    });
  });
});
