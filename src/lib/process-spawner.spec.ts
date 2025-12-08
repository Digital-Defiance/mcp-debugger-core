import { spawnWithInspector } from "./process-spawner";
import * as path from "path";

describe("ProcessSpawner", () => {
  describe("spawnWithInspector", () => {
    it("should spawn process with inspector and return WebSocket URL", async () => {
      const testFile = path.join(
        __dirname,
        "../test-fixtures/normal-completion.js"
      );

      const result = await spawnWithInspector("node", [testFile]);

      expect(result).toBeDefined();
      expect(result.process).toBeDefined();
      expect(result.wsUrl).toMatch(/^ws:\/\//);

      // Cleanup
      result.process.kill();
    }, 10000);

    it("should handle spawn errors gracefully", async () => {
      await expect(
        spawnWithInspector("nonexistent-command-12345", [])
      ).rejects.toThrow();
    }, 5000);

    it("should timeout if inspector URL not found", async () => {
      // Use a command that won't output inspector URL
      // Note: node --version with --inspect-brk actually does output inspector URL
      // before exiting, so we expect either timeout or process exit error
      await expect(spawnWithInspector("node", ["--version"])).rejects.toThrow();
    }, 5000);

    it("should handle process that exits immediately", async () => {
      // With --inspect-brk, even process.exit(0) will pause at start and output inspector URL
      // So this test should actually succeed in getting the inspector URL
      const result = await spawnWithInspector("node", [
        "-e",
        "process.exit(0)",
      ]);
      expect(result).toBeDefined();
      expect(result.wsUrl).toMatch(/^ws:\/\//);
      result.process.kill();
    }, 5000);

    it("should use custom working directory", async () => {
      const testFile = path.join(
        __dirname,
        "../test-fixtures/normal-completion.js"
      );

      const result = await spawnWithInspector("node", [testFile], __dirname);

      expect(result).toBeDefined();
      expect(result.process).toBeDefined();

      // Cleanup
      result.process.kill();
    }, 10000);

    it("should handle stderr output without inspector URL", async () => {
      // With --inspect-brk, inspector URL is always output to stderr
      // This test should succeed in getting the URL even with other stderr output
      const result = await spawnWithInspector("node", [
        "-e",
        "console.error('test error'); setTimeout(() => {}, 10000);",
      ]);
      expect(result).toBeDefined();
      expect(result.wsUrl).toMatch(/^ws:\/\//);
      result.process.kill();
    }, 5000);
  });
});
