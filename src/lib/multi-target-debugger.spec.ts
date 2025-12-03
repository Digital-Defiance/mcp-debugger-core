import { MultiTargetDebugger, DebugTarget } from "./multi-target-debugger";
import { DebugSession } from "./debug-session";
import { EventEmitter } from "events";

// Mock DebugSession
class MockDebugSession extends EventEmitter {
  private breakpoints: Array<{
    id: string;
    file: string;
    line: number;
    condition?: string;
  }> = [];
  private nextBpId = 1;

  async setBreakpoint(
    file: string,
    line: number,
    condition?: string
  ): Promise<string> {
    const id = `bp-${this.nextBpId++}`;
    this.breakpoints.push({ id, file, line, condition });
    return id;
  }

  async removeBreakpoint(id: string): Promise<void> {
    this.breakpoints = this.breakpoints.filter((bp) => bp.id !== id);
  }

  async listBreakpoints() {
    return this.breakpoints;
  }

  async continue(): Promise<void> {
    // Mock implementation
  }

  async pause(): Promise<void> {
    // Mock implementation
  }

  async stop(): Promise<void> {
    // Mock implementation
  }
}

describe("MultiTargetDebugger", () => {
  let multiDebugger: MultiTargetDebugger;

  beforeEach(() => {
    multiDebugger = new MultiTargetDebugger();
  });

  describe("addTarget", () => {
    it("should add a debug target", () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const target = multiDebugger.getTarget("target1");
      expect(target).toBeDefined();
      expect(target?.name).toBe("Target 1");
      expect(target?.children).toEqual([]);
    });

    it("should throw error when adding duplicate target", () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      expect(() => {
        multiDebugger.addTarget("target1", "Target 1 Duplicate", session);
      }).toThrow("Target already exists");
    });

    it("should set up parent-child relationship", () => {
      const parentSession = new MockDebugSession() as unknown as DebugSession;
      const childSession = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("parent", "Parent", parentSession);
      multiDebugger.addTarget("child", "Child", childSession, "parent");

      const parent = multiDebugger.getTarget("parent");
      const child = multiDebugger.getTarget("child");

      expect(parent?.children).toContain("child");
      expect(child?.parentId).toBe("parent");
    });

    it("should emit target-added event", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.on("target-added", (target: DebugTarget) => {
        expect(target.id).toBe("target1");
        expect(target.name).toBe("Target 1");
        done();
      });

      multiDebugger.addTarget("target1", "Target 1", session);
    });
  });

  describe("removeTarget", () => {
    it("should remove a debug target", () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const removed = multiDebugger.removeTarget("target1");
      expect(removed).toBe(true);
      expect(multiDebugger.getTarget("target1")).toBeUndefined();
    });

    it("should return false when removing non-existent target", () => {
      const removed = multiDebugger.removeTarget("non-existent");
      expect(removed).toBe(false);
    });

    it("should remove children when removing parent", () => {
      const parentSession = new MockDebugSession() as unknown as DebugSession;
      const childSession = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("parent", "Parent", parentSession);
      multiDebugger.addTarget("child", "Child", childSession, "parent");

      multiDebugger.removeTarget("parent");

      expect(multiDebugger.getTarget("parent")).toBeUndefined();
      expect(multiDebugger.getTarget("child")).toBeUndefined();
    });

    it("should update parent when removing child", () => {
      const parentSession = new MockDebugSession() as unknown as DebugSession;
      const childSession = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("parent", "Parent", parentSession);
      multiDebugger.addTarget("child", "Child", childSession, "parent");

      multiDebugger.removeTarget("child");

      const parent = multiDebugger.getTarget("parent");
      expect(parent?.children).not.toContain("child");
    });

    it("should emit target-removed event", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      multiDebugger.on("target-removed", (id: string) => {
        expect(id).toBe("target1");
        done();
      });

      multiDebugger.removeTarget("target1");
    });
  });

  describe("getAllTargets", () => {
    it("should return all targets", () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      const targets = multiDebugger.getAllTargets();
      expect(targets).toHaveLength(2);
      expect(targets.map((t) => t.id).sort()).toEqual(["target1", "target2"]);
    });

    it("should return empty array when no targets", () => {
      const targets = multiDebugger.getAllTargets();
      expect(targets).toEqual([]);
    });
  });

  describe("getRootTargets", () => {
    it("should return only root targets", () => {
      const parentSession = new MockDebugSession() as unknown as DebugSession;
      const childSession = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("parent", "Parent", parentSession);
      multiDebugger.addTarget("child", "Child", childSession, "parent");

      const roots = multiDebugger.getRootTargets();
      expect(roots).toHaveLength(1);
      expect(roots[0].id).toBe("parent");
    });

    it("should return all targets when none have parents", () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      const roots = multiDebugger.getRootTargets();
      expect(roots).toHaveLength(2);
    });
  });

  describe("getChildren", () => {
    it("should return children of a target", () => {
      const parentSession = new MockDebugSession() as unknown as DebugSession;
      const child1Session = new MockDebugSession() as unknown as DebugSession;
      const child2Session = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("parent", "Parent", parentSession);
      multiDebugger.addTarget("child1", "Child 1", child1Session, "parent");
      multiDebugger.addTarget("child2", "Child 2", child2Session, "parent");

      const children = multiDebugger.getChildren("parent");
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.id).sort()).toEqual(["child1", "child2"]);
    });

    it("should return empty array for target with no children", () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const children = multiDebugger.getChildren("target1");
      expect(children).toEqual([]);
    });

    it("should return empty array for non-existent target", () => {
      const children = multiDebugger.getChildren("non-existent");
      expect(children).toEqual([]);
    });
  });

  describe("setGlobalBreakpoint", () => {
    it("should set breakpoint on multiple targets", async () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      const bpId = await multiDebugger.setGlobalBreakpoint("test.js", 10, [
        "target1",
        "target2",
      ]);

      expect(bpId).toBeDefined();

      const breakpoints = multiDebugger.getGlobalBreakpoints();
      const bp = breakpoints.get(bpId);

      expect(bp).toBeDefined();
      expect(bp?.file).toBe("test.js");
      expect(bp?.line).toBe(10);
      expect(bp?.targets).toEqual(["target1", "target2"]);
    });

    it("should handle conditional breakpoints", async () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const bpId = await multiDebugger.setGlobalBreakpoint(
        "test.js",
        10,
        ["target1"],
        "x > 5"
      );

      const breakpoints = multiDebugger.getGlobalBreakpoints();
      const bp = breakpoints.get(bpId);

      expect(bp?.condition).toBe("x > 5");
    });

    it("should skip non-existent targets", async () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const bpId = await multiDebugger.setGlobalBreakpoint("test.js", 10, [
        "target1",
        "non-existent",
      ]);

      const breakpoints = multiDebugger.getGlobalBreakpoints();
      const bp = breakpoints.get(bpId);

      expect(bp?.targets).toEqual(["target1"]);
    });

    it("should emit global-breakpoint-set event", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      multiDebugger.on("global-breakpoint-set", (bpId: string, bp: any) => {
        expect(bpId).toBeDefined();
        expect(bp.file).toBe("test.js");
        done();
      });

      multiDebugger.setGlobalBreakpoint("test.js", 10, ["target1"]);
    });
  });

  describe("removeGlobalBreakpoint", () => {
    it("should remove global breakpoint", async () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const bpId = await multiDebugger.setGlobalBreakpoint("test.js", 10, [
        "target1",
      ]);
      const removed = await multiDebugger.removeGlobalBreakpoint(bpId);

      expect(removed).toBe(true);
      expect(multiDebugger.getGlobalBreakpoints().has(bpId)).toBe(false);
    });

    it("should return false for non-existent breakpoint", async () => {
      const removed = await multiDebugger.removeGlobalBreakpoint(
        "non-existent"
      );
      expect(removed).toBe(false);
    });

    it("should emit global-breakpoint-removed event", async () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const bpId = await multiDebugger.setGlobalBreakpoint("test.js", 10, [
        "target1",
      ]);

      const promise = new Promise<void>((resolve) => {
        multiDebugger.on("global-breakpoint-removed", (id: string) => {
          expect(id).toBe(bpId);
          resolve();
        });
      });

      await multiDebugger.removeGlobalBreakpoint(bpId);
      await promise;
    });
  });

  describe("continueAll", () => {
    it("should continue all targets", async () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      const continue1 = jest.spyOn(session1, "continue");
      const continue2 = jest.spyOn(session2, "continue");

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      await multiDebugger.continueAll();

      expect(continue1).toHaveBeenCalled();
      expect(continue2).toHaveBeenCalled();
    });
  });

  describe("continueTargets", () => {
    it("should continue specific targets", async () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      const continue1 = jest.spyOn(session1, "continue");
      const continue2 = jest.spyOn(session2, "continue");

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      await multiDebugger.continueTargets(["target1"]);

      expect(continue1).toHaveBeenCalled();
      expect(continue2).not.toHaveBeenCalled();
    });
  });

  describe("pauseAll", () => {
    it("should pause all targets", async () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      const pause1 = jest.spyOn(session1, "pause");
      const pause2 = jest.spyOn(session2, "pause");

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      await multiDebugger.pauseAll();

      expect(pause1).toHaveBeenCalled();
      expect(pause2).toHaveBeenCalled();
    });
  });

  describe("Log aggregation", () => {
    it("should aggregate logs from targets", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      multiDebugger.on("log", (log: any) => {
        expect(log.targetId).toBe("target1");
        expect(log.level).toBe("stdout");
        expect(log.message).toBe("test message");
        done();
      });

      session.emit("stdout", "test message");
    });

    it("should get aggregated logs", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      session.emit("stdout", "test message");

      setTimeout(() => {
        const logs = multiDebugger.getAggregatedLogs();
        expect(logs).toHaveLength(1);
        expect(logs[0].message).toBe("test message");
        done();
      }, 10);
    });

    it("should filter logs by target ID", (done) => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      session1.emit("stdout", "message 1");
      session2.emit("stdout", "message 2");

      setTimeout(() => {
        const logs = multiDebugger.getAggregatedLogs({
          targetIds: ["target1"],
        });
        expect(logs).toHaveLength(1);
        expect(logs[0].message).toBe("message 1");
        done();
      }, 10);
    });

    it("should filter logs by level", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      session.emit("stdout", "stdout message");
      session.emit("stderr", "stderr message");

      setTimeout(() => {
        const logs = multiDebugger.getAggregatedLogs({ level: "stderr" });
        expect(logs).toHaveLength(1);
        expect(logs[0].message).toBe("stderr message");
        done();
      }, 10);
    });

    it("should limit log results", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      session.emit("stdout", "message 1");
      session.emit("stdout", "message 2");
      session.emit("stdout", "message 3");

      setTimeout(() => {
        const logs = multiDebugger.getAggregatedLogs({ limit: 2 });
        expect(logs).toHaveLength(2);
        expect(logs[0].message).toBe("message 2");
        expect(logs[1].message).toBe("message 3");
        done();
      }, 10);
    });

    it("should clear logs", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      session.emit("stdout", "test message");

      setTimeout(() => {
        multiDebugger.clearLogs();
        const logs = multiDebugger.getAggregatedLogs();
        expect(logs).toHaveLength(0);
        done();
      }, 10);
    });

    it("should respect max log size", (done) => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);
      multiDebugger.setMaxLogSize(2);

      session.emit("stdout", "message 1");
      session.emit("stdout", "message 2");
      session.emit("stdout", "message 3");

      setTimeout(() => {
        const logs = multiDebugger.getAggregatedLogs();
        expect(logs).toHaveLength(2);
        expect(logs[0].message).toBe("message 2");
        expect(logs[1].message).toBe("message 3");
        done();
      }, 10);
    });
  });

  describe("setMaxLogSize", () => {
    it("should set max log size", () => {
      multiDebugger.setMaxLogSize(5000);
      // No error should be thrown
    });

    it("should throw error for non-positive size", () => {
      expect(() => multiDebugger.setMaxLogSize(0)).toThrow(
        "Max log size must be positive"
      );
      expect(() => multiDebugger.setMaxLogSize(-1)).toThrow(
        "Max log size must be positive"
      );
    });
  });

  describe("getTargetTree", () => {
    it("should return target hierarchy", () => {
      const parentSession = new MockDebugSession() as unknown as DebugSession;
      const child1Session = new MockDebugSession() as unknown as DebugSession;
      const child2Session = new MockDebugSession() as unknown as DebugSession;

      multiDebugger.addTarget("parent", "Parent", parentSession);
      multiDebugger.addTarget("child1", "Child 1", child1Session, "parent");
      multiDebugger.addTarget("child2", "Child 2", child2Session, "parent");

      const tree = multiDebugger.getTargetTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("parent");
      expect(tree[0].children).toHaveLength(2);
    });
  });

  describe("stopAll", () => {
    it("should stop all targets", async () => {
      const session1 = new MockDebugSession() as unknown as DebugSession;
      const session2 = new MockDebugSession() as unknown as DebugSession;

      const stop1 = jest.spyOn(session1, "stop");
      const stop2 = jest.spyOn(session2, "stop");

      multiDebugger.addTarget("target1", "Target 1", session1);
      multiDebugger.addTarget("target2", "Target 2", session2);

      await multiDebugger.stopAll();

      expect(stop1).toHaveBeenCalled();
      expect(stop2).toHaveBeenCalled();
      expect(multiDebugger.getAllTargets()).toHaveLength(0);
    });

    it("should emit all-stopped event", async () => {
      const session = new MockDebugSession() as unknown as DebugSession;
      multiDebugger.addTarget("target1", "Target 1", session);

      const promise = new Promise<void>((resolve) => {
        multiDebugger.on("all-stopped", () => {
          resolve();
        });
      });

      await multiDebugger.stopAll();
      await promise;
    });
  });
});
