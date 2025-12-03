import { spawn, ChildProcess } from 'child_process';
import { InspectorClient } from './inspector-client';

/**
 * Test result for a single test case
 */
export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  failureMessage?: string;
  failureStack?: string;
}

/**
 * Test suite result
 */
export interface TestSuite {
  name: string;
  tests: TestCase[];
  duration?: number;
}

/**
 * Complete test execution result
 */
export interface TestExecutionResult {
  framework: 'jest' | 'mocha' | 'vitest';
  success: boolean;
  exitCode: number | null;
  suites: TestSuite[];
  stdout: string;
  stderr: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration?: number;
  wsUrl?: string;
}

/**
 * Configuration for test execution
 */
export interface TestExecutionConfig {
  framework: 'jest' | 'mocha' | 'vitest';
  testFile?: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  attachInspector?: boolean;
}

/**
 * Parse Jest JSON output
 */
export function parseJestOutput(
  stdout: string,
  stderr: string,
): Partial<TestExecutionResult> {
  const suites: TestSuite[] = [];
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;

  try {
    // Jest outputs JSON when using --json flag
    // Try to find JSON in stdout
    const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      if (result.testResults) {
        for (const testResult of result.testResults) {
          const tests: TestCase[] = [];

          if (testResult.assertionResults) {
            for (const assertion of testResult.assertionResults) {
              const test: TestCase = {
                name: assertion.fullName || assertion.title,
                status:
                  assertion.status === 'passed'
                    ? 'passed'
                    : assertion.status === 'pending'
                      ? 'skipped'
                      : 'failed',
                duration: assertion.duration,
              };

              if (assertion.status === 'failed' && assertion.failureMessages) {
                test.failureMessage = assertion.failureMessages.join('\n');
                test.failureStack = assertion.failureMessages.join('\n');
              }

              tests.push(test);

              if (test.status === 'passed') passedTests++;
              else if (test.status === 'failed') failedTests++;
              else if (test.status === 'skipped') skippedTests++;
              totalTests++;
            }
          }

          suites.push({
            name: testResult.name || 'Unknown Suite',
            tests,
            duration: testResult.perfStats?.runtime,
          });
        }
      }
    }
  } catch (error) {
    // If JSON parsing fails, try to parse text output
    // This is a fallback for when --json is not used
    const lines = stdout.split('\n');
    let currentSuite: TestSuite | null = null;

    for (const line of lines) {
      // Look for test results in text format
      if (line.includes('PASS') || line.includes('FAIL')) {
        if (currentSuite) {
          suites.push(currentSuite);
        }
        currentSuite = {
          name: line.trim(),
          tests: [],
        };
      } else if (line.includes('✓') || line.includes('✔')) {
        passedTests++;
        totalTests++;
        if (currentSuite) {
          currentSuite.tests.push({
            name: line.trim(),
            status: 'passed',
          });
        }
      } else if (line.includes('✕') || line.includes('×')) {
        failedTests++;
        totalTests++;
        if (currentSuite) {
          currentSuite.tests.push({
            name: line.trim(),
            status: 'failed',
          });
        }
      }
    }

    if (currentSuite) {
      suites.push(currentSuite);
    }
  }

  return {
    suites,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
  };
}

/**
 * Parse Mocha output
 */
export function parseMochaOutput(
  stdout: string,
  stderr: string,
): Partial<TestExecutionResult> {
  const suites: TestSuite[] = [];
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;

  try {
    // Mocha can output JSON with --reporter json
    const jsonMatch = stdout.match(/\{[\s\S]*"tests"[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      if (result.tests) {
        const suiteMap = new Map<string, TestCase[]>();

        for (const test of result.tests) {
          const suiteName = test.fullTitle?.split(' ')[0] || 'Unknown Suite';

          if (!suiteMap.has(suiteName)) {
            suiteMap.set(suiteName, []);
          }

          const testCase: TestCase = {
            name: test.title || test.fullTitle,
            status: test.pass ? 'passed' : test.pending ? 'skipped' : 'failed',
            duration: test.duration,
          };

          if (test.err) {
            testCase.failureMessage = test.err.message;
            testCase.failureStack = test.err.stack;
          }

          suiteMap.get(suiteName)!.push(testCase);

          if (testCase.status === 'passed') passedTests++;
          else if (testCase.status === 'failed') failedTests++;
          else if (testCase.status === 'skipped') skippedTests++;
          totalTests++;
        }

        for (const [name, tests] of suiteMap.entries()) {
          suites.push({ name, tests });
        }

        // Return early if we successfully parsed JSON
        return {
          suites,
          totalTests,
          passedTests,
          failedTests,
          skippedTests,
        };
      }
    }
  } catch (error) {
    // JSON parsing failed, fall through to text parsing
  }

  // Fallback to text parsing (if no JSON or JSON parsing failed)
  const lines = stdout.split('\n');

  for (const line of lines) {
    if (line.includes('passing')) {
      const match = line.match(/(\d+) passing/);
      if (match) passedTests = parseInt(match[1]);
    } else if (line.includes('failing')) {
      const match = line.match(/(\d+) failing/);
      if (match) failedTests = parseInt(match[1]);
    } else if (line.includes('pending')) {
      const match = line.match(/(\d+) pending/);
      if (match) skippedTests = parseInt(match[1]);
    }
  }

  totalTests = passedTests + failedTests + skippedTests;

  return {
    suites,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
  };
}

/**
 * Parse Vitest output
 */
export function parseVitestOutput(
  stdout: string,
  stderr: string,
): Partial<TestExecutionResult> {
  const suites: TestSuite[] = [];
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;

  try {
    // Vitest can output JSON with --reporter=json
    const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      if (result.testResults) {
        for (const testResult of result.testResults) {
          const tests: TestCase[] = [];

          if (testResult.assertionResults) {
            for (const assertion of testResult.assertionResults) {
              const test: TestCase = {
                name: assertion.fullName || assertion.title,
                status:
                  assertion.status === 'passed'
                    ? 'passed'
                    : assertion.status === 'skipped'
                      ? 'skipped'
                      : 'failed',
                duration: assertion.duration,
              };

              if (assertion.status === 'failed' && assertion.failureMessages) {
                test.failureMessage = assertion.failureMessages.join('\n');
                test.failureStack = assertion.failureMessages.join('\n');
              }

              tests.push(test);

              if (test.status === 'passed') passedTests++;
              else if (test.status === 'failed') failedTests++;
              else if (test.status === 'skipped') skippedTests++;
              totalTests++;
            }
          }

          suites.push({
            name: testResult.name || 'Unknown Suite',
            tests,
          });
        }
      }
    }
  } catch (error) {
    // Fallback to text parsing
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (line.includes('Test Files')) {
        const match = line.match(/(\d+) passed/);
        if (match) passedTests = parseInt(match[1]);
      } else if (line.includes('Tests')) {
        const match = line.match(/(\d+) passed/);
        if (match) passedTests = parseInt(match[1]);
        const failMatch = line.match(/(\d+) failed/);
        if (failMatch) failedTests = parseInt(failMatch[1]);
      }
    }

    totalTests = passedTests + failedTests + skippedTests;
  }

  return {
    suites,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
  };
}

/**
 * Execute tests with a test framework
 * Spawns the test runner with inspector attached if requested
 * Captures stdout/stderr and parses test results
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export async function executeTests(
  config: TestExecutionConfig,
): Promise<TestExecutionResult> {
  const {
    framework,
    testFile,
    args = [],
    cwd,
    timeout = 30000,
    attachInspector = false,
  } = config;

  return new Promise((resolve, reject) => {
    let command: string;
    let commandArgs: string[] = [];

    // Build command based on framework
    switch (framework) {
      case 'jest':
        command = 'npx';
        commandArgs = ['jest'];
        if (testFile) commandArgs.push(testFile);
        // Add --json for structured output
        if (!args.includes('--json')) {
          commandArgs.push('--json');
        }
        commandArgs.push(...args);
        break;

      case 'mocha':
        command = 'npx';
        commandArgs = ['mocha'];
        if (testFile) commandArgs.push(testFile);
        // Add --reporter json for structured output
        if (!args.some((arg) => arg.includes('--reporter'))) {
          commandArgs.push('--reporter', 'json');
        }
        commandArgs.push(...args);
        break;

      case 'vitest':
        command = 'npx';
        commandArgs = ['vitest'];
        if (testFile) commandArgs.push(testFile);
        // Add --reporter=json for structured output
        if (!args.some((arg) => arg.includes('--reporter'))) {
          commandArgs.push('--reporter=json');
        }
        // Add --run to prevent watch mode
        if (!args.includes('--run')) {
          commandArgs.push('--run');
        }
        commandArgs.push(...args);
        break;

      default:
        reject(new Error(`Unsupported test framework: ${framework}`));
        return;
    }

    // Add inspector flags if requested
    if (attachInspector) {
      commandArgs.unshift('--inspect-brk=0', '--enable-source-maps');
    }

    const child = spawn(command, commandArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--enable-source-maps' },
    });

    let stdout = '';
    let stderr = '';
    let wsUrl: string | undefined;
    const startTime = Date.now();

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      stdout += output;
    });

    // Capture stderr and look for inspector URL
    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderr += output;

      // Look for inspector WebSocket URL
      if (attachInspector && !wsUrl) {
        const match = output.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/);
        if (match) {
          wsUrl = match[0];
        }
      }
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      child.kill();
      reject(new Error(`Test execution timed out after ${timeout}ms`));
    }, timeout);

    // Handle process exit
    child.on('exit', (code: number | null) => {
      clearTimeout(timeoutHandle);
      const duration = Date.now() - startTime;

      // Parse output based on framework
      let parsed: Partial<TestExecutionResult>;
      switch (framework) {
        case 'jest':
          parsed = parseJestOutput(stdout, stderr);
          break;
        case 'mocha':
          parsed = parseMochaOutput(stdout, stderr);
          break;
        case 'vitest':
          parsed = parseVitestOutput(stdout, stderr);
          break;
        default:
          parsed = {};
      }

      const result: TestExecutionResult = {
        framework,
        success: code === 0,
        exitCode: code,
        suites: parsed.suites || [],
        stdout,
        stderr,
        totalTests: parsed.totalTests || 0,
        passedTests: parsed.passedTests || 0,
        failedTests: parsed.failedTests || 0,
        skippedTests: parsed.skippedTests || 0,
        duration,
        wsUrl,
      };

      resolve(result);
    });

    // Handle spawn errors
    child.on('error', (error: Error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}
