/**
 * Smart breakpoint suggestions based on code analysis
 * Recommends breakpoint locations for common debugging scenarios
 */

import * as fs from "fs";
import * as path from "path";

export interface BreakpointSuggestion {
  file: string;
  line: number;
  reason: string;
  condition?: string;
  priority: "high" | "medium" | "low";
}

export interface AnalysisContext {
  errorMessage?: string;
  stackTrace?: string[];
  testName?: string;
  scenario?: "error" | "test-failure" | "performance" | "general";
}

/**
 * Suggests breakpoint locations based on code analysis
 */
export class BreakpointSuggester {
  /**
   * Suggest breakpoints for a file
   */
  suggestBreakpoints(
    filePath: string,
    context?: AnalysisContext
  ): BreakpointSuggestion[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const suggestions: BreakpointSuggestion[] = [];

    // Analyze based on context
    if (context?.scenario === "error" && context.errorMessage) {
      suggestions.push(...this.suggestForError(filePath, lines, context));
    } else if (context?.scenario === "test-failure") {
      suggestions.push(...this.suggestForTestFailure(filePath, lines, context));
    } else if (context?.scenario === "performance") {
      suggestions.push(...this.suggestForPerformance(filePath, lines));
    } else {
      suggestions.push(...this.suggestGeneral(filePath, lines));
    }

    // Sort by priority
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Suggest breakpoints for error scenarios
   */
  private suggestForError(
    filePath: string,
    lines: string[],
    context: AnalysisContext
  ): BreakpointSuggestion[] {
    const suggestions: BreakpointSuggestion[] = [];

    // Suggest breakpoints at throw statements
    lines.forEach((line, index) => {
      if (line.match(/\bthrow\s+/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Error is thrown here",
          priority: "high",
        });
      }
    });

    // Suggest breakpoints at error handling
    lines.forEach((line, index) => {
      if (line.match(/\bcatch\s*\(/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Error is caught here",
          priority: "high",
        });
      }
    });

    // Suggest breakpoints at null/undefined checks
    lines.forEach((line, index) => {
      if (line.match(/===?\s*(null|undefined)|null|undefined\s*===?/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Null/undefined check - potential source of error",
          priority: "medium",
        });
      }
    });

    return suggestions;
  }

  /**
   * Suggest breakpoints for test failure scenarios
   */
  private suggestForTestFailure(
    filePath: string,
    lines: string[],
    context: AnalysisContext
  ): BreakpointSuggestion[] {
    const suggestions: BreakpointSuggestion[] = [];

    // Suggest breakpoints at assertions
    lines.forEach((line, index) => {
      if (line.match(/\b(expect|assert|should)\s*\(/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Assertion - check test expectations",
          priority: "high",
        });
      }
    });

    // Suggest breakpoints at test setup
    lines.forEach((line, index) => {
      if (line.match(/\b(beforeEach|beforeAll|setUp)\s*\(/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Test setup - verify initial state",
          priority: "medium",
        });
      }
    });

    return suggestions;
  }

  /**
   * Suggest breakpoints for performance scenarios
   */
  private suggestForPerformance(
    filePath: string,
    lines: string[]
  ): BreakpointSuggestion[] {
    const suggestions: BreakpointSuggestion[] = [];

    // Suggest breakpoints at loops
    lines.forEach((line, index) => {
      if (line.match(/\b(for|while|do)\s*[\(\{]/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Loop - potential performance bottleneck",
          priority: "high",
        });
      }
    });

    // Suggest breakpoints at recursive calls
    lines.forEach((line, index) => {
      if (
        line.match(/\bfunction\s+(\w+)/) ||
        line.match(/const\s+(\w+)\s*=\s*\(/)
      ) {
        const functionName =
          line.match(/\bfunction\s+(\w+)/)?.[1] ||
          line.match(/const\s+(\w+)\s*=\s*\(/)?.[1];

        if (functionName) {
          // Check if function calls itself
          const functionBody = lines.slice(index).join("\n");
          if (functionBody.match(new RegExp(`\\b${functionName}\\s*\\(`))) {
            suggestions.push({
              file: filePath,
              line: index + 1,
              reason: "Recursive function - check for infinite recursion",
              priority: "high",
            });
          }
        }
      }
    });

    // Suggest breakpoints at database/network calls
    lines.forEach((line, index) => {
      if (line.match(/\b(fetch|axios|http|query|execute)\s*\(/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "External call - potential performance issue",
          priority: "medium",
        });
      }
    });

    return suggestions;
  }

  /**
   * Suggest general breakpoints
   */
  private suggestGeneral(
    filePath: string,
    lines: string[]
  ): BreakpointSuggestion[] {
    const suggestions: BreakpointSuggestion[] = [];

    // Suggest breakpoints at function entries
    lines.forEach((line, index) => {
      if (
        line.match(/\bfunction\s+\w+\s*\(/) ||
        line.match(/\b\w+\s*:\s*function\s*\(/) ||
        line.match(/\b\w+\s*=\s*\([^)]*\)\s*=>/)
      ) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Function entry point",
          priority: "medium",
        });
      }
    });

    // Suggest breakpoints at class methods
    lines.forEach((line, index) => {
      if (
        line.match(/^\s*(public|private|protected)?\s*\w+\s*\([^)]*\)\s*[:{]/)
      ) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Method entry point",
          priority: "medium",
        });
      }
    });

    // Suggest breakpoints at conditional branches
    lines.forEach((line, index) => {
      if (line.match(/\bif\s*\(/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Conditional branch - check logic flow",
          priority: "low",
        });
      }
    });

    // Suggest breakpoints at return statements
    lines.forEach((line, index) => {
      if (line.match(/\breturn\s+/)) {
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Return statement - check return value",
          priority: "low",
        });
      }
    });

    return suggestions;
  }

  /**
   * Suggest conditional breakpoints based on context
   */
  suggestConditionalBreakpoints(
    filePath: string,
    context: AnalysisContext
  ): BreakpointSuggestion[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const suggestions: BreakpointSuggestion[] = [];

    // Suggest conditional breakpoints for loops
    lines.forEach((line, index) => {
      const loopMatch = line.match(/for\s*\(\s*let\s+(\w+)\s*=/);
      if (loopMatch) {
        const variable = loopMatch[1];
        suggestions.push({
          file: filePath,
          line: index + 1,
          reason: "Loop iteration - break on specific iteration",
          condition: `${variable} === 10`,
          priority: "medium",
        });
      }
    });

    // Suggest conditional breakpoints for error conditions
    if (context.errorMessage) {
      lines.forEach((line, index) => {
        const variableMatch = line.match(/\b(const|let|var)\s+(\w+)\s*=/);
        if (variableMatch) {
          const variable = variableMatch[2];
          suggestions.push({
            file: filePath,
            line: index + 1,
            reason: "Variable assignment - break on specific value",
            condition: `${variable} === null || ${variable} === undefined`,
            priority: "medium",
          });
        }
      });
    }

    return suggestions;
  }

  /**
   * Suggest breakpoints based on stack trace
   */
  suggestFromStackTrace(stackTrace: string[]): BreakpointSuggestion[] {
    const suggestions: BreakpointSuggestion[] = [];

    for (const frame of stackTrace) {
      // Parse stack frame: "at functionName (file:line:column)"
      const match = frame.match(/at\s+.*?\s*\(([^:]+):(\d+):\d+\)/);
      if (match) {
        const [, file, lineStr] = match;
        const line = parseInt(lineStr, 10);

        suggestions.push({
          file: path.resolve(file),
          line,
          reason: "Stack trace location",
          priority: "high",
        });
      }
    }

    return suggestions;
  }

  /**
   * Suggest breakpoints for common debugging scenarios
   */
  suggestForScenario(
    scenario: string,
    filePath: string
  ): BreakpointSuggestion[] {
    const scenarios: Record<string, AnalysisContext> = {
      "null-pointer": {
        scenario: "error",
        errorMessage: "Cannot read property of null",
      },
      "infinite-loop": {
        scenario: "performance",
      },
      "test-failure": {
        scenario: "test-failure",
      },
      "async-issue": {
        scenario: "error",
        errorMessage: "Promise rejection",
      },
    };

    const context = scenarios[scenario];
    if (!context) {
      return [];
    }

    return this.suggestBreakpoints(filePath, context);
  }
}
