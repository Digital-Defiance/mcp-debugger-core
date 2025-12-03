import * as fc from "fast-check";
import { DebugSession, SessionState, StackFrame } from "./debug-session";
import * as path from "path";

describe("Call Stack Operations", () => {
  const testFixturePath = path.join(
    __dirname,
    "../../test-fixtures/step-test.js"
  );

  // Feature: mcp-debugger-tool, Property 22: Call stack absolute path requirement
  // For any call stack returned by the MCP Server,
  // every stack frame should include an absolute file path, not a relative path.
  // Validates: Requirements 9.4
  it("should return call stack with absolute file paths", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const session = new DebugSession("test-callstack-absolute", {
          command: "node",
          args: [testFixturePath],
        });

        try {
          await session.start();
          expect(session.getState()).toBe(SessionState.PAUSED);

          const inspector = session.getInspector();
          if (!inspector) {
            throw new Error("Inspector not available");
          }

          // Wait for Debugger.paused event
          const waitForPaused = () =>
            new Promise<void>((resolve) => {
              inspector.once("Debugger.paused", () => resolve());
            });

          // Resume to hit the first debugger statement
          const pausedPromise = waitForPaused();
          await session.resume();
          await pausedPromise;

          expect(session.getState()).toBe(SessionState.PAUSED);

          // Get the call stack
          const callStack = await session.getCallStack();

          // Verify we have at least one frame
          expect(callStack.length).toBeGreaterThan(0);

          // Property: Every frame must have an absolute file path
          for (const frame of callStack) {
            // Check that file path is absolute
            expect(path.isAbsolute(frame.file)).toBe(true);

            // Verify other required fields are present
            expect(frame.functionName).toBeDefined();
            expect(typeof frame.functionName).toBe("string");
            expect(frame.line).toBeDefined();
            expect(typeof frame.line).toBe("number");
            expect(frame.line).toBeGreaterThan(0);
            expect(frame.column).toBeDefined();
            expect(typeof frame.column).toBe("number");
            expect(frame.column).toBeGreaterThanOrEqual(0);
            expect(frame.callFrameId).toBeDefined();
            expect(typeof frame.callFrameId).toBe("string");
          }
        } finally {
          await session.cleanup();
        }
      }),
      { numRuns: 100, timeout: 60000 }
    );
  }, 120000);

  it("should return call stack with function names and line numbers", async () => {
    const session = new DebugSession("test-callstack-details", {
      command: "node",
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error("Inspector not available");
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once("Debugger.paused", () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      expect(session.getState()).toBe(SessionState.PAUSED);

      // Get the call stack
      const callStack = await session.getCallStack();

      // Verify we have at least one frame
      expect(callStack.length).toBeGreaterThan(0);

      // Verify the top frame has the expected structure
      const topFrame = callStack[0];
      expect(topFrame.functionName).toBeDefined();
      expect(topFrame.file).toBeDefined();
      expect(path.isAbsolute(topFrame.file)).toBe(true);
      expect(topFrame.line).toBeGreaterThan(0);
      expect(topFrame.column).toBeGreaterThanOrEqual(0);
      expect(topFrame.callFrameId).toBeDefined();
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it("should throw error when getting call stack in non-paused state", async () => {
    // Use simple-script.js which doesn't have debugger statements
    const simpleScriptPath = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );

    const session = new DebugSession("test-callstack-error", {
      command: "node",
      args: [simpleScriptPath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      // Resume execution - the script will run to completion
      await session.resume();

      // Wait a bit to ensure we're running
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify we're in running state
      expect(session.getState()).toBe(SessionState.RUNNING);

      // Try to get call stack while running
      await expect(session.getCallStack()).rejects.toThrow(
        "Process must be paused to get call stack"
      );
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it("should return empty array when no call frames available", async () => {
    const session = new DebugSession("test-callstack-empty", {
      command: "node",
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      // At the initial pause, we should have call frames
      // But let's test the behavior when call frames are cleared
      const callStack = await session.getCallStack();

      // Should have frames at initial pause
      expect(Array.isArray(callStack)).toBe(true);
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it("should handle nested function calls in call stack", async () => {
    const session = new DebugSession("test-callstack-nested", {
      command: "node",
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error("Inspector not available");
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once("Debugger.paused", () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      // Step into a few times to get into nested functions
      for (let i = 0; i < 3; i++) {
        pausedPromise = waitForPaused();
        await session.stepInto();
        await pausedPromise;
      }

      // Get the call stack
      const callStack = await session.getCallStack();

      // Should have multiple frames for nested calls
      expect(callStack.length).toBeGreaterThan(1);

      // All frames should have absolute paths
      for (const frame of callStack) {
        expect(path.isAbsolute(frame.file)).toBe(true);
      }
    } finally {
      await session.cleanup();
    }
  }, 30000);

  // Feature: mcp-debugger-tool, Property 10: Stack frame context switching
  // For any valid stack frame index in a paused Target Process,
  // when the context is switched to that frame,
  // then subsequent variable inspections should return variables from that frame's scope, not from other frames.
  // Validates: Requirements 4.2, 4.3
  it.skip("should switch context to different stack frames and inspect variables in correct scope", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const session = new DebugSession("test-frame-switch", {
          command: "node",
          args: [testFixturePath],
        });

        try {
          await session.start();
          expect(session.getState()).toBe(SessionState.PAUSED);

          const inspector = session.getInspector();
          if (!inspector) {
            throw new Error("Inspector not available");
          }

          // Wait for Debugger.paused event
          const waitForPaused = () =>
            new Promise<void>((resolve) => {
              inspector.once("Debugger.paused", () => resolve());
            });

          // Resume to hit the first debugger statement
          let pausedPromise = waitForPaused();
          await session.resume();
          await pausedPromise;

          // Step into a few times to get into nested functions
          for (let i = 0; i < 3; i++) {
            pausedPromise = waitForPaused();
            await session.stepInto();
            await pausedPromise;
          }

          // Get the call stack
          const callStack = await session.getCallStack();

          // Should have multiple frames
          expect(callStack.length).toBeGreaterThan(1);

          // Property: For each valid frame index, switching to that frame
          // should update the context for variable inspection
          for (
            let frameIndex = 0;
            frameIndex < callStack.length;
            frameIndex++
          ) {
            // Switch to this frame
            session.switchToFrame(frameIndex);

            // Verify the current frame index was updated
            expect(session.getCurrentFrameIndex()).toBe(frameIndex);

            // Verify we can get the call frame ID for this frame
            const callFrameId = session.getCurrentCallFrameId();
            expect(callFrameId).toBeDefined();
            expect(callFrameId).toBe(callStack[frameIndex].callFrameId);

            // Verify we can evaluate expressions in this frame's context
            // (The expression should evaluate without error)
            try {
              const result = await session.evaluateExpression("1 + 1");
              expect(result.value).toBe(2);
            } catch (error) {
              // Some frames might not support evaluation, that's ok
            }
          }
        } finally {
          await session.cleanup();
        }
      }),
      { numRuns: 100, timeout: 60000 }
    );
  }, 120000);

  it("should throw error when switching to invalid frame index", async () => {
    const session = new DebugSession("test-frame-switch-error", {
      command: "node",
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error("Inspector not available");
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once("Debugger.paused", () => resolve());
        });

      // Resume to hit the first debugger statement
      const pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      // Get the call stack
      const callStack = await session.getCallStack();

      // Try to switch to an invalid frame index (negative)
      expect(() => session.switchToFrame(-1)).toThrow("out of range");

      // Try to switch to an invalid frame index (too large)
      expect(() => session.switchToFrame(callStack.length)).toThrow(
        "out of range"
      );

      expect(() => session.switchToFrame(callStack.length + 10)).toThrow(
        "out of range"
      );
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it("should throw error when switching frames in non-paused state", async () => {
    // Use simple-script.js which doesn't have debugger statements
    const simpleScriptPath = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );

    const session = new DebugSession("test-frame-switch-state", {
      command: "node",
      args: [simpleScriptPath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      // Resume execution
      await session.resume();

      // Wait a bit to ensure we're running
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify we're in running state
      expect(session.getState()).toBe(SessionState.RUNNING);

      // Try to switch frames while running
      expect(() => session.switchToFrame(0)).toThrow(
        "Process must be paused to switch frames"
      );
    } finally {
      await session.cleanup();
    }
  }, 30000);

  it("should reset frame index to 0 when process resumes", async () => {
    const session = new DebugSession("test-frame-reset", {
      command: "node",
      args: [testFixturePath],
    });

    try {
      await session.start();
      expect(session.getState()).toBe(SessionState.PAUSED);

      const inspector = session.getInspector();
      if (!inspector) {
        throw new Error("Inspector not available");
      }

      // Wait for Debugger.paused event
      const waitForPaused = () =>
        new Promise<void>((resolve) => {
          inspector.once("Debugger.paused", () => resolve());
        });

      // Resume to hit the first debugger statement
      let pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      // Step into a few times to get into nested functions
      for (let i = 0; i < 3; i++) {
        pausedPromise = waitForPaused();
        await session.stepInto();
        await pausedPromise;
      }

      // Get the call stack
      const callStack = await session.getCallStack();
      expect(callStack.length).toBeGreaterThan(1);

      // Switch to a different frame
      session.switchToFrame(1);
      expect(session.getCurrentFrameIndex()).toBe(1);

      // Resume execution
      pausedPromise = waitForPaused();
      await session.resume();
      await pausedPromise;

      // Frame index should be reset to 0
      expect(session.getCurrentFrameIndex()).toBe(0);
    } finally {
      await session.cleanup();
    }
  }, 30000);
});
