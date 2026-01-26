/**
 * Code Execution Module
 *
 * Provides secure code execution capabilities using Docker (local)
 * or Judge0 API (production). Supports Python, Node.js, and Bash
 * with automatic safety validation.
 *
 * @module services/code-execution
 *
 * @example
 * ```typescript
 * import {
 *   executeCodeFromTask,
 *   executeCodeDirect,
 *   isCodeExecutionEnabled,
 * } from './services/code-execution';
 *
 * // Execute code from natural language
 * const result = await executeCodeFromTask({
 *   task: 'Calculate fibonacci numbers up to 100',
 *   language: 'python',
 * });
 *
 * // Execute pre-written code
 * const result = await executeCodeDirect(
 *   'print("Hello, World!")',
 *   'python'
 * );
 * ```
 */

// ===========================================
// Type Exports
// ===========================================

export type {
  SupportedLanguage,
  LanguageConfig,
  CodeGenerationRequest,
  GeneratedCode,
  ExecutionOptions,
  ExecutionResult,
  SafetyCheckResult,
  SafetyViolation,
  SafetyWarning,
  ViolationType,
  WarningType,
  ExecuteCodeInput,
  ExecuteCodeOutput,
} from './types';

export {
  LANGUAGE_CONFIGS,
  DEFAULT_EXECUTION_OPTIONS,
  STRICT_EXECUTION_OPTIONS,
  MAX_CODE_LENGTH,
  MAX_OUTPUT_LENGTH,
  MAX_INPUT_DATA_LENGTH,
  TIMEOUT_EXIT_CODE,
  isSupportedLanguage,
  getLanguageConfig,
} from './types';

// ===========================================
// Service Exports
// ===========================================

export {
  executeCodeFromTask,
  executeCodeDirect,
  isCodeExecutionEnabled,
  checkCodeExecutionHealth,
} from './execution-service';

// ===========================================
// Provider Exports
// ===========================================

export type {
  ExecutorProvider,
  ExecutorProviderType,
  ProviderConfig,
  DockerConfig,
  Judge0Config,
} from './executor-provider';

export {
  JUDGE0_LANGUAGE_IDS,
  JUDGE0_LANGUAGE_NAMES,
  DEFAULT_DOCKER_CONFIG,
  DEFAULT_JUDGE0_CONFIG,
  getPreferredProvider,
} from './executor-provider';

export {
  ExecutorFactory,
  getExecutorFactory,
  getExecutor,
  isExecutionAvailable,
} from './executor-factory';

// ===========================================
// Executor Exports
// ===========================================

export {
  SandboxExecutor,
  getSandboxExecutor,
  isSandboxAvailable,
} from './sandbox-executor';

export {
  Judge0Executor,
  getJudge0Executor,
} from './judge0-executor';

// ===========================================
// Component Exports
// ===========================================

export {
  CodeGenerator,
  getCodeGenerator,
  generateCode,
} from './code-generator';

export {
  validateCode,
  quickSafetyCheck,
  formatSafetyReport,
} from './safety-validator';
