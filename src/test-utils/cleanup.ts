/**
 * Test Cleanup Utilities
 *
 * Provides utilities for cleaning up resources after tests to prevent
 * hanging processes and resource leaks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Kill all Node.js processes with --inspect-brk flag
 * This prevents orphaned debug processes from causing test hangs
 */
export async function cleanupDebugProcesses(): Promise<void> {
  try {
    // Use pkill to kill processes matching the pattern
    // Ignore errors if no processes found
    await execAsync('pkill -f "node --inspect-brk" || true');
  } catch (error) {
    // Ignore errors - process might not exist
  }
}

/**
 * Setup automatic cleanup for test suites
 * Call this at the top level of your describe block
 *
 * @example
 * ```typescript
 * import { setupTestCleanup } from '../test-utils/cleanup';
 *
 * describe('My Test Suite', () => {
 *   setupTestCleanup();
 *   // ... your tests
 * });
 * ```
 */
export function setupTestCleanup(): void {
  beforeEach(() => {
    // Clear all timers before each test
    jest.clearAllTimers();
  });

  afterEach(async () => {
    // Clean up debug processes after each test
    await cleanupDebugProcesses();

    // Give processes time to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

/**
 * Cleanup a specific child process and its resources
 * @param process The child process to cleanup
 */
export async function cleanupChildProcess(process: any): Promise<void> {
  if (!process || process.killed) {
    return;
  }

  try {
    // Try graceful shutdown first
    process.kill('SIGTERM');

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Force kill if still running
    if (!process.killed) {
      process.kill('SIGKILL');
    }
  } catch (error) {
    // Ignore errors - process might already be dead
  }
}

/**
 * Cleanup a debug session and all its resources
 * @param session The debug session to cleanup
 */
export async function cleanupDebugSession(session: any): Promise<void> {
  if (!session) {
    return;
  }

  try {
    // Close inspector connection
    if (session.inspector) {
      await session.inspector.disconnect();
    }

    // Kill the process
    if (session.process) {
      await cleanupChildProcess(session.process);
    }

    // Cleanup the session
    if (typeof session.cleanup === 'function') {
      await session.cleanup();
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Wait for a condition with timeout
 * Useful for waiting for processes to terminate
 *
 * @param condition Function that returns true when condition is met
 * @param timeout Maximum time to wait in milliseconds
 * @param interval Check interval in milliseconds
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Cleanup all resources at the end of a test suite
 * Call this in afterAll hook
 */
export async function cleanupAll(): Promise<void> {
  // Clear all timers
  jest.clearAllTimers();

  // Kill all debug processes
  await cleanupDebugProcesses();

  // Give time for cleanup
  await new Promise((resolve) => setTimeout(resolve, 500));
}
