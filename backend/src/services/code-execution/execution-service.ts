/**
 * Code Execution Service Module
 *
 * High-level service that orchestrates the entire code execution flow:
 * 1. Code generation from task description
 * 2. Safety validation
 * 3. Sandboxed execution (Docker or Judge0)
 * 4. Result formatting
 *
 * @module services/code-execution/execution-service
 */

import { logger } from '../../utils/logger';
import { generateCode } from './code-generator';
import { validateCode, formatSafetyReport } from './safety-validator';
import { getExecutorFactory, isExecutionAvailable } from './executor-factory';
import {
  SupportedLanguage,
  ExecuteCodeInput,
  ExecuteCodeOutput,
  ExecutionOptions,
  DEFAULT_EXECUTION_OPTIONS,
  isSupportedLanguage,
} from './types';

// ===========================================
// Service Configuration
// ===========================================

/**
 * Whether code execution is enabled
 */
export function isCodeExecutionEnabled(): boolean {
  return process.env.ENABLE_CODE_EXECUTION === 'true';
}

/**
 * Get execution options from environment
 */
function getExecutionOptions(): Partial<ExecutionOptions> {
  return {
    timeout: process.env.CODE_EXECUTION_TIMEOUT
      ? parseInt(process.env.CODE_EXECUTION_TIMEOUT, 10)
      : DEFAULT_EXECUTION_OPTIONS.timeout,
    memoryLimit: process.env.CODE_EXECUTION_MEMORY_LIMIT
      || DEFAULT_EXECUTION_OPTIONS.memoryLimit,
  };
}

// ===========================================
// Main Execution Function
// ===========================================

/**
 * Execute code from a natural language task description
 *
 * This is the main entry point for code execution. It:
 * 1. Validates that code execution is available
 * 2. Generates code using Claude
 * 3. Validates the code for security
 * 4. Executes in a sandboxed environment (Docker or Judge0)
 * 5. Returns formatted results
 *
 * @param input - The execution input with task, language, etc.
 * @returns Execution output with code, results, and any errors
 */
export async function executeCodeFromTask(
  input: ExecuteCodeInput
): Promise<ExecuteCodeOutput> {
  const startTime = Date.now();
  const { task, language, context, inputData } = input;

  logger.info('Starting code execution from task', {
    language,
    taskLength: task.length,
    hasContext: !!context,
    hasInputData: !!inputData,
  });

  // Validate language
  if (!isSupportedLanguage(language)) {
    return {
      success: false,
      error: `Unsupported language: ${language}. Supported: python, nodejs, bash`,
    };
  }

  // Check if code execution is enabled
  if (!isCodeExecutionEnabled()) {
    return {
      success: false,
      error: 'Code execution is not enabled. Set ENABLE_CODE_EXECUTION=true',
    };
  }

  // Check execution provider availability
  const executorAvailable = await isExecutionAvailable();
  if (!executorAvailable) {
    const factory = getExecutorFactory();
    const info = factory.getProviderInfo();
    return {
      success: false,
      error: `No execution provider available. Configure JUDGE0_API_KEY for production or ensure Docker is running for development.`,
      errorDetails: `Provider info: ${JSON.stringify(info)}`,
    };
  }

  try {
    // Step 1: Generate code
    logger.debug('Step 1: Generating code');
    const generated = await generateCode(task, language, context, inputData);

    // Step 2: Validate code safety
    logger.debug('Step 2: Validating code safety');
    const safetyResult = validateCode(generated.code, language);

    if (!safetyResult.safe) {
      logger.warn('Code failed safety validation', {
        violations: safetyResult.violations.length,
        score: safetyResult.score,
      });

      return {
        success: false,
        code: generated.code,
        language,
        explanation: generated.explanation,
        error: 'Code failed safety validation',
        errorDetails: formatSafetyReport(safetyResult),
        warnings: safetyResult.warnings.map(w => w.message),
      };
    }

    // Step 3: Execute code via provider
    logger.debug('Step 3: Executing code');
    const factory = getExecutorFactory();
    const executor = await factory.getExecutor();
    const executionOptions = getExecutionOptions();

    logger.debug('Using executor', { provider: executor.name });
    const result = await executor.execute(generated.code, language, executionOptions);

    // Step 4: Format and return results
    const totalTime = Date.now() - startTime;
    logger.info('Code execution completed', {
      success: result.success,
      provider: executor.name,
      totalTimeMs: totalTime,
      executionTimeMs: result.executionTimeMs,
    });

    return {
      success: result.success,
      code: generated.code,
      language,
      explanation: generated.explanation,
      output: result.stdout || undefined,
      errors: result.stderr || undefined,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      warnings: safetyResult.warnings.length > 0
        ? safetyResult.warnings.map(w => w.message)
        : undefined,
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Code execution failed', err);

    return {
      success: false,
      error: 'Code execution failed',
      errorDetails: err.message,
    };
  }
}

// ===========================================
// Direct Code Execution
// ===========================================

/**
 * Execute pre-written code directly (without generation)
 *
 * Use this when you already have code and just want to run it.
 *
 * @param code - The source code to execute
 * @param language - The programming language
 * @param skipValidation - Skip safety validation (use with caution!)
 * @returns Execution output
 */
export async function executeCodeDirect(
  code: string,
  language: SupportedLanguage,
  skipValidation: boolean = false
): Promise<ExecuteCodeOutput> {
  logger.info('Direct code execution', {
    language,
    codeLength: code.length,
    skipValidation,
  });

  // Validate language
  if (!isSupportedLanguage(language)) {
    return {
      success: false,
      error: `Unsupported language: ${language}`,
    };
  }

  // Check availability
  if (!isCodeExecutionEnabled()) {
    return {
      success: false,
      error: 'Code execution is not enabled',
    };
  }

  const executorAvailable = await isExecutionAvailable();
  if (!executorAvailable) {
    return {
      success: false,
      error: 'No execution provider available',
    };
  }

  try {
    // Safety validation (unless skipped)
    let warnings: string[] | undefined;

    if (!skipValidation) {
      const safetyResult = validateCode(code, language);

      if (!safetyResult.safe) {
        return {
          success: false,
          code,
          language,
          error: 'Code failed safety validation',
          errorDetails: formatSafetyReport(safetyResult),
        };
      }

      if (safetyResult.warnings.length > 0) {
        warnings = safetyResult.warnings.map(w => w.message);
      }
    }

    // Execute via factory
    const factory = getExecutorFactory();
    const executor = await factory.getExecutor();
    const executionOptions = getExecutionOptions();

    logger.debug('Using executor for direct execution', { provider: executor.name });
    const result = await executor.execute(code, language, executionOptions);

    return {
      success: result.success,
      code,
      language,
      output: result.stdout || undefined,
      errors: result.stderr || undefined,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      warnings,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      code,
      language,
      error: 'Execution failed',
      errorDetails: errorMessage,
    };
  }
}

// ===========================================
// Health Check
// ===========================================

/**
 * Check the health of the code execution service
 */
export async function checkCodeExecutionHealth(): Promise<{
  available: boolean;
  enabled: boolean;
  provider: string | null;
  providerType: string | null;
  error?: string;
}> {
  const enabled = isCodeExecutionEnabled();

  if (!enabled) {
    return {
      available: false,
      enabled: false,
      provider: null,
      providerType: null,
      error: 'Code execution is disabled',
    };
  }

  try {
    const factory = getExecutorFactory();
    await factory.initialize();
    const info = factory.getProviderInfo();

    return {
      available: info.available,
      enabled: true,
      provider: info.name,
      providerType: info.type,
      error: info.available ? undefined : 'No execution provider available',
    };
  } catch (error) {
    return {
      available: false,
      enabled: true,
      provider: null,
      providerType: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
