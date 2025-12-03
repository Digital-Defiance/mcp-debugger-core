import { AuthManager } from './auth-manager';

describe('AuthManager', () => {
  describe('Token Management', () => {
    it('should generate a valid token', () => {
      const authManager = new AuthManager({ enabled: true });
      const token = authManager.generateToken();

      expect(token.token).toBeDefined();
      expect(token.token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token.createdAt).toBeInstanceOf(Date);
      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.expiresAt.getTime()).toBeGreaterThan(
        token.createdAt.getTime(),
      );
    });

    it('should generate tokens with metadata', () => {
      const authManager = new AuthManager({ enabled: true });
      const metadata = { userId: '123', role: 'admin' };
      const token = authManager.generateToken(metadata);

      expect(token.metadata).toEqual(metadata);
    });

    it('should validate a valid token', () => {
      const authManager = new AuthManager({ enabled: true });
      const token = authManager.generateToken();

      expect(authManager.validateToken(token.token)).toBe(true);
    });

    it('should reject an invalid token', () => {
      const authManager = new AuthManager({ enabled: true });

      expect(authManager.validateToken('invalid-token')).toBe(false);
    });

    it('should reject an expired token', () => {
      const authManager = new AuthManager({
        enabled: true,
        tokenExpirationMs: 100, // 100ms expiration
      });
      const token = authManager.generateToken();

      // Wait for token to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(authManager.validateToken(token.token)).toBe(false);
          resolve();
        }, 150);
      });
    });

    it('should revoke a token', () => {
      const authManager = new AuthManager({ enabled: true });
      const token = authManager.generateToken();

      expect(authManager.validateToken(token.token)).toBe(true);
      expect(authManager.revokeToken(token.token)).toBe(true);
      expect(authManager.validateToken(token.token)).toBe(false);
    });

    it('should return false when revoking non-existent token', () => {
      const authManager = new AuthManager({ enabled: true });

      expect(authManager.revokeToken('non-existent')).toBe(false);
    });

    it('should cleanup expired tokens', () => {
      const authManager = new AuthManager({
        enabled: true,
        tokenExpirationMs: 100,
      });

      authManager.generateToken();
      authManager.generateToken();

      expect(authManager.getActiveTokenCount()).toBe(2);

      // Wait for tokens to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          authManager.cleanupExpiredTokens();
          expect(authManager.getActiveTokenCount()).toBe(0);
          resolve();
        }, 150);
      });
    });

    it('should allow all tokens when authentication is disabled', () => {
      const authManager = new AuthManager({ enabled: false });

      expect(authManager.validateToken('any-token')).toBe(true);
    });
  });

  describe('API Key Management', () => {
    it('should create a valid API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      const apiKey = authManager.createApiKey('test-key');

      expect(apiKey.key).toBeDefined();
      expect(apiKey.key).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(apiKey.hashedKey).toBeDefined();
      expect(apiKey.hashedKey).not.toBe(apiKey.key);
      expect(apiKey.name).toBe('test-key');
      expect(apiKey.enabled).toBe(true);
      expect(apiKey.createdAt).toBeInstanceOf(Date);
    });

    it('should create API keys with metadata', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      const metadata = { scope: 'read-only', environment: 'production' };
      const apiKey = authManager.createApiKey('test-key', metadata);

      expect(apiKey.metadata).toEqual(metadata);
    });

    it('should validate a valid API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      const apiKey = authManager.createApiKey('test-key');

      expect(authManager.validateApiKey(apiKey.key)).toBe(true);
    });

    it('should reject an invalid API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });

      expect(authManager.validateApiKey('invalid-key')).toBe(false);
    });

    it('should reject a revoked API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      const apiKey = authManager.createApiKey('test-key');

      expect(authManager.validateApiKey(apiKey.key)).toBe(true);
      expect(authManager.revokeApiKey(apiKey.key)).toBe(true);
      expect(authManager.validateApiKey(apiKey.key)).toBe(false);
    });

    it('should return false when revoking non-existent API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });

      expect(authManager.revokeApiKey('non-existent')).toBe(false);
    });

    it('should delete an API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      const apiKey = authManager.createApiKey('test-key');

      expect(authManager.validateApiKey(apiKey.key)).toBe(true);
      expect(authManager.deleteApiKey(apiKey.key)).toBe(true);
      expect(authManager.validateApiKey(apiKey.key)).toBe(false);
    });

    it('should return false when deleting non-existent API key', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });

      expect(authManager.deleteApiKey('non-existent')).toBe(false);
    });

    it('should list all API keys without exposing the actual keys', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      authManager.createApiKey('key1');
      authManager.createApiKey('key2');

      const keys = authManager.getAllApiKeys();

      expect(keys).toHaveLength(2);
      keys.forEach((key) => {
        expect(key).not.toHaveProperty('key');
        expect(key).toHaveProperty('hashedKey');
        expect(key).toHaveProperty('name');
        expect(key).toHaveProperty('enabled');
      });
    });

    it('should allow all API keys when authentication is disabled', () => {
      const authManager = new AuthManager({ enabled: false });

      expect(authManager.validateApiKey('any-key')).toBe(true);
    });

    it('should allow all API keys when requireApiKey is false', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: false,
      });

      expect(authManager.validateApiKey('any-key')).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should report authentication status', () => {
      const enabledAuth = new AuthManager({ enabled: true });
      const disabledAuth = new AuthManager({ enabled: false });

      expect(enabledAuth.isEnabled()).toBe(true);
      expect(disabledAuth.isEnabled()).toBe(false);
    });

    it('should report API key requirement status', () => {
      const withApiKey = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });
      const withoutApiKey = new AuthManager({
        enabled: true,
        requireApiKey: false,
      });
      const disabled = new AuthManager({ enabled: false });

      expect(withApiKey.requiresApiKey()).toBe(true);
      expect(withoutApiKey.requiresApiKey()).toBe(false);
      expect(disabled.requiresApiKey()).toBe(false);
    });

    it('should get active token count', () => {
      const authManager = new AuthManager({ enabled: true });

      expect(authManager.getActiveTokenCount()).toBe(0);
      authManager.generateToken();
      expect(authManager.getActiveTokenCount()).toBe(1);
      authManager.generateToken();
      expect(authManager.getActiveTokenCount()).toBe(2);
    });

    it('should get API key count', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });

      expect(authManager.getApiKeyCount()).toBe(0);
      authManager.createApiKey('key1');
      expect(authManager.getApiKeyCount()).toBe(1);
      authManager.createApiKey('key2');
      expect(authManager.getApiKeyCount()).toBe(2);
    });

    it('should clear all tokens and API keys', () => {
      const authManager = new AuthManager({
        enabled: true,
        requireApiKey: true,
      });

      authManager.generateToken();
      authManager.generateToken();
      authManager.createApiKey('key1');
      authManager.createApiKey('key2');

      expect(authManager.getActiveTokenCount()).toBe(2);
      expect(authManager.getApiKeyCount()).toBe(2);

      authManager.clear();

      expect(authManager.getActiveTokenCount()).toBe(0);
      expect(authManager.getApiKeyCount()).toBe(0);
    });
  });
});
