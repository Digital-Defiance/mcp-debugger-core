/**
 * Debug configuration presets for common debugging scenarios
 * Provides pre-configured settings for Node.js apps, test frameworks, and custom scenarios
 */

export interface DebugPreset {
  name: string;
  description: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  breakpoints?: Array<{ file: string; line: number; condition?: string }>;
  extends?: string; // Support preset inheritance
}

export interface PresetComposition {
  base: string;
  overrides: Partial<DebugPreset>;
}

/**
 * Built-in presets for common debugging scenarios
 */
export const BUILTIN_PRESETS: Record<string, DebugPreset> = {
  "node-app": {
    name: "Node.js Application",
    description: "Debug a Node.js application",
    command: "node",
    args: [],
    timeout: 30000,
    env: {
      NODE_ENV: "development",
    },
  },

  "jest-test": {
    name: "Jest Test",
    description: "Debug Jest tests",
    command: "node",
    args: ["node_modules/.bin/jest", "--runInBand", "--no-coverage"],
    timeout: 60000,
    env: {
      NODE_ENV: "test",
    },
  },

  "mocha-test": {
    name: "Mocha Test",
    description: "Debug Mocha tests",
    command: "node",
    args: ["node_modules/.bin/mocha"],
    timeout: 60000,
    env: {
      NODE_ENV: "test",
    },
  },

  "vitest-test": {
    name: "Vitest Test",
    description: "Debug Vitest tests",
    command: "node",
    args: ["node_modules/.bin/vitest", "run"],
    timeout: 60000,
    env: {
      NODE_ENV: "test",
    },
  },

  "typescript-app": {
    name: "TypeScript Application",
    description: "Debug a TypeScript application with ts-node",
    command: "node",
    args: ["--require", "ts-node/register"],
    timeout: 30000,
    env: {
      NODE_ENV: "development",
      TS_NODE_PROJECT: "tsconfig.json",
    },
  },

  "express-server": {
    name: "Express Server",
    description: "Debug an Express.js server",
    command: "node",
    args: [],
    timeout: 60000,
    env: {
      NODE_ENV: "development",
      PORT: "3000",
    },
  },

  "nest-app": {
    name: "NestJS Application",
    description: "Debug a NestJS application",
    command: "node",
    args: ["dist/main.js"],
    timeout: 60000,
    env: {
      NODE_ENV: "development",
    },
  },

  "electron-main": {
    name: "Electron Main Process",
    description: "Debug Electron main process",
    command: "electron",
    args: ["."],
    timeout: 60000,
    env: {
      ELECTRON_ENABLE_LOGGING: "1",
    },
  },
};

/**
 * Manages debug configuration presets
 */
export class DebugPresetManager {
  private customPresets: Map<string, DebugPreset> = new Map();

  /**
   * Get a preset by name (checks custom presets first, then built-in)
   */
  getPreset(name: string): DebugPreset | undefined {
    return this.customPresets.get(name) || BUILTIN_PRESETS[name];
  }

  /**
   * List all available presets
   */
  listPresets(): DebugPreset[] {
    const builtinPresets = Object.values(BUILTIN_PRESETS);
    const customPresets = Array.from(this.customPresets.values());
    return [...builtinPresets, ...customPresets];
  }

  /**
   * Register a custom preset
   */
  registerPreset(preset: DebugPreset): void {
    if (BUILTIN_PRESETS[preset.name]) {
      throw new Error(
        `Cannot override built-in preset: ${preset.name}. Use a different name.`
      );
    }
    this.customPresets.set(preset.name, preset);
  }

  /**
   * Remove a custom preset
   */
  removePreset(name: string): boolean {
    return this.customPresets.delete(name);
  }

  /**
   * Resolve a preset with inheritance
   * If preset extends another preset, merge the configurations
   */
  resolvePreset(name: string): DebugPreset | undefined {
    const preset = this.getPreset(name);
    if (!preset) {
      return undefined;
    }

    // If no inheritance, return as-is
    if (!preset.extends) {
      return preset;
    }

    // Resolve parent preset
    const parentPreset = this.resolvePreset(preset.extends);
    if (!parentPreset) {
      throw new Error(
        `Parent preset not found: ${preset.extends} (referenced by ${name})`
      );
    }

    // Merge parent and child configurations
    return this.mergePresets(parentPreset, preset);
  }

  /**
   * Compose multiple presets together
   */
  composePresets(composition: PresetComposition): DebugPreset {
    const basePreset = this.resolvePreset(composition.base);
    if (!basePreset) {
      throw new Error(`Base preset not found: ${composition.base}`);
    }

    return this.mergePresets(basePreset, composition.overrides);
  }

  /**
   * Merge two preset configurations (child overrides parent)
   */
  private mergePresets(
    parent: DebugPreset,
    child: Partial<DebugPreset>
  ): DebugPreset {
    return {
      name: child.name || parent.name,
      description: child.description || parent.description,
      command: child.command || parent.command,
      args: child.args || parent.args,
      cwd: child.cwd || parent.cwd,
      env: { ...parent.env, ...child.env },
      timeout: child.timeout !== undefined ? child.timeout : parent.timeout,
      breakpoints: child.breakpoints || parent.breakpoints,
      extends: undefined, // Don't propagate extends
    };
  }

  /**
   * Apply a preset to create a debug configuration
   */
  applyPreset(
    presetName: string,
    overrides?: Partial<DebugPreset>
  ): DebugPreset {
    const preset = this.resolvePreset(presetName);
    if (!preset) {
      throw new Error(`Preset not found: ${presetName}`);
    }

    if (!overrides) {
      return preset;
    }

    return this.mergePresets(preset, overrides);
  }

  /**
   * Validate a preset configuration
   */
  validatePreset(preset: DebugPreset): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!preset.name || preset.name.trim() === "") {
      errors.push("Preset name is required");
    }

    if (!preset.command || preset.command.trim() === "") {
      errors.push("Command is required");
    }

    if (preset.timeout !== undefined && preset.timeout <= 0) {
      errors.push("Timeout must be positive");
    }

    if (preset.extends && preset.extends === preset.name) {
      errors.push("Preset cannot extend itself");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear all custom presets
   */
  clearCustomPresets(): void {
    this.customPresets.clear();
  }
}
