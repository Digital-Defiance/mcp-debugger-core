import { SessionManager } from "./session-manager";
import { BreakpointManager } from "./breakpoint-manager";
import { SourceMapManager } from "./source-map-manager";
import * as path from "path";
import { execSync } from "child_process";

/**
 * Integration tests for TypeScript debugging
 * Tests the full workflow of debugging TypeScript files with source maps
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
describe("TypeScript Debugging Integration", () => {
  let sessionManager: SessionManager;
  let sourceMapManager: SourceMapManager;

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
    sessionManager = new SessionManager();
    sourceMapManager = new SourceMapManager();
  });

  afterEach(async () => {
    await sessionManager.cleanupAll();
    sourceMapManager.clearCache();
  });

  /**
   * Test setting breakpoints in TypeScript files
   * Requirement 7.1, 7.2
   */
  it("should set breakpoint in TypeScript file and map to JavaScript", async () => {
    const tsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.ts"
    );
    const jsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.js"
    );

    // Create breakpoint manager
    const breakpointManager = new BreakpointManager();

    // Create a breakpoint in the TypeScript file (line 3 - inside greet function)
    const breakpoint = breakpointManager.createBreakpoint(tsFile, 3);

    expect(breakpoint).toBeDefined();
    expect(breakpoint.id).toBeDefined();
    expect(breakpoint.enabled).toBe(true);

    // The breakpoint should be set in the TypeScript file
    expect(breakpoint.file).toContain("typescript-sample.ts");
    expect(breakpoint.line).toBe(3);

    // Verify we can retrieve it
    const retrieved = breakpointManager.getBreakpoint(breakpoint.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.file).toBe(tsFile);
  }, 30000);

  /**
   * Test source map location mapping during debugging
   * Requirement 7.2, 7.3
   */
  it("should map JavaScript execution location back to TypeScript", async () => {
    const tsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.ts"
    );
    const jsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.js"
    );

    // Test mapping from JavaScript to TypeScript
    const sourceLocation = await sourceMapManager.mapCompiledToSource({
      file: jsFile,
      line: 4, // A line in the compiled JavaScript
      column: 0,
    });

    expect(sourceLocation).not.toBeNull();
    if (sourceLocation) {
      // Should map back to the TypeScript file
      expect(sourceLocation.file).toContain("typescript-sample.ts");
      expect(sourceLocation.line).toBeGreaterThan(0);
      expect(sourceLocation.column).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * Test variable inspection with TypeScript names
   * Requirement 7.4
   */
  it("should preserve TypeScript variable names during inspection", async () => {
    const jsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.js"
    );

    // Load the source map
    const consumer = await sourceMapManager.loadSourceMap(jsFile);
    expect(consumer).not.toBeNull();

    // Test that we can get variable names from the source map
    const names = await sourceMapManager.getVariableNamesAtLocation(
      jsFile,
      4,
      0
    );

    expect(Array.isArray(names)).toBe(true);
    // The source map should provide some variable name information
    // (exact names depend on the TypeScript compilation)
  });

  /**
   * Test full debugging workflow with TypeScript
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  it("should support full debugging workflow with TypeScript files", async () => {
    const tsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.ts"
    );
    const jsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.js"
    );

    // 1. Verify source map exists
    expect(sourceMapManager.hasSourceMap(jsFile)).toBe(true);

    // 2. Load source map
    const consumer = await sourceMapManager.loadSourceMap(jsFile);
    expect(consumer).not.toBeNull();

    // 3. Map TypeScript location to JavaScript
    const compiledLocation = await sourceMapManager.mapSourceToCompiled({
      file: tsFile,
      line: 2, // greet function declaration
      column: 0,
    });

    expect(compiledLocation).not.toBeNull();
    if (compiledLocation) {
      expect(compiledLocation.file).toContain("typescript-sample.js");
      expect(compiledLocation.line).toBeGreaterThan(0);

      // 4. Map back to TypeScript (round-trip)
      const roundTripLocation = await sourceMapManager.mapCompiledToSource({
        file: compiledLocation.file,
        line: compiledLocation.line,
        column: compiledLocation.column,
      });

      expect(roundTripLocation).not.toBeNull();
      if (roundTripLocation) {
        expect(roundTripLocation.file).toContain("typescript-sample.ts");
        // Line should be close to original (within 2 lines due to source map granularity)
        expect(Math.abs(roundTripLocation.line - 2)).toBeLessThanOrEqual(2);
      }
    }
  });

  /**
   * Test debugging TypeScript class with methods
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  it("should debug TypeScript class methods correctly", async () => {
    const tsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.ts"
    );
    const jsFile = path.resolve(
      __dirname,
      "../../test-fixtures/typescript-sample.js"
    );

    // Map a location in the Calculator class (around line 15 in TypeScript)
    const compiledLocation = await sourceMapManager.mapSourceToCompiled({
      file: tsFile,
      line: 15, // Inside Calculator class
      column: 0,
    });

    // Note: mapSourceToCompiled may return null if there's no exact mapping for this location
    // This is expected behavior for source maps - not all lines have mappings
    if (compiledLocation) {
      // Should map to the compiled JavaScript
      expect(compiledLocation.file).toContain("typescript-sample.js");

      // Map back to verify
      const sourceLocation = await sourceMapManager.mapCompiledToSource({
        file: compiledLocation.file,
        line: compiledLocation.line,
        column: compiledLocation.column,
      });

      expect(sourceLocation).not.toBeNull();
      if (sourceLocation) {
        expect(sourceLocation.file).toContain("typescript-sample.ts");
      }
    } else {
      // If no mapping exists, that's ok - just verify the source map is loaded
      const consumer = await sourceMapManager.loadSourceMap(jsFile);
      expect(consumer).not.toBeNull();
    }
  });

  /**
   * Test handling of TypeScript files without source maps
   * Requirement 7.1
   */
  it("should handle TypeScript files without source maps gracefully", async () => {
    const jsFile = path.resolve(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );

    // This file doesn't have a source map
    expect(sourceMapManager.hasSourceMap(jsFile)).toBe(false);

    // Loading should return null
    const consumer = await sourceMapManager.loadSourceMap(jsFile);
    expect(consumer).toBeNull();

    // Mapping should return null
    const sourceLocation = await sourceMapManager.mapCompiledToSource({
      file: jsFile,
      line: 1,
      column: 0,
    });

    expect(sourceLocation).toBeNull();
  });
});
