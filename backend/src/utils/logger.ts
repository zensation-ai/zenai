/**
 * Structured Logging Utility
 *
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Structured JSON output for production
 * - Request ID tracking
 * - Performance timing
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
    if (context.requestId) contextParts.push(`reqId=${context.requestId}`);
    if (context.operation) contextParts.push(`op=${context.operation}`);
    if (context.duration !== undefined) contextParts.push(`${context.duration}ms`);
    if (context.context) contextParts.push(`ctx=${context.context}`);
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
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
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
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

/**
 * Middleware to add request ID and log requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate unique request ID
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // Log request start
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.requestId,
    operation: 'http_request',
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log(level, `${req.method} ${req.path} ${res.statusCode}`, {
      requestId: req.requestId,
      operation: 'http_response',
      duration,
    });
  });

  next();
}
