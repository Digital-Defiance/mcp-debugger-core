import { StructuredLogger, LogLevel } from './structured-logger';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    jest
      .spyOn(console, 'debug')
      .mockImplementation((msg) => consoleOutput.push(msg));
    jest
      .spyOn(console, 'info')
      .mockImplementation((msg) => consoleOutput.push(msg));
    jest
      .spyOn(console, 'warn')
      .mockImplementation((msg) => consoleOutput.push(msg));
    jest
      .spyOn(console, 'error')
      .mockImplementation((msg) => consoleOutput.push(msg));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Log Levels', () => {
    it('should log messages at or above minimum level', () => {
      logger = new StructuredLogger({
        minLevel: LogLevel.INFO,
        enableJson: false,
      });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleOutput.length).toBe(3); // info, warn, error
      expect(consoleOutput[0]).toContain('Info message');
      expect(consoleOutput[1]).toContain('Warn message');
      expect(consoleOutput[2]).toContain('Error message');
    });

    it('should log all messages when level is DEBUG', () => {
      logger = new StructuredLogger({
        minLevel: LogLevel.DEBUG,
        enableJson: false,
      });

      logger.debug('Debug message');
      logger.info('Info message');

      expect(consoleOutput.length).toBe(2);
      expect(consoleOutput[0]).toContain('Debug message');
      expect(consoleOutput[1]).toContain('Info message');
    });

    it('should only log errors when level is ERROR', () => {
      logger = new StructuredLogger({
        minLevel: LogLevel.ERROR,
        enableJson: false,
      });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('Error message');
    });
  });

  describe('Structured Logging', () => {
    beforeEach(() => {
      logger = new StructuredLogger({ enableJson: true });
    });

    it('should include correlation ID in log entry', () => {
      const correlationId = logger.generateCorrelationId();
      logger.info('Test message', { correlationId });

      const logs = logger.getRecentLogs();
      expect(logs[0].correlationId).toBe(correlationId);
    });

    it('should include session ID in log entry', () => {
      const sessionId = 'test-session-123';
      logger.info('Test message', { sessionId });

      const logs = logger.getRecentLogs();
      expect(logs[0].sessionId).toBe(sessionId);
    });

    it('should include operation type in log entry', () => {
      const operationType = 'debugger_start';
      logger.info('Test message', { operationType });

      const logs = logger.getRecentLogs();
      expect(logs[0].operationType).toBe(operationType);
    });

    it('should include additional context in log entry', () => {
      const context = { userId: 'user123', action: 'create' };
      logger.info('Test message', { additionalContext: context });

      const logs = logger.getRecentLogs();
      expect(logs[0].context).toEqual(context);
    });

    it('should include error details in log entry', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', { error });

      const logs = logger.getRecentLogs();
      expect(logs[0].error?.message).toBe('Test error');
      expect(logs[0].error?.stack).toBeDefined();
    });

    it('should include all context fields together', () => {
      const correlationId = logger.generateCorrelationId();
      const sessionId = 'session-456';
      const operationType = 'debugger_continue';
      const additionalContext = { step: 1 };

      logger.info('Complex log', {
        correlationId,
        sessionId,
        operationType,
        additionalContext,
      });

      const logs = logger.getRecentLogs();
      expect(logs[0].correlationId).toBe(correlationId);
      expect(logs[0].sessionId).toBe(sessionId);
      expect(logs[0].operationType).toBe(operationType);
      expect(logs[0].context).toEqual(additionalContext);
    });
  });

  describe('JSON Format', () => {
    beforeEach(() => {
      logger = new StructuredLogger({ enableJson: true });
    });

    it('should output valid JSON when JSON format is enabled', () => {
      logger.info('Test message');

      expect(() => JSON.parse(consoleOutput[0])).not.toThrow();
    });

    it('should include timestamp in JSON output', () => {
      logger.info('Test message');

      const parsed = JSON.parse(consoleOutput[0]);
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include level in JSON output', () => {
      logger.info('Test message');

      const parsed = JSON.parse(consoleOutput[0]);
      expect(parsed.level).toBe('info');
    });
  });

  describe('Human-Readable Format', () => {
    beforeEach(() => {
      logger = new StructuredLogger({ enableJson: false });
    });

    it('should output human-readable format when JSON is disabled', () => {
      logger.info('Test message');

      expect(consoleOutput[0]).toContain('[INFO]');
      expect(consoleOutput[0]).toContain('Test message');
    });

    it('should include correlation ID in human-readable format', () => {
      const correlationId = 'abc123';
      logger.info('Test message', { correlationId });

      expect(consoleOutput[0]).toContain(`[${correlationId}]`);
    });

    it('should include session ID in human-readable format', () => {
      const sessionId = 'session-789';
      logger.info('Test message', { sessionId });

      expect(consoleOutput[0]).toContain(`[session:${sessionId}]`);
    });

    it('should include operation type in human-readable format', () => {
      const operationType = 'debugger_pause';
      logger.info('Test message', { operationType });

      expect(consoleOutput[0]).toContain(`[op:${operationType}]`);
    });
  });

  describe('Log Buffer', () => {
    beforeEach(() => {
      logger = new StructuredLogger({ enableConsole: false });
    });

    it('should store logs in buffer', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');

      const logs = logger.getRecentLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].message).toBe('Message 1');
      expect(logs[1].message).toBe('Message 2');
      expect(logs[2].message).toBe('Message 3');
    });

    it('should return limited number of recent logs', () => {
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getRecentLogs(5);
      expect(logs.length).toBe(5);
      expect(logs[0].message).toBe('Message 5');
      expect(logs[4].message).toBe('Message 9');
    });

    it('should clear log buffer', () => {
      logger.info('Message 1');
      logger.info('Message 2');

      expect(logger.getRecentLogs().length).toBe(2);

      logger.clearLogs();

      expect(logger.getRecentLogs().length).toBe(0);
    });

    it('should limit buffer size to prevent memory issues', () => {
      // Log more than max buffer size (1000)
      for (let i = 0; i < 1100; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getRecentLogs();
      expect(logs.length).toBe(1000);
      // Should have the most recent 1000 logs
      expect(logs[0].message).toBe('Message 100');
      expect(logs[999].message).toBe('Message 1099');
    });
  });

  describe('Configuration', () => {
    it('should allow changing minimum log level', () => {
      logger = new StructuredLogger({
        minLevel: LogLevel.INFO,
        enableJson: false,
      });

      logger.debug('Debug message');
      expect(consoleOutput.length).toBe(0);

      logger.setMinLevel(LogLevel.DEBUG);
      logger.debug('Debug message 2');
      expect(consoleOutput.length).toBe(1);
    });

    it('should return current configuration', () => {
      logger = new StructuredLogger({
        minLevel: LogLevel.WARN,
        enableJson: true,
        enableConsole: false,
      });

      const config = logger.getConfig();
      expect(config.minLevel).toBe(LogLevel.WARN);
      expect(config.enableJson).toBe(true);
      expect(config.enableConsole).toBe(false);
    });

    it('should disable console output when configured', () => {
      logger = new StructuredLogger({ enableConsole: false });

      logger.info('Test message');

      expect(consoleOutput.length).toBe(0);
    });

    it('should disable timestamp when configured', () => {
      logger = new StructuredLogger({ includeTimestamp: false });

      logger.info('Test message');

      const logs = logger.getRecentLogs();
      expect(logs[0].timestamp).toBe('');
    });
  });

  describe('Correlation ID Generation', () => {
    beforeEach(() => {
      logger = new StructuredLogger();
    });

    it('should generate unique correlation IDs', () => {
      const id1 = logger.generateCorrelationId();
      const id2 = logger.generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });

    it('should generate hex string correlation IDs', () => {
      const id = logger.generateCorrelationId();

      expect(id).toMatch(/^[0-9a-f]+$/);
    });
  });
});
