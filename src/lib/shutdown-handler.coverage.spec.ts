import { GracefulShutdownHandler } from "./shutdown-handler";

describe("ShutdownHandler Coverage Tests", () => {
  let handler: GracefulShutdownHandler;

  beforeEach(() => {
    handler = new GracefulShutdownHandler(5000);
  });

  afterEach(() => {
    // Clean up
    handler.unregisterCleanup("test-cleanup");
    handler.unregisterCleanup("cleanup-1");
    handler.unregisterCleanup("cleanup-2");
    handler.unregisterCleanup("cleanup-3");
  });

  describe("Signal Handler Execution Paths", () => {
    it("should execute SIGTERM handler and initiate shutdown", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest.fn().mockResolvedValue(undefined);

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        handler.registerCleanup("test-cleanup", cleanupFn);
        handler.initialize();

        // Simulate SIGTERM signal
        expect(handlers["SIGTERM"]).toBeDefined();

        // Call the SIGTERM handler
        const sigtermPromise = handlers["SIGTERM"]();

        // Wait a bit for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(console.log).toHaveBeenCalledWith(
          "Received SIGTERM signal, initiating graceful shutdown..."
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it("should execute SIGINT handler and initiate shutdown", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest.fn().mockResolvedValue(undefined);

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        handler.registerCleanup("test-cleanup", cleanupFn);
        handler.initialize();

        // Simulate SIGINT signal
        expect(handlers["SIGINT"]).toBeDefined();

        // Call the SIGINT handler
        const sigintPromise = handlers["SIGINT"]();

        // Wait a bit for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(console.log).toHaveBeenCalledWith(
          "Received SIGINT signal, initiating graceful shutdown..."
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it("should execute uncaughtException handler and initiate shutdown", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest.fn().mockResolvedValue(undefined);

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        handler.registerCleanup("test-cleanup", cleanupFn);
        handler.initialize();

        // Simulate uncaughtException
        expect(handlers["uncaughtException"]).toBeDefined();

        const error = new Error("Test uncaught exception");
        const exceptionPromise = handlers["uncaughtException"](error);

        // Wait a bit for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(console.error).toHaveBeenCalledWith(
          "Uncaught exception:",
          error
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.error = originalError;
      }
    });

    it("should execute unhandledRejection handler and initiate shutdown", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest.fn().mockResolvedValue(undefined);

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        handler.registerCleanup("test-cleanup", cleanupFn);
        handler.initialize();

        // Simulate unhandledRejection
        expect(handlers["unhandledRejection"]).toBeDefined();

        const reason = new Error("Test unhandled rejection");
        const promise = Promise.reject(reason).catch(() => {}); // Catch to prevent actual unhandled rejection
        const rejectionPromise = handlers["unhandledRejection"](
          reason,
          promise
        );

        // Wait a bit for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(console.error).toHaveBeenCalledWith(
          "Unhandled promise rejection:",
          reason
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.error = originalError;
      }
    });
  });

  describe("Error Recovery in Signal Handlers", () => {
    it("should handle error in SIGTERM handler", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        handler.registerCleanup("failing-cleanup", cleanupFn);
        handler.initialize();

        // Call SIGTERM handler
        const sigtermPromise = handlers["SIGTERM"]();

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(console.error).toHaveBeenCalledWith(
          "Cleanup failed for failing-cleanup:",
          expect.any(Error)
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it("should handle error in uncaughtException handler during shutdown", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        handler.registerCleanup("failing-cleanup", cleanupFn);
        handler.initialize();

        // Call uncaughtException handler
        const error = new Error("Test exception");
        const exceptionPromise = handlers["uncaughtException"](error);

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should log both the uncaught exception and the cleanup failure
        expect(console.error).toHaveBeenCalledWith(
          "Uncaught exception:",
          expect.any(Error)
        );
        expect(console.error).toHaveBeenCalledWith(
          "Cleanup failed for failing-cleanup:",
          expect.any(Error)
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.error = originalError;
      }
    });

    it("should handle error in unhandledRejection handler during shutdown", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalError = console.error;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        handler.registerCleanup("failing-cleanup", cleanupFn);
        handler.initialize();

        // Call unhandledRejection handler
        const reason = new Error("Test rejection");
        const promise = Promise.reject(reason).catch(() => {}); // Catch to prevent actual unhandled rejection
        const rejectionPromise = handlers["unhandledRejection"](
          reason,
          promise
        );

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should log both the unhandled rejection and the cleanup failure
        expect(console.error).toHaveBeenCalledWith(
          "Unhandled promise rejection:",
          expect.any(Error)
        );
        expect(console.error).toHaveBeenCalledWith(
          "Cleanup failed for failing-cleanup:",
          expect.any(Error)
        );
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.error = originalError;
      }
    });
  });

  describe("Concurrent Shutdown Attempts", () => {
    it("should handle multiple concurrent shutdown calls", async () => {
      const cleanupFn = jest.fn().mockImplementation(async () => {
        // Simulate slow cleanup
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      handler.registerCleanup("slow-cleanup", cleanupFn);

      const originalExit = process.exit;
      const originalLog = console.log;

      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        // Start multiple shutdowns concurrently
        const shutdown1 = handler.shutdown();
        const shutdown2 = handler.shutdown();
        const shutdown3 = handler.shutdown();

        await Promise.all([shutdown1, shutdown2, shutdown3]);

        // Cleanup should only be called once
        expect(cleanupFn).toHaveBeenCalledTimes(1);

        // Should log "already in progress" for subsequent calls
        expect(console.log).toHaveBeenCalledWith(
          "Shutdown already in progress..."
        );
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }
    });

    it("should handle concurrent signal handlers", async () => {
      const originalOn = process.on;
      const originalExit = process.exit;
      const originalLog = console.log;

      const handlers: Record<string, Function> = {};
      const cleanupFn = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      process.on = jest.fn((signal: string, handler: Function) => {
        handlers[signal] = handler;
        return process;
      }) as any;
      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        handler.registerCleanup("test-cleanup", cleanupFn);
        handler.initialize();

        // Trigger multiple signals concurrently
        const sigterm = handlers["SIGTERM"]();
        const sigint = handlers["SIGINT"]();

        await Promise.all([sigterm, sigint]);

        // Cleanup should only be called once
        expect(cleanupFn).toHaveBeenCalledTimes(1);
      } finally {
        process.on = originalOn;
        process.exit = originalExit;
        console.log = originalLog;
      }
    });
  });

  describe("Cleanup Function Execution", () => {
    it("should execute multiple cleanup functions in parallel", async () => {
      const cleanup1 = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const cleanup2 = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const cleanup3 = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      handler.registerCleanup("cleanup-1", cleanup1);
      handler.registerCleanup("cleanup-2", cleanup2);
      handler.registerCleanup("cleanup-3", cleanup3);

      const originalExit = process.exit;
      const originalLog = console.log;

      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        const startTime = Date.now();
        await handler.shutdown();
        const duration = Date.now() - startTime;

        // All should be called
        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).toHaveBeenCalled();
        expect(cleanup3).toHaveBeenCalled();

        // Should run in parallel (< 150ms total, not 150ms sequential)
        expect(duration).toBeLessThan(150);
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }
    });

    it("should log each cleanup operation", async () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup("test-cleanup", cleanupFn);

      const originalExit = process.exit;
      const originalLog = console.log;

      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        await handler.shutdown();

        expect(console.log).toHaveBeenCalledWith(
          "Executing cleanup: test-cleanup"
        );
        expect(console.log).toHaveBeenCalledWith(
          "Cleanup completed: test-cleanup"
        );
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }
    });

    it("should continue with other cleanups if one fails", async () => {
      const cleanup1 = jest
        .fn()
        .mockRejectedValue(new Error("Cleanup 1 failed"));
      const cleanup2 = jest.fn().mockResolvedValue(undefined);
      const cleanup3 = jest.fn().mockResolvedValue(undefined);

      handler.registerCleanup("cleanup-1", cleanup1);
      handler.registerCleanup("cleanup-2", cleanup2);
      handler.registerCleanup("cleanup-3", cleanup3);

      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;

      process.exit = jest.fn() as any;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        await handler.shutdown();

        // All should be attempted
        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).toHaveBeenCalled();
        expect(cleanup3).toHaveBeenCalled();

        // Error should be logged
        expect(console.error).toHaveBeenCalledWith(
          "Cleanup failed for cleanup-1:",
          expect.any(Error)
        );

        // Successful cleanups should be logged
        expect(console.log).toHaveBeenCalledWith(
          "Cleanup completed: cleanup-2"
        );
        expect(console.log).toHaveBeenCalledWith(
          "Cleanup completed: cleanup-3"
        );
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe("Timeout Handling", () => {
    it("should force exit if cleanup exceeds timeout", async () => {
      jest.useFakeTimers();

      const slowCleanup = jest.fn().mockImplementation(async () => {
        // Simulate very slow cleanup
        await new Promise((resolve) => setTimeout(resolve, 10000));
      });

      handler.registerCleanup("slow-cleanup", slowCleanup);

      const originalExit = process.exit;
      const originalError = console.error;

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        const shutdownPromise = handler.shutdown();

        // Fast-forward to trigger timeout
        jest.advanceTimersByTime(5000);

        await jest.runAllTimersAsync();

        expect(console.error).toHaveBeenCalledWith(
          "Shutdown timeout exceeded (5000ms), forcing exit"
        );
        expect(process.exit).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
        jest.useRealTimers();
      }
    }, 10000);

    it("should clear timeout on successful shutdown", async () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup("test-cleanup", cleanupFn);

      const originalExit = process.exit;
      const originalLog = console.log;
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

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

    it("should clear timeout on error during shutdown", async () => {
      const cleanupFn = jest
        .fn()
        .mockRejectedValue(new Error("Cleanup failed"));
      handler.registerCleanup("failing-cleanup", cleanupFn);

      const originalExit = process.exit;
      const originalError = console.error;
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        await handler.shutdown();

        expect(clearTimeoutSpy).toHaveBeenCalled();
      } finally {
        process.exit = originalExit;
        console.error = originalError;
        clearTimeoutSpy.mockRestore();
      }
    });
  });

  describe("Process Exit Codes", () => {
    it("should exit with code 0 on successful shutdown", async () => {
      const cleanupFn = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanup("test-cleanup", cleanupFn);

      const originalExit = process.exit;
      const originalLog = console.log;

      process.exit = jest.fn() as any;
      console.log = jest.fn();

      try {
        await handler.shutdown();

        expect(process.exit).toHaveBeenCalledWith(0);
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }
    });

    it("should exit with code 1 on shutdown error", async () => {
      const cleanupFn = jest.fn().mockRejectedValue(new Error("Fatal error"));
      handler.registerCleanup("failing-cleanup", cleanupFn);

      const originalExit = process.exit;
      const originalError = console.error;

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        await handler.shutdown();

        // Should still exit, but with code 1 due to error
        expect(process.exit).toHaveBeenCalled();
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });

    it("should exit with code 1 on timeout", async () => {
      jest.useFakeTimers();

      const slowCleanup = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      });

      handler.registerCleanup("slow-cleanup", slowCleanup);

      const originalExit = process.exit;
      const originalError = console.error;

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        const shutdownPromise = handler.shutdown();

        jest.advanceTimersByTime(5000);
        await jest.runAllTimersAsync();

        expect(process.exit).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
        jest.useRealTimers();
      }
    }, 10000);
  });

  describe("Custom Shutdown Timeout", () => {
    it("should use custom timeout value", async () => {
      jest.useFakeTimers();

      const customHandler = new GracefulShutdownHandler(10000); // 10 second timeout
      const slowCleanup = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15000));
      });

      customHandler.registerCleanup("slow-cleanup", slowCleanup);

      const originalExit = process.exit;
      const originalError = console.error;

      process.exit = jest.fn() as any;
      console.error = jest.fn();

      try {
        const shutdownPromise = customHandler.shutdown();

        // Advance to just before timeout
        jest.advanceTimersByTime(9000);
        expect(process.exit).not.toHaveBeenCalled();

        // Advance past timeout
        jest.advanceTimersByTime(1000);
        await jest.runAllTimersAsync();

        expect(console.error).toHaveBeenCalledWith(
          "Shutdown timeout exceeded (10000ms), forcing exit"
        );
      } finally {
        process.exit = originalExit;
        console.error = originalError;
        jest.useRealTimers();
      }
    }, 10000);
  });
});
