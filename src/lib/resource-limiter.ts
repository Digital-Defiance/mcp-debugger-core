/**
 * Resource Limiter
 * Enforces resource limits and quotas for production readiness
 */

export interface ResourceLimits {
  /**
   * Maximum concurrent sessions per user
   */
  maxSessionsPerUser: number;

  /**
   * Maximum breakpoints per session
   */
  maxBreakpointsPerSession: number;

  /**
   * Maximum memory usage per session in bytes
   */
  maxMemoryPerSession: number;

  /**
   * Maximum session duration in milliseconds
   */
  maxSessionDuration: number;

  /**
   * Maximum watched variables per session
   */
  maxWatchedVariablesPerSession: number;
}

export interface ResourceUsage {
  sessionsPerUser: Map<string, number>;
  breakpointsPerSession: Map<string, number>;
  memoryPerSession: Map<string, number>;
  sessionStartTimes: Map<string, number>;
  watchedVariablesPerSession: Map<string, number>;
}

export class ResourceLimiter {
  private usage: ResourceUsage = {
    sessionsPerUser: new Map(),
    breakpointsPerSession: new Map(),
    memoryPerSession: new Map(),
    sessionStartTimes: new Map(),
    watchedVariablesPerSession: new Map(),
  };

  constructor(private limits: ResourceLimits) {}

  /**
   * Check if user can create a new session
   * @param userId User identifier
   * @returns True if allowed, false otherwise
   * @throws Error if limit exceeded
   */
  checkSessionLimit(userId: string): boolean {
    const currentSessions = this.usage.sessionsPerUser.get(userId) || 0;

    if (currentSessions >= this.limits.maxSessionsPerUser) {
      throw new Error(
        `Session limit exceeded for user ${userId}. Maximum: ${this.limits.maxSessionsPerUser}`,
      );
    }

    return true;
  }

  /**
   * Register a new session
   * @param userId User identifier
   * @param sessionId Session identifier
   */
  registerSession(userId: string, sessionId: string): void {
    const currentSessions = this.usage.sessionsPerUser.get(userId) || 0;
    this.usage.sessionsPerUser.set(userId, currentSessions + 1);
    this.usage.sessionStartTimes.set(sessionId, Date.now());
    this.usage.breakpointsPerSession.set(sessionId, 0);
    this.usage.watchedVariablesPerSession.set(sessionId, 0);
  }

  /**
   * Unregister a session
   * @param userId User identifier
   * @param sessionId Session identifier
   */
  unregisterSession(userId: string, sessionId: string): void {
    const currentSessions = this.usage.sessionsPerUser.get(userId) || 0;
    if (currentSessions > 0) {
      this.usage.sessionsPerUser.set(userId, currentSessions - 1);
    }

    this.usage.sessionStartTimes.delete(sessionId);
    this.usage.breakpointsPerSession.delete(sessionId);
    this.usage.memoryPerSession.delete(sessionId);
    this.usage.watchedVariablesPerSession.delete(sessionId);
  }

  /**
   * Check if session can add a breakpoint
   * @param sessionId Session identifier
   * @returns True if allowed, false otherwise
   * @throws Error if limit exceeded
   */
  checkBreakpointLimit(sessionId: string): boolean {
    const currentBreakpoints =
      this.usage.breakpointsPerSession.get(sessionId) || 0;

    if (currentBreakpoints >= this.limits.maxBreakpointsPerSession) {
      throw new Error(
        `Breakpoint limit exceeded for session ${sessionId}. Maximum: ${this.limits.maxBreakpointsPerSession}`,
      );
    }

    return true;
  }

  /**
   * Register a breakpoint
   * @param sessionId Session identifier
   */
  registerBreakpoint(sessionId: string): void {
    const currentBreakpoints =
      this.usage.breakpointsPerSession.get(sessionId) || 0;
    this.usage.breakpointsPerSession.set(sessionId, currentBreakpoints + 1);
  }

  /**
   * Unregister a breakpoint
   * @param sessionId Session identifier
   */
  unregisterBreakpoint(sessionId: string): void {
    const currentBreakpoints =
      this.usage.breakpointsPerSession.get(sessionId) || 0;
    if (currentBreakpoints > 0) {
      this.usage.breakpointsPerSession.set(sessionId, currentBreakpoints - 1);
    }
  }

  /**
   * Check if session can add a watched variable
   * @param sessionId Session identifier
   * @returns True if allowed, false otherwise
   * @throws Error if limit exceeded
   */
  checkWatchedVariableLimit(sessionId: string): boolean {
    const currentWatches =
      this.usage.watchedVariablesPerSession.get(sessionId) || 0;

    if (currentWatches >= this.limits.maxWatchedVariablesPerSession) {
      throw new Error(
        `Watched variable limit exceeded for session ${sessionId}. Maximum: ${this.limits.maxWatchedVariablesPerSession}`,
      );
    }

    return true;
  }

  /**
   * Register a watched variable
   * @param sessionId Session identifier
   */
  registerWatchedVariable(sessionId: string): void {
    const currentWatches =
      this.usage.watchedVariablesPerSession.get(sessionId) || 0;
    this.usage.watchedVariablesPerSession.set(sessionId, currentWatches + 1);
  }

  /**
   * Unregister a watched variable
   * @param sessionId Session identifier
   */
  unregisterWatchedVariable(sessionId: string): void {
    const currentWatches =
      this.usage.watchedVariablesPerSession.get(sessionId) || 0;
    if (currentWatches > 0) {
      this.usage.watchedVariablesPerSession.set(sessionId, currentWatches - 1);
    }
  }

  /**
   * Check if session has exceeded duration limit
   * @param sessionId Session identifier
   * @returns True if exceeded, false otherwise
   */
  checkSessionDuration(sessionId: string): boolean {
    const startTime = this.usage.sessionStartTimes.get(sessionId);
    if (!startTime) {
      return false;
    }

    const duration = Date.now() - startTime;
    return duration > this.limits.maxSessionDuration;
  }

  /**
   * Update memory usage for a session
   * @param sessionId Session identifier
   * @param memoryBytes Memory usage in bytes
   * @throws Error if limit exceeded
   */
  updateMemoryUsage(sessionId: string, memoryBytes: number): void {
    if (memoryBytes > this.limits.maxMemoryPerSession) {
      throw new Error(
        `Memory limit exceeded for session ${sessionId}. Maximum: ${this.limits.maxMemoryPerSession} bytes`,
      );
    }

    this.usage.memoryPerSession.set(sessionId, memoryBytes);
  }

  /**
   * Get current resource usage
   * @returns Current resource usage
   */
  getUsage(): ResourceUsage {
    return {
      sessionsPerUser: new Map(this.usage.sessionsPerUser),
      breakpointsPerSession: new Map(this.usage.breakpointsPerSession),
      memoryPerSession: new Map(this.usage.memoryPerSession),
      sessionStartTimes: new Map(this.usage.sessionStartTimes),
      watchedVariablesPerSession: new Map(
        this.usage.watchedVariablesPerSession,
      ),
    };
  }

  /**
   * Get resource limits
   * @returns Resource limits
   */
  getLimits(): ResourceLimits {
    return { ...this.limits };
  }

  /**
   * Reset all usage tracking
   */
  reset(): void {
    this.usage.sessionsPerUser.clear();
    this.usage.breakpointsPerSession.clear();
    this.usage.memoryPerSession.clear();
    this.usage.sessionStartTimes.clear();
    this.usage.watchedVariablesPerSession.clear();
  }
}
