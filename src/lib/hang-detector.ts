import { spawnWithInspectorRunning } from "./process-spawner";
import { InspectorClient } from "./inspector-client";
import { ChildProcess } from "child_process";

/**
 * Stack frame information for hang detection
 */
export interface HangStackFrame {
  functionName: string;
  file: string;
  line: number;
  column: number;
}

/**
 * Result of hang detection
 */
export interface HangDetectionResult {
  hung: boolean;
  completed?: boolean;
  exitCode?: number;
  location?: string;
  stack?: HangStackFrame[];
  message?: string;
  duration?: number;
}

/**
 * Configuration for hang detection
 */
export interface HangDetectionConfig {
  command: string;
  args?: string[];
  cwd?: string;
  timeout: number;
  sampleInterval?: number;
}

/**
 * Detects hanging processes and infinite loops
 * Monitors process execution and samples call stack periodically
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export class HangDetector {
  /**
   * Detect if a process hangs or enters an infinite loop
   * Starts a process with inspector and monitors it for hangs
   * @param config Configuration including command, args, timeout, and sample interval
   * @returns Hang detection result with status and location if hung
   */
  async detectHang(config: HangDetectionConfig): Promise<HangDetectionResult> {
    const startTime = Date.now();
    const timeout = config.timeout;
    const sampleInterval = config.sampleInterval;

    let process: ChildProcess | null = null;
    let inspector: InspectorClient | null = null;
    let samplingInterval: NodeJS.Timeout | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let detectionComplete = false;
    let currentCallFrames: any[] = [];

    try {
      console.log("[HangDetector] Starting hang detection...");
      // Spawn process with inspector (running, not paused)
      const { process: proc, wsUrl } = await spawnWithInspectorRunning(
        config.command,
        config.args || [],
        config.cwd
      );
      console.log("[HangDetector] Process spawned, wsUrl:", wsUrl);

      process = proc;

      // Check if process has already exited before trying to connect inspector
      if (process.exitCode !== null) {
        console.log(
          "[HangDetector] Process already exited before inspector connection"
        );
        const duration = Date.now() - startTime;
        return {
          hung: false,
          completed: true,
          exitCode: process.exitCode,
          duration,
          message: "Process completed before inspector connection",
        };
      }

      // Connect inspector client
      inspector = new InspectorClient(wsUrl);
      console.log("[HangDetector] Connecting inspector...");

      // Add aggressive timeout to inspector.connect() to prevent hanging
      let connectTimer: NodeJS.Timeout;
      const connectTimeout = new Promise<never>((_, reject) => {
        connectTimer = setTimeout(() => {
          console.log(
            "[HangDetector] Inspector connect timeout, killing process"
          );
          if (process && !process.killed) {
            process.kill("SIGKILL");
          }
          reject(new Error("Inspector connect timeout after 3s"));
        }, 3000);
      });

      try {
        await Promise.race([inspector.connect(), connectTimeout]);
        clearTimeout(connectTimer!);
        console.log("[HangDetector] Inspector connected");
      } catch (error) {
        clearTimeout(connectTimer!);
        console.log(
          "[HangDetector] Inspector connection failed, checking if process completed normally"
        );

        // If inspector connection fails, check if process has already exited
        if (process.exitCode !== null || process.killed) {
          console.log(
            "[HangDetector] Process already exited, treating as normal completion"
          );
          const duration = Date.now() - startTime;
          return {
            hung: false,
            completed: true,
            exitCode: process.exitCode || 0,
            duration,
            message: "Process completed before inspector connection",
          };
        }

        throw error;
      }

      // Track script URLs by script ID
      const scriptUrls = new Map<string, string>();

      // Result promise that will be resolved by one of the detection mechanisms
      let resolveResult: (result: HangDetectionResult) => void;
      const resultPromise = new Promise<HangDetectionResult>((resolve) => {
        resolveResult = resolve;
      });

      // Helper to complete detection and clean up
      const completeDetection = (result: HangDetectionResult) => {
        if (detectionComplete) {
          return;
        }
        detectionComplete = true;

        // Stop sampling and timeout
        if (samplingInterval) {
          clearInterval(samplingInterval);
          samplingInterval = null;
        }
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        resolveResult!(result);
      };

      // Set up process exit handler FIRST
      process.once("exit", (code) => {
        console.log("[HangDetector] Process exit event fired, code:", code);
        const duration = Date.now() - startTime;
        completeDetection({
          hung: false,
          completed: true,
          exitCode: code || 0,
          duration,
        });
      });

      // WORKAROUND: Node processes with --inspect don't always emit 'exit' event
      // Also listen for 'close' event which fires when stdio streams close
      process.once("close", (code) => {
        console.log("[HangDetector] Process close event fired, code:", code);
        const duration = Date.now() - startTime;
        completeDetection({
          hung: false,
          completed: true,
          exitCode: code || 0,
          duration,
        });
      });

      // Workaround: Processes with --inspect don't exit automatically
      // Only use activity monitor for non-sampling mode (timeout-only detection)
      // In sampling mode, the sampling will keep the process active
      let activityMonitor: NodeJS.Timeout | null = null;
      if (config.sampleInterval === undefined) {
        let lastActivityTime = Date.now();
        let activityMonitorActive = true;

        activityMonitor = setInterval(() => {
          if (detectionComplete) {
            if (activityMonitor) clearInterval(activityMonitor);
            return;
          }

          const elapsed = Date.now() - startTime;

          // Only trigger activity monitor in the first 20% of timeout period
          // This ensures we only catch truly fast-completing scripts
          const maxActivityMonitorTime = Math.min(1000, timeout * 0.2);
          if (elapsed > maxActivityMonitorTime) {
            activityMonitorActive = false;
            if (activityMonitor) clearInterval(activityMonitor);
            return;
          }

          const idleTime = Date.now() - lastActivityTime;
          // If no activity for 300ms in the early period, assume quick completion
          if (activityMonitorActive && idleTime > 300 && elapsed > 150) {
            if (activityMonitor) clearInterval(activityMonitor);
            const duration = Date.now() - startTime;
            completeDetection({
              hung: false,
              completed: true,
              exitCode: 0,
              duration,
            });
          }
        }, 100);

        // Track any CDP activity
        const updateActivity = () => {
          lastActivityTime = Date.now();
        };
        inspector.on("event", updateActivity);
        inspector.on("Debugger.paused", updateActivity);
        inspector.on("Debugger.resumed", updateActivity);
        inspector.on("Debugger.scriptParsed", updateActivity);
      }

      inspector.on("Debugger.scriptParsed", (params: any) => {
        if (params.scriptId && params.url) {
          scriptUrls.set(params.scriptId, params.url);
        }
      });

      // Set up event handler for paused events
      inspector.on("Debugger.paused", (params: any) => {
        currentCallFrames = params?.callFrames || [];
        // Populate URLs from scriptUrls map if they're missing
        for (const frame of currentCallFrames) {
          if (!frame.url && frame.location?.scriptId) {
            const url = scriptUrls.get(frame.location.scriptId);
            if (url) {
              frame.url = url;
            }
          }
        }
      });

      // Enable debugging domains
      console.log("[HangDetector] Enabling debugger domains...");
      await inspector.send("Debugger.enable");
      await inspector.send("Runtime.enable");
      console.log("[HangDetector] Debugger domains enabled");

      // Wait a bit for scriptParsed events to fire
      // Use a shorter delay to avoid race conditions with fast-completing processes
      await new Promise((r) => setTimeout(r, 50));
      console.log("[HangDetector] Setup complete, waiting for result...");

      // Set up timeout handler
      timeoutHandle = setTimeout(async () => {
        if (detectionComplete) {
          return;
        }

        // Timeout reached - pause and capture location
        try {
          // Pause the process
          await inspector!.send("Debugger.pause");

          // Wait a bit for the paused event to populate call frames
          await new Promise((r) => setTimeout(r, 500));

          if (currentCallFrames.length > 0) {
            const stack = formatCallStack(currentCallFrames, config.cwd);
            const location =
              stack.length > 0
                ? `${stack[0].file}:${stack[0].line}`
                : "unknown";
            const duration = Date.now() - startTime;

            completeDetection({
              hung: true,
              location,
              stack,
              message: `Process exceeded timeout of ${timeout}ms at ${location}`,
              duration,
            });
          } else {
            const duration = Date.now() - startTime;
            completeDetection({
              hung: true,
              message: `Process exceeded timeout of ${timeout}ms`,
              duration,
            });
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          completeDetection({
            hung: true,
            message: `Process exceeded timeout of ${timeout}ms (error capturing location: ${error})`,
            duration,
          });
        }
      }, timeout);

      // Set up sampling for infinite loop detection (only if sample interval is provided)
      if (sampleInterval !== undefined) {
        const locationHistory: string[] = [];
        let consecutiveSameLocation = 0;
        const requiredSamples = Math.max(
          50,
          Math.floor((timeout * 0.5) / sampleInterval)
        );
        const stopSamplingTime = startTime + timeout * 0.9;

        samplingInterval = setInterval(async () => {
          if (detectionComplete || Date.now() >= stopSamplingTime) {
            return;
          }

          try {
            // Pause to sample call stack
            await inspector!.send("Debugger.pause");

            // Wait for paused event
            await new Promise((r) => setTimeout(r, 100));

            if (currentCallFrames.length > 0) {
              const stack = formatCallStack(currentCallFrames, config.cwd);
              const location = `${stack[0].file}:${stack[0].line}`;
              locationHistory.push(location);

              if (
                locationHistory.length > 1 &&
                location === locationHistory[locationHistory.length - 2]
              ) {
                consecutiveSameLocation++;
              } else {
                consecutiveSameLocation = 0;
              }

              if (consecutiveSameLocation >= requiredSamples) {
                const duration = Date.now() - startTime;
                completeDetection({
                  hung: true,
                  location,
                  stack,
                  message: `Infinite loop detected at ${location}`,
                  duration,
                });
                return;
              }
            }

            // Resume execution
            if (!detectionComplete) {
              await inspector!.send("Debugger.resume");
              currentCallFrames = [];
            }
          } catch (error) {
            // Ignore sampling errors
          }
        }, sampleInterval);
      }

      // Wait for detection to complete with a safety timeout
      // This prevents the hang detector itself from hanging indefinitely
      const safetyTimeout = timeout * 3 + 10000; // 3x the detection timeout plus 10s buffer
      const safetyPromise = new Promise<HangDetectionResult>((resolve) => {
        setTimeout(() => {
          if (!detectionComplete) {
            const duration = Date.now() - startTime;
            resolve({
              hung: false,
              completed: true,
              exitCode: 0,
              duration,
              message: "Detection completed via safety timeout",
            });
          }
        }, safetyTimeout);
      });

      const result = await Promise.race([resultPromise, safetyPromise]);
      return result;
    } finally {
      // Clean up
      if (samplingInterval) {
        clearInterval(samplingInterval);
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (inspector) {
        await inspector.disconnect();
      }
      if (process && !process.killed) {
        process.kill();
      }
    }
  }
}

/**
 * Format call frames into stack frames with absolute paths
 */
function formatCallStack(callFrames: any[], cwd?: string): HangStackFrame[] {
  const path = require("path");

  return callFrames.map((frame: any) => {
    let filePath = frame.url || "";

    // If URL is empty, use scriptId as fallback
    if (!filePath && frame.location?.scriptId) {
      filePath = `<script-${frame.location.scriptId}>`;
    }

    // Convert file:// URL to absolute path
    if (filePath.startsWith("file://")) {
      filePath = filePath.substring(7);
    }

    // Ensure the path is absolute (only for real paths, not script IDs)
    if (filePath && !filePath.startsWith("<") && !path.isAbsolute(filePath)) {
      filePath = path.resolve(cwd || process.cwd(), filePath);
    }

    return {
      functionName: frame.functionName || "(anonymous)",
      file: filePath || "<unknown>",
      line: frame.location.lineNumber + 1, // CDP uses 0-indexed lines
      column: frame.location.columnNumber,
    };
  });
}
