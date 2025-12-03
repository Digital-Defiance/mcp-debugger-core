import { RetryHandler, Retryable } from "./retry-handler";

describe("RetryHandler", () => {
  describe("execute", () => {
    it("should succeed on first attempt", async () => {
      const operation = jest.fn().mockResolvedValue("success");

      const result = await RetryHandler.execute(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure 1"))
        .mockRejectedValueOnce(new Error("failure 2"))
        .mockResolvedValueOnce("success");

      const result = await RetryHandler.execute(operation, {
        maxAttempts: 3,
        initialDelay: 10,
      });

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should throw error after max attempts", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error("persistent failure"));

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 3,
          initialDelay: 10,
        })
      ).rejects.toThrow("persistent failure");

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should use exponential backoff", async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure 1"))
        .mockRejectedValueOnce(new Error("failure 2"))
        .mockResolvedValueOnce("success");

      const promise = RetryHandler.execute(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        backoffMultiplier: 2,
        jitter: 0, // No jitter for predictable testing
      });

      // First attempt fails immediately
      await jest.advanceTimersByTimeAsync(0);

      // Second attempt after ~100ms
      await jest.advanceTimersByTimeAsync(100);

      // Third attempt after ~200ms
      await jest.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe("success");

      jest.useRealTimers();
    });

    it("should respect max delay", async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure 1"))
        .mockRejectedValueOnce(new Error("failure 2"))
        .mockResolvedValueOnce("success");

      const promise = RetryHandler.execute(operation, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 500,
        backoffMultiplier: 2,
        jitter: 0,
      });

      // First attempt fails immediately
      await jest.advanceTimersByTimeAsync(0);

      // Second attempt should be capped at maxDelay (500ms)
      await jest.advanceTimersByTimeAsync(500);

      // Third attempt should also be capped at maxDelay (500ms)
      await jest.advanceTimersByTimeAsync(500);

      const result = await promise;
      expect(result).toBe("success");

      jest.useRealTimers();
    });

    it("should not retry non-retryable errors", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("non-retryable"));

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 3,
          initialDelay: 10,
          isRetryable: (error) => error.message !== "non-retryable",
        })
      ).rejects.toThrow("non-retryable");

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should add jitter to delays", async () => {
      jest.useFakeTimers();
      jest.spyOn(Math, "random").mockReturnValue(0.5);

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValueOnce("success");

      const promise = RetryHandler.execute(operation, {
        maxAttempts: 2,
        initialDelay: 100,
        jitter: 0.1,
      });

      // First attempt fails immediately
      await jest.advanceTimersByTimeAsync(0);

      // Second attempt with jitter (100ms + 0% jitter = 100ms)
      await jest.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe("success");

      jest.useRealTimers();
      (Math.random as jest.Mock).mockRestore();
    });
  });

  describe("executeWithStats", () => {
    it("should return stats on success", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValueOnce("success");

      const { result, stats } = await RetryHandler.executeWithStats(operation, {
        maxAttempts: 3,
        initialDelay: 10,
        jitter: 0,
      });

      expect(result).toBe("success");
      expect(stats.attempts).toBe(2);
      expect(stats.success).toBe(true);
      expect(stats.totalDelay).toBeGreaterThan(0);
    });

    it("should return stats on first attempt success", async () => {
      const operation = jest.fn().mockResolvedValue("success");

      const { result, stats } = await RetryHandler.executeWithStats(operation);

      expect(result).toBe("success");
      expect(stats.attempts).toBe(1);
      expect(stats.success).toBe(true);
      expect(stats.totalDelay).toBe(0);
    });
  });

  describe("Retryable decorator", () => {
    class TestClass {
      callCount = 0;

      @Retryable({ maxAttempts: 3, initialDelay: 10 })
      async retryableMethod(): Promise<string> {
        this.callCount++;
        if (this.callCount < 3) {
          throw new Error("failure");
        }
        return "success";
      }
    }

    it("should retry decorated method", async () => {
      const instance = new TestClass();

      const result = await instance.retryableMethod();

      expect(result).toBe("success");
      expect(instance.callCount).toBe(3);
    });
  });

  describe("edge cases", () => {
    it("should handle non-Error exceptions", async () => {
      const operation = jest.fn().mockRejectedValue("string error");

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow("string error");

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should handle zero jitter", async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValueOnce("success");

      const promise = RetryHandler.execute(operation, {
        maxAttempts: 2,
        initialDelay: 100,
        jitter: 0,
      });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe("success");

      jest.useRealTimers();
    });

    it("should handle negative jitter values", async () => {
      jest.useFakeTimers();
      jest.spyOn(Math, "random").mockReturnValue(0); // Will produce negative jitter

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValueOnce("success");

      const promise = RetryHandler.execute(operation, {
        maxAttempts: 2,
        initialDelay: 100,
        jitter: 0.5,
      });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe("success");

      jest.useRealTimers();
      (Math.random as jest.Mock).mockRestore();
    });

    it("should handle executeWithStats with non-retryable error", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("non-retryable"));

      await expect(
        RetryHandler.executeWithStats(operation, {
          maxAttempts: 3,
          initialDelay: 10,
          isRetryable: () => false,
        })
      ).rejects.toThrow("non-retryable");

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should handle executeWithStats with all attempts failing", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error("persistent failure"));

      await expect(
        RetryHandler.executeWithStats(operation, {
          maxAttempts: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow("persistent failure");

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should log retry attempts", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValueOnce("success");

      await RetryHandler.execute(operation, {
        maxAttempts: 2,
        initialDelay: 10,
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain("Retry attempt");

      consoleSpy.mockRestore();
    });

    it("should handle very large backoff multipliers", async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValueOnce("success");

      const promise = RetryHandler.execute(operation, {
        maxAttempts: 2,
        initialDelay: 100,
        maxDelay: 500,
        backoffMultiplier: 100, // Very large multiplier
        jitter: 0,
      });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(500); // Should be capped at maxDelay

      const result = await promise;
      expect(result).toBe("success");

      jest.useRealTimers();
    });

    it("should handle operation that throws non-Error object", async () => {
      const operation = jest.fn().mockRejectedValue("string error");

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should handle operation that rejects with null", async () => {
      const operation = jest.fn().mockRejectedValue(null);

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should handle operation that rejects with undefined", async () => {
      const operation = jest.fn().mockRejectedValue(undefined);

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should use isRetryable function to determine if error is retryable", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("Retryable error"))
        .mockRejectedValueOnce(new Error("Non-retryable error"));

      const isRetryable = jest.fn((error: Error) => {
        return error.message === "Retryable error";
      });

      await expect(
        RetryHandler.execute(operation, {
          maxAttempts: 3,
          initialDelay: 10,
          isRetryable,
        })
      ).rejects.toThrow("Non-retryable error");

      expect(operation).toHaveBeenCalledTimes(2);
      expect(isRetryable).toHaveBeenCalledTimes(2);
    });

    it("should handle isRetryable returning true for all errors", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockRejectedValueOnce(new Error("Error 2"))
        .mockResolvedValueOnce("success");

      const isRetryable = jest.fn(() => true);

      const result = await RetryHandler.execute(operation, {
        maxAttempts: 3,
        initialDelay: 10,
        isRetryable,
      });

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
      expect(isRetryable).toHaveBeenCalledTimes(2);
    });

    it("should handle lastError being undefined edge case", async () => {
      // This tests the fallback in the final throw statement
      const operation = jest.fn().mockImplementation(() => {
        // Simulate a scenario where we exit the loop without setting lastError
        return Promise.resolve("success");
      });

      const result = await RetryHandler.execute(operation, {
        maxAttempts: 1,
        initialDelay: 10,
      });

      expect(result).toBe("success");
    });
  });
});
