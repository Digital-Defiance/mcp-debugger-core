/**
 * Graceful Shutdown Handler
 * Handles SIGTERM and SIGINT signals to ensure clean shutdown
 */

export interface ShutdownHandler {
  /**
   * Register a cleanup function to be called during shutdown
   * @param name Identifier for the cleanup function
   * @param fn Async cleanup function
   */
  registerCleanup(name: string, fn: () => Promise<void>): void;

  /**
   * Unregister a cleanup function
   * @param name Identifier for the cleanup function
   */
  unregisterCleanup(name: string): void;

  /**
   * Initialize shutdown handlers for SIGTERM and SIGINT
   */
  initialize(): void;

  /**
   * Trigger graceful shutdown manually
   */
  shutdown(): Promise<void>;

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean;
}

export class GracefulShutdownHandler implements ShutdownHandler {
  private cleanupFunctions = new Map<string, () => Promise<void>>();
  private shuttingDown = false;
  private shutdownTimeout: number;
  private initialized = false;

  constructor(shutdownTimeout = 30000) {
    this.shutdownTimeout = shutdownTimeout;
  }

  registerCleanup(name: string, fn: () => Promise<void>): void {
    this.cleanupFunctions.set(name, fn);
  }

  unregisterCleanup(name: string): void {
    this.cleanupFunctions.delete(name);
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    // Handle SIGTERM (graceful shutdown signal)
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM signal, initiating graceful shutdown...');
      this.shutdown().catch((error) => {
        console.error('Error during shutdown:', error);
        process.exit(1);
      });
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('Received SIGINT signal, initiating graceful shutdown...');
      this.shutdown().catch((error) => {
        console.error('Error during shutdown:', error);
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.shutdown()
        .catch((shutdownError) => {
          console.error('Error during emergency shutdown:', shutdownError);
        })
        .finally(() => {
          process.exit(1);
        });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled promise rejection:', reason);
      this.shutdown()
        .catch((shutdownError) => {
          console.error('Error during emergency shutdown:', shutdownError);
        })
        .finally(() => {
          process.exit(1);
        });
    });
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      console.log('Shutdown already in progress...');
      return;
    }

    this.shuttingDown = true;

    // Set a timeout to force exit if cleanup takes too long
    const timeoutHandle = setTimeout(() => {
      console.error(
        `Shutdown timeout exceeded (${this.shutdownTimeout}ms), forcing exit`,
      );
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      console.log('Starting cleanup operations...');

      // Execute all cleanup functions in parallel
      const cleanupPromises = Array.from(this.cleanupFunctions.entries()).map(
        async ([name, fn]) => {
          try {
            console.log(`Executing cleanup: ${name}`);
            await fn();
            console.log(`Cleanup completed: ${name}`);
          } catch (error) {
            console.error(`Cleanup failed for ${name}:`, error);
            // Continue with other cleanups even if one fails
          }
        },
      );

      await Promise.all(cleanupPromises);

      console.log('All cleanup operations completed successfully');
      clearTimeout(timeoutHandle);

      // Exit gracefully
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      clearTimeout(timeoutHandle);
      process.exit(1);
    }
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
