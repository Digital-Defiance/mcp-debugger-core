import { AuditLogger, AuditLogEntry } from './audit-logger';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  describe('constructor', () => {
    it('should create logger with default max logs', () => {
      const logger = new AuditLogger();
      expect(logger.getLogCount()).toBe(0);
    });

    it('should create logger with custom max logs', () => {
      const logger = new AuditLogger(100);
      expect(logger.getLogCount()).toBe(0);
    });

    it('should create logger with console logging enabled', () => {
      const logger = new AuditLogger(1000, true);
      expect(logger.getLogCount()).toBe(0);
    });
  });

  describe('log', () => {
    it('should log a successful operation', () => {
      logger.log(
        'session-1',
        'setBreakpoint',
        { file: 'test.js', line: 10 },
        true,
      );

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].sessionId).toBe('session-1');
      expect(logs[0].operation).toBe('setBreakpoint');
      expect(logs[0].details).toEqual({ file: 'test.js', line: 10 });
      expect(logs[0].success).toBe(true);
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });

    it('should log a failed operation with error', () => {
      logger.log(
        'session-2',
        'continue',
        { reason: 'test' },
        false,
        'Process not paused',
      );

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('Process not paused');
    });

    it('should log operation with userId', () => {
      logger.log(
        'session-3',
        'inspect',
        { expression: 'x' },
        true,
        undefined,
        'user-123',
      );

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe('user-123');
    });

    it('should implement log rotation when max logs exceeded', () => {
      const smallLogger = new AuditLogger(3);

      smallLogger.log('session-1', 'op1', {}, true);
      smallLogger.log('session-1', 'op2', {}, true);
      smallLogger.log('session-1', 'op3', {}, true);
      smallLogger.log('session-1', 'op4', {}, true);

      const logs = smallLogger.getAllLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].operation).toBe('op2'); // op1 was removed
      expect(logs[1].operation).toBe('op3');
      expect(logs[2].operation).toBe('op4');
    });

    it('should log to console when enabled', () => {
      const consoleLogger = new AuditLogger(1000, true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      consoleLogger.log('session-1', 'test', { data: 'value' }, true);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('session-1'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test'));

      consoleSpy.mockRestore();
    });

    it('should not log to console when disabled', () => {
      const consoleLogger = new AuditLogger(1000, false);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      consoleLogger.log('session-1', 'test', { data: 'value' }, true);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getAllLogs', () => {
    it('should return empty array initially', () => {
      expect(logger.getAllLogs()).toEqual([]);
    });

    it('should return all logged entries', () => {
      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, true);
      logger.log('session-3', 'op3', {}, false, 'error');

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(3);
    });

    it('should return a copy of logs array', () => {
      logger.log('session-1', 'op1', {}, true);

      const logs1 = logger.getAllLogs();
      const logs2 = logger.getAllLogs();

      expect(logs1).not.toBe(logs2); // Different array instances
      expect(logs1).toEqual(logs2); // Same content
    });
  });

  describe('getSessionLogs', () => {
    beforeEach(() => {
      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, true);
      logger.log('session-1', 'op3', {}, false);
      logger.log('session-3', 'op4', {}, true);
    });

    it('should return logs for specific session', () => {
      const logs = logger.getSessionLogs('session-1');

      expect(logs).toHaveLength(2);
      expect(logs[0].operation).toBe('op1');
      expect(logs[1].operation).toBe('op3');
    });

    it('should return empty array for non-existent session', () => {
      const logs = logger.getSessionLogs('session-999');

      expect(logs).toEqual([]);
    });

    it('should return empty array when no logs exist', () => {
      const emptyLogger = new AuditLogger();
      const logs = emptyLogger.getSessionLogs('session-1');

      expect(logs).toEqual([]);
    });
  });

  describe('getOperationLogs', () => {
    beforeEach(() => {
      logger.log('session-1', 'setBreakpoint', {}, true);
      logger.log('session-2', 'continue', {}, true);
      logger.log('session-3', 'setBreakpoint', {}, false);
      logger.log('session-4', 'inspect', {}, true);
    });

    it('should return logs for specific operation', () => {
      const logs = logger.getOperationLogs('setBreakpoint');

      expect(logs).toHaveLength(2);
      expect(logs[0].sessionId).toBe('session-1');
      expect(logs[1].sessionId).toBe('session-3');
    });

    it('should return empty array for non-existent operation', () => {
      const logs = logger.getOperationLogs('nonExistentOp');

      expect(logs).toEqual([]);
    });
  });

  describe('getFailedOperations', () => {
    beforeEach(() => {
      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, false, 'error1');
      logger.log('session-3', 'op3', {}, true);
      logger.log('session-4', 'op4', {}, false, 'error2');
    });

    it('should return only failed operations', () => {
      const logs = logger.getFailedOperations();

      expect(logs).toHaveLength(2);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('error1');
      expect(logs[1].success).toBe(false);
      expect(logs[1].error).toBe('error2');
    });

    it('should return empty array when no failures', () => {
      const successLogger = new AuditLogger();
      successLogger.log('session-1', 'op1', {}, true);
      successLogger.log('session-2', 'op2', {}, true);

      const logs = successLogger.getFailedOperations();

      expect(logs).toEqual([]);
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, true);
      logger.log('session-3', 'op3', {}, true);

      expect(logger.getLogCount()).toBe(3);

      logger.clearLogs();

      expect(logger.getLogCount()).toBe(0);
      expect(logger.getAllLogs()).toEqual([]);
    });

    it('should work on empty logger', () => {
      logger.clearLogs();

      expect(logger.getLogCount()).toBe(0);
    });
  });

  describe('exportLogsAsJson', () => {
    it('should export logs as formatted JSON', () => {
      logger.log('session-1', 'op1', { key: 'value' }, true);

      const json = logger.exportLogsAsJson();

      expect(json).toContain('session-1');
      expect(json).toContain('op1');
      expect(json).toContain('key');
      expect(json).toContain('value');

      // Should be parseable
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
    });

    it('should export empty array for no logs', () => {
      const json = logger.exportLogsAsJson();

      expect(json).toBe('[]');
    });

    it('should handle complex details objects', () => {
      logger.log(
        'session-1',
        'op1',
        {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          bool: true,
        },
        true,
      );

      const json = logger.exportLogsAsJson();
      const parsed = JSON.parse(json);

      expect(parsed[0].details.nested.deep.value).toBe(123);
      expect(parsed[0].details.array).toEqual([1, 2, 3]);
      expect(parsed[0].details.bool).toBe(true);
    });
  });

  describe('getLogsByTimeRange', () => {
    it('should return logs within time range', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000); // 10 seconds ago
      const future = new Date(now.getTime() + 10000); // 10 seconds from now

      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, true);

      const logs = logger.getLogsByTimeRange(past, future);

      expect(logs).toHaveLength(2);
    });

    it('should exclude logs outside time range', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);
      const veryPast = new Date(now.getTime() - 20000);

      logger.log('session-1', 'op1', {}, true);

      const logs = logger.getLogsByTimeRange(veryPast, past);

      expect(logs).toHaveLength(0);
    });

    it('should handle exact boundary times', () => {
      logger.log('session-1', 'op1', {}, true);

      const logs = logger.getAllLogs();
      const timestamp = logs[0].timestamp;

      const logsInRange = logger.getLogsByTimeRange(timestamp, timestamp);

      expect(logsInRange).toHaveLength(1);
    });

    it('should return empty array for empty logger', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);

      const logs = logger.getLogsByTimeRange(past, now);

      expect(logs).toEqual([]);
    });
  });

  describe('getLogCount', () => {
    it('should return 0 initially', () => {
      expect(logger.getLogCount()).toBe(0);
    });

    it('should return correct count after logging', () => {
      logger.log('session-1', 'op1', {}, true);
      expect(logger.getLogCount()).toBe(1);

      logger.log('session-2', 'op2', {}, true);
      expect(logger.getLogCount()).toBe(2);

      logger.log('session-3', 'op3', {}, true);
      expect(logger.getLogCount()).toBe(3);
    });

    it('should return 0 after clearing', () => {
      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, true);

      logger.clearLogs();

      expect(logger.getLogCount()).toBe(0);
    });

    it('should respect max logs limit', () => {
      const smallLogger = new AuditLogger(5);

      for (let i = 0; i < 10; i++) {
        smallLogger.log(`session-${i}`, `op${i}`, {}, true);
      }

      expect(smallLogger.getLogCount()).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty details object', () => {
      logger.log('session-1', 'op1', {}, true);

      const logs = logger.getAllLogs();
      expect(logs[0].details).toEqual({});
    });

    it('should handle undefined error for successful operations', () => {
      logger.log('session-1', 'op1', {}, true, undefined);

      const logs = logger.getAllLogs();
      expect(logs[0].error).toBeUndefined();
    });

    it('should handle undefined userId', () => {
      logger.log('session-1', 'op1', {}, true, undefined, undefined);

      const logs = logger.getAllLogs();
      expect(logs[0].userId).toBeUndefined();
    });

    it('should handle multiple rapid logs', () => {
      for (let i = 0; i < 100; i++) {
        logger.log(`session-${i}`, `op${i}`, { index: i }, true);
      }

      expect(logger.getLogCount()).toBe(100);
    });

    it('should maintain log order', () => {
      logger.log('session-1', 'op1', {}, true);
      logger.log('session-2', 'op2', {}, true);
      logger.log('session-3', 'op3', {}, true);

      const logs = logger.getAllLogs();
      expect(logs[0].operation).toBe('op1');
      expect(logs[1].operation).toBe('op2');
      expect(logs[2].operation).toBe('op3');
    });
  });
});
