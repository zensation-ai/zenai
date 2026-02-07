/**
 * Structured Logging Utility
 *
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Structured JSON output for production
 * - Request ID tracking
 * - Performance timing
 * - SECURITY: Sensitive data filtering (Sprint 2)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  context?: 'personal' | 'work';
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ===========================================
// SECURITY: Sensitive Data Filtering (Sprint 2)
// ===========================================

/**
 * List of sensitive field names that should be redacted from logs
 * SECURITY: Add any new sensitive fields here
 */
const SENSITIVE_FIELDS = new Set([
  // Authentication & Authorization
  'password',
  'passwd',
  'secret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'apikey',
  'key_hash',
  'keyHash',
  'authorization',
  'auth',
  'bearer',
  'jwt',
  'sessionId',
  'session_id',

  // Personal Information
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'pin',

  // Database
  'connectionString',
  'connection_string',
  'databaseUrl',
  'database_url',
  'dbPassword',
  'db_password',

  // Encryption
  'privateKey',
  'private_key',
  'encryptionKey',
  'encryption_key',
  'salt',

  // Third-party services
  'openaiKey',
  'openai_key',
  'anthropicKey',
  'anthropic_key',
  'stripeKey',
  'stripe_key',
  'awsSecret',
  'aws_secret',
]);

/**
 * Patterns that indicate sensitive data in string values
 */
const SENSITIVE_PATTERNS = [
  /^ab_live_[a-f0-9]+$/i,          // API key format
  /^Bearer\s+.+$/i,                 // Bearer token
  /^sk-[a-zA-Z0-9]+$/,              // OpenAI/Stripe secret keys
  /^[a-f0-9]{64}$/i,                // Hashed values (SHA256)
  /^\$2[aby]?\$\d+\$.+$/,           // bcrypt hashes
];

/**
 * Replacement string for redacted values
 */
const REDACTED = '[REDACTED]';

/**
 * Check if a value looks like sensitive data
 */
function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') {return false;}
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Recursively filter sensitive data from an object
 * SECURITY: This prevents accidental exposure of credentials in logs
 */
function filterSensitiveData<T>(obj: T, depth: number = 0): T {
  // Prevent infinite recursion
  if (depth > 10) {return obj;}

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if the string itself looks like sensitive data
    if (isSensitiveValue(obj)) {
      return REDACTED as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => filterSensitiveData(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();

      // Check if the key is in our sensitive list
      if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
        filtered[key] = REDACTED;
      } else if (typeof value === 'string' && isSensitiveValue(value)) {
        // Check if the value looks sensitive
        filtered[key] = REDACTED;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively filter nested objects
        filtered[key] = filterSensitiveData(value, depth + 1);
      } else {
        filtered[key] = value;
      }
    }

    return filtered as T;
  }

  return obj;
}

/**
 * Filter sensitive data from error messages
 */
function filterErrorMessage(message: string): string {
  // Replace potential API keys in error messages
  let filtered = message.replace(/ab_live_[a-f0-9]+/gi, 'ab_live_[REDACTED]');
  // Replace Bearer tokens
  filtered = filtered.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  // Replace connection strings
  filtered = filtered.replace(/postgres(ql)?:\/\/[^@]+@/gi, 'postgresql://[REDACTED]@');
  filtered = filtered.replace(/mysql:\/\/[^@]+@/gi, 'mysql://[REDACTED]@');
  return filtered;
}

// Get current log level from environment
const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  if (IS_PRODUCTION) {
    // JSON format for production (easier to parse in log aggregators)
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const { timestamp, level, message, context, error } = entry;
  const levelEmoji = {
    debug: '🔍',
    info: 'ℹ️ ',
    warn: '⚠️ ',
    error: '❌',
  }[level];

  let output = `${timestamp} ${levelEmoji} [${level.toUpperCase()}] ${message}`;

  if (context) {
    const contextParts: string[] = [];
    if (context.requestId) {contextParts.push(`reqId=${context.requestId}`);}
    if (context.operation) {contextParts.push(`op=${context.operation}`);}
    if (context.duration !== undefined) {contextParts.push(`${context.duration}ms`);}
    if (context.context) {contextParts.push(`ctx=${context.context}`);}
    if (contextParts.length > 0) {
      output += ` (${contextParts.join(', ')})`;
    }
  }

  if (error) {
    output += `\n  Error: ${error.name}: ${error.message}`;
    if (error.stack && !IS_PRODUCTION) {
      output += `\n  ${error.stack.split('\n').slice(1).join('\n  ')}`;
    }
  }

  return output;
}

/**
 * Create a log entry and output it
 * SECURITY: All data is filtered for sensitive information before logging
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
  if (!shouldLog(level)) {return;}

  // SECURITY: Filter sensitive data from message
  const filteredMessage = filterErrorMessage(message);

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: filteredMessage,
  };

  // SECURITY: Filter sensitive data from context
  if (context && Object.keys(context).length > 0) {
    entry.context = filterSensitiveData(context);
  }

  // SECURITY: Filter sensitive data from error
  if (error) {
    entry.error = {
      name: error.name,
      message: filterErrorMessage(error.message),
      // SECURITY: Only include stack traces in non-production for debugging
      // Stack traces can expose file paths and internal structure
      stack: IS_PRODUCTION ? undefined : error.stack,
    };
  }

  const output = formatLogEntry(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

// ===========================================
// Public Logger API
// ===========================================

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, error?: Error, context?: LogContext) => log('error', message, context, error),

  /**
   * Log with timing measurement
   */
  timed: <T>(
    operation: string,
    fn: () => T | Promise<T>,
    context?: Omit<LogContext, 'operation' | 'duration'>
  ): T | Promise<T> => {
    const start = Date.now();

    const logCompletion = (success: boolean) => {
      const duration = Date.now() - start;
      const level = success ? 'info' : 'error';
      log(level, `${operation} ${success ? 'completed' : 'failed'}`, {
        ...context,
        operation,
        duration,
      });
    };

    try {
      const result = fn();

      if (result instanceof Promise) {
        return result
          .then((res) => {
            logCompletion(true);
            return res;
          })
          .catch((err) => {
            logCompletion(false);
            throw err;
          }) as Promise<T>;
      }

      logCompletion(true);
      return result;
    } catch (err) {
      logCompletion(false);
      throw err;
    }
  },

  /**
   * Create a child logger with preset context
   */
  child: (baseContext: LogContext) => ({
    debug: (message: string, context?: LogContext) =>
      log('debug', message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log('info', message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log('warn', message, { ...baseContext, ...context }),
    error: (message: string, error?: Error, context?: LogContext) =>
      log('error', message, { ...baseContext, ...context }, error),
  }),
};

// ===========================================
// Request Logger Middleware
// ===========================================

import { Request, Response, NextFunction } from 'express';

/**
 * HTTP request/response logging middleware
 *
 * Uses the request ID already set by requestIdMiddleware (res.locals.requestId).
 * Logs request start and response completion with timing.
 * Must be mounted AFTER requestIdMiddleware.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = res.locals?.requestId || 'unknown';

  // Skip health check noise in production
  if (req.path === '/api/health' || req.path === '/api/csrf-token') {
    next();
    return;
  }

  // Log request start at debug level to avoid excessive noise
  logger.debug(`→ ${req.method} ${req.path}`, {
    requestId,
    operation: 'http_request',
  });

  // Log response on finish and record metrics
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log(level, `← ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
      requestId,
      operation: 'http_response',
      duration,
    });

    // Record metrics for Prometheus endpoint
    try {
      // Lazy import to avoid circular dependencies
      const { recordHttpRequest } = require('./metrics');
      recordHttpRequest(req.method, res.statusCode, duration);
    } catch {
      // metrics module not loaded yet, skip
    }
  });

  next();
}
