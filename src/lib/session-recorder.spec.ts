import {
  SessionRecorder,
  SessionEventType,
  PrivacyMode,
} from './session-recorder';

describe('SessionRecorder', () => {
  let recorder: SessionRecorder;

  beforeEach(() => {
    recorder = new SessionRecorder();
  });

  describe('Basic Recording', () => {
    it('should start recording a session', () => {
      recorder.startRecording('session-1');

      const recording = recorder.getRecording('session-1');
      expect(recording).toBeDefined();
      expect(recording?.metadata.sessionId).toBe('session-1');
      expect(recording?.events.length).toBeGreaterThan(0);
    });

    it('should stop recording a session', () => {
      recorder.startRecording('session-1');
      recorder.stopRecording('session-1');

      const recording = recorder.getRecording('session-1');
      expect(recording?.metadata.endTime).toBeDefined();
      expect(recording?.metadata.duration).toBeDefined();
    });

    it('should record events', () => {
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_SET, {
        file: 'test.js',
        line: 10,
      });

      const recording = recorder.getRecording('session-1');
      const breakpointEvent = recording?.events.find(
        (e) => e.type === SessionEventType.BREAKPOINT_SET,
      );

      expect(breakpointEvent).toBeDefined();
      expect(breakpointEvent?.data?.file).toBe('test.js');
      expect(breakpointEvent?.data?.line).toBe(10);
    });

    it('should not record when privacy mode is disabled', () => {
      recorder = new SessionRecorder(PrivacyMode.DISABLED);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_SET, {
        file: 'test.js',
      });

      const recording = recorder.getRecording('session-1');
      expect(recording).toBeUndefined();
    });
  });

  describe('Privacy Modes', () => {
    it('should record full data in FULL mode', () => {
      recorder = new SessionRecorder(PrivacyMode.FULL);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.VARIABLE_INSPECT, {
        name: 'password',
        value: 'secret123',
      });

      const recording = recorder.getRecording('session-1');
      const event = recording?.events.find(
        (e) => e.type === SessionEventType.VARIABLE_INSPECT,
      );

      expect(event?.data?.value).toBe('secret123');
      expect(event?.masked).toBe(false);
    });

    it('should mask sensitive data in MASKED mode', () => {
      recorder = new SessionRecorder(PrivacyMode.MASKED);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.VARIABLE_INSPECT, {
        name: 'password',
        value: 'secret123',
      });

      const recording = recorder.getRecording('session-1');
      const event = recording?.events.find(
        (e) => e.type === SessionEventType.VARIABLE_INSPECT,
      );

      expect(event?.data?.value).toBe('***MASKED***');
      expect(event?.masked).toBe(true);
    });

    it('should record minimal data in MINIMAL mode', () => {
      recorder = new SessionRecorder(PrivacyMode.MINIMAL);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_SET, {
        file: 'test.js',
        line: 10,
      });

      const recording = recorder.getRecording('session-1');
      const event = recording?.events.find(
        (e) => e.type === SessionEventType.BREAKPOINT_SET,
      );

      expect(event?.data).toEqual({});
    });

    it('should detect sensitive patterns in keys', () => {
      recorder = new SessionRecorder(PrivacyMode.MASKED);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.VARIABLE_INSPECT, {
        apiKey: 'abc123',
        normalData: 'visible',
      });

      const recording = recorder.getRecording('session-1');
      const event = recording?.events.find(
        (e) => e.type === SessionEventType.VARIABLE_INSPECT,
      );

      expect(event?.data?.apiKey).toBe('***MASKED***');
      expect(event?.data?.normalData).toBe('visible');
    });

    it('should detect sensitive patterns in nested objects', () => {
      recorder = new SessionRecorder(PrivacyMode.MASKED);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.VARIABLE_INSPECT, {
        user: {
          name: 'John',
          password: 'secret',
        },
      });

      const recording = recorder.getRecording('session-1');
      const event = recording?.events.find(
        (e) => e.type === SessionEventType.VARIABLE_INSPECT,
      );

      expect(event?.data?.user?.name).toBe('John');
      expect(event?.data?.user?.password).toBe('***MASKED***');
    });

    it('should allow adding custom sensitive patterns', () => {
      recorder = new SessionRecorder(PrivacyMode.MASKED);
      recorder.addSensitivePattern(/customSecret/i);
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.VARIABLE_INSPECT, {
        customSecret: 'value',
      });

      const recording = recorder.getRecording('session-1');
      const event = recording?.events.find(
        (e) => e.type === SessionEventType.VARIABLE_INSPECT,
      );

      expect(event?.data?.customSecret).toBe('***MASKED***');
    });
  });

  describe('Event Types', () => {
    beforeEach(() => {
      recorder.startRecording('session-1');
    });

    it('should record session start event', () => {
      const recording = recorder.getRecording('session-1');
      const startEvent = recording?.events.find(
        (e) => e.type === SessionEventType.SESSION_START,
      );

      expect(startEvent).toBeDefined();
    });

    it('should record session end event', () => {
      recorder.stopRecording('session-1');

      const recording = recorder.getRecording('session-1');
      const endEvent = recording?.events.find(
        (e) => e.type === SessionEventType.SESSION_END,
      );

      expect(endEvent).toBeDefined();
    });

    it('should record breakpoint events', () => {
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_SET, {
        id: 'bp-1',
      });
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_HIT, {
        id: 'bp-1',
      });
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_REMOVED, {
        id: 'bp-1',
      });

      const recording = recorder.getRecording('session-1');
      expect(
        recording?.events.some(
          (e) => e.type === SessionEventType.BREAKPOINT_SET,
        ),
      ).toBe(true);
      expect(
        recording?.events.some(
          (e) => e.type === SessionEventType.BREAKPOINT_HIT,
        ),
      ).toBe(true);
      expect(
        recording?.events.some(
          (e) => e.type === SessionEventType.BREAKPOINT_REMOVED,
        ),
      ).toBe(true);
    });

    it('should record execution control events', () => {
      recorder.recordEvent('session-1', SessionEventType.STEP_OVER, {});
      recorder.recordEvent('session-1', SessionEventType.STEP_INTO, {});
      recorder.recordEvent('session-1', SessionEventType.STEP_OUT, {});
      recorder.recordEvent('session-1', SessionEventType.CONTINUE, {});
      recorder.recordEvent('session-1', SessionEventType.PAUSE, {});

      const recording = recorder.getRecording('session-1');
      expect(
        recording?.events.some((e) => e.type === SessionEventType.STEP_OVER),
      ).toBe(true);
      expect(
        recording?.events.some((e) => e.type === SessionEventType.STEP_INTO),
      ).toBe(true);
      expect(
        recording?.events.some((e) => e.type === SessionEventType.STEP_OUT),
      ).toBe(true);
      expect(
        recording?.events.some((e) => e.type === SessionEventType.CONTINUE),
      ).toBe(true);
      expect(
        recording?.events.some((e) => e.type === SessionEventType.PAUSE),
      ).toBe(true);
    });

    it('should record error events', () => {
      recorder.recordEvent('session-1', SessionEventType.ERROR, {
        message: 'Test error',
      });

      const recording = recorder.getRecording('session-1');
      const errorEvent = recording?.events.find(
        (e) => e.type === SessionEventType.ERROR,
      );

      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data?.message).toBe('Test error');
    });
  });

  describe('Storage Management', () => {
    it('should limit events per recording', () => {
      recorder = new SessionRecorder(PrivacyMode.FULL, {
        maxEventsPerRecording: 5,
      });
      recorder.startRecording('session-1');

      // Record more than max
      for (let i = 0; i < 10; i++) {
        recorder.recordEvent('session-1', SessionEventType.STEP_OVER, {
          step: i,
        });
      }

      const recording = recorder.getRecording('session-1');
      expect(recording?.events.length).toBe(5);
    });

    it('should prune old recordings', async () => {
      recorder = new SessionRecorder(PrivacyMode.FULL, {
        retentionDays: -1, // Negative value means everything is expired
      });

      recorder.startRecording('session-1');
      recorder.stopRecording('session-1');

      const pruned = recorder.pruneOldRecordings();
      expect(pruned).toBe(1);
      expect(recorder.getRecording('session-1')).toBeUndefined();
    });

    it('should enforce recording limit', () => {
      recorder = new SessionRecorder(PrivacyMode.FULL, {
        maxRecordings: 3,
      });

      // Create more than max recordings
      for (let i = 0; i < 5; i++) {
        recorder.startRecording(`session-${i}`);
        recorder.stopRecording(`session-${i}`);
      }

      const deleted = recorder.enforceRecordingLimit();
      expect(deleted).toBe(2);

      const recordings = recorder.getAllRecordings();
      expect(recordings.length).toBe(3);
    });

    it('should delete specific recording', () => {
      recorder.startRecording('session-1');
      recorder.startRecording('session-2');

      expect(recorder.getRecording('session-1')).toBeDefined();

      const deleted = recorder.deleteRecording('session-1');
      expect(deleted).toBe(true);
      expect(recorder.getRecording('session-1')).toBeUndefined();
      expect(recorder.getRecording('session-2')).toBeDefined();
    });

    it('should clear all recordings', () => {
      recorder.startRecording('session-1');
      recorder.startRecording('session-2');
      recorder.startRecording('session-3');

      expect(recorder.getAllRecordings().length).toBe(3);

      recorder.clearAllRecordings();

      expect(recorder.getAllRecordings().length).toBe(0);
    });
  });

  describe('Import/Export', () => {
    beforeEach(() => {
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.BREAKPOINT_SET, {
        file: 'test.js',
      });
      recorder.stopRecording('session-1');
    });

    it('should export recording as JSON', () => {
      const json = recorder.exportRecording('session-1');

      expect(json).toBeDefined();
      expect(() => JSON.parse(json!)).not.toThrow();
    });

    it('should import recording from JSON', () => {
      const json = recorder.exportRecording('session-1')!;
      recorder.deleteRecording('session-1');

      expect(recorder.getRecording('session-1')).toBeUndefined();

      const imported = recorder.importRecording(json);
      expect(imported).toBe(true);
      expect(recorder.getRecording('session-1')).toBeDefined();
    });

    it('should handle invalid JSON on import', () => {
      const imported = recorder.importRecording('invalid json');
      expect(imported).toBe(false);
    });

    it('should return undefined for non-existent recording export', () => {
      const json = recorder.exportRecording('nonexistent');
      expect(json).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should return statistics for recordings', () => {
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.STEP_OVER, {});
      recorder.recordEvent('session-1', SessionEventType.STEP_OVER, {});
      recorder.stopRecording('session-1');

      recorder.startRecording('session-2');
      recorder.recordEvent('session-2', SessionEventType.STEP_OVER, {});
      recorder.stopRecording('session-2');

      const stats = recorder.getStatistics();

      expect(stats.totalRecordings).toBe(2);
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.averageEventsPerRecording).toBeGreaterThan(0);
      expect(stats.oldestRecording).toBeDefined();
      expect(stats.newestRecording).toBeDefined();
    });

    it('should return empty statistics when no recordings', () => {
      const stats = recorder.getStatistics();

      expect(stats.totalRecordings).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.averageEventsPerRecording).toBe(0);
      expect(stats.oldestRecording).toBeUndefined();
      expect(stats.newestRecording).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    it('should track event count in metadata', () => {
      recorder.startRecording('session-1');
      recorder.recordEvent('session-1', SessionEventType.STEP_OVER, {});
      recorder.recordEvent('session-1', SessionEventType.STEP_OVER, {});

      const recording = recorder.getRecording('session-1');
      expect(recording?.metadata.eventCount).toBe(3); // Including SESSION_START
    });

    it('should include privacy mode in metadata', () => {
      recorder = new SessionRecorder(PrivacyMode.MASKED);
      recorder.startRecording('session-1');

      const recording = recorder.getRecording('session-1');
      expect(recording?.metadata.privacyMode).toBe(PrivacyMode.MASKED);
    });

    it('should calculate duration on stop', async () => {
      recorder.startRecording('session-1');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      recorder.stopRecording('session-1');

      const recording = recorder.getRecording('session-1');
      expect(recording?.metadata.duration).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should allow changing privacy mode', () => {
      expect(recorder.getPrivacyMode()).toBe(PrivacyMode.MASKED);

      recorder.setPrivacyMode(PrivacyMode.FULL);
      expect(recorder.getPrivacyMode()).toBe(PrivacyMode.FULL);
    });

    it('should use custom storage config', () => {
      recorder = new SessionRecorder(PrivacyMode.FULL, {
        maxRecordings: 5,
        maxEventsPerRecording: 100,
        retentionDays: 30,
      });

      // Config is used internally, verify by testing behavior
      for (let i = 0; i < 10; i++) {
        recorder.startRecording(`session-${i}`);
      }

      recorder.enforceRecordingLimit();
      expect(recorder.getAllRecordings().length).toBe(5);
    });
  });
});
