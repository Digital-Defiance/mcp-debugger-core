import { RateLimiter, RateLimitError } from "./rate-limiter";

describe("RateLimiter", () => {
  describe("Configuration", () => {
    it("should set rate limit for an operation type", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 10, windowMs: 1000 });

      expect(limiter.hasLimit("test_operation")).toBe(true);
      expect(limiter.hasLimit("other_operation")).toBe(false);
    });

    it("should get all configured operation types", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("operation1", { maxRequests: 10, windowMs: 1000 });
      limiter.setLimit("operation2", { maxRequests: 20, windowMs: 2000 });

      const types = limiter.getOperationTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain("operation1");
      expect(types).toContain("operation2");
    });
  });

  describe("Rate Limiting", () => {
    it("should allow requests within the limit", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 3, windowMs: 1000 });

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).not.toThrow();
      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).not.toThrow();
      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).not.toThrow();
    });

    it("should throw RateLimitError when limit is exceeded", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user1");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).toThrow(RateLimitError);
    });

    it("should include retry-after information in error", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 1, windowMs: 5000 });

      limiter.checkLimitOrThrow("test_operation", "user1");

      try {
        limiter.checkLimitOrThrow("test_operation", "user1");
        fail("Should have thrown RateLimitError");
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.operationType).toBe("test_operation");
        expect(rateLimitError.retryAfter).toBeGreaterThan(0);
        expect(rateLimitError.retryAfter).toBeLessThanOrEqual(5);
      }
    });

    it("should isolate rate limits by identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user2");
      limiter.checkLimitOrThrow("test_operation", "user2");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).toThrow(RateLimitError);
      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user2")
      ).toThrow(RateLimitError);
    });

    it("should allow requests after window resets", async () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 100 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user1");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).toThrow(RateLimitError);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).not.toThrow();
    });

    it("should allow requests when no limit is configured", () => {
      const limiter = new RateLimiter();

      // No limit configured for this operation
      for (let i = 0; i < 100; i++) {
        expect(() =>
          limiter.checkLimitOrThrow("unlimited_operation", "user1")
        ).not.toThrow();
      }
    });
  });

  describe("Status and Metrics", () => {
    it("should get current status for an operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 5, windowMs: 1000 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user1");

      const status = limiter.getStatus("test_operation", "user1");
      expect(status).not.toBeNull();
      expect(status!.count).toBe(2);
      expect(status!.limit).toBe(5);
      expect(status!.resetAt).toBeInstanceOf(Date);
    });

    it("should return null status for unconfigured operation", () => {
      const limiter = new RateLimiter();

      const status = limiter.getStatus("unconfigured_operation", "user1");
      expect(status).toBeNull();
    });

    it("should track metrics for an operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user1");

      try {
        limiter.checkLimitOrThrow("test_operation", "user1");
      } catch (error) {
        // Expected
      }

      const metrics = limiter.getMetrics("test_operation");
      expect(metrics).not.toBeNull();
      expect(metrics!.operationType).toBe("test_operation");
      expect(metrics!.requestCount).toBe(3);
      expect(metrics!.limitExceeded).toBe(1);
      expect(metrics!.currentWindow.count).toBe(3);
    });

    it("should get metrics for all operations", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("operation1", { maxRequests: 10, windowMs: 1000 });
      limiter.setLimit("operation2", { maxRequests: 20, windowMs: 2000 });

      limiter.checkLimitOrThrow("operation1", "user1");
      limiter.checkLimitOrThrow("operation2", "user1");

      const allMetrics = limiter.getAllMetrics();
      expect(allMetrics).toHaveLength(2);
      expect(allMetrics.map((m) => m.operationType)).toContain("operation1");
      expect(allMetrics.map((m) => m.operationType)).toContain("operation2");
    });
  });

  describe("Default Configuration", () => {
    it("should use default config when only identifier is provided", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      // Use default config by providing only identifier
      const result1 = limiter.checkLimit("user1");
      expect(result1.allowed).toBe(true);

      const result2 = limiter.checkLimit("user1");
      expect(result2.allowed).toBe(true);

      // Third request should be blocked
      const result3 = limiter.checkLimit("user1");
      expect(result3.allowed).toBe(false);
      expect(result3.retryAfter).toBeGreaterThan(0);
    });

    it("should isolate default config limits by identifier", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });

      limiter.checkLimit("user1");
      limiter.checkLimit("user2");

      // Both users should be at their limit
      const result1 = limiter.checkLimit("user1");
      const result2 = limiter.checkLimit("user2");

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(false);
    });

    it("should allow requests when no default config and no operation config", () => {
      const limiter = new RateLimiter();

      // No default config, no operation config
      const result = limiter.checkLimit("user1");
      expect(result.allowed).toBe(true);
    });

    it("should reset default config entries after window expires", async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 100 });

      limiter.checkLimit("user1");
      const result1 = limiter.checkLimit("user1");
      expect(result1.allowed).toBe(false);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result2 = limiter.checkLimit("user1");
      expect(result2.allowed).toBe(true);
    });
  });

  describe("checkLimit method", () => {
    it("should return allowed status without throwing", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      const result1 = limiter.checkLimit("test_operation", "user1");
      expect(result1.allowed).toBe(true);
      expect(result1.retryAfter).toBeUndefined();

      const result2 = limiter.checkLimit("test_operation", "user1");
      expect(result2.allowed).toBe(true);

      const result3 = limiter.checkLimit("test_operation", "user1");
      expect(result3.allowed).toBe(false);
      expect(result3.retryAfter).toBeGreaterThan(0);
    });

    it("should handle explicit identifier parameter", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      // Explicitly pass identifier
      const result1 = limiter.checkLimit("test_operation", "explicit-user");
      expect(result1.allowed).toBe(true);

      const result2 = limiter.checkLimit("test_operation", "explicit-user");
      expect(result2.allowed).toBe(true);

      const result3 = limiter.checkLimit("test_operation", "explicit-user");
      expect(result3.allowed).toBe(false);
    });

    it("should reuse existing entry within window", () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 5000 });

      // First request creates entry
      limiter.checkLimit("user1");

      // Second request reuses entry (within window)
      const result = limiter.checkLimit("user1");
      expect(result.allowed).toBe(true);

      // Third request still within window
      const result2 = limiter.checkLimit("user1");
      expect(result2.allowed).toBe(true);

      // Fourth request exceeds limit
      const result3 = limiter.checkLimit("user1");
      expect(result3.allowed).toBe(false);
    });
  });

  describe("Reset and Cleanup", () => {
    it("should reset rate limit for a specific identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user1");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).toThrow(RateLimitError);

      limiter.reset("test_operation", "user1");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).not.toThrow();
    });

    it("should reset all rate limits for an operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 1, windowMs: 1000 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user2");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).toThrow(RateLimitError);
      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user2")
      ).toThrow(RateLimitError);

      limiter.resetAll("test_operation");

      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user1")
      ).not.toThrow();
      expect(() =>
        limiter.checkLimitOrThrow("test_operation", "user2")
      ).not.toThrow();
    });

    it("should cleanup expired entries", async () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 100 });

      limiter.checkLimitOrThrow("test_operation", "user1");
      limiter.checkLimitOrThrow("test_operation", "user2");

      // Wait for entries to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      limiter.cleanup();

      // After cleanup, status should show 0 count
      const status1 = limiter.getStatus("test_operation", "user1");
      const status2 = limiter.getStatus("test_operation", "user2");

      expect(status1!.count).toBe(0);
      expect(status2!.count).toBe(0);
    });

    it("should clear all limits and metrics", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("operation1", { maxRequests: 10, windowMs: 1000 });
      limiter.setLimit("operation2", { maxRequests: 20, windowMs: 2000 });

      limiter.checkLimitOrThrow("operation1", "user1");
      limiter.checkLimitOrThrow("operation2", "user1");

      expect(limiter.getOperationTypes()).toHaveLength(2);

      limiter.clear();

      expect(limiter.getOperationTypes()).toHaveLength(0);
      expect(limiter.hasLimit("operation1")).toBe(false);
      expect(limiter.hasLimit("operation2")).toBe(false);
    });

    it("should return false when resetting non-existent operation", () => {
      const limiter = new RateLimiter();

      expect(limiter.reset("non-existent", "user1")).toBe(false);
    });

    it("should return false when resetting all for non-existent operation", () => {
      const limiter = new RateLimiter();

      expect(limiter.resetAll("non-existent")).toBe(false);
    });

    it("should return null metrics for non-existent operation", () => {
      const limiter = new RateLimiter();

      const metrics = limiter.getMetrics("non-existent");
      expect(metrics).toBeNull();
    });

    it("should handle default identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      // Use default identifier
      limiter.checkLimitOrThrow("test_operation");
      limiter.checkLimitOrThrow("test_operation");

      expect(() => limiter.checkLimitOrThrow("test_operation")).toThrow(
        RateLimitError
      );

      const status = limiter.getStatus("test_operation");
      expect(status).not.toBeNull();
      expect(status!.count).toBe(3);
    });

    it("should handle metrics with no entries", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 10, windowMs: 1000 });

      const metrics = limiter.getMetrics("test_operation");
      expect(metrics).not.toBeNull();
      expect(metrics!.currentWindow.count).toBe(0);
    });

    it("should handle status for new identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 10, windowMs: 1000 });

      const status = limiter.getStatus("test_operation", "new-user");
      expect(status).not.toBeNull();
      expect(status!.count).toBe(0);
      expect(status!.limit).toBe(10);
    });

    it("should use default identifier when not provided", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      // Call without identifier - should use 'default'
      limiter.checkLimitOrThrow("test_operation");
      limiter.checkLimitOrThrow("test_operation");

      // Third call should fail
      expect(() => limiter.checkLimitOrThrow("test_operation")).toThrow(
        RateLimitError
      );

      // Verify it used 'default' identifier
      const status = limiter.getStatus("test_operation", "default");
      expect(status!.count).toBe(3);
    });

    it("should return allowed when no default config and checking with single arg", () => {
      const limiter = new RateLimiter(); // No default config

      // Call with single argument and no default config
      const result = limiter.checkLimit("some-identifier");
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it("should handle checkLimit with null identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      // Call with null identifier - should use 'default'
      const result1 = limiter.checkLimit("test_operation", null as any);
      expect(result1.allowed).toBe(true);

      const result2 = limiter.checkLimit("test_operation", null as any);
      expect(result2.allowed).toBe(true);

      const result3 = limiter.checkLimit("test_operation", null as any);
      expect(result3.allowed).toBe(false);
    });

    it("should handle checkLimit with empty string identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      // Call with empty string identifier - should use 'default'
      const result1 = limiter.checkLimit("test_operation", "");
      expect(result1.allowed).toBe(true);

      const result2 = limiter.checkLimit("test_operation", "");
      expect(result2.allowed).toBe(true);

      const result3 = limiter.checkLimit("test_operation", "");
      expect(result3.allowed).toBe(false);
    });

    it("should handle checkLimit with undefined identifier explicitly", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 1000 });

      // Call with undefined identifier - should use 'default'
      const result1 = limiter.checkLimit("test_operation", undefined);
      expect(result1.allowed).toBe(true);

      const result2 = limiter.checkLimit("test_operation", undefined);
      expect(result2.allowed).toBe(true);

      const result3 = limiter.checkLimit("test_operation", undefined);
      expect(result3.allowed).toBe(false);
    });

    it("should handle window reset correctly", async () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_operation", { maxRequests: 2, windowMs: 100 });

      // Use up the limit
      limiter.checkLimit("test_operation", "user1");
      limiter.checkLimit("test_operation", "user1");

      const result1 = limiter.checkLimit("test_operation", "user1");
      expect(result1.allowed).toBe(false);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      const result2 = limiter.checkLimit("test_operation", "user1");
      expect(result2.allowed).toBe(true);
    });

    it("should handle clear operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("op1", { maxRequests: 5, windowMs: 1000 });
      limiter.setLimit("op2", { maxRequests: 10, windowMs: 2000 });

      limiter.checkLimit("op1", "user1");
      limiter.checkLimit("op2", "user1");

      expect(limiter.hasLimit("op1")).toBe(true);
      expect(limiter.hasLimit("op2")).toBe(true);

      limiter.clear();

      expect(limiter.hasLimit("op1")).toBe(false);
      expect(limiter.hasLimit("op2")).toBe(false);
      expect(limiter.getOperationTypes()).toHaveLength(0);
    });

    it("should handle resetAll for operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_op", { maxRequests: 1, windowMs: 1000 });

      limiter.checkLimit("test_op", "user1");
      limiter.checkLimit("test_op", "user2");
      limiter.checkLimit("test_op", "user3");

      // All users should be at limit
      expect(limiter.checkLimit("test_op", "user1").allowed).toBe(false);
      expect(limiter.checkLimit("test_op", "user2").allowed).toBe(false);
      expect(limiter.checkLimit("test_op", "user3").allowed).toBe(false);

      // Reset all
      const result = limiter.resetAll("test_op");
      expect(result).toBe(true);

      // All users should be allowed again
      expect(limiter.checkLimit("test_op", "user1").allowed).toBe(true);
      expect(limiter.checkLimit("test_op", "user2").allowed).toBe(true);
      expect(limiter.checkLimit("test_op", "user3").allowed).toBe(true);
    });

    it("should handle reset for specific identifier", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_op", { maxRequests: 1, windowMs: 1000 });

      limiter.checkLimit("test_op", "user1");
      limiter.checkLimit("test_op", "user2");

      // Both at limit
      expect(limiter.checkLimit("test_op", "user1").allowed).toBe(false);
      expect(limiter.checkLimit("test_op", "user2").allowed).toBe(false);

      // Reset only user1
      const result = limiter.reset("test_op", "user1");
      expect(result).toBe(true);

      // user1 should be allowed, user2 still blocked
      expect(limiter.checkLimit("test_op", "user1").allowed).toBe(true);
      expect(limiter.checkLimit("test_op", "user2").allowed).toBe(false);
    });

    it("should handle clear operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("op1", { maxRequests: 5, windowMs: 1000 });
      limiter.setLimit("op2", { maxRequests: 10, windowMs: 2000 });

      limiter.checkLimit("op1", "user1");
      limiter.checkLimit("op2", "user1");

      expect(limiter.getOperationTypes()).toHaveLength(2);

      limiter.clear();

      expect(limiter.getOperationTypes()).toHaveLength(0);
      expect(limiter.hasLimit("op1")).toBe(false);
      expect(limiter.hasLimit("op2")).toBe(false);
    });

    it("should handle removeMetric for non-existent metric", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("test_op", { maxRequests: 5, windowMs: 1000 });

      // Try to get metrics for non-existent operation
      const metrics = limiter.getMetrics("non_existent");
      expect(metrics).toBeNull();
    });

    it("should handle multiple identifiers with same operation", () => {
      const limiter = new RateLimiter();
      limiter.setLimit("api", { maxRequests: 2, windowMs: 1000 });

      // Different users
      limiter.checkLimit("api", "user1");
      limiter.checkLimit("api", "user1");
      limiter.checkLimit("api", "user2");
      limiter.checkLimit("api", "user2");
      limiter.checkLimit("api", "user3");

      // user1 and user2 should be at limit, user3 should have 1 more
      expect(limiter.checkLimit("api", "user1").allowed).toBe(false);
      expect(limiter.checkLimit("api", "user2").allowed).toBe(false);
      expect(limiter.checkLimit("api", "user3").allowed).toBe(true);
    });
  });
});
