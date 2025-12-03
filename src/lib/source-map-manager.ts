import * as fs from "fs";
import * as path from "path";
import { SourceMapConsumer } from "source-map";
import type { RawSourceMap } from "source-map";

/**
 * Source location in original source code (TypeScript)
 */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * Source location in compiled code (JavaScript)
 */
export interface CompiledLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * Manages source maps for a debug session
 * Handles loading, parsing, and caching of source maps
 * Requirements: 7.1
 */
export class SourceMapManager {
  private sourceMapCache = new Map<string, SourceMapConsumer>();
  private sourceMapPromises = new Map<
    string,
    Promise<SourceMapConsumer | null>
  >();

  /**
   * Load and parse a source map for a JavaScript file
   * Detects .map files alongside JavaScript files
   * Caches loaded source maps per session
   * @param jsFile Path to the JavaScript file
   * @returns SourceMapConsumer or null if no source map found
   */
  async loadSourceMap(jsFile: string): Promise<SourceMapConsumer | null> {
    // Check cache first
    if (this.sourceMapCache.has(jsFile)) {
      return this.sourceMapCache.get(jsFile)!;
    }

    // Check if we're already loading this source map
    if (this.sourceMapPromises.has(jsFile)) {
      return this.sourceMapPromises.get(jsFile)!;
    }

    // Start loading the source map
    const loadPromise = this.loadSourceMapInternal(jsFile);
    this.sourceMapPromises.set(jsFile, loadPromise);

    try {
      const consumer = await loadPromise;
      if (consumer) {
        this.sourceMapCache.set(jsFile, consumer);
      }
      return consumer;
    } finally {
      this.sourceMapPromises.delete(jsFile);
    }
  }

  /**
   * Internal method to load and parse a source map
   */
  private async loadSourceMapInternal(
    jsFile: string
  ): Promise<SourceMapConsumer | null> {
    try {
      // Try to find the .map file
      const mapFile = `${jsFile}.map`;

      if (!fs.existsSync(mapFile)) {
        // No source map file found
        return null;
      }

      // Read and parse the source map
      const mapContent = fs.readFileSync(mapFile, "utf8");
      const rawSourceMap: RawSourceMap = JSON.parse(mapContent);

      // Create a SourceMapConsumer
      const consumer = await new SourceMapConsumer(rawSourceMap);

      return consumer;
    } catch (error) {
      // Failed to load or parse source map
      // This is not a critical error - we can still debug without source maps
      return null;
    }
  }

  /**
   * Check if a source map exists for a JavaScript file
   * @param jsFile Path to the JavaScript file
   * @returns True if a source map exists
   */
  hasSourceMap(jsFile: string): boolean {
    if (this.sourceMapCache.has(jsFile)) {
      return true;
    }

    const mapFile = `${jsFile}.map`;
    return fs.existsSync(mapFile);
  }

  /**
   * Get a cached source map consumer
   * @param jsFile Path to the JavaScript file
   * @returns SourceMapConsumer or undefined if not cached
   */
  getCachedSourceMap(jsFile: string): SourceMapConsumer | undefined {
    return this.sourceMapCache.get(jsFile);
  }

  /**
   * Clear all cached source maps
   * Should be called when the session ends
   */
  clearCache(): void {
    // Destroy all consumers to free memory
    for (const consumer of this.sourceMapCache.values()) {
      consumer.destroy();
    }
    this.sourceMapCache.clear();
    this.sourceMapPromises.clear();
  }

  /**
   * Get the number of cached source maps
   */
  getCacheSize(): number {
    return this.sourceMapCache.size;
  }

  /**
   * Map a TypeScript source location to JavaScript compiled location
   * Used when setting breakpoints in TypeScript files
   * Requirements: 7.2
   * @param sourceLocation Original TypeScript location
   * @returns Compiled JavaScript location or null if mapping fails
   */
  async mapSourceToCompiled(
    sourceLocation: SourceLocation
  ): Promise<CompiledLocation | null> {
    try {
      // We need to find the JavaScript file that corresponds to this TypeScript file
      // Try common patterns: .ts -> .js, .tsx -> .jsx
      const jsFile = this.findCompiledFile(sourceLocation.file);
      if (!jsFile) {
        return null;
      }

      // Load the source map for the JavaScript file
      const consumer = await this.loadSourceMap(jsFile);
      if (!consumer) {
        // No source map available - return null to indicate we can't map
        return null;
      }

      // Source maps use 1-based line numbers and 0-based column numbers
      // We need to find all generated positions for this source location
      const generatedPositions: Array<{ line: number; column: number }> = [];

      consumer.eachMapping((mapping: any) => {
        // Check if this mapping corresponds to our source location
        if (
          mapping.source &&
          mapping.source.endsWith(path.basename(sourceLocation.file)) &&
          mapping.originalLine === sourceLocation.line
        ) {
          generatedPositions.push({
            line: mapping.generatedLine,
            column: mapping.generatedColumn,
          });
        }
      });

      if (generatedPositions.length === 0) {
        // No mapping found for this location
        return null;
      }

      // Use the first generated position (usually the most relevant)
      const generated = generatedPositions[0];

      return {
        file: jsFile,
        line: generated.line,
        column: generated.column,
      };
    } catch (error) {
      // Handle missing or invalid source maps gracefully
      return null;
    }
  }

  /**
   * Map a JavaScript compiled location back to TypeScript source location
   * Used when the debugger pauses to show the original source location
   * Requirements: 7.3
   * @param compiledLocation Compiled JavaScript location
   * @returns Original TypeScript location or null if mapping fails
   */
  async mapCompiledToSource(
    compiledLocation: CompiledLocation
  ): Promise<SourceLocation | null> {
    try {
      // Load the source map for the JavaScript file
      const consumer = await this.loadSourceMap(compiledLocation.file);
      if (!consumer) {
        // No source map available - return null to indicate we can't map
        return null;
      }

      // Map the compiled location to the original source location
      const original = consumer.originalPositionFor({
        line: compiledLocation.line,
        column: compiledLocation.column,
      });

      if (!original.source || original.line === null) {
        // No mapping found
        return null;
      }

      // Resolve the source file path
      // The source path in the source map is usually relative
      const sourceFile = this.resolveSourcePath(
        compiledLocation.file,
        original.source
      );

      return {
        file: sourceFile,
        line: original.line,
        column: original.column || 0,
      };
    } catch (error) {
      // Handle missing or invalid source maps gracefully
      return null;
    }
  }

  /**
   * Find the compiled JavaScript file for a TypeScript source file
   * @param sourceFile Path to the TypeScript file
   * @returns Path to the JavaScript file or null if not found
   */
  private findCompiledFile(sourceFile: string): string | null {
    // Try common patterns
    const patterns = [
      sourceFile.replace(/\.ts$/, ".js"),
      sourceFile.replace(/\.tsx$/, ".jsx"),
      sourceFile.replace(/\.ts$/, ".js").replace("/src/", "/dist/"),
      sourceFile.replace(/\.tsx$/, ".jsx").replace("/src/", "/dist/"),
    ];

    for (const pattern of patterns) {
      if (fs.existsSync(pattern)) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Resolve the source file path from the source map
   * @param jsFile Path to the JavaScript file
   * @param sourcePath Source path from the source map (usually relative)
   * @returns Absolute path to the source file
   */
  private resolveSourcePath(jsFile: string, sourcePath: string): string {
    // If the source path is already absolute, return it
    if (path.isAbsolute(sourcePath)) {
      return sourcePath;
    }

    // Otherwise, resolve it relative to the JavaScript file's directory
    const jsDir = path.dirname(jsFile);
    return path.resolve(jsDir, sourcePath);
  }

  /**
   * Map a JavaScript variable name to its TypeScript source name
   * Uses the source map's names section for variable mapping
   * Requirements: 7.4
   * @param jsFile Path to the JavaScript file
   * @param jsVariableName Variable name in the compiled JavaScript
   * @param line Line number where the variable is used
   * @param column Column number where the variable is used
   * @returns Original TypeScript variable name or null if mapping unavailable
   */
  async mapVariableName(
    jsFile: string,
    jsVariableName: string,
    line: number,
    column: number
  ): Promise<string | null> {
    try {
      // Load the source map
      const consumer = await this.loadSourceMap(jsFile);
      if (!consumer) {
        // No source map available - return null
        return null;
      }

      // Get the original position for this location
      const original = consumer.originalPositionFor({
        line,
        column,
      });

      // Check if we have a name mapping
      if (original.name) {
        return original.name;
      }

      // No name mapping available - return null to indicate we should use the JS name
      return null;
    } catch (error) {
      // Handle errors gracefully
      return null;
    }
  }

  /**
   * Get all variable names at a specific location
   * This can be used to map all variables in a scope
   * @param jsFile Path to the JavaScript file
   * @param line Line number
   * @param column Column number
   * @returns Array of variable names from the source map
   */
  async getVariableNamesAtLocation(
    jsFile: string,
    line: number,
    column: number
  ): Promise<string[]> {
    try {
      const consumer = await this.loadSourceMap(jsFile);
      if (!consumer) {
        return [];
      }

      const names: string[] = [];

      // Look for all mappings near this location
      consumer.eachMapping((mapping: any) => {
        if (
          mapping.generatedLine === line &&
          Math.abs(mapping.generatedColumn - column) < 10 && // Within 10 columns
          mapping.name
        ) {
          names.push(mapping.name);
        }
      });

      return names;
    } catch (error) {
      return [];
    }
  }
}
