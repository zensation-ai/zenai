/**
 * Database Context Router
 *
 * Manages dual-database architecture for Private vs. Work contexts.
 * Each context has its own PostgreSQL database with identical schema.
 *
 * Phase 11: Optimized connection pooling
 */

import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';
import { logger } from './logger';

// Re-export isValidUUID from centralized validation module for backward compatibility
export { isValidUUID } from './validation';

dotenv.config();

import { AIContext, VALID_CONTEXTS } from '../types';
export type { AIContext };

// ===========================================
// Pool Configuration (Phase 11 Optimized)
// ===========================================

/**
 * Parse DATABASE_URL into connection config
 * Supports Railway-style URLs: postgresql://user:password@host:port/database
 */
function parseConnectionString(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean } | false;
} {
  const parsed = new URL(url);
  const host = parsed.hostname;

  // Railway internal connections (.railway.internal) don't need SSL
  const isInternalRailway = host.endsWith('.railway.internal');
  // Supabase and other managed DB services
  const isSupabase = host.includes('supabase.co');

  // SECURITY: SSL Configuration with proper certificate validation
  // - Allow explicit override via DB_SSL_REJECT_UNAUTHORIZED env var
  // - Default to secure (rejectUnauthorized: true) in production
  // - Supabase pooler connections may need rejectUnauthorized: false due to connection pooling
  const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== undefined
    ? process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    : !isSupabase; // Supabase pooler requires false, others default to true

  const sslConfig = isInternalRailway
    ? false // No SSL for internal Railway network
    : process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: sslRejectUnauthorized }
      : undefined;

  if (isSupabase && !sslRejectUnauthorized) {
    logger.warn('Database SSL: rejectUnauthorized=false for Supabase connection', {
      host,
      securityNote: 'Set DB_SSL_REJECT_UNAUTHORIZED=true if using direct connection (not pooler)',
      operation: 'parseConnectionString',
    });
  }

  logger.info('Database connection config', {
    host,
    database: parsed.pathname.slice(1),
    isInternalRailway,
    sslEnabled: typeof sslConfig === 'object',
    operation: 'parseConnectionString',
  });

  return {
    host,
    port: parseInt(parsed.port || '5432', 10),
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1), // Remove leading /
    ssl: sslConfig,
  };
}

// Check if DATABASE_URL is provided (Railway style)
const databaseUrl = process.env.DATABASE_URL;
const useConnectionString = !!databaseUrl;

// Base config from DATABASE_URL or individual vars
const baseConfig = useConnectionString && databaseUrl
  ? parseConnectionString(databaseUrl)
  : (() => {
      // SECURITY: Require explicit DB_PASSWORD in non-URL mode
      // No more hardcoded fallback passwords
      const dbPassword = process.env.DB_PASSWORD;
      if (!dbPassword && process.env.NODE_ENV === 'production') {
        logger.error('CRITICAL: DB_PASSWORD is required in production when not using DATABASE_URL', undefined, {
          operation: 'databaseConfig'
        });
        throw new Error('DB_PASSWORD environment variable is required');
      }
      return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: dbPassword || '', // Empty string for local dev without password
        database: 'personal_ai', // Default for non-URL config
      };
    })();

const POOL_CONFIG = {
  ...baseConfig,
  // Connection pool settings - Phase 31 Optimized for Memory Consolidation
  // Increased pool size for parallel context consolidation (personal + work)
  max: parseInt(process.env.DB_POOL_SIZE || '30'), // Increased from 20 to 30
  min: parseInt(process.env.DB_POOL_MIN || '5'),   // Maintain warm connections
  idleTimeoutMillis: 60000, // 60s to reduce reconnections
  connectionTimeoutMillis: 10000, // 10s for Supabase latency
  // Statement timeout to prevent long-running queries
  statement_timeout: 30000,
  // Aggressive keep-alive for stable connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 1000, // Reduced from 5000ms to 1000ms for faster detection
};

// Slow query threshold - 300ms is reasonable for Supabase (200-300ms latency)
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD || '300');

// Retry configuration for transient connection errors
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  // Error codes that should trigger a retry
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', '57P01', '57P03'],
};

/**
 * Check if an error is retryable (transient connection issue)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {return false;}
  const errorCode = (error as { code?: string }).code;
  const errorMessage = error.message || '';
  return RETRY_CONFIG.retryableErrors.some(
    code => errorCode === code || errorMessage.includes(code)
  );
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// For Railway/Supabase (single database), all contexts use the same connection config
// but are separated by PostgreSQL schemas. For local dev, separate databases can be used.
const sharedPoolConfig = useConnectionString
  ? { ...POOL_CONFIG }
  : { ...POOL_CONFIG, database: 'personal_ai' };

// Connection pools for each context
const pools: Record<AIContext, Pool> = {
  personal: new Pool(useConnectionString ? { ...POOL_CONFIG } : { ...POOL_CONFIG, database: 'personal_ai' }),
  work: new Pool(useConnectionString ? { ...POOL_CONFIG } : { ...POOL_CONFIG, database: 'work_ai' }),
  learning: new Pool(sharedPoolConfig),
  creative: new Pool(sharedPoolConfig),
};

// Track pool stats for monitoring
const poolStats: Record<AIContext, { queries: number; errors: number; slowQueries: number }> = {
  personal: { queries: 0, errors: 0, slowQueries: 0 },
  work: { queries: 0, errors: 0, slowQueries: 0 },
  learning: { queries: 0, errors: 0, slowQueries: 0 },
  creative: { queries: 0, errors: 0, slowQueries: 0 },
};

// Log pool errors with detailed PostgreSQL diagnostics
(VALID_CONTEXTS).forEach((ctx) => {
  pools[ctx].on('error', (err) => {
    const pgError = err as { code?: string; detail?: string; hint?: string; severity?: string; constraint?: string };
    logger.error(`Pool error [${ctx}]`, err, {
      context: ctx,
      operation: 'poolError',
      pgCode: pgError.code,
      pgDetail: pgError.detail,
      pgHint: pgError.hint,
      pgSeverity: pgError.severity,
      pgConstraint: pgError.constraint,
      poolSize: POOL_CONFIG.max,
      errorMessage: err.message,
    });
    poolStats[ctx].errors++;
  });
});

/**
 * Get the appropriate connection pool for a context
 */
export function getPool(context: AIContext): Pool {
  return pools[context];
}

// Type for SQL query parameters - allows common PostgreSQL parameter types
type QueryParam = string | number | boolean | Date | null | undefined | Buffer | object;

/**
 * Execute a query in the appropriate context database
 * Phase 11: Enhanced with query monitoring
 * Phase 23: Added automatic retry for transient errors (ECONNRESET, ETIMEDOUT)
 * Phase 24: CRITICAL FIX - Schema Separation with search_path
 *
 * Executes queries with proper schema isolation based on context.
 * Each context (personal/work) uses its own PostgreSQL schema.
 * This ensures complete data separation between contexts.
 */
export async function queryContext(
  context: AIContext,
  text: string,
  params?: QueryParam[]
): Promise<QueryResult> {
  // Validate context parameter to prevent SQL injection via search_path
  if (!isValidContext(context)) {
    throw new Error(`Invalid context: ${context}. Must be one of: ${VALID_CONTEXTS.join(', ')}.`);
  }

  // Use the actual context for schema routing
  const effectiveContext: AIContext = context;

  const pool = getPool(effectiveContext);
  const start = Date.now();
  let lastError: Error | null = null;

  poolStats[effectiveContext].queries++;

  // Pool exhaustion warning: alert when waiting queue exceeds 50% of max pool size
  const waitingCount = pool.waitingCount;
  const maxPool = POOL_CONFIG.max;
  if (waitingCount > maxPool * 0.5) {
    logger.warn(`Pool near exhaustion [${effectiveContext}]`, {
      context: effectiveContext,
      waitingCount,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      maxPool,
      operation: 'poolExhaustionWarning',
    });
  }

  // Retry loop for transient errors
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    // CRITICAL: Get a dedicated client for schema isolation
    const client = await pool.connect();

    try {
      // Set search_path to the appropriate schema based on context
      await client.query(`SET search_path TO ${effectiveContext}, public`);

      // Execute query in correct schema
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      // Log slow queries (using configurable threshold)
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        poolStats[effectiveContext].slowQueries++;
        logger.warn(`Slow query [${effectiveContext}] (${duration}ms)`, {
          context: effectiveContext,
          duration,
          query: text.substring(0, 100),
          operation: 'slowQuery',
        });
      }

      // Log successful retry
      if (attempt > 0) {
        logger.info(`Query succeeded after ${attempt} retries [${effectiveContext}]`, {
          context: effectiveContext,
          attempts: attempt + 1,
          totalDuration: Date.now() - start,
          operation: 'queryRetrySuccess',
        });
      }

      // Release client back to pool
      client.release();

      return result;
    } catch (error) {
      // Release client on error
      client.release();

      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(error)) {
        const delay = Math.min(
          RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        logger.warn(`Retryable error [${effectiveContext}], attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries}`, {
          context: effectiveContext,
          attempt: attempt + 1,
          delay,
          errorCode: (error as { code?: string }).code,
          operation: 'queryRetry',
        });
        await sleep(delay);
        continue;
      }

      // Non-retryable error or max retries reached
      poolStats[effectiveContext].errors++;

      // Extract PostgreSQL-specific error details for better debugging
      const pgError = error as { code?: string; detail?: string; hint?: string; message?: string; severity?: string; constraint?: string; table?: string; column?: string };
      logger.error(`Query error [${effectiveContext}]${attempt > 0 ? ` after ${attempt + 1} attempts` : ''}`, lastError, {
        context: effectiveContext,
        query: text.substring(0, 500), // Increased from 100 for better debugging
        attempts: attempt + 1,
        operation: 'queryError',
        // PostgreSQL-specific error details
        pgCode: pgError.code,
        pgDetail: pgError.detail,
        pgHint: pgError.hint,
        pgSeverity: pgError.severity,
        pgConstraint: pgError.constraint,
        pgTable: pgError.table,
        pgColumn: pgError.column,
        pgMessage: pgError.message?.substring(0, 500),
      });
      throw error;
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError || new Error('Query failed after retries');
}

/**
 * Validate that a context string is valid
 */
export function isValidContext(context: string): context is AIContext {
  return VALID_CONTEXTS.includes(context as AIContext);
}

/**
 * Gracefully close all database connections
 */
export async function closeAllPools(): Promise<void> {
  logger.info('Closing database connections...', { operation: 'shutdown' });
  try {
    await Promise.all(
      VALID_CONTEXTS.map(ctx => pools[ctx].end())
    );
    logger.info('All database pools closed', { operation: 'shutdown' });
  } catch (error) {
    logger.error('Error closing database pools', error instanceof Error ? error : undefined, { operation: 'shutdown' });
    throw error;
  }
}

/**
 * Setup graceful shutdown handlers
 * Call this in main.ts to ensure connections are closed on exit
 */
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`, { signal, operation: 'shutdown' });

    try {
      // Stop health checks first
      stopConnectionHealthCheck();
      await closeAllPools();
      logger.info('Graceful shutdown complete', { operation: 'shutdown' });
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error instanceof Error ? error : undefined, { operation: 'shutdown' });
      process.exit(1);
    }
  };

  // Handle different termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception', error, { operation: 'uncaughtException' });
    await closeAllPools().catch(() => {});
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled Rejection - initiating shutdown', reason instanceof Error ? reason : undefined, {
      reason: String(reason),
      operation: 'unhandledRejection',
    });
    // Critical: Don't leave server in broken state
    await closeAllPools().catch(() => {});
    process.exit(1);
  });
}

/**
 * Ensure all context schemas exist in the database.
 * Uses the personal pool directly (all pools share the same DATABASE_URL).
 * Safe to call multiple times (CREATE SCHEMA IF NOT EXISTS).
 */
export async function ensureSchemas(): Promise<void> {
  const pool = pools.personal;
  for (const ctx of VALID_CONTEXTS) {
    try {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${ctx}`);
      logger.debug(`Schema ${ctx} ensured`, { operation: 'ensureSchemas' });
    } catch (error) {
      // Non-fatal: schema likely already exists or DDL is restricted (e.g. Supabase)
      const pgError = error as { code?: string };
      logger.debug(`Schema ensure skipped for ${ctx} (may already exist)`, {
        operation: 'ensureSchemas',
        pgCode: pgError.code,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Test all database connections (personal, work, learning, creative)
 */
export async function testConnections(): Promise<Record<AIContext, boolean>> {
  const results: Record<AIContext, boolean> = {
    personal: false,
    work: false,
    learning: false,
    creative: false,
  };

  for (const ctx of VALID_CONTEXTS) {
    try {
      await queryContext(ctx, 'SELECT 1');
      results[ctx] = true;
      logger.info(`${ctx} database connected`, { context: ctx, operation: 'testConnection' });
    } catch (error) {
      const pgError = error as { code?: string; detail?: string; hint?: string };
      logger.error(`${ctx} database connection failed`, error instanceof Error ? error : undefined, {
        context: ctx,
        operation: 'testConnection',
        pgCode: pgError.code,
        pgDetail: pgError.detail,
        pgHint: pgError.hint,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Get pool statistics for monitoring
 */
export function getPoolStats(): Record<AIContext, {
  queries: number;
  errors: number;
  slowQueries: number;
  poolSize: number;
  idleCount: number;
  waitingCount: number;
}> {
  const stats = {} as Record<AIContext, { queries: number; errors: number; slowQueries: number; poolSize: number; idleCount: number; waitingCount: number }>;
  for (const ctx of VALID_CONTEXTS) {
    stats[ctx] = {
      ...poolStats[ctx],
      poolSize: pools[ctx].totalCount,
      idleCount: pools[ctx].idleCount,
      waitingCount: pools[ctx].waitingCount,
    };
  }
  return stats;
}

// Periodic connection health check interval reference
let healthCheckInterval: NodeJS.Timeout | null = null;

// Circuit breaker for consecutive health check failures
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3; // After 3 failures (15 min), escalate

/**
 * Get current health check failure count (for monitoring)
 */
export function getHealthCheckStatus(): { consecutiveFailures: number; isHealthy: boolean } {
  return {
    consecutiveFailures,
    isHealthy: consecutiveFailures < MAX_CONSECUTIVE_FAILURES,
  };
}

/**
 * Start periodic connection health checks
 * Runs a simple query every 5 minutes to keep connections alive
 * and detect connection issues early
 */
export function startConnectionHealthCheck(intervalMs: number = 5 * 60 * 1000): void {
  if (healthCheckInterval) {
    logger.warn('Connection health check already running', { operation: 'healthCheck' });
    return;
  }

  healthCheckInterval = setInterval(async () => {
    try {
      const start = Date.now();
      await Promise.all(
        VALID_CONTEXTS.map(ctx => pools[ctx].query('SELECT 1'))
      );
      const duration = Date.now() - start;

      // Reset failure counter on success
      if (consecutiveFailures > 0) {
        logger.info('Connection health check recovered', {
          previousFailures: consecutiveFailures,
          operation: 'healthCheckRecovered',
        });
      }
      consecutiveFailures = 0;

      logger.debug('Connection health check passed', {
        duration,
        operation: 'healthCheck',
      });
    } catch (error) {
      consecutiveFailures++;
      logger.error('Connection health check failed', error instanceof Error ? error : undefined, {
        consecutiveFailures,
        maxFailures: MAX_CONSECUTIVE_FAILURES,
        operation: 'healthCheckFailed',
      });

      // Circuit breaker: escalate after MAX_CONSECUTIVE_FAILURES
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error('CRITICAL: Database unreachable for extended period - initiating shutdown', undefined, {
          consecutiveFailures,
          operation: 'circuitBreakerTriggered',
        });
        await closeAllPools().catch(() => {});
        process.exit(1);
      }
    }
  }, intervalMs);

  logger.info('Connection health check started', {
    intervalMs,
    operation: 'healthCheckStart',
  });
}

/**
 * Stop periodic connection health checks
 */
export function stopConnectionHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info('Connection health check stopped', { operation: 'healthCheckStop' });
  }
}

// ===========================================
// Extension Validation
// ===========================================

/**
 * Required PostgreSQL extensions for full functionality
 */
const REQUIRED_EXTENSIONS = ['vector', 'pg_trgm', 'uuid-ossp'];
const OPTIONAL_EXTENSIONS = ['pg_trgm']; // System works without these

// Cache for extension availability (checked once at startup)
let extensionCache: { [key: string]: boolean } | null = null;

/**
 * Validate that required PostgreSQL extensions are installed
 * Returns status of all required extensions
 */
export async function validateRequiredExtensions(): Promise<{
  valid: boolean;
  missing: string[];
  installed: string[];
  optional: string[];
}> {
  try {
    const result = await queryContext(
      'personal',
      `SELECT extname FROM pg_extension WHERE extname = ANY($1)`,
      [REQUIRED_EXTENSIONS]
    );

    const installed = result.rows.map((row: { extname: string }) => row.extname);
    const missing = REQUIRED_EXTENSIONS.filter(ext => !installed.includes(ext));
    const missingRequired = missing.filter(ext => !OPTIONAL_EXTENSIONS.includes(ext));
    const missingOptional = missing.filter(ext => OPTIONAL_EXTENSIONS.includes(ext));

    // Cache the results
    extensionCache = {};
    for (const ext of REQUIRED_EXTENSIONS) {
      extensionCache[ext] = installed.includes(ext);
    }

    logger.info('PostgreSQL extensions validated', {
      installed,
      missing,
      operation: 'validateExtensions',
    });

    return {
      valid: missingRequired.length === 0,
      missing,
      installed,
      optional: missingOptional,
    };
  } catch (error) {
    logger.error('Failed to validate extensions', error instanceof Error ? error : undefined, {
      operation: 'validateExtensions',
    });
    return {
      valid: false,
      missing: REQUIRED_EXTENSIONS,
      installed: [],
      optional: [],
    };
  }
}

/**
 * Check if pg_trgm extension is available (for fuzzy string matching)
 * Uses cached result from startup validation
 */
export function isPgTrgmAvailable(): boolean {
  if (extensionCache === null) {
    // Not yet validated - assume not available to be safe
    return false;
  }
  return extensionCache['pg_trgm'] === true;
}

/**
 * Check if pgvector extension is available (for embeddings)
 * Uses cached result from startup validation
 */
export function isPgVectorAvailable(): boolean {
  if (extensionCache === null) {
    return false;
  }
  return extensionCache['vector'] === true;
}

// Backward compatibility: Keep the old single pool export
// This points to personal_ai by default for existing code
export const pool = pools.personal;

// Keep the old query function for existing code (uses personal context)
export async function query(text: string, params?: QueryParam[]): Promise<QueryResult> {
  return queryContext('personal', text, params);
}

/**
 * Query the public schema explicitly.
 * Use this for global tables (audit_logs, api_keys, webhooks, oauth_tokens, integrations, etc.)
 * that are NOT context-specific and should always be in the public schema.
 */
export async function queryPublic(text: string, params?: QueryParam[]): Promise<QueryResult> {
  const client = await pools.personal.connect();
  try {
    await client.query('SET search_path TO public');
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Export QueryParam type for use in other modules
export type { QueryParam };

// Note: We intentionally don't re-export from './database' to avoid conflicts
// The local query() and pool exports (pointing to personal_ai) provide backward compatibility
// For context-aware queries, use queryContext() with explicit context parameter
// Import { testConnection, getClient } from './database' if those functions are needed

// ===========================================
// Phase 9: Performance Indexes
// ===========================================

/**
 * Composite indexes for high-traffic query patterns.
 * Uses CREATE INDEX IF NOT EXISTS to be safe for repeated runs.
 * These indexes cover the most common WHERE + ORDER BY combinations
 * across the ideas, chat_sessions, and chat_messages tables.
 */
const PERFORMANCE_INDEXES = [
  // ideas: Most queries filter by is_archived and sort by created_at
  'CREATE INDEX IF NOT EXISTS idx_ideas_archived_created ON ideas (is_archived, created_at DESC)',
  // ideas: Stats queries group by type/category/priority on non-archived
  'CREATE INDEX IF NOT EXISTS idx_ideas_archived_type ON ideas (is_archived, type)',
  'CREATE INDEX IF NOT EXISTS idx_ideas_archived_category ON ideas (is_archived, category)',
  'CREATE INDEX IF NOT EXISTS idx_ideas_archived_priority ON ideas (is_archived, priority)',
  // ideas: Priority + created_at for sorted exports and triage
  'CREATE INDEX IF NOT EXISTS idx_ideas_priority_created ON ideas (priority, created_at DESC)',
  // ideas: Updated timestamp for sync queries
  'CREATE INDEX IF NOT EXISTS idx_ideas_updated_at ON ideas (updated_at DESC)',
  // ideas: Company ID for enterprise queries
  'CREATE INDEX IF NOT EXISTS idx_ideas_company_archived ON ideas (company_id, is_archived) WHERE company_id IS NOT NULL',
  // chat: Session lookup by context + recency
  'CREATE INDEX IF NOT EXISTS idx_chat_sessions_context_updated ON general_chat_sessions (context, updated_at DESC)',
  // chat: Message lookup by session + order
  'CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON general_chat_messages (session_id, created_at ASC)',
];

/**
 * Ensure performance-critical composite indexes exist.
 * Called at server startup; uses IF NOT EXISTS so it's safe to run repeatedly.
 * Non-blocking: failures are logged but don't prevent startup.
 */
export async function ensurePerformanceIndexes(): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;

  for (const context of VALID_CONTEXTS) {
    for (const sql of PERFORMANCE_INDEXES) {
      try {
        await queryContext(context, sql);
        created++;
      } catch (err) {
        // Index creation may fail if table doesn't exist yet - that's OK
        errors++;
        logger.debug('Index creation skipped', {
          context,
          sql: sql.substring(0, 60),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (created > 0) {
    logger.info('Performance indexes ensured', { created, errors, operation: 'startup' });
  }

  return { created, errors };
}
