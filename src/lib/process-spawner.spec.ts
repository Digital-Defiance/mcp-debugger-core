import { spawnWithInspector } from "./process-spawner";
import * as path from "path";

describe("ProcessSpawner", () => {
  describe("spawnWithInspector", () => {
    it("should spawn process with inspector and return WebSocket URL", async () => {
      const testFile = path.join(
        __dirname,
        "../test-fixtures/normal-completion.js"
      );

      const result = await spawnWithInspector({
        command: "node",
        args: [testFile],
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.process).toBeDefined();
      expect(result.inspectorUrl).toMatch(/^ws:\/\//);

      // Cleanup
      result.process.kill();
    }, 10000);

    it("should handle spawn errors gracefully", async () => {
      await expect(
        spawnWithInspector({
          command: "nonexistent-command-12345",
          args: [],
          timeout: 2000,
        })
      ).rejects.toThrow();
    }, 5000);

    it("should timeout if inspector URL not found", async () => {
      // Use a command that won't output inspector URL
      await expect(
        spawnWithInspector({
          command: "node",
          args: ["--version"],
          timeout: 1000,
        })
      ).rejects.toThrow(/timeout/i);
    }, 5000);

    it("should handle process that exits immediately", async () => {
      await expect(
        spawnWithInspector({
          command: "node",
          args: ["-e", "process.exit(0)"],
          timeout: 2000,
        })
      ).rejects.toThrow();
    }, 5000);

    it("should use custom working directory", async () => {
      const testFile = path.join(
        __dirname,
        "../test-fixtures/normal-completion.js"
      );

      const result = await spawnWithInspector({
        command: "node",
        args: [testFile],
        cwd: __dirname,
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.process).toBeDefined();

      // Cleanup
      result.process.kill();
    }, 10000);

    it("should handle stderr output without inspector URL", async () => {
      // Spawn a process that writes to stderr but doesn't include inspector URL
      await expect(
        spawnWithInspector({
          command: "node",
          args: [
            "-e",
            "console.error('test error'); setTimeout(() => {}, 10000);",
          ],
          timeout: 1000,
        })
      ).rejects.toThrow();
    }, 5000);
  });
});
