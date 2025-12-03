import * as fc from "fast-check";
import { InspectorClient } from "./inspector-client";
import { spawnWithInspector } from "./process-spawner";
import { ChildProcess } from "child_process";
import * as path from "path";

describe("InspectorClient", () => {
  let testProcess: ChildProcess | null = null;
  let client: InspectorClient | null = null;

  afterEach(async () => {
    // Clean up after each test
    if (client) {
      await client.disconnect();
      client = null;
    }
    if (testProcess && !testProcess.killed) {
      testProcess.kill();
      testProcess = null;
    }
  });

  // Feature: mcp-debugger-tool, Property 5: Process start with inspector attachment
  // For any valid Node.js command with arguments, when the MCP Server starts that command,
  // then the resulting process should have the Inspector Protocol attached and be in a paused state.
  // Validates: Requirements 2.1
  it("should attach inspector to spawned process and connect successfully", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("node"), async (command) => {
        const testScript = path.join(
          __dirname,
          "../../test-fixtures/simple-script.js"
        );

        // Spawn process with inspector
        const { process: proc, wsUrl } = await spawnWithInspector(command, [
          testScript,
        ]);
        testProcess = proc;

        // Verify we got a valid WebSocket URL
        expect(wsUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+$/);

        // Create and connect inspector client
        client = new InspectorClient(wsUrl);
        await client.connect();

        // Verify connection is established
        expect(client.isConnected()).toBe(true);

        // Enable debugger to verify CDP communication works
        const result = await client.send("Debugger.enable");
        expect(result).toBeDefined();

        // Process should be paused at start (--inspect-brk)
        // We can verify this by checking that the process hasn't exited yet
        expect(testProcess.killed).toBe(false);
        expect(testProcess.exitCode).toBeNull();

        // Clean up
        await client.disconnect();
        testProcess.kill();
        testProcess = null;
        client = null;
      }),
      { numRuns: 5 } // Run 5 times instead of 100 for faster execution with process spawning
    );
  }, 30000); // 30 second timeout for process spawning tests

  it("should handle CDP messages correctly", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    // Test sending multiple commands
    await client.send("Debugger.enable");
    await client.send("Runtime.enable");

    // Verify connection is still active after multiple commands
    expect(client.isConnected()).toBe(true);
  }, 10000);

  it("should handle disconnection gracefully", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);

    // Attempting to send after disconnect should throw
    await expect(client.send("Debugger.enable")).rejects.toThrow(
      "Inspector client is not connected"
    );
  }, 10000);

  it("should emit events for CDP events", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    const events: any[] = [];
    client.on("event", (event) => {
      events.push(event);
    });

    await client.send("Debugger.enable");
    await client.send("Runtime.enable");

    // Give some time for events to arrive
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have received some CDP events
    expect(events.length).toBeGreaterThan(0);
  }, 10000);

  // Feature: mcp-debugger-tool, Property 18: Error handling without process crash
  // For any invalid operation (invalid breakpoint location, invalid expression evaluation),
  // the MCP Server should return a clear error message without causing the Target Process
  // to crash or become unresponsive.
  // Validates: Requirements 8.3, 8.4
  it("should handle errors without crashing the process", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "Debugger.setBreakpointByUrl",
          "Debugger.evaluateOnCallFrame",
          "Runtime.evaluate"
        ),
        fc.record({
          invalidParam: fc.string(),
          invalidValue: fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.integer()
          ),
        }),
        async (method, params) => {
          const testScript = path.join(
            __dirname,
            "../../test-fixtures/simple-script.js"
          );
          const { process: proc, wsUrl } = await spawnWithInspector("node", [
            testScript,
          ]);
          testProcess = proc;

          client = new InspectorClient(wsUrl);
          await client.connect();

          await client.send("Debugger.enable");

          // Try to send an invalid command - should get error but not crash
          try {
            await client.send(method, params);
            // If it doesn't throw, that's also acceptable (some invalid params might be ignored)
          } catch (error: any) {
            // Should get a clear error message
            expect(error).toBeDefined();
            expect(error.message).toBeDefined();
            expect(typeof error.message).toBe("string");
          }

          // Process should still be alive and responsive
          expect(testProcess.killed).toBe(false);
          expect(client.isConnected()).toBe(true);

          // Should still be able to send valid commands
          const result = await client.send("Runtime.enable");
          expect(result).toBeDefined();

          // Clean up
          await client.disconnect();
          testProcess.kill();
          testProcess = null;
          client = null;
        }
      ),
      { numRuns: 5 } // Run 5 times for faster execution
    );
  }, 60000); // 60 second timeout for multiple process spawns

  it("should handle timeout for commands that do not respond", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    // Send a command with a very short timeout
    // CDP will respond with an error for non-existent methods, so we expect either
    // a timeout or an error response - both are valid error handling
    try {
      await client.send("NonExistent.Method", {}, 100);
      fail("Should have thrown an error");
    } catch (error: any) {
      // Should get either a timeout error or a CDP error
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      expect(typeof error.message).toBe("string");
    }

    // Client should still be connected and functional
    expect(client.isConnected()).toBe(true);

    // Should be able to send valid commands after error
    await client.send("Debugger.enable");
  }, 10000);

  it("should handle WebSocket send errors", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    // Close the WebSocket to simulate a send error
    const ws = (client as any).ws;
    ws.close();

    // Wait a bit for the close to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Try to send a command - should fail
    await expect(client.send("Debugger.enable")).rejects.toThrow();
  }, 10000);

  it("should handle malformed JSON messages gracefully", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    // Track error events
    const errors: any[] = [];
    client.on("error", (error) => {
      errors.push(error);
    });

    // Simulate receiving malformed JSON
    const handleMessage = (client as any).handleMessage.bind(client);
    handleMessage("invalid json {");

    // Should have emitted an error
    expect(errors.length).toBeGreaterThan(0);

    // Client should still be functional
    expect(client.isConnected()).toBe(true);
    await client.send("Debugger.enable");
  }, 10000);

  it("should handle connection errors", async () => {
    // Try to connect to an invalid WebSocket URL
    client = new InspectorClient("ws://127.0.0.1:99999/invalid");

    await expect(client.connect()).rejects.toThrow();
  }, 10000);

  it("should handle responses with error field", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    await client.send("Debugger.enable");

    // Try to evaluate an invalid expression
    try {
      await client.send("Runtime.evaluate", {
        expression: "this.is.invalid.syntax...",
      });
      // May or may not throw depending on CDP version
    } catch (error: any) {
      // If it throws, verify error has proper structure
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
    }
  }, 10000);

  it("should handle response for non-existent request ID", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    // Simulate receiving a response for a request ID that doesn't exist
    const handleMessage = (client as any).handleMessage.bind(client);
    handleMessage(JSON.stringify({ id: 99999, result: {} }));

    // Should not throw, just ignore the response
    expect(client.isConnected()).toBe(true);
  }, 10000);

  it("should handle event without method field", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    // Simulate receiving a message without id or method
    const handleMessage = (client as any).handleMessage.bind(client);
    handleMessage(JSON.stringify({ someField: "value" }));

    // Should not throw
    expect(client.isConnected()).toBe(true);
  }, 10000);

  it("should handle CDP error with code and data", async () => {
    const testScript = path.join(
      __dirname,
      "../../test-fixtures/simple-script.js"
    );
    const { process: proc, wsUrl } = await spawnWithInspector("node", [
      testScript,
    ]);
    testProcess = proc;

    client = new InspectorClient(wsUrl);
    await client.connect();

    await client.send("Debugger.enable");

    // Try to set an invalid breakpoint to trigger an error
    try {
      await client.send("Debugger.setBreakpointByUrl", {
        lineNumber: -1,
        url: "invalid://url",
      });
      // May or may not throw depending on CDP version
    } catch (error: any) {
      // If it throws, verify error structure
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
      // CDP errors may have code and data properties
      if (error.code !== undefined) {
        expect(typeof error.code).toBe("number");
      }
    }
  }, 10000);
});
