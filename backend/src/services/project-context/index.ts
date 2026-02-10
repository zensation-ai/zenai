/**
 * Project Context Service
 *
 * Detects, analyzes, and provides context about software projects.
 * Enables AI to understand codebase structure, dependencies, and patterns.
 */

// Detection: Types, config patterns, project type/framework detection
export {
  type ProjectType,
  type FrameworkType,
  type ProjectDependency,
  type ProjectFile,
  type ProjectStructure,
  type ProjectInfo,
  type ProjectContext,
  CONFIG_PATTERNS,
  FRAMEWORK_INDICATORS,
  detectProjectType,
  detectFrameworks,
  getLanguageName,
} from './project-detection';

// Parsing: File parsing, structure scanning, pattern detection
export {
  parsePackageJson,
  parsePythonProject,
  scanProjectStructure,
  getGitInfo,
  getReadmeContent,
  detectPatterns,
  identifyKeyFiles,
  identifyDirectories,
} from './project-parsing';

// Output: Analysis orchestration, context generation, formatting
export {
  analyzeProject,
  generateProjectContext,
  formatProjectContext,
  getQuickProjectSummary,
} from './project-output';
