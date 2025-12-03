import {
  DebugPresetManager,
  BUILTIN_PRESETS,
  DebugPreset,
} from "./debug-presets";

describe("DebugPresetManager", () => {
  let manager: DebugPresetManager;

  beforeEach(() => {
    manager = new DebugPresetManager();
  });

  describe("Built-in Presets", () => {
    it("should have node-app preset", () => {
      const preset = BUILTIN_PRESETS["node-app"];
      expect(preset).toBeDefined();
      expect(preset.name).toBe("Node.js Application");
      expect(preset.command).toBe("node");
    });

    it("should have jest-test preset", () => {
      const preset = BUILTIN_PRESETS["jest-test"];
      expect(preset).toBeDefined();
      expect(preset.name).toBe("Jest Test");
      expect(preset.args).toContain("--runInBand");
    });

    it("should have mocha-test preset", () => {
      const preset = BUILTIN_PRESETS["mocha-test"];
      expect(preset).toBeDefined();
      expect(preset.name).toBe("Mocha Test");
    });

    it("should have vitest-test preset", () => {
      const preset = BUILTIN_PRESETS["vitest-test"];
      expect(preset).toBeDefined();
      expect(preset.name).toBe("Vitest Test");
    });

    it("should have typescript-app preset", () => {
      const preset = BUILTIN_PRESETS["typescript-app"];
      expect(preset).toBeDefined();
      expect(preset.args).toContain("--require");
      expect(preset.args).toContain("ts-node/register");
    });

    it("should have express-server preset", () => {
      const preset = BUILTIN_PRESETS["express-server"];
      expect(preset).toBeDefined();
      expect(preset.env?.PORT).toBe("3000");
    });

    it("should have nest-app preset", () => {
      const preset = BUILTIN_PRESETS["nest-app"];
      expect(preset).toBeDefined();
      expect(preset.args).toContain("dist/main.js");
    });

    it("should have electron-main preset", () => {
      const preset = BUILTIN_PRESETS["electron-main"];
      expect(preset).toBeDefined();
      expect(preset.command).toBe("electron");
    });
  });

  describe("getPreset", () => {
    it("should get built-in preset", () => {
      const preset = manager.getPreset("node-app");
      expect(preset).toBeDefined();
      expect(preset?.name).toBe("Node.js Application");
    });

    it("should return undefined for non-existent preset", () => {
      const preset = manager.getPreset("non-existent");
      expect(preset).toBeUndefined();
    });

    it("should allow custom presets with unique names", () => {
      const customPreset: DebugPreset = {
        name: "custom-node-app",
        description: "Custom Node.js app",
        command: "custom-node",
      };
      manager.registerPreset(customPreset);

      const preset = manager.getPreset("custom-node-app");
      expect(preset?.command).toBe("custom-node");
    });
  });

  describe("listPresets", () => {
    it("should list all built-in presets", () => {
      const presets = manager.listPresets();
      expect(presets.length).toBeGreaterThanOrEqual(8);
      expect(presets.some((p) => p.name === "Node.js Application")).toBe(true);
    });

    it("should include custom presets in list", () => {
      const customPreset: DebugPreset = {
        name: "my-custom-preset",
        description: "My custom preset",
        command: "node",
      };
      manager.registerPreset(customPreset);

      const presets = manager.listPresets();
      expect(presets.some((p) => p.name === "my-custom-preset")).toBe(true);
    });
  });

  describe("registerPreset", () => {
    it("should register a custom preset", () => {
      const customPreset: DebugPreset = {
        name: "my-preset",
        description: "My preset",
        command: "node",
        args: ["app.js"],
      };
      manager.registerPreset(customPreset);

      const preset = manager.getPreset("my-preset");
      expect(preset).toEqual(customPreset);
    });

    it("should throw error when overriding built-in preset", () => {
      const customPreset: DebugPreset = {
        name: "node-app",
        description: "Override",
        command: "node",
      };

      expect(() => manager.registerPreset(customPreset)).toThrow(
        "Cannot override built-in preset"
      );
    });

    it("should allow updating custom preset", () => {
      const preset1: DebugPreset = {
        name: "my-preset",
        description: "Version 1",
        command: "node",
      };
      manager.registerPreset(preset1);

      const preset2: DebugPreset = {
        name: "my-preset",
        description: "Version 2",
        command: "node",
      };
      manager.registerPreset(preset2);

      const result = manager.getPreset("my-preset");
      expect(result?.description).toBe("Version 2");
    });
  });

  describe("removePreset", () => {
    it("should remove custom preset", () => {
      const customPreset: DebugPreset = {
        name: "my-preset",
        description: "My preset",
        command: "node",
      };
      manager.registerPreset(customPreset);

      const removed = manager.removePreset("my-preset");
      expect(removed).toBe(true);
      expect(manager.getPreset("my-preset")).toBeUndefined();
    });

    it("should return false when removing non-existent preset", () => {
      const removed = manager.removePreset("non-existent");
      expect(removed).toBe(false);
    });

    it("should not remove built-in presets", () => {
      const removed = manager.removePreset("node-app");
      expect(removed).toBe(false);
      expect(manager.getPreset("node-app")).toBeDefined();
    });
  });

  describe("resolvePreset", () => {
    it("should resolve preset without inheritance", () => {
      const preset = manager.resolvePreset("node-app");
      expect(preset).toBeDefined();
      expect(preset?.name).toBe("Node.js Application");
    });

    it("should resolve preset with inheritance", () => {
      const parentPreset: DebugPreset = {
        name: "parent",
        description: "Parent preset",
        command: "node",
        args: ["--version"],
        timeout: 5000,
      };
      manager.registerPreset(parentPreset);

      const childPreset: DebugPreset = {
        name: "child",
        description: "Child preset",
        command: "node",
        args: ["app.js"],
        extends: "parent",
      };
      manager.registerPreset(childPreset);

      const resolved = manager.resolvePreset("child");
      expect(resolved).toBeDefined();
      expect(resolved?.command).toBe("node");
      expect(resolved?.args).toEqual(["app.js"]);
      expect(resolved?.timeout).toBe(5000);
    });

    it("should throw error for missing parent preset", () => {
      const childPreset: DebugPreset = {
        name: "child",
        description: "Child preset",
        command: "node",
        extends: "non-existent",
      };
      manager.registerPreset(childPreset);

      expect(() => manager.resolvePreset("child")).toThrow(
        "Parent preset not found"
      );
    });

    it("should handle multi-level inheritance", () => {
      const grandparent: DebugPreset = {
        name: "grandparent",
        description: "Grandparent",
        command: "node",
        timeout: 1000,
      };
      manager.registerPreset(grandparent);

      const parent: DebugPreset = {
        name: "parent",
        description: "Parent",
        command: "node",
        args: ["--version"],
        extends: "grandparent",
      };
      manager.registerPreset(parent);

      const child: DebugPreset = {
        name: "child",
        description: "Child",
        command: "node",
        env: { NODE_ENV: "test" },
        extends: "parent",
      };
      manager.registerPreset(child);

      const resolved = manager.resolvePreset("child");
      expect(resolved?.timeout).toBe(1000);
      expect(resolved?.args).toEqual(["--version"]);
      expect(resolved?.env?.NODE_ENV).toBe("test");
    });
  });

  describe("composePresets", () => {
    it("should compose preset with overrides", () => {
      const composed = manager.composePresets({
        base: "node-app",
        overrides: {
          args: ["server.js"],
          env: { PORT: "8080" },
        },
      });

      expect(composed.command).toBe("node");
      expect(composed.args).toEqual(["server.js"]);
      expect(composed.env?.PORT).toBe("8080");
      expect(composed.env?.NODE_ENV).toBe("development");
    });

    it("should throw error for non-existent base preset", () => {
      expect(() =>
        manager.composePresets({
          base: "non-existent",
          overrides: {},
        })
      ).toThrow("Base preset not found");
    });

    it("should merge environment variables", () => {
      const composed = manager.composePresets({
        base: "jest-test",
        overrides: {
          env: { CUSTOM_VAR: "value" },
        },
      });

      expect(composed.env?.NODE_ENV).toBe("test");
      expect(composed.env?.CUSTOM_VAR).toBe("value");
    });
  });

  describe("applyPreset", () => {
    it("should apply preset without overrides", () => {
      const config = manager.applyPreset("node-app");
      expect(config.command).toBe("node");
      expect(config.name).toBe("Node.js Application");
    });

    it("should apply preset with overrides", () => {
      const config = manager.applyPreset("node-app", {
        args: ["index.js"],
        timeout: 10000,
      });

      expect(config.command).toBe("node");
      expect(config.args).toEqual(["index.js"]);
      expect(config.timeout).toBe(10000);
    });

    it("should throw error for non-existent preset", () => {
      expect(() => manager.applyPreset("non-existent")).toThrow(
        "Preset not found"
      );
    });

    it("should resolve inheritance before applying", () => {
      const parent: DebugPreset = {
        name: "parent",
        description: "Parent",
        command: "node",
        timeout: 5000,
      };
      manager.registerPreset(parent);

      const child: DebugPreset = {
        name: "child",
        description: "Child",
        command: "node",
        extends: "parent",
      };
      manager.registerPreset(child);

      const config = manager.applyPreset("child", {
        args: ["app.js"],
      });

      expect(config.timeout).toBe(5000);
      expect(config.args).toEqual(["app.js"]);
    });
  });

  describe("validatePreset", () => {
    it("should validate valid preset", () => {
      const preset: DebugPreset = {
        name: "valid-preset",
        description: "Valid",
        command: "node",
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject preset without name", () => {
      const preset: DebugPreset = {
        name: "",
        description: "No name",
        command: "node",
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Preset name is required");
    });

    it("should reject preset without command", () => {
      const preset: DebugPreset = {
        name: "no-command",
        description: "No command",
        command: "",
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Command is required");
    });

    it("should reject preset with negative timeout", () => {
      const preset: DebugPreset = {
        name: "bad-timeout",
        description: "Bad timeout",
        command: "node",
        timeout: -1000,
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Timeout must be positive");
    });

    it("should reject preset with zero timeout", () => {
      const preset: DebugPreset = {
        name: "zero-timeout",
        description: "Zero timeout",
        command: "node",
        timeout: 0,
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Timeout must be positive");
    });

    it("should reject preset that extends itself", () => {
      const preset: DebugPreset = {
        name: "self-extend",
        description: "Self extending",
        command: "node",
        extends: "self-extend",
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Preset cannot extend itself");
    });

    it("should collect multiple errors", () => {
      const preset: DebugPreset = {
        name: "",
        description: "Multiple errors",
        command: "",
        timeout: -1,
      };

      const result = manager.validatePreset(preset);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("clearCustomPresets", () => {
    it("should clear all custom presets", () => {
      manager.registerPreset({
        name: "preset1",
        description: "Preset 1",
        command: "node",
      });
      manager.registerPreset({
        name: "preset2",
        description: "Preset 2",
        command: "node",
      });

      manager.clearCustomPresets();

      expect(manager.getPreset("preset1")).toBeUndefined();
      expect(manager.getPreset("preset2")).toBeUndefined();
    });

    it("should not affect built-in presets", () => {
      manager.clearCustomPresets();
      expect(manager.getPreset("node-app")).toBeDefined();
    });
  });

  describe("Environment Variable Merging", () => {
    it("should merge environment variables from parent and child", () => {
      const parent: DebugPreset = {
        name: "parent",
        description: "Parent",
        command: "node",
        env: {
          VAR1: "parent1",
          VAR2: "parent2",
        },
      };
      manager.registerPreset(parent);

      const child: DebugPreset = {
        name: "child",
        description: "Child",
        command: "node",
        env: {
          VAR2: "child2",
          VAR3: "child3",
        },
        extends: "parent",
      };
      manager.registerPreset(child);

      const resolved = manager.resolvePreset("child");
      expect(resolved?.env).toEqual({
        VAR1: "parent1",
        VAR2: "child2",
        VAR3: "child3",
      });
    });
  });

  describe("Breakpoint Inheritance", () => {
    it("should inherit breakpoints from parent", () => {
      const parent: DebugPreset = {
        name: "parent",
        description: "Parent",
        command: "node",
        breakpoints: [{ file: "app.js", line: 10 }],
      };
      manager.registerPreset(parent);

      const child: DebugPreset = {
        name: "child",
        description: "Child",
        command: "node",
        extends: "parent",
      };
      manager.registerPreset(child);

      const resolved = manager.resolvePreset("child");
      expect(resolved?.breakpoints).toEqual([{ file: "app.js", line: 10 }]);
    });

    it("should override breakpoints in child", () => {
      const parent: DebugPreset = {
        name: "parent",
        description: "Parent",
        command: "node",
        breakpoints: [{ file: "app.js", line: 10 }],
      };
      manager.registerPreset(parent);

      const child: DebugPreset = {
        name: "child",
        description: "Child",
        command: "node",
        breakpoints: [{ file: "server.js", line: 20 }],
        extends: "parent",
      };
      manager.registerPreset(child);

      const resolved = manager.resolvePreset("child");
      expect(resolved?.breakpoints).toEqual([{ file: "server.js", line: 20 }]);
    });
  });
});
