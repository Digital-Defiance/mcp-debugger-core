import { WorkspaceManager, WorkspaceInfo } from "./workspace-manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("WorkspaceManager", () => {
  let manager: WorkspaceManager;
  let tempDir: string;

  beforeEach(() => {
    manager = new WorkspaceManager();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("detectWorkspace", () => {
    it("should return null for non-workspace directory", async () => {
      const result = await manager.detectWorkspace(tempDir);
      expect(result).toBeNull();
    });

    it("should detect npm workspaces", async () => {
      // Create workspace structure
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      // Create a package
      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("npm-workspaces");
      expect(result?.packages).toHaveLength(1);
      expect(result?.packages[0].name).toBe("pkg1");
    });

    it("should detect yarn workspaces", async () => {
      // Create workspace structure
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");

      // Create a package
      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("yarn-workspaces");
    });

    it("should detect pnpm workspaces", async () => {
      // Create workspace structure
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "my-workspace" })
      );
      fs.writeFileSync(
        path.join(tempDir, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/*"\n'
      );

      // Create a package
      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("pnpm-workspaces");
    });

    it("should detect lerna workspaces", async () => {
      // Create workspace structure
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "my-workspace" })
      );
      fs.writeFileSync(
        path.join(tempDir, "lerna.json"),
        JSON.stringify({ packages: ["packages/*"] })
      );

      // Create a package
      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("lerna");
    });

    it("should detect nx workspaces", async () => {
      // Create workspace structure
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "my-workspace" })
      );
      fs.writeFileSync(
        path.join(tempDir, "nx.json"),
        JSON.stringify({
          workspaceLayout: {
            appsDir: "apps",
            libsDir: "libs",
          },
        })
      );

      // Create packages
      const appsDir = path.join(tempDir, "apps", "app1");
      fs.mkdirSync(appsDir, { recursive: true });
      fs.writeFileSync(
        path.join(appsDir, "package.json"),
        JSON.stringify({ name: "app1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("nx");
    });

    it("should cache workspace detection results", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const result1 = await manager.detectWorkspace(tempDir);
      const result2 = await manager.detectWorkspace(tempDir);

      expect(result1).toBe(result2); // Same object reference
    });

    it("should detect workspace from subdirectory", async () => {
      // Create workspace structure
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      // Create a package
      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      // Detect from subdirectory
      const result = await manager.detectWorkspace(pkgDir);
      expect(result).not.toBeNull();
      expect(result?.root).toBe(tempDir);
    });
  });

  describe("findPackageForFile", () => {
    it("should find package containing a file", async () => {
      // Create workspace
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const filePath = path.join(pkgDir, "src", "index.ts");
      const pkg = manager.findPackageForFile(workspace!, filePath);

      expect(pkg).not.toBeNull();
      expect(pkg?.name).toBe("pkg1");
    });

    it("should return null for file not in any package", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const filePath = path.join(tempDir, "other", "file.ts");
      const pkg = manager.findPackageForFile(workspace!, filePath);

      expect(pkg).toBeNull();
    });
  });

  describe("resolveWorkspacePath", () => {
    it("should resolve package-relative path", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const resolved = manager.resolveWorkspacePath(
        workspace!,
        "pkg1/src/index.ts"
      );

      expect(resolved).toBe(path.join(pkgDir, "src", "index.ts"));
    });

    it("should resolve workspace-root-relative path", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const resolved = manager.resolveWorkspacePath(
        workspace!,
        "scripts/build.js"
      );

      expect(resolved).toBe(path.join(tempDir, "scripts", "build.js"));
    });

    it("should handle scoped package names", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "@scope/pkg1" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const resolved = manager.resolveWorkspacePath(
        workspace!,
        "@scope/pkg1/src/index.ts"
      );

      expect(resolved).toBe(path.join(pkgDir, "src", "index.ts"));
    });
  });

  describe("makeWorkspaceRelative", () => {
    it("should make path relative to package", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const absolutePath = path.join(pkgDir, "src", "index.ts");
      const relative = manager.makeWorkspaceRelative(workspace!, absolutePath);

      expect(relative).toBe("pkg1/src/index.ts");
    });

    it("should make path relative to workspace root for non-package files", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const absolutePath = path.join(tempDir, "scripts", "build.js");
      const relative = manager.makeWorkspaceRelative(workspace!, absolutePath);

      expect(relative).toBe(path.join("scripts", "build.js"));
    });
  });

  describe("getAllPackageJsons", () => {
    it("should return all package.json files", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkg1Dir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkg1Dir, { recursive: true });
      fs.writeFileSync(
        path.join(pkg1Dir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const pkg2Dir = path.join(tempDir, "packages", "pkg2");
      fs.mkdirSync(pkg2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(pkg2Dir, "package.json"),
        JSON.stringify({ name: "pkg2" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const packageJsons = manager.getAllPackageJsons(workspace!);

      expect(packageJsons).toHaveLength(3);
      expect(packageJsons).toContain(path.join(tempDir, "package.json"));
      expect(packageJsons).toContain(path.join(pkg1Dir, "package.json"));
      expect(packageJsons).toContain(path.join(pkg2Dir, "package.json"));
    });
  });

  describe("getWorkingDirectoryForFile", () => {
    it("should return package directory for file in package", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const filePath = path.join(pkgDir, "src", "index.ts");
      const cwd = manager.getWorkingDirectoryForFile(workspace!, filePath);

      expect(cwd).toBe(pkgDir);
    });

    it("should return workspace root for file not in package", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();

      const filePath = path.join(tempDir, "scripts", "build.js");
      const cwd = manager.getWorkingDirectoryForFile(workspace!, filePath);

      expect(cwd).toBe(tempDir);
    });
  });

  describe("clearCache", () => {
    it("should clear workspace cache", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const result1 = await manager.detectWorkspace(tempDir);
      manager.clearCache();
      const result2 = await manager.detectWorkspace(tempDir);

      expect(result1).not.toBe(result2); // Different object references
    });
  });

  describe("Multiple packages", () => {
    it("should find all packages in workspace", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*", "apps/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      // Create packages
      const pkg1Dir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkg1Dir, { recursive: true });
      fs.writeFileSync(
        path.join(pkg1Dir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const pkg2Dir = path.join(tempDir, "packages", "pkg2");
      fs.mkdirSync(pkg2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(pkg2Dir, "package.json"),
        JSON.stringify({ name: "pkg2" })
      );

      const app1Dir = path.join(tempDir, "apps", "app1");
      fs.mkdirSync(app1Dir, { recursive: true });
      fs.writeFileSync(
        path.join(app1Dir, "package.json"),
        JSON.stringify({ name: "app1" })
      );

      const workspace = await manager.detectWorkspace(tempDir);
      expect(workspace).not.toBeNull();
      expect(workspace?.packages).toHaveLength(3);
      expect(workspace?.packages.map((p) => p.name).sort()).toEqual([
        "app1",
        "pkg1",
        "pkg2",
      ]);
    });
  });

  describe("Workspaces object format", () => {
    it("should handle workspaces.packages format", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: {
          packages: ["packages/*"],
        },
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.packages).toHaveLength(1);
    });

    it("should handle pnpm workspace detection", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );
      fs.writeFileSync(
        path.join(tempDir, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'"
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.root).toBe(tempDir);
    });

    it("should traverse up to find workspace root", async () => {
      // Create workspace root
      const rootPackageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(rootPackageJson)
      );

      // Create nested package
      const nestedDir = path.join(tempDir, "packages", "pkg1", "src");
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "packages", "pkg1", "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      // Detect from nested directory
      const result = await manager.detectWorkspace(nestedDir);
      expect(result).not.toBeNull();
      expect(result?.root).toBe(tempDir);
    });

    it("should return null when no workspace found", async () => {
      // Create a directory with no workspace indicators
      const noWorkspaceDir = path.join(tempDir, "no-workspace");
      fs.mkdirSync(noWorkspaceDir, { recursive: true });

      const result = await manager.detectWorkspace(noWorkspaceDir);
      expect(result).toBeNull();
    });

    it("should handle lerna.json workspace detection", async () => {
      fs.writeFileSync(
        path.join(tempDir, "lerna.json"),
        JSON.stringify({ packages: ["packages/*"] })
      );
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "my-workspace" })
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.root).toBe(tempDir);
      expect(result?.type).toBe("lerna");
    });

    it("should detect yarn workspaces when yarn.lock exists", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("yarn-workspaces");
    });

    it("should detect npm workspaces when no yarn.lock exists", async () => {
      const packageJson = {
        name: "my-workspace",
        workspaces: ["packages/*"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson)
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("npm-workspaces");
    });

    it("should detect nx workspace", async () => {
      fs.writeFileSync(
        path.join(tempDir, "nx.json"),
        JSON.stringify({ npmScope: "my-org" })
      );
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "my-workspace" })
      );
      fs.writeFileSync(
        path.join(tempDir, "workspace.json"),
        JSON.stringify({
          projects: {
            pkg1: "packages/pkg1",
          },
        })
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("nx");
    });

    it("should handle pnpm-workspace.yaml with various formats", async () => {
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "my-workspace" })
      );
      fs.writeFileSync(
        path.join(tempDir, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n  - 'apps/*'"
      );

      const pkgDir = path.join(tempDir, "packages", "pkg1");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "pkg1" })
      );

      const result = await manager.detectWorkspace(tempDir);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("pnpm-workspaces");
    });

    it("should handle directory without package.json during traversal", async () => {
      // Create a nested directory structure without package.json at intermediate levels
      const deepDir = path.join(tempDir, "level1", "level2", "level3");
      fs.mkdirSync(deepDir, { recursive: true });

      // Create workspace root above
      const rootPackageJson = {
        name: "my-workspace",
        workspaces: ["**/level3"],
      };
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify(rootPackageJson)
      );

      // Detect from deep directory
      const result = await manager.detectWorkspace(deepDir);
      expect(result).not.toBeNull();
      expect(result?.root).toBe(tempDir);
    });
  });
});
