import { MemoryProfiler, HeapSnapshot, MemoryUsage } from './memory-profiler';
import { InspectorClient } from './inspector-client';
import { EventEmitter } from 'events';

describe('MemoryProfiler', () => {
  let mockInspector: jest.Mocked<InspectorClient>;
  let profiler: MemoryProfiler;

  beforeEach(() => {
    mockInspector = Object.assign(new EventEmitter(), {
      send: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    }) as any;

    // Make the real on/off/emit work for event handling
    mockInspector.on = EventEmitter.prototype.on.bind(mockInspector);
    mockInspector.off = EventEmitter.prototype.off.bind(mockInspector);
    mockInspector.emit = EventEmitter.prototype.emit.bind(mockInspector);

    profiler = new MemoryProfiler(mockInspector);
  });

  describe('enable', () => {
    it('should enable heap profiler', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.enable();

      expect(mockInspector.send).toHaveBeenCalledWith('HeapProfiler.enable');
    });
  });

  describe('disable', () => {
    it('should disable heap profiler', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.disable();

      expect(mockInspector.send).toHaveBeenCalledWith('HeapProfiler.disable');
    });
  });

  describe('takeHeapSnapshot', () => {
    it('should take a heap snapshot', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
            node_types: [['object', 'string', 'number']],
            edge_fields: ['type', 'name_or_index', 'to_node'],
            edge_types: [['context', 'element', 'property']],
          },
          node_count: 1,
          edge_count: 0,
        },
        nodes: [0, 0, 1, 100, 0],
        edges: [],
        strings: ['Object'],
      };

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          // Emit the chunk during the send call, not after
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: JSON.stringify(mockSnapshot),
          });
        }
        return {};
      });

      const snapshot = await profiler.takeHeapSnapshot();

      expect(mockInspector.send).toHaveBeenCalledWith('HeapProfiler.enable');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'HeapProfiler.takeHeapSnapshot',
        { reportProgress: false },
      );
      expect(snapshot).toEqual(mockSnapshot);
      expect(profiler.getSnapshots()).toHaveLength(1);
    });

    it('should handle multiple chunks', async () => {
      const part1 =
        '{"snapshot":{"meta":{"node_fields":[],"node_types":[[]],"edge_fields":[],"edge_types":[[]]},"node_count":0,"edge_count":0},"nodes":';
      const part2 = '[],"edges":[],"strings":[]}';

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          // Emit chunks during the send call
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: part1,
          });
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: part2,
          });
        }
        return {};
      });

      const snapshot = await profiler.takeHeapSnapshot();

      expect(snapshot.nodes).toEqual([]);
      expect(snapshot.edges).toEqual([]);
    });
  });

  describe('startTrackingHeapObjects', () => {
    it('should start tracking heap objects with default interval', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.startTrackingHeapObjects();

      expect(mockInspector.send).toHaveBeenCalledWith('HeapProfiler.enable');
      expect(mockInspector.send).toHaveBeenCalledWith(
        'HeapProfiler.startTrackingHeapObjects',
        { trackAllocations: true },
      );
    });

    it('should start tracking heap objects with custom interval', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.startTrackingHeapObjects(16384);

      expect(mockInspector.send).toHaveBeenCalledWith(
        'HeapProfiler.startTrackingHeapObjects',
        { trackAllocations: true },
      );
    });
  });

  describe('stopTrackingHeapObjects', () => {
    it('should stop tracking and return snapshot', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: [],
            node_types: [[]],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 0,
          edge_count: 0,
        },
        nodes: [],
        edges: [],
        strings: [],
      };

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.stopTrackingHeapObjects') {
          // Emit the chunk during the send call
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: JSON.stringify(mockSnapshot),
          });
        }
        return {};
      });

      await profiler.startTrackingHeapObjects();

      const snapshot = await profiler.stopTrackingHeapObjects();

      expect(mockInspector.send).toHaveBeenCalledWith(
        'HeapProfiler.stopTrackingHeapObjects',
        { reportProgress: false },
      );
      expect(snapshot).toEqual(mockSnapshot);
    });

    it('should stop tracking with reportProgress true', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: [],
            node_types: [[]],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 0,
          edge_count: 0,
        },
        nodes: [],
        edges: [],
        strings: [],
      };

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.stopTrackingHeapObjects') {
          // Emit the chunk during the send call
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: JSON.stringify(mockSnapshot),
          });
        }
        return {};
      });

      await profiler.startTrackingHeapObjects();

      await profiler.stopTrackingHeapObjects(true);

      expect(mockInspector.send).toHaveBeenCalledWith(
        'HeapProfiler.stopTrackingHeapObjects',
        { reportProgress: true },
      );
    });

    it('should throw error if tracking is not active', async () => {
      await expect(profiler.stopTrackingHeapObjects()).rejects.toThrow(
        'Heap tracking is not active',
      );
    });
  });

  describe('getMemoryUsage', () => {
    it('should get current memory usage', async () => {
      mockInspector.send.mockResolvedValue({
        usedSize: 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      const usage = await profiler.getMemoryUsage();

      expect(mockInspector.send).toHaveBeenCalledWith('Runtime.getHeapUsage');
      expect(usage.usedSize).toBe(1024 * 1024);
      expect(usage.totalSize).toBe(10 * 1024 * 1024);
      expect(usage.timestamp).toBeDefined();
      expect(profiler.getMemoryUsageHistory()).toHaveLength(1);
    });
  });

  describe('collectGarbage', () => {
    it('should collect garbage', async () => {
      mockInspector.send.mockResolvedValue({});

      await profiler.collectGarbage();

      expect(mockInspector.send).toHaveBeenCalledWith(
        'HeapProfiler.collectGarbage',
      );
    });
  });

  describe('detectMemoryLeaks', () => {
    it('should detect no leak when memory is stable', async () => {
      mockInspector.send.mockResolvedValue({
        usedSize: 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      const analysis = await profiler.detectMemoryLeaks(100, 30);

      expect(analysis.isLeaking).toBe(false);
      expect(analysis.growthRate).toBeLessThan(1024 * 1024);
      expect(analysis.snapshots.length).toBeGreaterThan(1);
    });

    it('should detect leak when memory grows rapidly', async () => {
      let usedSize = 1024 * 1024;
      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'Runtime.getHeapUsage') {
          usedSize += 2 * 1024 * 1024; // Grow by 2MB each time
          return {
            usedSize,
            totalSize: 100 * 1024 * 1024,
          };
        }
        return {};
      });

      const analysis = await profiler.detectMemoryLeaks(100, 30);

      expect(analysis.isLeaking).toBe(true);
      expect(analysis.growthRate).toBeGreaterThan(1024 * 1024);
    });

    it('should return no leak if less than 2 snapshots', async () => {
      mockInspector.send.mockResolvedValue({
        usedSize: 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      const analysis = await profiler.detectMemoryLeaks(0, 1000);

      expect(analysis.isLeaking).toBe(false);
      expect(analysis.growthRate).toBe(0);
      expect(analysis.snapshots.length).toBeLessThan(2);
    });
  });

  describe('generateMemoryReport', () => {
    it('should generate report from provided snapshot', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
            node_types: [['object', 'string', 'number']],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 2,
          edge_count: 0,
        },
        nodes: [
          0,
          0,
          1,
          1000,
          0, // object type, size 1000
          1,
          1,
          2,
          500,
          0, // string type, size 500
        ],
        edges: [],
        strings: ['Object', 'String'],
      };

      mockInspector.send.mockResolvedValue({
        usedSize: 2 * 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      const report = await profiler.generateMemoryReport(mockSnapshot);

      expect(report.totalHeapSize).toBe(10 * 1024 * 1024);
      expect(report.usedHeapSize).toBe(2 * 1024 * 1024);
      expect(report.objectTypes.length).toBeGreaterThan(0);
      expect(report.objectTypes[0].type).toBe('object');
      expect(report.objectTypes[0].size).toBe(1000);
    });

    it('should generate report from most recent snapshot if none provided', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
            node_types: [['object']],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 1,
          edge_count: 0,
        },
        nodes: [0, 0, 1, 1000, 0],
        edges: [],
        strings: ['Object'],
      };

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          // Emit the chunk during the send call
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: JSON.stringify(mockSnapshot),
          });
          return {};
        }
        return {
          usedSize: 2 * 1024 * 1024,
          totalSize: 10 * 1024 * 1024,
        };
      });

      await profiler.takeHeapSnapshot();

      const report = await profiler.generateMemoryReport();

      expect(report.objectTypes.length).toBeGreaterThan(0);
    });

    it('should generate report without snapshot', async () => {
      mockInspector.send.mockResolvedValue({
        usedSize: 2 * 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      const report = await profiler.generateMemoryReport();

      expect(report.totalHeapSize).toBe(10 * 1024 * 1024);
      expect(report.usedHeapSize).toBe(2 * 1024 * 1024);
      expect(report.objectTypes).toEqual([]);
    });

    it('should aggregate object types correctly', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
            node_types: [['object', 'string']],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 3,
          edge_count: 0,
        },
        nodes: [
          0,
          0,
          1,
          1000,
          0, // object
          0,
          1,
          2,
          500,
          0, // object
          1,
          2,
          3,
          300,
          0, // string
        ],
        edges: [],
        strings: ['Object', 'Object2', 'String'],
      };

      mockInspector.send.mockResolvedValue({
        usedSize: 2 * 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      const report = await profiler.generateMemoryReport(mockSnapshot);

      const objectType = report.objectTypes.find((t) => t.type === 'object');
      expect(objectType).toBeDefined();
      expect(objectType!.count).toBe(2);
      expect(objectType!.size).toBe(1500);
    });

    it('should limit to top 20 object types', async () => {
      const nodes: number[] = [];
      const nodeTypes: string[] = [];

      for (let i = 0; i < 30; i++) {
        nodeTypes.push(`type${i}`);
        nodes.push(i, i, i + 1, 100 * (30 - i), 0);
      }

      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
            node_types: [nodeTypes],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 30,
          edge_count: 0,
        },
        nodes,
        edges: [],
        strings: nodeTypes,
      };

      mockInspector.send.mockResolvedValue({
        usedSize: 10 * 1024 * 1024,
        totalSize: 100 * 1024 * 1024,
      });

      const report = await profiler.generateMemoryReport(mockSnapshot);

      expect(report.objectTypes.length).toBeLessThanOrEqual(20);
    });
  });

  describe('formatMemoryReport', () => {
    it('should format memory report with object types', () => {
      const report = {
        totalHeapSize: 10 * 1024 * 1024,
        usedHeapSize: 5 * 1024 * 1024,
        heapSizeLimit: 10 * 1024 * 1024,
        mallocedMemory: 0,
        peakMallocedMemory: 0,
        objectTypes: [
          {
            type: 'Object',
            count: 1000,
            size: 2 * 1024 * 1024,
            percentage: 40,
          },
          {
            type: 'String',
            count: 500,
            size: 1 * 1024 * 1024,
            percentage: 20,
          },
        ],
      };

      const formatted = profiler.formatMemoryReport(report);

      expect(formatted).toContain('Memory Usage Report');
      expect(formatted).toContain('Total Heap Size: 10.00 MB');
      expect(formatted).toContain('Used Heap Size: 5.00 MB');
      expect(formatted).toContain('Heap Usage: 50.00%');
      expect(formatted).toContain('Top Object Types by Size:');
      expect(formatted).toContain('40.00% - Object');
      expect(formatted).toContain('20.00% - String');
    });

    it('should format memory report without object types', () => {
      const report = {
        totalHeapSize: 10 * 1024 * 1024,
        usedHeapSize: 5 * 1024 * 1024,
        heapSizeLimit: 10 * 1024 * 1024,
        mallocedMemory: 0,
        peakMallocedMemory: 0,
        objectTypes: [],
      };

      const formatted = profiler.formatMemoryReport(report);

      expect(formatted).toContain('Memory Usage Report');
      expect(formatted).not.toContain('Top Object Types by Size:');
    });

    it('should format bytes correctly', () => {
      const report = {
        totalHeapSize: 500,
        usedHeapSize: 1500,
        heapSizeLimit: 500,
        mallocedMemory: 0,
        peakMallocedMemory: 0,
        objectTypes: [],
      };

      const formatted = profiler.formatMemoryReport(report);

      expect(formatted).toContain('500 B');
      expect(formatted).toContain('1.46 KB');
    });

    it('should limit formatted output to top 10 object types', () => {
      const objectTypes = [];
      for (let i = 0; i < 15; i++) {
        objectTypes.push({
          type: `Type${i}`,
          count: 100,
          size: 1000 * (15 - i),
          percentage: 10 - i,
        });
      }

      const report = {
        totalHeapSize: 10 * 1024 * 1024,
        usedHeapSize: 5 * 1024 * 1024,
        heapSizeLimit: 10 * 1024 * 1024,
        mallocedMemory: 0,
        peakMallocedMemory: 0,
        objectTypes,
      };

      const formatted = profiler.formatMemoryReport(report);

      const lines = formatted.split('\n');
      const typeLines = lines.filter((line) =>
        line.trim().match(/^\d+\.\d+% - Type/),
      );
      expect(typeLines.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getSnapshots', () => {
    it('should return empty array initially', () => {
      expect(profiler.getSnapshots()).toEqual([]);
    });

    it('should return all captured snapshots', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: [],
            node_types: [[]],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 0,
          edge_count: 0,
        },
        nodes: [],
        edges: [],
        strings: [],
      };

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          // Emit the chunk during the send call
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: JSON.stringify(mockSnapshot),
          });
        }
        return {};
      });

      await profiler.takeHeapSnapshot();

      expect(profiler.getSnapshots()).toHaveLength(1);
    });
  });

  describe('getMemoryUsageHistory', () => {
    it('should return empty array initially', () => {
      expect(profiler.getMemoryUsageHistory()).toEqual([]);
    });

    it('should return memory usage history', async () => {
      mockInspector.send.mockResolvedValue({
        usedSize: 1024 * 1024,
        totalSize: 10 * 1024 * 1024,
      });

      await profiler.getMemoryUsage();
      await profiler.getMemoryUsage();

      expect(profiler.getMemoryUsageHistory()).toHaveLength(2);
    });
  });

  describe('clearHistory', () => {
    it('should clear snapshots and memory usage history', async () => {
      const mockSnapshot: HeapSnapshot = {
        snapshot: {
          meta: {
            node_fields: [],
            node_types: [[]],
            edge_fields: [],
            edge_types: [[]],
          },
          node_count: 0,
          edge_count: 0,
        },
        nodes: [],
        edges: [],
        strings: [],
      };

      mockInspector.send.mockImplementation(async (method) => {
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          // Emit the chunk during the send call
          mockInspector.emit('HeapProfiler.addHeapSnapshotChunk', {
            chunk: JSON.stringify(mockSnapshot),
          });
          return {};
        }
        return {
          usedSize: 1024 * 1024,
          totalSize: 10 * 1024 * 1024,
        };
      });

      await profiler.takeHeapSnapshot();
      await profiler.getMemoryUsage();

      expect(profiler.getSnapshots()).toHaveLength(1);
      expect(profiler.getMemoryUsageHistory()).toHaveLength(1);

      profiler.clearHistory();

      expect(profiler.getSnapshots()).toHaveLength(0);
      expect(profiler.getMemoryUsageHistory()).toHaveLength(0);
    });
  });
});
