/**
 * Workspace-aware debugging support for monorepos and multi-package projects
 * Handles workspace detection, package.json resolution, and workspace-relative paths
 */

import * as fs from "fs";
import * as path from "path";

export interface WorkspacePackage {
  name: string;
  path: string;
  packageJson: any;
}

export interface WorkspaceInfo {
  root: string;
  type:
    | "single"
    | "npm-workspaces"
    | "yarn-workspaces"
    | "pnpm-workspaces"
    | "lerna"
    | "nx";
  packages: WorkspacePackage[];
}

/**
 * Manages workspace-aware debugging for monorepos
 */
export class WorkspaceManager {
  private workspaceCache: Map<string, WorkspaceInfo> = new Map();

  /**
   * Detect workspace structure from a given directory
   */
  async detectWorkspace(cwd: string): Promise<WorkspaceInfo | null> {
    // Check cache first
    const cached = this.workspaceCache.get(cwd);
    if (cached) {
      return cached;
    }

    // Find workspace root
    const root = await this.findWorkspaceRoot(cwd);
    if (!root) {
      return null;
    }

    // Detect workspace type and packages
    const workspaceInfo = await this.analyzeWorkspace(root);

    // Cache the result
    if (workspaceInfo) {
      this.workspaceCache.set(cwd, workspaceInfo);
      this.workspaceCache.set(root, workspaceInfo);
    }

    return workspaceInfo;
  }

  /**
   * Find the workspace root by looking for workspace configuration files
   */
  private async findWorkspaceRoot(startDir: string): Promise<string | null> {
    let currentDir = path.resolve(startDir);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      // Check for workspace indicators
      const packageJsonPath = path.join(currentDir, "package.json");

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );

        // Check for npm/yarn workspaces
        if (packageJson.workspaces) {
          return currentDir;
        }

        // Check for pnpm workspace
        if (fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
          return currentDir;
        }

        // Check for lerna
        if (fs.existsSync(path.join(currentDir, "lerna.json"))) {
          return currentDir;
        }

        // Check for nx
        if (fs.existsSync(path.join(currentDir, "nx.json"))) {
          return currentDir;
        }
      }

      // Move up one directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Analyze workspace to determine type and find all packages
   */
  private async analyzeWorkspace(root: string): Promise<WorkspaceInfo | null> {
    const packageJsonPath = path.join(root, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    // Detect workspace type
    let type: WorkspaceInfo["type"] = "single";
    let patterns: string[] = [];

    if (fs.existsSync(path.join(root, "nx.json"))) {
      type = "nx";
      patterns = await this.getNxPackagePatterns(root);
    } else if (fs.existsSync(path.join(root, "lerna.json"))) {
      type = "lerna";
      const lernaJson = JSON.parse(
        fs.readFileSync(path.join(root, "lerna.json"), "utf-8")
      );
      patterns = lernaJson.packages || ["packages/*"];
    } else if (fs.existsSync(path.join(root, "pnpm-workspace.yaml"))) {
      type = "pnpm-workspaces";
      patterns = await this.getPnpmWorkspacePatterns(root);
    } else if (packageJson.workspaces) {
      // npm or yarn workspaces
      if (Array.isArray(packageJson.workspaces)) {
        patterns = packageJson.workspaces;
      } else if (packageJson.workspaces.packages) {
        patterns = packageJson.workspaces.packages;
      }

      // Detect if it's npm or yarn
      if (fs.existsSync(path.join(root, "yarn.lock"))) {
        type = "yarn-workspaces";
      } else {
        type = "npm-workspaces";
      }
    }

    // Find all packages
    const packages = await this.findPackages(root, patterns);

    return {
      root,
      type,
      packages,
    };
  }

  /**
   * Get package patterns from nx.json
   */
  private async getNxPackagePatterns(root: string): Promise<string[]> {
    const nxJsonPath = path.join(root, "nx.json");
    if (!fs.existsSync(nxJsonPath)) {
      return [];
    }

    const nxJson = JSON.parse(fs.readFileSync(nxJsonPath, "utf-8"));

    // Nx uses workspaceLayout or defaults
    const appsDir = nxJson.workspaceLayout?.appsDir || "apps";
    const libsDir = nxJson.workspaceLayout?.libsDir || "libs";

    return [`${appsDir}/*`, `${libsDir}/*`, "packages/*"];
  }

  /**
   * Get package patterns from pnpm-workspace.yaml
   */
  private async getPnpmWorkspacePatterns(root: string): Promise<string[]> {
    const workspaceYamlPath = path.join(root, "pnpm-workspace.yaml");
    if (!fs.existsSync(workspaceYamlPath)) {
      return [];
    }

    // Simple YAML parsing for packages array
    const content = fs.readFileSync(workspaceYamlPath, "utf-8");
    const packagesMatch = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/);

    if (!packagesMatch) {
      return [];
    }

    const patterns = packagesMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"))
      .map((line) => line.substring(1).trim().replace(/['"]/g, ""));

    return patterns;
  }

  /**
   * Find all packages matching the given patterns
   */
  private async findPackages(
    root: string,
    patterns: string[]
  ): Promise<WorkspacePackage[]> {
    const packages: WorkspacePackage[] = [];

    for (const pattern of patterns) {
      const matches = await this.expandGlob(root, pattern);

      for (const match of matches) {
        const packageJsonPath = path.join(match, "package.json");

        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf-8")
          );

          packages.push({
            name: packageJson.name || path.basename(match),
            path: match,
            packageJson,
          });
        }
      }
    }

    return packages;
  }

  /**
   * Simple glob expansion (supports * wildcard)
   */
  private async expandGlob(root: string, pattern: string): Promise<string[]> {
    const parts = pattern.split("/");
    let currentPaths = [root];

    for (const part of parts) {
      const nextPaths: string[] = [];

      for (const currentPath of currentPaths) {
        if (part === "*") {
          // Expand wildcard
          if (fs.existsSync(currentPath)) {
            const entries = fs.readdirSync(currentPath, {
              withFileTypes: true,
            });

            for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith(".")) {
                nextPaths.push(path.join(currentPath, entry.name));
              }
            }
          }
        } else if (part === "**") {
          // Recursive wildcard - not implemented for simplicity
          nextPaths.push(currentPath);
        } else {
          // Literal path component
          nextPaths.push(path.join(currentPath, part));
        }
      }

      currentPaths = nextPaths;
    }

    return currentPaths.filter((p) => fs.existsSync(p));
  }

  /**
   * Find the package that contains a given file
   */
  findPackageForFile(
    workspaceInfo: WorkspaceInfo,
    filePath: string
  ): WorkspacePackage | null {
    const absolutePath = path.resolve(filePath);

    // Find the package whose path is a prefix of the file path
    for (const pkg of workspaceInfo.packages) {
      const pkgPath = path.resolve(pkg.path);
      if (
        absolutePath.startsWith(pkgPath + path.sep) ||
        absolutePath === pkgPath
      ) {
        return pkg;
      }
    }

    return null;
  }

  /**
   * Resolve a workspace-relative path to an absolute path
   */
  resolveWorkspacePath(
    workspaceInfo: WorkspaceInfo,
    relativePath: string
  ): string {
    // If it starts with a package name, resolve to that package
    const match = relativePath.match(/^(@[^/]+\/[^/]+|[^/]+)\/(.*)/);

    if (match) {
      const [, packageName, packageRelativePath] = match;
      const pkg = workspaceInfo.packages.find((p) => p.name === packageName);

      if (pkg) {
        return path.join(pkg.path, packageRelativePath);
      }
    }

    // Otherwise, resolve relative to workspace root
    return path.join(workspaceInfo.root, relativePath);
  }

  /**
   * Convert an absolute path to a workspace-relative path
   */
  makeWorkspaceRelative(
    workspaceInfo: WorkspaceInfo,
    absolutePath: string
  ): string {
    const resolved = path.resolve(absolutePath);
    const pkg = this.findPackageForFile(workspaceInfo, resolved);

    if (pkg) {
      const relativeToPkg = path.relative(pkg.path, resolved);
      return `${pkg.name}/${relativeToPkg}`;
    }

    // Fall back to root-relative path
    return path.relative(workspaceInfo.root, resolved);
  }

  /**
   * Get all package.json files in the workspace
   */
  getAllPackageJsons(workspaceInfo: WorkspaceInfo): string[] {
    const packageJsons = [path.join(workspaceInfo.root, "package.json")];

    for (const pkg of workspaceInfo.packages) {
      packageJsons.push(path.join(pkg.path, "package.json"));
    }

    return packageJsons;
  }

  /**
   * Find the appropriate working directory for debugging a file
   */
  getWorkingDirectoryForFile(
    workspaceInfo: WorkspaceInfo,
    filePath: string
  ): string {
    const pkg = this.findPackageForFile(workspaceInfo, filePath);
    return pkg ? pkg.path : workspaceInfo.root;
  }

  /**
   * Clear the workspace cache
   */
  clearCache(): void {
    this.workspaceCache.clear();
  }
}
