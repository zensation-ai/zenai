/**
 * Project Parsing - File parsing, structure scanning, pattern detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import {
  ProjectDependency,
  ProjectFile,
  ProjectStructure,
  ProjectType,
} from './project-detection';

// ============================================================================
// Ignore Lists
// ============================================================================

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  '.pytest_cache',
  'target',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  'vendor',
  '.venv',
  'venv',
  'env',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitkeep',
  '.npmrc',
  '.yarnrc',
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
]);

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse package.json for Node.js/TypeScript projects
 */
export async function parsePackageJson(
  projectPath: string
): Promise<{
  name: string;
  version?: string;
  description?: string;
  dependencies: ProjectDependency[];
  scripts: Record<string, string>;
  entryPoint?: string;
} | null> {
  const packagePath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    const content = await fs.promises.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);

    const dependencies: ProjectDependency[] = [];

    // Parse dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        dependencies.push({ name, version: version as string, isDev: false });
      }
    }

    // Parse devDependencies
    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        dependencies.push({ name, version: version as string, isDev: true });
      }
    }

    return {
      name: pkg.name || path.basename(projectPath),
      version: pkg.version,
      description: pkg.description,
      dependencies,
      scripts: pkg.scripts || {},
      entryPoint: pkg.main || pkg.module,
    };
  } catch (error) {
    logger.error('Failed to parse package.json', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Parse Python project configuration
 */
export async function parsePythonProject(
  projectPath: string
): Promise<{
  name: string;
  version?: string;
  description?: string;
  dependencies: ProjectDependency[];
} | null> {
  // Try pyproject.toml first
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');

  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = await fs.promises.readFile(pyprojectPath, 'utf-8');

      // Simple TOML parsing for common fields
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
      const descMatch = content.match(/description\s*=\s*"([^"]+)"/);

      // Parse dependencies from [project.dependencies] or [tool.poetry.dependencies]
      const dependencies: ProjectDependency[] = [];
      const depSection = content.match(/\[(?:project\.dependencies|tool\.poetry\.dependencies)\]([\s\S]*?)(?=\n\[|$)/);

      if (depSection) {
        const depLines = depSection[1].split('\n').filter((line) => line.includes('='));
        for (const line of depLines) {
          const match = line.match(/^(\w[\w-]*)\s*=/);
          if (match) {
            dependencies.push({ name: match[1], isDev: false });
          }
        }
      }

      return {
        name: nameMatch?.[1] || path.basename(projectPath),
        version: versionMatch?.[1],
        description: descMatch?.[1],
        dependencies,
      };
    } catch (error) {
      logger.error('Failed to parse pyproject.toml', error instanceof Error ? error : undefined);
    }
  }

  // Try requirements.txt
  const requirementsPath = path.join(projectPath, 'requirements.txt');

  if (fs.existsSync(requirementsPath)) {
    try {
      const content = await fs.promises.readFile(requirementsPath, 'utf-8');
      const dependencies: ProjectDependency[] = [];

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
          if (match) {
            dependencies.push({ name: match[1], isDev: false });
          }
        }
      }

      return {
        name: path.basename(projectPath),
        dependencies,
      };
    } catch (error) {
      logger.error('Failed to parse requirements.txt', error instanceof Error ? error : undefined);
    }
  }

  return null;
}

/**
 * Scan project structure
 */
export async function scanProjectStructure(
  projectPath: string,
  maxDepth: number = 3
): Promise<ProjectStructure> {
  const files: ProjectFile[] = [];
  const directories: string[] = [];

  async function scan(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {return;}

    try {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(projectPath, entryPath);

        if (entry.isDirectory()) {
          if (IGNORED_DIRECTORIES.has(entry.name)) {continue;}

          directories.push(relativePath);
          files.push({
            path: relativePath,
            name: entry.name,
            type: 'directory',
          });

          await scan(entryPath, depth + 1);
        } else {
          if (IGNORED_FILES.has(entry.name)) {continue;}

          const stats = await fs.promises.stat(entryPath);
          const ext = path.extname(entry.name).slice(1);

          files.push({
            path: relativePath,
            name: entry.name,
            type: 'file',
            size: stats.size,
            extension: ext || undefined,
          });
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await scan(projectPath, 0);

  return {
    rootPath: projectPath,
    files,
    directories,
    totalFiles: files.filter((f) => f.type === 'file').length,
    totalDirectories: directories.length,
  };
}

/**
 * Get Git information
 */
export async function getGitInfo(
  projectPath: string
): Promise<{ branch?: string; remoteUrl?: string; hasUncommittedChanges: boolean } | undefined> {
  const gitPath = path.join(projectPath, '.git');

  if (!fs.existsSync(gitPath)) {
    return undefined;
  }

  try {
    const result: { branch?: string; remoteUrl?: string; hasUncommittedChanges: boolean } = {
      hasUncommittedChanges: false,
    };

    // Get current branch
    const headPath = path.join(gitPath, 'HEAD');
    if (fs.existsSync(headPath)) {
      const headContent = await fs.promises.readFile(headPath, 'utf-8');
      const match = headContent.match(/ref: refs\/heads\/(.+)/);
      if (match) {
        result.branch = match[1].trim();
      }
    }

    // Get remote URL
    const configPath = path.join(gitPath, 'config');
    if (fs.existsSync(configPath)) {
      const configContent = await fs.promises.readFile(configPath, 'utf-8');
      const match = configContent.match(/url\s*=\s*(.+)/);
      if (match) {
        result.remoteUrl = match[1].trim();
      }
    }

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Get README content (truncated)
 */
export async function getReadmeContent(
  projectPath: string,
  maxLength: number = 2000
): Promise<string | undefined> {
  const readmeNames = ['README.md', 'README.markdown', 'README.txt', 'README', 'readme.md'];

  for (const name of readmeNames) {
    const readmePath = path.join(projectPath, name);
    if (fs.existsSync(readmePath)) {
      try {
        const content = await fs.promises.readFile(readmePath, 'utf-8');
        if (content.length > maxLength) {
          return content.slice(0, maxLength) + '\n\n[... truncated ...]';
        }
        return content;
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

/**
 * Detect project patterns
 */
export function detectPatterns(structure: ProjectStructure, dependencies: ProjectDependency[]): string[] {
  const patterns: string[] = [];
  const depNames = new Set(dependencies.map((d) => d.name));
  const dirs = new Set(structure.directories);
  const fileNames = structure.files.map((f) => f.name);

  // Testing patterns
  if (dirs.has('__tests__') || dirs.has('test') || dirs.has('tests') || dirs.has('spec')) {
    patterns.push('unit-testing');
  }
  if (depNames.has('jest') || depNames.has('mocha') || depNames.has('vitest')) {
    patterns.push('test-framework');
  }
  if (depNames.has('cypress') || depNames.has('playwright') || depNames.has('puppeteer')) {
    patterns.push('e2e-testing');
  }

  // CI/CD patterns
  if (dirs.has('.github') || fileNames.some((f) => f.includes('workflow'))) {
    patterns.push('github-actions');
  }
  if (fileNames.includes('.gitlab-ci.yml')) {
    patterns.push('gitlab-ci');
  }
  if (fileNames.includes('Jenkinsfile')) {
    patterns.push('jenkins');
  }

  // Docker patterns
  if (fileNames.includes('Dockerfile') || fileNames.includes('docker-compose.yml')) {
    patterns.push('docker');
  }
  if (fileNames.includes('docker-compose.yml') || fileNames.includes('docker-compose.yaml')) {
    patterns.push('docker-compose');
  }

  // Code quality patterns
  if (fileNames.includes('.eslintrc.js') || fileNames.includes('.eslintrc.json') || fileNames.includes('eslint.config.js')) {
    patterns.push('eslint');
  }
  if (fileNames.includes('.prettierrc') || fileNames.includes('prettier.config.js')) {
    patterns.push('prettier');
  }
  if (depNames.has('husky')) {
    patterns.push('git-hooks');
  }

  // Architecture patterns
  if (dirs.has('src/components') || dirs.has('components')) {
    patterns.push('component-based');
  }
  if (dirs.has('src/services') || dirs.has('services')) {
    patterns.push('service-layer');
  }
  if (dirs.has('src/utils') || dirs.has('utils') || dirs.has('lib')) {
    patterns.push('utility-modules');
  }
  if (dirs.has('src/hooks') || dirs.has('hooks')) {
    patterns.push('custom-hooks');
  }
  if (dirs.has('src/api') || dirs.has('api')) {
    patterns.push('api-layer');
  }

  // Monorepo patterns
  if (dirs.has('packages') || fileNames.includes('lerna.json') || fileNames.includes('pnpm-workspace.yaml')) {
    patterns.push('monorepo');
  }

  return patterns;
}

/**
 * Identify key files for context
 */
export function identifyKeyFiles(structure: ProjectStructure, _projectType: ProjectType): string[] {
  const keyFiles: string[] = [];

  const priorityFiles = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'README.md',
    '.env.example',
    'docker-compose.yml',
    'Dockerfile',
  ];

  const priorityPatterns = [
    /^src\/main\.(ts|tsx|js|jsx|py|rs|go)$/,
    /^src\/index\.(ts|tsx|js|jsx)$/,
    /^src\/app\.(ts|tsx|js|jsx|py)$/,
    /^main\.(ts|tsx|js|jsx|py|rs|go)$/,
    /^index\.(ts|tsx|js|jsx)$/,
    /^app\.(ts|tsx|js|jsx|py)$/,
    /^src\/App\.(tsx|jsx)$/,
  ];

  for (const file of structure.files) {
    if (file.type !== 'file') {continue;}

    // Check priority files
    if (priorityFiles.includes(file.name)) {
      keyFiles.push(file.path);
      continue;
    }

    // Check priority patterns
    for (const pattern of priorityPatterns) {
      if (pattern.test(file.path)) {
        keyFiles.push(file.path);
        break;
      }
    }
  }

  // Limit to top 15 key files
  return keyFiles.slice(0, 15);
}

/**
 * Identify source and test directories
 */
export function identifyDirectories(structure: ProjectStructure): {
  sourceDirectories: string[];
  testDirectories: string[];
} {
  const sourceDirectories: string[] = [];
  const testDirectories: string[] = [];

  const sourceDirNames = ['src', 'lib', 'source', 'app', 'packages'];
  const testDirNames = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e'];

  for (const dir of structure.directories) {
    const dirName = path.basename(dir);

    if (sourceDirNames.includes(dirName)) {
      sourceDirectories.push(dir);
    }
    if (testDirNames.includes(dirName)) {
      testDirectories.push(dir);
    }
  }

  return { sourceDirectories, testDirectories };
}
