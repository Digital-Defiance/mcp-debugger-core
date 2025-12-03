import { randomBytes } from 'crypto';
import { DebugSession, DebugSessionConfig } from './debug-session';
import { AuditLogger } from './audit-logger';

/**
 * Manages multiple concurrent debug sessions
 * Provides session isolation and lifecycle management
 */
export class SessionManager {
  private sessions = new Map<string, DebugSession>();
  private auditLogger: AuditLogger;

  constructor(auditLogger?: AuditLogger) {
    this.auditLogger = auditLogger || new AuditLogger();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Create a new debug session
   * @param config Session configuration
   * @returns The created debug session
   */
  async createSession(config: DebugSessionConfig): Promise<DebugSession> {
    const sessionId = this.generateSessionId();
    const session = new DebugSession(sessionId, config);

    // Store session before starting to ensure it's tracked
    this.sessions.set(sessionId, session);

    // Register crash handler to automatically clean up crashed sessions
    session.onCrash((error: Error) => {
      // Log crash
      this.auditLogger.log(
        sessionId,
        'session_crash',
        { error: error.message },
        false,
        error.message,
      );
      // Session will clean itself up, we just need to remove it from tracking
      this.sessions.delete(sessionId);
    });

    try {
      await session.start();
      this.auditLogger.log(
        sessionId,
        'session_create',
        { command: config.command, args: config.args },
        true,
      );
      return session;
    } catch (error) {
      // Remove session if start fails
      this.sessions.delete(sessionId);
      this.auditLogger.log(
        sessionId,
        'session_create',
        { command: config.command, args: config.args },
        false,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Get a session by ID
   * @param sessionId Session identifier
   * @returns The debug session or undefined if not found
   */
  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   * @returns Array of all debug sessions
   */
  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if a session exists
   * @param sessionId Session identifier
   * @returns True if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Remove and cleanup a session
   * @param sessionId Session identifier
   * @returns True if session was found and removed
   */
  async removeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.auditLogger.log(
        sessionId,
        'session_remove',
        {},
        false,
        'Session not found',
      );
      return false;
    }

    try {
      await session.cleanup();
      this.sessions.delete(sessionId);
      this.auditLogger.log(sessionId, 'session_remove', {}, true);
      return true;
    } catch (error) {
      this.auditLogger.log(
        sessionId,
        'session_remove',
        {},
        false,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Cleanup all sessions
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.sessions.values()).map((session) =>
      session.cleanup(),
    );

    await Promise.all(cleanupPromises);
    this.sessions.clear();
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get the audit logger
   * @returns The audit logger instance
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Remove terminated sessions
   */
  pruneTerminatedSessions(): void {
    for (const [id, session] of this.sessions.entries()) {
      if (!session.isActive()) {
        this.sessions.delete(id);
      }
    }
  }
}
