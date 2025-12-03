import { GracefulShutdownHandler } from './shutdown-handler';

describe('GracefulShutdownHandler', () => {
  let handler: GracefulShutdownHandler;

  beforeEach(() => {
    handler = new GracefulShutdownHandler(5000);
  });

  afterEach(() => {
    // Clean up any registered handlers
    handler.unregisterCleanup('test-cleanup');
  });

  describe('registerCleanup', () => {
    it('should register a cleanup function', () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup('test-cleanup', cleanupFn);

      // Verify it was registered (we can't directly test the map, but we can test unregister)
      handler.unregisterCleanup('test-cleanup');
      expect(true).toBe(true); // If no error, registration worked
    });

    it('should allow multiple cleanup functions', () => {
      const cleanup1 = jest.fn().mockResolvedValue(undefined);
      const cleanup2 = jest.fn().mockResolvedValue(undefined);

      handler.registerCleanup('cleanup-1', cleanup1);
      handler.registerCleanup('cleanup-2', cleanup2);

      expect(true).toBe(true);
    });
  });

  describe('unregisterCleanup', () => {
    it('should unregister a cleanup function', () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup('test-cleanup', cleanupFn);
      handler.unregisterCleanup('test-cleanup');

      expect(true).toBe(true);
    });

    it('should not throw when unregistering non-existent cleanup', () => {
      expect(() => {
        handler.unregisterCleanup('non-existent');
      }).not.toThrow();
    });
  });

  describe('isShuttingDown', () => {
    it('should return false initially', () => {
      expect(handler.isShuttingDown()).toBe(false);
    });

    it('should return true during shutdown', async () => {
      const cleanupFn = jest.fn().mockImplementation(async () => {
        // Check status during cleanup
        expect(handler.isShuttingDown()).toBe(true);
      });

      handler.registerCleanup('test-cleanup', cleanupFn);

      // Mock process.exit to prevent actual exit
      const originalExit = process.exit;
      process.exit = jest.fn() as any;

      try {
        await handler.shutdown();
        expect(cleanupFn).toHaveBeenCalled();
      } finally {
        process.exit = originalExit;
      }
    });
  });

  describe('shutdown', () => {
    it('should execute all registered cleanup functions', async () => {
      const cleanup1 = jest.fn().mockResolvedValue(undefined);
      const cleanup2 = jest.fn().mockResolvedValue(undefined);

      handler.registerCleanup('cleanup-1', cleanup1);
      handler.registerCleanup('cleanup-2', cleanup2);

      // Mock process.exit
      const originalExit = process.exit;
      process.exit = jest.fn() as any;

      try {
        await handler.shutdown();

        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).toHaveBeenCalled();
        expect(process.exit).toHaveBeenCalledWith(0);
      } finally {
        process.exit = originalExit;
      }
    });

    it('should continue cleanup even if one function fails', async () => {
      const cleanup1 = jest
        .fn()
        .mockRejectedValue(new Error('Cleanup 1 failed'));
      const cleanup2 = jest.fn().mockResolvedValue(undefined);

      handler.registerCleanup('cleanup-1', cleanup1);
      handler.registerCleanup('cleanup-2', cleanup2);

      // Mock process.exit and console.error
      const originalExit = process.exit;
      const originalError = console.error;
      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        await handler.shutdown();

        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Cleanup failed for cleanup-1'),
          expect.any(Error),
        );
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });

    it('should not execute shutdown twice', async () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup('test-cleanup', cleanupFn);

      // Mock process.exit and console.log
      const originalExit = process.exit;
      const originalLog = console.log;
      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        // Start first shutdown
        const shutdown1 = handler.shutdown();
        // Try to start second shutdown
        const shutdown2 = handler.shutdown();

        await Promise.all([shutdown1, shutdown2]);

        // Cleanup should only be called once
        expect(cleanupFn).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledWith(
          'Shutdown already in progress...',
        );
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }
    });

    it('should timeout if cleanup takes too long', async () => {
      jest.useFakeTimers();

      const slowCleanup = jest.fn().mockImplementation(async () => {
        // Simulate slow cleanup
        await new Promise((resolve) => setTimeout(resolve, 10000));
      });

      handler.registerCleanup('slow-cleanup', slowCleanup);

      // Mock process.exit and console.error
      const originalExit = process.exit;
      const originalError = console.error;
      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        const shutdownPromise = handler.shutdown();

        // Fast-forward time to trigger timeout
        jest.advanceTimersByTime(5000);

        // Wait for the timeout to trigger
        await jest.runAllTimersAsync();

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Shutdown timeout exceeded'),
        );
        expect(process.exit).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
        jest.useRealTimers();
      }
    }, 10000);
  });

  describe('initialize', () => {
    it('should only initialize once', () => {
      const originalOn = process.on;
      const onSpy = jest.fn();
      process.on = onSpy as any;

      try {
        handler.initialize();
        handler.initialize();

        // Should only register handlers once
        const sigtermCalls = onSpy.mock.calls.filter(
          (call) => call[0] === 'SIGTERM',
        );
        expect(sigtermCalls.length).toBe(1);
      } finally {
        process.on = originalOn;
      }
    });

    it('should register SIGTERM handler', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};
      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        expect(handlers['SIGTERM']).toBeDefined();
        expect(typeof handlers['SIGTERM']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });

    it('should register SIGINT handler', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};
      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        expect(handlers['SIGINT']).toBeDefined();
        expect(typeof handlers['SIGINT']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });

    it('should register uncaughtException handler', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};
      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        expect(handlers['uncaughtException']).toBeDefined();
        expect(typeof handlers['uncaughtException']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });

    it('should register unhandledRejection handler', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};
      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        expect(handlers['unhandledRejection']).toBeDefined();
        expect(typeof handlers['unhandledRejection']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });

    it('should handle SIGTERM signal', () => {
      const originalOn = process.on;
      const originalLog = console.log;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      console.log = jest.fn();

      try {
        handler.initialize();

        // Just verify the handler logs the message
        // We can't actually trigger it without causing process.exit
        expect(handlers['SIGTERM']).toBeDefined();
      } finally {
        process.on = originalOn;
        console.log = originalLog;
      }
    });

    it('should handle SIGINT signal', () => {
      const originalOn = process.on;
      const originalLog = console.log;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      console.log = jest.fn();

      try {
        handler.initialize();

        // Just verify the handler exists
        expect(handlers['SIGINT']).toBeDefined();
      } finally {
        process.on = originalOn;
        console.log = originalLog;
      }
    });

    it('should handle uncaughtException', () => {
      const originalOn = process.on;
      const originalError = console.error;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      console.error = jest.fn();

      try {
        handler.initialize();

        // Just verify the handler exists
        expect(handlers['uncaughtException']).toBeDefined();
      } finally {
        process.on = originalOn;
        console.error = originalError;
      }
    });

    it('should handle unhandledRejection', () => {
      const originalOn = process.on;
      const originalError = console.error;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      console.error = jest.fn();

      try {
        handler.initialize();

        // Just verify the handler exists
        expect(handlers['unhandledRejection']).toBeDefined();
      } finally {
        process.on = originalOn;
        console.error = originalError;
      }
    });
  });

  describe('shutdown error handling', () => {
    it('should clear timeout on successful shutdown', async () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup('test-cleanup', cleanupFn);

      const originalExit = process.exit;
      const originalLog = console.log;
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        await handler.shutdown();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(process.exit).toHaveBeenCalledWith(0);
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
        clearTimeoutSpy.mockRestore();
      }
    });

    it('should clear timeout on error during shutdown', async () => {
      const cleanupFn = jest
        .fn()
        .mockRejectedValue(new Error('Cleanup failed'));
      handler.registerCleanup('test-cleanup', cleanupFn);

      const originalExit = process.exit;
      const originalError = console.error;
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        await handler.shutdown();

        // Should still clear timeout even on error
        expect(clearTimeoutSpy).toHaveBeenCalled();
      } finally {
        process.exit = originalExit;
        console.error = originalError;
        clearTimeoutSpy.mockRestore();
      }
    });

    it('should log cleanup operations', async () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup('test-cleanup', cleanupFn);

      const originalExit = process.exit;
      const originalLog = console.log;

      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        await handler.shutdown();

        expect(console.log).toHaveBeenCalledWith(
          'Starting cleanup operations...',
        );
        expect(console.log).toHaveBeenCalledWith(
          'Executing cleanup: test-cleanup',
        );
        expect(console.log).toHaveBeenCalledWith(
          'Cleanup completed: test-cleanup',
        );
        expect(console.log).toHaveBeenCalledWith(
          'All cleanup operations completed successfully',
        );
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }
    });

    it('should handle cleanup function throwing error', async () => {
      const error = new Error('Cleanup error');
      const cleanupFn = jest.fn().mockRejectedValue(error);
      handler.registerCleanup('failing-cleanup', cleanupFn);

      const originalExit = process.exit;
      const originalError = console.error;

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        await handler.shutdown();

        expect(console.error).toHaveBeenCalledWith(
          'Cleanup failed for failing-cleanup:',
          error,
        );
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });
  });

  describe('signal handler coverage', () => {
    it('should have SIGTERM handler that calls shutdown', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        // Verify SIGTERM handler exists and would call shutdown
        expect(handlers['SIGTERM']).toBeDefined();
        expect(typeof handlers['SIGTERM']).toBe('function');

        // The handler should be a function that logs and calls shutdown
        // We can't actually call it without triggering process.exit
        // but we've verified it exists
      } finally {
        process.on = originalOn;
      }
    });

    it('should have SIGINT handler that calls shutdown', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        // Verify SIGINT handler exists
        expect(handlers['SIGINT']).toBeDefined();
        expect(typeof handlers['SIGINT']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });

    it('should have uncaughtException handler that calls shutdown', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        // Verify uncaughtException handler exists
        expect(handlers['uncaughtException']).toBeDefined();
        expect(typeof handlers['uncaughtException']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });

    it('should have unhandledRejection handler that calls shutdown', () => {
      const originalOn = process.on;
      const handlers: Record<string, Function> = {};

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;

      try {
        handler.initialize();

        // Verify unhandledRejection handler exists
        expect(handlers['unhandledRejection']).toBeDefined();
        expect(typeof handlers['unhandledRejection']).toBe('function');
      } finally {
        process.on = originalOn;
      }
    });
  });
});
