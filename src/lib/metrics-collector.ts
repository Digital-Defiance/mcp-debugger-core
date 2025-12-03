/**
 * Metric types for tracking different aspects of the debugger
 */
export enum MetricType {
  SESSION_DURATION = "session_duration",
  SESSION_COUNT = "session_count",
  BREAKPOINT_HIT = "breakpoint_hit",
  OPERATION_LATENCY = "operation_latency",
  ERROR_RATE = "error_rate",
}

/**
 * Metric entry for tracking
 */
export interface MetricEntry {
  type: MetricType;
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

/**
 * Aggregated metric statistics
 */
export interface MetricStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

/**
 * Metrics summary by type
 */
export interface MetricsSummary {
  [key: string]: MetricStats;
}

/**
 * Metrics collector for enterprise observability
 * Tracks session metrics, operation latencies, and error rates
 */
export class MetricsCollector {
  private metrics: MetricEntry[] = [];
  private sessionStartTimes = new Map<string, number>();
  private breakpointHitCounts = new Map<string, number>();
  private operationStartTimes = new Map<string, number>();
  private errorCounts = new Map<string, number>();
  private readonly maxMetricsSize = 10000;

  /**
   * Record a session start
   */
  recordSessionStart(sessionId: string): void {
    this.sessionStartTimes.set(sessionId, Date.now());
    this.recordMetric(MetricType.SESSION_COUNT, 1, { action: "start" });
  }

  /**
   * Record a session end and calculate duration
   */
  recordSessionEnd(sessionId: string): void {
    const startTime = this.sessionStartTimes.get(sessionId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.recordMetric(MetricType.SESSION_DURATION, duration, { sessionId });
      this.sessionStartTimes.delete(sessionId);
    }
    this.recordMetric(MetricType.SESSION_COUNT, 1, { action: "end" });
  }

  /**
   * Record a breakpoint hit
   */
  recordBreakpointHit(breakpointId: string, sessionId?: string): void {
    const currentCount = this.breakpointHitCounts.get(breakpointId) || 0;
    this.breakpointHitCounts.set(breakpointId, currentCount + 1);

    const labels: Record<string, string> = { breakpointId };
    if (sessionId) {
      labels["sessionId"] = sessionId;
    }

    this.recordMetric(MetricType.BREAKPOINT_HIT, 1, labels);
  }

  /**
   * Start tracking an operation
   */
  startOperation(operationId: string, operationType: string): void {
    this.operationStartTimes.set(operationId, Date.now());
  }

  /**
   * End tracking an operation and record latency
   */
  endOperation(
    operationId: string,
    operationType: string,
    success: boolean = true
  ): void {
    const startTime = this.operationStartTimes.get(operationId);
    if (startTime) {
      const latency = Date.now() - startTime;
      this.recordMetric(MetricType.OPERATION_LATENCY, latency, {
        operationType,
        success: success.toString(),
      });
      this.operationStartTimes.delete(operationId);
    }

    if (!success) {
      this.recordError(operationType);
    }
  }

  /**
   * Record an error
   */
  recordError(errorType: string): void {
    const currentCount = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, currentCount + 1);
    this.recordMetric(MetricType.ERROR_RATE, 1, { errorType });
  }

  /**
   * Record a generic metric
   */
  private recordMetric(
    type: MetricType,
    value: number,
    labels?: Record<string, string>
  ): void {
    const entry: MetricEntry = {
      type,
      timestamp: Date.now(),
      value,
      labels,
    };

    this.metrics.push(entry);

    // Limit metrics size to prevent memory issues
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics.shift();
    }
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): MetricEntry[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by type
   */
  getMetricsByType(type: MetricType): MetricEntry[] {
    return this.metrics.filter((m) => m.type === type);
  }

  /**
   * Get metrics within a time range
   */
  getMetricsInRange(startTime: number, endTime: number): MetricEntry[] {
    return this.metrics.filter(
      (m) => m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  /**
   * Calculate statistics for a set of metrics
   */
  private calculateStats(values: number[]): MetricStats {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);

    return {
      count: values.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get summary statistics for all metrics
   */
  getSummary(): MetricsSummary {
    const summary: MetricsSummary = {};

    // Group metrics by type
    const metricsByType = new Map<MetricType, number[]>();
    for (const metric of this.metrics) {
      if (!metricsByType.has(metric.type)) {
        metricsByType.set(metric.type, []);
      }
      metricsByType.get(metric.type)!.push(metric.value);
    }

    // Calculate stats for each type
    for (const [type, values] of metricsByType.entries()) {
      summary[type] = this.calculateStats(values);
    }

    return summary;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessionStartTimes.size;
  }

  /**
   * Get breakpoint hit count for a specific breakpoint
   */
  getBreakpointHitCount(breakpointId: string): number {
    return this.breakpointHitCounts.get(breakpointId) || 0;
  }

  /**
   * Get all breakpoint hit counts
   */
  getAllBreakpointHitCounts(): Map<string, number> {
    return new Map(this.breakpointHitCounts);
  }

  /**
   * Get error count for a specific error type
   */
  getErrorCount(errorType: string): number {
    return this.errorCounts.get(errorType) || 0;
  }

  /**
   * Get all error counts
   */
  getAllErrorCounts(): Map<string, number> {
    return new Map(this.errorCounts);
  }

  /**
   * Get total error count
   */
  getTotalErrorCount(): number {
    let total = 0;
    for (const count of this.errorCounts.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.sessionStartTimes.clear();
    this.breakpointHitCounts.clear();
    this.operationStartTimes.clear();
    this.errorCounts.clear();
  }

  /**
   * Export metrics in a format suitable for external monitoring systems
   */
  exportMetrics(): {
    metrics: MetricEntry[];
    summary: MetricsSummary;
    activeSessionCount: number;
    breakpointHitCounts: Record<string, number>;
    errorCounts: Record<string, number>;
    totalErrors: number;
  } {
    return {
      metrics: this.getAllMetrics(),
      summary: this.getSummary(),
      activeSessionCount: this.getActiveSessionCount(),
      breakpointHitCounts: Object.fromEntries(this.breakpointHitCounts),
      errorCounts: Object.fromEntries(this.errorCounts),
      totalErrors: this.getTotalErrorCount(),
    };
  }

  /**
   * Get metrics endpoint data (for HTTP endpoint)
   */
  getMetricsEndpointData(): string {
    const data = this.exportMetrics();
    return JSON.stringify(data, null, 2);
  }
}
