/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: Date;
  sessionId: string;
  operation: string;
  details: Record<string, any>;
  userId?: string;
  success: boolean;
  error?: string;
}

/**
 * Audit logger for debugging operations
 * Logs all debugging operations with timestamps and context
 */
export class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs: number;
  private logToConsole: boolean;

  constructor(maxLogs: number = 10000, logToConsole: boolean = false) {
    this.maxLogs = maxLogs;
    this.logToConsole = logToConsole;
  }

  /**
   * Log a debugging operation
   * @param sessionId Session identifier
   * @param operation Operation name
   * @param details Operation details
   * @param success Whether the operation succeeded
   * @param error Optional error message
   * @param userId Optional user identifier
   */
  log(
    sessionId: string,
    operation: string,
    details: Record<string, any>,
    success: boolean,
    error?: string,
    userId?: string,
  ): void {
    const entry: AuditLogEntry = {
      timestamp: new Date(),
      sessionId,
      operation,
      details,
      success,
      error,
      userId,
    };

    this.logs.push(entry);

    // Implement log rotation
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    // Optionally log to console
    if (this.logToConsole) {
      console.log(JSON.stringify(entry));
    }
  }

  /**
   * Get all audit logs
   * @returns Array of audit log entries
   */
  getAllLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get audit logs for a specific session
   * @param sessionId Session identifier
   * @returns Array of audit log entries for the session
   */
  getSessionLogs(sessionId: string): AuditLogEntry[] {
    return this.logs.filter((log) => log.sessionId === sessionId);
  }

  /**
   * Get audit logs for a specific operation
   * @param operation Operation name
   * @returns Array of audit log entries for the operation
   */
  getOperationLogs(operation: string): AuditLogEntry[] {
    return this.logs.filter((log) => log.operation === operation);
  }

  /**
   * Get failed operations
   * @returns Array of audit log entries for failed operations
   */
  getFailedOperations(): AuditLogEntry[] {
    return this.logs.filter((log) => !log.success);
  }

  /**
   * Clear all audit logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   * @returns JSON string of all logs
   */
  exportLogsAsJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Get logs within a time range
   * @param startTime Start time
   * @param endTime End time
   * @returns Array of audit log entries within the time range
   */
  getLogsByTimeRange(startTime: Date, endTime: Date): AuditLogEntry[] {
    return this.logs.filter(
      (log) => log.timestamp >= startTime && log.timestamp <= endTime,
    );
  }

  /**
   * Get the number of logs
   * @returns Number of logs
   */
  getLogCount(): number {
    return this.logs.length;
  }
}
