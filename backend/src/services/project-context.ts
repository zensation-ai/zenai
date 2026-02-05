/**
 * Project Context Service
 *
 * Detects, analyzes, and provides context about software projects.
 * Enables AI to understand codebase structure, dependencies, and patterns.
 *
 * @module services/project-context
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type ProjectType =
  | 'nodejs'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'unknown';

export type FrameworkType =
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'angular'
  | 'express'
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'spring'
  | 'rails'
  | 'laravel'
  | 'unknown';

export interface ProjectDependency {
  name: string;
  version?: string;
  isDev: boolean;
}

export interface ProjectFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
}

export interface ProjectStructure {
  rootPath: string;
  files: ProjectFile[];
  directories: string[];
  totalFiles: number;
  totalDirectories: number;
}

export interface ProjectInfo {
  /** Project name from config */
  name: string;
  /** Version from config */
  version?: string;
  /** Project description */
  description?: string;
  /** Detected project type */
  type: ProjectType;
  /** Detected framework(s) */
  frameworks: FrameworkType[];
  /** Primary language */
  language: string;
  /** Project dependencies */
  dependencies: ProjectDependency[];
  /** Dev dependencies count */
  devDependenciesCount: number;
  /** Scripts/commands available */
  scripts: Record<string, string>;
  /** Project structure summary */
  structure: ProjectStructure;
  /** Entry point file */
  entryPoint?: string;
  /** Main source directories */
  sourceDirectories: string[];
  /** Test directories */
  testDirectories: string[];
  /** README content (truncated) */
  readme?: string;
  /** Git information */
  git?: {
    branch?: string;
    remoteUrl?: string;
    hasUncommittedChanges: boolean;
  };
  /** Detected patterns */
  patterns: string[];
  /** Build/package configuration files found */
  configFiles: string[];
}

export interface ProjectContext {
  /** Summarized context for AI */
  summary: string;
  /** Key files to reference */
  keyFiles: string[];
  /** Technology stack */
  techStack: string[];
  /** Suggested focus areas */
  focusAreas: string[];
  /** Full project info */
  projectInfo: ProjectInfo;
}

// ============================================================================
// Configuration File Patterns
// ============================================================================

const CONFIG_PATTERNS: Record<ProjectType, string[]> = {
  nodejs: ['package.json'],
  typescript: ['tsconfig.json', 'package.json'],
  python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  rust: ['Cargo.toml'],
  go: ['go.mod', 'go.sum'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  csharp: ['*.csproj', '*.sln'],
  ruby: ['Gemfile', '*.gemspec'],
  php: ['composer.json'],
  swift: ['Package.swift', '*.xcodeproj'],
  kotlin: ['build.gradle.kts', 'build.gradle'],
  unknown: [],
};

const FRAMEWORK_INDICATORS: Record<FrameworkType, { packages: string[]; files: string[] }> = {
  react: {
    packages: ['react', 'react-dom'],
    files: ['src/App.tsx', 'src/App.jsx', 'src/index.tsx'],
  },
  nextjs: {
    packages: ['next'],
    files: ['next.config.js', 'next.config.mjs', 'pages/', 'app/'],
  },
  vue: {
    packages: ['vue'],
    files: ['vue.config.js', 'src/App.vue'],
  },
  angular: {
    packages: ['@angular/core'],
    files: ['angular.json', 'src/app/app.component.ts'],
  },
  express: {
    packages: ['express'],
    files: [],
  },
  fastapi: {
    packages: ['fastapi'],
    files: [],
  },
  django: {
    packages: ['django'],
    files: ['manage.py', 'settings.py'],
  },
  flask: {
    packages: ['flask'],
    files: ['app.py'],
  },
  spring: {
    packages: [],
    files: ['src/main/java', 'application.properties', 'application.yml'],
  },
  rails: {
    packages: ['rails'],
    files: ['config/routes.rb', 'app/controllers'],
  },
  laravel: {
    packages: ['laravel/framework'],
    files: ['artisan', 'app/Http/Controllers'],
  },
  unknown: { packages: [], files: [] },
};

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
// Core Functions
// ============================================================================

/**
 * Detect project type from directory
 */
export async function detectProjectType(projectPath: string): Promise<ProjectType> {
  try {
    const files = await fs.promises.readdir(projectPath);

    // Check for TypeScript first (more specific than nodejs)
    if (files.includes('tsconfig.json')) {
      return 'typescript';
    }

    // Check each project type
    for (const [type, patterns] of Object.entries(CONFIG_PATTERNS)) {
      if (type === 'unknown') {continue;}

      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          // Glob pattern - check with regex
          // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern comes from internal config, not user input
          const regex = new RegExp(pattern.replace('*', '.*'));
          if (files.some((f) => regex.test(f))) {
            return type as ProjectType;
          }
        } else if (pattern.endsWith('/')) {
          // Directory check
          const dirPath = path.join(projectPath, pattern.slice(0, -1));
          if (fs.existsSync(dirPath)) {
            return type as ProjectType;
          }
        } else {
          // Direct file check
          if (files.includes(pattern)) {
            return type as ProjectType;
          }
        }
      }
    }

    return 'unknown';
  } catch (error) {
    logger.error('Failed to detect project type', error instanceof Error ? error : undefined);
    return 'unknown';
  }
}

/**
 * Detect frameworks used in project
 */
export async function detectFrameworks(
  projectPath: string,
  dependencies: ProjectDependency[]
): Promise<FrameworkType[]> {
  const frameworks: FrameworkType[] = [];
  const depNames = new Set(dependencies.map((d) => d.name));

  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    if (framework === 'unknown') {continue;}

    // Check package dependencies
    const hasPackage = indicators.packages.some((pkg) => depNames.has(pkg));

    // Check file indicators
    let hasFile = false;
    for (const filePattern of indicators.files) {
      const filePath = path.join(projectPath, filePattern);
      if (fs.existsSync(filePath)) {
        hasFile = true;
        break;
      }
    }

    if (hasPackage || hasFile) {
      frameworks.push(framework as FrameworkType);
    }
  }

  return frameworks;
}

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

/**
 * Get language name for project type
 */
export function getLanguageName(projectType: ProjectType): string {
  const languageMap: Record<ProjectType, string> = {
    nodejs: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    unknown: 'Unknown',
  };

  return languageMap[projectType];
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Analyze a project and return full project info
 */
export async function analyzeProject(projectPath: string): Promise<ProjectInfo> {
  logger.info('Analyzing project', { path: projectPath });

  // Detect project type
  const projectType = await detectProjectType(projectPath);

  // Scan structure
  const structure = await scanProjectStructure(projectPath);

  // Parse project-specific config
  let name = path.basename(projectPath);
  let version: string | undefined;
  let description: string | undefined;
  let dependencies: ProjectDependency[] = [];
  let scripts: Record<string, string> = {};
  let entryPoint: string | undefined;

  if (projectType === 'nodejs' || projectType === 'typescript') {
    const pkgInfo = await parsePackageJson(projectPath);
    if (pkgInfo) {
      name = pkgInfo.name;
      version = pkgInfo.version;
      description = pkgInfo.description;
      dependencies = pkgInfo.dependencies;
      scripts = pkgInfo.scripts;
      entryPoint = pkgInfo.entryPoint;
    }
  } else if (projectType === 'python') {
    const pyInfo = await parsePythonProject(projectPath);
    if (pyInfo) {
      name = pyInfo.name;
      version = pyInfo.version;
      description = pyInfo.description;
      dependencies = pyInfo.dependencies;
    }
  }

  // Detect frameworks
  const frameworks = await detectFrameworks(projectPath, dependencies);

  // Get additional info
  const git = await getGitInfo(projectPath);
  const readme = await getReadmeContent(projectPath);
  const patterns = detectPatterns(structure, dependencies);
  const { sourceDirectories, testDirectories } = identifyDirectories(structure);

  // Identify config files found
  const configFiles = structure.files
    .filter((f) => {
      const configPatterns = [
        /^package\.json$/,
        /^tsconfig.*\.json$/,
        /^\.eslintrc/,
        /^\.prettierrc/,
        /^jest\.config/,
        /^vitest\.config/,
        /^vite\.config/,
        /^webpack\.config/,
        /^rollup\.config/,
        /^babel\.config/,
        /^\.env/,
        /^docker-compose/,
        /^Dockerfile$/,
        /^Makefile$/,
        /^pyproject\.toml$/,
        /^setup\.py$/,
        /^Cargo\.toml$/,
        /^go\.mod$/,
      ];
      return configPatterns.some((p) => p.test(f.name));
    })
    .map((f) => f.name);

  const projectInfo: ProjectInfo = {
    name,
    version,
    description,
    type: projectType,
    frameworks,
    language: getLanguageName(projectType),
    dependencies,
    devDependenciesCount: dependencies.filter((d) => d.isDev).length,
    scripts,
    structure,
    entryPoint,
    sourceDirectories,
    testDirectories,
    readme,
    git,
    patterns,
    configFiles,
  };

  logger.info('Project analysis complete', {
    name,
    type: projectType,
    frameworks,
    totalFiles: structure.totalFiles,
    totalDeps: dependencies.length,
  });

  return projectInfo;
}

/**
 * Generate project context for AI
 */
export async function generateProjectContext(projectPath: string): Promise<ProjectContext> {
  const projectInfo = await analyzeProject(projectPath);

  // Build tech stack
  const techStack: string[] = [projectInfo.language];

  for (const framework of projectInfo.frameworks) {
    if (framework !== 'unknown') {
      techStack.push(framework.charAt(0).toUpperCase() + framework.slice(1));
    }
  }

  // Add notable dependencies
  const notableDeps = projectInfo.dependencies
    .filter((d) => !d.isDev)
    .slice(0, 10)
    .map((d) => d.name);
  techStack.push(...notableDeps);

  // Identify key files
  const keyFiles = identifyKeyFiles(projectInfo.structure, projectInfo.type);

  // Determine focus areas based on patterns
  const focusAreas: string[] = [];

  if (projectInfo.patterns.includes('unit-testing')) {
    focusAreas.push('Test Coverage');
  }
  if (projectInfo.patterns.includes('docker')) {
    focusAreas.push('Containerization');
  }
  if (projectInfo.patterns.includes('github-actions') || projectInfo.patterns.includes('gitlab-ci')) {
    focusAreas.push('CI/CD Pipeline');
  }
  if (projectInfo.patterns.includes('monorepo')) {
    focusAreas.push('Monorepo Structure');
  }
  if (projectInfo.frameworks.includes('react') || projectInfo.frameworks.includes('vue')) {
    focusAreas.push('Frontend Components');
  }
  if (projectInfo.frameworks.includes('express') || projectInfo.frameworks.includes('fastapi')) {
    focusAreas.push('API Development');
  }

  // Build summary
  const summary = buildProjectSummary(projectInfo);

  return {
    summary,
    keyFiles,
    techStack: [...new Set(techStack)],
    focusAreas,
    projectInfo,
  };
}

/**
 * Build a human-readable project summary
 */
function buildProjectSummary(info: ProjectInfo): string {
  const parts: string[] = [];

  // Header
  parts.push(`# ${info.name}${info.version ? ` v${info.version}` : ''}`);

  if (info.description) {
    parts.push(`\n> ${info.description}`);
  }

  // Technology
  parts.push(`\n## Technology Stack`);
  parts.push(`- **Language:** ${info.language}`);
  parts.push(`- **Type:** ${info.type}`);

  if (info.frameworks.length > 0) {
    parts.push(`- **Frameworks:** ${info.frameworks.filter((f) => f !== 'unknown').join(', ')}`);
  }

  // Structure
  parts.push(`\n## Project Structure`);
  parts.push(`- **Files:** ${info.structure.totalFiles}`);
  parts.push(`- **Directories:** ${info.structure.totalDirectories}`);

  if (info.sourceDirectories.length > 0) {
    parts.push(`- **Source:** ${info.sourceDirectories.join(', ')}`);
  }
  if (info.testDirectories.length > 0) {
    parts.push(`- **Tests:** ${info.testDirectories.join(', ')}`);
  }

  // Dependencies
  if (info.dependencies.length > 0) {
    parts.push(`\n## Dependencies`);
    parts.push(`- **Production:** ${info.dependencies.filter((d) => !d.isDev).length}`);
    parts.push(`- **Development:** ${info.devDependenciesCount}`);

    const topDeps = info.dependencies
      .filter((d) => !d.isDev)
      .slice(0, 8)
      .map((d) => d.name);
    if (topDeps.length > 0) {
      parts.push(`- **Key packages:** ${topDeps.join(', ')}`);
    }
  }

  // Scripts
  if (Object.keys(info.scripts).length > 0) {
    parts.push(`\n## Available Scripts`);
    const importantScripts = ['build', 'test', 'start', 'dev', 'lint'];
    for (const script of importantScripts) {
      if (info.scripts[script]) {
        parts.push(`- \`${script}\`: ${info.scripts[script]}`);
      }
    }
  }

  // Patterns
  if (info.patterns.length > 0) {
    parts.push(`\n## Detected Patterns`);
    parts.push(info.patterns.map((p) => `- ${p}`).join('\n'));
  }

  // Git info
  if (info.git) {
    parts.push(`\n## Git`);
    if (info.git.branch) {
      parts.push(`- **Branch:** ${info.git.branch}`);
    }
    if (info.git.remoteUrl) {
      parts.push(`- **Remote:** ${info.git.remoteUrl}`);
    }
  }

  return parts.join('\n');
}

/**
 * Format project context for tool output
 */
export function formatProjectContext(context: ProjectContext): string {
  const parts: string[] = [];

  parts.push(context.summary);

  if (context.keyFiles.length > 0) {
    parts.push(`\n## Key Files`);
    parts.push(context.keyFiles.map((f) => `- ${f}`).join('\n'));
  }

  if (context.focusAreas.length > 0) {
    parts.push(`\n## Suggested Focus Areas`);
    parts.push(context.focusAreas.map((a) => `- ${a}`).join('\n'));
  }

  return parts.join('\n');
}

/**
 * Quick project summary for chat context
 */
export async function getQuickProjectSummary(projectPath: string): Promise<string> {
  try {
    const projectType = await detectProjectType(projectPath);

    if (projectType === 'unknown') {
      return `Unrecognized project at: ${projectPath}`;
    }

    const context = await generateProjectContext(projectPath);
    const { projectInfo } = context;

    const frameworks = projectInfo.frameworks.filter((f) => f !== 'unknown');
    const frameworkStr = frameworks.length > 0 ? ` (${frameworks.join(', ')})` : '';

    return `${projectInfo.name}: ${projectInfo.language}${frameworkStr} project with ${projectInfo.structure.totalFiles} files and ${projectInfo.dependencies.length} dependencies`;
  } catch (error) {
    logger.error('Failed to get quick project summary', error instanceof Error ? error : undefined);
    return `Project at: ${projectPath}`;
  }
}
