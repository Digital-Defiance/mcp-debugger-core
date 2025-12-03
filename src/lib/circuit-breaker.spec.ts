import {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState,
} from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-breaker', {
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 2,
      timeout: 500,
    });
  });

  afterEach(() => {
    // Reset breaker to clear any pending timers
    breaker.reset();
  });

  describe('execute', () => {
    it('should execute operation successfully when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after reaching failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('failure'));

      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    it('should fail fast when circuit is open', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      // Try to execute when circuit is open
      await expect(breaker.execute(operation)).rejects.toThrow(
        "Circuit breaker 'test-breaker' is OPEN",
      );

      // Operation should not be called
      expect(operation).toHaveBeenCalledTimes(3); // Only the first 3 calls
    });

    it('should transition to half-open after reset timeout', async () => {
      jest.useFakeTimers();

      const operation = jest.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(breaker.isHalfOpen()).toBe(true);

      jest.useRealTimers();
    });

    it('should close circuit after successful calls in half-open state', async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('success')
        .mockResolvedValueOnce('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      // Transition to half-open
      jest.advanceTimersByTime(1000);

      // Execute successful operations
      await breaker.execute(operation);
      await breaker.execute(operation);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isClosed()).toBe(true);

      jest.useRealTimers();
    });

    it('should timeout long-running operations', async () => {
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return 'success';
      });

      await expect(breaker.execute(operation)).rejects.toThrow(
        'Operation timed out after 500ms',
      );
    });

    it('should reset consecutive failures on success', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'));

      // Fail twice
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      // Success resets consecutive failures
      await breaker.execute(operation);

      // Fail twice more (should not open circuit)
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const operation = jest
        .fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('success');

      await breaker.execute(operation);
      try {
        await breaker.execute(operation);
      } catch (error) {
        // Expected
      }
      await breaker.execute(operation);

      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(1);
      expect(stats.consecutiveSuccesses).toBe(1);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastFailureTime).toBeDefined();
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  describe('getOrCreate', () => {
    it('should create a new circuit breaker', () => {
      const breaker = manager.getOrCreate('test', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return existing circuit breaker', () => {
      const breaker1 = manager.getOrCreate('test', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      const breaker2 = manager.getOrCreate('test', {
        failureThreshold: 5,
        resetTimeout: 2000,
        successThreshold: 3,
      });

      expect(breaker1).toBe(breaker2);
    });
  });

  describe('get', () => {
    it('should return circuit breaker by name', () => {
      manager.getOrCreate('test', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      const breaker = manager.get('test');
      expect(breaker).toBeDefined();
    });

    it('should return undefined for non-existent breaker', () => {
      const breaker = manager.get('non-existent');
      expect(breaker).toBeUndefined();
    });
  });

  describe('resetAll', () => {
    it('should reset all circuit breakers', async () => {
      const breaker1 = manager.getOrCreate('test1', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      const breaker2 = manager.getOrCreate('test2', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      // Open both circuits
      const operation = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker1.execute(operation);
        } catch (error) {
          // Expected
        }
        try {
          await breaker2.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker1.getState()).toBe(CircuitState.OPEN);
      expect(breaker2.getState()).toBe(CircuitState.OPEN);

      // Reset all
      manager.resetAll();

      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all circuit breakers', () => {
      manager.getOrCreate('test1', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      manager.getOrCreate('test2', {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      const stats = manager.getAllStats();
      expect(stats.size).toBe(2);
      expect(stats.has('test1')).toBe(true);
      expect(stats.has('test2')).toBe(true);
    });
  });
});
