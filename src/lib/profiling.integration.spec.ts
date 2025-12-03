import { DebugSession, DebugSessionConfig } from './debug-session';
import * as path from 'path';
import * as fs from 'fs';

describe('Performance Profiling Integration', () => {
  let session: DebugSession;
  const testFixturesDir = path.join(__dirname, '../../test-fixtures');

  beforeAll(() => {
    // Ensure test fixtures directory exists
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }

    // Create a simple test script for profiling
    const testScript = `
// Simple script for profiling tests
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function allocateMemory() {
  const arr = [];
  for (let i = 0; i < 1000; i++) {
    arr.push({ id: i, data: new Array(100).fill(i) });
  }
  return arr;
}

// Run some operations
const result = fibonacci(10);
const memory = allocateMemory();

console.log('Fibonacci result:', result);
console.log('Memory allocated:', memory.length);
`;

    fs.writeFileSync(
      path.join(testFixturesDir, 'profiling-test.js'),
      testScript,
    );
  });

  afterEach(async () => {
    if (session) {
      await session.cleanup();
    }
  });

  describe('CPU Profiling', () => {
    it('should start and stop CPU profiling', async () => {
      const config: DebugSessionConfig = {
        command: 'node',
        args: [path.join(testFixturesDir, 'profiling-test.js')],
        cwd: testFixturesDir,
        timeout: 10000,
      };

      session = new DebugSession('test-cpu-profile', config);
      await session.start();

      // Start CPU profiling
      await session.startCPUProfile();
      expect(session.isCPUProfiling()).toBe(true);

      // Resume execution to run the script
      await session.resume();

      // Wait a bit for the script to execute
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Stop CPU profiling
      const profile = await session.stopCPUProfile();
      expect(session.isCPUProfiling()).toBe(false);

      // Verify profile structure
      expect(profile).toBeDefined();
      expect(profile.nodes).toBeDefined();
      expect(profile.nodes.length).toBeGreaterThan(0);
      expect(profile.startTime).toBeDefined();
      expect(profile.endTime).toBeDefined();
      expect(profile.endTime).toBeGreaterThan(profile.startTime);
    }, 15000);

    it('should analyze CPU profile and identify bottlenecks', async () => {
      const config: DebugSessionConfig = {
        command: 'node',
        args: [path.join(testFixturesDir, 'profiling-test.js')],
        cwd: testFixturesDir,
        timeout: 10000,
      };

      session = new DebugSession('test-cpu-analysis', config);
      await session.start();

      await session.startCPUProfile();
      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const profile = await session.stopCPUProfile();
      const analysis = session.analyzeCPUProfile(profile);

      // Verify analysis structure
      expect(analysis).toBeDefined();
      expect(analysis.totalTime).toBeGreaterThan(0);
      expect(analysis.topFunctions).toBeDefined();
      expect(Array.isArray(analysis.topFunctions)).toBe(true);
      expect(analysis.bottlenecks).toBeDefined();
      expect(Array.isArray(analysis.bottlenecks)).toBe(true);

      // Verify top functions have required fields
      if (analysis.topFunctions.length > 0) {
        const topFunction = analysis.topFunctions[0];
        expect(topFunction.functionName).toBeDefined();
        expect(topFunction.selfTime).toBeGreaterThanOrEqual(0);
        expect(topFunction.percentage).toBeGreaterThanOrEqual(0);
      }
    }, 15000);
  });

  describe('Memory Profiling', () => {
    it('should take a heap snapshot', async () => {
      const config: DebugSessionConfig = {
        command: 'node',
        args: [path.join(testFixturesDir, 'profiling-test.js')],
        cwd: testFixturesDir,
        timeout: 10000,
      };

      session = new DebugSession('test-heap-snapshot', config);
      await session.start();

      // Take a heap snapshot
      const snapshot = await session.takeHeapSnapshot();

      // Verify snapshot structure
      expect(snapshot).toBeDefined();
      expect(snapshot.snapshot).toBeDefined();
      expect(snapshot.snapshot.node_count).toBeGreaterThan(0);
      expect(snapshot.nodes).toBeDefined();
      expect(snapshot.nodes.length).toBeGreaterThan(0);
    }, 15000);

    it('should get memory usage statistics', async () => {
      const config: DebugSessionConfig = {
        command: 'node',
        args: [path.join(testFixturesDir, 'profiling-test.js')],
        cwd: testFixturesDir,
        timeout: 10000,
      };

      session = new DebugSession('test-memory-usage', config);
      await session.start();

      // Get memory usage
      const memoryUsage = await session.getMemoryUsage();

      // Verify memory usage structure
      expect(memoryUsage).toBeDefined();
      expect(memoryUsage.usedSize).toBeGreaterThan(0);
      expect(memoryUsage.totalSize).toBeGreaterThan(0);
      expect(memoryUsage.timestamp).toBeGreaterThan(0);
      expect(memoryUsage.usedSize).toBeLessThanOrEqual(memoryUsage.totalSize);
    }, 15000);

    it('should generate a memory report', async () => {
      const config: DebugSessionConfig = {
        command: 'node',
        args: [path.join(testFixturesDir, 'profiling-test.js')],
        cwd: testFixturesDir,
        timeout: 10000,
      };

      session = new DebugSession('test-memory-report', config);
      await session.start();

      // Take snapshot and generate report
      const snapshot = await session.takeHeapSnapshot();
      const report = await session.generateMemoryReport(snapshot);

      // Verify report structure
      expect(report).toBeDefined();
      expect(report.totalHeapSize).toBeGreaterThan(0);
      expect(report.usedHeapSize).toBeGreaterThan(0);
      expect(report.objectTypes).toBeDefined();
      expect(Array.isArray(report.objectTypes)).toBe(true);

      // Verify object types have required fields
      if (report.objectTypes.length > 0) {
        const objType = report.objectTypes[0];
        expect(objType.type).toBeDefined();
        expect(objType.count).toBeGreaterThan(0);
        expect(objType.size).toBeGreaterThan(0);
        expect(objType.percentage).toBeGreaterThanOrEqual(0);
      }
    }, 15000);
  });

  describe('Performance Timeline', () => {
    it('should start and stop performance recording', async () => {
      const config: DebugSessionConfig = {
        command: 'node',
        args: [path.join(testFixturesDir, 'profiling-test.js')],
        cwd: testFixturesDir,
        timeout: 10000,
      };

      session = new DebugSession('test-performance-timeline', config);
      await session.start();

      // Start performance recording
      await session.startPerformanceRecording();
      expect(session.isPerformanceRecording()).toBe(true);

      // Resume execution
      await session.resume();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Stop performance recording
      const report = await session.stopPerformanceRecording();
      expect(session.isPerformanceRecording()).toBe(false);

      // Verify report structure
      expect(report).toBeDefined();
      expect(report.totalDuration).toBeGreaterThan(0);
      expect(report.eventCount).toBeGreaterThanOrEqual(0);
      expect(report.events).toBeDefined();
      expect(Array.isArray(report.events)).toBe(true);
    }, 15000);
  });
});
