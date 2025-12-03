import { InspectorClient } from './inspector-client';
import { Breakpoint, BreakpointType } from './debug-session';

/**
 * Script information from CDP
 */
interface ScriptInfo {
  scriptId: string;
  url: string;
}

/**
 * Handles CDP breakpoint operations
 * Maps file paths to script IDs and manages breakpoint lifecycle via CDP
 */
export class CdpBreakpointOperations {
  private scripts = new Map<string, ScriptInfo>();

  constructor(private inspector: InspectorClient) {
    // Listen for script parsed events to build script ID mapping
    this.inspector.on('Debugger.scriptParsed', (params: any) => {
      if (params.url && params.scriptId) {
        this.scripts.set(params.url, {
          scriptId: params.scriptId,
          url: params.url,
        });
      }
    });
  }

  /**
   * Set a breakpoint via CDP
   * @param breakpoint Breakpoint to set
   * @returns CDP breakpoint ID if successful
   */
  async setBreakpoint(breakpoint: Breakpoint): Promise<string | undefined> {
    // Handle logpoints specially
    if (breakpoint.type === BreakpointType.LOGPOINT) {
      return this.setLogpoint(breakpoint);
    }

    // Handle function breakpoints specially
    if (breakpoint.type === BreakpointType.FUNCTION) {
      return this.setFunctionBreakpoint(breakpoint);
    }

    try {
      // Try to set breakpoint by URL (works for most cases)
      const result = await this.inspector.send('Debugger.setBreakpointByUrl', {
        lineNumber: breakpoint.line - 1, // CDP uses 0-indexed lines
        url: `file://${breakpoint.file}`,
        columnNumber: 0,
        condition: breakpoint.condition || undefined,
      });

      return result.breakpointId;
    } catch (error) {
      // If setting by URL fails, try to find the script ID
      const scriptInfo = this.findScriptByFile(breakpoint.file);
      if (scriptInfo) {
        try {
          const result = await this.inspector.send('Debugger.setBreakpoint', {
            location: {
              scriptId: scriptInfo.scriptId,
              lineNumber: breakpoint.line - 1,
              columnNumber: 0,
            },
            condition: breakpoint.condition || undefined,
          });

          return result.breakpointId;
        } catch (innerError) {
          console.error(
            `Failed to set breakpoint at ${breakpoint.file}:${breakpoint.line}`,
            innerError,
          );
          return undefined;
        }
      }

      console.error(
        `Failed to set breakpoint at ${breakpoint.file}:${breakpoint.line}`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Set a logpoint via CDP
   * Logpoints are implemented as conditional breakpoints that log and return false
   * @param breakpoint Logpoint to set
   * @returns CDP breakpoint ID if successful
   */
  private async setLogpoint(
    breakpoint: Breakpoint,
  ): Promise<string | undefined> {
    if (!breakpoint.logMessage) {
      console.error('Logpoint requires a log message');
      return undefined;
    }

    // Convert log message template to a CDP condition
    // The condition evaluates the log message and returns false to not pause
    const logCondition = this.createLogpointCondition(breakpoint.logMessage);

    try {
      const result = await this.inspector.send('Debugger.setBreakpointByUrl', {
        lineNumber: breakpoint.line - 1,
        url: `file://${breakpoint.file}`,
        columnNumber: 0,
        condition: logCondition,
      });

      return result.breakpointId;
    } catch (error) {
      console.error(
        `Failed to set logpoint at ${breakpoint.file}:${breakpoint.line}`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Create a CDP condition for a logpoint
   * The condition logs the message and returns false to not pause execution
   * @param logMessage Log message template with {variable} interpolation
   * @returns CDP condition string
   */
  private createLogpointCondition(logMessage: string): string {
    // Replace {variable} with variable evaluation
    // Example: "Value is {x}" becomes "console.log('Value is', x), false"

    // Extract variables from the message (anything in curly braces)
    const variables: string[] = [];
    const messageWithPlaceholders = logMessage.replace(
      /\{([^}]+)\}/g,
      (_, varName) => {
        variables.push(varName.trim());
        return '%s';
      },
    );

    // Build the console.log call
    if (variables.length === 0) {
      // No variables, just log the message
      return `console.log(${JSON.stringify(logMessage)}), false`;
    } else {
      // Build console.log with message and variables
      const varList = variables.join(', ');
      return `console.log(${JSON.stringify(messageWithPlaceholders)}, ${varList}), false`;
    }
  }

  /**
   * Set a function breakpoint via CDP
   * Function breakpoints pause when a function with the given name is called
   * @param breakpoint Function breakpoint to set
   * @returns CDP breakpoint ID if successful
   */
  private async setFunctionBreakpoint(
    breakpoint: Breakpoint,
  ): Promise<string | undefined> {
    if (!breakpoint.functionName) {
      console.error('Function breakpoint requires a function name');
      return undefined;
    }

    // Function breakpoints in CDP are implemented using instrumentation breakpoints
    // We need to find all functions matching the name and set breakpoints on them
    // For now, we'll return undefined as this requires more complex implementation
    // involving script parsing and function location detection
    console.warn(
      'Function breakpoints are not yet fully implemented in CDP operations',
    );
    return undefined;
  }

  /**
   * Remove a breakpoint via CDP
   * @param cdpBreakpointId CDP breakpoint ID
   * @returns True if successful
   */
  async removeBreakpoint(cdpBreakpointId: string): Promise<boolean> {
    try {
      await this.inspector.send('Debugger.removeBreakpoint', {
        breakpointId: cdpBreakpointId,
      });
      return true;
    } catch (error) {
      console.error(`Failed to remove breakpoint ${cdpBreakpointId}`, error);
      return false;
    }
  }

  /**
   * Find a script by file path
   * Handles both exact matches and partial matches (e.g., relative vs absolute paths)
   */
  private findScriptByFile(filePath: string): ScriptInfo | undefined {
    // Try exact match first
    const exactMatch = this.scripts.get(`file://${filePath}`);
    if (exactMatch) {
      return exactMatch;
    }

    // Try to find by filename (handles relative paths)
    const fileName = filePath.split('/').pop();
    if (fileName) {
      for (const [url, scriptInfo] of this.scripts.entries()) {
        if (url.endsWith(fileName) || url.includes(filePath)) {
          return scriptInfo;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all known scripts
   */
  getScripts(): ScriptInfo[] {
    return Array.from(this.scripts.values());
  }

  /**
   * Clear the script cache
   */
  clearScripts(): void {
    this.scripts.clear();
  }
}
