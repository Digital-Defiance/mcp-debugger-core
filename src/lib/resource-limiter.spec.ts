import { ResourceLimiter } from './resource-limiter';

describe('ResourceLimiter', () => {
  let limiter: ResourceLimiter;

  beforeEach(() => {
    limiter = new ResourceLimiter({
      maxSessionsPerUser: 5,
      maxBreakpointsPerSession: 50,
      maxMemoryPerSession: 100 * 1024 * 1024, // 100MB
      maxSessionDuration: 3600000, // 1 hour
      maxWatchedVariablesPerSession: 20,
    });
  });

  describe('session limits', () => {
    it('should allow sessions within limit', () => {
      expect(() => limiter.checkSessionLimit('user1')).not.toThrow();
      limiter.registerSession('user1', 'session1');
      expect(() => limiter.checkSessionLimit('user1')).not.toThrow();
    });

    it('should throw when session limit exceeded', () => {
      for (let i = 0; i < 5; i++) {
        limiter.registerSession('user1', `session${i}`);
      }

      expect(() => limiter.checkSessionLimit('user1')).toThrow(
        'Session limit exceeded',
      );
    });

    it('should track sessions per user separately', () => {
      limiter.registerSession('user1', 'session1');
      limiter.registerSession('user2', 'session2');

      const usage = limiter.getUsage();
      expect(usage.sessionsPerUser.get('user1')).toBe(1);
      expect(usage.sessionsPerUser.get('user2')).toBe(1);
    });

    it('should unregister sessions correctly', () => {
      limiter.registerSession('user1', 'session1');
      limiter.unregisterSession('user1', 'session1');

      const usage = limiter.getUsage();
      expect(usage.sessionsPerUser.get('user1')).toBe(0);
    });
  });

  describe('breakpoint limits', () => {
    it('should allow breakpoints within limit', () => {
      limiter.registerSession('user1', 'session1');
      expect(() => limiter.checkBreakpointLimit('session1')).not.toThrow();
      limiter.registerBreakpoint('session1');
      expect(() => limiter.checkBreakpointLimit('session1')).not.toThrow();
    });

    it('should throw when breakpoint limit exceeded', () => {
      limiter.registerSession('user1', 'session1');

      for (let i = 0; i < 50; i++) {
        limiter.registerBreakpoint('session1');
      }

      expect(() => limiter.checkBreakpointLimit('session1')).toThrow(
        'Breakpoint limit exceeded',
      );
    });

    it('should unregister breakpoints correctly', () => {
      limiter.registerSession('user1', 'session1');
      limiter.registerBreakpoint('session1');
      limiter.unregisterBreakpoint('session1');

      const usage = limiter.getUsage();
      expect(usage.breakpointsPerSession.get('session1')).toBe(0);
    });
  });

  describe('watched variable limits', () => {
    it('should allow watched variables within limit', () => {
      limiter.registerSession('user1', 'session1');
      expect(() => limiter.checkWatchedVariableLimit('session1')).not.toThrow();
      limiter.registerWatchedVariable('session1');
      expect(() => limiter.checkWatchedVariableLimit('session1')).not.toThrow();
    });

    it('should throw when watched variable limit exceeded', () => {
      limiter.registerSession('user1', 'session1');

      for (let i = 0; i < 20; i++) {
        limiter.registerWatchedVariable('session1');
      }

      expect(() => limiter.checkWatchedVariableLimit('session1')).toThrow(
        'Watched variable limit exceeded',
      );
    });
  });

  describe('memory limits', () => {
    it('should allow memory usage within limit', () => {
      limiter.registerSession('user1', 'session1');
      expect(() =>
        limiter.updateMemoryUsage('session1', 50 * 1024 * 1024),
      ).not.toThrow();
    });

    it('should throw when memory limit exceeded', () => {
      limiter.registerSession('user1', 'session1');
      expect(() =>
        limiter.updateMemoryUsage('session1', 200 * 1024 * 1024),
      ).toThrow('Memory limit exceeded');
    });
  });

  describe('session duration', () => {
    it('should detect expired sessions', () => {
      jest.useFakeTimers();

      limiter.registerSession('user1', 'session1');

      // Advance time by 2 hours
      jest.advanceTimersByTime(2 * 3600000);

      expect(limiter.checkSessionDuration('session1')).toBe(true);

      jest.useRealTimers();
    });

    it('should not detect active sessions as expired', () => {
      limiter.registerSession('user1', 'session1');
      expect(limiter.checkSessionDuration('session1')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all usage tracking', () => {
      limiter.registerSession('user1', 'session1');
      limiter.registerBreakpoint('session1');
      limiter.registerWatchedVariable('session1');

      limiter.reset();

      const usage = limiter.getUsage();
      expect(usage.sessionsPerUser.size).toBe(0);
      expect(usage.breakpointsPerSession.size).toBe(0);
      expect(usage.watchedVariablesPerSession.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle unregistering session with zero count', () => {
      limiter.registerSession('user1', 'session1');
      limiter.unregisterSession('user1', 'session1');
      limiter.unregisterSession('user1', 'session1'); // Second time

      const usage = limiter.getUsage();
      expect(usage.sessionsPerUser.get('user1')).toBe(0);
    });

    it('should handle unregistering breakpoint with zero count', () => {
      limiter.registerSession('user1', 'session1');
      limiter.unregisterBreakpoint('session1'); // No breakpoints registered

      const usage = limiter.getUsage();
      expect(usage.breakpointsPerSession.get('session1')).toBe(0);
    });

    it('should handle unregistering watched variable with zero count', () => {
      limiter.registerSession('user1', 'session1');
      limiter.unregisterWatchedVariable('session1'); // No watched variables registered

      const usage = limiter.getUsage();
      expect(usage.watchedVariablesPerSession.get('session1')).toBe(0);
    });

    it('should check session duration for non-existent session', () => {
      expect(limiter.checkSessionDuration('non-existent')).toBe(false);
    });

    it('should get limits', () => {
      const limits = limiter.getLimits();
      expect(limits.maxSessionsPerUser).toBe(5);
      expect(limits.maxBreakpointsPerSession).toBe(50);
      expect(limits.maxMemoryPerSession).toBe(100 * 1024 * 1024);
      expect(limits.maxSessionDuration).toBe(3600000);
      expect(limits.maxWatchedVariablesPerSession).toBe(20);
    });

    it('should track memory usage', () => {
      limiter.registerSession('user1', 'session1');
      limiter.updateMemoryUsage('session1', 50 * 1024 * 1024);

      const usage = limiter.getUsage();
      expect(usage.memoryPerSession.get('session1')).toBe(50 * 1024 * 1024);
    });

    it('should initialize session with zero breakpoints and watched variables', () => {
      limiter.registerSession('user1', 'session1');

      const usage = limiter.getUsage();
      expect(usage.breakpointsPerSession.get('session1')).toBe(0);
      expect(usage.watchedVariablesPerSession.get('session1')).toBe(0);
    });
  });
});
