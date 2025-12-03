import { randomBytes } from 'crypto';

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  sessionId?: string;
  operationType?: string;
  context?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enableJson?: boolean;
  includeTimestamp?: boolean;
}

/**
 * Structured logger for enterprise observability
 * Provides JSON-formatted logging with correlation IDs and context
 */
export class StructuredLogger {
  private config: Required<LoggerConfig>;
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 1000;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      minLevel: config.minLevel || LogLevel.INFO,
      enableConsole: config.enableConsole !== false,
      enableJson: config.enableJson !== false,
      includeTimestamp: config.includeTimestamp !== false,
    };
  }

  /**
   * Generate a correlation ID for request tracing
   */
  generateCorrelationId(): string {
    return randomBytes(8).toString('hex');
  }

  /**
   * Check if a log level should be logged based on configuration
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    const minLevelIndex = levels.indexOf(this.config.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: {
      correlationId?: string;
      sessionId?: string;
      operationType?: string;
      additionalContext?: Record<string, any>;
      error?: Error;
    },
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: this.config.includeTimestamp ? new Date().toISOString() : '',
      level,
      message,
    };

    if (context?.correlationId) {
      entry.correlationId = context.correlationId;
    }

    if (context?.sessionId) {
      entry.sessionId = context.sessionId;
    }

    if (context?.operationType) {
      entry.operationType = context.operationType;
    }

    if (context?.additionalContext) {
      entry.context = context.additionalContext;
    }

    if (context?.error) {
      entry.error = {
        message: context.error.message,
        stack: context.error.stack,
        code: (context.error as any).code,
      };
    }

    return entry;
  }

  /**
   * Format log entry for output
   */
  private formatLogEntry(entry: LogEntry): string {
    if (this.config.enableJson) {
      return JSON.stringify(entry);
    }

    // Human-readable format
    const parts: string[] = [];

    if (entry.timestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    parts.push(`[${entry.level.toUpperCase()}]`);

    if (entry.correlationId) {
      parts.push(`[${entry.correlationId}]`);
    }

    if (entry.sessionId) {
      parts.push(`[session:${entry.sessionId}]`);
    }

    if (entry.operationType) {
      parts.push(`[op:${entry.operationType}]`);
    }

    parts.push(entry.message);

    if (entry.context) {
      parts.push(JSON.stringify(entry.context));
    }

    if (entry.error) {
      parts.push(`Error: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Write log entry to output
   */
  private writeLog(entry: LogEntry): void {
    // Add to buffer
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Write to console if enabled
    if (this.config.enableConsole) {
      const formatted = this.formatLogEntry(entry);

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(formatted);
          break;
        case LogLevel.INFO:
          console.info(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.ERROR:
          console.error(formatted);
          break;
      }
    }
  }

  /**
   * Log a debug message
   */
  debug(
    message: string,
    context?: {
      correlationId?: string;
      sessionId?: string;
      operationType?: string;
      additionalContext?: Record<string, any>;
    },
  ): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.writeLog(entry);
  }

  /**
   * Log an info message
   */
  info(
    message: string,
    context?: {
      correlationId?: string;
      sessionId?: string;
      operationType?: string;
      additionalContext?: Record<string, any>;
    },
  ): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.writeLog(entry);
  }

  /**
   * Log a warning message
   */
  warn(
    message: string,
    context?: {
      correlationId?: string;
      sessionId?: string;
      operationType?: string;
      additionalContext?: Record<string, any>;
    },
  ): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry = this.createLogEntry(LogLevel.WARN, message, context);
    this.writeLog(entry);
  }

  /**
   * Log an error message
   */
  error(
    message: string,
    context?: {
      correlationId?: string;
      sessionId?: string;
      operationType?: string;
      additionalContext?: Record<string, any>;
      error?: Error;
    },
  ): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry = this.createLogEntry(LogLevel.ERROR, message, context);
    this.writeLog(entry);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count?: number): LogEntry[] {
    if (count) {
      return this.logBuffer.slice(-count);
    }
    return [...this.logBuffer];
  }

  /**
   * Clear log buffer
   */
  clearLogs(): void {
    this.logBuffer = [];
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<LoggerConfig> {
    return { ...this.config };
  }
}
