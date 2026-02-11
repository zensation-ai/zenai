/**
 * Project Output - Analysis orchestration, context generation, formatting
 */

import * as path from 'path';
import { logger } from '../../utils/logger';
import {
  ProjectDependency,
  ProjectInfo,
  ProjectContext,
  detectProjectType,
  detectFrameworks,
  getLanguageName,
} from './project-detection';
import {
  parsePackageJson,
  parsePythonProject,
  scanProjectStructure,
  getGitInfo,
  getReadmeContent,
  detectPatterns,
  identifyKeyFiles,
  identifyDirectories,
} from './project-parsing';

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
