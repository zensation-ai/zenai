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

dotenv.config();

export type AIContext = 'personal' | 'work';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID v4
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

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
  // Supabase and other managed DB services need SSL but with rejectUnauthorized: false
  // This is safe for managed services where we trust the provider
  const isSupabase = host.includes('supabase.co');

  const sslConfig = isInternalRailway
    ? false // No SSL for internal Railway network
    : process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: isSupabase ? false : true } // Supabase needs false
      : undefined;

  logger.info('Database connection config', {
    host,
    database: parsed.pathname.slice(1),
    isInternalRailway,
    sslEnabled: typeof sslConfig === 'object',
    operation: 'parseConnectionString',
  });

  return {
    host,
    port: parseInt(parsed.port || '5432'),
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
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'localpass',
      database: 'personal_ai', // Default for non-URL config
    };

const POOL_CONFIG = {
  ...baseConfig,
  // Connection pool settings - Phase 24 Optimized for Production
  // Increased pool size for better concurrency and performance
  max: parseInt(process.env.DB_POOL_SIZE || '20'), // Increased from 5 to 20
  min: parseInt(process.env.DB_POOL_MIN || '5'),   // Increased from 1 to 5
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

// For Railway (single database), we use the same database for both contexts
// but prefix tables with context (schema separation can be added later)
// For local dev, we use separate databases
const personalConfig = useConnectionString
  ? { ...POOL_CONFIG } // Use same database from DATABASE_URL
  : { ...POOL_CONFIG, database: 'personal_ai' };

const workConfig = useConnectionString
  ? { ...POOL_CONFIG } // Use same database from DATABASE_URL
  : { ...POOL_CONFIG, database: 'work_ai' };

// Connection pools for each context
const pools: Record<AIContext, Pool> = {
  personal: new Pool(personalConfig),
  work: new Pool(workConfig),
};

// Track pool stats for monitoring
const poolStats: Record<AIContext, { queries: number; errors: number; slowQueries: number }> = {
  personal: { queries: 0, errors: 0, slowQueries: 0 },
  work: { queries: 0, errors: 0, slowQueries: 0 },
};

// Log pool errors
(['personal', 'work'] as const).forEach((ctx) => {
  pools[ctx].on('error', (err) => {
    logger.error(`Pool error [${ctx}]`, err, { context: ctx, operation: 'poolError' });
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
 * IMPORTANT: This function now uses dedicated client connections with search_path
 * to ensure proper schema isolation between personal and work contexts.
 */
export async function queryContext(
  context: AIContext,
  text: string,
  params?: QueryParam[]
): Promise<QueryResult> {
  const pool = getPool(context);
  const start = Date.now();
  let lastError: Error | null = null;

  poolStats[context].queries++;

  // Retry loop for transient errors
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    // CRITICAL: Get a dedicated client for schema isolation
    const client = await pool.connect();

    try {
      // CRITICAL: Set search_path to ensure queries use correct schema
      // This is essential for dual-schema architecture (personal vs work)
      await client.query(`SET search_path TO ${context}, public`);

      // Execute query in correct schema
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      // Log slow queries (using configurable threshold)
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        poolStats[context].slowQueries++;
        logger.warn(`Slow query [${context}] (${duration}ms)`, {
          context,
          duration,
          query: text.substring(0, 100),
          operation: 'slowQuery',
        });
      }

      // Log successful retry
      if (attempt > 0) {
        logger.info(`Query succeeded after ${attempt} retries [${context}]`, {
          context,
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
        logger.warn(`Retryable error [${context}], attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries}`, {
          context,
          attempt: attempt + 1,
          delay,
          errorCode: (error as { code?: string }).code,
          operation: 'queryRetry',
        });
        await sleep(delay);
        continue;
      }

      // Non-retryable error or max retries reached
      poolStats[context].errors++;
      logger.error(`Query error [${context}]${attempt > 0 ? ` after ${attempt + 1} attempts` : ''}`, lastError, {
        context,
        query: text.substring(0, 100),
        attempts: attempt + 1,
        operation: 'queryError',
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
  return context === 'personal' || context === 'work';
}

/**
 * Gracefully close all database connections
 */
export async function closeAllPools(): Promise<void> {
  logger.info('Closing database connections...', { operation: 'shutdown' });
  try {
    await Promise.all([
      pools.personal.end(),
      pools.work.end(),
    ]);
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
 * Test both database connections
 */
export async function testConnections(): Promise<{
  personal: boolean;
  work: boolean;
}> {
  const results = {
    personal: false,
    work: false,
  };

  try {
    await queryContext('personal', 'SELECT 1');
    results.personal = true;
    logger.info('Personal database connected', { context: 'personal', operation: 'testConnection' });
  } catch (error) {
    logger.error('Personal database connection failed', error instanceof Error ? error : undefined, { context: 'personal', operation: 'testConnection' });
  }

  try {
    await queryContext('work', 'SELECT 1');
    results.work = true;
    logger.info('Work database connected', { context: 'work', operation: 'testConnection' });
  } catch (error) {
    logger.error('Work database connection failed', error instanceof Error ? error : undefined, { context: 'work', operation: 'testConnection' });
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
  return {
    personal: {
      ...poolStats.personal,
      poolSize: pools.personal.totalCount,
      idleCount: pools.personal.idleCount,
      waitingCount: pools.personal.waitingCount,
    },
    work: {
      ...poolStats.work,
      poolSize: pools.work.totalCount,
      idleCount: pools.work.idleCount,
      waitingCount: pools.work.waitingCount,
    },
  };
}

// Periodic connection health check interval reference
let healthCheckInterval: NodeJS.Timeout | null = null;

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
      await Promise.all([
        pools.personal.query('SELECT 1'),
        pools.work.query('SELECT 1'),
      ]);
      const duration = Date.now() - start;
      logger.debug('Connection health check passed', {
        duration,
        operation: 'healthCheck',
      });
    } catch (error) {
      logger.error('Connection health check failed', error instanceof Error ? error : undefined, {
        operation: 'healthCheckFailed',
      });
      // The retry logic in queryContext will handle reconnection on next query
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

// Backward compatibility: Keep the old single pool export
// This points to personal_ai by default for existing code
export const pool = pools.personal;

// Keep the old query function for existing code (uses personal context)
export async function query(text: string, params?: QueryParam[]): Promise<QueryResult> {
  return queryContext('personal', text, params);
}

// Export QueryParam type for use in other modules
export type { QueryParam };

// Note: We intentionally don't re-export from './database' to avoid conflicts
// The local query() and pool exports (pointing to personal_ai) provide backward compatibility
// For context-aware queries, use queryContext() with explicit context parameter
// Import { testConnection, getClient } from './database' if those functions are needed
