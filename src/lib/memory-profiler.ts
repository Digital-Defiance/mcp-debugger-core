import { InspectorClient } from './inspector-client';

/**
 * Heap snapshot node
 */
export interface HeapSnapshotNode {
  type: string;
  name: string;
  id: number;
  selfSize: number;
  edgeCount: number;
  traceNodeId?: number;
}

/**
 * Heap snapshot edge (reference between objects)
 */
export interface HeapSnapshotEdge {
  type: string;
  name: string;
  toNode: number;
}

/**
 * Heap snapshot data structure
 */
export interface HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: string[][];
      edge_fields: string[];
      edge_types: string[][];
    };
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

/**
 * Memory usage statistics
 */
export interface MemoryUsage {
  usedSize: number;
  totalSize: number;
  timestamp: number;
}

/**
 * Memory leak detection result
 */
export interface MemoryLeakAnalysis {
  isLeaking: boolean;
  growthRate: number; // bytes per second
  snapshots: MemoryUsage[];
  suspiciousObjects: Array<{
    type: string;
    count: number;
    totalSize: number;
    growthRate: number;
  }>;
}

/**
 * Memory usage report
 */
export interface MemoryReport {
  totalHeapSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  mallocedMemory: number;
  peakMallocedMemory: number;
  objectTypes: Array<{
    type: string;
    count: number;
    size: number;
    percentage: number;
  }>;
}

/**
 * Memory Profiler for capturing heap snapshots and detecting memory leaks
 * Uses the HeapProfiler domain of Chrome DevTools Protocol
 */
export class MemoryProfiler {
  private inspector: InspectorClient;
  private tracking = false;
  private snapshots: HeapSnapshot[] = [];
  private memoryUsageHistory: MemoryUsage[] = [];

  constructor(inspector: InspectorClient) {
    this.inspector = inspector;
  }

  /**
   * Enable heap profiling
   */
  async enable(): Promise<void> {
    await this.inspector.send('HeapProfiler.enable');
  }

  /**
   * Disable heap profiling
   */
  async disable(): Promise<void> {
    await this.inspector.send('HeapProfiler.disable');
    this.tracking = false;
  }

  /**
   * Take a heap snapshot
   * @returns The heap snapshot data
   */
  async takeHeapSnapshot(): Promise<HeapSnapshot> {
    await this.enable();

    // Take the snapshot
    // The snapshot is sent in chunks via HeapProfiler.addHeapSnapshotChunk events
    const chunks: string[] = [];

    const chunkHandler = (params: any) => {
      chunks.push(params.chunk);
    };

    this.inspector.on('HeapProfiler.addHeapSnapshotChunk', chunkHandler);

    try {
      await this.inspector.send('HeapProfiler.takeHeapSnapshot', {
        reportProgress: false,
      });

      // Parse the complete snapshot
      const snapshotJson = chunks.join('');
      const snapshot = JSON.parse(snapshotJson) as HeapSnapshot;

      // Store the snapshot
      this.snapshots.push(snapshot);

      return snapshot;
    } finally {
      this.inspector.off('HeapProfiler.addHeapSnapshotChunk', chunkHandler);
    }
  }

  /**
   * Start tracking memory allocation over time
   * @param samplingInterval Sampling interval in bytes (default: 32768)
   */
  async startTrackingHeapObjects(
    samplingInterval: number = 32768,
  ): Promise<void> {
    await this.enable();

    await this.inspector.send('HeapProfiler.startTrackingHeapObjects', {
      trackAllocations: true,
    });

    this.tracking = true;
  }

  /**
   * Stop tracking memory allocation
   * @param reportProgress Whether to report progress
   * @returns The final heap snapshot
   */
  async stopTrackingHeapObjects(
    reportProgress: boolean = false,
  ): Promise<HeapSnapshot> {
    if (!this.tracking) {
      throw new Error('Heap tracking is not active');
    }

    const chunks: string[] = [];

    const chunkHandler = (params: any) => {
      chunks.push(params.chunk);
    };

    this.inspector.on('HeapProfiler.addHeapSnapshotChunk', chunkHandler);

    try {
      await this.inspector.send('HeapProfiler.stopTrackingHeapObjects', {
        reportProgress,
      });

      this.tracking = false;

      // Parse the complete snapshot
      const snapshotJson = chunks.join('');
      const snapshot = JSON.parse(snapshotJson) as HeapSnapshot;

      // Store the snapshot
      this.snapshots.push(snapshot);

      return snapshot;
    } finally {
      this.inspector.off('HeapProfiler.addHeapSnapshotChunk', chunkHandler);
    }
  }

  /**
   * Get current memory usage statistics
   * @returns Memory usage information
   */
  async getMemoryUsage(): Promise<MemoryUsage> {
    // Use Runtime.getHeapUsage for quick memory stats
    const result = await this.inspector.send('Runtime.getHeapUsage');

    const usage: MemoryUsage = {
      usedSize: result.usedSize,
      totalSize: result.totalSize,
      timestamp: Date.now(),
    };

    this.memoryUsageHistory.push(usage);

    return usage;
  }

  /**
   * Collect garbage to clean up unreferenced objects
   */
  async collectGarbage(): Promise<void> {
    await this.inspector.send('HeapProfiler.collectGarbage');
  }

  /**
   * Detect memory leaks by analyzing heap growth over time
   * Takes multiple snapshots and compares them
   * @param durationMs Duration to monitor in milliseconds
   * @param intervalMs Interval between snapshots in milliseconds
   * @returns Memory leak analysis
   */
  async detectMemoryLeaks(
    durationMs: number = 10000,
    intervalMs: number = 2000,
  ): Promise<MemoryLeakAnalysis> {
    const snapshots: MemoryUsage[] = [];
    const startTime = Date.now();

    // Collect initial snapshot
    await this.collectGarbage();
    snapshots.push(await this.getMemoryUsage());

    // Collect snapshots at intervals
    while (Date.now() - startTime < durationMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      await this.collectGarbage();
      snapshots.push(await this.getMemoryUsage());
    }

    // Analyze growth rate
    if (snapshots.length < 2) {
      return {
        isLeaking: false,
        growthRate: 0,
        snapshots,
        suspiciousObjects: [],
      };
    }

    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];
    const timeDiff = (lastSnapshot.timestamp - firstSnapshot.timestamp) / 1000; // seconds
    const sizeDiff = lastSnapshot.usedSize - firstSnapshot.usedSize;
    const growthRate = sizeDiff / timeDiff; // bytes per second

    // Consider it a leak if memory grows by more than 1MB per second
    const isLeaking = growthRate > 1024 * 1024;

    return {
      isLeaking,
      growthRate,
      snapshots,
      suspiciousObjects: [], // Would need detailed snapshot analysis to populate
    };
  }

  /**
   * Generate a memory usage report from a heap snapshot
   * @param snapshot The heap snapshot to analyze
   * @returns Memory usage report
   */
  async generateMemoryReport(snapshot?: HeapSnapshot): Promise<MemoryReport> {
    // Get current heap usage
    const heapUsage = await this.inspector.send('Runtime.getHeapUsage');

    // If no snapshot provided, use the most recent one
    const targetSnapshot =
      snapshot || this.snapshots[this.snapshots.length - 1];

    const report: MemoryReport = {
      totalHeapSize: heapUsage.totalSize,
      usedHeapSize: heapUsage.usedSize,
      heapSizeLimit: heapUsage.totalSize, // Approximation
      mallocedMemory: 0,
      peakMallocedMemory: 0,
      objectTypes: [],
    };

    if (targetSnapshot) {
      // Analyze object types from snapshot
      const objectTypeCounts = new Map<
        string,
        { count: number; size: number }
      >();

      // Parse nodes from the snapshot
      const nodeFields = targetSnapshot.snapshot.meta.node_fields;
      const nodeTypes = targetSnapshot.snapshot.meta.node_types[0];
      const nodeFieldCount = nodeFields.length;

      const typeIndex = nodeFields.indexOf('type');
      const nameIndex = nodeFields.indexOf('name');
      const selfSizeIndex = nodeFields.indexOf('self_size');

      for (let i = 0; i < targetSnapshot.nodes.length; i += nodeFieldCount) {
        const typeIdx = targetSnapshot.nodes[i + typeIndex];
        const type = nodeTypes[typeIdx];
        const selfSize = targetSnapshot.nodes[i + selfSizeIndex];

        const existing = objectTypeCounts.get(type);
        if (existing) {
          existing.count++;
          existing.size += selfSize;
        } else {
          objectTypeCounts.set(type, { count: 1, size: selfSize });
        }
      }

      // Convert to array and sort by size
      report.objectTypes = Array.from(objectTypeCounts.entries())
        .map(([type, data]) => ({
          type,
          count: data.count,
          size: data.size,
          percentage: (data.size / report.usedHeapSize) * 100,
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 20); // Top 20 types
    }

    return report;
  }

  /**
   * Format memory report as a human-readable string
   * @param report The memory report to format
   * @returns Formatted string
   */
  formatMemoryReport(report: MemoryReport): string {
    const lines: string[] = [];

    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    lines.push('Memory Usage Report');
    lines.push('===================');
    lines.push(`Total Heap Size: ${formatBytes(report.totalHeapSize)}`);
    lines.push(`Used Heap Size: ${formatBytes(report.usedHeapSize)}`);
    lines.push(
      `Heap Usage: ${((report.usedHeapSize / report.totalHeapSize) * 100).toFixed(2)}%`,
    );
    lines.push('');

    if (report.objectTypes.length > 0) {
      lines.push('Top Object Types by Size:');
      for (const objType of report.objectTypes.slice(0, 10)) {
        lines.push(
          `  ${objType.percentage.toFixed(2)}% - ${objType.type} (${objType.count} objects, ${formatBytes(objType.size)})`,
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Get all captured snapshots
   */
  getSnapshots(): HeapSnapshot[] {
    return this.snapshots;
  }

  /**
   * Get memory usage history
   */
  getMemoryUsageHistory(): MemoryUsage[] {
    return this.memoryUsageHistory;
  }

  /**
   * Clear all captured snapshots and history
   */
  clearHistory(): void {
    this.snapshots = [];
    this.memoryUsageHistory = [];
  }
}
