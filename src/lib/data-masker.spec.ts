import { DataMasker } from './data-masker';

describe('DataMasker', () => {
  describe('Email Masking', () => {
    it('should mask email addresses', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      const input = 'Contact us at support@example.com for help';
      const output = masker.maskString(input);

      expect(output).toBe('Contact us at [EMAIL] for help');
    });

    it('should mask multiple email addresses', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      const input = 'Email john@example.com or jane@example.org';
      const output = masker.maskString(input);

      expect(output).toBe('Email [EMAIL] or [EMAIL]');
    });

    it('should not mask emails when disabled', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: false });
      const input = 'Contact us at support@example.com';
      const output = masker.maskString(input);

      expect(output).toBe(input);
    });
  });

  describe('Phone Number Masking', () => {
    it('should mask phone numbers', () => {
      const masker = new DataMasker({ enabled: true, maskPhones: true });
      const input = 'Call us at 555-123-4567';
      const output = masker.maskString(input);

      expect(output).toBe('Call us at [PHONE]');
    });

    it('should mask phone numbers with different formats', () => {
      const masker = new DataMasker({ enabled: true, maskPhones: true });

      expect(masker.maskString('555-123-4567')).toBe('[PHONE]');
      expect(masker.maskString('(555) 123-4567')).toBe('[PHONE]');
      expect(masker.maskString('555.123.4567')).toBe('[PHONE]');
      expect(masker.maskString('+1-555-123-4567')).toBe('[PHONE]');
    });
  });

  describe('Credit Card Masking', () => {
    it('should mask credit card numbers', () => {
      const masker = new DataMasker({ enabled: true, maskCreditCards: true });
      const input = 'Card number: 4532-1234-5678-9010';
      const output = masker.maskString(input);

      expect(output).toBe('Card number: [CREDIT_CARD]');
    });

    it('should mask credit cards with different formats', () => {
      const masker = new DataMasker({ enabled: true, maskCreditCards: true });

      expect(masker.maskString('4532-1234-5678-9010')).toBe('[CREDIT_CARD]');
      expect(masker.maskString('4532 1234 5678 9010')).toBe('[CREDIT_CARD]');
      expect(masker.maskString('4532123456789010')).toBe('[CREDIT_CARD]');
    });
  });

  describe('SSN Masking', () => {
    it('should mask social security numbers', () => {
      const masker = new DataMasker({ enabled: true, maskSSNs: true });
      const input = 'SSN: 123-45-6789';
      const output = masker.maskString(input);

      expect(output).toBe('SSN: [SSN]');
    });
  });

  describe('API Key Masking', () => {
    it('should mask long alphanumeric strings (API keys)', () => {
      const masker = new DataMasker({ enabled: true, maskApiKeys: true });
      const input = 'API Key: abcdef1234567890abcdef1234567890';
      const output = masker.maskString(input);

      expect(output).toBe('API Key: [API_KEY]');
    });
  });

  describe('Password Masking', () => {
    it('should mask password values', () => {
      const masker = new DataMasker({ enabled: true, maskPasswords: true });

      expect(masker.maskString('password: secret123')).toBe(
        'password: [REDACTED]',
      );
      expect(masker.maskString('pwd=mypassword')).toBe('pwd: [REDACTED]');
      expect(masker.maskString('token: "abc123"')).toBe('token: [REDACTED]');
    });
  });

  describe('Object Masking', () => {
    it('should mask strings in objects', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      const input = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
      };
      const output = masker.maskObject(input);

      expect(output.name).toBe('John Doe');
      expect(output.email).toBe('[EMAIL]');
    });

    it('should mask nested objects', () => {
      const masker = new DataMasker({
        enabled: true,
        maskEmails: true,
        maskPhones: true,
      });
      const input = {
        user: {
          name: 'John Doe',
          contact: {
            email: 'john@example.com',
            phone: '555-123-4567',
          },
        },
      };
      const output = masker.maskObject(input);

      expect(output.user.name).toBe('John Doe');
      expect(output.user.contact.email).toBe('[EMAIL]');
      expect(output.user.contact.phone).toBe('[PHONE]');
    });

    it('should mask arrays', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      const input = {
        emails: ['john@example.com', 'jane@example.org'],
      };
      const output = masker.maskObject(input);

      expect(output.emails).toEqual(['[EMAIL]', '[EMAIL]']);
    });

    it('should respect max depth', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      const input = {
        level1: {
          level2: {
            level3: {
              email: 'john@example.com',
            },
          },
        },
      };

      const output = masker.maskObject(input, 2);

      // At depth 2, we stop recursing, so the email won't be masked
      expect(output.level1.level2.level3.email).toBe('john@example.com');
    });

    it('should handle null and undefined values', () => {
      const masker = new DataMasker({ enabled: true });
      const input = {
        value1: null,
        value2: undefined,
        value3: 'test',
      };
      const output = masker.maskObject(input);

      expect(output.value1).toBeNull();
      expect(output.value2).toBeUndefined();
      expect(output.value3).toBe('test');
    });
  });

  describe('Custom Rules', () => {
    it('should add custom masking rules', () => {
      const masker = new DataMasker({ enabled: true });
      masker.addRule({
        name: 'custom',
        pattern: /SECRET-\d+/g,
        replacement: '[CUSTOM_SECRET]',
        enabled: true,
      });

      const input = 'Code: SECRET-12345';
      const output = masker.maskString(input);

      expect(output).toBe('Code: [CUSTOM_SECRET]');
    });

    it('should remove custom rules', () => {
      const masker = new DataMasker({ enabled: true });
      masker.addRule({
        name: 'custom',
        pattern: /SECRET-\d+/g,
        replacement: '[CUSTOM_SECRET]',
        enabled: true,
      });

      expect(masker.removeRule('custom')).toBe(true);
      expect(masker.getRule('custom')).toBeUndefined();
    });

    it('should enable and disable rules', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });

      masker.disableRule('email');
      expect(masker.maskString('test@example.com')).toBe('test@example.com');

      masker.enableRule('email');
      expect(masker.maskString('test@example.com')).toBe('[EMAIL]');
    });

    it('should get all rules', () => {
      const masker = new DataMasker({
        enabled: true,
        maskEmails: true,
        maskPhones: true,
      });

      const rules = masker.getRules();
      expect(rules.length).toBeGreaterThanOrEqual(2);
      expect(rules.some((r) => r.name === 'email')).toBe(true);
      expect(rules.some((r) => r.name === 'phone')).toBe(true);
    });

    it('should clear custom rules', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      masker.addRule({
        name: 'custom1',
        pattern: /TEST1/g,
        replacement: '[TEST1]',
        enabled: true,
      });
      masker.addRule({
        name: 'custom2',
        pattern: /TEST2/g,
        replacement: '[TEST2]',
        enabled: true,
      });

      const rulesBefore = masker.getRules();
      expect(rulesBefore.some((r) => r.name === 'custom1')).toBe(true);
      expect(rulesBefore.some((r) => r.name === 'custom2')).toBe(true);

      masker.clearCustomRules();

      const rulesAfter = masker.getRules();
      expect(rulesAfter.some((r) => r.name === 'custom1')).toBe(false);
      expect(rulesAfter.some((r) => r.name === 'custom2')).toBe(false);
      expect(rulesAfter.some((r) => r.name === 'email')).toBe(true); // Built-in rules remain
    });
  });

  describe('Configuration', () => {
    it('should not mask when disabled', () => {
      const masker = new DataMasker({ enabled: false });
      const input = 'Email: test@example.com, Phone: 555-123-4567';
      const output = masker.maskString(input);

      expect(output).toBe(input);
    });

    it('should enable and disable masking', () => {
      const masker = new DataMasker({ enabled: false, maskEmails: true });

      expect(masker.isEnabled()).toBe(false);
      expect(masker.maskString('test@example.com')).toBe('test@example.com');

      masker.enable();
      expect(masker.isEnabled()).toBe(true);
      expect(masker.maskString('test@example.com')).toBe('[EMAIL]');

      masker.disable();
      expect(masker.isEnabled()).toBe(false);
      expect(masker.maskString('test@example.com')).toBe('test@example.com');
    });

    it('should get current configuration', () => {
      const config = {
        enabled: true,
        maskEmails: true,
        maskPhones: false,
      };
      const masker = new DataMasker(config);

      const currentConfig = masker.getConfig();
      expect(currentConfig.enabled).toBe(true);
      expect(currentConfig.maskEmails).toBe(true);
      expect(currentConfig.maskPhones).toBe(false);
    });
  });

  describe('Integration', () => {
    it('should mask multiple types of sensitive data', () => {
      const masker = new DataMasker({
        enabled: true,
        maskEmails: true,
        maskPhones: true,
        maskCreditCards: true,
        maskSSNs: true,
      });

      const input = `
        Contact: john@example.com
        Phone: 555-123-4567
        Card: 4532-1234-5678-9010
        SSN: 123-45-6789
      `;

      const output = masker.maskString(input);

      expect(output).toContain('[EMAIL]');
      expect(output).toContain('[PHONE]');
      expect(output).toContain('[CREDIT_CARD]');
      expect(output).toContain('[SSN]');
      expect(output).not.toContain('john@example.com');
      expect(output).not.toContain('555-123-4567');
      expect(output).not.toContain('4532-1234-5678-9010');
      expect(output).not.toContain('123-45-6789');
    });

    it('should mask complex objects with mixed data', () => {
      const masker = new DataMasker({
        enabled: true,
        maskEmails: true,
        maskPhones: true,
        maskCreditCards: true,
      });

      const input = {
        users: [
          {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '555-123-4567',
          },
          {
            name: 'Jane Smith',
            email: 'jane@example.org',
            phone: '555-987-6543',
          },
        ],
        payment: {
          card: '4532-1234-5678-9010',
          amount: 100,
        },
      };

      const output = masker.maskObject(input);

      expect(output.users[0].email).toBe('[EMAIL]');
      expect(output.users[0].phone).toBe('[PHONE]');
      expect(output.users[1].email).toBe('[EMAIL]');
      expect(output.users[1].phone).toBe('[PHONE]');
      expect(output.payment.card).toBe('[CREDIT_CARD]');
      expect(output.payment.amount).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('should handle disabled rules', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });
      masker.disableRule('email');

      const input = 'Email: test@example.com';
      const output = masker.maskString(input);

      expect(output).toBe(input);
    });

    it('should return false when removing non-existent rule', () => {
      const masker = new DataMasker({ enabled: true });

      expect(masker.removeRule('non-existent')).toBe(false);
    });

    it('should return false when enabling non-existent rule', () => {
      const masker = new DataMasker({ enabled: true });

      expect(masker.enableRule('non-existent')).toBe(false);
    });

    it('should return false when disabling non-existent rule', () => {
      const masker = new DataMasker({ enabled: true });

      expect(masker.disableRule('non-existent')).toBe(false);
    });

    it('should handle numbers in objects', () => {
      const masker = new DataMasker({ enabled: true });

      const input = { value: 42 };
      const output = masker.maskObject(input);

      expect(output.value).toBe(42);
    });

    it('should handle boolean values in objects', () => {
      const masker = new DataMasker({ enabled: true });

      const input = { flag: true };
      const output = masker.maskObject(input);

      expect(output.flag).toBe(true);
    });

    it('should mask object keys containing sensitive data', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });

      const input = {
        'user@example.com': 'value',
      };
      const output = masker.maskObject(input);

      expect(output['[EMAIL]']).toBe('value');
      expect(output['user@example.com']).toBeUndefined();
    });

    it('should handle custom rules with enabled flag', () => {
      const masker = new DataMasker({ enabled: true });
      masker.addRule({
        name: 'custom',
        pattern: /SECRET/g,
        replacement: '[SECRET]',
        enabled: false,
      });

      const input = 'This is SECRET';
      const output = masker.maskString(input);

      expect(output).toBe(input); // Rule is disabled
    });

    it('should handle API keys masking', () => {
      const masker = new DataMasker({ enabled: true, maskApiKeys: true });

      const input = 'Key: abcdefghijklmnopqrstuvwxyz123456';
      const output = masker.maskString(input);

      expect(output).toBe('Key: [API_KEY]');
    });

    it('should handle all masking options disabled', () => {
      const masker = new DataMasker({
        enabled: true,
        maskEmails: false,
        maskPhones: false,
        maskCreditCards: false,
        maskSSNs: false,
        maskApiKeys: false,
        maskPasswords: false,
      });

      const input = 'Email: test@example.com, Phone: 555-123-4567';
      const output = masker.maskString(input);

      expect(output).toBe(input);
    });

    it('should handle custom rules in configuration', () => {
      const masker = new DataMasker({
        enabled: true,
        customRules: [
          {
            name: 'custom1',
            pattern: /CUSTOM1/g,
            replacement: '[CUSTOM1]',
            enabled: true,
          },
        ],
      });

      const input = 'This is CUSTOM1';
      const output = masker.maskString(input);

      expect(output).toBe('This is [CUSTOM1]');
    });

    it('should handle maskObject with max depth reached', () => {
      const masker = new DataMasker({ enabled: true, maskEmails: true });

      const input = {
        level1: {
          level2: {
            level3: 'test@example.com',
          },
        },
      };

      const output = masker.maskObject(input, 1);

      // At depth 1, level2 is not recursed into
      expect(output.level1.level2.level3).toBe('test@example.com');
    });
  });
});
