/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is unhealthy
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening the circuit
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before attempting recovery
   */
  resetTimeout: number;

  /**
   * Number of successful calls needed to close circuit from half-open
   */
  successThreshold: number;

  /**
   * Timeout for individual operations in milliseconds
   */
  timeout?: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private resetTimer?: NodeJS.Timeout;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig,
  ) {}

  /**
   * Execute an operation through the circuit breaker
   * @param operation The async operation to execute
   * @returns The result of the operation
   * @throws Error if circuit is open or operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      throw new Error(`Circuit breaker '${this.name}' is OPEN. Failing fast.`);
    }

    try {
      // Execute with timeout if configured
      const result = this.config.timeout
        ? await this.executeWithTimeout(operation, this.config.timeout)
        : await operation();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeout}ms`)),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();

    // If in half-open state and reached success threshold, close circuit
    if (
      this.state === CircuitState.HALF_OPEN &&
      this.consecutiveSuccesses >= this.config.successThreshold
    ) {
      this.closeCircuit();
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();

    // If reached failure threshold, open circuit
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit (start failing fast)
   */
  private openCircuit(): void {
    if (this.state === CircuitState.OPEN) {
      return;
    }

    this.state = CircuitState.OPEN;
    console.warn(
      `Circuit breaker '${this.name}' opened after ${this.consecutiveFailures} consecutive failures`,
    );

    // Schedule automatic transition to half-open
    this.resetTimer = setTimeout(() => {
      this.halfOpenCircuit();
    }, this.config.resetTimeout);
  }

  /**
   * Transition to half-open state (test if service recovered)
   */
  private halfOpenCircuit(): void {
    this.state = CircuitState.HALF_OPEN;
    this.consecutiveSuccesses = 0;
    console.log(
      `Circuit breaker '${this.name}' transitioned to HALF_OPEN, testing recovery`,
    );
  }

  /**
   * Close the circuit (resume normal operation)
   */
  private closeCircuit(): void {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    console.log(
      `Circuit breaker '${this.name}' closed, resuming normal operation`,
    );

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    console.log(`Circuit breaker '${this.name}' manually reset`);
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different operations
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Create or get a circuit breaker
   * @param name Circuit breaker name
   * @param config Circuit breaker configuration
   * @returns The circuit breaker instance
   */
  getOrCreate(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get a circuit breaker by name
   * @param name Circuit breaker name
   * @returns The circuit breaker or undefined
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   * @returns Map of all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [name, breaker] of this.breakers.entries()) {
      stats.set(name, breaker.getStats());
    }
    return stats;
  }
}
