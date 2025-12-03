import { CPUProfiler, CPUProfile, ProfileNode } from './cpu-profiler';
import { InspectorClient } from './inspector-client';
import { EventEmitter } from 'events';

describe('CPUProfiler', () => {
  let mockInspector: jest.Mocked<InspectorClient>;
  let profiler: CPUProfiler;

  beforeEach(() => {
    mockInspector = Object.assign(new EventEmitter(), {
      send: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    }) as any;

    profiler = new CPUProfiler(mockInspector);
  });

  describe('start', () => {
    it('should enable profiler and start profiling', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.start();

      expect(mockInspector.send).toHaveBeenCalledWith('Profiler.enable');
      expect(mockInspector.send).toHaveBeenCalledWith('Profiler.start');
      expect(profiler.isProfiling()).toBe(true);
    });

    it('should throw error if profiling is already active', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.start();

      await expect(profiler.start()).rejects.toThrow(
        'CPU profiling is already active',
      );
    });
  });

  describe('stop', () => {
    it('should stop profiling and return profile data', async () => {
      const mockProfile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'main',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 5,
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      mockInspector.send.mockResolvedValue({ profile: mockProfile });

      await profiler.start();
      const profile = await profiler.stop();

      expect(mockInspector.send).toHaveBeenCalledWith('Profiler.stop');
      expect(mockInspector.send).toHaveBeenCalledWith('Profiler.disable');
      expect(profiler.isProfiling()).toBe(false);
      expect(profile).toEqual(mockProfile);
      expect(profiler.getCurrentProfile()).toEqual(mockProfile);
    });

    it('should throw error if profiling is not active', async () => {
      await expect(profiler.stop()).rejects.toThrow(
        'CPU profiling is not active',
      );
    });
  });

  describe('isProfiling', () => {
    it('should return false initially', () => {
      expect(profiler.isProfiling()).toBe(false);
    });

    it('should return true when profiling is active', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.start();

      expect(profiler.isProfiling()).toBe(true);
    });

    it('should return false after stopping', async () => {
      mockInspector.send.mockResolvedValue({
        profile: { nodes: [], startTime: 0, endTime: 0 },
      });

      await profiler.start();
      await profiler.stop();

      expect(profiler.isProfiling()).toBe(false);
    });
  });

  describe('getCurrentProfile', () => {
    it('should return null initially', () => {
      expect(profiler.getCurrentProfile()).toBeNull();
    });

    it('should return profile after stopping', async () => {
      const mockProfile: CPUProfile = {
        nodes: [],
        startTime: 1000,
        endTime: 2000,
      };

      mockInspector.send.mockResolvedValue({ profile: mockProfile });

      await profiler.start();
      await profiler.stop();

      expect(profiler.getCurrentProfile()).toEqual(mockProfile);
    });
  });

  describe('generateFlameGraph', () => {
    it('should generate flame graph from simple profile', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'main',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 10,
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      const flameGraph = profiler.generateFlameGraph(profile);

      expect(flameGraph.name).toBe('(root)');
      expect(flameGraph.children).toHaveLength(1);
      expect(flameGraph.children![0].name).toBe('main');
      expect(flameGraph.children![0].value).toBe(10);
      expect(flameGraph.children![0].file).toBe('file:///test.js');
      expect(flameGraph.children![0].line).toBe(10);
    });

    it('should generate flame graph with parent-child relationships', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'parent',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 5,
            children: [2],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'child',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 20,
              columnNumber: 0,
            },
            hitCount: 3,
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      const flameGraph = profiler.generateFlameGraph(profile);

      expect(flameGraph.children).toHaveLength(1);
      expect(flameGraph.children![0].name).toBe('parent');
      expect(flameGraph.children![0].children).toHaveLength(1);
      expect(flameGraph.children![0].children![0].name).toBe('child');
    });

    it('should use samples and timeDeltas when available', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'func1',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 0,
          },
          {
            id: 2,
            callFrame: {
              functionName: 'func2',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 20,
              columnNumber: 0,
            },
            hitCount: 0,
          },
        ],
        startTime: 1000,
        endTime: 2000,
        samples: [1, 1, 2],
        timeDeltas: [100, 200, 150],
      };

      const flameGraph = profiler.generateFlameGraph(profile);

      expect(flameGraph.children).toHaveLength(2);
      const func1 = flameGraph.children!.find((n) => n.name === 'func1');
      const func2 = flameGraph.children!.find((n) => n.name === 'func2');
      expect(func1?.value).toBe(300); // 100 + 200
      expect(func2?.value).toBe(150);
    });

    it('should handle anonymous functions', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: '',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 5,
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      const flameGraph = profiler.generateFlameGraph(profile);

      expect(flameGraph.children![0].name).toBe('(anonymous)');
    });

    it('should filter out nodes with zero value', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'parent',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 5,
            children: [2],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'child',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 20,
              columnNumber: 0,
            },
            hitCount: 0,
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      const flameGraph = profiler.generateFlameGraph(profile);

      expect(flameGraph.children![0].children).toHaveLength(0);
    });

    it('should handle missing nodes in nodeMap', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'parent',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 5,
            children: [999], // Non-existent child
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      const flameGraph = profiler.generateFlameGraph(profile);

      expect(flameGraph.children![0].children).toHaveLength(0);
    });
  });

  describe('generateCallTree', () => {
    it('should generate call tree from profile', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'main',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 10,
          },
        ],
        startTime: 1000,
        endTime: 2000,
      };

      const callTree = profiler.generateCallTree(profile);

      expect(callTree.name).toBe('(root)');
      expect(callTree.children).toHaveLength(1);
      expect(callTree.children![0].name).toBe('main');
    });
  });

  describe('analyzeProfile', () => {
    it('should analyze profile with samples and timeDeltas', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'slowFunction',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 0,
          },
          {
            id: 2,
            callFrame: {
              functionName: 'fastFunction',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 20,
              columnNumber: 0,
            },
            hitCount: 0,
          },
        ],
        startTime: 0,
        endTime: 1000,
        samples: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
        timeDeltas: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.totalTime).toBe(1000);
      expect(analysis.topFunctions).toHaveLength(2);
      expect(analysis.topFunctions[0].functionName).toBe('slowFunction');
      expect(analysis.topFunctions[0].selfTime).toBe(800);
      expect(analysis.topFunctions[0].percentage).toBe(80);
      expect(analysis.bottlenecks).toHaveLength(2); // Both >5%
      expect(analysis.bottlenecks[0].functionName).toBe('slowFunction');
      expect(analysis.bottlenecks[1].functionName).toBe('fastFunction');
    });

    it('should analyze profile using hitCount when samples not available', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'func1',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 80,
          },
          {
            id: 2,
            callFrame: {
              functionName: 'func2',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 20,
              columnNumber: 0,
            },
            hitCount: 20,
          },
        ],
        startTime: 0,
        endTime: 100,
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.totalTime).toBe(100);
      expect(analysis.topFunctions).toHaveLength(2);
      expect(analysis.topFunctions[0].functionName).toBe('func1');
      expect(analysis.topFunctions[0].selfTime).toBe(80);
    });

    it('should identify bottlenecks (functions >5% of time)', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'bottleneck',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 60,
          },
          {
            id: 2,
            callFrame: {
              functionName: 'normal',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 20,
              columnNumber: 0,
            },
            hitCount: 4,
          },
        ],
        startTime: 0,
        endTime: 100,
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.bottlenecks).toHaveLength(1);
      expect(analysis.bottlenecks[0].functionName).toBe('bottleneck');
      expect(analysis.bottlenecks[0].impact).toBeGreaterThan(5);
    });

    it('should handle empty profile', () => {
      const profile: CPUProfile = {
        nodes: [],
        startTime: 0,
        endTime: 100,
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.totalTime).toBe(100);
      expect(analysis.topFunctions).toHaveLength(0);
      expect(analysis.bottlenecks).toHaveLength(0);
    });

    it('should handle profile with zero total time', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'func',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 10,
          },
        ],
        startTime: 0,
        endTime: 0,
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.totalTime).toBe(0);
      expect(analysis.topFunctions[0].percentage).toBe(0);
    });

    it('should aggregate multiple calls to same function', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'repeated',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 30,
          },
          {
            id: 2,
            callFrame: {
              functionName: 'repeated',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 20,
          },
        ],
        startTime: 0,
        endTime: 100,
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.topFunctions).toHaveLength(1);
      expect(analysis.topFunctions[0].selfTime).toBe(50);
    });

    it('should limit top functions to 20', () => {
      const nodes: ProfileNode[] = [];
      for (let i = 0; i < 30; i++) {
        nodes.push({
          id: i,
          callFrame: {
            functionName: `func${i}`,
            scriptId: 'script-1',
            url: 'file:///test.js',
            lineNumber: i,
            columnNumber: 0,
          },
          hitCount: 30 - i,
        });
      }

      const profile: CPUProfile = {
        nodes,
        startTime: 0,
        endTime: 1000,
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.topFunctions).toHaveLength(20);
    });

    it('should handle missing node in samples', () => {
      const profile: CPUProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'func1',
              scriptId: 'script-1',
              url: 'file:///test.js',
              lineNumber: 10,
              columnNumber: 0,
            },
            hitCount: 0,
          },
        ],
        startTime: 0,
        endTime: 1000,
        samples: [1, 999], // 999 doesn't exist
        timeDeltas: [100, 200],
      };

      const analysis = profiler.analyzeProfile(profile);

      expect(analysis.topFunctions).toHaveLength(1);
      expect(analysis.topFunctions[0].selfTime).toBe(100);
    });
  });

  describe('formatAnalysis', () => {
    it('should format analysis with bottlenecks', () => {
      const analysis = {
        totalTime: 1000,
        topFunctions: [
          {
            functionName: 'slowFunc',
            file: 'file:///test.js',
            line: 10,
            selfTime: 800,
            totalTime: 800,
            percentage: 80,
          },
          {
            functionName: 'fastFunc',
            file: 'file:///test.js',
            line: 20,
            selfTime: 200,
            totalTime: 200,
            percentage: 20,
          },
        ],
        bottlenecks: [
          {
            functionName: 'slowFunc',
            file: 'file:///test.js',
            line: 10,
            reason: 'Takes 80.00% of total execution time',
            impact: 80,
          },
        ],
      };

      const formatted = profiler.formatAnalysis(analysis);

      expect(formatted).toContain('Total Time: 1000.00μs');
      expect(formatted).toContain('Bottlenecks:');
      expect(formatted).toContain('slowFunc');
      expect(formatted).toContain('Takes 80.00% of total execution time');
      expect(formatted).toContain('Top Functions by Self Time:');
      expect(formatted).toContain('80.00% - slowFunc');
      expect(formatted).toContain('20.00% - fastFunc');
    });

    it('should format analysis without bottlenecks', () => {
      const analysis = {
        totalTime: 1000,
        topFunctions: [
          {
            functionName: 'func1',
            file: 'file:///test.js',
            line: 10,
            selfTime: 400,
            totalTime: 400,
            percentage: 40,
          },
        ],
        bottlenecks: [],
      };

      const formatted = profiler.formatAnalysis(analysis);

      expect(formatted).toContain('Total Time: 1000.00μs');
      expect(formatted).not.toContain('Bottlenecks:');
      expect(formatted).toContain('Top Functions by Self Time:');
    });

    it('should limit formatted output to top 10 functions', () => {
      const topFunctions = [];
      for (let i = 0; i < 15; i++) {
        topFunctions.push({
          functionName: `func${i}`,
          file: 'file:///test.js',
          line: i,
          selfTime: 100 - i,
          totalTime: 100 - i,
          percentage: (100 - i) / 10,
        });
      }

      const analysis = {
        totalTime: 1000,
        topFunctions,
        bottlenecks: [],
      };

      const formatted = profiler.formatAnalysis(analysis);

      const lines = formatted.split('\n');
      const functionLines = lines.filter((line) => line.includes('func'));
      expect(functionLines.length).toBeLessThanOrEqual(10);
    });
  });
});
