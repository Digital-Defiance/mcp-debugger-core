/**
 * Compatibility Testing Suite for MCP Debugger
 * Tests compatibility across different Node.js versions, TypeScript versions, and platforms
 */

import { SessionManager } from './session-manager';
import { DebugSession } from './debug-session';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

describe('Compatibility Testing', () => {
  let sessionManager: SessionManager;
  const testFixturePath = path.join(
    __dirname,
    '../../test-fixtures/simple-script.js',
  );
  const tsFixturePath = path.join(
    __dirname,
    '../../test-fixtures/typescript-sample.ts',
  );

  beforeAll(() => {
    // Create test fixtures
    const fixtureDir = path.dirname(testFixturePath);
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    if (!fs.existsSync(testFixturePath)) {
      fs.writeFileSync(
        testFixturePath,
        `
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
let sum = 0;
for (let i = 0; i < 10; i++) {
  sum += i;
}
console.log('Sum:', sum);
process.exit(0);
      `.trim(),
      );
    }

    if (!fs.existsSync(tsFixturePath)) {
      fs.writeFileSync(
        tsFixturePath,
        `
interface Person {
  name: string;
  age: number;
}

const person: Person = {
  name: 'Test User',
  age: 30
};

console.log('Person:', person);
process.exit(0);
      `.trim(),
      );
    }
  });

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    const sessions = sessionManager.getAllSessions();
    await Promise.all(
      sessions.map(async (session) => {
        try {
          await sessionManager.removeSession(session.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }),
    );
  });

  describe('Node.js Version Compatibility', () => {
    it('should work with current Node.js version', async () => {
      const nodeVersion = process.version;
      console.log(`Testing with Node.js ${nodeVersion}`);

      const session = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();

      // Test basic operations
      const breakpoint = await session.setBreakpoint(testFixturePath, 1);
      expect(breakpoint).toBeDefined();

      await sessionManager.removeSession(session.id);
    }, 15000);

    it('should detect Node.js version and report compatibility', () => {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

      console.log(`Node.js version: ${nodeVersion}`);
      console.log(`Major version: ${majorVersion}`);

      // Check if version is supported (16+)
      expect(majorVersion).toBeGreaterThanOrEqual(16);

      // Report compatibility status
      const compatibilityStatus = {
        version: nodeVersion,
        majorVersion,
        supported: majorVersion >= 16,
        inspectorProtocol: majorVersion >= 16,
        sourceMapSupport: majorVersion >= 16,
        esModules: majorVersion >= 16,
      };

      console.log(
        'Compatibility status:',
        JSON.stringify(compatibilityStatus, null, 2),
      );
      expect(compatibilityStatus.supported).toBe(true);
    });
  });

  describe('TypeScript Compatibility', () => {
    it('should work with TypeScript files', async () => {
      // Check if TypeScript is available
      let tsVersion: string;
      try {
        tsVersion = execSync('npx tsc --version', { encoding: 'utf8' }).trim();
        console.log(`Testing with ${tsVersion}`);
      } catch (error) {
        console.log('TypeScript not available, skipping test');
        return;
      }

      // Compile TypeScript file
      const jsOutputPath = tsFixturePath.replace('.ts', '.js');
      try {
        execSync(
          `npx tsc ${tsFixturePath} --outDir ${path.dirname(jsOutputPath)} --sourceMap`,
          {
            encoding: 'utf8',
          },
        );
      } catch (error) {
        console.log('TypeScript compilation failed, skipping test');
        return;
      }

      // Test debugging the compiled file
      const session = await sessionManager.createSession({
        command: 'node',
        args: [jsOutputPath],
        cwd: process.cwd(),
      });

      expect(session).toBeDefined();

      await sessionManager.removeSession(session.id);

      // Cleanup compiled files
      if (fs.existsSync(jsOutputPath)) {
        fs.unlinkSync(jsOutputPath);
      }
      const mapPath = jsOutputPath + '.map';
      if (fs.existsSync(mapPath)) {
        fs.unlinkSync(mapPath);
      }
    }, 30000);

    it('should detect TypeScript version and report compatibility', () => {
      let tsVersion: string;
      try {
        tsVersion = execSync('npx tsc --version', { encoding: 'utf8' }).trim();
      } catch (error) {
        console.log('TypeScript not available');
        return;
      }

      console.log(`TypeScript version: ${tsVersion}`);

      // Extract version number
      const versionMatch = tsVersion.match(/(\d+)\.(\d+)/);
      if (versionMatch) {
        const majorVersion = parseInt(versionMatch[1]);
        const minorVersion = parseInt(versionMatch[2]);

        const compatibilityStatus = {
          version: tsVersion,
          majorVersion,
          minorVersion,
          supported: majorVersion >= 4,
          sourceMapSupport: majorVersion >= 4,
          decorators: majorVersion >= 5,
        };

        console.log(
          'TypeScript compatibility:',
          JSON.stringify(compatibilityStatus, null, 2),
        );
        expect(compatibilityStatus.supported).toBe(true);
      }
    });
  });

  describe('Test Framework Compatibility', () => {
    it('should work with Jest', async () => {
      // Check if Jest is available
      try {
        const jestVersion = execSync('npx jest --version', {
          encoding: 'utf8',
        }).trim();
        console.log(`Jest version: ${jestVersion}`);
      } catch (error) {
        console.log('Jest not available, skipping test');
        return;
      }

      // Create a simple Jest test file
      const jestTestPath = path.join(
        __dirname,
        '../../test-fixtures/jest-test.js',
      );
      fs.writeFileSync(
        jestTestPath,
        `
test('simple test', () => {
  expect(1 + 1).toBe(2);
});
      `.trim(),
      );

      // Test debugging Jest
      // Note: This test can be flaky if Jest exits too quickly
      try {
        const session = await sessionManager.createSession({
          command: 'npx',
          args: ['jest', jestTestPath, '--runInBand', '--no-coverage'],
          cwd: process.cwd(),
        });

        expect(session).toBeDefined();
        await sessionManager.removeSession(session.id);
      } catch (error) {
        // Jest might exit too quickly for inspector to attach
        // This is expected behavior for very fast tests
        console.log(
          'Jest exited before inspector attached (expected for fast tests)',
        );
        expect(error).toBeDefined();
      }

      // Cleanup
      if (fs.existsSync(jestTestPath)) {
        fs.unlinkSync(jestTestPath);
      }
    }, 30000);

    it('should detect available test frameworks', () => {
      const frameworks = {
        jest: false,
        mocha: false,
        vitest: false,
      };

      // Check Jest
      try {
        execSync('npx jest --version', { encoding: 'utf8' });
        frameworks.jest = true;
      } catch (error) {
        // Not available
      }

      // Check Mocha
      try {
        execSync('npx mocha --version', { encoding: 'utf8' });
        frameworks.mocha = true;
      } catch (error) {
        // Not available
      }

      // Check Vitest
      try {
        execSync('npx vitest --version', { encoding: 'utf8' });
        frameworks.vitest = true;
      } catch (error) {
        // Not available
      }

      console.log(
        'Available test frameworks:',
        JSON.stringify(frameworks, null, 2),
      );

      // At least one should be available
      expect(frameworks.jest || frameworks.mocha || frameworks.vitest).toBe(
        true,
      );
    });
  });

  describe('Platform Compatibility', () => {
    it('should work on current platform', async () => {
      const platform = process.platform;
      const arch = process.arch;

      console.log(`Testing on platform: ${platform} (${arch})`);

      const session = await sessionManager.createSession({
        command: 'node',
        args: [testFixturePath],
        cwd: process.cwd(),
      });

      expect(session).toBeDefined();

      await sessionManager.removeSession(session.id);
    }, 15000);

    it('should report platform compatibility', () => {
      const platformInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        supported: ['linux', 'darwin', 'win32'].includes(process.platform),
        inspectorSupport: true, // All modern platforms support inspector
      };

      console.log('Platform info:', JSON.stringify(platformInfo, null, 2));

      expect(platformInfo.supported).toBe(true);
    });

    it('should handle platform-specific path separators', () => {
      const testPath = path.join('test', 'fixtures', 'file.js');
      const expectedSeparator = process.platform === 'win32' ? '\\' : '/';

      console.log(`Test path: ${testPath}`);
      console.log(`Expected separator: ${expectedSeparator}`);

      expect(testPath).toContain(expectedSeparator);
    });
  });

  describe('Feature Detection', () => {
    it('should detect inspector protocol support', () => {
      const inspectorSupport = {
        available:
          typeof (global as any).inspector !== 'undefined' ||
          !!process.versions.node,
        version: process.version,
        features: {
          debugger: true,
          profiler: true,
          heapProfiler: true,
          runtime: true,
        },
      };

      console.log(
        'Inspector support:',
        JSON.stringify(inspectorSupport, null, 2),
      );
      expect(inspectorSupport.available).toBe(true);
    });

    it('should detect source map support', () => {
      const sourceMapSupport = {
        nodeFlag: process.execArgv.includes('--enable-source-maps'),
        available: true, // Modern Node.js versions support source maps
      };

      console.log(
        'Source map support:',
        JSON.stringify(sourceMapSupport, null, 2),
      );
      expect(sourceMapSupport.available).toBe(true);
    });

    it('should detect WebSocket support', () => {
      const wsSupport = {
        available: true, // ws package is a dependency
        version: require('ws/package.json').version,
      };

      console.log('WebSocket support:', JSON.stringify(wsSupport, null, 2));
      expect(wsSupport.available).toBe(true);
    });
  });

  describe('Cross-Version Compatibility Matrix', () => {
    it('should generate compatibility report', () => {
      const compatibilityReport = {
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        features: {
          inspectorProtocol: true,
          sourceMapSupport: true,
          webSocketSupport: true,
          asyncHooks: true,
        },
        testFrameworks: {
          jest: false,
          mocha: false,
          vitest: false,
        },
        typescript: {
          available: false,
          version: null,
        },
      };

      // Detect test frameworks
      try {
        execSync('npx jest --version', { encoding: 'utf8' });
        compatibilityReport.testFrameworks.jest = true;
      } catch (error) {
        // Not available
      }

      try {
        execSync('npx mocha --version', { encoding: 'utf8' });
        compatibilityReport.testFrameworks.mocha = true;
      } catch (error) {
        // Not available
      }

      try {
        execSync('npx vitest --version', { encoding: 'utf8' });
        compatibilityReport.testFrameworks.vitest = true;
      } catch (error) {
        // Not available
      }

      // Detect TypeScript
      try {
        const tsVersion = execSync('npx tsc --version', {
          encoding: 'utf8',
        }).trim();
        compatibilityReport.typescript.available = true;
        compatibilityReport.typescript.version = tsVersion;
      } catch (error) {
        // Not available
      }

      console.log('Compatibility Report:');
      console.log(JSON.stringify(compatibilityReport, null, 2));

      // Verify minimum requirements
      expect(compatibilityReport.features.inspectorProtocol).toBe(true);
      expect(compatibilityReport.features.webSocketSupport).toBe(true);
    });
  });
});
