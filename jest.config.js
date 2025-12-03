/* eslint-disable */
const { readFileSync } = require("fs");

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, "utf-8")
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: "@ai-capabilities-suite/mcp-core",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", swcJestConfig],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  coverageDirectory: "test-output/jest/coverage",
  // Explicitly disable babel
  transformIgnorePatterns: [],
  // Timeout and resource management for coverage runs
  testTimeout: 60000, // 60 seconds per test (increased for coverage runs)
  maxWorkers: 1, // Run tests serially to prevent resource exhaustion
  // Force exit after tests complete to prevent hanging
  forceExit: true,
  // Detect open handles that might cause hanging
  detectOpenHandles: false, // Disabled to prevent noise in output
  // Bail after first failure to save time
  bail: false,
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/test-utils/**",
  ],
  coverageThreshold: {
    global: {
      lines: 90,
      branches: 85,
      functions: 90,
      statements: 90,
    },
  },
  coverageReporters: ["text", "lcov", "json-summary", "html"],
};
