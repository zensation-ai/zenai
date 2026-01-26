/**
 * Sandbox Executor Module
 *
 * Executes code securely in isolated Docker containers with:
 * - Resource limits (CPU, memory, PIDs)
 * - Network isolation
 * - Read-only filesystem
 * - Timeout enforcement
 * - Automatic cleanup
 *
 * @module services/code-execution/sandbox-executor
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import {
  SupportedLanguage,
  ExecutionOptions,
  ExecutionResult,
  DEFAULT_EXECUTION_OPTIONS,
  MAX_OUTPUT_LENGTH,
  TIMEOUT_EXIT_CODE,
  CONTAINER_PREFIX,
  CODE_SANDBOX_DIR,
  LANGUAGE_CONFIGS,
  getLanguageConfig,
} from './types';
import { ExecutorProvider } from './executor-provider';

// ===========================================
// Executor Class
// ===========================================

/**
 * Docker-based sandbox executor for secure code execution
 * Implements ExecutorProvider interface for factory pattern
 */
export class SandboxExecutor implements ExecutorProvider {
  readonly name = 'docker';
  private readonly tempDir: string;
  private readonly pullImages: boolean;

  /**
   * Create a new sandbox executor
   *
   * @param tempDir - Directory for temporary code files
   * @param pullImages - Whether to auto-pull missing images
   */
  constructor(
    tempDir: string = CODE_SANDBOX_DIR,
    pullImages: boolean = true
  ) {
    this.tempDir = tempDir;
    this.pullImages = pullImages;
  }

  /**
   * Get supported languages for Docker execution
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return ['python', 'nodejs', 'bash'];
  }

  /**
   * Execute code in a sandboxed Docker container
   *
   * @param code - The source code to execute
   * @param language - The programming language
   * @param options - Execution options
   * @returns Execution result with output and metadata
   */
  async execute(
    code: string,
    language: SupportedLanguage,
    options: Partial<ExecutionOptions> = {}
  ): Promise<ExecutionResult> {
    const opts: ExecutionOptions = { ...DEFAULT_EXECUTION_OPTIONS, ...options };
    const executionId = randomUUID();
    const config = getLanguageConfig(language);
    const codeDir = join(this.tempDir, executionId);
    const codeFile = join(codeDir, `script${config.extension}`);

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = -1;
    let error: string | undefined;

    logger.info('Starting code execution', {
      executionId,
      language,
      codeLength: code.length,
      timeout: opts.timeout,
    });

    try {
      // Ensure temp directory exists
      await this.ensureDirectory(codeDir);

      // Write code to file
      await writeFile(codeFile, code, 'utf-8');
      logger.debug('Code written to file', { codeFile });

      // Ensure Docker image is available
      if (this.pullImages) {
        await this.ensureImage(config.image);
      }

      // Build Docker command
      const dockerArgs = this.buildDockerArgs(
        codeDir,
        language,
        opts,
        executionId
      );

      logger.debug('Docker args', { args: dockerArgs.join(' ') });

      // Execute with timeout
      const result = await this.runDockerWithTimeout(dockerArgs, opts.timeout, executionId);
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;

    } catch (err) {
      const execError = err instanceof Error ? err : new Error(String(err));
      logger.error('Execution failed', execError, { executionId });

      if (execError.message.includes('timeout')) {
        stderr = 'Execution terminated: timeout exceeded';
        exitCode = TIMEOUT_EXIT_CODE;
        error = 'Timeout';
      } else if (execError.message.includes('Docker daemon')) {
        error = 'Docker is not available';
        exitCode = -1;
      } else {
        error = execError.message;
        exitCode = -1;
      }
    } finally {
      // Cleanup
      await this.cleanup(codeDir, executionId);
    }

    const executionTimeMs = Date.now() - startTime;

    // Truncate output if necessary
    let truncated = false;
    if (stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (output truncated)';
      truncated = true;
    }
    if (stderr.length > MAX_OUTPUT_LENGTH) {
      stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (errors truncated)';
      truncated = true;
    }

    const result: ExecutionResult = {
      success: exitCode === 0 && !error,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
      executionTimeMs,
      truncated,
      error,
      executionId,
    };

    logger.info('Execution completed', {
      executionId,
      success: result.success,
      exitCode,
      executionTimeMs,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
    });

    return result;
  }

  /**
   * Check if Docker is available and running
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['info'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          resolve(false);
        }
      }, 5000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(code === 0);
        }
      });

      proc.on('error', () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });
    });
  }

  /**
   * Pull all required Docker images
   */
  async pullAllImages(): Promise<void> {
    const languages: SupportedLanguage[] = ['python', 'nodejs', 'bash'];

    for (const lang of languages) {
      const config = LANGUAGE_CONFIGS[lang];
      logger.info(`Pulling image: ${config.image}`);
      await this.pullImage(config.image);
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Build Docker command arguments with security restrictions
   */
  private buildDockerArgs(
    codeDir: string,
    language: SupportedLanguage,
    options: ExecutionOptions,
    executionId: string
  ): string[] {
    const config = getLanguageConfig(language);
    const containerName = `${CONTAINER_PREFIX}-${executionId.slice(0, 8)}`;

    const args = [
      'run',
      '--rm',                                           // Remove container after execution
      '--name', containerName,                          // Container name for tracking
      '-v', `${codeDir}:/code:ro`,                      // Mount code directory (read-only)
      '--memory', options.memoryLimit,                  // Memory limit
      '--cpus', options.cpuLimit,                       // CPU limit
      '--pids-limit', String(options.pidsLimit),        // Process limit
      '--read-only',                                    // Read-only root filesystem
      '--tmpfs', `/tmp:size=${options.tmpfsSize}`,      // Writable /tmp in RAM
      '--security-opt', 'no-new-privileges',            // Prevent privilege escalation
      '--cap-drop', 'ALL',                              // Drop all capabilities
      '--user', '65534:65534',                          // Run as nobody user
    ];

    // Network isolation
    if (!options.networkEnabled) {
      args.push('--network', 'none');
    }

    // Add image and command
    args.push(config.image, ...config.command);

    return args;
  }

  /**
   * Execute Docker with timeout handling
   */
  private runDockerWithTimeout(
    args: string[],
    timeout: number,
    executionId: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let killed = false;
      let resolved = false;

      // Set up timeout
      const timer = setTimeout(() => {
        if (!resolved) {
          killed = true;
          logger.warn('Execution timeout', { executionId, timeout });

          // Kill the process
          proc.kill('SIGKILL');

          // Also try to stop the container
          this.forceStopContainer(executionId);

          reject(new Error('timeout'));
        }
      }, timeout);

      // Collect stdout
      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length < MAX_OUTPUT_LENGTH * 1.1) {
          stdout += chunk;
        }
      });

      // Collect stderr
      proc.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length < MAX_OUTPUT_LENGTH * 1.1) {
          stderr += chunk;
        }
      });

      // Handle completion
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (!resolved && !killed) {
          resolved = true;
          resolve({
            stdout,
            stderr,
            exitCode: code ?? -1,
          });
        }
      });

      // Handle errors
      proc.on('error', (err) => {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  /**
   * Force stop a container by execution ID
   */
  private forceStopContainer(executionId: string): void {
    const containerName = `${CONTAINER_PREFIX}-${executionId.slice(0, 8)}`;

    spawn('docker', ['kill', containerName], {
      stdio: 'ignore',
    });

    spawn('docker', ['rm', '-f', containerName], {
      stdio: 'ignore',
    });
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Ensure Docker image is available
   */
  private async ensureImage(image: string): Promise<void> {
    const hasImage = await this.hasImage(image);
    if (!hasImage) {
      logger.info(`Pulling Docker image: ${image}`);
      await this.pullImage(image);
    }
  }

  /**
   * Check if a Docker image exists locally
   */
  private hasImage(image: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['image', 'inspect', image], {
        stdio: 'ignore',
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Pull a Docker image
   */
  private pullImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['pull', image], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          logger.info(`Image pulled successfully: ${image}`);
          resolve();
        } else {
          reject(new Error(`Failed to pull image ${image}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Cleanup execution artifacts
   */
  private async cleanup(codeDir: string, executionId: string): Promise<void> {
    try {
      // Force stop any lingering container
      this.forceStopContainer(executionId);

      // Remove temporary directory
      if (existsSync(codeDir)) {
        await rm(codeDir, { recursive: true, force: true });
        logger.debug('Cleaned up code directory', { codeDir });
      }
    } catch (err) {
      // Log but don't fail on cleanup errors
      logger.warn('Cleanup error (non-critical)', {
        executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let executorInstance: SandboxExecutor | null = null;

/**
 * Get the singleton sandbox executor instance
 */
export function getSandboxExecutor(): SandboxExecutor {
  if (!executorInstance) {
    executorInstance = new SandboxExecutor();
  }
  return executorInstance;
}

/**
 * Check if Docker sandbox is available
 */
export async function isSandboxAvailable(): Promise<boolean> {
  const executor = getSandboxExecutor();
  return executor.isAvailable();
}

