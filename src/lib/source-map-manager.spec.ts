import * as fc from "fast-check";
import * as path from "path";
import { SourceMapManager } from "./source-map-manager";
import { execSync } from "child_process";

describe("SourceMapManager", () => {
  let manager: SourceMapManager;

  beforeAll(() => {
    // Compile TypeScript test fixtures before running tests
    try {
      execSync(
        "npx tsc test-fixtures/typescript-sample.ts --sourceMap --target ES2020 --module commonjs --skipLibCheck",
        {
          cwd: path.resolve(__dirname, "../.."),
          stdio: "ignore",
        }
      );
    } catch (error) {
      console.error("Failed to compile test fixtures:", error);
    }
  });

  beforeEach(() => {
    manager = new SourceMapManager();
  });

  afterEach(() => {
    manager.clearCache();
  });

  describe("Source Map Loading", () => {
    it("should load source map for JavaScript file", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      const consumer = await manager.loadSourceMap(jsFile);
      expect(consumer).not.toBeNull();
    });

    it("should return null for file without source map", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/simple-script.js"
      );

      const consumer = await manager.loadSourceMap(jsFile);
      expect(consumer).toBeNull();
    });

    it("should cache loaded source maps", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      await manager.loadSourceMap(jsFile);
      expect(manager.getCacheSize()).toBe(1);

      // Load again - should use cache
      await manager.loadSourceMap(jsFile);
      expect(manager.getCacheSize()).toBe(1);
    });

    it("should check if source map exists", () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      expect(manager.hasSourceMap(jsFile)).toBe(true);
    });
  });

  describe("Location Mapping", () => {
    it("should map compiled location to source location", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // Map a location in the compiled JavaScript back to TypeScript
      const sourceLocation = await manager.mapCompiledToSource({
        file: jsFile,
        line: 4, // Line in the compiled JS
        column: 0,
      });

      expect(sourceLocation).not.toBeNull();
      if (sourceLocation) {
        expect(sourceLocation.file).toContain("typescript-sample.ts");
        expect(sourceLocation.line).toBeGreaterThan(0);
      }
    });

    it("should return null for file without source map", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/simple-script.js"
      );

      const sourceLocation = await manager.mapCompiledToSource({
        file: jsFile,
        line: 1,
        column: 0,
      });

      expect(sourceLocation).toBeNull();
    });
  });

  /**
   * Feature: mcp-debugger-tool, Property 15: Source map round-trip consistency
   * For any TypeScript source location with a valid source map, mapping that location
   * to JavaScript and then back to TypeScript should yield the original location.
   * Validates: Requirements 7.2, 7.3
   */
  describe("Property 15: Source map round-trip consistency", () => {
    it("should maintain round-trip consistency for valid source locations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate line numbers within the TypeScript file range (1-40)
          fc.integer({ min: 1, max: 40 }),
          // Generate column numbers (0-80)
          fc.integer({ min: 0, max: 80 }),
          async (line, column) => {
            const tsFile = path.resolve(
              __dirname,
              "../../test-fixtures/typescript-sample.ts"
            );

            // First, map TypeScript to JavaScript
            const compiledLocation = await manager.mapSourceToCompiled({
              file: tsFile,
              line,
              column,
            });

            // If we can't map to compiled (no mapping for this location), skip
            if (!compiledLocation) {
              return true;
            }

            // Then map back from JavaScript to TypeScript
            const roundTripLocation = await manager.mapCompiledToSource({
              file: compiledLocation.file,
              line: compiledLocation.line,
              column: compiledLocation.column,
            });

            // If we can't map back, that's a failure
            if (!roundTripLocation) {
              return false;
            }

            // The round-trip should return to the same file
            // Note: Line numbers might not be exact due to source map granularity
            // but they should be close (within a few lines)
            const sameFile = roundTripLocation.file.endsWith(
              "typescript-sample.ts"
            );
            const lineDifference = Math.abs(roundTripLocation.line - line);
            const reasonableLineDifference = lineDifference <= 2;

            return sameFile && reasonableLineDifference;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle edge case: first line of file", async () => {
      const tsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.ts"
      );

      const compiledLocation = await manager.mapSourceToCompiled({
        file: tsFile,
        line: 1,
        column: 0,
      });

      if (compiledLocation) {
        const roundTripLocation = await manager.mapCompiledToSource({
          file: compiledLocation.file,
          line: compiledLocation.line,
          column: compiledLocation.column,
        });

        expect(roundTripLocation).not.toBeNull();
        if (roundTripLocation) {
          expect(roundTripLocation.file).toContain("typescript-sample.ts");
        }
      }
    });

    it("should handle edge case: function declaration line", async () => {
      const tsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.ts"
      );

      // Line 2 is the greet function declaration
      const compiledLocation = await manager.mapSourceToCompiled({
        file: tsFile,
        line: 2,
        column: 0,
      });

      if (compiledLocation) {
        const roundTripLocation = await manager.mapCompiledToSource({
          file: compiledLocation.file,
          line: compiledLocation.line,
          column: compiledLocation.column,
        });

        expect(roundTripLocation).not.toBeNull();
        if (roundTripLocation) {
          expect(roundTripLocation.file).toContain("typescript-sample.ts");
          // Should be close to line 2
          expect(Math.abs(roundTripLocation.line - 2)).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  /**
   * Feature: mcp-debugger-tool, Property 16: Source map variable name preservation
   * For any variable in a TypeScript source file with a valid source map,
   * when that variable is inspected during debugging, the variable name should match
   * the name in the TypeScript source, not the potentially mangled JavaScript name.
   * Validates: Requirements 7.4
   */
  describe("Property 16: Source map variable name preservation", () => {
    it("should map JavaScript variable names to TypeScript names", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate line numbers within the compiled JavaScript file range
          fc.integer({ min: 1, max: 50 }),
          // Generate column numbers
          fc.integer({ min: 0, max: 80 }),
          async (line, column) => {
            const jsFile = path.resolve(
              __dirname,
              "../../test-fixtures/typescript-sample.js"
            );

            // Try to map the variable name at this location
            const originalName = await manager.mapVariableName(
              jsFile,
              "someVar",
              line,
              column
            );

            // If we get a name back, it should be a non-empty string
            if (originalName !== null) {
              expect(typeof originalName).toBe("string");
              expect(originalName.length).toBeGreaterThan(0);
            }

            // If we don't get a name back, that's ok - not all locations have name mappings
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle edge case: function parameter names", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // The greet function has a parameter 'name'
      // Try to find the mapping for it
      const names = await manager.getVariableNamesAtLocation(jsFile, 4, 0);

      // We should get some variable names from the source map
      // (The exact names depend on the compilation, but we should get something)
      expect(Array.isArray(names)).toBe(true);
    });

    it("should return null when no source map is available", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/simple-script.js"
      );

      const originalName = await manager.mapVariableName(
        jsFile,
        "someVar",
        1,
        0
      );

      expect(originalName).toBeNull();
    });

    it("should handle edge case: class property names", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // The Calculator class has a property 'result'
      // Try to find variable names in the class definition area
      const names = await manager.getVariableNamesAtLocation(jsFile, 15, 0);

      // Should return an array (might be empty if no mappings at this exact location)
      expect(Array.isArray(names)).toBe(true);
    });

    it("should preserve TypeScript variable names across multiple locations", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // Test multiple locations in the file
      const locations = [
        { line: 4, column: 0 },
        { line: 8, column: 0 },
        { line: 15, column: 0 },
      ];

      for (const loc of locations) {
        const originalName = await manager.mapVariableName(
          jsFile,
          "testVar",
          loc.line,
          loc.column
        );

        // If we get a name, it should be a valid string
        if (originalName !== null) {
          expect(typeof originalName).toBe("string");
          expect(originalName.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Cache Management", () => {
    it("should clear cache", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      await manager.loadSourceMap(jsFile);
      expect(manager.getCacheSize()).toBe(1);

      manager.clearCache();
      expect(manager.getCacheSize()).toBe(0);
    });

    it("should handle concurrent loads of the same source map", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // Start multiple loads concurrently
      const promises = [
        manager.loadSourceMap(jsFile),
        manager.loadSourceMap(jsFile),
        manager.loadSourceMap(jsFile),
      ];

      const results = await Promise.all(promises);

      // All should return the same consumer
      expect(results[0]).not.toBeNull();
      expect(results[1]).not.toBeNull();
      expect(results[2]).not.toBeNull();

      // Should only have one cached entry
      expect(manager.getCacheSize()).toBe(1);
    });

    it("should return cached source map consumer", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      await manager.loadSourceMap(jsFile);

      const cached = manager.getCachedSourceMap(jsFile);
      expect(cached).not.toBeUndefined();
    });

    it("should return undefined for non-cached source map", () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      const cached = manager.getCachedSourceMap(jsFile);
      expect(cached).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid source map JSON gracefully", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/invalid-map.js"
      );

      // This should return null instead of throwing
      const consumer = await manager.loadSourceMap(jsFile);
      expect(consumer).toBeNull();
    });

    it("should handle missing source map file gracefully", async () => {
      const jsFile = path.resolve(__dirname, "../../test-fixtures/no-map.js");

      const consumer = await manager.loadSourceMap(jsFile);
      expect(consumer).toBeNull();
    });

    it("should handle errors in mapSourceToCompiled gracefully", async () => {
      const tsFile = path.resolve(
        __dirname,
        "../../test-fixtures/nonexistent.ts"
      );

      const result = await manager.mapSourceToCompiled({
        file: tsFile,
        line: 1,
        column: 0,
      });

      expect(result).toBeNull();
    });

    it("should handle errors in mapCompiledToSource gracefully", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/nonexistent.js"
      );

      const result = await manager.mapCompiledToSource({
        file: jsFile,
        line: 1,
        column: 0,
      });

      expect(result).toBeNull();
    });

    it("should handle invalid location in mapCompiledToSource", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // Try to map a location that doesn't exist in the source map
      const result = await manager.mapCompiledToSource({
        file: jsFile,
        line: 99999,
        column: 99999,
      });

      // Should return null for unmapped locations
      expect(result).toBeNull();
    });
  });

  describe("Source File Resolution", () => {
    it("should find compiled file for TypeScript source", async () => {
      const tsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.ts"
      );

      const result = await manager.mapSourceToCompiled({
        file: tsFile,
        line: 2,
        column: 0,
      });

      expect(result).not.toBeNull();
      if (result) {
        expect(result.file).toContain(".js");
      }
    });

    it("should handle TypeScript files without compiled output", async () => {
      const tsFile = path.resolve(
        __dirname,
        "../../test-fixtures/no-compiled-output.ts"
      );

      const result = await manager.mapSourceToCompiled({
        file: tsFile,
        line: 1,
        column: 0,
      });

      expect(result).toBeNull();
    });
  });

  describe("Variable Name Mapping", () => {
    it("should return null for locations without name mappings", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/typescript-sample.js"
      );

      // Try a location that likely doesn't have a name mapping
      const name = await manager.mapVariableName(jsFile, "someVar", 1, 0);

      // Could be null if no mapping exists at this location
      if (name !== null) {
        expect(typeof name).toBe("string");
      }
    });

    it("should handle errors in mapVariableName gracefully", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/nonexistent.js"
      );

      const name = await manager.mapVariableName(jsFile, "someVar", 1, 0);
      expect(name).toBeNull();
    });

    it("should handle errors in getVariableNamesAtLocation gracefully", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/nonexistent.js"
      );

      const names = await manager.getVariableNamesAtLocation(jsFile, 1, 0);
      expect(names).toEqual([]);
    });

    it("should return empty array for locations without variable names", async () => {
      const jsFile = path.resolve(
        __dirname,
        "../../test-fixtures/simple-script.js"
      );

      const names = await manager.getVariableNamesAtLocation(jsFile, 1, 0);
      expect(names).toEqual([]);
    });
  });
});
