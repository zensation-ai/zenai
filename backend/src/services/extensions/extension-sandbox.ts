/**
 * Phase 75: Extension Sandbox
 *
 * Sandboxed execution framework for extensions.
 * In v1, this is a framework/stub - no actual user code execution.
 * Provides permission checking, rate limiting, timeout, and audit logging.
 */

import { logger } from '../../utils/logger';
import { getExtensionRegistry, type Extension } from './extension-registry';

// ===========================================
// Types
// ===========================================

export interface ExecuteExtensionInput {
  extensionId: string;
  action: string;
  params: Record<string, unknown>;
  userId: string;
  permissionsGranted: string[];
}

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration_ms: number;
}

// ===========================================
// Rate Limiting (in-memory)
// ===========================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const MAX_CALLS_PER_MINUTE = 100;
const EXECUTION_TIMEOUT_MS = 10_000;

function checkRateLimit(extensionId: string, userId: string): boolean {
  const key = `${userId}:${extensionId}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > 60_000) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_CALLS_PER_MINUTE) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > 120_000) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

// ===========================================
// Permission Checking
// ===========================================

function checkPermissions(
  requiredPermissions: string[],
  grantedPermissions: string[]
): { allowed: boolean; missing: string[] } {
  const missing = requiredPermissions.filter(p => !grantedPermissions.includes(p));
  return {
    allowed: missing.length === 0,
    missing,
  };
}

// ===========================================
// Extension Sandbox
// ===========================================

class ExtensionSandbox {
  /**
   * Execute an extension action in a sandboxed environment.
   *
   * In v1, this validates permissions, checks rate limits,
   * and returns a simulated success response. No actual code
   * execution occurs - this is a framework for future use.
   */
  async executeExtension(input: ExecuteExtensionInput): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 1. Fetch extension metadata
    const registry = getExtensionRegistry();
    const extension = await registry.getExtension(input.extensionId);
    if (!extension) {
      return {
        success: false,
        error: `Extension not found: ${input.extensionId}`,
        duration_ms: Date.now() - startTime,
      };
    }

    // 2. Rate limit check
    if (!checkRateLimit(input.extensionId, input.userId)) {
      await this.logExecution(input, 'rate_limited', null, Date.now() - startTime);
      return {
        success: false,
        error: `Rate limit exceeded for extension: ${extension.name} (max ${MAX_CALLS_PER_MINUTE}/min)`,
        duration_ms: Date.now() - startTime,
      };
    }

    // 3. Permission check
    const permCheck = checkPermissions(extension.permissions, input.permissionsGranted);
    if (!permCheck.allowed) {
      await this.logExecution(input, 'permission_denied', null, Date.now() - startTime);
      return {
        success: false,
        error: `Missing permissions: ${permCheck.missing.join(', ')}`,
        duration_ms: Date.now() - startTime,
      };
    }

    // 4. Execute with timeout (v1: simulated execution)
    try {
      const result = await this.runWithTimeout(
        () => this.simulateExecution(extension, input.action, input.params),
        EXECUTION_TIMEOUT_MS
      );

      const duration = Date.now() - startTime;
      await this.logExecution(input, 'success', result, duration);

      return {
        success: true,
        data: result,
        duration_ms: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown execution error';
      await this.logExecution(input, 'error', errorMsg, duration);

      return {
        success: false,
        error: errorMsg,
        duration_ms: duration,
      };
    }
  }

  /**
   * Simulate extension execution (v1).
   * In future versions, this would run actual sandboxed code.
   */
  private async simulateExecution(
    extension: Extension,
    action: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    logger.info('Extension executed (simulated)', {
      operation: 'extensionSandbox',
      extensionId: extension.id,
      action,
    });

    return {
      extension: extension.name,
      action,
      params,
      message: `Extension "${extension.name}" action "${action}" executed successfully (v1 simulation)`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run a function with timeout.
   */
  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Extension execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Log extension execution to database for audit.
   */
  private async logExecution(
    input: ExecuteExtensionInput,
    result: string,
    data: unknown,
    durationMs: number
  ): Promise<void> {
    try {
      const { pool } = await import('../../utils/database-context');
      await pool.query(
        `INSERT INTO public.extension_logs (id, extension_id, user_id, action, result, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          (await import('uuid')).v4(),
          input.extensionId,
          input.userId,
          input.action,
          JSON.stringify({ status: result, data }),
          durationMs,
        ]
      );
    } catch (error) {
      // Audit logging is best-effort
      logger.debug('Failed to log extension execution', {
        operation: 'extensionSandbox',
        extensionId: input.extensionId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

// ===========================================
// Singleton
// ===========================================

let instance: ExtensionSandbox | null = null;

export function getExtensionSandbox(): ExtensionSandbox {
  if (!instance) {
    instance = new ExtensionSandbox();
  }
  return instance;
}

/** For testing */
export function resetExtensionSandbox(): void {
  instance = null;
  rateLimitMap.clear();
}
