/**
 * Masking rule definition
 */
export interface MaskingRule {
  name: string;
  pattern: RegExp;
  replacement: string;
  enabled: boolean;
}

/**
 * Data masking configuration
 */
export interface DataMaskingConfig {
  enabled: boolean;
  customRules?: MaskingRule[];
  maskEmails?: boolean;
  maskPhones?: boolean;
  maskCreditCards?: boolean;
  maskSSNs?: boolean;
  maskApiKeys?: boolean;
  maskPasswords?: boolean;
}

/**
 * Manages sensitive data masking for variable inspection
 * Detects and masks common PII patterns
 */
export class DataMasker {
  private config: DataMaskingConfig;
  private rules: MaskingRule[] = [];

  // Common PII patterns
  private static readonly EMAIL_PATTERN =
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private static readonly PHONE_PATTERN =
    /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  private static readonly CREDIT_CARD_PATTERN =
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
  private static readonly SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
  private static readonly API_KEY_PATTERN = /\b[A-Za-z0-9]{32,}\b/g; // Generic long alphanumeric strings
  private static readonly PASSWORD_PATTERN =
    /\b(password|passwd|pwd|secret|token)\s*[:=]\s*['"]?([^'"\s]+)['"]?/gi;

  constructor(config: DataMaskingConfig = { enabled: false }) {
    this.config = {
      maskEmails: true,
      maskPhones: true,
      maskCreditCards: true,
      maskSSNs: true,
      maskApiKeys: true,
      maskPasswords: true,
      ...config,
    };

    this.initializeRules();
  }

  /**
   * Initialize masking rules based on configuration
   * Rules are ordered by specificity to avoid conflicts
   */
  private initializeRules(): void {
    this.rules = [];

    // Apply more specific patterns first to avoid conflicts
    if (this.config.maskCreditCards) {
      this.rules.push({
        name: 'credit_card',
        pattern: DataMasker.CREDIT_CARD_PATTERN,
        replacement: '[CREDIT_CARD]',
        enabled: true,
      });
    }

    if (this.config.maskSSNs) {
      this.rules.push({
        name: 'ssn',
        pattern: DataMasker.SSN_PATTERN,
        replacement: '[SSN]',
        enabled: true,
      });
    }

    if (this.config.maskApiKeys) {
      this.rules.push({
        name: 'api_key',
        pattern: DataMasker.API_KEY_PATTERN,
        replacement: '[API_KEY]',
        enabled: true,
      });
    }

    if (this.config.maskPhones) {
      this.rules.push({
        name: 'phone',
        pattern: DataMasker.PHONE_PATTERN,
        replacement: '[PHONE]',
        enabled: true,
      });
    }

    if (this.config.maskEmails) {
      this.rules.push({
        name: 'email',
        pattern: DataMasker.EMAIL_PATTERN,
        replacement: '[EMAIL]',
        enabled: true,
      });
    }

    if (this.config.maskPasswords) {
      this.rules.push({
        name: 'password',
        pattern: DataMasker.PASSWORD_PATTERN,
        replacement: '$1: [REDACTED]',
        enabled: true,
      });
    }

    // Add custom rules
    if (this.config.customRules) {
      this.rules.push(...this.config.customRules);
    }
  }

  /**
   * Mask sensitive data in a string
   * @param value The string to mask
   * @returns The masked string
   */
  maskString(value: string): string {
    if (!this.config.enabled) {
      return value;
    }

    let masked = value;

    for (const rule of this.rules) {
      if (rule.enabled) {
        masked = masked.replace(rule.pattern, rule.replacement);
      }
    }

    return masked;
  }

  /**
   * Mask sensitive data (works with both strings and objects)
   * @param data The data to mask (string or object)
   * @param maxDepth Maximum recursion depth for objects (default: 10)
   * @returns The masked data
   */
  maskData(data: any, maxDepth: number = 10): any {
    if (!this.config.enabled) {
      return data;
    }

    if (typeof data === 'string') {
      return this.maskString(data);
    }

    return this.maskObject(data, maxDepth);
  }

  /**
   * Mask sensitive data in an object
   * Recursively masks all string values in the object
   * @param obj The object to mask
   * @param maxDepth Maximum recursion depth (default: 10)
   * @returns The masked object
   */
  maskObject(obj: any, maxDepth: number = 10): any {
    if (!this.config.enabled) {
      return obj;
    }

    return this.maskObjectRecursive(obj, maxDepth, 0);
  }

  /**
   * Recursively mask an object
   * @param obj The object to mask
   * @param maxDepth Maximum recursion depth
   * @param currentDepth Current recursion depth
   * @returns The masked object
   */
  private maskObjectRecursive(
    obj: any,
    maxDepth: number,
    currentDepth: number,
  ): any {
    if (currentDepth >= maxDepth) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.maskString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) =>
        this.maskObjectRecursive(item, maxDepth, currentDepth + 1),
      );
    }

    if (obj !== null && typeof obj === 'object') {
      const masked: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Mask the key if it contains sensitive information
        const maskedKey = this.maskString(key);
        masked[maskedKey] = this.maskObjectRecursive(
          value,
          maxDepth,
          currentDepth + 1,
        );
      }
      return masked;
    }

    return obj;
  }

  /**
   * Add a custom masking rule
   * @param rule The masking rule to add
   */
  addRule(rule: MaskingRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a masking rule by name
   * @param name The name of the rule to remove
   * @returns True if the rule was found and removed
   */
  removeRule(name: string): boolean {
    const index = this.rules.findIndex((rule) => rule.name === name);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable a masking rule by name
   * @param name The name of the rule to enable
   * @returns True if the rule was found
   */
  enableRule(name: string): boolean {
    const rule = this.rules.find((r) => r.name === name);
    if (rule) {
      rule.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a masking rule by name
   * @param name The name of the rule to disable
   * @returns True if the rule was found
   */
  disableRule(name: string): boolean {
    const rule = this.rules.find((r) => r.name === name);
    if (rule) {
      rule.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Get all masking rules
   * @returns Array of all masking rules
   */
  getRules(): MaskingRule[] {
    return [...this.rules];
  }

  /**
   * Get a masking rule by name
   * @param name The name of the rule
   * @returns The masking rule or undefined if not found
   */
  getRule(name: string): MaskingRule | undefined {
    return this.rules.find((rule) => rule.name === name);
  }

  /**
   * Check if masking is enabled
   * @returns True if masking is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable masking
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable masking
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Clear all custom rules
   */
  clearCustomRules(): void {
    this.rules = this.rules.filter(
      (rule) =>
        rule.name === 'email' ||
        rule.name === 'phone' ||
        rule.name === 'credit_card' ||
        rule.name === 'ssn' ||
        rule.name === 'api_key' ||
        rule.name === 'password',
    );
  }

  /**
   * Get the current configuration
   * @returns The current configuration
   */
  getConfig(): DataMaskingConfig {
    return { ...this.config };
  }
}
