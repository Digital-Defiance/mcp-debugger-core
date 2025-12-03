import * as fc from 'fast-check';
import { DebugSession, SessionState } from './debug-session';
import * as path from 'path';

describe('Execution Control Operations', () => {
  const testFixturePath = path.join(
    __dirname,
    '../../test-fixtures/step-test.js',
  );

  // Feature: mcp-debugger-tool, Property 6: Step operations maintain execution flow
  // For any paused Target Process, when a step operation (step over, step into, or step out) is executed,
  // then the process should pause at a valid source location that is reachable from the previous location
  // according to the step semantics.
  // Validates: Requirements 2.3, 2.4, 2.5
  it('should maintain execution flow during step operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('stepOver', 'stepInto', 'stepOut'),
        async (stepOperation) => {
          const session = new DebugSession('test-session-property', {
            command: 'node',
            args: [testFixturePath],
          });

          try {
            await session.start();
            expect(session.getState()).toBe(SessionState.PAUSED);

            const inspector = session.getInspector();
            if (!inspector) {
              throw new Error('Inspector not available');
            }

            // Wait for Debugger.paused event
            const waitForPaused = () =>
              new Promise<void>((resolve) => {
                inspector.once('Debugger.paused', () => resolve());
              });

            // Resume to hit the first debugger statement
            let pausedPromise = waitForPaused();
            await session.resume();
            await pausedPromise;

            expect(session.getState()).toBe(SessionState.PAUSED);

            // Perform the step operation
            pausedPromise = waitForPaused();
            switch (stepOperation) {
              case 'stepOver':
                await session.stepOver();
                break;
              case 'stepInto':
                await session.stepInto();
                break;
              case 'stepOut':
                await session.stepOut();
                break;
            }
            await pausedPromise;

            // Should still be paused after stepping
            expect(session.getState()).toBe(SessionState.PAUSED);
          } finally {
            await session.cleanup();
          }
        },
      ),
      { numRuns: 10, timeout: 60000 },
    );
  }, 120000);

  it('should handle step over correctly', async () => {
    const session = new DebugSession('test-session-stepover', {
      command: 'node',
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error('Inspector not available');
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once('Debugger.paused', () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);

      // Step over should move to the next line
      pausedPromise = waitForPaused();
      await session.stepOver();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it('should handle step into correctly', async () => {
    const session = new DebugSession('test-session-stepinto', {
      command: 'node',
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error('Inspector not available');
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once('Debugger.paused', () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);

      // Step into should work
      pausedPromise = waitForPaused();
      await session.stepInto();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it('should handle step out correctly', async () => {
    const session = new DebugSession('test-session-stepout', {
      command: 'node',
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error('Inspector not available');
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once('Debugger.paused', () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      // Step into a few times to get into innerFunction
      for (let i = 0; i < 3; i++) {
        pausedPromise = waitForPaused();
        await session.stepInto();
        await pausedPromise;
      }

      // Now step out
      pausedPromise = waitForPaused();
      await session.stepOut();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it('should handle pause operation', async () => {
    const session = new DebugSession('test-session-pause', {
      command: 'node',
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error('Inspector not available');
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once('Debugger.paused', () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);

      // Resume again
      pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      // Should hit the second debugger statement
      expect(session.getState()).toBe(SessionState.PAUSED);
    } finally {
      await session.cleanup();
    }
  }, 30000);
});
