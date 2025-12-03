import {
  HealthChecker,
  HealthStatus,
  DependencyHealth,
  createSimpleDependencyChecker,
} from "./health-checker";

describe("HealthChecker", () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  afterEach(() => {
    healthChecker.cleanup();
  });

  describe("Basic Health Check", () => {
    it("should return healthy status with no dependencies", async () => {
      // Wait a bit to ensure uptime is > 0
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.dependencies.length).toBe(0);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it("should track uptime", async () => {
      const uptime1 = healthChecker.getUptime();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const uptime2 = healthChecker.getUptime();

      expect(uptime2).toBeGreaterThan(uptime1);
    });

    it("should cache last health check result", async () => {
      expect(healthChecker.getLastHealthCheck()).toBeUndefined();

      await healthChecker.checkHealth();

      const cached = healthChecker.getLastHealthCheck();
      expect(cached).toBeDefined();
      expect(cached?.status).toBe(HealthStatus.HEALTHY);
    });
  });

  describe("Dependency Health Checks", () => {
    it("should check healthy dependency", async () => {
      const checker = createSimpleDependencyChecker(
        "test-service",
        async () => true
      );
      healthChecker.registerDependencyChecker("test-service", checker);

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.dependencies.length).toBe(1);
      expect(result.dependencies[0].name).toBe("test-service");
      expect(result.dependencies[0].status).toBe(HealthStatus.HEALTHY);
      expect(result.dependencies[0].latency).toBeGreaterThanOrEqual(0);
    });

    it("should check unhealthy dependency", async () => {
      const checker = createSimpleDependencyChecker(
        "test-service",
        async () => false
      );
      healthChecker.registerDependencyChecker("test-service", checker);

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.dependencies[0].status).toBe(HealthStatus.UNHEALTHY);
    });

    it("should handle dependency check errors", async () => {
      const checker = async (): Promise<DependencyHealth> => {
        throw new Error("Connection failed");
      };
      healthChecker.registerDependencyChecker("failing-service", checker);

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.dependencies[0].status).toBe(HealthStatus.UNHEALTHY);
      expect(result.dependencies[0].message).toContain("Connection failed");
    });

    it("should check multiple dependencies", async () => {
      const checker1 = createSimpleDependencyChecker(
        "service-1",
        async () => true
      );
      const checker2 = createSimpleDependencyChecker(
        "service-2",
        async () => true
      );
      const checker3 = createSimpleDependencyChecker(
        "service-3",
        async () => true
      );

      healthChecker.registerDependencyChecker("service-1", checker1);
      healthChecker.registerDependencyChecker("service-2", checker2);
      healthChecker.registerDependencyChecker("service-3", checker3);

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.dependencies.length).toBe(3);
    });

    it("should return unhealthy if any dependency is unhealthy", async () => {
      const checker1 = createSimpleDependencyChecker(
        "service-1",
        async () => true
      );
      const checker2 = createSimpleDependencyChecker(
        "service-2",
        async () => false
      );
      const checker3 = createSimpleDependencyChecker(
        "service-3",
        async () => true
      );

      healthChecker.registerDependencyChecker("service-1", checker1);
      healthChecker.registerDependencyChecker("service-2", checker2);
      healthChecker.registerDependencyChecker("service-3", checker3);

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it("should return degraded if any dependency is degraded", async () => {
      const checker1 = createSimpleDependencyChecker(
        "service-1",
        async () => true
      );
      const checker2 = async (): Promise<DependencyHealth> => ({
        name: "service-2",
        status: HealthStatus.DEGRADED,
        message: "Slow response",
      });

      healthChecker.registerDependencyChecker("service-1", checker1);
      healthChecker.registerDependencyChecker("service-2", checker2);

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.dependencies.length).toBe(2);

      // Verify the degraded dependency is included
      const degradedDep = result.dependencies.find(
        (d) => d.name === "service-2"
      );
      expect(degradedDep?.status).toBe(HealthStatus.DEGRADED);
    });

    it("should prioritize unhealthy over degraded status", async () => {
      const checker1 = async (): Promise<DependencyHealth> => ({
        name: "service-1",
        status: HealthStatus.DEGRADED,
        message: "Slow response",
      });
      const checker2 = createSimpleDependencyChecker(
        "service-2",
        async () => false
      );

      healthChecker.registerDependencyChecker("service-1", checker1);
      healthChecker.registerDependencyChecker("service-2", checker2);

      const result = await healthChecker.checkHealth();

      // Should be UNHEALTHY, not DEGRADED, when both exist
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it("should timeout slow dependency checks", async () => {
      const slowChecker = async (): Promise<DependencyHealth> => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return {
          name: "slow-service",
          status: HealthStatus.HEALTHY,
        };
      };

      healthChecker.registerDependencyChecker("slow-service", slowChecker);

      const result = await healthChecker.checkHealth();

      expect(result.dependencies[0].status).toBe(HealthStatus.UNHEALTHY);
      expect(result.dependencies[0].message).toContain("timeout");
    }, 10000); // Increase timeout for this test
  });

  describe("Dependency Registration", () => {
    it("should register dependency checker", () => {
      const checker = createSimpleDependencyChecker("test", async () => true);
      healthChecker.registerDependencyChecker("test", checker);

      // Verify by checking health
      healthChecker.checkHealth().then((result) => {
        expect(result.dependencies.length).toBe(1);
      });
    });

    it("should unregister dependency checker", async () => {
      const checker = createSimpleDependencyChecker("test", async () => true);
      healthChecker.registerDependencyChecker("test", checker);

      let result = await healthChecker.checkHealth();
      expect(result.dependencies.length).toBe(1);

      healthChecker.unregisterDependencyChecker("test");

      result = await healthChecker.checkHealth();
      expect(result.dependencies.length).toBe(0);
    });

    it("should replace existing dependency checker", async () => {
      const checker1 = createSimpleDependencyChecker("test", async () => true);
      const checker2 = createSimpleDependencyChecker("test", async () => false);

      healthChecker.registerDependencyChecker("test", checker1);
      let result = await healthChecker.checkHealth();
      expect(result.dependencies[0].status).toBe(HealthStatus.HEALTHY);

      healthChecker.registerDependencyChecker("test", checker2);
      result = await healthChecker.checkHealth();
      expect(result.dependencies[0].status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe("Readiness Check", () => {
    it("should return ready with no dependencies", async () => {
      const result = await healthChecker.checkReadiness();

      expect(result.ready).toBe(true);
      expect(result.checks.length).toBe(0);
      expect(result.timestamp).toBeDefined();
    });

    it("should return ready when all dependencies are healthy", async () => {
      const checker1 = createSimpleDependencyChecker(
        "service-1",
        async () => true
      );
      const checker2 = createSimpleDependencyChecker(
        "service-2",
        async () => true
      );

      healthChecker.registerDependencyChecker("service-1", checker1);
      healthChecker.registerDependencyChecker("service-2", checker2);

      const result = await healthChecker.checkReadiness();

      expect(result.ready).toBe(true);
      expect(result.checks.length).toBe(2);
      expect(result.checks.every((c) => c.ready)).toBe(true);
    });

    it("should return not ready when any dependency is unhealthy", async () => {
      const checker1 = createSimpleDependencyChecker(
        "service-1",
        async () => true
      );
      const checker2 = createSimpleDependencyChecker(
        "service-2",
        async () => false
      );

      healthChecker.registerDependencyChecker("service-1", checker1);
      healthChecker.registerDependencyChecker("service-2", checker2);

      const result = await healthChecker.checkReadiness();

      expect(result.ready).toBe(false);
      expect(result.checks.some((c) => !c.ready)).toBe(true);
    });

    it("should return ready when dependencies are degraded", async () => {
      const checker = async (): Promise<DependencyHealth> => ({
        name: "service",
        status: HealthStatus.DEGRADED,
      });

      healthChecker.registerDependencyChecker("service", checker);

      const result = await healthChecker.checkReadiness();

      expect(result.ready).toBe(true); // Degraded is still ready
    });
  });

  describe("Liveness Check", () => {
    it("should return alive", async () => {
      const result = await healthChecker.checkLiveness();

      expect(result.alive).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it("should include timestamp in liveness check", async () => {
      const result = await healthChecker.checkLiveness();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe("Periodic Health Checks", () => {
    it("should start periodic health checks", async () => {
      const checker = createSimpleDependencyChecker("test", async () => true);
      healthChecker.registerDependencyChecker("test", checker);

      healthChecker.startPeriodicHealthChecks(100);

      // Wait for at least one check
      await new Promise((resolve) => setTimeout(resolve, 150));

      const cached = healthChecker.getLastHealthCheck();
      expect(cached).toBeDefined();

      healthChecker.stopPeriodicHealthChecks();
    });

    it("should stop periodic health checks", async () => {
      healthChecker.startPeriodicHealthChecks(100);
      healthChecker.stopPeriodicHealthChecks();

      const cached1 = healthChecker.getLastHealthCheck();

      // Wait to ensure no more checks run
      await new Promise((resolve) => setTimeout(resolve, 200));

      const cached2 = healthChecker.getLastHealthCheck();

      // Should be the same (no new checks)
      expect(cached1).toBe(cached2);
    });

    it("should replace existing periodic check interval", () => {
      healthChecker.startPeriodicHealthChecks(1000);
      healthChecker.startPeriodicHealthChecks(500);

      // Should not throw and should use new interval
      expect(() => healthChecker.stopPeriodicHealthChecks()).not.toThrow();
    });
  });

  describe("Endpoint Data", () => {
    it("should provide health endpoint data as JSON", async () => {
      const data = await healthChecker.getHealthEndpointData();

      expect(() => JSON.parse(data)).not.toThrow();

      const parsed = JSON.parse(data);
      expect(parsed.status).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.uptime).toBeDefined();
    });

    it("should provide readiness endpoint data as JSON", async () => {
      const data = await healthChecker.getReadinessEndpointData();

      expect(() => JSON.parse(data)).not.toThrow();

      const parsed = JSON.parse(data);
      expect(parsed.ready).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it("should provide liveness endpoint data as JSON", async () => {
      const data = await healthChecker.getLivenessEndpointData();

      expect(() => JSON.parse(data)).not.toThrow();

      const parsed = JSON.parse(data);
      expect(parsed.alive).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe("Cleanup", () => {
    it("should cleanup resources", () => {
      const checker = createSimpleDependencyChecker("test", async () => true);
      healthChecker.registerDependencyChecker("test", checker);
      healthChecker.startPeriodicHealthChecks(100);

      expect(() => healthChecker.cleanup()).not.toThrow();

      // Verify periodic checks stopped
      healthChecker.stopPeriodicHealthChecks(); // Should not throw
    });
  });

  describe("Edge Cases", () => {
    it("should handle dependency checker that returns degraded status", async () => {
      const degradedChecker = async (): Promise<DependencyHealth> => ({
        name: "degraded-service",
        status: HealthStatus.DEGRADED,
        message: "Service is slow",
      });

      healthChecker.registerDependencyChecker(
        "degraded-service",
        degradedChecker
      );

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.dependencies[0].status).toBe(HealthStatus.DEGRADED);
    });

    it("should prioritize unhealthy over degraded status", async () => {
      const degradedChecker = async (): Promise<DependencyHealth> => ({
        name: "degraded-service",
        status: HealthStatus.DEGRADED,
      });

      const unhealthyChecker = async (): Promise<DependencyHealth> => ({
        name: "unhealthy-service",
        status: HealthStatus.UNHEALTHY,
      });

      healthChecker.registerDependencyChecker(
        "degraded-service",
        degradedChecker
      );
      healthChecker.registerDependencyChecker(
        "unhealthy-service",
        unhealthyChecker
      );

      const result = await healthChecker.checkHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it("should handle liveness check errors", async () => {
      // This is a basic test since liveness check is simple
      const result = await healthChecker.checkLiveness();

      expect(result.alive).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it("should stop periodic checks when already stopped", () => {
      healthChecker.stopPeriodicHealthChecks();
      expect(() => healthChecker.stopPeriodicHealthChecks()).not.toThrow();
    });

    it("should handle dependency checker with latency", async () => {
      const slowChecker = async (): Promise<DependencyHealth> => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          name: "slow-service",
          status: HealthStatus.HEALTHY,
        };
      };

      healthChecker.registerDependencyChecker("slow-service", slowChecker);

      const result = await healthChecker.checkHealth();

      expect(result.dependencies[0].latency).toBeGreaterThan(40);
      expect(result.dependencies[0].latency).toBeLessThan(5000);
    });

    it("should handle createSimpleDependencyChecker with errors", async () => {
      const checker = createSimpleDependencyChecker("test", async () => {
        throw new Error("Check failed");
      });

      const result = await checker();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toContain("Check failed");
    });
  });
});
