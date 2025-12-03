/**
 * Variable formatting customization for debug output
 * Supports custom formatters, pretty-printing, truncation, and user-defined display rules
 */

export interface FormatterOptions {
  maxDepth?: number;
  maxLength?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
  indent?: number;
  showHidden?: boolean;
  showTypes?: boolean;
  customFormatters?: Map<string, CustomFormatter>;
}

export interface CustomFormatter {
  test: (value: any) => boolean;
  format: (value: any, options: FormatterOptions) => string;
}

export interface FormattedValue {
  value: string;
  type: string;
  truncated: boolean;
}

/**
 * Formats variables for display in debugging output
 */
export class VariableFormatter {
  private options: Required<FormatterOptions>;
  private customFormatters: Map<string, CustomFormatter>;

  constructor(options: FormatterOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 3,
      maxLength: options.maxLength ?? 1000,
      maxArrayLength: options.maxArrayLength ?? 100,
      maxStringLength: options.maxStringLength ?? 200,
      indent: options.indent ?? 2,
      showHidden: options.showHidden ?? false,
      showTypes: options.showTypes ?? true,
      customFormatters: options.customFormatters ?? new Map(),
    };

    this.customFormatters = this.options.customFormatters;
  }

  /**
   * Format a value for display
   */
  format(value: any, depth = 0): FormattedValue {
    // Check custom formatters first
    for (const [, formatter] of this.customFormatters) {
      if (formatter.test(value)) {
        return {
          value: formatter.format(value, this.options),
          type: typeof value,
          truncated: false,
        };
      }
    }

    // Handle null and undefined
    if (value === null) {
      return { value: "null", type: "null", truncated: false };
    }
    if (value === undefined) {
      return { value: "undefined", type: "undefined", truncated: false };
    }

    // Handle primitives
    const type = typeof value;
    if (type === "string") {
      return this.formatString(value);
    }
    if (type === "number" || type === "boolean") {
      return { value: String(value), type, truncated: false };
    }
    if (type === "symbol") {
      return { value: value.toString(), type, truncated: false };
    }
    if (type === "bigint") {
      return { value: value.toString() + "n", type, truncated: false };
    }

    // Handle functions
    if (type === "function") {
      return this.formatFunction(value);
    }

    // Handle objects
    if (depth >= this.options.maxDepth) {
      return { value: "[Max depth reached]", type: "object", truncated: true };
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return this.formatArray(value, depth);
    }

    // Handle dates
    if (value instanceof Date) {
      return { value: value.toISOString(), type: "Date", truncated: false };
    }

    // Handle errors
    if (value instanceof Error) {
      return this.formatError(value);
    }

    // Handle regular expressions
    if (value instanceof RegExp) {
      return { value: value.toString(), type: "RegExp", truncated: false };
    }

    // Handle maps
    if (value instanceof Map) {
      return this.formatMap(value, depth);
    }

    // Handle sets
    if (value instanceof Set) {
      return this.formatSet(value, depth);
    }

    // Handle plain objects
    return this.formatObject(value, depth);
  }

  /**
   * Format a string value
   */
  private formatString(value: string): FormattedValue {
    if (value.length <= this.options.maxStringLength) {
      return {
        value: JSON.stringify(value),
        type: "string",
        truncated: false,
      };
    }

    const truncated = value.substring(0, this.options.maxStringLength);
    return {
      value: JSON.stringify(truncated) + "... (truncated)",
      type: "string",
      truncated: true,
    };
  }

  /**
   * Format a function
   */
  private formatFunction(value: Function): FormattedValue {
    const name = value.name || "anonymous";
    const source = value.toString();

    // Extract function signature
    const signatureMatch = source.match(/^[^{]*/);
    const signature = signatureMatch ? signatureMatch[0].trim() : name;

    return {
      value: `[Function: ${signature}]`,
      type: "function",
      truncated: false,
    };
  }

  /**
   * Format an array
   */
  private formatArray(value: any[], depth: number): FormattedValue {
    if (value.length === 0) {
      return { value: "[]", type: "Array", truncated: false };
    }

    const maxLength = this.options.maxArrayLength;
    const items = value.slice(0, maxLength);
    const truncated = value.length > maxLength;

    const formatted = items.map((item) => this.format(item, depth + 1).value);

    let result: string;
    if (this.shouldPrettyPrint(formatted)) {
      const indent = " ".repeat(this.options.indent * (depth + 1));
      const closeIndent = " ".repeat(this.options.indent * depth);
      result =
        "[\n" +
        formatted.map((f) => indent + f).join(",\n") +
        (truncated
          ? `,\n${indent}... (${value.length - maxLength} more)`
          : "") +
        "\n" +
        closeIndent +
        "]";
    } else {
      result =
        "[" +
        formatted.join(", ") +
        (truncated ? `, ... (${value.length - maxLength} more)` : "") +
        "]";
    }

    return {
      value: this.truncateIfNeeded(result),
      type: "Array",
      truncated: truncated || result.length > this.options.maxLength,
    };
  }

  /**
   * Format an object
   */
  private formatObject(value: any, depth: number): FormattedValue {
    const keys = this.options.showHidden
      ? Object.getOwnPropertyNames(value)
      : Object.keys(value);

    if (keys.length === 0) {
      return { value: "{}", type: "Object", truncated: false };
    }

    const entries: string[] = [];
    for (const key of keys) {
      try {
        const propValue = value[key];
        const formatted = this.format(propValue, depth + 1);
        const typeInfo = this.options.showTypes ? ` (${formatted.type})` : "";
        entries.push(`${key}${typeInfo}: ${formatted.value}`);
      } catch (error) {
        entries.push(`${key}: [Error accessing property]`);
      }
    }

    let result: string;
    if (this.shouldPrettyPrint(entries)) {
      const indent = " ".repeat(this.options.indent * (depth + 1));
      const closeIndent = " ".repeat(this.options.indent * depth);
      result =
        "{\n" +
        entries.map((e) => indent + e).join(",\n") +
        "\n" +
        closeIndent +
        "}";
    } else {
      result = "{ " + entries.join(", ") + " }";
    }

    return {
      value: this.truncateIfNeeded(result),
      type: value.constructor?.name || "Object",
      truncated: result.length > this.options.maxLength,
    };
  }

  /**
   * Format an error
   */
  private formatError(value: Error): FormattedValue {
    const parts = [`${value.name}: ${value.message}`];

    if (value.stack) {
      const stackLines = value.stack.split("\n").slice(1, 4);
      parts.push(...stackLines);
    }

    return {
      value: parts.join("\n"),
      type: "Error",
      truncated: false,
    };
  }

  /**
   * Format a Map
   */
  private formatMap(value: Map<any, any>, depth: number): FormattedValue {
    if (value.size === 0) {
      return { value: "Map(0) {}", type: "Map", truncated: false };
    }

    const entries: string[] = [];
    let count = 0;
    for (const [key, val] of value) {
      if (count >= this.options.maxArrayLength) {
        entries.push(`... (${value.size - count} more)`);
        break;
      }
      const formattedKey = this.format(key, depth + 1).value;
      const formattedVal = this.format(val, depth + 1).value;
      entries.push(`${formattedKey} => ${formattedVal}`);
      count++;
    }

    const result = `Map(${value.size}) { ${entries.join(", ")} }`;
    return {
      value: this.truncateIfNeeded(result),
      type: "Map",
      truncated: result.length > this.options.maxLength,
    };
  }

  /**
   * Format a Set
   */
  private formatSet(value: Set<any>, depth: number): FormattedValue {
    if (value.size === 0) {
      return { value: "Set(0) {}", type: "Set", truncated: false };
    }

    const items: string[] = [];
    let count = 0;
    for (const item of value) {
      if (count >= this.options.maxArrayLength) {
        items.push(`... (${value.size - count} more)`);
        break;
      }
      items.push(this.format(item, depth + 1).value);
      count++;
    }

    const result = `Set(${value.size}) { ${items.join(", ")} }`;
    return {
      value: this.truncateIfNeeded(result),
      type: "Set",
      truncated: result.length > this.options.maxLength,
    };
  }

  /**
   * Check if output should be pretty-printed
   */
  private shouldPrettyPrint(items: string[]): boolean {
    const totalLength = items.join("").length;
    return totalLength > 80 || items.length > 3;
  }

  /**
   * Truncate string if it exceeds max length
   */
  private truncateIfNeeded(value: string): string {
    if (value.length <= this.options.maxLength) {
      return value;
    }

    return value.substring(0, this.options.maxLength) + "... (truncated)";
  }

  /**
   * Register a custom formatter
   */
  registerFormatter(name: string, formatter: CustomFormatter): void {
    this.customFormatters.set(name, formatter);
  }

  /**
   * Unregister a custom formatter
   */
  unregisterFormatter(name: string): boolean {
    return this.customFormatters.delete(name);
  }

  /**
   * Update formatting options
   */
  updateOptions(options: Partial<FormatterOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  /**
   * Get current options
   */
  getOptions(): FormatterOptions {
    return { ...this.options };
  }
}
