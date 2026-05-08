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
  context?: 'operations' | 'finance' | 'people' | 'strategy' | 'demo';
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

import { requestContext } from './request-context';

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
  /^ab_live_[a-f0-9]+$/i,          // API key format (legacy)
  /^ab_[a-z0-9]{32,}$/i,           // API key format (Sprint 1.4)
  /^Bearer\s+.+$/i,                 // Bearer token
  /^sk-[a-zA-Z0-9]+$/,              // OpenAI/Stripe secret keys
  /^[a-f0-9]{64}$/i,                // Hashed values (SHA256)
  /^\$2[aby]?\$\d+\$.+$/,           // bcrypt hashes
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/, // JWT (Sprint 1.4)
];

/**
 * Replacement string for redacted values
 */
const REDACTED = '[REDACTED]';

/** Key names whose value is always an IP — anonymize instead of redact. */
const IP_FIELD_KEYS = new Set(['ip', 'ipaddress', 'ip_address', 'remoteaddress', 'remote_address', 'clientip', 'client_ip']);

/**
 * Anonymize an IP address per GDPR guidance (IPv4 /24, IPv6 /64).
 * Sprint 1.4: exported so middleware can reuse the same trimming.
 */
export function anonymizeIp(ip: string): string {
  if (typeof ip !== 'string' || ip.length === 0) {return ip;}
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  }
  if (ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip.replace(/::/, ':'))) {
    const parts = ip.includes('::')
      ? (() => {
          const [head, tail] = ip.split('::');
          const headParts = head ? head.split(':') : [];
          const tailParts = tail ? tail.split(':') : [];
          const missing = 8 - headParts.length - tailParts.length;
          return [...headParts, ...Array.from({ length: missing }, () => '0'), ...tailParts];
        })()
      : ip.split(':');
    if (parts.length >= 4) {
      return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}::`;
    }
  }
  return ip;
}

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
 * Idempotent: filterSensitiveData(filterSensitiveData(x)) === filterSensitiveData(x)
 * Sprint 1.4: handles WeakSet-based cycle detection and IP anonymization.
 */
function filterSensitiveData<T>(obj: T, depth: number = 0, seen?: WeakSet<object>): T {
  // Prevent infinite recursion
  if (depth > 10) {return obj;}
  const seenSet = seen ?? new WeakSet<object>();

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Scrub known patterns in-string (email, Bearer, JWT, connection strings)
    const scrubbed = filterErrorMessage(obj);
    // If the whole value is sensitive (e.g. bare API key), redact
    if (isSensitiveValue(scrubbed)) {
      return REDACTED as unknown as T;
    }
    return scrubbed as unknown as T;
  }

  if (Array.isArray(obj)) {
    if (seenSet.has(obj as unknown as object)) {return ('[Circular]' as unknown) as T;}
    seenSet.add(obj as unknown as object);
    return obj.map(item => filterSensitiveData(item, depth + 1, seenSet)) as unknown as T;
  }

  if (typeof obj === 'object') {
    if (seenSet.has(obj as unknown as object)) {return ('[Circular]' as unknown) as T;}
    seenSet.add(obj as unknown as object);
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();

      // Check if the key is in our sensitive list
      if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
        filtered[key] = REDACTED;
      } else if (IP_FIELD_KEYS.has(lowerKey) && typeof value === 'string') {
        // Sprint 1.4: IP fields are anonymized, not redacted.
        filtered[key] = anonymizeIp(value);
      } else if (typeof value === 'string') {
        const scrubbed = filterErrorMessage(value);
        filtered[key] = isSensitiveValue(scrubbed) ? REDACTED : scrubbed;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively filter nested objects
        filtered[key] = filterSensitiveData(value, depth + 1, seenSet);
      } else {
        filtered[key] = value;
      }
    }

    return filtered as T;
  }

  return obj;
}

/**
 * Filter sensitive data from error messages.
 * Sprint 1.4: added email, JWT, and ab_ API-key patterns.
 */
function filterErrorMessage(message: string): string {
  let filtered = message;
  // API keys
  filtered = filtered.replace(/ab_live_[a-f0-9]{16,}/gi, 'ab_live_[REDACTED]');
  filtered = filtered.replace(/ab_[a-z0-9]{32,}/gi, 'ab_[REDACTED]');
  filtered = filtered.replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-[REDACTED]');
  // JWTs (eyJ...three-segments...)
  filtered = filtered.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    '[REDACTED:jwt]'
  );
  // Bearer tokens
  filtered = filtered.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  // Connection strings
  filtered = filtered.replace(/postgres(ql)?:\/\/[^@]+@/gi, 'postgresql://[REDACTED]@');
  filtered = filtered.replace(/mysql:\/\/[^@]+@/gi, 'mysql://[REDACTED]@');
  // Email addresses (last, so earlier tokens aren't misidentified as emails)
  filtered = filtered.replace(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    '[REDACTED:email]'
  );
  return filtered;
}

/**
 * Public sanitizer primitive for callers that want the same scrubbing the
 * logger applies but need to hand a cleaned object to another sink (e.g.
 * metrics, third-party SDK). Idempotent and cycle-safe.
 *
 * @example
 *   const clean = sanitizeMeta({ email: 'a@b.de', authorization: 'Bearer x' });
 *   // => { email: '[REDACTED:email]', authorization: '[REDACTED]' }
 */
export function sanitizeMeta<T>(meta: T): T {
  return filterSensitiveData(meta);
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

  // Auto-inject request context from AsyncLocalStorage
  const reqCtx = requestContext.getStore();
  const autoContext: LogContext = {};
  if (reqCtx?.requestId) { autoContext.requestId = reqCtx.requestId; }
  if (reqCtx?.userId) { autoContext.userId = reqCtx.userId; }

  // Merge: auto-injected < explicit (explicit wins)
  const mergedContext = { ...autoContext, ...context };

  // SECURITY: Filter sensitive data from context
  if (mergedContext && Object.keys(mergedContext).length > 0) {
    entry.context = filterSensitiveData(mergedContext);
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
