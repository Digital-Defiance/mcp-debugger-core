import { InspectorClient } from './inspector-client';

/**
 * CPU profile node representing a function call in the profile
 */
export interface ProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount: number;
  children?: number[];
  positionTicks?: Array<{
    line: number;
    ticks: number;
  }>;
}

/**
 * CPU profile data structure
 */
export interface CPUProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

/**
 * Analyzed profile data with bottleneck information
 */
export interface ProfileAnalysis {
  totalTime: number;
  topFunctions: Array<{
    functionName: string;
    file: string;
    line: number;
    selfTime: number;
    totalTime: number;
    percentage: number;
  }>;
  bottlenecks: Array<{
    functionName: string;
    file: string;
    line: number;
    reason: string;
    impact: number;
  }>;
}

/**
 * Flame graph node for visualization
 */
export interface FlameGraphNode {
  name: string;
  value: number;
  children?: FlameGraphNode[];
  file?: string;
  line?: number;
}

/**
 * CPU Profiler for capturing and analyzing CPU profiles
 * Uses the Profiler domain of Chrome DevTools Protocol
 */
export class CPUProfiler {
  private inspector: InspectorClient;
  private profiling = false;
  private currentProfile: CPUProfile | null = null;

  constructor(inspector: InspectorClient) {
    this.inspector = inspector;
  }

  /**
   * Start CPU profiling
   * Enables the Profiler domain and starts collecting CPU profile data
   */
  async start(): Promise<void> {
    if (this.profiling) {
      throw new Error('CPU profiling is already active');
    }

    // Enable the Profiler domain
    await this.inspector.send('Profiler.enable');

    // Start profiling with high precision
    await this.inspector.send('Profiler.start');

    this.profiling = true;
    this.currentProfile = null;
  }

  /**
   * Stop CPU profiling and return the profile data
   * @returns The captured CPU profile
   */
  async stop(): Promise<CPUProfile> {
    if (!this.profiling) {
      throw new Error('CPU profiling is not active');
    }

    // Stop profiling and get the profile
    const result = await this.inspector.send('Profiler.stop');
    this.profiling = false;

    // Store the profile
    this.currentProfile = result.profile as CPUProfile;

    // Disable the Profiler domain
    await this.inspector.send('Profiler.disable');

    return this.currentProfile;
  }

  /**
   * Check if profiling is currently active
   */
  isProfiling(): boolean {
    return this.profiling;
  }

  /**
   * Get the current profile (if available)
   */
  getCurrentProfile(): CPUProfile | null {
    return this.currentProfile;
  }

  /**
   * Generate a flame graph from the CPU profile
   * @param profile The CPU profile to convert
   * @returns Root node of the flame graph
   */
  generateFlameGraph(profile: CPUProfile): FlameGraphNode {
    const nodeMap = new Map<number, ProfileNode>();
    for (const node of profile.nodes) {
      nodeMap.set(node.id, node);
    }

    // Build the flame graph tree
    const root: FlameGraphNode = {
      name: '(root)',
      value: 0,
      children: [],
    };

    // Calculate total time for each node
    const nodeTimes = new Map<number, number>();
    if (profile.samples && profile.timeDeltas) {
      for (let i = 0; i < profile.samples.length; i++) {
        const nodeId = profile.samples[i];
        const timeDelta = profile.timeDeltas[i] || 0;
        nodeTimes.set(nodeId, (nodeTimes.get(nodeId) || 0) + timeDelta);
      }
    }

    // Build flame graph nodes
    const buildFlameNode = (nodeId: number): FlameGraphNode | null => {
      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const time = nodeTimes.get(nodeId) || node.hitCount || 0;
      const flameNode: FlameGraphNode = {
        name: node.callFrame.functionName || '(anonymous)',
        value: time,
        file: node.callFrame.url,
        line: node.callFrame.lineNumber,
        children: [],
      };

      // Add children
      if (node.children) {
        for (const childId of node.children) {
          const childNode = buildFlameNode(childId);
          if (childNode && childNode.value > 0) {
            flameNode.children!.push(childNode);
          }
        }
      }

      return flameNode;
    };

    // Find root nodes (nodes with no parents)
    const childIds = new Set<number>();
    for (const node of profile.nodes) {
      if (node.children) {
        for (const childId of node.children) {
          childIds.add(childId);
        }
      }
    }

    for (const node of profile.nodes) {
      if (!childIds.has(node.id)) {
        const flameNode = buildFlameNode(node.id);
        if (flameNode && flameNode.value > 0) {
          root.children!.push(flameNode);
          root.value += flameNode.value;
        }
      }
    }

    return root;
  }

  /**
   * Generate a call tree from the CPU profile
   * Similar to flame graph but organized differently
   * @param profile The CPU profile to convert
   * @returns Root node of the call tree
   */
  generateCallTree(profile: CPUProfile): FlameGraphNode {
    // For now, call tree is the same as flame graph
    // In a more sophisticated implementation, these could differ
    return this.generateFlameGraph(profile);
  }

  /**
   * Analyze the CPU profile to identify bottlenecks
   * @param profile The CPU profile to analyze
   * @returns Analysis results with top functions and bottlenecks
   */
  analyzeProfile(profile: CPUProfile): ProfileAnalysis {
    const totalTime = profile.endTime - profile.startTime;

    // Calculate time spent in each function
    const functionTimes = new Map<
      string,
      {
        selfTime: number;
        totalTime: number;
        node: ProfileNode;
      }
    >();

    // Build node map for quick lookup
    const nodeMap = new Map<number, ProfileNode>();
    for (const node of profile.nodes) {
      nodeMap.set(node.id, node);
    }

    // Calculate self time from samples
    if (profile.samples && profile.timeDeltas) {
      for (let i = 0; i < profile.samples.length; i++) {
        const nodeId = profile.samples[i];
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        const timeDelta = profile.timeDeltas[i] || 0;
        const key = `${node.callFrame.functionName}:${node.callFrame.url}:${node.callFrame.lineNumber}`;

        const existing = functionTimes.get(key);
        if (existing) {
          existing.selfTime += timeDelta;
          existing.totalTime += timeDelta;
        } else {
          functionTimes.set(key, {
            selfTime: timeDelta,
            totalTime: timeDelta,
            node,
          });
        }
      }
    } else {
      // Fallback to hitCount if samples not available
      for (const node of profile.nodes) {
        const key = `${node.callFrame.functionName}:${node.callFrame.url}:${node.callFrame.lineNumber}`;
        const existing = functionTimes.get(key);
        if (existing) {
          existing.selfTime += node.hitCount;
          existing.totalTime += node.hitCount;
        } else {
          functionTimes.set(key, {
            selfTime: node.hitCount,
            totalTime: node.hitCount,
            node,
          });
        }
      }
    }

    // Sort by self time to find top functions
    const sortedFunctions = Array.from(functionTimes.entries())
      .sort((a, b) => b[1].selfTime - a[1].selfTime)
      .slice(0, 20); // Top 20 functions

    const topFunctions = sortedFunctions.map(([key, data]) => ({
      functionName: data.node.callFrame.functionName || '(anonymous)',
      file: data.node.callFrame.url,
      line: data.node.callFrame.lineNumber,
      selfTime: data.selfTime,
      totalTime: data.totalTime,
      percentage: totalTime > 0 ? (data.selfTime / totalTime) * 100 : 0,
    }));

    // Identify bottlenecks (functions taking >5% of total time)
    const bottlenecks = topFunctions
      .filter((fn) => fn.percentage > 5)
      .map((fn) => ({
        functionName: fn.functionName,
        file: fn.file,
        line: fn.line,
        reason: `Takes ${fn.percentage.toFixed(2)}% of total execution time`,
        impact: fn.percentage,
      }));

    return {
      totalTime,
      topFunctions,
      bottlenecks,
    };
  }

  /**
   * Format profile analysis as a human-readable string
   * @param analysis The profile analysis to format
   * @returns Formatted string
   */
  formatAnalysis(analysis: ProfileAnalysis): string {
    const lines: string[] = [];

    lines.push(`Total Time: ${analysis.totalTime.toFixed(2)}μs`);
    lines.push('');

    if (analysis.bottlenecks.length > 0) {
      lines.push('Bottlenecks:');
      for (const bottleneck of analysis.bottlenecks) {
        lines.push(
          `  - ${bottleneck.functionName} (${bottleneck.file}:${bottleneck.line})`,
        );
        lines.push(`    ${bottleneck.reason}`);
      }
      lines.push('');
    }

    lines.push('Top Functions by Self Time:');
    for (const fn of analysis.topFunctions.slice(0, 10)) {
      lines.push(
        `  ${fn.percentage.toFixed(2)}% - ${fn.functionName} (${fn.file}:${fn.line})`,
      );
    }

    return lines.join('\n');
  }
}
