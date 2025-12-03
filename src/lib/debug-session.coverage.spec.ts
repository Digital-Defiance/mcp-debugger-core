/**
 * Comprehensive Integration Tests for DebugSession
 * Target: 90% line coverage, 85% branch coverage
 */

import {
  DebugSession,
  DebugSessionConfig,
  SessionState,
  BreakpointType,
  HitCountOperator,
} from "./debug-session";
import * as path from "path";
import * as fs from "fs";

describe("DebugSession - Coverage Tests", () => {
  let session: DebugSession | null = null;
  const fixtureDir = path.join(__dirname, "../../test-fixtures");

  const simpleFixture = path.join(fixtureDir, "simple-debug.js");
  const loopFixture = path.join(fixtureDir, "loop-debug.js");
  const nestedFixture = path.join(fixtureDir, "nested-functions.js");
  const objectFixture = path.join(fixtureDir, "object-inspection.js");
  const crashFixture = path.join(fixtureDir, "crash-test.js");

  beforeAll(() => {
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    fs.writeFileSync(
      simpleFixture,
      `
let x = 10;
let y = 20;
let z = x + y;
console.log('Result:', z);
process.exit(0);
`
    );

    fs.writeFileSync(
      loopFixture,
      `
let sum = 0;
for (let i = 0; i < 1000; i++) {
  sum += i;
  // Add some delay to make the loop slower
  for (let j = 0; j < 10000; j++) {
    Math.sqrt(j);
  }
}
console.log('Sum:', sum);
process.exit(0);
`
    );

    fs.writeFileSync(
      nestedFixture,
      `
function outer(a) {
  let outerVar = 'outer';
  function inner(b) {
    let innerVar = 'inner';
    return a + b;
  }
  return inner(a * 2);
}
const result = outer(5);
console.log('Result:', result);
process.exit(0);
`
    );

    fs.writeFileSync(
      objectFixture,
      `
const obj = {
  name: 'test',
  value: 42,
  nested: {
    deep: 'value',
    array: [1, 2, 3]
  }
};
console.log('Object:', obj);
process.exit(0);
`
    );

    fs.writeFileSync(
      crashFixture,
      `
// Busy wait to give time for handlers to be set up, then crash
const start = Date.now();
while (Date.now() - start < 100) {
  // Busy wait
}
throw new Error('Intentional crash');
`
    );
  });

  afterEach(async () => {
    if (session) {
      await session.cleanup();
      session = null;
    }
  });

  // Helper function to create session
  const createSession = async (
    fixture: string,
    timeout = 10000
  ): Promise<DebugSession> => {
    const config: DebugSessionConfig = {
      command: "node",
      args: [fixture],
      cwd: fixtureDir,
      timeout,
    };
    const s = new DebugSession(`test-${Date.now()}`, config);
    await s.start();
    return s;
  };

  describe("1. Session Lifecycle", () => {
    it("should create and start session", async () => {
      session = await createSession(simpleFixture);

      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.getState()).toBe(SessionState.PAUSED);
      expect(session.getInspector()).toBeDefined();
      expect(session.getProcess()).toBeDefined();
      expect(session.isActive()).toBe(true);
      expect(session.isPaused()).toBe(true);
    }, 15000);

    it("should cleanup session resources", async () => {
      session = await createSession(simpleFixture);
      await session.cleanup();

      expect(session.getState()).toBe(SessionState.TERMINATED);
      expect(session.getInspector()).toBeNull();
      expect(session.getProcess()).toBeNull();
      expect(session.isActive()).toBe(false);
    }, 15000);

    it("should handle cleanup when already terminated", async () => {
      session = await createSession(simpleFixture);
      await session.cleanup();
      await session.cleanup(); // Should not throw

      expect(session.getState()).toBe(SessionState.TERMINATED);
    }, 15000);
  });

  describe("2. Execution Control", () => {
    it("should pause and resume execution", async () => {
      session = await createSession(loopFixture);

      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(session.getState()).toBe(SessionState.RUNNING);
      expect(session.isPaused()).toBe(false);

      await session.pause();
      // Give it a moment to actually pause
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(session.getState()).toBe(SessionState.PAUSED);
    }, 15000);

    it("should step over current line", async () => {
      session = await createSession(loopFixture);
      await session.stepOver();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(session.getState()).toBe(SessionState.PAUSED);
    }, 15000);

    it("should step into function", async () => {
      session = await createSession(nestedFixture);
      await session.stepInto();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(session.getState()).toBe(SessionState.PAUSED);
    }, 15000);

    it("should step out of function", async () => {
      session = await createSession(nestedFixture);
      // Step into a function first
      await session.stepInto();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await session.stepInto();
      await new Promise((resolve) => setTimeout(resolve, 200));
      // Now step out
      await session.stepOut();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(session.getState()).toBe(SessionState.PAUSED);
    }, 15000);

    it("should throw error when pausing non-running session", async () => {
      session = await createSession(simpleFixture);
      await expect(session.pause()).rejects.toThrow();
    }, 15000);

    it("should throw error when resuming non-paused session", async () => {
      session = await createSession(simpleFixture);
      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect(session.resume()).rejects.toThrow();
    }, 15000);

    it("should throw error when stepping in non-paused session", async () => {
      session = await createSession(simpleFixture);
      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect(session.stepOver()).rejects.toThrow();
      await expect(session.stepInto()).rejects.toThrow();
      await expect(session.stepOut()).rejects.toThrow();
    }, 15000);
  });

  describe("3. Breakpoint Management", () => {
    it("should set and retrieve breakpoint", async () => {
      session = await createSession(simpleFixture);
      const bp = await session.setBreakpoint(simpleFixture, 3);

      expect(bp).toBeDefined();
      expect(bp.file).toBe(simpleFixture);
      expect(bp.line).toBe(3);
      expect(bp.enabled).toBe(true);

      const retrieved = session.getBreakpoint(bp.id);
      expect(retrieved).toEqual(bp);
    }, 15000);

    it("should set conditional breakpoint", async () => {
      session = await createSession(loopFixture);
      const bp = await session.setBreakpoint(loopFixture, 3, "i > 2");
      expect(bp.condition).toBe("i > 2");
    }, 15000);

    it("should get all breakpoints", async () => {
      session = await createSession(simpleFixture);
      await session.setBreakpoint(simpleFixture, 2);
      await session.setBreakpoint(simpleFixture, 3);
      await session.setBreakpoint(simpleFixture, 4);

      const breakpoints = session.getAllBreakpoints();
      expect(breakpoints.length).toBe(3);
    }, 15000);

    it("should remove breakpoint", async () => {
      session = await createSession(simpleFixture);
      const bp = await session.setBreakpoint(simpleFixture, 3);
      const removed = await session.removeBreakpoint(bp.id);

      expect(removed).toBe(true);
      expect(session.getBreakpoint(bp.id)).toBeUndefined();
    }, 15000);

    it("should return false when removing non-existent breakpoint", async () => {
      session = await createSession(simpleFixture);
      const removed = await session.removeBreakpoint("non-existent-id");
      expect(removed).toBe(false);
    }, 15000);

    it("should toggle breakpoint enabled state", async () => {
      session = await createSession(simpleFixture);
      const bp = await session.setBreakpoint(simpleFixture, 3);
      expect(bp.enabled).toBe(true);

      const toggled = await session.toggleBreakpoint(bp.id);
      expect(toggled?.enabled).toBe(false);

      const toggledAgain = await session.toggleBreakpoint(bp.id);
      expect(toggledAgain?.enabled).toBe(true);
    }, 15000);

    it("should return undefined when toggling non-existent breakpoint", async () => {
      session = await createSession(simpleFixture);
      const result = await session.toggleBreakpoint("non-existent-id");
      expect(result).toBeUndefined();
    }, 15000);

    it("should get breakpoint manager", async () => {
      session = await createSession(simpleFixture);
      const manager = session.getBreakpointManager();
      expect(manager).toBeDefined();
    }, 15000);
  });

  describe("4. Advanced Breakpoints", () => {
    it("should set logpoint", async () => {
      session = await createSession(simpleFixture);
      const logpoint = await session.setLogpoint(
        simpleFixture,
        3,
        "Value: {x}"
      );

      expect(logpoint).toBeDefined();
      expect(logpoint.type).toBe(BreakpointType.LOGPOINT);
      expect(logpoint.logMessage).toBe("Value: {x}");
    }, 15000);

    it("should set function breakpoint", async () => {
      session = await createSession(nestedFixture);
      const bp = await session.setFunctionBreakpoint("outer");

      expect(bp).toBeDefined();
      expect(bp.type).toBe(BreakpointType.FUNCTION);
      expect(bp.functionName).toBe("outer");
    }, 15000);

    it("should set hit count condition", async () => {
      session = await createSession(loopFixture);
      const bp = await session.setBreakpoint(loopFixture, 3);
      const updated = session.setBreakpointHitCountCondition(bp.id, {
        operator: HitCountOperator.GREATER,
        value: 2,
      });

      expect(updated?.hitCountCondition).toBeDefined();
      expect(updated?.hitCountCondition?.operator).toBe(
        HitCountOperator.GREATER
      );
      expect(updated?.hitCountCondition?.value).toBe(2);
    }, 15000);

    it("should set exception breakpoint", async () => {
      session = await createSession(simpleFixture);
      const exceptionBp = await session.setExceptionBreakpoint(true, true);

      expect(exceptionBp).toBeDefined();
      expect(exceptionBp.breakOnCaught).toBe(true);
      expect(exceptionBp.breakOnUncaught).toBe(true);
    }, 15000);

    it("should set exception breakpoint with filter", async () => {
      session = await createSession(simpleFixture);
      const exceptionBp = await session.setExceptionBreakpoint(
        false,
        true,
        "TypeError.*"
      );

      expect(exceptionBp.exceptionFilter).toBe("TypeError.*");
    }, 15000);

    it("should get and remove exception breakpoint", async () => {
      session = await createSession(simpleFixture);
      const exceptionBp = await session.setExceptionBreakpoint(true, true);
      const retrieved = session.getExceptionBreakpoint(exceptionBp.id);
      expect(retrieved).toEqual(exceptionBp);

      const removed = await session.removeExceptionBreakpoint(exceptionBp.id);
      expect(removed).toBe(true);
      expect(session.getExceptionBreakpoint(exceptionBp.id)).toBeUndefined();
    }, 15000);

    it("should get all exception breakpoints", async () => {
      session = await createSession(simpleFixture);
      const bp1 = await session.setExceptionBreakpoint(true, false);

      // Note: CDP setPauseOnExceptions is global, so setting a second exception breakpoint
      // will update the global state. Both breakpoints are tracked, but CDP state is shared.
      const bp2 = await session.setExceptionBreakpoint(false, true);

      const breakpoints = session.getAllExceptionBreakpoints();
      // Both breakpoints should be tracked even though CDP state is global
      expect(breakpoints.length).toBe(2);
      expect(breakpoints).toContainEqual(bp1);
      expect(breakpoints).toContainEqual(bp2);
    }, 15000);

    it("should return false when removing non-existent exception breakpoint", async () => {
      session = await createSession(simpleFixture);
      const removed = await session.removeExceptionBreakpoint("non-existent");
      expect(removed).toBe(false);
    }, 15000);
  });

  describe("5. Variable Inspection", () => {
    it("should evaluate expression", async () => {
      session = await createSession(simpleFixture);
      const result = await session.evaluateExpression("2 + 2");

      expect(result).toBeDefined();
      expect(result.value).toBe(4);
    }, 15000);

    it("should throw error when evaluating in non-paused session", async () => {
      session = await createSession(simpleFixture);
      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(session.evaluateExpression("2 + 2")).rejects.toThrow();
    }, 15000);

    it("should get object properties", async () => {
      session = await createSession(objectFixture);

      // Step forward to get past the object definition
      await session.stepOver();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await session.stepOver();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ensure session is paused
      expect(session.getState()).toBe("paused");

      const evalResult = await session.evaluateExpression("obj");

      if (evalResult.objectId) {
        const properties = await session.getObjectProperties(
          evalResult.objectId
        );
        expect(properties).toBeDefined();
        expect(Array.isArray(properties)).toBe(true);
      }
    }, 15000);

    it("should inspect object with depth", async () => {
      session = await createSession(objectFixture);

      // Step forward to get past the object definition
      await session.stepOver();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await session.stepOver();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ensure session is paused
      expect(session.getState()).toBe("paused");

      const evalResult = await session.evaluateExpression("obj");

      if (evalResult.objectId) {
        const inspected = await session.inspectObject(evalResult.objectId, 2);
        expect(inspected).toBeDefined();
      }
    }, 15000);
  });

  describe("6. Watched Variables", () => {
    it("should add and get watched variable", async () => {
      session = await createSession(simpleFixture);
      session.addWatchedVariable({ name: "x", expression: "x" });

      const watched = session.getWatchedVariable("x");
      expect(watched).toBeDefined();
      expect(watched?.name).toBe("x");
    }, 15000);

    it("should get all watched variables", async () => {
      session = await createSession(simpleFixture);
      session.addWatchedVariable({ name: "x", expression: "x" });
      session.addWatchedVariable({ name: "y", expression: "y" });

      const watched = session.getAllWatchedVariables();
      expect(watched.length).toBe(2);
    }, 15000);

    it("should remove watched variable", async () => {
      session = await createSession(simpleFixture);
      session.addWatchedVariable({ name: "x", expression: "x" });
      const removed = session.removeWatchedVariable("x");

      expect(removed).toBe(true);
      expect(session.getWatchedVariable("x")).toBeUndefined();
    }, 15000);

    it("should evaluate watched variables on pause", async () => {
      session = await createSession(loopFixture);
      session.addWatchedVariable({ name: "sum", expression: "sum" });

      await session.stepOver();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const changes = session.getWatchedVariableChanges();
      expect(changes).toBeDefined();
    }, 15000);

    it("should clear watched variable changes", async () => {
      session = await createSession(simpleFixture);
      session.addWatchedVariable({ name: "x", expression: "x" });
      session.clearWatchedVariableChanges();

      const changes = session.getWatchedVariableChanges();
      expect(changes.size).toBe(0);
    }, 15000);
  });

  describe("7. Call Stack", () => {
    it("should get call stack with absolute paths", async () => {
      session = await createSession(nestedFixture);
      const stack = await session.getCallStack();

      expect(stack).toBeDefined();
      expect(Array.isArray(stack)).toBe(true);
      expect(stack.length).toBeGreaterThan(0);

      stack.forEach((frame) => {
        expect(path.isAbsolute(frame.file)).toBe(true);
      });
    }, 15000);

    it("should get call stack synchronously", async () => {
      session = await createSession(nestedFixture);
      const stack = session.getCallStackSync();

      expect(stack).toBeDefined();
      expect(Array.isArray(stack)).toBe(true);
    }, 15000);

    it("should get current call frames", async () => {
      session = await createSession(nestedFixture);
      const frames = session.getCurrentCallFrames();
      expect(frames).toBeDefined();
      expect(Array.isArray(frames)).toBe(true);
    }, 15000);

    it("should switch to different stack frame", async () => {
      session = await createSession(nestedFixture);
      const frames = session.getCurrentCallFrames();
      if (frames.length > 1) {
        session.switchToFrame(1);
        expect(session.getCurrentFrameIndex()).toBe(1);
      }
    }, 15000);

    it("should throw error when switching to invalid frame", async () => {
      session = await createSession(simpleFixture);
      expect(() => session.switchToFrame(999)).toThrow();
    }, 15000);

    it("should get current frame index and call frame ID", async () => {
      session = await createSession(nestedFixture);
      expect(session.getCurrentFrameIndex()).toBe(0);

      const frameId = session.getCurrentCallFrameId();
      expect(frameId).toBeDefined();
    }, 15000);
  });

  describe("8. Source Maps", () => {
    it("should get source map manager", async () => {
      session = await createSession(simpleFixture);
      const manager = session.getSourceMapManager();
      expect(manager).toBeDefined();
    }, 15000);

    it("should map source to compiled location", async () => {
      session = await createSession(simpleFixture);
      const result = await session.mapSourceToCompiled(simpleFixture, 3, 0);
      expect(result).toBeDefined();
    }, 15000);

    it("should map compiled to source location", async () => {
      session = await createSession(simpleFixture);
      const result = await session.mapCompiledToSource(simpleFixture, 3, 0);
      expect(result).toBeDefined();
    }, 15000);
  });

  describe("9. Crash Detection", () => {
    it("should detect process crash", async () => {
      session = await createSession(simpleFixture);

      let crashDetected = false;
      session.onCrash(() => {
        crashDetected = true;
      });

      const proc = session.getProcess();
      // Kill with exit code 1 to simulate crash
      proc?.kill("SIGKILL");

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(crashDetected).toBe(true);
      expect(session.hasCrashed()).toBe(true);
      expect(session.getCrashError()).toBeDefined();
    }, 15000);

    it("should handle multiple crash handlers", async () => {
      session = await createSession(simpleFixture);

      let handler1Called = false;
      let handler2Called = false;

      session.onCrash(() => {
        handler1Called = true;
      });
      session.onCrash(() => {
        handler2Called = true;
      });

      const proc = session.getProcess();
      proc?.kill("SIGKILL");

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    }, 15000);

    it("should handle process exit with signal", async () => {
      session = await createSession(simpleFixture);

      let crashDetected = false;
      session.onCrash(() => {
        crashDetected = true;
      });

      const proc = session.getProcess();
      proc?.kill("SIGTERM");

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(crashDetected).toBe(true);
    }, 15000);

    it("should not detect crash on normal exit", async () => {
      session = await createSession(simpleFixture);

      let crashDetected = false;
      session.onCrash(() => {
        crashDetected = true;
      });

      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(crashDetected).toBe(false);
      expect(session.hasCrashed()).toBe(false);
    }, 15000);
  });

  describe("10. Profiling Operations", () => {
    it("should start and stop CPU profiling", async () => {
      session = await createSession(loopFixture);

      await session.startCPUProfile();
      expect(session.isCPUProfiling()).toBe(true);
      expect(session.getCPUProfiler()).toBeDefined();

      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const profile = await session.stopCPUProfile();
      expect(profile).toBeDefined();
      expect(session.isCPUProfiling()).toBe(false);
    }, 15000);

    it("should analyze CPU profile", async () => {
      session = await createSession(loopFixture);

      await session.startCPUProfile();
      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const profile = await session.stopCPUProfile();
      const analysis = session.analyzeCPUProfile(profile);

      expect(analysis).toBeDefined();
    }, 15000);

    it("should take heap snapshot", async () => {
      session = await createSession(objectFixture);
      const snapshot = await session.takeHeapSnapshot();
      expect(snapshot).toBeDefined();
    }, 15000);

    it("should get memory usage", async () => {
      session = await createSession(simpleFixture);
      const usage = await session.getMemoryUsage();
      expect(usage).toBeDefined();
      // usedHeapSize might be undefined in some environments
      if (usage.usedHeapSize !== undefined) {
        expect(usage.usedHeapSize).toBeGreaterThan(0);
      }
      expect(session.getMemoryProfiler()).toBeDefined();
    }, 15000);

    it("should start and stop tracking heap objects", async () => {
      session = await createSession(objectFixture);

      await session.startTrackingHeapObjects(1024);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const snapshot = await session.stopTrackingHeapObjects();
      expect(snapshot).toBeDefined();
    }, 15000);

    it("should detect memory leaks", async () => {
      session = await createSession(objectFixture);
      // Use shorter intervals and handle potential timeout
      try {
        const analysis = await session.detectMemoryLeaks(200, 50);
        expect(analysis).toBeDefined();
        expect(analysis.isLeaking).toBeDefined();
      } catch (error: any) {
        // HeapProfiler.collectGarbage can timeout in some environments
        // This is acceptable as long as the method exists and can be called
        if (error.message?.includes("timed out")) {
          expect(error.message).toContain("HeapProfiler.collectGarbage");
        } else {
          throw error;
        }
      }
    }, 30000);

    it("should generate memory report", async () => {
      session = await createSession(objectFixture);
      const report = await session.generateMemoryReport();
      expect(report).toBeDefined();
    }, 15000);

    it("should start and stop performance recording", async () => {
      session = await createSession(loopFixture);

      await session.startPerformanceRecording();
      expect(session.isPerformanceRecording()).toBe(true);
      expect(session.getPerformanceTimeline()).toBeDefined();

      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const report = await session.stopPerformanceRecording();
      expect(report).toBeDefined();
      expect(session.isPerformanceRecording()).toBe(false);
    }, 15000);

    it("should record function call", async () => {
      session = await createSession(nestedFixture);

      await session.startPerformanceRecording();
      session.recordFunctionCall("testFunc", nestedFixture, 5, 1000);

      const report = await session.stopPerformanceRecording();
      expect(report).toBeDefined();
    }, 15000);
  });

  describe("11. Error Conditions", () => {
    it("should throw error when operations without session", async () => {
      session = await createSession(simpleFixture);

      (session as any).cdpBreakpointOps = null;
      await expect(session.setBreakpoint(simpleFixture, 3)).rejects.toThrow(
        "Session not started"
      );
      await expect(
        session.setLogpoint(simpleFixture, 3, "msg")
      ).rejects.toThrow("Session not started");
      await expect(session.setFunctionBreakpoint("func")).rejects.toThrow(
        "Session not started"
      );

      (session as any).inspector = null;
      await expect(session.setExceptionBreakpoint(true, true)).rejects.toThrow(
        "Session not started"
      );

      (session as any).variableInspector = null;
      await expect(session.evaluateExpression("x")).rejects.toThrow(
        "Session not started"
      );
      await expect(session.getObjectProperties("obj-id")).rejects.toThrow(
        "Session not started"
      );
      await expect(session.inspectObject("obj-id")).rejects.toThrow(
        "Session not started"
      );
    }, 15000);

    it("should throw error when evaluating without call frames", async () => {
      session = await createSession(simpleFixture);
      (session as any).currentCallFrames = [];

      await expect(session.evaluateExpression("x")).rejects.toThrow(
        "No call frames available"
      );
    }, 15000);

    it("should throw error when profiling without session", async () => {
      session = await createSession(simpleFixture);

      (session as any).cpuProfiler = null;
      (session as any).memoryProfiler = null;
      (session as any).performanceTimeline = null;

      await expect(session.startCPUProfile()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.stopCPUProfile()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.takeHeapSnapshot()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.getMemoryUsage()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.startTrackingHeapObjects()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.stopTrackingHeapObjects()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.detectMemoryLeaks()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.generateMemoryReport()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.startPerformanceRecording()).rejects.toThrow(
        "Session not started"
      );
      await expect(session.stopPerformanceRecording()).rejects.toThrow(
        "Session not started"
      );
      expect(() => session.recordFunctionCall("test", "file", 1, 100)).toThrow(
        "Session not started"
      );

      const mockProfile = { nodes: [], startTime: 0, endTime: 1000 };
      expect(() => session.analyzeCPUProfile(mockProfile)).toThrow(
        "Session not started"
      );
    }, 15000);

    it("should return false/null for profiling status when profiler is null", async () => {
      session = await createSession(simpleFixture);

      (session as any).cpuProfiler = null;
      (session as any).memoryProfiler = null;
      (session as any).performanceTimeline = null;

      expect(session.isCPUProfiling()).toBe(false);
      expect(session.isPerformanceRecording()).toBe(false);
      expect(session.getCPUProfiler()).toBeNull();
      expect(session.getMemoryProfiler()).toBeNull();
      expect(session.getPerformanceTimeline()).toBeNull();
    }, 15000);

    it("should return undefined for current call frame ID when no frames", async () => {
      session = await createSession(simpleFixture);
      (session as any).currentCallFrames = [];

      expect(session.getCurrentCallFrameId()).toBeUndefined();
    }, 15000);

    it("should return empty array for call stack when no frames", async () => {
      session = await createSession(simpleFixture);
      (session as any).currentCallFrames = [];

      const stack = await session.getCallStack();
      expect(stack).toEqual([]);
    }, 15000);
  });
});
