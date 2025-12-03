/**
 * Session timeout configuration
 */
export interface SessionTimeoutConfig {
  enabled: boolean;
  timeoutMs: number; // Session timeout in milliseconds
  warningMs?: number; // Warning time before timeout (optional)
}

/**
 * Session timeout entry
 */
interface SessionTimeoutEntry {
  sessionId: string;
  createdAt: Date;
  lastActivityAt: Date;
  timeoutAt: Date;
  warningTimer?: NodeJS.Timeout;
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * Session timeout event handler
 */
export type SessionTimeoutHandler = (sessionId: string) => void;

/**
 * Session warning event handler
 */
export type SessionWarningHandler = (
  sessionId: string,
  remainingMs: number,
) => void;

/**
 * Manages session timeouts for debug sessions
 * Automatically cleans up expired sessions and sends warnings
 */
export class SessionTimeoutManager {
  private config: SessionTimeoutConfig;
  private sessions = new Map<string, SessionTimeoutEntry>();
  private timeoutHandlers: SessionTimeoutHandler[] = [];
  private warningHandlers: SessionWarningHandler[] = [];

  constructor(config: SessionTimeoutConfig = { enabled: false, timeoutMs: 0 }) {
    this.config = config;
  }

  /**
   * Register a session for timeout tracking
   * @param sessionId The session identifier
   */
  registerSession(sessionId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const now = new Date();
    const timeoutAt = new Date(now.getTime() + this.config.timeoutMs);

    const entry: SessionTimeoutEntry = {
      sessionId,
      createdAt: now,
      lastActivityAt: now,
      timeoutAt,
    };

    // Set up warning timer if configured
    if (
      this.config.warningMs &&
      this.config.warningMs < this.config.timeoutMs
    ) {
      const warningDelay = this.config.timeoutMs - this.config.warningMs;
      entry.warningTimer = setTimeout(() => {
        this.handleWarning(sessionId);
      }, warningDelay);
    }

    // Set up timeout timer
    entry.timeoutTimer = setTimeout(() => {
      this.handleTimeout(sessionId);
    }, this.config.timeoutMs);

    this.sessions.set(sessionId, entry);
  }

  /**
   * Update the last activity time for a session
   * Resets the timeout timer
   * @param sessionId The session identifier
   */
  updateActivity(sessionId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    const now = new Date();
    entry.lastActivityAt = now;
    entry.timeoutAt = new Date(now.getTime() + this.config.timeoutMs);

    // Clear existing timers
    if (entry.warningTimer) {
      clearTimeout(entry.warningTimer);
    }
    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
    }

    // Set up new warning timer if configured
    if (
      this.config.warningMs &&
      this.config.warningMs < this.config.timeoutMs
    ) {
      const warningDelay = this.config.timeoutMs - this.config.warningMs;
      entry.warningTimer = setTimeout(() => {
        this.handleWarning(sessionId);
      }, warningDelay);
    }

    // Set up new timeout timer
    entry.timeoutTimer = setTimeout(() => {
      this.handleTimeout(sessionId);
    }, this.config.timeoutMs);
  }

  /**
   * Unregister a session from timeout tracking
   * @param sessionId The session identifier
   */
  unregisterSession(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    // Clear timers
    if (entry.warningTimer) {
      clearTimeout(entry.warningTimer);
    }
    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Check if a session is registered
   * @param sessionId The session identifier
   * @returns True if the session is registered
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get the remaining time until timeout for a session
   * @param sessionId The session identifier
   * @returns Remaining time in milliseconds, or null if session not found
   */
  getRemainingTime(sessionId: string): number | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return null;
    }

    const now = new Date();
    const remaining = entry.timeoutAt.getTime() - now.getTime();
    return Math.max(0, remaining);
  }

  /**
   * Get session timeout information
   * @param sessionId The session identifier
   * @returns Session timeout information or null if not found
   */
  getSessionInfo(sessionId: string): {
    createdAt: Date;
    lastActivityAt: Date;
    timeoutAt: Date;
    remainingMs: number;
  } | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return null;
    }

    const remainingMs = this.getRemainingTime(sessionId) || 0;

    return {
      createdAt: entry.createdAt,
      lastActivityAt: entry.lastActivityAt,
      timeoutAt: entry.timeoutAt,
      remainingMs,
    };
  }

  /**
   * Get all registered session IDs
   * @returns Array of session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get the number of registered sessions
   * @returns Number of sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Register a timeout handler
   * Called when a session times out
   * @param handler The timeout handler function
   */
  onTimeout(handler: SessionTimeoutHandler): void {
    this.timeoutHandlers.push(handler);
  }

  /**
   * Register a warning handler
   * Called when a session is about to timeout
   * @param handler The warning handler function
   */
  onWarning(handler: SessionWarningHandler): void {
    this.warningHandlers.push(handler);
  }

  /**
   * Handle session timeout
   * @param sessionId The session identifier
   */
  private handleTimeout(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    // Remove the session
    this.sessions.delete(sessionId);

    // Call timeout handlers
    for (const handler of this.timeoutHandlers) {
      try {
        handler(sessionId);
      } catch (error) {
        // Ignore handler errors
      }
    }
  }

  /**
   * Handle session warning
   * @param sessionId The session identifier
   */
  private handleWarning(sessionId: string): void {
    const remainingMs = this.getRemainingTime(sessionId);
    if (remainingMs === null) {
      return;
    }

    // Call warning handlers
    for (const handler of this.warningHandlers) {
      try {
        handler(sessionId, remainingMs);
      } catch (error) {
        // Ignore handler errors
      }
    }
  }

  /**
   * Clear all sessions and timers
   */
  clear(): void {
    for (const entry of this.sessions.values()) {
      if (entry.warningTimer) {
        clearTimeout(entry.warningTimer);
      }
      if (entry.timeoutTimer) {
        clearTimeout(entry.timeoutTimer);
      }
    }
    this.sessions.clear();
  }

  /**
   * Check if timeout enforcement is enabled
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the current configuration
   * @returns The current configuration
   */
  getConfig(): SessionTimeoutConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   * Note: This does not affect already registered sessions
   * @param config The new configuration
   */
  updateConfig(config: Partial<SessionTimeoutConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
