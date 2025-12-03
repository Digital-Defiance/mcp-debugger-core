/**
 * Rate limit configuration for an operation type
 */
export interface RateLimitConfig {
  maxRequests: number; // Maximum number of requests
  windowMs: number; // Time window in milliseconds
}

/**
 * Rate limit entry tracking requests
 */
interface RateLimitEntry {
  count: number;
  resetAt: Date;
}

/**
 * Rate limit metrics
 */
export interface RateLimitMetrics {
  operationType: string;
  requestCount: number;
  limitExceeded: number;
  currentWindow: {
    count: number;
    resetAt: Date;
  };
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public operationType: string,
    public retryAfter: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Manages rate limiting for debugging operations
 * Tracks requests per operation type and enforces limits
 */
export class RateLimiter {
  private limits = new Map<string, RateLimitConfig>();
  private entries = new Map<string, Map<string, RateLimitEntry>>();
  private metrics = new Map<
    string,
    { requestCount: number; limitExceeded: number }
  >();
  private defaultConfig?: RateLimitConfig;
  private defaultEntries = new Map<string, RateLimitEntry>();

  /**
   * Create a new RateLimiter
   * @param defaultConfig Optional default rate limit configuration
   */
  constructor(defaultConfig?: RateLimitConfig) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Configure rate limit for an operation type
   * @param operationType The operation type (e.g., 'debugger_start', 'debugger_set_breakpoint')
   * @param config Rate limit configuration
   */
  setLimit(operationType: string, config: RateLimitConfig): void {
    this.limits.set(operationType, config);
    if (!this.entries.has(operationType)) {
      this.entries.set(operationType, new Map());
    }
    if (!this.metrics.has(operationType)) {
      this.metrics.set(operationType, { requestCount: 0, limitExceeded: 0 });
    }
  }

  /**
   * Check if a request is allowed under rate limits
   * @param operationTypeOrIdentifier The operation type, or identifier if using default config
   * @param identifier Optional unique identifier for the requester (e.g., session ID, user ID)
   * @returns Object with allowed status and retryAfter time
   */
  checkLimit(
    operationTypeOrIdentifier: string,
    identifier?: string,
  ): { allowed: boolean; retryAfter?: number } {
    // If only one argument and default config exists, treat it as identifier
    if (identifier === undefined && this.defaultConfig) {
      return this.checkDefaultLimit(operationTypeOrIdentifier);
    }

    const operationType = operationTypeOrIdentifier;
    const id = identifier || 'default';

    const config = this.limits.get(operationType);
    if (!config) {
      // No limit configured for this operation type
      return { allowed: true };
    }

    const entries = this.entries.get(operationType)!;
    const now = new Date();
    let entry = entries.get(id);

    // Initialize or reset entry if window has passed
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: new Date(now.getTime() + config.windowMs),
      };
      entries.set(id, entry);
    }

    // Increment request count
    entry.count++;

    // Track metrics
    const metrics = this.metrics.get(operationType)!;
    metrics.requestCount++;

    // Check if limit is exceeded
    if (entry.count > config.maxRequests) {
      metrics.limitExceeded++;
      const retryAfter = Math.ceil(
        (entry.resetAt.getTime() - now.getTime()) / 1000,
      );
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  /**
   * Check limit using default configuration
   * @param identifier Unique identifier for the requester
   * @returns Object with allowed status and retryAfter time
   */
  private checkDefaultLimit(identifier: string): {
    allowed: boolean;
    retryAfter?: number;
  } {
    if (!this.defaultConfig) {
      return { allowed: true };
    }

    const now = new Date();
    let entry = this.defaultEntries.get(identifier);

    // Initialize or reset entry if window has passed
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: new Date(now.getTime() + this.defaultConfig.windowMs),
      };
      this.defaultEntries.set(identifier, entry);
    }

    // Increment request count
    entry.count++;

    // Check if limit is exceeded
    if (entry.count > this.defaultConfig.maxRequests) {
      const retryAfter = Math.ceil(
        (entry.resetAt.getTime() - now.getTime()) / 1000,
      );
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  /**
   * Check if a request is allowed and throw error if not (legacy method)
   * @param operationType The operation type
   * @param identifier Unique identifier for the requester
   * @throws RateLimitError if the rate limit is exceeded
   */
  checkLimitOrThrow(
    operationType: string,
    identifier: string = 'default',
  ): void {
    const result = this.checkLimit(operationType, identifier);
    if (!result.allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${operationType}. Try again in ${result.retryAfter} seconds.`,
        operationType,
        result.retryAfter || 0,
      );
    }
  }

  /**
   * Get the current rate limit status for an operation and identifier
   * @param operationType The operation type
   * @param identifier Unique identifier for the requester
   * @returns Current count and reset time, or null if no limit configured
   */
  getStatus(
    operationType: string,
    identifier: string = 'default',
  ): { count: number; limit: number; resetAt: Date } | null {
    const config = this.limits.get(operationType);
    if (!config) {
      return null;
    }

    const entries = this.entries.get(operationType);
    if (!entries) {
      return null;
    }

    const entry = entries.get(identifier);
    if (!entry) {
      return {
        count: 0,
        limit: config.maxRequests,
        resetAt: new Date(Date.now() + config.windowMs),
      };
    }

    return {
      count: entry.count,
      limit: config.maxRequests,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Get metrics for an operation type
   * @param operationType The operation type
   * @returns Metrics for the operation type
   */
  getMetrics(operationType: string): RateLimitMetrics | null {
    const config = this.limits.get(operationType);
    const metrics = this.metrics.get(operationType);
    const entries = this.entries.get(operationType);

    if (!config || !metrics) {
      return null;
    }

    // Get current window info (aggregate across all identifiers)
    let totalCount = 0;
    let earliestReset = new Date(Date.now() + config.windowMs);

    if (entries) {
      for (const entry of entries.values()) {
        totalCount += entry.count;
        if (entry.resetAt < earliestReset) {
          earliestReset = entry.resetAt;
        }
      }
    }

    return {
      operationType,
      requestCount: metrics.requestCount,
      limitExceeded: metrics.limitExceeded,
      currentWindow: {
        count: totalCount,
        resetAt: earliestReset,
      },
    };
  }

  /**
   * Get metrics for all operation types
   * @returns Array of metrics for all operation types
   */
  getAllMetrics(): RateLimitMetrics[] {
    const allMetrics: RateLimitMetrics[] = [];

    for (const operationType of this.limits.keys()) {
      const metrics = this.getMetrics(operationType);
      if (metrics) {
        allMetrics.push(metrics);
      }
    }

    return allMetrics;
  }

  /**
   * Reset rate limit for a specific identifier
   * @param operationType The operation type
   * @param identifier Unique identifier for the requester
   * @returns True if the entry was found and reset
   */
  reset(operationType: string, identifier: string = 'default'): boolean {
    const entries = this.entries.get(operationType);
    if (!entries) {
      return false;
    }

    return entries.delete(identifier);
  }

  /**
   * Reset all rate limits for an operation type
   * @param operationType The operation type
   * @returns True if the operation type was found
   */
  resetAll(operationType: string): boolean {
    const entries = this.entries.get(operationType);
    if (!entries) {
      return false;
    }

    entries.clear();
    return true;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = new Date();

    for (const [operationType, entries] of this.entries.entries()) {
      for (const [identifier, entry] of entries.entries()) {
        if (now >= entry.resetAt) {
          entries.delete(identifier);
        }
      }
    }
  }

  /**
   * Clear all rate limits and metrics
   */
  clear(): void {
    this.limits.clear();
    this.entries.clear();
    this.metrics.clear();
  }

  /**
   * Get all configured operation types
   * @returns Array of operation types
   */
  getOperationTypes(): string[] {
    return Array.from(this.limits.keys());
  }

  /**
   * Check if an operation type has a rate limit configured
   * @param operationType The operation type
   * @returns True if a rate limit is configured
   */
  hasLimit(operationType: string): boolean {
    return this.limits.has(operationType);
  }
}
