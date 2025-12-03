/**
 * Multi-target debugging support for debugging multiple processes simultaneously
 * Coordinates breakpoints, aggregates logs, and supports parent-child process debugging
 */

import { EventEmitter } from "events";
import { DebugSession, Breakpoint } from "./debug-session";

export interface DebugTarget {
  id: string;
  name: string;
  session: DebugSession;
  parentId?: string;
  children: string[];
}

export interface MultiTargetBreakpoint {
  file: string;
  line: number;
  condition?: string;
  targets: string[]; // Target IDs where this breakpoint is set
}

export interface AggregatedLog {
  timestamp: number;
  targetId: string;
  targetName: string;
  level: "stdout" | "stderr" | "debug";
  message: string;
}

/**
 * Manages debugging of multiple processes simultaneously
 */
export class MultiTargetDebugger extends EventEmitter {
  private targets: Map<string, DebugTarget> = new Map();
  private globalBreakpoints: Map<string, MultiTargetBreakpoint> = new Map();
  private logs: AggregatedLog[] = [];
  private maxLogSize = 10000;

  /**
   * Add a debug target
   */
  addTarget(
    id: string,
    name: string,
    session: DebugSession,
    parentId?: string
  ): void {
    if (this.targets.has(id)) {
      throw new Error(`Target already exists: ${id}`);
    }

    const target: DebugTarget = {
      id,
      name,
      session,
      parentId,
      children: [],
    };

    this.targets.set(id, target);

    // Update parent's children list
    if (parentId) {
      const parent = this.targets.get(parentId);
      if (parent) {
        parent.children.push(id);
      }
    }

    // Set up log aggregation
    this.setupLogAggregation(target);

    this.emit("target-added", target);
  }

  /**
   * Remove a debug target
   */
  removeTarget(id: string): boolean {
    const target = this.targets.get(id);
    if (!target) {
      return false;
    }

    // Remove from parent's children list
    if (target.parentId) {
      const parent = this.targets.get(target.parentId);
      if (parent) {
        parent.children = parent.children.filter((childId) => childId !== id);
      }
    }

    // Remove all children
    for (const childId of target.children) {
      this.removeTarget(childId);
    }

    this.targets.delete(id);
    this.emit("target-removed", id);

    return true;
  }

  /**
   * Get a debug target by ID
   */
  getTarget(id: string): DebugTarget | undefined {
    return this.targets.get(id);
  }

  /**
   * Get all debug targets
   */
  getAllTargets(): DebugTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * Get root targets (targets without parents)
   */
  getRootTargets(): DebugTarget[] {
    return Array.from(this.targets.values()).filter((t) => !t.parentId);
  }

  /**
   * Get children of a target
   */
  getChildren(targetId: string): DebugTarget[] {
    const target = this.targets.get(targetId);
    if (!target) {
      return [];
    }

    return target.children
      .map((childId) => this.targets.get(childId))
      .filter((child): child is DebugTarget => child !== undefined);
  }

  /**
   * Set a breakpoint across multiple targets
   */
  async setGlobalBreakpoint(
    file: string,
    line: number,
    targetIds: string[],
    condition?: string
  ): Promise<string> {
    const breakpointId = `bp-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    const breakpoint: MultiTargetBreakpoint = {
      file,
      line,
      condition,
      targets: [],
    };

    // Set breakpoint on each target
    for (const targetId of targetIds) {
      const target = this.targets.get(targetId);
      if (!target) {
        continue;
      }

      try {
        await target.session.setBreakpoint(file, line, condition);
        breakpoint.targets.push(targetId);
      } catch (error) {
        this.emit("breakpoint-error", {
          targetId,
          file,
          line,
          error,
        });
      }
    }

    this.globalBreakpoints.set(breakpointId, breakpoint);
    this.emit("global-breakpoint-set", breakpointId, breakpoint);

    return breakpointId;
  }

  /**
   * Remove a global breakpoint
   */
  async removeGlobalBreakpoint(breakpointId: string): Promise<boolean> {
    const breakpoint = this.globalBreakpoints.get(breakpointId);
    if (!breakpoint) {
      return false;
    }

    // Remove breakpoint from each target
    for (const targetId of breakpoint.targets) {
      const target = this.targets.get(targetId);
      if (!target) {
        continue;
      }

      try {
        // Find and remove the breakpoint
        const breakpoints = target.session.getAllBreakpoints();
        const matchingBp = breakpoints.find(
          (bp: Breakpoint) =>
            bp.file === breakpoint.file && bp.line === breakpoint.line
        );
        if (matchingBp) {
          await target.session.removeBreakpoint(matchingBp.id);
        }
      } catch (error: any) {
        this.emit("breakpoint-error", {
          targetId,
          error,
        });
      }
    }

    this.globalBreakpoints.delete(breakpointId);
    this.emit("global-breakpoint-removed", breakpointId);

    return true;
  }

  /**
   * Get all global breakpoints
   */
  getGlobalBreakpoints(): Map<string, MultiTargetBreakpoint> {
    return new Map(this.globalBreakpoints);
  }

  /**
   * Continue execution on all targets
   */
  async continueAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const target of this.targets.values()) {
      promises.push(
        target.session.resume().catch((error: Error) => {
          this.emit("target-error", {
            targetId: target.id,
            operation: "resume",
            error,
          });
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Continue execution on specific targets
   */
  async continueTargets(targetIds: string[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const targetId of targetIds) {
      const target = this.targets.get(targetId);
      if (!target) {
        continue;
      }

      promises.push(
        target.session.resume().catch((error: Error) => {
          this.emit("target-error", {
            targetId,
            operation: "resume",
            error,
          });
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Pause execution on all targets
   */
  async pauseAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const target of this.targets.values()) {
      promises.push(
        target.session.pause().catch((error) => {
          this.emit("target-error", {
            targetId: target.id,
            operation: "pause",
            error,
          });
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Get aggregated logs from all targets
   */
  getAggregatedLogs(options?: {
    targetIds?: string[];
    level?: "stdout" | "stderr" | "debug";
    since?: number;
    limit?: number;
  }): AggregatedLog[] {
    let logs = this.logs;

    // Filter by target IDs
    if (options?.targetIds) {
      const targetIdSet = new Set(options.targetIds);
      logs = logs.filter((log) => targetIdSet.has(log.targetId));
    }

    // Filter by level
    if (options?.level) {
      logs = logs.filter((log) => log.level === options.level);
    }

    // Filter by timestamp
    if (options?.since !== undefined) {
      logs = logs.filter((log) => log.timestamp >= options.since!);
    }

    // Apply limit
    if (options?.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Clear aggregated logs
   */
  clearLogs(): void {
    this.logs = [];
    this.emit("logs-cleared");
  }

  /**
   * Set up log aggregation for a target
   */
  private setupLogAggregation(target: DebugTarget): void {
    // Get the process from the session
    const process = target.session.getProcess();
    if (!process) {
      return;
    }

    // Listen for stdout
    if (process.stdout) {
      process.stdout.on("data", (data: Buffer) => {
        this.addLog({
          timestamp: Date.now(),
          targetId: target.id,
          targetName: target.name,
          level: "stdout",
          message: data.toString(),
        });
      });
    }

    // Listen for stderr
    if (process.stderr) {
      process.stderr.on("data", (data: Buffer) => {
        this.addLog({
          timestamp: Date.now(),
          targetId: target.id,
          targetName: target.name,
          level: "stderr",
          message: data.toString(),
        });
      });
    }

    // Note: Debug-level logs would require inspector integration
    // which is not exposed through the DebugSession API
  }

  /**
   * Add a log entry
   */
  private addLog(log: AggregatedLog): void {
    this.logs.push(log);

    // Trim logs if exceeding max size
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize);
    }

    this.emit("log", log);
  }

  /**
   * Set maximum log size
   */
  setMaxLogSize(size: number): void {
    if (size <= 0) {
      throw new Error("Max log size must be positive");
    }

    this.maxLogSize = size;

    // Trim existing logs if needed
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize);
    }
  }

  /**
   * Get target hierarchy as a tree structure
   */
  getTargetTree(): DebugTarget[] {
    return this.getRootTargets().map((root) => this.buildTargetTree(root));
  }

  /**
   * Build target tree recursively
   */
  private buildTargetTree(target: DebugTarget): DebugTarget {
    const children = this.getChildren(target.id);
    return {
      ...target,
      children: children.map((child) => child.id),
    };
  }

  /**
   * Stop all debug targets
   */
  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const target of this.targets.values()) {
      promises.push(
        target.session.cleanup().catch((error: Error) => {
          this.emit("target-error", {
            targetId: target.id,
            operation: "cleanup",
            error,
          });
        })
      );
    }

    await Promise.all(promises);

    // Clear all targets
    this.targets.clear();
    this.globalBreakpoints.clear();
    this.emit("all-stopped");
  }
}
