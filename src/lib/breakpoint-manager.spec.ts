import * as fc from 'fast-check';
import { BreakpointManager } from './breakpoint-manager';

describe('BreakpointManager', () => {
  let manager: BreakpointManager;

  beforeEach(() => {
    manager = new BreakpointManager();
  });

  // Feature: mcp-debugger-tool, Property 1: Breakpoint creation and retrieval consistency
  // For any valid file path and line number, when a breakpoint is created at that location,
  // then retrieving the breakpoint list should include that breakpoint with the correct file path and line number.
  // Validates: Requirements 1.1, 1.3
  it('should maintain consistency between breakpoint creation and retrieval', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // file path
        fc.integer({ min: 1, max: 10000 }), // line number
        fc.option(fc.string(), { nil: undefined }), // optional condition
        (file, line, condition) => {
          // Create a breakpoint
          const breakpoint = manager.createBreakpoint(file, line, condition);

          // Verify the breakpoint has the correct properties
          expect(breakpoint.file).toBe(file);
          expect(breakpoint.line).toBe(line);
          expect(breakpoint.condition).toBe(condition);
          expect(breakpoint.enabled).toBe(true);
          expect(breakpoint.id).toBeDefined();

          // Retrieve the breakpoint by ID
          const retrieved = manager.getBreakpoint(breakpoint.id);
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(breakpoint.id);
          expect(retrieved?.file).toBe(file);
          expect(retrieved?.line).toBe(line);
          expect(retrieved?.condition).toBe(condition);

          // Verify the breakpoint appears in the list
          const allBreakpoints = manager.getAllBreakpoints();
          const found = allBreakpoints.find((bp) => bp.id === breakpoint.id);
          expect(found).toBeDefined();
          expect(found?.file).toBe(file);
          expect(found?.line).toBe(line);
          expect(found?.condition).toBe(condition);

          // Verify the breakpoint appears in file-specific list
          const fileBreakpoints = manager.getBreakpointsByFile(file);
          const foundInFile = fileBreakpoints.find(
            (bp) => bp.id === breakpoint.id,
          );
          expect(foundInFile).toBeDefined();
          expect(foundInFile?.line).toBe(line);

          // Clean up for next iteration
          manager.clearAll();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: mcp-debugger-tool, Property 3: Breakpoint removal completeness
  // For any breakpoint that exists in the system, when that breakpoint is removed by its identifier,
  // then subsequent breakpoint list retrievals should not include that breakpoint.
  // Validates: Requirements 1.4
  it('should completely remove breakpoints when requested', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            file: fc.string({ minLength: 1 }),
            line: fc.integer({ min: 1, max: 10000 }),
            condition: fc.option(fc.string(), { nil: undefined }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (breakpointSpecs) => {
          // Create multiple breakpoints
          const createdBreakpoints = breakpointSpecs.map((spec) =>
            manager.createBreakpoint(spec.file, spec.line, spec.condition),
          );

          // Verify all breakpoints exist
          expect(manager.getBreakpointCount()).toBe(createdBreakpoints.length);

          // Pick a random breakpoint to remove
          const indexToRemove = Math.floor(
            Math.random() * createdBreakpoints.length,
          );
          const breakpointToRemove = createdBreakpoints[indexToRemove];

          // Remove the breakpoint
          const removed = manager.removeBreakpoint(breakpointToRemove.id);
          expect(removed).toBe(true);

          // Verify the breakpoint no longer exists
          expect(manager.getBreakpoint(breakpointToRemove.id)).toBeUndefined();
          expect(manager.hasBreakpoint(breakpointToRemove.id)).toBe(false);

          // Verify the breakpoint is not in the list
          const allBreakpoints = manager.getAllBreakpoints();
          expect(allBreakpoints.length).toBe(createdBreakpoints.length - 1);
          const found = allBreakpoints.find(
            (bp) => bp.id === breakpointToRemove.id,
          );
          expect(found).toBeUndefined();

          // Verify the breakpoint is not in the file-specific list
          const fileBreakpoints = manager.getBreakpointsByFile(
            breakpointToRemove.file,
          );
          const foundInFile = fileBreakpoints.find(
            (bp) => bp.id === breakpointToRemove.id,
          );
          expect(foundInFile).toBeUndefined();

          // Verify all other breakpoints still exist
          createdBreakpoints.forEach((bp, index) => {
            if (index !== indexToRemove) {
              expect(manager.getBreakpoint(bp.id)).toBeDefined();
              expect(manager.hasBreakpoint(bp.id)).toBe(true);
            }
          });

          // Attempting to remove the same breakpoint again should return false
          const removedAgain = manager.removeBreakpoint(breakpointToRemove.id);
          expect(removedAgain).toBe(false);

          // Clean up for next iteration
          manager.clearAll();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: mcp-debugger-tool, Property 4: Breakpoint toggle preserves identity
  // For any breakpoint, when its state is toggled between enabled and disabled,
  // the breakpoint should remain in the breakpoint list with the same identifier and location but with updated state.
  // Validates: Requirements 1.5
  it('should preserve breakpoint identity when toggling state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // file path
        fc.integer({ min: 1, max: 10000 }), // line number
        fc.option(fc.string(), { nil: undefined }), // optional condition
        fc.integer({ min: 1, max: 10 }), // number of toggles
        (file, line, condition, numToggles) => {
          // Create a breakpoint
          const breakpoint = manager.createBreakpoint(file, line, condition);
          const originalId = breakpoint.id;

          // Store original properties
          const originalFile = breakpoint.file;
          const originalLine = breakpoint.line;
          const originalCondition = breakpoint.condition;

          // Verify initial state
          expect(breakpoint.enabled).toBe(true);

          // Toggle the breakpoint multiple times
          let expectedEnabled = true;
          for (let i = 0; i < numToggles; i++) {
            expectedEnabled = !expectedEnabled;
            const toggled = manager.toggleBreakpoint(originalId);

            // Verify toggle returned the breakpoint
            expect(toggled).toBeDefined();
            expect(toggled?.id).toBe(originalId);
            expect(toggled?.enabled).toBe(expectedEnabled);

            // Verify the breakpoint still exists with same ID
            const retrieved = manager.getBreakpoint(originalId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(originalId);
            expect(retrieved?.enabled).toBe(expectedEnabled);

            // Verify identity is preserved (same file, line, condition)
            expect(retrieved?.file).toBe(originalFile);
            expect(retrieved?.line).toBe(originalLine);
            expect(retrieved?.condition).toBe(originalCondition);

            // Verify the breakpoint is still in the list
            const allBreakpoints = manager.getAllBreakpoints();
            expect(allBreakpoints.length).toBe(1);
            const found = allBreakpoints.find((bp) => bp.id === originalId);
            expect(found).toBeDefined();
            expect(found?.enabled).toBe(expectedEnabled);

            // Verify the breakpoint is still in the file-specific list
            const fileBreakpoints = manager.getBreakpointsByFile(file);
            expect(fileBreakpoints.length).toBe(1);
            expect(fileBreakpoints[0].id).toBe(originalId);
            expect(fileBreakpoints[0].enabled).toBe(expectedEnabled);
          }

          // Verify final state matches expected state after all toggles
          const finalBreakpoint = manager.getBreakpoint(originalId);
          expect(finalBreakpoint?.enabled).toBe(expectedEnabled);

          // Clean up for next iteration
          manager.clearAll();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle enable and disable operations correctly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // file path
        fc.integer({ min: 1, max: 10000 }), // line number
        (file, line) => {
          // Create a breakpoint (starts enabled)
          const breakpoint = manager.createBreakpoint(file, line);
          expect(breakpoint.enabled).toBe(true);

          // Disable the breakpoint
          const disabled = manager.disableBreakpoint(breakpoint.id);
          expect(disabled).toBeDefined();
          expect(disabled?.enabled).toBe(false);
          expect(disabled?.id).toBe(breakpoint.id);

          // Verify it's disabled
          const retrieved1 = manager.getBreakpoint(breakpoint.id);
          expect(retrieved1?.enabled).toBe(false);

          // Enable the breakpoint
          const enabled = manager.enableBreakpoint(breakpoint.id);
          expect(enabled).toBeDefined();
          expect(enabled?.enabled).toBe(true);
          expect(enabled?.id).toBe(breakpoint.id);

          // Verify it's enabled
          const retrieved2 = manager.getBreakpoint(breakpoint.id);
          expect(retrieved2?.enabled).toBe(true);

          // Disabling an already disabled breakpoint should work
          manager.disableBreakpoint(breakpoint.id);
          manager.disableBreakpoint(breakpoint.id);
          expect(manager.getBreakpoint(breakpoint.id)?.enabled).toBe(false);

          // Enabling an already enabled breakpoint should work
          manager.enableBreakpoint(breakpoint.id);
          manager.enableBreakpoint(breakpoint.id);
          expect(manager.getBreakpoint(breakpoint.id)?.enabled).toBe(true);

          // Clean up for next iteration
          manager.clearAll();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: mcp-debugger-tool, Property 2: Conditional breakpoint evaluation
  // For any conditional breakpoint with a valid condition expression,
  // the Target Process should only pause at that breakpoint when the condition evaluates to true.
  // Validates: Requirements 1.2
  it('should handle conditional breakpoints correctly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // file path
        fc.integer({ min: 1, max: 10000 }), // line number
        fc.string({ minLength: 1 }), // condition expression
        (file, line, condition) => {
          // Create a conditional breakpoint
          const breakpoint = manager.createBreakpoint(file, line, condition);

          // Verify the breakpoint has the condition
          expect(breakpoint.condition).toBe(condition);

          // Retrieve the breakpoint
          const retrieved = manager.getBreakpoint(breakpoint.id);
          expect(retrieved).toBeDefined();
          expect(retrieved?.condition).toBe(condition);

          // Verify the condition is preserved in the list
          const allBreakpoints = manager.getAllBreakpoints();
          const found = allBreakpoints.find((bp) => bp.id === breakpoint.id);
          expect(found).toBeDefined();
          expect(found?.condition).toBe(condition);

          // Clean up for next iteration
          manager.clearAll();
        },
      ),
      { numRuns: 100 },
    );
  });

  describe('Logpoint operations', () => {
    it('should create logpoints with log messages', () => {
      const logpoint = manager.createLogpoint(
        '/test/file.js',
        10,
        'Value is {x}',
      );

      expect(logpoint.id).toBeDefined();
      expect(logpoint.file).toBe('/test/file.js');
      expect(logpoint.line).toBe(10);
      expect(logpoint.logMessage).toBe('Value is {x}');
      expect(logpoint.enabled).toBe(true);
      expect(logpoint.hitCount).toBe(0);
    });

    it('should retrieve logpoints', () => {
      const logpoint = manager.createLogpoint(
        '/test/file.js',
        15,
        'Debug: {msg}',
      );
      const retrieved = manager.getBreakpoint(logpoint.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.logMessage).toBe('Debug: {msg}');
    });
  });

  describe('Function breakpoint operations', () => {
    it('should create function breakpoints', () => {
      const funcBp = manager.createFunctionBreakpoint('myFunction');

      expect(funcBp.id).toBeDefined();
      expect(funcBp.functionName).toBe('myFunction');
      expect(funcBp.file).toBe('');
      expect(funcBp.line).toBe(0);
      expect(funcBp.enabled).toBe(true);
      expect(funcBp.hitCount).toBe(0);
    });

    it('should retrieve function breakpoints', () => {
      const funcBp = manager.createFunctionBreakpoint('testFunc');
      const retrieved = manager.getBreakpoint(funcBp.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.functionName).toBe('testFunc');
    });
  });

  describe('addBreakpoint', () => {
    it('should add an existing breakpoint', () => {
      const breakpoint = {
        id: 'custom-bp-1',
        file: '/test/file.js',
        line: 20,
        enabled: true,
        type: 0,
        hitCount: 0,
      };

      manager.addBreakpoint(breakpoint);

      const retrieved = manager.getBreakpoint('custom-bp-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('custom-bp-1');
      expect(retrieved?.file).toBe('/test/file.js');
      expect(retrieved?.line).toBe(20);
    });
  });

  describe('updateCdpBreakpointId', () => {
    it('should update CDP breakpoint ID for existing breakpoint', () => {
      const bp = manager.createBreakpoint('/test/file.js', 25);

      const updated = manager.updateCdpBreakpointId(bp.id, 'cdp-123');

      expect(updated).toBeDefined();
      expect(updated?.cdpBreakpointId).toBe('cdp-123');

      const retrieved = manager.getBreakpoint(bp.id);
      expect(retrieved?.cdpBreakpointId).toBe('cdp-123');
    });

    it('should return undefined for non-existent breakpoint', () => {
      const updated = manager.updateCdpBreakpointId('non-existent', 'cdp-456');
      expect(updated).toBeUndefined();
    });
  });

  describe('Hit count operations', () => {
    it('should increment hit count', () => {
      const bp = manager.createBreakpoint('/test/file.js', 30);

      expect(bp.hitCount).toBe(0);

      const count1 = manager.incrementHitCount(bp.id);
      expect(count1).toBe(1);

      const count2 = manager.incrementHitCount(bp.id);
      expect(count2).toBe(2);

      const retrieved = manager.getBreakpoint(bp.id);
      expect(retrieved?.hitCount).toBe(2);
    });

    it('should return undefined when incrementing non-existent breakpoint', () => {
      const count = manager.incrementHitCount('non-existent');
      expect(count).toBeUndefined();
    });

    it('should reset hit count', () => {
      const bp = manager.createBreakpoint('/test/file.js', 35);

      manager.incrementHitCount(bp.id);
      manager.incrementHitCount(bp.id);
      manager.incrementHitCount(bp.id);

      expect(manager.getBreakpoint(bp.id)?.hitCount).toBe(3);

      const reset = manager.resetHitCount(bp.id);
      expect(reset).toBe(true);
      expect(manager.getBreakpoint(bp.id)?.hitCount).toBe(0);
    });

    it('should return false when resetting non-existent breakpoint', () => {
      const reset = manager.resetHitCount('non-existent');
      expect(reset).toBe(false);
    });

    it('should reset all hit counts', () => {
      const bp1 = manager.createBreakpoint('/test/file1.js', 10);
      const bp2 = manager.createBreakpoint('/test/file2.js', 20);
      const bp3 = manager.createBreakpoint('/test/file3.js', 30);

      manager.incrementHitCount(bp1.id);
      manager.incrementHitCount(bp1.id);
      manager.incrementHitCount(bp2.id);
      manager.incrementHitCount(bp3.id);
      manager.incrementHitCount(bp3.id);
      manager.incrementHitCount(bp3.id);

      expect(manager.getBreakpoint(bp1.id)?.hitCount).toBe(2);
      expect(manager.getBreakpoint(bp2.id)?.hitCount).toBe(1);
      expect(manager.getBreakpoint(bp3.id)?.hitCount).toBe(3);

      manager.resetAllHitCounts();

      expect(manager.getBreakpoint(bp1.id)?.hitCount).toBe(0);
      expect(manager.getBreakpoint(bp2.id)?.hitCount).toBe(0);
      expect(manager.getBreakpoint(bp3.id)?.hitCount).toBe(0);
    });
  });

  describe('Hit count conditions', () => {
    it('should set hit count condition', () => {
      const bp = manager.createBreakpoint('/test/file.js', 40);

      const updated = manager.setHitCountCondition(bp.id, {
        operator: '==',
        value: 5,
      });

      expect(updated).toBeDefined();
      expect(updated?.hitCountCondition).toEqual({
        operator: '==',
        value: 5,
      });
    });

    it('should return undefined when setting condition on non-existent breakpoint', () => {
      const updated = manager.setHitCountCondition('non-existent', {
        operator: '>',
        value: 10,
      });
      expect(updated).toBeUndefined();
    });

    it('should evaluate == operator correctly', () => {
      const bp = manager.createBreakpoint('/test/file.js', 45);
      manager.setHitCountCondition(bp.id, { operator: '==', value: 3 });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 0
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 1
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 2
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 3
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 4
    });

    it('should evaluate > operator correctly', () => {
      const bp = manager.createBreakpoint('/test/file.js', 50);
      manager.setHitCountCondition(bp.id, { operator: '>', value: 2 });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 0
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 1
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 2
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 3
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 4
    });

    it('should evaluate >= operator correctly', () => {
      const bp = manager.createBreakpoint('/test/file.js', 55);
      manager.setHitCountCondition(bp.id, { operator: '>=', value: 2 });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 0
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 1
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 2
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 3
    });

    it('should evaluate < operator correctly', () => {
      const bp = manager.createBreakpoint('/test/file.js', 60);
      manager.setHitCountCondition(bp.id, { operator: '<', value: 3 });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 0
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 1
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 2
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 3
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 4
    });

    it('should evaluate <= operator correctly', () => {
      const bp = manager.createBreakpoint('/test/file.js', 65);
      manager.setHitCountCondition(bp.id, { operator: '<=', value: 2 });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 0
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 1
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 2
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 3
    });

    it('should evaluate % operator correctly', () => {
      const bp = manager.createBreakpoint('/test/file.js', 70);
      manager.setHitCountCondition(bp.id, { operator: '%', value: 3 });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 0 (0 % 3 = 0)
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 1
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 2
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 3 (3 % 3 = 0)
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 4
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(false); // hitCount = 5
      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true); // hitCount = 6 (6 % 3 = 0)
    });

    it('should return true for breakpoint without hit count condition', () => {
      const bp = manager.createBreakpoint('/test/file.js', 75);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true);

      manager.incrementHitCount(bp.id);
      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true);
    });

    it('should return true for non-existent breakpoint', () => {
      expect(manager.shouldPauseOnHitCount('non-existent')).toBe(true);
    });

    it('should return true for unknown operator', () => {
      const bp = manager.createBreakpoint('/test/file.js', 80);
      manager.setHitCountCondition(bp.id, {
        operator: 'unknown' as any,
        value: 5,
      });

      expect(manager.shouldPauseOnHitCount(bp.id)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty breakpoint list', () => {
      expect(manager.getAllBreakpoints()).toEqual([]);
      expect(manager.getBreakpointCount()).toBe(0);
      expect(manager.getBreakpointsByFile('/any/file.js')).toEqual([]);
    });

    it('should handle non-existent breakpoint operations', () => {
      expect(manager.getBreakpoint('non-existent')).toBeUndefined();
      expect(manager.hasBreakpoint('non-existent')).toBe(false);
      expect(manager.removeBreakpoint('non-existent')).toBe(false);
      expect(manager.toggleBreakpoint('non-existent')).toBeUndefined();
      expect(manager.enableBreakpoint('non-existent')).toBeUndefined();
      expect(manager.disableBreakpoint('non-existent')).toBeUndefined();
    });

    it('should handle clearAll with empty list', () => {
      manager.clearAll();
      expect(manager.getBreakpointCount()).toBe(0);
    });

    it('should handle clearAll with multiple breakpoints', () => {
      manager.createBreakpoint('/test/file1.js', 10);
      manager.createBreakpoint('/test/file2.js', 20);
      manager.createBreakpoint('/test/file3.js', 30);

      expect(manager.getBreakpointCount()).toBe(3);

      manager.clearAll();

      expect(manager.getBreakpointCount()).toBe(0);
      expect(manager.getAllBreakpoints()).toEqual([]);
    });

    it('should handle getBreakpointsByFile with no matches', () => {
      manager.createBreakpoint('/test/file1.js', 10);
      manager.createBreakpoint('/test/file2.js', 20);

      const result = manager.getBreakpointsByFile('/test/file3.js');
      expect(result).toEqual([]);
    });

    it('should handle getBreakpointsByFile with multiple matches', () => {
      manager.createBreakpoint('/test/file.js', 10);
      manager.createBreakpoint('/test/file.js', 20);
      manager.createBreakpoint('/test/other.js', 30);

      const result = manager.getBreakpointsByFile('/test/file.js');
      expect(result).toHaveLength(2);
      expect(result.every((bp) => bp.file === '/test/file.js')).toBe(true);
    });

    it('should handle resetAllHitCounts with empty list', () => {
      manager.resetAllHitCounts();
      expect(manager.getBreakpointCount()).toBe(0);
    });
  });
});
