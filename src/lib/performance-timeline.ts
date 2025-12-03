import { InspectorClient } from "./inspector-client";

/**
 * Performance event types
 */
export enum PerformanceEventType {
  FUNCTION_CALL = "FunctionCall",
  SCRIPT_EVALUATION = "ScriptEvaluation",
  GARBAGE_COLLECTION = "GarbageCollection",
  COMPILE_SCRIPT = "CompileScript",
  PARSE_SCRIPT = "ParseScript",
  OTHER = "Other",
}

/**
 * Performance event recorded in the timeline
 */
export interface PerformanceEvent {
  type: PerformanceEventType;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  details?: Record<string, any>;
}

/**
 * Function execution timing
 */
export interface FunctionTiming {
  functionName: string;
  file: string;
  line: number;
  callCount: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
}

/**
 * Performance report with timeline analysis
 */
export interface PerformanceReport {
  totalDuration: number;
  eventCount: number;
  events: PerformanceEvent[];
  slowOperations: PerformanceEvent[];
  functionTimings: FunctionTiming[];
  gcTime: number;
  gcCount: number;
}

/**
 * Performance Timeline for recording and analyzing performance events
 * Tracks function execution times and identifies slow operations
 */
export class PerformanceTimeline {
  private inspector: InspectorClient;
  private recording = false;
  private events: PerformanceEvent[] = [];
  private startTime: number = 0;
  private functionTimings = new Map<
    string,
    {
      callCount: number;
      totalTime: number;
      minTime: number;
      maxTime: number;
      file: string;
      line: number;
    }
  >();

  constructor(inspector: InspectorClient) {
    this.inspector = inspector;
  }

  /**
   * Start recording performance events
   */
  async startRecording(): Promise<void> {
    if (this.recording) {
      throw new Error("Performance recording is already active");
    }

    // Clear previous data
    this.events = [];
    this.functionTimings.clear();
    this.startTime = Date.now();

    // Enable Runtime domain for console timing
    await this.inspector.send("Runtime.enable");

    // Enable Profiler domain for precise timing
    await this.inspector.send("Profiler.enable");

    // Set up event listeners
    this.inspector.on(
      "Runtime.consoleAPICalled",
      this.handleConsoleAPI.bind(this)
    );

    this.recording = true;
  }

  /**
   * Stop recording performance events
   * @returns Performance report
   */
  async stopRecording(): Promise<PerformanceReport> {
    if (!this.recording) {
      throw new Error("Performance recording is not active");
    }

    this.recording = false;

    // Remove event listeners
    this.inspector.off(
      "Runtime.consoleAPICalled",
      this.handleConsoleAPI.bind(this)
    );

    // Disable profiler
    await this.inspector.send("Profiler.disable");

    // Generate report
    return this.generateReport();
  }

  /**
   * Handle console API calls (for console.time/timeEnd)
   */
  private handleConsoleAPI(params: any): void {
    if (!this.recording) return;

    // Track console.time and console.timeEnd calls
    if (params.type === "timeEnd" && params.args && params.args.length > 0) {
      const label = params.args[0].value;
      // This would need more sophisticated tracking to match time/timeEnd pairs
      // For now, we just record the event
      this.recordEvent({
        type: PerformanceEventType.OTHER,
        name: label,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
      });
    }
  }

  /**
   * Record a performance event
   * @param event The event to record
   */
  recordEvent(event: PerformanceEvent): void {
    if (!this.recording) return;

    this.events.push(event);

    // Track function timings
    if (event.type === PerformanceEventType.FUNCTION_CALL && event.details) {
      const key = `${event.name}:${event.details["file"]}:${event.details["line"]}`;
      const existing = this.functionTimings.get(key);

      if (existing) {
        existing.callCount++;
        existing.totalTime += event.duration;
        existing.minTime = Math.min(existing.minTime, event.duration);
        existing.maxTime = Math.max(existing.maxTime, event.duration);
      } else {
        this.functionTimings.set(key, {
          callCount: 1,
          totalTime: event.duration,
          minTime: event.duration,
          maxTime: event.duration,
          file: event.details["file"] || "",
          line: event.details["line"] || 0,
        });
      }
    }
  }

  /**
   * Record a function call timing
   * @param functionName Name of the function
   * @param file File path
   * @param line Line number
   * @param duration Duration in microseconds
   */
  recordFunctionCall(
    functionName: string,
    file: string,
    line: number,
    duration: number
  ): void {
    const now = Date.now();
    this.recordEvent({
      type: PerformanceEventType.FUNCTION_CALL,
      name: functionName,
      startTime: now - duration / 1000,
      endTime: now,
      duration: duration / 1000, // Convert to milliseconds
      details: { file, line },
    });
  }

  /**
   * Record a garbage collection event
   * @param duration Duration in microseconds
   */
  recordGarbageCollection(duration: number): void {
    const now = Date.now();
    this.recordEvent({
      type: PerformanceEventType.GARBAGE_COLLECTION,
      name: "GC",
      startTime: now - duration / 1000,
      endTime: now,
      duration: duration / 1000, // Convert to milliseconds
    });
  }

  /**
   * Generate a performance report from recorded events
   * @returns Performance report
   */
  generateReport(): PerformanceReport {
    const totalDuration = Date.now() - this.startTime;

    // Identify slow operations (>100ms)
    const slowOperations = this.events
      .filter((event) => event.duration > 100)
      .sort((a, b) => b.duration - a.duration);

    // Calculate GC statistics
    const gcEvents = this.events.filter(
      (event) => event.type === PerformanceEventType.GARBAGE_COLLECTION
    );
    const gcTime = gcEvents.reduce((sum, event) => sum + event.duration, 0);
    const gcCount = gcEvents.length;

    // Convert function timings to array
    const functionTimings: FunctionTiming[] = Array.from(
      this.functionTimings.entries()
    ).map(([key, data]) => {
      const [functionName] = key.split(":");
      return {
        functionName,
        file: data.file,
        line: data.line,
        callCount: data.callCount,
        totalTime: data.totalTime,
        averageTime: data.totalTime / data.callCount,
        minTime: data.minTime,
        maxTime: data.maxTime,
      };
    });

    // Sort by total time
    functionTimings.sort((a, b) => b.totalTime - a.totalTime);

    return {
      totalDuration,
      eventCount: this.events.length,
      events: this.events,
      slowOperations,
      functionTimings: functionTimings.slice(0, 20), // Top 20
      gcTime,
      gcCount,
    };
  }

  /**
   * Format performance report as a human-readable string
   * @param report The performance report to format
   * @returns Formatted string
   */
  formatReport(report: PerformanceReport): string {
    const lines: string[] = [];

    lines.push("Performance Report");
    lines.push("==================");
    lines.push(`Total Duration: ${report.totalDuration.toFixed(2)}ms`);
    lines.push(`Total Events: ${report.eventCount}`);
    lines.push(
      `GC Time: ${report.gcTime.toFixed(2)}ms (${report.gcCount} collections)`
    );
    lines.push("");

    if (report.slowOperations.length > 0) {
      lines.push("Slow Operations (>100ms):");
      for (const op of report.slowOperations.slice(0, 10)) {
        lines.push(`  ${op.duration.toFixed(2)}ms - ${op.name} (${op.type})`);
        if (op.details?.["file"]) {
          lines.push(`    at ${op.details["file"]}:${op.details["line"]}`);
        }
      }
      lines.push("");
    }

    if (report.functionTimings.length > 0) {
      lines.push("Top Functions by Total Time:");
      for (const fn of report.functionTimings.slice(0, 10)) {
        lines.push(
          `  ${fn.totalTime.toFixed(2)}ms - ${fn.functionName} (${
            fn.callCount
          } calls, avg: ${fn.averageTime.toFixed(2)}ms)`
        );
        if (fn.file) {
          lines.push(`    at ${fn.file}:${fn.line}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get all recorded events
   */
  getEvents(): PerformanceEvent[] {
    return this.events;
  }

  /**
   * Clear all recorded events
   */
  clearEvents(): void {
    this.events = [];
    this.functionTimings.clear();
  }

  /**
   * Get function timings
   */
  getFunctionTimings(): FunctionTiming[] {
    return Array.from(this.functionTimings.entries()).map(([key, data]) => {
      const [functionName] = key.split(":");
      return {
        functionName,
        file: data.file,
        line: data.line,
        callCount: data.callCount,
        totalTime: data.totalTime,
        averageTime: data.totalTime / data.callCount,
        minTime: data.minTime,
        maxTime: data.maxTime,
      };
    });
  }
}
