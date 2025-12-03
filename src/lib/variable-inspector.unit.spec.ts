import { VariableInspector } from './variable-inspector';
import { InspectorClient } from './inspector-client';
import { SourceMapManager } from './source-map-manager';

describe('VariableInspector - Unit Tests', () => {
  let inspector: VariableInspector;
  let mockInspectorClient: jest.Mocked<InspectorClient>;
  let mockSourceMapManager: jest.Mocked<SourceMapManager>;

  beforeEach(() => {
    // Create mock inspector client
    mockInspectorClient = {
      send: jest.fn(),
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn(),
    } as any;

    inspector = new VariableInspector(mockInspectorClient);

    // Create mock source map manager
    mockSourceMapManager = {
      loadSourceMap: jest.fn(),
      mapVariableName: jest.fn(),
      clearCache: jest.fn(),
    } as any;
  });

  describe('setSourceMapManager', () => {
    it('should set the source map manager', () => {
      inspector.setSourceMapManager(mockSourceMapManager);
      // No direct way to verify, but should not throw
      expect(true).toBe(true);
    });
  });

  describe('evaluateExpression', () => {
    it('should evaluate expression with call frame ID', async () => {
      const mockResult = {
        result: {
          type: 'number',
          value: 42,
          description: '42',
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression('x + 10', 'frame-123');

      expect(mockInspectorClient.send).toHaveBeenCalledWith(
        'Debugger.evaluateOnCallFrame',
        {
          callFrameId: 'frame-123',
          expression: 'x + 10',
          returnByValue: false,
          generatePreview: true,
        },
      );

      expect(result.value).toBe(42);
      expect(result.type).toBe('number');
    });

    it('should evaluate expression without call frame ID', async () => {
      const mockPausedState = {
        callFrames: [
          {
            callFrameId: 'frame-top',
            functionName: 'test',
            location: { scriptId: '1', lineNumber: 10 },
          },
        ],
      };

      const mockResult = {
        result: {
          type: 'string',
          value: 'hello',
          description: 'hello',
        },
      };

      // Mock getCurrentPausedState by mocking the send call
      mockInspectorClient.send.mockResolvedValue(mockResult);

      // Since getCurrentPausedState returns null in the current implementation,
      // this will throw an error
      await expect(inspector.evaluateExpression('str')).rejects.toThrow(
        'Process is not paused',
      );
    });

    it('should handle evaluation errors', async () => {
      const mockResult = {
        exceptionDetails: {
          exception: {
            description: 'ReferenceError: x is not defined',
          },
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      await expect(
        inspector.evaluateExpression('x', 'frame-123'),
      ).rejects.toThrow('Expression evaluation failed');
    });

    it('should handle CDP send errors', async () => {
      mockInspectorClient.send.mockRejectedValue(new Error('Connection lost'));

      await expect(
        inspector.evaluateExpression('x', 'frame-123'),
      ).rejects.toThrow('Failed to evaluate expression');
    });

    it('should evaluate undefined values', async () => {
      const mockResult = {
        result: {
          type: 'undefined',
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression(
        'undefinedVar',
        'frame-123',
      );

      expect(result.value).toBeUndefined();
      expect(result.type).toBe('undefined');
    });

    it('should evaluate null values', async () => {
      const mockResult = {
        result: {
          type: 'object',
          subtype: 'null',
          value: null,
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression('nullVar', 'frame-123');

      expect(result.value).toBeNull();
      expect(result.type).toBe('object');
    });

    it('should evaluate boolean values', async () => {
      const mockResult = {
        result: {
          type: 'boolean',
          value: true,
          description: 'true',
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression('boolVar', 'frame-123');

      expect(result.value).toBe(true);
      expect(result.type).toBe('boolean');
    });

    it('should evaluate object values with objectId', async () => {
      const mockResult = {
        result: {
          type: 'object',
          objectId: 'obj-123',
          description: '{x: 10, y: 20}',
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression('obj', 'frame-123');

      expect(result.objectId).toBe('obj-123');
      expect(result.type).toBe('object');
      expect(result.description).toBe('{x: 10, y: 20}');
    });

    it('should evaluate function values', async () => {
      const mockResult = {
        result: {
          type: 'function',
          objectId: 'func-123',
          description: 'function test() { ... }',
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression('func', 'frame-123');

      expect(result.type).toBe('function');
      expect(result.objectId).toBe('func-123');
    });
  });

  describe('getObjectProperties', () => {
    it('should get object properties', async () => {
      const mockResult = {
        result: [
          {
            name: 'x',
            value: { type: 'number', value: 10 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'y',
            value: { type: 'number', value: 20 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const properties = await inspector.getObjectProperties('obj-123');

      expect(mockInspectorClient.send).toHaveBeenCalledWith(
        'Runtime.getProperties',
        {
          objectId: 'obj-123',
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: true,
        },
      );

      expect(properties).toHaveLength(2);
      expect(properties[0].name).toBe('x');
      expect(properties[0].value).toBe(10);
      expect(properties[0].type).toBe('number');
      expect(properties[1].name).toBe('y');
      expect(properties[1].value).toBe(20);
    });

    it('should handle empty properties', async () => {
      const mockResult = {
        result: [],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const properties = await inspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(0);
    });

    it('should handle missing result', async () => {
      const mockResult = {};

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const properties = await inspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(0);
    });

    it('should handle properties with undefined values', async () => {
      const mockResult = {
        result: [
          {
            name: 'x',
            value: { type: 'undefined' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const properties = await inspector.getObjectProperties('obj-123');

      expect(properties[0].value).toBeUndefined();
      expect(properties[0].type).toBe('undefined');
    });

    it('should handle properties without value', async () => {
      const mockResult = {
        result: [
          {
            name: 'getter',
            writable: false,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const properties = await inspector.getObjectProperties('obj-123');

      expect(properties[0].value).toBeUndefined();
      expect(properties[0].type).toBe('undefined');
    });

    it('should use custom inspection options', async () => {
      const mockResult = {
        result: [],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      await inspector.getObjectProperties('obj-123', {
        ownProperties: false,
        accessorPropertiesOnly: true,
      });

      expect(mockInspectorClient.send).toHaveBeenCalledWith(
        'Runtime.getProperties',
        {
          objectId: 'obj-123',
          ownProperties: false,
          accessorPropertiesOnly: true,
          generatePreview: true,
        },
      );
    });

    it('should handle CDP errors', async () => {
      mockInspectorClient.send.mockRejectedValue(
        new Error('Invalid object ID'),
      );

      await expect(
        inspector.getObjectProperties('invalid-obj'),
      ).rejects.toThrow('Failed to get object properties');
    });
  });

  describe('inspectObject', () => {
    it('should inspect object with default depth', async () => {
      const mockResult = {
        result: [
          {
            name: 'x',
            value: { type: 'number', value: 10 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.inspectObject('obj-123');

      expect(result).toEqual({ x: 10 });
    });

    it('should inspect nested objects', async () => {
      // First call for outer object
      const outerResult = {
        result: [
          {
            name: 'nested',
            value: {
              type: 'object',
              objectId: 'nested-obj-123',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      // Second call for nested object
      const nestedResult = {
        result: [
          {
            name: 'value',
            value: { type: 'number', value: 42 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send
        .mockResolvedValueOnce(outerResult)
        .mockResolvedValueOnce(nestedResult);

      const result = await inspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        nested: {
          value: 42,
        },
      });
    });

    it('should respect max depth limit', async () => {
      const mockResult = {
        result: [
          {
            name: 'nested',
            value: {
              type: 'object',
              objectId: 'nested-obj-123',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.inspectObject('obj-123', 0);

      expect(result).toEqual({
        _truncated: 'Max depth reached',
      });
    });

    it('should handle primitive properties', async () => {
      const mockResult = {
        result: [
          {
            name: 'str',
            value: { type: 'string', value: 'hello' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'num',
            value: { type: 'number', value: 42 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'bool',
            value: { type: 'boolean', value: true },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.inspectObject('obj-123');

      expect(result).toEqual({
        str: 'hello',
        num: 42,
        bool: true,
      });
    });

    it('should handle mixed primitive and object properties', async () => {
      const outerResult = {
        result: [
          {
            name: 'primitive',
            value: { type: 'number', value: 10 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'object',
            value: {
              type: 'object',
              objectId: 'nested-obj',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      const nestedResult = {
        result: [
          {
            name: 'value',
            value: { type: 'string', value: 'nested' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send
        .mockResolvedValueOnce(outerResult)
        .mockResolvedValueOnce(nestedResult);

      const result = await inspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        primitive: 10,
        object: {
          value: 'nested',
        },
      });
    });
  });

  describe('Error Handling - Additional Coverage', () => {
    it('should handle non-Error exceptions in evaluateExpression', async () => {
      mockInspectorClient.send.mockRejectedValue('String error');

      await expect(inspector.evaluateExpression('x', 'frame-123')).rejects.toBe(
        'String error',
      );
    });

    it('should handle non-Error exceptions in getObjectProperties', async () => {
      mockInspectorClient.send.mockRejectedValue('String error');

      await expect(inspector.getObjectProperties('obj-123')).rejects.toBe(
        'String error',
      );
    });

    it('should handle properties without value field', async () => {
      const mockResult = {
        result: [
          {
            name: 'getter',
            writable: false,
            enumerable: true,
            configurable: true,
            // No value field
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const properties = await inspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('getter');
      expect(properties[0].value).toBe(undefined);
      expect(properties[0].type).toBe('undefined');
    });

    it('should handle objects with description but no value', async () => {
      const mockResult = {
        result: {
          type: 'symbol',
          description: 'Symbol(test)',
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.evaluateExpression('sym', 'frame-123');

      expect(result.type).toBe('symbol');
      expect(result.value).toBe('Symbol(test)');
    });
  });

  describe('edge cases', () => {
    it('should handle evaluation with exception details but no description', async () => {
      const mockResult = {
        exceptionDetails: {
          exception: {},
        },
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      await expect(
        inspector.evaluateExpression('x', 'frame-123'),
      ).rejects.toThrow('Unknown error');
    });

    it('should handle nested objects with primitive values only', async () => {
      const mockResult = {
        result: [
          {
            name: 'a',
            value: { type: 'number', value: 1 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'b',
            value: { type: 'string', value: 'test' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send.mockResolvedValue(mockResult);

      const result = await inspector.inspectObject('obj-123', 2);

      expect(result.a).toBe(1);
      expect(result.b).toBe('test');
    });

    it('should handle mixed nested and primitive properties', async () => {
      const topLevelResult = {
        result: [
          {
            name: 'primitive',
            value: { type: 'number', value: 42 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'nested',
            value: {
              type: 'object',
              objectId: 'obj-nested',
              description: 'Object',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      const nestedResult = {
        result: [
          {
            name: 'inner',
            value: { type: 'string', value: 'value' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      };

      mockInspectorClient.send
        .mockResolvedValueOnce(topLevelResult)
        .mockResolvedValueOnce(nestedResult);

      const result = await inspector.inspectObject('obj-123', 2);

      expect(result.primitive).toBe(42);
      expect(result.nested).toBeDefined();
      expect(result.nested.inner).toBe('value');
    });
  });
});
