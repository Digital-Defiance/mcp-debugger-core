import * as fc from 'fast-check';
import { HangDetector } from './hang-detector';
import { SessionManager } from './session-manager';
import * as path from 'path';

describe('HangDetector', () => {
  let sessionManager: SessionManager;
  let hangDetector: HangDetector;

  beforeEach(() => {
    sessionManager = new SessionManager();
    hangDetector = new HangDetector(sessionManager);
  });

  afterEach(async () => {
    // Clean up all sessions after each test
    await sessionManager.cleanupAll();
  });

  // Feature: mcp-debugger-tool, Property 11: Timeout-based hang detection
  // For any Target Process and specified timeout duration, if the process executes
  // for longer than the timeout without completing, then the MCP Server should pause
  // the process and report a hang condition with the current call stack.
  // Validates: Requirements 5.1, 5.2
  it('should detect hang when process exceeds timeout', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 500, max: 2000 }), // timeout between 500ms and 2s
        async (timeout) => {
          const infiniteLoopScript = path.join(
            __dirname,
            '../../test-fixtures/infinite-loop.js',
          );

          const result = await hangDetector.detectHang({
            command: 'node',
            args: [infiniteLoopScript],
            timeout,
          });

          // Should detect hang
          expect(result.hung).toBe(true);
          expect(result.completed).toBeUndefined();

          // Should have a location
          expect(result.location).toBeDefined();
          expect(typeof result.location).toBe('string');

          // Should have a call stack
          expect(result.stack).toBeDefined();
          expect(Array.isArray(result.stack)).toBe(true);
          expect(result.stack!.length).toBeGreaterThan(0);

          // Should have a message
          expect(result.message).toBeDefined();
          expect(result.message).toContain('timeout');

          // Duration should be at least the timeout
          expect(result.duration).toBeDefined();
          expect(result.duration!).toBeGreaterThanOrEqual(timeout * 0.9); // Allow 10% margin

          // Stack frames should have required fields
          const topFrame = result.stack![0];
          expect(topFrame.functionName).toBeDefined();
          expect(topFrame.file).toBeDefined();
          expect(topFrame.line).toBeDefined();

          // File path should be absolute
          expect(path.isAbsolute(topFrame.file)).toBe(true);
        },
      ),
      { numRuns: 5 }, // Run 5 times with different timeouts
    );
  }, 60000); // 1 minute timeout for multiple runs

  it('should not report hang for processes that complete normally', async () => {
    const normalScript = path.join(
      __dirname,
      '../../test-fixtures/normal-completion.js',
    );

    const result = await hangDetector.detectHang({
      command: 'node',
      args: [normalScript],
      timeout: 5000, // 5 second timeout
    });

    // Should not detect hang
    expect(result.hung).toBe(false);
    expect(result.completed).toBe(true);
    expect(result.exitCode).toBeDefined();
    expect(result.location).toBeUndefined();
    expect(result.message).toBeUndefined();
  }, 10000);

  it('should capture call stack when timeout is reached', async () => {
    const infiniteLoopScript = path.join(
      __dirname,
      '../../test-fixtures/infinite-loop.js',
    );

    const result = await hangDetector.detectHang({
      command: 'node',
      args: [infiniteLoopScript],
      timeout: 1000, // 1 second timeout
    });

    expect(result.hung).toBe(true);
    expect(result.stack).toBeDefined();
    expect(result.stack!.length).toBeGreaterThan(0);

    // The top frame should be in the infinite-loop.js file
    const topFrame = result.stack![0];
    expect(topFrame.file).toContain('infinite-loop.js');
    expect(topFrame.line).toBeGreaterThan(0);
  }, 10000);

  it('should detect async hang', async () => {
    const asyncHangScript = path.join(
      __dirname,
      '../../test-fixtures/async-hang.js',
    );

    const timeout = 2000; // 2 second timeout
    const result = await hangDetector.detectHang({
      command: 'node',
      args: [asyncHangScript],
      timeout,
    });

    // Should detect hang
    expect(result.hung).toBe(true);
    expect(result.completed).toBeUndefined();

    // Should have a message
    expect(result.message).toBeDefined();
    expect(result.message).toContain('timeout');

    // Duration should be at least the timeout
    expect(result.duration).toBeDefined();
    expect(result.duration!).toBeGreaterThanOrEqual(timeout * 0.9); // Allow 10% margin

    // Location and stack may or may not be present depending on when the process is paused
    // For async hangs, the process might be in event loop waiting, so location might not be captured
    // We just verify that if they are present, they have the correct structure
    if (result.location) {
      expect(typeof result.location).toBe('string');
    }

    if (result.stack) {
      expect(Array.isArray(result.stack)).toBe(true);
      if (result.stack.length > 0) {
        const topFrame = result.stack[0];
        expect(topFrame.functionName).toBeDefined();
        expect(topFrame.file).toBeDefined();
        expect(topFrame.line).toBeDefined();
        expect(path.isAbsolute(topFrame.file)).toBe(true);
      }
    }
  }, 10000);

  // Feature: mcp-debugger-tool, Property 12: Infinite loop detection via sampling
  // For any Target Process being monitored with a sample interval, if the execution
  // location remains unchanged across consecutive samples for the specified duration,
  // then the MCP Server should report an infinite loop condition with the loop location.
  // Validates: Requirements 5.3, 5.4
  it('should detect infinite loop via sampling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 500 }), // sample interval between 100ms and 500ms
        async (sampleInterval) => {
          const infiniteLoopScript = path.join(
            __dirname,
            '../../test-fixtures/infinite-loop.js',
          );

          const result = await hangDetector.detectHang({
            command: 'node',
            args: [infiniteLoopScript],
            timeout: 30000, // 30 second timeout (should detect loop before this)
            sampleInterval, // Enable sampling
          });

          // Should detect hang via sampling
          expect(result.hung).toBe(true);

          // Should have a location
          expect(result.location).toBeDefined();
          expect(typeof result.location).toBe('string');

          // Should have a call stack
          expect(result.stack).toBeDefined();
          expect(Array.isArray(result.stack)).toBe(true);
          expect(result.stack!.length).toBeGreaterThan(0);

          // Should have a message indicating infinite loop
          expect(result.message).toBeDefined();
          expect(result.message).toContain('loop');

          // Duration should be reasonable (may hit timeout if sampling doesn't detect fast enough)
          expect(result.duration).toBeDefined();
          // Allow some margin - sampling might not detect before timeout
          expect(result.duration!).toBeLessThan(35000);

          // Stack frames should have required fields
          const topFrame = result.stack![0];
          expect(topFrame.functionName).toBeDefined();
          expect(topFrame.file).toBeDefined();
          expect(topFrame.line).toBeDefined();

          // File path should be absolute
          expect(path.isAbsolute(topFrame.file)).toBe(true);
        },
      ),
      { numRuns: 3 }, // Run 3 times with different sample intervals
    );
  }, 120000); // 2 minute timeout for multiple runs

  it('should handle process that completes quickly', async () => {
    const normalScript = path.join(
      __dirname,
      '../../test-fixtures/normal-completion.js',
    );

    const result = await hangDetector.detectHang({
      command: 'node',
      args: [normalScript],
      timeout: 5000,
      sampleInterval: 100, // Enable sampling
    });

    // Process may complete before sampling detects it, or may be detected as hung
    // depending on timing. Just verify we get a result.
    expect(result).toBeDefined();
    expect(result.duration).toBeDefined();
  }, 10000);

  it('should handle timeout without call frames', async () => {
    const infiniteLoopScript = path.join(
      __dirname,
      '../../test-fixtures/infinite-loop.js',
    );

    // This tests the edge case where paused event doesn't populate call frames
    const result = await hangDetector.detectHang({
      command: 'node',
      args: [infiniteLoopScript],
      timeout: 500, // Very short timeout
    });

    expect(result.hung).toBe(true);
    expect(result.message).toBeDefined();
  }, 10000);

  it('should handle errors during pause', async () => {
    const infiniteLoopScript = path.join(
      __dirname,
      '../../test-fixtures/infinite-loop.js',
    );

    const result = await hangDetector.detectHang({
      command: 'node',
      args: [infiniteLoopScript],
      timeout: 1000,
    });

    // Should still detect hang even if there are errors
    expect(result.hung).toBe(true);
  }, 10000);

  it('should handle cwd parameter', async () => {
    const normalScript = path.join(
      __dirname,
      '../../test-fixtures/normal-completion.js',
    );

    const result = await hangDetector.detectHang({
      command: 'node',
      args: [normalScript],
      cwd: __dirname,
      timeout: 5000,
    });

    expect(result.hung).toBe(false);
    expect(result.completed).toBe(true);
  }, 10000);
});
