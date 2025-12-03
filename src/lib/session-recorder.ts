/**
 * Session event types for recording
 */
export enum SessionEventType {
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  BREAKPOINT_SET = 'breakpoint_set',
  BREAKPOINT_HIT = 'breakpoint_hit',
  BREAKPOINT_REMOVED = 'breakpoint_removed',
  STEP_OVER = 'step_over',
  STEP_INTO = 'step_into',
  STEP_OUT = 'step_out',
  CONTINUE = 'continue',
  PAUSE = 'pause',
  VARIABLE_INSPECT = 'variable_inspect',
  EXPRESSION_EVALUATE = 'expression_evaluate',
  STACK_TRACE = 'stack_trace',
  ERROR = 'error',
}

/**
 * Session event for recording
 */
export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  sessionId: string;
  data?: Record<string, any>;
  masked?: boolean; // Indicates if sensitive data was masked
}

/**
 * Session recording metadata
 */
export interface SessionRecordingMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  eventCount: number;
  privacyMode: PrivacyMode;
}

/**
 * Complete session recording
 */
export interface SessionRecording {
  metadata: SessionRecordingMetadata;
  events: SessionEvent[];
}

/**
 * Privacy mode for session recording
 */
export enum PrivacyMode {
  FULL = 'full', // Record everything
  MASKED = 'masked', // Mask sensitive data
  MINIMAL = 'minimal', // Only record event types and timestamps
  DISABLED = 'disabled', // No recording
}

/**
 * Storage configuration for recordings
 */
export interface StorageConfig {
  maxRecordings: number;
  maxEventsPerRecording: number;
  retentionDays: number;
}

/**
 * Session recorder for advanced observability
 * Records debugging session events for replay and analysis
 */
export class SessionRecorder {
  private recordings = new Map<string, SessionEvent[]>();
  private metadata = new Map<string, SessionRecordingMetadata>();
  private privacyMode: PrivacyMode;
  private storageConfig: StorageConfig;
  private sensitivePatterns: RegExp[] = [
    /password/i,
    /token/i,
    /secret/i,
    /apikey/i,
    /api_key/i,
  ];

  constructor(
    privacyMode: PrivacyMode = PrivacyMode.MASKED,
    storageConfig?: Partial<StorageConfig>,
  ) {
    this.privacyMode = privacyMode;
    this.storageConfig = {
      maxRecordings: storageConfig?.maxRecordings || 100,
      maxEventsPerRecording: storageConfig?.maxEventsPerRecording || 10000,
      retentionDays: storageConfig?.retentionDays || 7,
    };
  }

  /**
   * Start recording a session
   */
  startRecording(sessionId: string): void {
    if (this.privacyMode === PrivacyMode.DISABLED) {
      return;
    }

    this.recordings.set(sessionId, []);
    this.metadata.set(sessionId, {
      sessionId,
      startTime: Date.now(),
      eventCount: 0,
      privacyMode: this.privacyMode,
    });

    this.recordEvent(sessionId, SessionEventType.SESSION_START, {});
  }

  /**
   * Stop recording a session
   */
  stopRecording(sessionId: string): void {
    if (this.privacyMode === PrivacyMode.DISABLED) {
      return;
    }

    const meta = this.metadata.get(sessionId);
    if (meta) {
      meta.endTime = Date.now();
      meta.duration = meta.endTime - meta.startTime;
    }

    this.recordEvent(sessionId, SessionEventType.SESSION_END, {});
  }

  /**
   * Check if data contains sensitive information
   */
  private containsSensitiveData(data: any): boolean {
    if (typeof data === 'string') {
      return this.sensitivePatterns.some((pattern) => pattern.test(data));
    }

    if (typeof data === 'object' && data !== null) {
      for (const key in data) {
        if (this.sensitivePatterns.some((pattern) => pattern.test(key))) {
          return true;
        }
        if (this.containsSensitiveData(data[key])) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Mask sensitive data in event data
   */
  private maskSensitiveData(data: any): any {
    if (typeof data === 'string') {
      if (this.containsSensitiveData(data)) {
        return '***MASKED***';
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const masked: any = {};
      for (const key in data) {
        if (this.sensitivePatterns.some((pattern) => pattern.test(key))) {
          masked[key] = '***MASKED***';
        } else {
          masked[key] = this.maskSensitiveData(data[key]);
        }
      }
      return masked;
    }

    return data;
  }

  /**
   * Process event data based on privacy mode
   */
  private processEventData(data: Record<string, any>): {
    processedData: Record<string, any>;
    masked: boolean;
  } {
    switch (this.privacyMode) {
      case PrivacyMode.DISABLED:
        return { processedData: {}, masked: false };

      case PrivacyMode.MINIMAL:
        return { processedData: {}, masked: false };

      case PrivacyMode.MASKED:
        const hasSensitive = this.containsSensitiveData(data);
        return {
          processedData: hasSensitive ? this.maskSensitiveData(data) : data,
          masked: hasSensitive,
        };

      case PrivacyMode.FULL:
        return { processedData: data, masked: false };

      default:
        return { processedData: {}, masked: false };
    }
  }

  /**
   * Record an event
   */
  recordEvent(
    sessionId: string,
    type: SessionEventType,
    data: Record<string, any>,
  ): void {
    if (this.privacyMode === PrivacyMode.DISABLED) {
      return;
    }

    const events = this.recordings.get(sessionId);
    if (!events) {
      return;
    }

    // Check event limit
    if (events.length >= this.storageConfig.maxEventsPerRecording) {
      // Remove oldest event
      events.shift();
    }

    const { processedData, masked } = this.processEventData(data);

    const event: SessionEvent = {
      type,
      timestamp: Date.now(),
      sessionId,
      data: processedData,
      masked,
    };

    events.push(event);

    // Update metadata
    const meta = this.metadata.get(sessionId);
    if (meta) {
      meta.eventCount = events.length;
    }
  }

  /**
   * Get recording for a session
   */
  getRecording(sessionId: string): SessionRecording | undefined {
    const events = this.recordings.get(sessionId);
    const meta = this.metadata.get(sessionId);

    if (!events || !meta) {
      return undefined;
    }

    return {
      metadata: { ...meta },
      events: [...events],
    };
  }

  /**
   * Get all recordings
   */
  getAllRecordings(): SessionRecording[] {
    const recordings: SessionRecording[] = [];

    for (const sessionId of this.recordings.keys()) {
      const recording = this.getRecording(sessionId);
      if (recording) {
        recordings.push(recording);
      }
    }

    return recordings;
  }

  /**
   * Delete a recording
   */
  deleteRecording(sessionId: string): boolean {
    const hadRecording = this.recordings.has(sessionId);
    this.recordings.delete(sessionId);
    this.metadata.delete(sessionId);
    return hadRecording;
  }

  /**
   * Clear old recordings based on retention policy
   */
  pruneOldRecordings(): number {
    const now = Date.now();
    const retentionMs = this.storageConfig.retentionDays * 24 * 60 * 60 * 1000;
    let prunedCount = 0;

    for (const [sessionId, meta] of this.metadata.entries()) {
      const age = now - meta.startTime;
      if (age > retentionMs) {
        this.deleteRecording(sessionId);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  /**
   * Enforce recording limit
   */
  enforceRecordingLimit(): number {
    const recordings = this.getAllRecordings();

    if (recordings.length <= this.storageConfig.maxRecordings) {
      return 0;
    }

    // Sort by start time (oldest first)
    recordings.sort((a, b) => a.metadata.startTime - b.metadata.startTime);

    // Delete oldest recordings
    const toDelete = recordings.length - this.storageConfig.maxRecordings;
    let deletedCount = 0;

    for (let i = 0; i < toDelete; i++) {
      this.deleteRecording(recordings[i].metadata.sessionId);
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Export recording as JSON
   */
  exportRecording(sessionId: string): string | undefined {
    const recording = this.getRecording(sessionId);
    if (!recording) {
      return undefined;
    }

    return JSON.stringify(recording, null, 2);
  }

  /**
   * Import recording from JSON
   */
  importRecording(json: string): boolean {
    try {
      const recording: SessionRecording = JSON.parse(json);

      this.recordings.set(recording.metadata.sessionId, recording.events);
      this.metadata.set(recording.metadata.sessionId, recording.metadata);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get recording statistics
   */
  getStatistics(): {
    totalRecordings: number;
    totalEvents: number;
    oldestRecording?: number;
    newestRecording?: number;
    averageEventsPerRecording: number;
  } {
    const recordings = this.getAllRecordings();

    if (recordings.length === 0) {
      return {
        totalRecordings: 0,
        totalEvents: 0,
        averageEventsPerRecording: 0,
      };
    }

    const totalEvents = recordings.reduce(
      (sum, r) => sum + r.metadata.eventCount,
      0,
    );

    const startTimes = recordings.map((r) => r.metadata.startTime);

    return {
      totalRecordings: recordings.length,
      totalEvents,
      oldestRecording: Math.min(...startTimes),
      newestRecording: Math.max(...startTimes),
      averageEventsPerRecording: totalEvents / recordings.length,
    };
  }

  /**
   * Set privacy mode
   */
  setPrivacyMode(mode: PrivacyMode): void {
    this.privacyMode = mode;
  }

  /**
   * Get current privacy mode
   */
  getPrivacyMode(): PrivacyMode {
    return this.privacyMode;
  }

  /**
   * Add custom sensitive pattern
   */
  addSensitivePattern(pattern: RegExp): void {
    this.sensitivePatterns.push(pattern);
  }

  /**
   * Clear all recordings
   */
  clearAllRecordings(): void {
    this.recordings.clear();
    this.metadata.clear();
  }
}
