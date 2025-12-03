import WebSocket from "ws";
import { EventEmitter } from "events";

/**
 * CDP (Chrome DevTools Protocol) message types
 */
export interface CDPRequest {
  id: number;
  method: string;
  params?: Record<string, any>;
}

export interface CDPResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface CDPEvent {
  method: string;
  params?: Record<string, any>;
}

/**
 * Inspector client for connecting to Node.js Inspector Protocol via WebSocket
 * Implements CDP (Chrome DevTools Protocol) message handling
 */
export class InspectorClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();
  private connected = false;

  constructor(private wsUrl: string) {
    super();
    // Increase max listeners to handle multiple pause/resume cycles during sampling
    this.setMaxListeners(100);
  }

  /**
   * Connect to the Inspector Protocol WebSocket endpoint
   */
  async connect(): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 200;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.attemptConnect();
        return;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  private attemptConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        this.connected = true;
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("error", (error: Error) => {
        this.emit("error", error);
        reject(error);
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.emit("disconnected");
        this.cleanup();
      });
    });
  }

  /**
   * Handle incoming CDP messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if it's a response to a request
      if ("id" in message) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);

          if (message.error) {
            const error = new Error(message.error.message);
            (error as any).code = message.error.code;
            (error as any).data = message.error.data;
            pending.reject(error);
          } else {
            pending.resolve(message.result);
          }
        }
      } else if ("method" in message) {
        // It's an event
        this.emit("event", message as CDPEvent);
        this.emit(message.method, message.params);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Send a CDP command and wait for response
   * @param method CDP method name
   * @param params Optional parameters
   * @param timeout Timeout in milliseconds (default: 5000)
   */
  async send(
    method: string,
    params?: Record<string, any>,
    timeout: number = 5000
  ): Promise<any> {
    if (!this.connected || !this.ws) {
      throw new Error("Inspector client is not connected");
    }

    const id = ++this.messageId;
    const request: CDPRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(`CDP command '${method}' timed out after ${timeout}ms`)
        );
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value: any) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.ws!.send(JSON.stringify(request), (error) => {
        if (error) {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from the Inspector Protocol
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error("Inspector client disconnected"));
    }
    this.pendingRequests.clear();
    this.connected = false;
  }
}
