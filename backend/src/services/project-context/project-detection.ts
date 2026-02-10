/**
 * Project Detection - Types, config patterns, project type/framework detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

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

export const CONFIG_PATTERNS: Record<ProjectType, string[]> = {
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

export const FRAMEWORK_INDICATORS: Record<FrameworkType, { packages: string[]; files: string[] }> = {
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

// ============================================================================
// Core Detection Functions
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
