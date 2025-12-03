import { BreakpointSuggester } from "./breakpoint-suggester";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("BreakpointSuggester", () => {
  let suggester: BreakpointSuggester;
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    suggester = new BreakpointSuggester();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bp-suggest-test-"));
    testFile = path.join(tempDir, "test.js");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("suggestBreakpoints", () => {
    it("should return empty array for non-existent file", () => {
      const suggestions = suggester.suggestBreakpoints("/non/existent/file.js");
      expect(suggestions).toEqual([]);
    });

    it("should suggest breakpoints at throw statements", () => {
      const code = `
function test() {
  if (error) {
    throw new Error('Something went wrong');
  }
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile, {
        scenario: "error",
        errorMessage: "Error occurred",
      });

      const throwSuggestion = suggestions.find((s) =>
        s.reason.includes("thrown")
      );
      expect(throwSuggestion).toBeDefined();
      expect(throwSuggestion?.priority).toBe("high");
    });

    it("should suggest breakpoints at catch blocks", () => {
      const code = `
try {
  doSomething();
} catch (error) {
  console.error(error);
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile, {
        scenario: "error",
        errorMessage: "Error occurred",
      });

      const catchSuggestion = suggestions.find((s) =>
        s.reason.includes("caught")
      );
      expect(catchSuggestion).toBeDefined();
    });

    it("should suggest breakpoints at assertions for test failures", () => {
      const code = `
it('should work', () => {
  const result = calculate();
  expect(result).toBe(42);
});
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile, {
        scenario: "test-failure",
      });

      const assertSuggestion = suggestions.find((s) =>
        s.reason.includes("Assertion")
      );
      expect(assertSuggestion).toBeDefined();
      expect(assertSuggestion?.priority).toBe("high");
    });

    it("should suggest breakpoints at loops for performance", () => {
      const code = `
function process(items) {
  for (let i = 0; i < items.length; i++) {
    doWork(items[i]);
  }
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile, {
        scenario: "performance",
      });

      const loopSuggestion = suggestions.find((s) => s.reason.includes("Loop"));
      expect(loopSuggestion).toBeDefined();
      expect(loopSuggestion?.priority).toBe("high");
    });

    it("should suggest breakpoints at function entries", () => {
      const code = `
function myFunction() {
  return 42;
}

const arrowFunc = () => {
  return 'hello';
};
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile);

      const functionSuggestions = suggestions.filter(
        (s) =>
          s.reason.includes("Function entry") ||
          s.reason.includes("entry point")
      );
      expect(functionSuggestions.length).toBeGreaterThan(0);
    });

    it("should sort suggestions by priority", () => {
      const code = `
function test() {
  if (condition) {
    throw new Error('error');
  }
  return value;
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile, {
        scenario: "error",
        errorMessage: "Error",
      });

      // High priority should come first
      if (suggestions.length > 1) {
        expect(suggestions[0].priority).toBe("high");
      }
    });
  });

  describe("suggestConditionalBreakpoints", () => {
    it("should suggest conditional breakpoints for loops", () => {
      const code = `
for (let i = 0; i < 100; i++) {
  process(i);
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestConditionalBreakpoints(testFile, {});

      const loopSuggestion = suggestions.find((s) =>
        s.condition?.includes("i")
      );
      expect(loopSuggestion).toBeDefined();
      expect(loopSuggestion?.condition).toContain("===");
    });

    it("should suggest conditional breakpoints for variables", () => {
      const code = `
const result = calculate();
const value = getValue();
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestConditionalBreakpoints(testFile, {
        errorMessage: "Null reference error",
      });

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].condition).toContain("null");
    });

    it("should return empty array for non-existent file", () => {
      const suggestions = suggester.suggestConditionalBreakpoints(
        "/non/existent/file.js",
        {}
      );
      expect(suggestions).toEqual([]);
    });
  });

  describe("suggestFromStackTrace", () => {
    it("should suggest breakpoints from stack trace", () => {
      const stackTrace = [
        "at myFunction (/path/to/file.js:10:5)",
        "at anotherFunction (/path/to/other.js:25:10)",
      ];

      const suggestions = suggester.suggestFromStackTrace(stackTrace);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].line).toBe(10);
      expect(suggestions[0].priority).toBe("high");
      expect(suggestions[1].line).toBe(25);
    });

    it("should handle empty stack trace", () => {
      const suggestions = suggester.suggestFromStackTrace([]);
      expect(suggestions).toEqual([]);
    });

    it("should handle malformed stack frames", () => {
      const stackTrace = [
        "invalid stack frame",
        "at myFunction (/path/to/file.js:10:5)",
      ];

      const suggestions = suggester.suggestFromStackTrace(stackTrace);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].line).toBe(10);
    });
  });

  describe("suggestForScenario", () => {
    it("should suggest breakpoints for null-pointer scenario", () => {
      const code = `
function test(obj) {
  if (obj === null) {
    return;
  }
  return obj.value;
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestForScenario(
        "null-pointer",
        testFile
      );

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("should suggest breakpoints for infinite-loop scenario", () => {
      const code = `
while (true) {
  doWork();
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestForScenario(
        "infinite-loop",
        testFile
      );

      const loopSuggestion = suggestions.find((s) => s.reason.includes("Loop"));
      expect(loopSuggestion).toBeDefined();
    });

    it("should suggest breakpoints for test-failure scenario", () => {
      const code = `
it('test', () => {
  expect(value).toBe(42);
});
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestForScenario(
        "test-failure",
        testFile
      );

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("should return empty array for unknown scenario", () => {
      const suggestions = suggester.suggestForScenario(
        "unknown-scenario",
        testFile
      );
      expect(suggestions).toEqual([]);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle files with multiple suggestion types", () => {
      const code = `
function complexFunction(data) {
  if (data === null) {
    throw new Error('Data is null');
  }
  
  for (let i = 0; i < data.length; i++) {
    try {
      process(data[i]);
    } catch (error) {
      console.error(error);
    }
  }
  
  return data;
}
`;
      fs.writeFileSync(testFile, code);

      const suggestions = suggester.suggestBreakpoints(testFile, {
        scenario: "error",
        errorMessage: "Error",
      });

      expect(suggestions.length).toBeGreaterThan(3);

      // Should have high priority suggestions
      const highPriority = suggestions.filter((s) => s.priority === "high");
      expect(highPriority.length).toBeGreaterThan(0);
    });
  });
});
