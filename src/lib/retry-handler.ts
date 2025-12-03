/**
 * Retry Handler with Exponential Backoff
 * Implements retry logic for transient failures
 */

export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelay: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelay: number;

  /**
   * Backoff multiplier (default: 2 for exponential)
   */
  backoffMultiplier: number;

  /**
   * Add random jitter to prevent thundering herd (0-1)
   */
  jitter: number;

  /**
   * Function to determine if error is retryable
   */
  isRetryable?: (error: Error) => boolean;
}

export interface RetryStats {
  attempts: number;
  totalDelay: number;
  lastError?: Error;
  success: boolean;
}

export class RetryHandler {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: 0.1,
  };

  /**
   * Execute an operation with retry logic
   * @param operation The async operation to execute
   * @param config Retry configuration
   * @returns The result of the operation
   * @throws The last error if all retries fail
   */
  static async execute<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const fullConfig = { ...RetryHandler.DEFAULT_CONFIG, ...config };
    let lastError: Error | undefined;
    let attempt = 0;
    let totalDelay = 0;

    while (attempt < fullConfig.maxAttempts) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        // Check if error is retryable
        if (fullConfig.isRetryable && !fullConfig.isRetryable(lastError)) {
          throw lastError;
        }

        // If this was the last attempt, throw the error
        if (attempt >= fullConfig.maxAttempts) {
          throw lastError;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = RetryHandler.calculateDelay(
          attempt,
          fullConfig.initialDelay,
          fullConfig.maxDelay,
          fullConfig.backoffMultiplier,
          fullConfig.jitter,
        );

        totalDelay += delay;

        console.log(
          `Retry attempt ${attempt}/${fullConfig.maxAttempts} after ${delay}ms delay. Error: ${lastError.message}`,
        );

        // Wait before retrying
        await RetryHandler.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private static calculateDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    multiplier: number,
    jitter: number,
  ): number {
    // Calculate exponential backoff
    const exponentialDelay = initialDelay * Math.pow(multiplier, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, maxDelay);

    // Add jitter to prevent thundering herd
    const jitterAmount = cappedDelay * jitter * (Math.random() * 2 - 1);
    const finalDelay = Math.max(0, cappedDelay + jitterAmount);

    return Math.floor(finalDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute with retry and return stats
   */
  static async executeWithStats<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<{ result: T; stats: RetryStats }> {
    const fullConfig = { ...RetryHandler.DEFAULT_CONFIG, ...config };
    let lastError: Error | undefined;
    let attempt = 0;
    let totalDelay = 0;

    while (attempt < fullConfig.maxAttempts) {
      try {
        const result = await operation();
        return {
          result,
          stats: {
            attempts: attempt + 1,
            totalDelay,
            success: true,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (fullConfig.isRetryable && !fullConfig.isRetryable(lastError)) {
          throw lastError;
        }

        if (attempt >= fullConfig.maxAttempts) {
          throw lastError;
        }

        const delay = RetryHandler.calculateDelay(
          attempt,
          fullConfig.initialDelay,
          fullConfig.maxDelay,
          fullConfig.backoffMultiplier,
          fullConfig.jitter,
        );

        totalDelay += delay;
        await RetryHandler.sleep(delay);
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }
}

/**
 * Decorator for adding retry logic to methods
 */
export function Retryable(config: Partial<RetryConfig> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return RetryHandler.execute(
        () => originalMethod.apply(this, args),
        config,
      );
    };

    return descriptor;
  };
}
