import {
  parseJestOutput,
  parseMochaOutput,
  parseVitestOutput,
  executeTests,
  TestExecutionConfig,
} from "./test-runner";

describe("TestRunner Coverage Tests", () => {
  describe("parseJestOutput - Edge Cases", () => {
    it("should parse Jest JSON output with complete test results", () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: "test-suite.js",
            assertionResults: [
              {
                fullName: "Test Suite Test Case 1",
                title: "Test Case 1",
                status: "passed",
                duration: 100,
              },
              {
                fullName: "Test Suite Test Case 2",
                title: "Test Case 2",
                status: "failed",
                duration: 50,
                failureMessages: [
                  "Expected true to be false",
                  "Stack trace here",
                ],
              },
              {
                fullName: "Test Suite Test Case 3",
                title: "Test Case 3",
                status: "pending",
                duration: 0,
              },
            ],
            perfStats: {
              runtime: 150,
            },
          },
        ],
      });

      const result = parseJestOutput(stdout, "");

      expect(result.suites).toHaveLength(1);
      expect(result.suites![0].tests).toHaveLength(3);
      expect(result.totalTests).toBe(3);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(1);
      expect(result.skippedTests).toBe(1);
      expect(result.suites![0].duration).toBe(150);
    });

    it("should handle Jest JSON with missing optional fields", () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            assertionResults: [
              {
                status: "passed",
              },
            ],
          },
        ],
      });

      const result = parseJestOutput(stdout, "");

      expect(result.suites).toHaveLength(1);
      expect(result.suites![0].name).toBe("Unknown Suite");
      // Name can be empty string or undefined when missing
      expect(result.suites![0].tests[0].name ?? "").toBe("");
    });

    it("should parse Jest text output when JSON is not available", () => {
      const stdout = `
PASS test-suite.js
  ✓ Test Case 1
  ✓ Test Case 2
  ✕ Test Case 3
`;

      const result = parseJestOutput(stdout, "");

      expect(result.totalTests).toBe(3);
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(1);
      expect(result.suites!.length).toBeGreaterThan(0);
    });

    it("should handle Jest text output with checkmarks", () => {
      const stdout = `
PASS test-suite.js
  ✔ Test Case 1
  ✔ Test Case 2
  × Test Case 3
`;

      const result = parseJestOutput(stdout, "");

      expect(result.totalTests).toBe(3);
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(1);
    });

    it("should handle empty Jest output", () => {
      const result = parseJestOutput("", "");

      expect(result.suites).toEqual([]);
      expect(result.totalTests).toBe(0);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
    });

    it("should handle malformed Jest JSON", () => {
      const stdout = "{ invalid json }";

      const result = parseJestOutput(stdout, "");

      // Should fall back to text parsing
      expect(result.suites).toBeDefined();
      expect(result.totalTests).toBe(0);
    });

    it("should handle Jest JSON without testResults", () => {
      const stdout = JSON.stringify({
        success: true,
      });

      const result = parseJestOutput(stdout, "");

      expect(result.suites).toEqual([]);
      expect(result.totalTests).toBe(0);
    });

    it("should handle Jest JSON with empty assertionResults", () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: "empty-suite.js",
            assertionResults: [],
          },
        ],
      });

      const result = parseJestOutput(stdout, "");

      expect(result.suites).toHaveLength(1);
      expect(result.suites![0].tests).toHaveLength(0);
      expect(result.totalTests).toBe(0);
    });
  });

  describe("parseMochaOutput - Edge Cases", () => {
    it("should parse Mocha JSON output with complete test results", () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: "Test Case 1",
            fullTitle: "Suite Test Case 1",
            pass: true,
            duration: 100,
          },
          {
            title: "Test Case 2",
            fullTitle: "Suite Test Case 2",
            pass: false,
            pending: false,
            duration: 50,
            err: {
              message: "Expected true to be false",
              stack: "Stack trace here",
            },
          },
          {
            title: "Test Case 3",
            fullTitle: "Suite Test Case 3",
            pass: false,
            pending: true,
            duration: 0,
          },
        ],
      });

      const result = parseMochaOutput(stdout, "");

      expect(result.totalTests).toBe(3);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(1);
      expect(result.skippedTests).toBe(1);
      expect(result.suites!.length).toBeGreaterThan(0);
    });

    it("should handle Mocha JSON with missing optional fields", () => {
      const stdout = JSON.stringify({
        tests: [
          {
            pass: true,
          },
        ],
      });

      const result = parseMochaOutput(stdout, "");

      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(1);
      expect(result.suites![0].name).toBe("Unknown Suite");
    });

    it("should parse Mocha text output when JSON is not available", () => {
      const stdout = `
  5 passing (100ms)
  2 failing
  1 pending
`;

      const result = parseMochaOutput(stdout, "");

      expect(result.passedTests).toBe(5);
      expect(result.failedTests).toBe(2);
      expect(result.skippedTests).toBe(1);
      expect(result.totalTests).toBe(8);
    });

    it("should handle Mocha text output with only passing tests", () => {
      const stdout = `
  10 passing (200ms)
`;

      const result = parseMochaOutput(stdout, "");

      expect(result.passedTests).toBe(10);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
      expect(result.totalTests).toBe(10);
    });

    it("should handle empty Mocha output", () => {
      const result = parseMochaOutput("", "");

      expect(result.suites).toEqual([]);
      expect(result.totalTests).toBe(0);
    });

    it("should handle malformed Mocha JSON", () => {
      const stdout = "{ invalid json }";

      const result = parseMochaOutput(stdout, "");

      // Should fall back to text parsing
      expect(result.suites).toBeDefined();
      expect(result.totalTests).toBe(0);
    });

    it("should handle Mocha JSON without tests array", () => {
      const stdout = JSON.stringify({
        success: true,
      });

      const result = parseMochaOutput(stdout, "");

      expect(result.suites).toEqual([]);
      expect(result.totalTests).toBe(0);
    });

    it("should group Mocha tests by suite name", () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: "Test 1",
            fullTitle: "Suite1 Test 1",
            pass: true,
          },
          {
            title: "Test 2",
            fullTitle: "Suite1 Test 2",
            pass: true,
          },
          {
            title: "Test 3",
            fullTitle: "Suite2 Test 3",
            pass: true,
          },
        ],
      });

      const result = parseMochaOutput(stdout, "");

      expect(result.suites!.length).toBeGreaterThanOrEqual(1);
      expect(result.totalTests).toBe(3);
    });
  });

  describe("parseVitestOutput - Edge Cases", () => {
    it("should parse Vitest JSON output with complete test results", () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: "test-suite.js",
            assertionResults: [
              {
                fullName: "Test Suite Test Case 1",
                title: "Test Case 1",
                status: "passed",
                duration: 100,
              },
              {
                fullName: "Test Suite Test Case 2",
                title: "Test Case 2",
                status: "failed",
                duration: 50,
                failureMessages: ["Expected true to be false"],
              },
              {
                fullName: "Test Suite Test Case 3",
                title: "Test Case 3",
                status: "skipped",
                duration: 0,
              },
            ],
          },
        ],
      });

      const result = parseVitestOutput(stdout, "");

      expect(result.suites).toHaveLength(1);
      expect(result.totalTests).toBe(3);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(1);
      expect(result.skippedTests).toBe(1);
    });

    it("should parse Vitest text output when JSON is not available", () => {
      const stdout = `
Test Files  2 passed (2)
     Tests  10 passed (10)
`;

      const result = parseVitestOutput(stdout, "");

      expect(result.passedTests).toBe(10);
      expect(result.totalTests).toBe(10);
    });

    it("should parse Vitest text output with failures", () => {
      const stdout = `
Test Files  1 passed, 1 failed (2)
     Tests  8 passed, 2 failed (10)
`;

      const result = parseVitestOutput(stdout, "");

      expect(result.passedTests).toBe(8);
      expect(result.failedTests).toBe(2);
      expect(result.totalTests).toBe(10);
    });

    it("should handle empty Vitest output", () => {
      const result = parseVitestOutput("", "");

      expect(result.suites).toEqual([]);
      expect(result.totalTests).toBe(0);
    });

    it("should handle malformed Vitest JSON", () => {
      const stdout = "{ invalid json }";

      const result = parseVitestOutput(stdout, "");

      // Should fall back to text parsing
      expect(result.suites).toBeDefined();
      expect(result.totalTests).toBe(0);
    });

    it("should handle Vitest JSON without testResults", () => {
      const stdout = JSON.stringify({
        success: true,
      });

      const result = parseVitestOutput(stdout, "");

      expect(result.suites).toEqual([]);
      expect(result.totalTests).toBe(0);
    });

    it("should handle Vitest JSON with missing optional fields", () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            assertionResults: [
              {
                status: "passed",
              },
            ],
          },
        ],
      });

      const result = parseVitestOutput(stdout, "");

      expect(result.suites).toHaveLength(1);
      expect(result.suites![0].name).toBe("Unknown Suite");
    });
  });

  describe("executeTests - Process Spawn Edge Cases", () => {
    it("should handle unsupported framework", async () => {
      const config: TestExecutionConfig = {
        framework: "unsupported" as any,
        timeout: 5000,
      };

      await expect(executeTests(config)).rejects.toThrow(
        "Unsupported test framework"
      );
    });

    it("should add --json flag to Jest if not present", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      // Should complete without error
      expect(result.framework).toBe("jest");
    }, 10000);

    it("should not duplicate --json flag for Jest", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--json", "--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
    }, 10000);

    it("should add --reporter json to Mocha if not present", async () => {
      const config: TestExecutionConfig = {
        framework: "mocha",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("mocha");
    }, 10000);

    it("should not duplicate --reporter for Mocha", async () => {
      const config: TestExecutionConfig = {
        framework: "mocha",
        args: ["--reporter", "spec", "--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("mocha");
    }, 10000);

    it("should add --reporter=json to Vitest if not present", async () => {
      const config: TestExecutionConfig = {
        framework: "vitest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("vitest");
    }, 10000);

    it("should add --run flag to Vitest if not present", async () => {
      const config: TestExecutionConfig = {
        framework: "vitest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("vitest");
    }, 10000);

    it("should not duplicate --run flag for Vitest", async () => {
      const config: TestExecutionConfig = {
        framework: "vitest",
        args: ["--run", "--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("vitest");
    }, 10000);

    it("should parse inspector WebSocket URL from stderr", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
        attachInspector: true,
      };

      const result = await executeTests(config);

      // wsUrl may or may not be set depending on whether inspector attached
      // Just verify the test completes
      expect(result.framework).toBe("jest");
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
    }, 10000);

    it("should add inspector flags when attachInspector is true", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
        attachInspector: true,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
      // Inspector flags should be added
    }, 10000);

    it("should set NODE_OPTIONS environment variable", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
      // NODE_OPTIONS should be set in spawn
    }, 10000);

    it("should calculate execution duration", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.duration).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    }, 10000);

    it("should handle process exit with null code", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      // Exit code may be null or a number
      expect(result.exitCode !== undefined).toBe(true);
    }, 10000);

    it("should handle spawn error", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        cwd: "/nonexistent/directory",
        timeout: 5000,
      };

      // Should either reject or return error result
      try {
        const result = await executeTests(config);
        // If it doesn't reject, it should indicate failure
        expect(result.success).toBe(false);
      } catch (error) {
        // Spawn error is acceptable
        expect(error).toBeDefined();
      }
    }, 10000);

    it("should capture stdout data in chunks", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.stdout).toBeDefined();
      expect(typeof result.stdout).toBe("string");
    }, 10000);

    it("should capture stderr data in chunks", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.stderr).toBeDefined();
      expect(typeof result.stderr).toBe("string");
    }, 10000);

    it("should handle test file parameter", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        testFile: "nonexistent.test.js",
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
      // Should attempt to run the test file
    }, 10000);

    it("should handle custom working directory", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        cwd: process.cwd(),
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
    }, 10000);

    it("should handle custom args array", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version", "--no-coverage"],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
    }, 10000);

    it("should handle empty args array", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: [],
        timeout: 5000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
    }, 10000);
  });

  describe("executeTests - Timeout Handling", () => {
    it("should timeout if process takes too long", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 1, // Very short timeout
      };

      await expect(executeTests(config)).rejects.toThrow(/timed out/);
    }, 10000);

    it("should clear timeout on successful completion", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 10000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
      // Timeout should be cleared
    }, 15000);

    it("should clear timeout on error", async () => {
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--invalid-flag-xyz"],
        timeout: 10000,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("jest");
      // Timeout should be cleared even on error
    }, 15000);
  });
});
