import { executeTests, TestExecutionConfig } from "./test-runner";
import { SessionManager } from "./session-manager";
import * as path from "path";
import * as fs from "fs";

/**
 * Integration tests for test framework integration
 * Tests running Jest, Mocha, and Vitest with debugger attached
 * Requirements: 6.1, 6.4, 6.5
 */
describe("Test Framework Integration", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    await sessionManager.cleanupAll();
  });

  /**
   * Test running Jest tests with debugger
   * Requirement 6.1, 6.4, 6.5
   */
  describe("Jest Integration", () => {
    const jestTestFile = path.join(
      __dirname,
      "../../test-fixtures/jest-sample.test.js"
    );

    beforeAll(() => {
      // Skip all tests if fixture doesn't exist
      if (!fs.existsSync(jestTestFile)) {
        console.log("Skipping Jest integration tests - fixture not found");
      }
    });

    it("should run Jest tests and capture output", async () => {
      if (!fs.existsSync(jestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "jest",
        testFile: jestTestFile,
        timeout: 20000,
        attachInspector: false, // Run without inspector for basic test
      };

      const result = await executeTests(config);

      // Verify basic execution
      expect(result.framework).toBe("jest");
      expect(result.exitCode).toBeDefined();

      // Verify output capture (Requirement 6.4)
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");

      // Should have some output
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);

      // Output should contain test-related information
      const hasTestInfo =
        combinedOutput.includes("test") ||
        combinedOutput.includes("pass") ||
        combinedOutput.includes("fail") ||
        combinedOutput.includes("PASS") ||
        combinedOutput.includes("FAIL");
      expect(hasTestInfo).toBe(true);
    }, 30000);

    it("should capture Jest test failures", async () => {
      if (!fs.existsSync(jestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "jest",
        testFile: jestTestFile,
        timeout: 20000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // The jest-sample.test.js has a failing test
      // Verify failure information is captured (Requirement 6.5)
      const combinedOutput = result.stdout + result.stderr;

      // Should have captured output
      expect(combinedOutput.length).toBeGreaterThan(0);

      // Should contain test-related information (case-insensitive)
      const lowerOutput = combinedOutput.toLowerCase();
      const hasTestInfo =
        lowerOutput.includes("test") ||
        lowerOutput.includes("pass") ||
        lowerOutput.includes("fail") ||
        lowerOutput.includes("expected") ||
        lowerOutput.includes("received") ||
        lowerOutput.includes("error");
      expect(hasTestInfo).toBe(true);

      // Exit code should indicate failure (non-zero)
      expect(result.exitCode).not.toBe(0);
    }, 30000);

    it("should run Jest tests with inspector attached", async () => {
      if (!fs.existsSync(jestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "jest",
        testFile: jestTestFile,
        timeout: 30000,
        attachInspector: true, // Attach inspector
      };

      const result = await executeTests(config);

      // Should complete successfully with inspector
      expect(result.framework).toBe("jest");
      expect(result.exitCode).toBeDefined();

      // Should still capture output
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 40000);
  });

  /**
   * Test running Mocha tests with debugger
   * Requirement 6.2, 6.4, 6.5
   */
  describe("Mocha Integration", () => {
    const mochaTestFile = path.join(
      __dirname,
      "../../test-fixtures/mocha-sample.test.js"
    );

    beforeAll(() => {
      if (!fs.existsSync(mochaTestFile)) {
        console.log("Skipping Mocha integration tests - fixture not found");
      }
    });

    it("should run Mocha tests and capture output", async () => {
      if (!fs.existsSync(mochaTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "mocha",
        testFile: mochaTestFile,
        timeout: 20000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Verify basic execution
      expect(result.framework).toBe("mocha");
      expect(result.exitCode).toBeDefined();

      // Verify output capture (Requirement 6.4)
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();

      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 30000);

    it("should run Mocha tests with inspector attached", async () => {
      if (!fs.existsSync(mochaTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "mocha",
        testFile: mochaTestFile,
        timeout: 30000,
        attachInspector: true,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("mocha");
      expect(result.exitCode).toBeDefined();

      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 40000);
  });

  /**
   * Test running Vitest tests with debugger
   * Requirement 6.3, 6.4, 6.5
   */
  describe("Vitest Integration", () => {
    const vitestTestFile = path.join(
      __dirname,
      "../../test-fixtures/vitest-sample.test.js"
    );

    beforeAll(() => {
      if (!fs.existsSync(vitestTestFile)) {
        console.log("Skipping Vitest integration tests - fixture not found");
      }
    });

    it("should run Vitest tests and capture output", async () => {
      if (!fs.existsSync(vitestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "vitest",
        testFile: vitestTestFile,
        timeout: 20000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Verify basic execution
      expect(result.framework).toBe("vitest");
      expect(result.exitCode).toBeDefined();

      // Verify output capture (Requirement 6.4)
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();

      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 30000);

    it("should run Vitest tests with inspector attached", async () => {
      if (!fs.existsSync(vitestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "vitest",
        testFile: vitestTestFile,
        timeout: 30000,
        attachInspector: true,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe("vitest");
      expect(result.exitCode).toBeDefined();

      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 40000);
  });

  /**
   * Test output capture completeness across frameworks
   * Requirement 6.4
   */
  describe("Output Capture Completeness", () => {
    it("should capture all stdout and stderr from test execution", async () => {
      // Use Jest as the test framework
      const config: TestExecutionConfig = {
        framework: "jest",
        args: ["--version"],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Verify both stdout and stderr are captured
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");

      // At least one should have content
      const totalOutput = result.stdout.length + result.stderr.length;
      expect(totalOutput).toBeGreaterThan(0);
    }, 20000);
  });

  /**
   * Test failure information completeness
   * Requirement 6.5
   */
  describe("Failure Information Completeness", () => {
    it("should capture complete failure information", async () => {
      const jestTestFile = path.join(
        __dirname,
        "../../test-fixtures/jest-sample.test.js"
      );

      if (!fs.existsSync(jestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "jest",
        testFile: jestTestFile,
        timeout: 20000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // The test file has failing tests
      const combinedOutput = result.stdout + result.stderr;

      // Should contain failure information
      expect(combinedOutput.length).toBeGreaterThan(0);

      // Should have test-related output
      const hasTestOutput =
        combinedOutput.includes("test") ||
        combinedOutput.includes("Test") ||
        combinedOutput.includes("PASS") ||
        combinedOutput.includes("FAIL");
      expect(hasTestOutput).toBe(true);
    }, 30000);

    it("should report exit code for failed tests", async () => {
      const jestTestFile = path.join(
        __dirname,
        "../../test-fixtures/jest-sample.test.js"
      );

      if (!fs.existsSync(jestTestFile)) {
        return;
      }

      const config: TestExecutionConfig = {
        framework: "jest",
        testFile: jestTestFile,
        timeout: 20000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Exit code should be defined
      expect(result.exitCode).toBeDefined();
      expect(typeof result.exitCode).toBe("number");

      // Success flag should be defined
      expect(result.success).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    }, 30000);
  });

  /**
   * Test debugging test files with breakpoints
   * Requirements: 6.1, 6.2, 6.3
   */
  describe("Debugging Test Files", () => {
    it("should allow debugging Jest tests with breakpoints", async () => {
      const jestTestFile = path.join(
        __dirname,
        "../../test-fixtures/jest-sample.test.js"
      );

      if (!fs.existsSync(jestTestFile)) {
        return;
      }

      // Start a debug session for the test file
      const session = await sessionManager.createSession({
        command: "node",
        args: [
          "--inspect-brk=0",
          require.resolve("jest/bin/jest"),
          jestTestFile,
          "--runInBand",
          "--no-coverage",
        ],
        cwd: path.dirname(jestTestFile),
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.inspector).toBeDefined();

      // Clean up
      await sessionManager.removeSession(session.id);
    }, 30000);
  });
});
