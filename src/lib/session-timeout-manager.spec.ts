import { SessionTimeoutManager } from "./session-timeout-manager";

describe("SessionTimeoutManager", () => {
  describe("Configuration", () => {
    it("should create with default configuration", () => {
      const manager = new SessionTimeoutManager();

      expect(manager.isEnabled()).toBe(false);
      expect(manager.getSessionCount()).toBe(0);
    });

    it("should create with custom configuration", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
        warningMs: 1000,
      });

      expect(manager.isEnabled()).toBe(true);
      const config = manager.getConfig();
      expect(config.timeoutMs).toBe(5000);
      expect(config.warningMs).toBe(1000);
    });

    it("should update configuration", () => {
      const manager = new SessionTimeoutManager({
        enabled: false,
        timeoutMs: 5000,
      });

      manager.updateConfig({ enabled: true, timeoutMs: 10000 });

      const config = manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.timeoutMs).toBe(10000);
    });
  });

  describe("Session Registration", () => {
    it("should register a session", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");

      expect(manager.hasSession("session1")).toBe(true);
      expect(manager.getSessionCount()).toBe(1);
    });

    it("should not register sessions when disabled", () => {
      const manager = new SessionTimeoutManager({
        enabled: false,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");

      expect(manager.hasSession("session1")).toBe(false);
      expect(manager.getSessionCount()).toBe(0);
    });

    it("should register multiple sessions", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");
      manager.registerSession("session2");
      manager.registerSession("session3");

      expect(manager.getSessionCount()).toBe(3);
      expect(manager.getAllSessionIds()).toEqual([
        "session1",
        "session2",
        "session3",
      ]);
    });

    it("should unregister a session", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");
      expect(manager.hasSession("session1")).toBe(true);

      manager.unregisterSession("session1");
      expect(manager.hasSession("session1")).toBe(false);
      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe("Session Information", () => {
    it("should get session information", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");

      const info = manager.getSessionInfo("session1");
      expect(info).not.toBeNull();
      expect(info!.createdAt).toBeInstanceOf(Date);
      expect(info!.lastActivityAt).toBeInstanceOf(Date);
      expect(info!.timeoutAt).toBeInstanceOf(Date);
      expect(info!.remainingMs).toBeGreaterThan(0);
      expect(info!.remainingMs).toBeLessThanOrEqual(5000);
    });

    it("should return null for non-existent session", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      const info = manager.getSessionInfo("non-existent");
      expect(info).toBeNull();
    });

    it("should get remaining time", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");

      const remaining = manager.getRemainingTime("session1");
      expect(remaining).not.toBeNull();
      expect(remaining!).toBeGreaterThan(0);
      expect(remaining!).toBeLessThanOrEqual(5000);
    });

    it("should return null remaining time for non-existent session", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      const remaining = manager.getRemainingTime("non-existent");
      expect(remaining).toBeNull();
    });
  });

  describe("Activity Updates", () => {
    it("should update activity and reset timeout", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 1000,
      });

      manager.registerSession("session1");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      const remainingBefore = manager.getRemainingTime("session1");

      // Update activity
      manager.updateActivity("session1");

      const remainingAfter = manager.getRemainingTime("session1");

      // After update, remaining time should be close to the full timeout
      expect(remainingAfter).toBeGreaterThan(remainingBefore!);
      expect(remainingAfter).toBeGreaterThan(900);
    });

    it("should not update activity when disabled", () => {
      const manager = new SessionTimeoutManager({
        enabled: false,
        timeoutMs: 5000,
      });

      manager.updateActivity("session1");

      expect(manager.hasSession("session1")).toBe(false);
    });
  });

  describe("Timeout Handling", () => {
    it("should call timeout handler when session times out", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 100,
      });

      let timeoutCalled = false;
      let timeoutSessionId = "";

      manager.onTimeout((sessionId) => {
        timeoutCalled = true;
        timeoutSessionId = sessionId;
      });

      manager.registerSession("session1");

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(timeoutCalled).toBe(true);
      expect(timeoutSessionId).toBe("session1");
      expect(manager.hasSession("session1")).toBe(false);
    });

    it("should call multiple timeout handlers", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 100,
      });

      let handler1Called = false;
      let handler2Called = false;

      manager.onTimeout(() => {
        handler1Called = true;
      });
      manager.onTimeout(() => {
        handler2Called = true;
      });

      manager.registerSession("session1");

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    });

    it("should not timeout if activity is updated", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 200,
      });

      let timeoutCalled = false;

      manager.onTimeout(() => {
        timeoutCalled = true;
      });

      manager.registerSession("session1");

      // Update activity before timeout
      await new Promise((resolve) => setTimeout(resolve, 100));
      manager.updateActivity("session1");

      // Wait past original timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(timeoutCalled).toBe(false);
      expect(manager.hasSession("session1")).toBe(true);
    });
  });

  describe("Warning Handling", () => {
    it("should call warning handler before timeout", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 200,
        warningMs: 100,
      });

      let warningCalled = false;
      let warningSessionId = "";
      let warningRemainingMs = 0;

      manager.onWarning((sessionId, remainingMs) => {
        warningCalled = true;
        warningSessionId = sessionId;
        warningRemainingMs = remainingMs;
      });

      manager.registerSession("session1");

      // Wait for warning
      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(warningCalled).toBe(true);
      expect(warningSessionId).toBe("session1");
      expect(warningRemainingMs).toBeGreaterThan(0);
      expect(warningRemainingMs).toBeLessThanOrEqual(100);
    });

    it("should call multiple warning handlers", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 200,
        warningMs: 100,
      });

      let handler1Called = false;
      let handler2Called = false;

      manager.onWarning(() => {
        handler1Called = true;
      });
      manager.onWarning(() => {
        handler2Called = true;
      });

      manager.registerSession("session1");

      // Wait for warning
      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    });

    it("should not call warning if no warningMs configured", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 100,
      });

      let warningCalled = false;

      manager.onWarning(() => {
        warningCalled = true;
      });

      manager.registerSession("session1");

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(warningCalled).toBe(false);
    });
  });

  describe("Cleanup", () => {
    it("should clear all sessions", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      manager.registerSession("session1");
      manager.registerSession("session2");
      manager.registerSession("session3");

      expect(manager.getSessionCount()).toBe(3);

      manager.clear();

      expect(manager.getSessionCount()).toBe(0);
      expect(manager.hasSession("session1")).toBe(false);
      expect(manager.hasSession("session2")).toBe(false);
      expect(manager.hasSession("session3")).toBe(false);
    });

    it("should clear timers when clearing sessions", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 100,
      });

      let timeoutCalled = false;

      manager.onTimeout(() => {
        timeoutCalled = true;
      });

      manager.registerSession("session1");

      // Clear before timeout
      manager.clear();

      // Wait past timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(timeoutCalled).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle unregistering non-existent session", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      expect(() => manager.unregisterSession("non-existent")).not.toThrow();
    });

    it("should handle updating activity for non-existent session", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 5000,
      });

      expect(() => manager.updateActivity("non-existent")).not.toThrow();
    });

    it("should handle warning without configured warningMs", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 200,
        warningMs: 300, // Warning time greater than timeout
      });

      let warningCalled = false;

      manager.onWarning(() => {
        warningCalled = true;
      });

      manager.registerSession("session1");

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Warning should not be called since warningMs > timeoutMs
      expect(warningCalled).toBe(false);
    });

    it("should handle errors in timeout handlers gracefully", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 100,
      });

      manager.onTimeout(() => {
        throw new Error("Handler error");
      });

      manager.registerSession("session1");

      // Wait for timeout - should not throw
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Session should still be removed despite handler error
      expect(manager.hasSession("session1")).toBe(false);
    });

    it("should handle errors in warning handlers gracefully", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 200,
        warningMs: 100,
      });

      manager.onWarning(() => {
        throw new Error("Warning handler error");
      });

      manager.registerSession("session1");

      // Wait for warning - should not throw
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Session should still exist
      expect(manager.hasSession("session1")).toBe(true);
    });

    it("should handle activity update with new timers", async () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 200,
        warningMs: 100,
      });

      manager.registerSession("session1");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Update activity - should reset both timers
      manager.updateActivity("session1");

      const info = manager.getSessionInfo("session1");
      expect(info).not.toBeNull();
      expect(info!.remainingMs).toBeGreaterThan(150);
    });

    it("should handle updateActivity when session does not exist", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 1000,
      });

      // Try to update activity for non-existent session
      manager.updateActivity("non-existent");

      // Should not throw
      expect(manager.hasSession("non-existent")).toBe(false);
    });

    it("should handle registerSession without warning configured", () => {
      const manager = new SessionTimeoutManager({
        enabled: true,
        timeoutMs: 1000,
        // No warningMs configured
      });

      manager.registerSession("session1");

      expect(manager.hasSession("session1")).toBe(true);
    });
  });
});
