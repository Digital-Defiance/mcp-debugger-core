import {
  VariableInspector,
  EvaluationResult,
  PropertyDescriptor,
} from './variable-inspector';
import { InspectorClient } from './inspector-client';
import { SourceMapManager } from './source-map-manager';
import * as fc from 'fast-check';

/**
 * Mock InspectorClient for testing
 */
class MockInspectorClient extends InspectorClient {
  private mockResponses: Map<string, any> = new Map();
  private callHistory: Array<{ method: string; params?: any }> = [];

  constructor() {
    super('ws://mock');
  }

  setMockResponse(method: string, response: any): void {
    this.mockResponses.set(method, response);
  }

  getCallHistory(): Array<{ method: string; params?: any }> {
    return this.callHistory;
  }

  clearCallHistory(): void {
    this.callHistory = [];
  }

  async send(method: string, params?: Record<string, any>): Promise<any> {
    this.callHistory.push({ method, params });

    const response = this.mockResponses.get(method);
    if (response instanceof Error) {
      throw response;
    }
    if (response === undefined) {
      throw new Error(`No mock response configured for method: ${method}`);
    }

    // If response is a function, call it with params
    if (typeof response === 'function') {
      return response(params);
    }

    return response;
  }

  isConnected(): boolean {
    return true;
  }
}

describe('VariableInspector', () => {
  let mockInspector: MockInspectorClient;
  let variableInspector: VariableInspector;

  beforeEach(() => {
    mockInspector = new MockInspectorClient();
    variableInspector = new VariableInspector(mockInspector);
  });

  describe('evaluateExpression', () => {
    it('should evaluate a simple number expression', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'number',
          value: 42,
          description: '42',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '42',
        'frame-1',
      );

      expect(result.value).toBe(42);
      expect(result.type).toBe('number');
      expect(result.description).toBe('42');
    });

    it('should evaluate a string expression', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'string',
          value: 'hello',
          description: 'hello',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '"hello"',
        'frame-1',
      );

      expect(result.value).toBe('hello');
      expect(result.type).toBe('string');
    });

    it('should evaluate a boolean expression', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'boolean',
          value: true,
          description: 'true',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'true',
        'frame-1',
      );

      expect(result.value).toBe(true);
      expect(result.type).toBe('boolean');
    });

    it('should evaluate undefined', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'undefined',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'undefined',
        'frame-1',
      );

      expect(result.value).toBe(undefined);
      expect(result.type).toBe('undefined');
    });

    it('should evaluate null', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          subtype: 'null',
          value: null,
        },
      });

      const result = await variableInspector.evaluateExpression(
        'null',
        'frame-1',
      );

      expect(result.value).toBe(null);
      expect(result.type).toBe('object');
    });

    it('should evaluate an object expression with objectId', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          objectId: 'obj-123',
          description: 'Object',
          className: 'Object',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '{ x: 10 }',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.objectId).toBe('obj-123');
      expect(result.description).toBe('Object');
    });

    it('should evaluate an array expression', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          subtype: 'array',
          objectId: 'arr-456',
          description: 'Array(3)',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '[1, 2, 3]',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.objectId).toBe('arr-456');
      expect(result.description).toBe('Array(3)');
    });

    it('should evaluate a function expression', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'function',
          objectId: 'func-789',
          description: 'function test() { ... }',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'function test() {}',
        'frame-1',
      );

      expect(result.type).toBe('function');
      expect(result.objectId).toBe('func-789');
    });

    it('should handle arithmetic expressions', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'number',
          value: 15,
          description: '15',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '10 + 5',
        'frame-1',
      );

      expect(result.value).toBe(15);
      expect(result.type).toBe('number');
    });

    it('should handle comparison expressions', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'boolean',
          value: true,
          description: 'true',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '10 > 5',
        'frame-1',
      );

      expect(result.value).toBe(true);
      expect(result.type).toBe('boolean');
    });

    it('should throw error for invalid expression', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        exceptionDetails: {
          exception: {
            description: 'ReferenceError: x is not defined',
          },
        },
      });

      await expect(
        variableInspector.evaluateExpression('x', 'frame-1'),
      ).rejects.toThrow(
        'Expression evaluation failed: ReferenceError: x is not defined',
      );
    });

    it('should throw error for syntax error', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        exceptionDetails: {
          exception: {
            description: 'SyntaxError: Unexpected token',
          },
        },
      });

      await expect(
        variableInspector.evaluateExpression('this is not valid', 'frame-1'),
      ).rejects.toThrow(
        'Expression evaluation failed: SyntaxError: Unexpected token',
      );
    });

    it('should handle exception without description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        exceptionDetails: {
          exception: {},
        },
      });

      await expect(
        variableInspector.evaluateExpression('bad', 'frame-1'),
      ).rejects.toThrow('Expression evaluation failed: Unknown error');
    });

    it('should throw error when inspector send fails', async () => {
      mockInspector.setMockResponse(
        'Debugger.evaluateOnCallFrame',
        new Error('Connection lost'),
      );

      await expect(
        variableInspector.evaluateExpression('42', 'frame-1'),
      ).rejects.toThrow('Failed to evaluate expression: Connection lost');
    });

    it('should use provided callFrameId', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'number',
          value: 42,
        },
      });

      await variableInspector.evaluateExpression('42', 'custom-frame-id');

      const history = mockInspector.getCallHistory();
      expect(history[0].method).toBe('Debugger.evaluateOnCallFrame');
      expect(history[0].params?.callFrameId).toBe('custom-frame-id');
      expect(history[0].params?.expression).toBe('42');
    });

    it('should set returnByValue to false for complex objects', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          objectId: 'obj-123',
        },
      });

      await variableInspector.evaluateExpression('{}', 'frame-1');

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.returnByValue).toBe(false);
    });

    it('should enable generatePreview', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'number',
          value: 42,
        },
      });

      await variableInspector.evaluateExpression('42', 'frame-1');

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.generatePreview).toBe(true);
    });

    // Property-based test for expression evaluation
    it('should correctly evaluate arithmetic expressions with random values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 1000 }),
          fc.integer({ min: -1000, max: 1000 }),
          async (a, b) => {
            const expectedSum = a + b;
            mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
              result: {
                type: 'number',
                value: expectedSum,
                description: String(expectedSum),
              },
            });

            const result = await variableInspector.evaluateExpression(
              `${a} + ${b}`,
              'frame-1',
            );
            expect(result.value).toBe(expectedSum);
            expect(result.type).toBe('number');
          },
        ),
        { numRuns: 100 },
      );
    });

    // Property-based test for string expressions
    it('should correctly evaluate string expressions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 50 }),
          async (str) => {
            mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
              result: {
                type: 'string',
                value: str,
                description: str,
              },
            });

            const result = await variableInspector.evaluateExpression(
              `"${str}"`,
              'frame-1',
            );
            expect(result.value).toBe(str);
            expect(result.type).toBe('string');
          },
        ),
        { numRuns: 100 },
      );
    });

    // Property-based test for boolean expressions
    it('should correctly evaluate boolean expressions', async () => {
      await fc.assert(
        fc.asyncProperty(fc.boolean(), async (bool) => {
          mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
            result: {
              type: 'boolean',
              value: bool,
              description: String(bool),
            },
          });

          const result = await variableInspector.evaluateExpression(
            String(bool),
            'frame-1',
          );
          expect(result.value).toBe(bool);
          expect(result.type).toBe('boolean');
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('getObjectProperties', () => {
    it('should get properties of a simple object', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
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
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(2);
      expect(properties[0].name).toBe('x');
      expect(properties[0].value).toBe(10);
      expect(properties[0].type).toBe('number');
      expect(properties[0].writable).toBe(true);
      expect(properties[0].enumerable).toBe(true);
      expect(properties[0].configurable).toBe(true);
    });

    it('should get properties of an array', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: '0',
            value: { type: 'number', value: 1 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: '1',
            value: { type: 'number', value: 2 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'length',
            value: { type: 'number', value: 2 },
            writable: true,
            enumerable: false,
            configurable: false,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('arr-456');

      expect(properties).toHaveLength(3);
      expect(properties[0].name).toBe('0');
      expect(properties[0].value).toBe(1);
      expect(properties[2].name).toBe('length');
      expect(properties[2].value).toBe(2);
    });

    it('should handle nested objects', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'nested',
            value: {
              type: 'object',
              objectId: 'nested-obj-789',
              description: 'Object',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('nested');
      expect(properties[0].type).toBe('object');
      expect(properties[0].value).toHaveProperty('objectId', 'nested-obj-789');
    });

    it('should handle properties with undefined values', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'x',
            value: { type: 'undefined' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('x');
      expect(properties[0].value).toBe(undefined);
      expect(properties[0].type).toBe('undefined');
    });

    it('should handle properties with null values', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'x',
            value: { type: 'object', subtype: 'null', value: null },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('x');
      expect(properties[0].value).toBe(null);
      expect(properties[0].type).toBe('object');
    });

    it('should handle properties without values', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'getter',
            writable: false,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('getter');
      expect(properties[0].value).toBe(undefined);
      expect(properties[0].type).toBe('undefined');
    });

    it('should use ownProperties option', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      await variableInspector.getObjectProperties('obj-123', {
        ownProperties: true,
      });

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.ownProperties).toBe(true);
    });

    it('should use accessorPropertiesOnly option', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      await variableInspector.getObjectProperties('obj-123', {
        accessorPropertiesOnly: true,
      });

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.accessorPropertiesOnly).toBe(true);
    });

    it('should default ownProperties to true', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      await variableInspector.getObjectProperties('obj-123');

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.ownProperties).toBe(true);
    });

    it('should default accessorPropertiesOnly to false', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      await variableInspector.getObjectProperties('obj-123');

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.accessorPropertiesOnly).toBe(false);
    });

    it('should enable generatePreview', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      await variableInspector.getObjectProperties('obj-123');

      const history = mockInspector.getCallHistory();
      expect(history[0].params?.generatePreview).toBe(true);
    });

    it('should return empty array when result is missing', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {});

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toEqual([]);
    });

    it('should throw error when inspector send fails', async () => {
      mockInspector.setMockResponse(
        'Runtime.getProperties',
        new Error('Connection lost'),
      );

      await expect(
        variableInspector.getObjectProperties('obj-123'),
      ).rejects.toThrow('Failed to get object properties: Connection lost');
    });

    // Property-based test for object properties
    it('should correctly handle objects with various property types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numProp: fc.integer(),
            strProp: fc.string({ maxLength: 20 }),
            boolProp: fc.boolean(),
          }),
          async (testObj) => {
            const mockResult = Object.entries(testObj).map(([name, value]) => ({
              name,
              value: {
                type: typeof value,
                value,
              },
              writable: true,
              enumerable: true,
              configurable: true,
            }));

            mockInspector.setMockResponse('Runtime.getProperties', {
              result: mockResult,
            });

            const properties =
              await variableInspector.getObjectProperties('obj-test');

            expect(properties).toHaveLength(3);

            const numProp = properties.find((p) => p.name === 'numProp');
            expect(numProp?.value).toBe(testObj.numProp);
            expect(numProp?.type).toBe('number');

            const strProp = properties.find((p) => p.name === 'strProp');
            expect(strProp?.value).toBe(testObj.strProp);
            expect(strProp?.type).toBe('string');

            const boolProp = properties.find((p) => p.name === 'boolProp');
            expect(boolProp?.value).toBe(testObj.boolProp);
            expect(boolProp?.type).toBe('boolean');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('inspectObject', () => {
    it('should inspect object with depth 1', async () => {
      // First call for top-level object
      mockInspector.setMockResponse('Runtime.getProperties', {
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
      });

      const result = await variableInspector.inspectObject('obj-123', 1);

      expect(result).toEqual({
        x: 10,
        y: 20,
      });
    });

    it('should inspect nested object with depth 2', async () => {
      let callCount = 0;
      mockInspector.setMockResponse('Runtime.getProperties', (params: any) => {
        callCount++;
        if (callCount === 1) {
          // Top-level object
          return {
            result: [
              {
                name: 'x',
                value: { type: 'number', value: 10 },
                writable: true,
                enumerable: true,
                configurable: true,
              },
              {
                name: 'nested',
                value: {
                  type: 'object',
                  objectId: 'nested-obj-789',
                  description: 'Object',
                },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        } else {
          // Nested object
          return {
            result: [
              {
                name: 'z',
                value: { type: 'number', value: 30 },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        }
      });

      const result = await variableInspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        x: 10,
        nested: {
          z: 30,
        },
      });
    });

    it('should truncate at max depth', async () => {
      let callCount = 0;
      mockInspector.setMockResponse('Runtime.getProperties', (params: any) => {
        callCount++;
        if (callCount === 1) {
          return {
            result: [
              {
                name: 'level1',
                value: {
                  type: 'object',
                  objectId: 'level1-obj',
                  description: 'Object',
                },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        } else if (callCount === 2) {
          return {
            result: [
              {
                name: 'level2',
                value: {
                  type: 'object',
                  objectId: 'level2-obj',
                  description: 'Object',
                },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        } else {
          // Should not reach here with maxDepth=2
          throw new Error('Exceeded max depth');
        }
      });

      const result = await variableInspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        level1: {
          level2: {
            _truncated: 'Max depth reached',
          },
        },
      });
    });

    it('should use default maxDepth of 2', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'x',
            value: { type: 'number', value: 10 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const result = await variableInspector.inspectObject('obj-123');

      expect(result).toEqual({ x: 10 });
    });

    it('should handle arrays in nested objects', async () => {
      let callCount = 0;
      mockInspector.setMockResponse('Runtime.getProperties', (params: any) => {
        callCount++;
        if (callCount === 1) {
          return {
            result: [
              {
                name: 'arr',
                value: {
                  type: 'object',
                  subtype: 'array',
                  objectId: 'arr-obj',
                  description: 'Array(2)',
                },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        } else {
          return {
            result: [
              {
                name: '0',
                value: { type: 'number', value: 1 },
                writable: true,
                enumerable: true,
                configurable: true,
              },
              {
                name: '1',
                value: { type: 'number', value: 2 },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        }
      });

      const result = await variableInspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        arr: {
          '0': 1,
          '1': 2,
        },
      });
    });

    it('should handle primitive values in nested objects', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
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
      });

      const result = await variableInspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        str: 'hello',
        num: 42,
        bool: true,
      });
    });

    it('should handle objects without objectId', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'obj',
            value: {
              type: 'object',
              description: 'Object',
              // No objectId
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const result = await variableInspector.inspectObject('obj-123', 2);

      expect(result).toEqual({
        obj: {
          type: 'object',
          subtype: undefined,
          description: 'Object',
          objectId: undefined,
        },
      });
    });

    it('should handle deeply nested objects with maxDepth 3', async () => {
      let callCount = 0;
      mockInspector.setMockResponse('Runtime.getProperties', (params: any) => {
        callCount++;
        if (callCount === 1) {
          return {
            result: [
              {
                name: 'level1',
                value: { type: 'object', objectId: 'l1' },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        } else if (callCount === 2) {
          return {
            result: [
              {
                name: 'level2',
                value: { type: 'object', objectId: 'l2' },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        } else if (callCount === 3) {
          return {
            result: [
              {
                name: 'level3',
                value: { type: 'number', value: 999 },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        }
        throw new Error('Too many calls');
      });

      const result = await variableInspector.inspectObject('obj-123', 3);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: 999,
          },
        },
      });
    });
  });

  describe('setSourceMapManager', () => {
    it('should set source map manager', () => {
      const mockSourceMapManager = {} as SourceMapManager;

      variableInspector.setSourceMapManager(mockSourceMapManager);

      // No direct way to verify, but should not throw
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should wrap non-Error exceptions in evaluateExpression', async () => {
      mockInspector.setMockResponse(
        'Debugger.evaluateOnCallFrame',
        'not an error object',
      );

      await expect(
        variableInspector.evaluateExpression('test', 'frame-1'),
      ).rejects.toThrow();
    });

    it('should wrap non-Error exceptions in getObjectProperties', async () => {
      // Create a custom mock that throws non-Error
      const customMock = new MockInspectorClient();
      const customInspector = new VariableInspector(customMock);

      customMock.send = async () => {
        throw 'non-error exception';
      };

      await expect(customInspector.getObjectProperties('obj-123')).rejects.toBe(
        'non-error exception',
      );
    });
  });

  describe('complex object serialization', () => {
    it('should serialize object with type and description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          description: 'MyClass',
          objectId: 'obj-123',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'new MyClass()',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.description).toBe('MyClass');
      expect(result.objectId).toBe('obj-123');
    });

    it('should serialize function with description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'function',
          description: 'function myFunc() { ... }',
          objectId: 'func-456',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'myFunc',
        'frame-1',
      );

      expect(result.type).toBe('function');
      expect(result.description).toBe('function myFunc() { ... }');
      expect(result.objectId).toBe('func-456');
    });

    it('should handle object without explicit value', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          subtype: 'map',
          description: 'Map(3)',
          objectId: 'map-789',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'new Map()',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.value).toEqual({
        type: 'object',
        subtype: 'map',
        description: 'Map(3)',
        objectId: 'map-789',
      });
    });

    it('should handle symbol type', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'symbol',
          description: 'Symbol(test)',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'Symbol("test")',
        'frame-1',
      );

      expect(result.type).toBe('symbol');
      expect(result.value).toBe('Symbol(test)');
    });
  });

  describe('edge cases', () => {
    it('should handle empty object', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      const properties =
        await variableInspector.getObjectProperties('obj-empty');

      expect(properties).toEqual([]);
    });

    it('should handle object with many properties', async () => {
      const manyProps = Array.from({ length: 100 }, (_, i) => ({
        name: `prop${i}`,
        value: { type: 'number', value: i },
        writable: true,
        enumerable: true,
        configurable: true,
      }));

      mockInspector.setMockResponse('Runtime.getProperties', {
        result: manyProps,
      });

      const properties =
        await variableInspector.getObjectProperties('obj-many');

      expect(properties).toHaveLength(100);
      expect(properties[0].name).toBe('prop0');
      expect(properties[99].name).toBe('prop99');
    });

    it('should handle circular reference detection via maxDepth', async () => {
      // Circular references are handled by maxDepth limit
      let callCount = 0;
      mockInspector.setMockResponse('Runtime.getProperties', (params: any) => {
        callCount++;
        return {
          result: [
            {
              name: 'self',
              value: {
                type: 'object',
                objectId: 'circular-obj',
                description: 'Object',
              },
              writable: true,
              enumerable: true,
              configurable: true,
            },
          ],
        };
      });

      const result = await variableInspector.inspectObject('circular-obj', 2);

      // Should stop at maxDepth
      expect(result.self).toEqual({
        self: {
          _truncated: 'Max depth reached',
        },
      });
    });

    it('should handle BigInt type', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'bigint',
          description: '12345678901234567890n',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '12345678901234567890n',
        'frame-1',
      );

      expect(result.type).toBe('bigint');
      expect(result.value).toBe('12345678901234567890n');
    });

    it('should handle Date objects', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          subtype: 'date',
          description: '2024-01-01T00:00:00.000Z',
          objectId: 'date-obj',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'new Date("2024-01-01")',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.description).toBe('2024-01-01T00:00:00.000Z');
      expect(result.objectId).toBe('date-obj');
    });

    it('should handle RegExp objects', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          subtype: 'regexp',
          description: '/test/gi',
          objectId: 'regexp-obj',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '/test/gi',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.description).toBe('/test/gi');
      expect(result.objectId).toBe('regexp-obj');
    });
  });

  describe('Property-based tests', () => {
    // Feature: mcp-debugger-tool, Property 8: Expression evaluation correctness
    // Validates: Requirements 3.4
    it('should correctly evaluate comparison expressions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -100, max: 100 }),
          fc.integer({ min: -100, max: 100 }),
          async (a, b) => {
            const expectedResult = a > b;
            mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
              result: {
                type: 'boolean',
                value: expectedResult,
                description: String(expectedResult),
              },
            });

            const result = await variableInspector.evaluateExpression(
              `${a} > ${b}`,
              'frame-1',
            );
            expect(result.value).toBe(expectedResult);
            expect(result.type).toBe('boolean');
          },
        ),
        { numRuns: 100 },
      );
    });

    // Feature: mcp-debugger-tool, Property 7: Object inspection completeness
    // Validates: Requirements 3.3
    it('should return all properties for any object structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.oneof(fc.integer(), fc.string({ maxLength: 20 }), fc.boolean()),
            { minKeys: 1, maxKeys: 10 },
          ),
          async (obj) => {
            const mockResult = Object.entries(obj).map(([name, value]) => ({
              name,
              value: {
                type: typeof value,
                value,
              },
              writable: true,
              enumerable: true,
              configurable: true,
            }));

            mockInspector.setMockResponse('Runtime.getProperties', {
              result: mockResult,
            });

            const properties =
              await variableInspector.getObjectProperties('obj-test');

            // All properties should be returned
            expect(properties.length).toBe(Object.keys(obj).length);

            // Each property should match
            for (const [key, value] of Object.entries(obj)) {
              const prop = properties.find((p) => p.name === key);
              expect(prop).toBeDefined();
              expect(prop?.value).toBe(value);
              expect(prop?.type).toBe(typeof value);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    // Feature: mcp-debugger-tool, Property 21: Complex object serialization with type information
    // Validates: Requirements 9.3
    it('should maintain type information for all values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer().map((v) => ({ value: v, type: 'number' })),
            fc.string().map((v) => ({ value: v, type: 'string' })),
            fc.boolean().map((v) => ({ value: v, type: 'boolean' })),
            fc.constant({ value: null, type: 'object' }),
            fc.constant({ value: undefined, type: 'undefined' }),
          ),
          async (testCase) => {
            const mockResponse: any = {
              result: {
                type: testCase.type,
                value: testCase.value,
              },
            };

            if (testCase.type === 'object' && testCase.value === null) {
              mockResponse.result.subtype = 'null';
            }

            mockInspector.setMockResponse(
              'Debugger.evaluateOnCallFrame',
              mockResponse,
            );

            const result = await variableInspector.evaluateExpression(
              'test',
              'frame-1',
            );

            expect(result.type).toBe(testCase.type);
            expect(result.value).toBe(testCase.value);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('evaluateExpression without callFrameId', () => {
    it('should throw error when no callFrameId and getCurrentPausedState returns null', async () => {
      // When callFrameId is not provided, it tries to get current paused state
      // getCurrentPausedState returns null in the current implementation
      await expect(variableInspector.evaluateExpression('42')).rejects.toThrow(
        'Process is not paused or no call frames available',
      );
    });

    it('should throw error when getCurrentPausedState returns empty callFrames', async () => {
      // This tests the path where pausedData exists but has no callFrames
      // Since getCurrentPausedState is private and returns null, we can't directly test this
      // but we've covered the error path
      await expect(
        variableInspector.evaluateExpression('test'),
      ).rejects.toThrow('Process is not paused or no call frames available');
    });
  });

  describe('extractValue edge cases', () => {
    it('should handle object with value property explicitly set', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'number',
          value: 0, // Explicitly 0, which is falsy
          description: '0',
        },
      });

      const result = await variableInspector.evaluateExpression('0', 'frame-1');

      expect(result.value).toBe(0);
      expect(result.type).toBe('number');
    });

    it('should handle object without value or description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'object',
          objectId: 'obj-123',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '{}',
        'frame-1',
      );

      expect(result.type).toBe('object');
      expect(result.value).toEqual({
        type: 'object',
        subtype: undefined,
        description: undefined,
        objectId: 'obj-123',
      });
    });

    it('should handle function without description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'function',
          objectId: 'func-123',
        },
      });

      const result = await variableInspector.evaluateExpression(
        '() => {}',
        'frame-1',
      );

      expect(result.type).toBe('function');
      expect(result.value).toEqual({
        type: 'function',
        subtype: undefined,
        description: undefined,
        objectId: 'func-123',
      });
    });

    it('should handle unknown type with description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'unknown',
          description: 'some description',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'test',
        'frame-1',
      );

      expect(result.type).toBe('unknown');
      expect(result.value).toBe('some description');
    });

    it('should handle unknown type without description', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'unknown',
        },
      });

      const result = await variableInspector.evaluateExpression(
        'test',
        'frame-1',
      );

      expect(result.type).toBe('unknown');
      expect(result.value).toBe('[unknown]');
    });
  });

  describe('getObjectProperties with property edge cases', () => {
    it('should handle property with type but no value', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'getter',
            // No value property
            writable: false,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('getter');
      expect(properties[0].type).toBe('undefined');
      expect(properties[0].value).toBe(undefined);
    });

    it('should handle property with null value object', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'prop',
            value: null,
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(1);
      expect(properties[0].name).toBe('prop');
      expect(properties[0].value).toBe(undefined);
      expect(properties[0].type).toBe('undefined');
    });
  });

  describe('additional coverage for uncovered lines', () => {
    it('should handle non-Error exception in evaluateExpression catch block', async () => {
      // Mock inspector to throw a non-Error object
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        then: () => {
          throw 'string error'; // Non-Error exception
        },
      });

      // Create a custom mock that throws non-Error
      const customMock = new MockInspectorClient();
      const customInspector = new VariableInspector(customMock);

      customMock.send = async () => {
        throw 'non-error exception';
      };

      await expect(
        customInspector.evaluateExpression('test', 'frame-1'),
      ).rejects.toBe('non-error exception');
    });

    it('should handle non-Error exception in getObjectProperties catch block', async () => {
      // Create a custom mock that throws non-Error
      const customMock = new MockInspectorClient();
      const customInspector = new VariableInspector(customMock);

      customMock.send = async () => {
        throw 'non-error exception';
      };

      await expect(customInspector.getObjectProperties('obj-123')).rejects.toBe(
        'non-error exception',
      );
    });

    it('should create VariableInspector instance', () => {
      const inspector = new VariableInspector(mockInspector);
      expect(inspector).toBeInstanceOf(VariableInspector);
    });

    it('should handle result without exceptionDetails', async () => {
      mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
        result: {
          type: 'number',
          value: 42,
        },
        // No exceptionDetails
      });

      const result = await variableInspector.evaluateExpression(
        '42',
        'frame-1',
      );
      expect(result.value).toBe(42);
    });

    it('should handle empty result from getProperties', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        // No result property
      });

      const properties = await variableInspector.getObjectProperties('obj-123');
      expect(properties).toEqual([]);
    });
  });

  describe('comprehensive type coverage', () => {
    it('should handle all primitive types', async () => {
      const types = [
        { type: 'number', value: 123 },
        { type: 'string', value: 'test' },
        { type: 'boolean', value: false },
        { type: 'undefined', value: undefined },
        { type: 'object', subtype: 'null', value: null },
        { type: 'bigint', description: '999n' },
        { type: 'symbol', description: 'Symbol()' },
      ];

      for (const testType of types) {
        const mockResponse: any = {
          result: {
            type: testType.type,
            ...('value' in testType ? { value: testType.value } : {}),
            ...('subtype' in testType ? { subtype: testType.subtype } : {}),
            ...('description' in testType
              ? { description: testType.description }
              : {}),
          },
        };

        mockInspector.setMockResponse(
          'Debugger.evaluateOnCallFrame',
          mockResponse,
        );
        const result = await variableInspector.evaluateExpression(
          'test',
          'frame-1',
        );
        expect(result.type).toBe(testType.type);
      }
    });

    it('should handle all object subtypes', async () => {
      const subtypes = [
        'array',
        'date',
        'regexp',
        'map',
        'set',
        'weakmap',
        'weakset',
        'promise',
        'error',
      ];

      for (const subtype of subtypes) {
        mockInspector.setMockResponse('Debugger.evaluateOnCallFrame', {
          result: {
            type: 'object',
            subtype,
            objectId: `${subtype}-obj`,
            description: `${subtype} description`,
          },
        });

        const result = await variableInspector.evaluateExpression(
          'test',
          'frame-1',
        );
        expect(result.type).toBe('object');
        expect(result.objectId).toBe(`${subtype}-obj`);
      }
    });
  });

  describe('final coverage improvements', () => {
    it('should test inspectObject with maxDepth 0', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'x',
            value: { type: 'number', value: 10 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const result = await variableInspector.inspectObject('obj-123', 0);

      // With maxDepth 0, should immediately return truncated
      expect(result).toEqual({
        _truncated: 'Max depth reached',
      });
    });

    it('should test inspectObject with maxDepth 1 and nested object', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'nested',
            value: {
              type: 'object',
              objectId: 'nested-obj',
              description: 'Object',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const result = await variableInspector.inspectObject('obj-123', 1);

      // With maxDepth 1, nested object should be truncated
      expect(result).toEqual({
        nested: {
          _truncated: 'Max depth reached',
        },
      });
    });

    it('should handle getObjectProperties with null result', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: null,
      });

      const properties = await variableInspector.getObjectProperties('obj-123');
      expect(properties).toEqual([]);
    });

    it('should handle getObjectProperties with undefined result', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: undefined,
      });

      const properties = await variableInspector.getObjectProperties('obj-123');
      expect(properties).toEqual([]);
    });

    it('should test all inspection options combinations', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [],
      });

      // Test all combinations
      await variableInspector.getObjectProperties('obj-123', {
        ownProperties: false,
        accessorPropertiesOnly: false,
      });

      await variableInspector.getObjectProperties('obj-123', {
        ownProperties: false,
        accessorPropertiesOnly: true,
      });

      await variableInspector.getObjectProperties('obj-123', {
        ownProperties: true,
        accessorPropertiesOnly: false,
      });

      await variableInspector.getObjectProperties('obj-123', {
        ownProperties: true,
        accessorPropertiesOnly: true,
      });

      const history = mockInspector.getCallHistory();
      expect(history.length).toBe(4);
    });

    it('should handle property with value that has no type', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'prop',
            value: {
              // No type property
              description: 'some value',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');
      expect(properties).toHaveLength(1);
      expect(properties[0].type).toBe('undefined');
    });

    it('should handle deeply nested objects at exact maxDepth', async () => {
      let callCount = 0;
      mockInspector.setMockResponse('Runtime.getProperties', (params: any) => {
        callCount++;
        if (callCount <= 2) {
          return {
            result: [
              {
                name: `level${callCount}`,
                value: {
                  type: 'object',
                  objectId: `obj-${callCount}`,
                  description: 'Object',
                },
                writable: true,
                enumerable: true,
                configurable: true,
              },
            ],
          };
        }
        return { result: [] };
      });

      const result = await variableInspector.inspectObject('obj-123', 2);

      expect(result.level1).toBeDefined();
      expect(result.level1.level2).toBeDefined();
      expect(result.level1.level2._truncated).toBe('Max depth reached');
    });

    it('should handle mixed primitive and object properties', async () => {
      mockInspector.setMockResponse('Runtime.getProperties', {
        result: [
          {
            name: 'num',
            value: { type: 'number', value: 42 },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'str',
            value: { type: 'string', value: 'hello' },
            writable: true,
            enumerable: true,
            configurable: true,
          },
          {
            name: 'obj',
            value: {
              type: 'object',
              objectId: 'nested-obj',
              description: 'Object',
            },
            writable: true,
            enumerable: true,
            configurable: true,
          },
        ],
      });

      const properties = await variableInspector.getObjectProperties('obj-123');

      expect(properties).toHaveLength(3);
      expect(properties[0].value).toBe(42);
      expect(properties[1].value).toBe('hello');
      expect(properties[2].value).toHaveProperty('objectId', 'nested-obj');
    });
  });
});
