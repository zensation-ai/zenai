/**
 * Judge0 Executor
 *
 * Executes code via the Judge0 API (RapidAPI or self-hosted).
 * Handles submission, polling, and result formatting.
 *
 * Judge0 Documentation: https://ce.judge0.com/
 *
 * @module services/code-execution/judge0-executor
 */

import { logger } from '../../utils/logger';
import {
  SupportedLanguage,
  ExecutionOptions,
  ExecutionResult,
  DEFAULT_EXECUTION_OPTIONS,
  MAX_OUTPUT_LENGTH,
  TIMEOUT_EXIT_CODE,
} from './types';
import {
  ExecutorProvider,
  Judge0Config,
  DEFAULT_JUDGE0_CONFIG,
  JUDGE0_LANGUAGE_IDS,
} from './executor-provider';
import { randomUUID } from 'crypto';

// ===========================================
// Judge0 API Types
// ===========================================

/**
 * Judge0 submission request
 */
interface Judge0Submission {
  source_code: string;
  language_id: number;
  stdin?: string;
  expected_output?: string;
  cpu_time_limit?: number;
  cpu_extra_time?: number;
  wall_time_limit?: number;
  memory_limit?: number;
  stack_limit?: number;
  max_processes_and_or_threads?: number;
  enable_per_process_and_thread_time_limit?: boolean;
  enable_per_process_and_thread_memory_limit?: boolean;
  max_file_size?: number;
  number_of_runs?: number;
}

/**
 * Judge0 submission response
 */
interface Judge0SubmissionResponse {
  token: string;
}

/**
 * Judge0 result status
 */
interface Judge0Status {
  id: number;
  description: string;
}

/**
 * Judge0 execution result
 */
interface Judge0Result {
  token: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  exit_code: number | null;
  status: Judge0Status;
  time: string | null;
  memory: number | null;
  wall_time: string | null;
}

/**
 * Judge0 status codes
 */
const JUDGE0_STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
} as const;

// ===========================================
// Judge0 Executor Class
// ===========================================

/**
 * Code execution provider using Judge0 API
 */
export class Judge0Executor implements ExecutorProvider {
  readonly name = 'judge0';
  private readonly config: Judge0Config;

  constructor(config: Partial<Judge0Config> = {}) {
    this.config = { ...DEFAULT_JUDGE0_CONFIG, ...config };
  }

  /**
   * Check if Judge0 is configured and available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      logger.debug('Judge0 not available: No API key configured');
      return false;
    }

    try {
      const response = await this.makeRequest('/about', 'GET');
      return response.ok;
    } catch (error) {
      logger.debug('Judge0 not available: API check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return ['python', 'nodejs', 'bash'];
  }

  /**
   * Execute code via Judge0 API
   */
  async execute(
    code: string,
    language: SupportedLanguage,
    options: Partial<ExecutionOptions> = {}
  ): Promise<ExecutionResult> {
    const opts: ExecutionOptions = { ...DEFAULT_EXECUTION_OPTIONS, ...options };
    const executionId = randomUUID();
    const startTime = Date.now();

    logger.info('Judge0 execution started', {
      executionId,
      language,
      codeLength: code.length,
    });

    try {
      // Create submission
      const submission = this.buildSubmission(code, language, opts);
      const token = await this.submitCode(submission);

      logger.debug('Judge0 submission created', { executionId, token });

      // Poll for result
      const result = await this.pollResult(token, opts.timeout);

      // Format result
      const executionTimeMs = Date.now() - startTime;
      return this.formatResult(result, executionId, executionTimeMs);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Judge0 execution failed', err, { executionId });

      return {
        success: false,
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        executionTimeMs: Date.now() - startTime,
        truncated: false,
        error: err.message,
        executionId,
      };
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Build Judge0 submission from our parameters
   */
  private buildSubmission(
    code: string,
    language: SupportedLanguage,
    options: ExecutionOptions
  ): Judge0Submission {
    const languageId = JUDGE0_LANGUAGE_IDS[language];

    // Parse memory limit (e.g., "256m" -> 256000 KB)
    const memoryKb = this.parseMemoryLimit(options.memoryLimit);

    // Convert timeout to seconds, capped at Judge0 free tier limits
    // Judge0 CE free tier: cpu_time_limit <= 20s, wall_time_limit <= 30s
    const timeoutSec = Math.min(options.timeout / 1000, 15);
    const wallTimeLimit = Math.min(timeoutSec + 5, 25);

    return {
      source_code: Buffer.from(code).toString('base64'),
      language_id: languageId,
      cpu_time_limit: timeoutSec,
      wall_time_limit: wallTimeLimit,
      memory_limit: memoryKb,
      max_processes_and_or_threads: options.pidsLimit,
      enable_per_process_and_thread_time_limit: true,
      enable_per_process_and_thread_memory_limit: true,
    };
  }

  /**
   * Submit code to Judge0
   */
  private async submitCode(submission: Judge0Submission): Promise<string> {
    const response = await this.makeRequest(
      '/submissions?base64_encoded=true&wait=false',
      'POST',
      submission
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Judge0 submission failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as Judge0SubmissionResponse;
    return data.token;
  }

  /**
   * Poll Judge0 for execution result
   */
  private async pollResult(token: string, timeout: number): Promise<Judge0Result> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.config.maxPollingAttempts) {
      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeout + 5000) {
        throw new Error('Execution timeout exceeded while polling');
      }

      const response = await this.makeRequest(
        `/submissions/${token}?base64_encoded=true&fields=*`,
        'GET'
      );

      if (!response.ok) {
        throw new Error(`Judge0 polling failed: ${response.status}`);
      }

      const result = await response.json() as Judge0Result;

      // Check if execution is complete
      if (result.status.id > JUDGE0_STATUS.PROCESSING) {
        return result;
      }

      // Wait before next poll
      await this.sleep(this.config.pollingInterval);
      attempts++;
    }

    throw new Error('Maximum polling attempts exceeded');
  }

  /**
   * Format Judge0 result to our ExecutionResult format
   */
  private formatResult(
    result: Judge0Result,
    executionId: string,
    executionTimeMs: number
  ): ExecutionResult {
    // Decode base64 outputs
    let stdout = this.decodeBase64(result.stdout);
    let stderr = this.decodeBase64(result.stderr);
    const compileOutput = this.decodeBase64(result.compile_output);

    // Combine compile errors with stderr
    if (compileOutput) {
      stderr = compileOutput + (stderr ? '\n' + stderr : '');
    }

    // Determine success based on status
    const success = result.status.id === JUDGE0_STATUS.ACCEPTED;

    // Determine exit code
    let exitCode = result.exit_code ?? -1;
    if (result.status.id === JUDGE0_STATUS.TIME_LIMIT_EXCEEDED) {
      exitCode = TIMEOUT_EXIT_CODE;
    }

    // Determine error message
    let error: string | undefined;
    if (!success) {
      error = this.getErrorMessage(result.status);
    }

    // Truncate if necessary
    let truncated = false;
    if (stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (output truncated)';
      truncated = true;
    }
    if (stderr.length > MAX_OUTPUT_LENGTH) {
      stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (errors truncated)';
      truncated = true;
    }

    logger.info('Judge0 execution completed', {
      executionId,
      success,
      status: result.status.description,
      exitCode,
      time: result.time,
      memory: result.memory,
    });

    return {
      success,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
      executionTimeMs,
      truncated,
      error,
      executionId,
    };
  }

  /**
   * Make HTTP request to Judge0 API
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<Response> {
    const url = `${this.config.apiUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add RapidAPI headers if configured
    if (this.config.rapidApiHost) {
      headers['X-RapidAPI-Key'] = this.config.apiKey;
      headers['X-RapidAPI-Host'] = this.config.rapidApiHost;
    } else {
      // Self-hosted Judge0 with API key
      headers['X-Auth-Token'] = this.config.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.requestTimeout
    );

    try {
      return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse memory limit string to KB
   */
  private parseMemoryLimit(limit: string): number {
    const match = limit.match(/^(\d+)(m|g|k)?$/i);
    if (!match) {
      return 256000; // Default 256MB
    }

    const value = parseInt(match[1], 10);
    const unit = (match[2] || 'm').toLowerCase();

    switch (unit) {
      case 'g':
        return value * 1024 * 1024; // GB to KB
      case 'm':
        return value * 1024; // MB to KB
      case 'k':
        return value; // Already KB
      default:
        return value * 1024; // Assume MB
    }
  }

  /**
   * Decode base64 string safely
   */
  private decodeBase64(encoded: string | null): string {
    if (!encoded) {return '';}
    try {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
      return encoded; // Return as-is if not valid base64
    }
  }

  /**
   * Get human-readable error message from status
   */
  private getErrorMessage(status: Judge0Status): string {
    switch (status.id) {
      case JUDGE0_STATUS.TIME_LIMIT_EXCEEDED:
        return 'Execution terminated: timeout exceeded';
      case JUDGE0_STATUS.COMPILATION_ERROR:
        return 'Compilation error';
      case JUDGE0_STATUS.RUNTIME_ERROR_SIGSEGV:
        return 'Runtime error: Segmentation fault';
      case JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ:
        return 'Runtime error: File size limit exceeded';
      case JUDGE0_STATUS.RUNTIME_ERROR_SIGFPE:
        return 'Runtime error: Floating point exception';
      case JUDGE0_STATUS.RUNTIME_ERROR_SIGABRT:
        return 'Runtime error: Aborted';
      case JUDGE0_STATUS.RUNTIME_ERROR_NZEC:
        return 'Runtime error: Non-zero exit code';
      case JUDGE0_STATUS.RUNTIME_ERROR_OTHER:
        return 'Runtime error';
      case JUDGE0_STATUS.INTERNAL_ERROR:
        return 'Internal server error';
      case JUDGE0_STATUS.EXEC_FORMAT_ERROR:
        return 'Execution format error';
      default:
        return status.description;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let judge0Instance: Judge0Executor | null = null;

/**
 * Get the singleton Judge0 executor instance
 */
export function getJudge0Executor(): Judge0Executor {
  if (!judge0Instance) {
    judge0Instance = new Judge0Executor();
  }
  return judge0Instance;
}
