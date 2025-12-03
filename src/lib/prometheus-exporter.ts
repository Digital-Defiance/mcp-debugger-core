/**
 * Prometheus Metrics Exporter
 * Exports metrics in Prometheus format
 */

export interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  value: number;
  labels?: Record<string, string>;
}

export class PrometheusExporter {
  private metrics = new Map<string, PrometheusMetric>();

  /**
   * Register a counter metric
   * @param name Metric name
   * @param help Help text
   * @param labels Optional labels
   */
  registerCounter(
    name: string,
    help: string,
    labels?: Record<string, string>,
  ): void {
    const key = this.getMetricKey(name, labels);
    this.metrics.set(key, {
      name,
      type: 'counter',
      help,
      value: 0,
      labels,
    });
  }

  /**
   * Increment a counter
   * @param name Metric name
   * @param value Increment value (default: 1)
   * @param labels Optional labels
   */
  incrementCounter(
    name: string,
    value = 1,
    labels?: Record<string, string>,
  ): void {
    const key = this.getMetricKey(name, labels);
    const metric = this.metrics.get(key);

    if (!metric) {
      this.registerCounter(name, '', labels);
      const newMetric = this.metrics.get(key)!;
      newMetric.value = value;
    } else {
      metric.value += value;
    }
  }

  /**
   * Register a gauge metric
   * @param name Metric name
   * @param help Help text
   * @param labels Optional labels
   */
  registerGauge(
    name: string,
    help: string,
    labels?: Record<string, string>,
  ): void {
    const key = this.getMetricKey(name, labels);
    this.metrics.set(key, {
      name,
      type: 'gauge',
      help,
      value: 0,
      labels,
    });
  }

  /**
   * Set a gauge value
   * @param name Metric name
   * @param value Gauge value
   * @param labels Optional labels
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const metric = this.metrics.get(key);

    if (!metric) {
      this.registerGauge(name, '', labels);
      const newMetric = this.metrics.get(key)!;
      newMetric.value = value;
    } else {
      metric.value = value;
    }
  }

  /**
   * Increment a gauge
   * @param name Metric name
   * @param value Increment value (default: 1)
   * @param labels Optional labels
   */
  incrementGauge(
    name: string,
    value = 1,
    labels?: Record<string, string>,
  ): void {
    const key = this.getMetricKey(name, labels);
    const metric = this.metrics.get(key);

    if (!metric) {
      this.registerGauge(name, '', labels);
      const newMetric = this.metrics.get(key)!;
      newMetric.value = value;
    } else {
      metric.value += value;
    }
  }

  /**
   * Decrement a gauge
   * @param name Metric name
   * @param value Decrement value (default: 1)
   * @param labels Optional labels
   */
  decrementGauge(
    name: string,
    value = 1,
    labels?: Record<string, string>,
  ): void {
    this.incrementGauge(name, -value, labels);
  }

  /**
   * Get metric key with labels
   */
  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  /**
   * Format labels for Prometheus
   */
  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `{${labelStr}}`;
  }

  /**
   * Export metrics in Prometheus format
   * @returns Metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];
    const metricsByName = new Map<string, PrometheusMetric[]>();

    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }

    // Format each metric group
    for (const [name, metrics] of metricsByName.entries()) {
      const firstMetric = metrics[0];

      // Add HELP line
      if (firstMetric.help) {
        lines.push(`# HELP ${name} ${firstMetric.help}`);
      }

      // Add TYPE line
      lines.push(`# TYPE ${name} ${firstMetric.type}`);

      // Add metric values
      for (const metric of metrics) {
        const labels = this.formatLabels(metric.labels);
        lines.push(`${name}${labels} ${metric.value}`);
      }

      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Get all metrics
   * @returns Map of all metrics
   */
  getMetrics(): Map<string, PrometheusMetric> {
    return new Map(this.metrics);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
  }

  /**
   * Remove a metric
   * @param name Metric name
   * @param labels Optional labels
   */
  removeMetric(name: string, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    this.metrics.delete(key);
  }
}

/**
 * Global Prometheus exporter instance
 */
export const prometheusExporter = new PrometheusExporter();

/**
 * Initialize standard debugging metrics
 */
export function initializeDebuggerMetrics(exporter: PrometheusExporter): void {
  // Session metrics
  exporter.registerCounter(
    'debugger_sessions_total',
    'Total number of debug sessions created',
  );
  exporter.registerGauge(
    'debugger_sessions_active',
    'Number of currently active debug sessions',
  );
  exporter.registerCounter(
    'debugger_sessions_failed',
    'Total number of failed debug sessions',
  );

  // Breakpoint metrics
  exporter.registerCounter(
    'debugger_breakpoints_set_total',
    'Total number of breakpoints set',
  );
  exporter.registerGauge(
    'debugger_breakpoints_active',
    'Number of currently active breakpoints',
  );

  // Operation metrics
  exporter.registerCounter(
    'debugger_operations_total',
    'Total number of debugging operations',
  );
  exporter.registerCounter(
    'debugger_operations_failed',
    'Total number of failed debugging operations',
  );

  // Performance metrics
  exporter.registerCounter(
    'debugger_operation_duration_seconds',
    'Duration of debugging operations in seconds',
  );

  // Error metrics
  exporter.registerCounter('debugger_errors_total', 'Total number of errors');
}
