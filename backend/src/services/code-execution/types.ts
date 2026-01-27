/**
 * Code Execution Types Module
 *
 * Defines all types, interfaces, and constants for the
 * secure code execution service.
 *
 * @module services/code-execution/types
 */

// ===========================================
// Language Types
// ===========================================

/**
 * Supported programming languages for code execution
 */
export type SupportedLanguage = 'python' | 'nodejs' | 'bash';

/**
 * Language configuration including Docker image and execution command
 */
export interface LanguageConfig {
  /** Docker image to use */
  image: string;
  /** File extension for code files */
  extension: string;
  /** Command to execute the code */
  command: string[];
  /** Human-readable name */
  displayName: string;
  /** Available packages/modules */
  availablePackages: string[];
}

/**
 * Language configurations for all supported languages
 */
export const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  python: {
    image: 'python:3.11-slim',
    extension: '.py',
    command: ['python', '/code/script.py'],
    displayName: 'Python 3.11',
    availablePackages: [
      'math', 'json', 'datetime', 'collections', 'itertools',
      'functools', 're', 'random', 'statistics', 'decimal',
      'fractions', 'string', 'textwrap', 'unicodedata',
    ],
  },
  nodejs: {
    image: 'node:20-slim',
    extension: '.js',
    command: ['node', '/code/script.js'],
    displayName: 'Node.js 20',
    availablePackages: [
      'path', 'util', 'crypto', 'url', 'querystring',
      'string_decoder', 'buffer', 'events', 'stream',
    ],
  },
  bash: {
    image: 'alpine:3.19',
    extension: '.sh',
    command: ['sh', '/code/script.sh'],
    displayName: 'Bash (Alpine)',
    availablePackages: [
      'coreutils', 'grep', 'sed', 'awk', 'sort', 'uniq',
      'wc', 'head', 'tail', 'cut', 'tr', 'date', 'bc',
    ],
  },
};

// ===========================================
// Code Generation Types
// ===========================================

/**
 * Request to generate code from a task description
 */
export interface CodeGenerationRequest {
  /** Natural language description of the task */
  task: string;
  /** Target programming language */
  language: SupportedLanguage;
  /** Additional context from conversation */
  context?: string;
  /** Input data to process (optional) */
  inputData?: string;
}

/**
 * Generated code with metadata
 */
export interface GeneratedCode {
  /** The generated source code */
  code: string;
  /** Programming language */
  language: SupportedLanguage;
  /** Human-readable explanation of what the code does */
  explanation: string;
  /** Expected output/behavior description */
  estimatedBehavior: string;
  /** Required packages (beyond standard library) */
  requiredPackages: string[];
  /** Estimated complexity (1-10) */
  complexity: number;
}

// ===========================================
// Execution Types
// ===========================================

/**
 * Options for code execution
 */
export interface ExecutionOptions {
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Memory limit (e.g., "256m", "512m") */
  memoryLimit: string;
  /** CPU limit (e.g., "0.5", "1.0") */
  cpuLimit: string;
  /** Whether network access is allowed */
  networkEnabled: boolean;
  /** Maximum number of processes */
  pidsLimit: number;
  /** Temp filesystem size */
  tmpfsSize: string;
}

/**
 * Default execution options with conservative limits
 */
export const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  timeout: 30_000,        // 30 seconds
  memoryLimit: '256m',    // 256 MB RAM
  cpuLimit: '0.5',        // 50% of one CPU core
  networkEnabled: false,  // No network access
  pidsLimit: 50,          // Max 50 processes
  tmpfsSize: '64m',       // 64 MB temp storage
};

/**
 * Strict execution options for untrusted code
 */
export const STRICT_EXECUTION_OPTIONS: ExecutionOptions = {
  timeout: 10_000,        // 10 seconds
  memoryLimit: '128m',    // 128 MB RAM
  cpuLimit: '0.25',       // 25% of one CPU core
  networkEnabled: false,  // No network access
  pidsLimit: 20,          // Max 20 processes
  tmpfsSize: '32m',       // 32 MB temp storage
};

/**
 * Result of code execution
 */
export interface ExecutionResult {
  /** Whether execution completed successfully (exit code 0) */
  success: boolean;
  /** Standard output from the code */
  stdout: string;
  /** Standard error output */
  stderr: string;
  /** Process exit code */
  exitCode: number;
  /** Actual execution time in milliseconds */
  executionTimeMs: number;
  /** Whether output was truncated due to length */
  truncated: boolean;
  /** System-level error (not code error) */
  error?: string;
  /** Unique execution ID for tracking */
  executionId: string;
}

// ===========================================
// Safety Types
// ===========================================

/**
 * Result of safety validation
 */
export interface SafetyCheckResult {
  /** Whether the code passed all safety checks */
  safe: boolean;
  /** Critical violations that block execution */
  violations: SafetyViolation[];
  /** Non-blocking warnings */
  warnings: SafetyWarning[];
  /** Safety score (0-100, higher is safer) */
  score: number;
}

/**
 * A critical safety violation
 */
export interface SafetyViolation {
  /** Type of violation */
  type: ViolationType;
  /** Human-readable description */
  message: string;
  /** Line number where violation was found (if applicable) */
  line?: number;
  /** The problematic code snippet */
  snippet?: string;
}

/**
 * A non-critical safety warning
 */
export interface SafetyWarning {
  /** Type of warning */
  type: WarningType;
  /** Human-readable description */
  message: string;
  /** Suggestion for improvement */
  suggestion?: string;
}

/**
 * Types of safety violations
 */
export type ViolationType =
  | 'forbidden_import'
  | 'dangerous_function'
  | 'file_system_access'
  | 'network_access'
  | 'process_spawn'
  | 'code_injection'
  | 'path_traversal'
  | 'environment_access'
  | 'privilege_escalation';

/**
 * Types of safety warnings
 */
export type WarningType =
  | 'infinite_loop_risk'
  | 'high_complexity'
  | 'large_output_risk'
  | 'slow_operation'
  | 'resource_intensive';

// ===========================================
// Tool Types
// ===========================================

/**
 * Input schema for the execute_code tool
 */
export interface ExecuteCodeInput {
  /** Natural language task description */
  task: string;
  /** Target programming language */
  language: SupportedLanguage;
  /** Optional additional context */
  context?: string;
  /** Optional input data to process */
  inputData?: string;
}

/**
 * Output from the execute_code tool
 */
export interface ExecuteCodeOutput {
  /** Whether the entire operation succeeded */
  success: boolean;
  /** The generated code */
  code?: string;
  /** Programming language used */
  language?: SupportedLanguage;
  /** Explanation of the code */
  explanation?: string;
  /** Execution output (stdout) */
  output?: string;
  /** Execution errors (stderr) */
  errors?: string;
  /** Exit code */
  exitCode?: number;
  /** Execution time in ms */
  executionTimeMs?: number;
  /** Safety warnings (non-blocking) */
  warnings?: string[];
  /** Error message if operation failed */
  error?: string;
  /** Detailed error for debugging */
  errorDetails?: string;
}

// ===========================================
// Constants
// ===========================================

/** Maximum allowed code length in characters */
export const MAX_CODE_LENGTH = 20_000;

/** Maximum allowed output length in characters */
export const MAX_OUTPUT_LENGTH = 50_000;

/** Maximum allowed input data length */
export const MAX_INPUT_DATA_LENGTH = 100_000;

/** Timeout exit code (standard Linux) */
export const TIMEOUT_EXIT_CODE = 124;

/** Docker container name prefix */
export const CONTAINER_PREFIX = 'zenai-sandbox';

/** Temp directory for code files */
export const CODE_SANDBOX_DIR = process.env.CODE_SANDBOX_DIR || '/tmp/code-sandbox';

// ===========================================
// Utility Types
// ===========================================

/**
 * Check if a string is a valid supported language
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return ['python', 'nodejs', 'bash'].includes(lang);
}

/**
 * Get language config or throw if invalid
 */
export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
  const config = LANGUAGE_CONFIGS[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return config;
}
