/**
 * Health status enumeration
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded',
}

/**
 * Dependency health check result
 */
export interface DependencyHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  dependencies: DependencyHealth[];
  details?: Record<string, any>;
}

/**
 * Readiness check result
 */
export interface ReadinessCheckResult {
  ready: boolean;
  timestamp: string;
  checks: {
    name: string;
    ready: boolean;
    message?: string;
  }[];
}

/**
 * Liveness check result
 */
export interface LivenessCheckResult {
  alive: boolean;
  timestamp: string;
  message?: string;
}

/**
 * Dependency checker function type
 */
export type DependencyChecker = () => Promise<DependencyHealth>;

/**
 * Health checker for production readiness
 * Provides health, readiness, and liveness endpoints
 */
export class HealthChecker {
  private startTime: number;
  private dependencyCheckers = new Map<string, DependencyChecker>();
  private lastHealthCheck?: HealthCheckResult;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Register a dependency health checker
   */
  registerDependencyChecker(name: string, checker: DependencyChecker): void {
    this.dependencyCheckers.set(name, checker);
  }

  /**
   * Unregister a dependency health checker
   */
  unregisterDependencyChecker(name: string): void {
    this.dependencyCheckers.delete(name);
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check health of a single dependency
   */
  private async checkDependency(
    name: string,
    checker: DependencyChecker,
  ): Promise<DependencyHealth> {
    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const result = await Promise.race([
        checker(),
        new Promise<DependencyHealth>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('Health check timeout')),
            5000,
          );
        }),
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      return {
        ...result,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      return {
        name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Perform health check
   * Checks all registered dependencies and returns overall health status
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const dependencies: DependencyHealth[] = [];

    // Check all dependencies
    for (const [name, checker] of this.dependencyCheckers.entries()) {
      const health = await this.checkDependency(name, checker);
      dependencies.push(health);
    }

    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;

    const unhealthyCount = dependencies.filter(
      (d) => d.status === HealthStatus.UNHEALTHY,
    ).length;

    const degradedCount = dependencies.filter(
      (d) => d.status === HealthStatus.DEGRADED,
    ).length;

    if (unhealthyCount > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (degradedCount > 0) {
      overallStatus = HealthStatus.DEGRADED;
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      dependencies,
    };

    this.lastHealthCheck = result;
    return result;
  }

  /**
   * Get last health check result (cached)
   */
  getLastHealthCheck(): HealthCheckResult | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Perform readiness check
   * Checks if the service is ready to accept requests
   */
  async checkReadiness(): Promise<ReadinessCheckResult> {
    const checks: { name: string; ready: boolean; message?: string }[] = [];

    // Check if dependencies are healthy
    for (const [name, checker] of this.dependencyCheckers.entries()) {
      const health = await this.checkDependency(name, checker);
      checks.push({
        name,
        ready: health.status !== HealthStatus.UNHEALTHY,
        message: health.message,
      });
    }

    // Service is ready if all dependencies are not unhealthy
    const ready = checks.every((check) => check.ready);

    return {
      ready,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Perform liveness check
   * Checks if the service is alive and responsive
   */
  async checkLiveness(): Promise<LivenessCheckResult> {
    // Basic liveness check - if we can execute this, we're alive
    // In a real implementation, you might check for deadlocks, etc.

    try {
      // Simple check: can we get the current time?
      const now = Date.now();

      return {
        alive: true,
        timestamp: new Date(now).toISOString(),
      };
    } catch (error) {
      return {
        alive: false,
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicHealthChecks(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Get health endpoint data (for HTTP endpoint)
   */
  async getHealthEndpointData(): Promise<string> {
    const health = await this.checkHealth();
    return JSON.stringify(health, null, 2);
  }

  /**
   * Get readiness endpoint data (for HTTP endpoint)
   */
  async getReadinessEndpointData(): Promise<string> {
    const readiness = await this.checkReadiness();
    return JSON.stringify(readiness, null, 2);
  }

  /**
   * Get liveness endpoint data (for HTTP endpoint)
   */
  async getLivenessEndpointData(): Promise<string> {
    const liveness = await this.checkLiveness();
    return JSON.stringify(liveness, null, 2);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopPeriodicHealthChecks();
    this.dependencyCheckers.clear();
  }
}

/**
 * Create a simple dependency checker for testing
 */
export function createSimpleDependencyChecker(
  name: string,
  checkFn: () => Promise<boolean>,
): DependencyChecker {
  return async (): Promise<DependencyHealth> => {
    try {
      const isHealthy = await checkFn();
      return {
        name,
        status: isHealthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        message: isHealthy ? 'OK' : 'Check failed',
      };
    } catch (error) {
      return {
        name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
