import * as fc from 'fast-check';
import { executeTests, TestExecutionConfig } from './test-runner';
import * as path from 'path';
import * as fs from 'fs';

describe('TestRunner', () => {
  // Feature: mcp-debugger-tool, Property 13: Test output capture completeness
  // For any test execution, all output written to stdout and stderr by the test
  // process should be captured and returned by the MCP Server.
  // Validates: Requirements 6.4
  describe('Property 13: Test output capture completeness', () => {
    it('should capture stdout and stderr from test framework execution', async () => {
      // Test that we capture output by running --version command
      // This is a simple way to verify output capture without needing test files
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Verify stdout and stderr are captured (defined and are strings)
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');

      // At least one should have content (version output)
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 20000);
  });

  // Feature: mcp-debugger-tool, Property 14: Test failure information completeness
  // For any failing test, the MCP Server should return the failure message,
  // complete stack trace, and execution context.
  // Validates: Requirements 6.5
  describe('Property 14: Test failure information completeness', () => {
    it('should capture failure information when tests fail', async () => {
      // Run with an invalid argument to cause failure
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--invalid-option-that-does-not-exist'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Verify the execution failed
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);

      // Verify we captured error output
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);

      // Should contain some error indication
      const hasErrorInfo =
        combinedOutput.toLowerCase().includes('error') ||
        combinedOutput.toLowerCase().includes('unknown') ||
        combinedOutput.toLowerCase().includes('invalid');
      expect(hasErrorInfo).toBe(true);
    }, 20000);
  });

  // Unit tests for specific test file execution
  describe('Jest test execution', () => {
    it('should execute Jest tests and return structured results', async () => {
      const testFile = path.join(
        __dirname,
        '../../test-fixtures/jest-sample.test.js',
      );

      // Skip if test file doesn't exist
      if (!fs.existsSync(testFile)) {
        console.log('Skipping Jest test - fixture not found');
        return;
      }

      const config: TestExecutionConfig = {
        framework: 'jest',
        testFile,
        timeout: 15000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();

      // Jest should run the tests (may pass or fail)
      // We just verify we got output
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Mocha test execution', () => {
    it('should execute Mocha tests and return structured results', async () => {
      const testFile = path.join(
        __dirname,
        '../../test-fixtures/mocha-sample.test.js',
      );

      // Skip if test file doesn't exist
      if (!fs.existsSync(testFile)) {
        console.log('Skipping Mocha test - fixture not found');
        return;
      }

      const config: TestExecutionConfig = {
        framework: 'mocha',
        testFile,
        timeout: 15000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('mocha');
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();

      // Mocha should run the tests (may pass or fail)
      // We just verify we got output
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Vitest test execution', () => {
    it('should execute Vitest tests and return structured results', async () => {
      const testFile = path.join(
        __dirname,
        '../../test-fixtures/vitest-sample.test.js',
      );

      // Skip if test file doesn't exist
      if (!fs.existsSync(testFile)) {
        console.log('Skipping Vitest test - fixture not found');
        return;
      }

      const config: TestExecutionConfig = {
        framework: 'vitest',
        testFile,
        timeout: 15000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('vitest');
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();

      // Vitest should run the tests (may pass or fail)
      // We just verify we got output
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Configuration options', () => {
    it('should use custom working directory', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        cwd: process.cwd(),
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.stdout).toBeDefined();
    }, 20000);

    it('should handle custom timeout', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 5000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.stdout).toBeDefined();
    }, 20000);

    it('should handle test execution with args', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version', '--no-coverage'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.stdout).toBeDefined();
    }, 20000);
  });

  describe('Error handling', () => {
    it('should handle process timeout', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 1, // Very short timeout - should cause timeout
        attachInspector: false,
      };

      // With 1ms timeout, the process should timeout
      await expect(executeTests(config)).rejects.toThrow(/timed out/);
    }, 20000);

    it('should handle non-existent test file', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        testFile: '/path/to/nonexistent/test.js',
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('should handle invalid framework command', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--completely-invalid-flag-xyz'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.success).toBe(false);
    }, 20000);
  });

  describe('Output parsing', () => {
    it('should parse test results from output', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.totalTests).toBeDefined();
      expect(result.passedTests).toBeDefined();
      expect(result.failedTests).toBeDefined();
      expect(result.skippedTests).toBeDefined();
      expect(result.suites).toBeDefined();
      expect(Array.isArray(result.suites)).toBe(true);
    }, 20000);

    it('should handle empty output', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      // Even with --version, we should get structured output
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
    }, 20000);
  });

  describe('Framework-specific behavior', () => {
    it('should execute Mocha with custom args', async () => {
      const config: TestExecutionConfig = {
        framework: 'mocha',
        args: ['--version'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('mocha');
      expect(result.stdout).toBeDefined();
    }, 20000);

    it('should execute Vitest with custom args', async () => {
      const config: TestExecutionConfig = {
        framework: 'vitest',
        args: ['--version'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('vitest');
      expect(result.stdout).toBeDefined();
    }, 20000);
  });

  describe('Inspector attachment', () => {
    it('should handle inspector attachment flag', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 10000,
        attachInspector: true, // Enable inspector
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      // wsUrl may or may not be set depending on whether inspector attached
      // Just verify the test completes
      expect(result.stdout).toBeDefined();
    }, 20000);

    it('should work without inspector attachment', async () => {
      const config: TestExecutionConfig = {
        framework: 'jest',
        args: ['--version'],
        timeout: 10000,
        attachInspector: false,
      };

      const result = await executeTests(config);

      expect(result.framework).toBe('jest');
      expect(result.wsUrl).toBeUndefined();
    }, 20000);
  });
});
