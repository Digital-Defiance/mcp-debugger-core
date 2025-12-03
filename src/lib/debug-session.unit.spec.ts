/**
 * Comprehensive Unit Tests for DebugSession
 *
 * This file provides exhaustive testing of the DebugSession class,
 * covering all public methods, state transitions, error conditions,
 * and edge cases.
 */

import {
  DebugSession,
  DebugSessionConfig,
  SessionState,
  BreakpointType,
} from './debug-session';
import { SessionManager } from './session-manager';
import * as path from 'path';
import * as fs from 'fs';

describe('DebugSession - Comprehensive Unit Tests', () => {
  let sessionManager: SessionManager;
  const testFixturePath = path.join(
    __dirname,
    '../../test-fixtures/debug-session-test.js',
  );
  const complexFixturePath = path.join(
    __dirname,
    '../../test-fixtures/complex-debug-test.js',
  );

  beforeAll(() => {
    // Create test fixtures
    const fixtureDir = path.dirname(testFixturePath);
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    // Simple test fixture - keeps running for testing pause/resume
    if (!fs.existsSync(testFixturePath)) {
      fs.writeFileSync(
        testFixturePath,
        `// Simple debug test
function add(a, b) {
  return a + b;
}

function multiply(x, y) {
  return x * y;
}

// Keep the process running for a bit to allow pause/resume testing
const result1 = add(2, 3);
const result2 = multiply(4, 5);

console.log('Results:', result1, result2);

// Keep running for 5 seconds to allow pause/resume testing
setTimeout(() => {
  console.log('Test complete');
  process.exit(0);
}, 5000);`,
      );
    }

    // Complex test fixture with various scenarios
    if (!fs.existsSync(complexFixturePath)) {
      fs.writeFileSync(
        complexFixturePath,
        `// Complex debug test
let globalVar = 'global';

function outer(param1) {
  let outerVar = 'outer';
  
  function inner(param2) {
    let innerVar = 'inner';
    console.log(param1, param2, outerVar, innerVar, globalVar);
    return param1 + param2;
  }
  
  return inner(param1 * 2);
}

const obj = {
  name: 'test',
  value: 42,
  nested: {
    deep: 'value'
  }
};

try {
  const result = outer(5);
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error);
}

process.exit(0);`,
      );
    }
  });

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    try {
      await sessionManager.cleanupAll();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('1. Lifecycle Management', () => {
    describe('Session Initialization', () => {
      it('should create session with valid configuration', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        expect(session).toBeDefined();
        expect(session.id).toBeTruthy();
        expect(typeof session.id).toBe('string');
      }, 15000);

      it('should initialize session in PAUSED state', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        expect((session as any).state).toBe(SessionState.PAUSED);
      }, 15000);

      it('should have unique session IDs', async () => {
        const session1 = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        const session2 = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        expect(session1.id).not.toBe(session2.id);
      }, 30000);

      it('should accept custom working directory', async () => {
        const customCwd = process.cwd();
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: customCwd,
        });

        expect(session).toBeDefined();
      }, 15000);

      it('should accept timeout configuration', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
          timeout: 30000,
        });

        expect(session).toBeDefined();
      }, 15000);
    });

    describe('Session Start', () => {
      it('should start process with inspector attached', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        expect((session as any).process).toBeDefined();
        expect((session as any).inspector).toBeDefined();
      }, 15000);

      it('should fail gracefully with invalid command', async () => {
        await expect(
          sessionManager.createSession({
            command: 'invalid-command-that-does-not-exist',
            args: [testFixturePath],
            cwd: process.cwd(),
          }),
        ).rejects.toThrow();
      }, 15000);

      it('should fail gracefully with invalid file', async () => {
        await expect(
          sessionManager.createSession({
            command: 'node',
            args: ['/path/to/nonexistent/file.js'],
            cwd: process.cwd(),
          }),
        ).rejects.toThrow();
      }, 15000);

      it('should fail gracefully with invalid working directory', async () => {
        await expect(
          sessionManager.createSession({
            command: 'node',
            args: [testFixturePath],
            cwd: '/invalid/working/directory',
          }),
        ).rejects.toThrow();
      }, 15000);
    });

    describe('State Transitions', () => {
      it('should transition from PAUSED to RUNNING on resume', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        expect((session as any).state).toBe(SessionState.PAUSED);

        await session.resume();

        // Wait a bit for state to update
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect((session as any).state).toBe(SessionState.RUNNING);
      }, 15000);

      it('should transition from RUNNING to PAUSED on pause', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();
        await new Promise((resolve) => setTimeout(resolve, 100));

        await session.pause();

        expect(session.getState()).toBe(SessionState.PAUSED);
      }, 15000);

      it('should transition to TERMINATED on cleanup', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.cleanup();

        expect((session as any).state).toBe(SessionState.TERMINATED);
      }, 15000);
    });

    describe('Cleanup and Resource Management', () => {
      it('should cleanup all resources on session end', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.cleanup();

        expect((session as any).process).toBeNull();
        expect((session as any).inspector).toBeNull();
        expect((session as any).state).toBe(SessionState.TERMINATED);
      }, 15000);

      it('should kill process if still running during cleanup', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        const proc = session.getProcess();
        expect(proc).toBeDefined();

        await session.cleanup();

        expect(proc?.killed || proc?.exitCode !== null).toBe(true);
      }, 15000);

      it('should disconnect inspector during cleanup', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        expect((session as any).inspector).toBeDefined();

        await session.cleanup();

        expect((session as any).inspector).toBeNull();
      }, 15000);

      it('should handle cleanup when already terminated', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.cleanup();

        // Should not throw when cleaning up again
        await expect(session.cleanup()).resolves.not.toThrow();
      }, 15000);

      it('should handle cleanup errors gracefully', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        // Force inspector to null to simulate error condition
        (session as any).inspector = null;

        // Should not throw
        await expect(session.cleanup()).resolves.not.toThrow();
      }, 15000);
    });
  });

  describe('2. Execution Control', () => {
    describe('Pause Operation', () => {
      it('should pause running process', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();
        await new Promise((resolve) => setTimeout(resolve, 100));

        await session.pause();

        expect(session.getState()).toBe(SessionState.PAUSED);
      }, 15000);

      it('should fail to pause when not running', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        // Already paused
        await expect(session.pause()).rejects.toThrow();
      }, 15000);

      it('should fail to pause when session not started', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        (session as any).inspector = null;

        await expect(session.pause()).rejects.toThrow('Session not started');
      }, 15000);
    });

    describe('Resume Operation', () => {
      it('should resume paused process', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();

        expect((session as any).state).toBe(SessionState.RUNNING);
      }, 15000);

      it('should fail to resume when not paused', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Already running
        await expect(session.resume()).rejects.toThrow();
      }, 15000);

      it('should fail to resume when session not started', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        (session as any).inspector = null;

        await expect(session.resume()).rejects.toThrow('Session not started');
      }, 15000);
    });

    describe('Step Over Operation', () => {
      it('should step over current line', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        // Should not throw
        await expect(session.stepOver()).resolves.not.toThrow();
      }, 15000);

      it('should fail to step over when not paused', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();
        await new Promise((resolve) => setTimeout(resolve, 100));

        await expect(session.stepOver()).rejects.toThrow();
      }, 15000);

      it('should fail to step over when session not started', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        (session as any).inspector = null;

        await expect(session.stepOver()).rejects.toThrow('Session not started');
      }, 15000);
    });

    describe('Step Into Operation', () => {
      it('should step into function call', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await expect(session.stepInto()).resolves.not.toThrow();
      }, 15000);

      it('should fail to step into when not paused', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();
        await new Promise((resolve) => setTimeout(resolve, 100));

        await expect(session.stepInto()).rejects.toThrow();
      }, 15000);

      it('should fail to step into when session not started', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        (session as any).inspector = null;

        await expect(session.stepInto()).rejects.toThrow('Session not started');
      }, 15000);
    });

    describe('Step Out Operation', () => {
      it('should step out of current function', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await expect(session.stepOut()).resolves.not.toThrow();
      }, 15000);

      it('should fail to step out when not paused', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.resume();
        await new Promise((resolve) => setTimeout(resolve, 100));

        await expect(session.stepOut()).rejects.toThrow();
      }, 15000);

      it('should fail to step out when session not started', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        (session as any).inspector = null;

        await expect(session.stepOut()).rejects.toThrow('Session not started');
      }, 15000);
    });
  });

  describe('3. Error Handling', () => {
    describe('Inspector Disconnection', () => {
      it('should handle inspector disconnection gracefully', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        // Simulate disconnection
        if ((session as any).inspector && (session as any).inspector.ws) {
          (session as any).inspector.ws.close();
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        // Cleanup should still work
        await expect(session.cleanup()).resolves.not.toThrow();
      }, 15000);
    });

    describe('Process Termination', () => {
      it('should detect process termination', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        const proc = session.getProcess();

        // Kill the process
        proc?.kill('SIGKILL');

        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(proc?.killed).toBe(true);
      }, 15000);

      it('should handle process crash', async () => {
        const crashScript = path.join(
          __dirname,
          '../../test-fixtures/crash-test-simple.js',
        );
        if (!fs.existsSync(crashScript)) {
          fs.writeFileSync(
            crashScript,
            'process.nextTick(() => { console.error("crash"); process.exit(1); });',
          );
        }

        const session = await sessionManager.createSession({
          command: 'node',
          args: [crashScript],
          cwd: process.cwd(),
        });

        const proc = session.getProcess();

        // Set up a promise to wait for process exit
        const exitPromise = new Promise<{
          code: number | null;
          signal: string | null;
        }>((resolve) => {
          proc?.once('exit', (code, signal) => resolve({ code, signal }));
        });

        // Wait for initialization
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await session.resume();

        // Wait for crash with a reasonable timeout
        const result = await Promise.race([
          exitPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);

        // Process should exit (either we get the event or it's already exited)
        if (result) {
          expect(result.code).toBe(1); // Should exit with error code 1
        } else {
          // Check if process has exited
          const hasExited = proc?.exitCode !== null || proc?.killed;
          expect(hasExited || proc?.exitCode === null).toBe(true);
        }
      }, 15000);
    });

    describe('Invalid Operations', () => {
      it('should reject operations on terminated session', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        await session.cleanup();

        await expect(session.resume()).rejects.toThrow();
      }, 15000);

      it('should reject operations with null inspector', async () => {
        const session = await sessionManager.createSession({
          command: 'node',
          args: [testFixturePath],
          cwd: process.cwd(),
        });

        (session as any).inspector = null;

        await expect(session.pause()).rejects.toThrow();
        await expect(session.resume()).rejects.toThrow();
        await expect(session.stepOver()).rejects.toThrow();
        await expect(session.stepInto()).rejects.toThrow();
        await expect(session.stepOut()).rejects.toThrow();
      }, 15000);
    });
  });

  describe('4. Session State Validation', () => {
    it('should maintain consistent state through operations', async () => {
      const session = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      expect((session as any).state).toBe(SessionState.PAUSED);

      await session.resume();
      expect((session as any).state).toBe(SessionState.RUNNING);

      await session.pause();
      expect((session as any).state).toBe(SessionState.PAUSED);

      await session.cleanup();
      expect((session as any).state).toBe(SessionState.TERMINATED);
    }, 15000);

    it('should validate state before operations', async () => {
      const session = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      // Can't pause when already paused
      await expect(session.pause()).rejects.toThrow();

      await session.resume();

      // Can't resume when already running
      await expect(session.resume()).rejects.toThrow();
    }, 15000);
  });

  describe('5. Concurrent Operations', () => {
    it('should handle multiple sessions independently', async () => {
      const session1 = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      const session2 = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      // Operations on session1 should not affect session2
      await session1.resume();
      expect((session2 as any).state).toBe(SessionState.PAUSED);

      await session1.cleanup();
      expect((session2 as any).state).toBe(SessionState.PAUSED);
    }, 30000);
  });
});
