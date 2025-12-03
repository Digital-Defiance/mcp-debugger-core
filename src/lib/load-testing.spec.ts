/**
 * Load Testing Suite for MCP Debugger
 * Tests system behavior under high concurrent load
 */

import { DebugSession } from './debug-session';
import { SessionManager } from './session-manager';
import * as path from 'path';
import * as fs from 'fs';

describe('Load Testing', () => {
  let sessionManager: SessionManager;
  const testFixturePath = path.join(
    __dirname,
    '../../test-fixtures/simple-script.js',
  );

  beforeAll(() => {
    // Create test fixture if it doesn't exist
    const fixtureDir = path.dirname(testFixturePath);
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }
    if (!fs.existsSync(testFixturePath)) {
      fs.writeFileSync(
        testFixturePath,
        `console.log('Starting test');
let sum = 0;
for (let i = 0; i < 10; i++) {
  sum += i;
}
console.log('Sum:', sum);
process.exit(0);`,
      );
    }
  });

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    // Cleanup all sessions
    try {
      await sessionManager.cleanupAll();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Concurrent Session Management', () => {
    it('should handle 10 concurrent debug sessions', async () => {
      const sessionCount = 10;
      const sessions: DebugSession[] = [];
      const startTime = Date.now();

      // Create sessions concurrently
      const createPromises = Array.from({ length: sessionCount }, async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });
        sessions.push(session);
        return session;
      });

      await Promise.all(createPromises);
      const createDuration = Date.now() - startTime;

      expect(sessions.length).toBe(sessionCount);
      expect(createDuration).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify all sessions are isolated
      const sessionIds = new Set(sessions.map((s) => s.id));
      expect(sessionIds.size).toBe(sessionCount);
    }, 30000);

    it('should handle 50 concurrent debug sessions', async () => {
      const sessionCount = 50;
      const sessions: DebugSession[] = [];
      const startTime = Date.now();

      // Create sessions in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < sessionCount; i += batchSize) {
        const batch = Array.from(
          { length: Math.min(batchSize, sessionCount - i) },
          async () => {
            const session = await sessionManager.createSession({
              command: 'node',
              args: [testFixturePath],
              cwd: process.cwd(),
            });
            sessions.push(session);
            return session;
          },
        );
        await Promise.all(batch);
      }

      const createDuration = Date.now() - startTime;

      expect(sessions.length).toBe(sessionCount);
      expect(createDuration).toBeLessThan(30000); // Should complete within 30 seconds

      // Verify session isolation
      const sessionIds = new Set(sessions.map((s) => s.id));
      expect(sessionIds.size).toBe(sessionCount);
    }, 60000);

    it('should measure session creation throughput', async () => {
      const sessionCount = 20;
      const startTime = Date.now();
      const sessions: DebugSession[] = [];

      for (let i = 0; i < sessionCount; i++) {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });
        sessions.push(session);
      }

      const duration = Date.now() - startTime;
      const throughput = (sessionCount / duration) * 1000; // sessions per second

      console.log(
        `Session creation throughput: ${throughput.toFixed(2)} sessions/sec`,
      );
      console.log(
        `Average latency: ${(duration / sessionCount).toFixed(2)}ms per session`,
      );

      expect(throughput).toBeGreaterThan(1); // At least 1 session per second
    }, 60000);
  });

  describe('Resource Cleanup Under Load', () => {
    it('should properly cleanup resources after 25 sessions', async () => {
      const sessionCount = 25;
      const sessions: DebugSession[] = [];

      // Create sessions
      for (let i = 0; i < sessionCount; i++) {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });
        sessions.push(session);
      }

      expect(sessionManager.getAllSessions().length).toBe(sessionCount);

      // Stop all sessions
      const stopStartTime = Date.now();
      await Promise.all(
        sessions.map((session) => sessionManager.removeSession(session.id)),
      );
      const stopDuration = Date.now() - stopStartTime;

      console.log(
        `Cleanup duration for ${sessionCount} sessions: ${stopDuration}ms`,
      );

      // Verify all sessions are cleaned up
      expect(sessionManager.getAllSessions().length).toBe(0);
      expect(stopDuration).toBeLessThan(15000); // Should cleanup within 15 seconds
    }, 60000);

    it('should handle rapid session creation and destruction', async () => {
      const cycles = 10;
      const sessionsPerCycle = 5;

      for (let cycle = 0; cycle < cycles; cycle++) {
        const sessions: DebugSession[] = [];

        // Create sessions
        for (let i = 0; i < sessionsPerCycle; i++) {
          const session = await sessionManager.createSession({
            command: 'node',
            args: [testFixturePath],
            cwd: process.cwd(),
          });
          sessions.push(session);
        }

        // Immediately destroy them
        await Promise.all(
          sessions.map((session) => sessionManager.removeSession(session.id)),
        );

        expect(sessionManager.getAllSessions().length).toBe(0);
      }

      // System should still be stable
      const finalSession = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      expect(finalSession).toBeDefined();
      expect(finalSession.id).toBeTruthy();
    }, 60000);
  });

  describe('Performance Bottleneck Identification', () => {
    it('should measure breakpoint operation latency under load', async () => {
      // Test breakpoint operations through the public API
      const session = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const bp = await session.setBreakpoint(testFixturePath, 5 + i);
        const end = Date.now();
        latencies.push(end - start);

        if (bp) {
          await session.removeBreakpoint(bp.id);
        }
      }

      const avgLatency =
        latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(1000); // Should be under 1 second

      await sessionManager.removeSession(session.id);
    }, 30000);

    it('should measure memory usage during concurrent sessions', async () => {
      const initialMemory = process.memoryUsage();
      const sessionCount = 20;
      const sessions: DebugSession[] = [];

      for (let i = 0; i < sessionCount; i++) {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });
        sessions.push(session);
      }

      const peakMemory = process.memoryUsage();

      // Cleanup
      await Promise.all(
        sessions.map((session) => sessionManager.removeSession(session.id)),
      );

      const finalMemory = process.memoryUsage();

      const memoryGrowth = peakMemory.heapUsed - initialMemory.heapUsed;
      const memoryPerSession = memoryGrowth / sessionCount;

      console.log(`Memory usage stats:`);
      console.log(
        `  Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      );
      console.log(
        `  Peak heap: ${(peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      );
      console.log(
        `  Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      );
      console.log(
        `  Memory per session: ${(memoryPerSession / 1024 / 1024).toFixed(2)}MB`,
      );

      // Memory should be reasonable (less than 50MB per session)
      expect(memoryPerSession).toBeLessThan(50 * 1024 * 1024);
    }, 60000);
  });
});
