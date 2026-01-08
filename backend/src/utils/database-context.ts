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

const POOL_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'localpass',
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Statement timeout to prevent long-running queries
  statement_timeout: 30000,
  // Keep connections alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

// Connection pools for each context
const pools: Record<AIContext, Pool> = {
  personal: new Pool({
    ...POOL_CONFIG,
    database: 'personal_ai',
  }),
  work: new Pool({
    ...POOL_CONFIG,
    database: 'work_ai',
  }),
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

/**
 * Execute a query in the appropriate context database
 * Phase 11: Enhanced with query monitoring
 */
export async function queryContext(
  context: AIContext,
  text: string,
  params?: any[]
): Promise<QueryResult> {
  const pool = getPool(context);
  const start = Date.now();

  poolStats[context].queries++;

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (>100ms)
    if (duration > 100) {
      poolStats[context].slowQueries++;
      logger.warn(`Slow query [${context}] (${duration}ms)`, {
        context,
        duration,
        query: text.substring(0, 100),
        operation: 'slowQuery',
      });
    }

    return result;
  } catch (error) {
    poolStats[context].errors++;
    logger.error(`Query error [${context}]`, error instanceof Error ? error : undefined, {
      context,
      query: text.substring(0, 100),
      operation: 'queryError',
    });
    throw error;
  }
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

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', reason instanceof Error ? reason : undefined, {
      reason: String(reason),
      operation: 'unhandledRejection',
    });
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

// Backward compatibility: Keep the old single pool export
// This points to personal_ai by default for existing code
export const pool = pools.personal;

// Keep the old query function for existing code (uses personal context)
export async function query(text: string, params?: any[]): Promise<QueryResult> {
  return queryContext('personal', text, params);
}

// Note: We intentionally don't re-export from './database' to avoid conflicts
// The local query() and pool exports (pointing to personal_ai) provide backward compatibility
// For context-aware queries, use queryContext() with explicit context parameter
// Import { testConnection, getClient } from './database' if those functions are needed
