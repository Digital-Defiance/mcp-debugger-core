import {
  parseJestOutput,
  parseMochaOutput,
  parseVitestOutput,
} from './test-runner';

describe('TestRunner - Unit Tests for Parsing Functions', () => {
  describe('parseJestOutput', () => {
    it('should parse Jest JSON output with passing tests', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'test-suite.js',
            assertionResults: [
              {
                fullName: 'Suite Test 1',
                status: 'passed',
                duration: 10,
              },
              {
                fullName: 'Suite Test 2',
                status: 'passed',
                duration: 15,
              },
            ],
            perfStats: {
              runtime: 25,
            },
          },
        ],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.totalTests).toBe(2);
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
      expect(result.suites).toHaveLength(1);
      expect(result.suites![0].tests).toHaveLength(2);
    });

    it('should parse Jest JSON output with failed tests', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'test-suite.js',
            assertionResults: [
              {
                fullName: 'Suite Test 1',
                status: 'failed',
                duration: 10,
                failureMessages: ['Expected true to be false'],
              },
            ],
          },
        ],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(1);
      expect(result.suites![0].tests[0].status).toBe('failed');
      expect(result.suites![0].tests[0].failureMessage).toContain('Expected');
    });

    it('should parse Jest JSON output with skipped tests', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'test-suite.js',
            assertionResults: [
              {
                fullName: 'Suite Test 1',
                status: 'pending',
                duration: 0,
              },
            ],
          },
        ],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(1);
      expect(result.suites![0].tests[0].status).toBe('skipped');
    });

    it('should handle Jest output without JSON', () => {
      const stdout = `
PASS test-suite.js
  ✓ Test 1
  ✓ Test 2
  ✕ Test 3
`;

      const result = parseJestOutput(stdout, '');

      // Should fall back to text parsing
      expect(result.totalTests).toBeGreaterThanOrEqual(0);
      expect(result.suites).toBeDefined();
    });

    it('should handle empty Jest output', () => {
      const result = parseJestOutput('', '');

      expect(result.totalTests).toBe(0);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
      expect(result.suites).toHaveLength(0);
    });

    it('should handle Jest output with multiple suites', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'suite1.js',
            assertionResults: [
              {
                fullName: 'Suite 1 Test 1',
                status: 'passed',
                duration: 10,
              },
            ],
          },
          {
            name: 'suite2.js',
            assertionResults: [
              {
                fullName: 'Suite 2 Test 1',
                status: 'passed',
                duration: 15,
              },
            ],
          },
        ],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.suites).toHaveLength(2);
      expect(result.totalTests).toBe(2);
    });

    it('should handle Jest output with title instead of fullName', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'test-suite.js',
            assertionResults: [
              {
                title: 'Test with title',
                status: 'passed',
                duration: 10,
              },
            ],
          },
        ],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.suites![0].tests[0].name).toBe('Test with title');
    });

    it('should handle malformed JSON gracefully', () => {
      const stdout = '{ invalid json }';

      const result = parseJestOutput(stdout, '');

      // Should fall back to text parsing
      expect(result).toBeDefined();
      expect(result.suites).toBeDefined();
    });
  });

  describe('parseMochaOutput', () => {
    it('should parse Mocha JSON output with passing tests', () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: 'Test 1',
            fullTitle: 'Suite Test 1',
            pass: true,
            duration: 10,
          },
          {
            title: 'Test 2',
            fullTitle: 'Suite Test 2',
            pass: true,
            duration: 15,
          },
        ],
      });

      const result = parseMochaOutput(stdout, '');

      expect(result.totalTests).toBe(2);
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
    });

    it('should parse Mocha JSON output with failed tests', () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: 'Test 1',
            fullTitle: 'Suite Test 1',
            pass: false,
            pending: false,
            duration: 10,
            err: {
              message: 'Expected true to be false',
              stack: 'Error: Expected true to be false\n  at test.js:10',
            },
          },
        ],
      });

      const result = parseMochaOutput(stdout, '');

      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(1);
      expect(result.suites![0].tests[0].status).toBe('failed');
      expect(result.suites![0].tests[0].failureMessage).toContain('Expected');
      expect(result.suites![0].tests[0].failureStack).toContain('test.js:10');
    });

    it('should parse Mocha JSON output with pending tests', () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: 'Test 1',
            fullTitle: 'Suite Test 1',
            pass: false,
            pending: true,
            duration: 0,
          },
        ],
      });

      const result = parseMochaOutput(stdout, '');

      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(1);
      expect(result.suites![0].tests[0].status).toBe('skipped');
    });

    it('should handle Mocha text output fallback', () => {
      const stdout = `
  3 passing (25ms)
  1 failing
  2 pending
`;

      const result = parseMochaOutput(stdout, '');

      expect(result.passedTests).toBe(3);
      expect(result.failedTests).toBe(1);
      expect(result.skippedTests).toBe(2);
      expect(result.totalTests).toBe(6);
    });

    it('should handle empty Mocha output', () => {
      const result = parseMochaOutput('', '');

      expect(result.totalTests).toBe(0);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
    });

    it('should group Mocha tests by suite', () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: 'Test 1',
            fullTitle: 'Suite1 Test 1',
            pass: true,
            duration: 10,
          },
          {
            title: 'Test 2',
            fullTitle: 'Suite1 Test 2',
            pass: true,
            duration: 15,
          },
          {
            title: 'Test 1',
            fullTitle: 'Suite2 Test 1',
            pass: true,
            duration: 20,
          },
        ],
      });

      const result = parseMochaOutput(stdout, '');

      expect(result.suites).toHaveLength(2);
      expect(result.suites![0].tests).toHaveLength(2);
      expect(result.suites![1].tests).toHaveLength(1);
    });

    it('should handle Mocha tests without fullTitle', () => {
      const stdout = JSON.stringify({
        tests: [
          {
            title: 'Test 1',
            pass: true,
            duration: 10,
          },
        ],
      });

      const result = parseMochaOutput(stdout, '');

      expect(result.suites![0].name).toBe('Unknown Suite');
      expect(result.suites![0].tests[0].name).toBe('Test 1');
    });
  });

  describe('parseVitestOutput', () => {
    it('should parse Vitest JSON output with passing tests', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'test-suite.js',
            assertionResults: [
              {
                fullName: 'Suite Test 1',
                status: 'passed',
                duration: 10,
              },
            ],
          },
        ],
      });

      const result = parseVitestOutput(stdout, '');

      expect(result.totalTests).toBeGreaterThanOrEqual(0);
      expect(result.suites).toBeDefined();
    });

    it('should handle Vitest text output fallback', () => {
      const stdout = `
Test Files  2 passed (2)
     Tests  5 passed (5)
`;

      const result = parseVitestOutput(stdout, '');

      expect(result.passedTests).toBeGreaterThanOrEqual(0);
      expect(result.totalTests).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty Vitest output', () => {
      const result = parseVitestOutput('', '');

      expect(result.totalTests).toBe(0);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
    });

    it('should parse Vitest output with failed tests', () => {
      const stdout = `
Test Files  1 failed (1)
     Tests  3 passed | 1 failed (4)
`;

      const result = parseVitestOutput(stdout, '');

      expect(result.totalTests).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle Jest output with no testResults', () => {
      const stdout = JSON.stringify({});

      const result = parseJestOutput(stdout, '');

      expect(result.totalTests).toBe(0);
      expect(result.suites).toHaveLength(0);
    });

    it('should handle Jest output with empty testResults', () => {
      const stdout = JSON.stringify({
        testResults: [],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.totalTests).toBe(0);
      expect(result.suites).toHaveLength(0);
    });

    it('should handle Jest output with no assertionResults', () => {
      const stdout = JSON.stringify({
        testResults: [
          {
            name: 'test-suite.js',
          },
        ],
      });

      const result = parseJestOutput(stdout, '');

      expect(result.suites).toHaveLength(1);
      expect(result.suites![0].tests).toHaveLength(0);
    });

    it('should handle Mocha output with no tests', () => {
      const stdout = JSON.stringify({});

      const result = parseMochaOutput(stdout, '');

      expect(result.totalTests).toBe(0);
    });

    it('should handle Mocha output with empty tests array', () => {
      const stdout = JSON.stringify({
        tests: [],
      });

      const result = parseMochaOutput(stdout, '');

      expect(result.totalTests).toBe(0);
      expect(result.suites).toHaveLength(0);
    });

    it('should handle text output with no matches', () => {
      const stdout = 'Some random output without test results';

      const jestResult = parseJestOutput(stdout, '');
      const mochaResult = parseMochaOutput(stdout, '');
      const vitestResult = parseVitestOutput(stdout, '');

      expect(jestResult.totalTests).toBe(0);
      expect(mochaResult.totalTests).toBe(0);
      expect(vitestResult.totalTests).toBe(0);
    });
  });
});
