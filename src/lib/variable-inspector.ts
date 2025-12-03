import { InspectorClient } from './inspector-client';
import { SourceMapManager } from './source-map-manager';

/**
 * Result of evaluating an expression
 */
export interface EvaluationResult {
  value: any;
  type: string;
  objectId?: string;
  description?: string;
  originalName?: string; // Original TypeScript variable name if available
}

/**
 * Result of inspecting an object's properties
 */
export interface PropertyDescriptor {
  name: string;
  value: any;
  type: string;
  writable?: boolean;
  enumerable?: boolean;
  configurable?: boolean;
  originalName?: string; // Original TypeScript property name if available
}

/**
 * Options for object inspection
 */
export interface InspectionOptions {
  maxDepth?: number;
  ownProperties?: boolean;
  accessorPropertiesOnly?: boolean;
}

/**
 * Handles variable inspection and expression evaluation using CDP
 */
export class VariableInspector {
  private sourceMapManager: SourceMapManager | null = null;

  constructor(private inspector: InspectorClient) {}

  /**
   * Set the source map manager for variable name mapping
   * Requirements: 7.4
   */
  setSourceMapManager(sourceMapManager: SourceMapManager): void {
    this.sourceMapManager = sourceMapManager;
  }

  /**
   * Evaluate an expression in the current execution context
   * @param expression The JavaScript expression to evaluate
   * @param callFrameId Optional call frame ID (uses top frame if not provided)
   * @returns The evaluation result with type information
   */
  async evaluateExpression(
    expression: string,
    callFrameId?: string,
  ): Promise<EvaluationResult> {
    try {
      let result;

      if (callFrameId) {
        // Evaluate in specific call frame context
        result = await this.inspector.send('Debugger.evaluateOnCallFrame', {
          callFrameId,
          expression,
          returnByValue: false, // Get object reference for complex objects
          generatePreview: true,
        });
      } else {
        // Get current call frames to find the top frame
        const pausedData = await this.getCurrentPausedState();
        if (
          !pausedData ||
          !pausedData.callFrames ||
          pausedData.callFrames.length === 0
        ) {
          throw new Error('Process is not paused or no call frames available');
        }

        const topFrame = pausedData.callFrames[0];
        result = await this.inspector.send('Debugger.evaluateOnCallFrame', {
          callFrameId: topFrame.callFrameId,
          expression,
          returnByValue: false,
          generatePreview: true,
        });
      }

      if (result.exceptionDetails) {
        throw new Error(
          `Expression evaluation failed: ${result.exceptionDetails.exception?.description || 'Unknown error'}`,
        );
      }

      return this.serializeRemoteObject(result.result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to evaluate expression: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get properties of an object
   * @param objectId The CDP object ID
   * @param options Inspection options
   * @returns Array of property descriptors
   */
  async getObjectProperties(
    objectId: string,
    options: InspectionOptions = {},
  ): Promise<PropertyDescriptor[]> {
    const { ownProperties = true, accessorPropertiesOnly = false } = options;

    try {
      const result = await this.inspector.send('Runtime.getProperties', {
        objectId,
        ownProperties,
        accessorPropertiesOnly,
        generatePreview: true,
      });

      if (!result.result) {
        return [];
      }

      return result.result.map((prop: any) => ({
        name: prop.name,
        value: prop.value ? this.extractValue(prop.value) : undefined,
        type: prop.value?.type || 'undefined',
        writable: prop.writable,
        enumerable: prop.enumerable,
        configurable: prop.configurable,
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get object properties: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Inspect an object with nested property resolution
   * @param objectId The CDP object ID
   * @param maxDepth Maximum depth to traverse (default: 2)
   * @returns Nested object structure
   */
  async inspectObject(
    objectId: string,
    maxDepth: number = 2,
  ): Promise<Record<string, any>> {
    return this.inspectObjectRecursive(objectId, maxDepth, 0);
  }

  /**
   * Recursively inspect an object up to a maximum depth
   */
  private async inspectObjectRecursive(
    objectId: string,
    maxDepth: number,
    currentDepth: number,
  ): Promise<Record<string, any>> {
    if (currentDepth >= maxDepth) {
      return { _truncated: 'Max depth reached' };
    }

    const properties = await this.getObjectProperties(objectId);
    const result: Record<string, any> = {};

    for (const prop of properties) {
      if (
        prop.type === 'object' &&
        prop.value &&
        typeof prop.value === 'object' &&
        prop.value.objectId
      ) {
        // Recursively inspect nested objects
        result[prop.name] = await this.inspectObjectRecursive(
          prop.value.objectId,
          maxDepth,
          currentDepth + 1,
        );
      } else {
        result[prop.name] = prop.value;
      }
    }

    return result;
  }

  /**
   * Get the current paused state with call frames
   */
  private async getCurrentPausedState(): Promise<any> {
    // We need to track the last paused event
    // For now, we'll return null and require callFrameId to be passed
    // In a real implementation, we'd cache the last Debugger.paused event
    return null;
  }

  /**
   * Serialize a CDP RemoteObject to our EvaluationResult format
   */
  private serializeRemoteObject(remoteObject: any): EvaluationResult {
    const result: EvaluationResult = {
      value: this.extractValue(remoteObject),
      type: remoteObject.type,
      description: remoteObject.description,
    };

    if (remoteObject.objectId) {
      result.objectId = remoteObject.objectId;
    }

    return result;
  }

  /**
   * Extract the actual value from a CDP RemoteObject
   */
  private extractValue(remoteObject: any): any {
    if (remoteObject.type === 'undefined') {
      return undefined;
    }

    if (remoteObject.type === 'object' && remoteObject.subtype === 'null') {
      return null;
    }

    // Check if value is explicitly provided
    if ('value' in remoteObject) {
      return remoteObject.value;
    }

    // For objects without a value, return a description
    if (remoteObject.type === 'object' || remoteObject.type === 'function') {
      return {
        type: remoteObject.type,
        subtype: remoteObject.subtype,
        description: remoteObject.description,
        objectId: remoteObject.objectId,
      };
    }

    return remoteObject.description || `[${remoteObject.type}]`;
  }
}
