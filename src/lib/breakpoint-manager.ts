import { randomBytes } from 'crypto';
import { Breakpoint, BreakpointType, HitCountCondition } from './debug-session';

/**
 * Manages breakpoints for a debug session
 * Handles breakpoint CRUD operations and state management
 */
export class BreakpointManager {
  private breakpoints = new Map<string, Breakpoint>();

  /**
   * Generate a unique breakpoint identifier
   */
  private generateBreakpointId(): string {
    return `bp_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Create a new breakpoint
   * @param file File path where the breakpoint should be set
   * @param line Line number (1-indexed)
   * @param condition Optional condition expression
   * @returns The created breakpoint
   */
  createBreakpoint(file: string, line: number, condition?: string): Breakpoint {
    const id = this.generateBreakpointId();
    const breakpoint: Breakpoint = {
      id,
      file,
      line,
      condition,
      enabled: true,
      type: BreakpointType.STANDARD,
      hitCount: 0,
    };

    this.breakpoints.set(id, breakpoint);
    return breakpoint;
  }

  /**
   * Create a new logpoint (non-breaking breakpoint)
   * @param file File path where the logpoint should be set
   * @param line Line number (1-indexed)
   * @param logMessage Log message template with variable interpolation
   * @returns The created logpoint
   */
  createLogpoint(file: string, line: number, logMessage: string): Breakpoint {
    const id = this.generateBreakpointId();
    const breakpoint: Breakpoint = {
      id,
      file,
      line,
      enabled: true,
      type: BreakpointType.LOGPOINT,
      logMessage,
      hitCount: 0,
    };

    this.breakpoints.set(id, breakpoint);
    return breakpoint;
  }

  /**
   * Create a new function breakpoint
   * @param functionName Function name or regex pattern
   * @returns The created function breakpoint
   */
  createFunctionBreakpoint(functionName: string): Breakpoint {
    const id = this.generateBreakpointId();
    const breakpoint: Breakpoint = {
      id,
      file: '', // Function breakpoints don't have a specific file
      line: 0, // Function breakpoints don't have a specific line
      enabled: true,
      type: BreakpointType.FUNCTION,
      functionName,
      hitCount: 0,
    };

    this.breakpoints.set(id, breakpoint);
    return breakpoint;
  }

  /**
   * Add an existing breakpoint (for backward compatibility)
   * @param breakpoint Breakpoint to add
   */
  addBreakpoint(breakpoint: Breakpoint): void {
    this.breakpoints.set(breakpoint.id, breakpoint);
  }

  /**
   * Get a breakpoint by ID
   * @param id Breakpoint identifier
   * @returns The breakpoint or undefined if not found
   */
  getBreakpoint(id: string): Breakpoint | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Get all breakpoints
   * @returns Array of all breakpoints
   */
  getAllBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get breakpoints for a specific file
   * @param file File path
   * @returns Array of breakpoints in the file
   */
  getBreakpointsByFile(file: string): Breakpoint[] {
    return this.getAllBreakpoints().filter((bp) => bp.file === file);
  }

  /**
   * Remove a breakpoint by ID
   * @param id Breakpoint identifier
   * @returns True if the breakpoint was found and removed
   */
  removeBreakpoint(id: string): boolean {
    return this.breakpoints.delete(id);
  }

  /**
   * Toggle a breakpoint's enabled state
   * @param id Breakpoint identifier
   * @returns The updated breakpoint or undefined if not found
   */
  toggleBreakpoint(id: string): Breakpoint | undefined {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return undefined;
    }

    breakpoint.enabled = !breakpoint.enabled;
    return breakpoint;
  }

  /**
   * Enable a breakpoint
   * @param id Breakpoint identifier
   * @returns The updated breakpoint or undefined if not found
   */
  enableBreakpoint(id: string): Breakpoint | undefined {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return undefined;
    }

    breakpoint.enabled = true;
    return breakpoint;
  }

  /**
   * Disable a breakpoint
   * @param id Breakpoint identifier
   * @returns The updated breakpoint or undefined if not found
   */
  disableBreakpoint(id: string): Breakpoint | undefined {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return undefined;
    }

    breakpoint.enabled = false;
    return breakpoint;
  }

  /**
   * Update a breakpoint's CDP breakpoint ID
   * @param id Breakpoint identifier
   * @param cdpBreakpointId CDP breakpoint ID from the Inspector Protocol
   * @returns The updated breakpoint or undefined if not found
   */
  updateCdpBreakpointId(
    id: string,
    cdpBreakpointId: string,
  ): Breakpoint | undefined {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return undefined;
    }

    breakpoint.cdpBreakpointId = cdpBreakpointId;
    return breakpoint;
  }

  /**
   * Clear all breakpoints
   */
  clearAll(): void {
    this.breakpoints.clear();
  }

  /**
   * Get the number of breakpoints
   */
  getBreakpointCount(): number {
    return this.breakpoints.size;
  }

  /**
   * Check if a breakpoint exists
   * @param id Breakpoint identifier
   * @returns True if the breakpoint exists
   */
  hasBreakpoint(id: string): boolean {
    return this.breakpoints.has(id);
  }

  /**
   * Increment the hit count for a breakpoint
   * @param id Breakpoint identifier
   * @returns The updated hit count or undefined if breakpoint not found
   */
  incrementHitCount(id: string): number | undefined {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return undefined;
    }

    breakpoint.hitCount = (breakpoint.hitCount || 0) + 1;
    return breakpoint.hitCount;
  }

  /**
   * Reset the hit count for a breakpoint
   * @param id Breakpoint identifier
   * @returns True if the breakpoint was found
   */
  resetHitCount(id: string): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return false;
    }

    breakpoint.hitCount = 0;
    return true;
  }

  /**
   * Reset all hit counts (typically called on session restart)
   */
  resetAllHitCounts(): void {
    for (const breakpoint of this.breakpoints.values()) {
      breakpoint.hitCount = 0;
    }
  }

  /**
   * Check if a breakpoint should pause based on hit count condition
   * @param id Breakpoint identifier
   * @returns True if the breakpoint should pause
   */
  shouldPauseOnHitCount(id: string): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint || !breakpoint.hitCountCondition) {
      return true; // No hit count condition, always pause
    }

    const hitCount = breakpoint.hitCount || 0;
    const { operator, value } = breakpoint.hitCountCondition;

    switch (operator) {
      case '==':
        return hitCount === value;
      case '>':
        return hitCount > value;
      case '>=':
        return hitCount >= value;
      case '<':
        return hitCount < value;
      case '<=':
        return hitCount <= value;
      case '%':
        return hitCount % value === 0;
      default:
        return true;
    }
  }

  /**
   * Set hit count condition for a breakpoint
   * @param id Breakpoint identifier
   * @param condition Hit count condition
   * @returns The updated breakpoint or undefined if not found
   */
  setHitCountCondition(
    id: string,
    condition: HitCountCondition,
  ): Breakpoint | undefined {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return undefined;
    }

    breakpoint.hitCountCondition = condition;
    return breakpoint;
  }
}
