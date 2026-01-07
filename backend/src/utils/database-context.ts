/**
 * Database Context Router
 *
 * Manages dual-database architecture for Private vs. Work contexts.
 * Each context has its own PostgreSQL database with identical schema.
 */

import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

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

// Connection pools for each context
const pools: Record<AIContext, Pool> = {
  personal: new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'personal_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'localpass',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }),
  work: new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'work_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'localpass',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }),
};

/**
 * Get the appropriate connection pool for a context
 */
export function getPool(context: AIContext): Pool {
  return pools[context];
}

/**
 * Execute a query in the appropriate context database
 */
export async function queryContext(
  context: AIContext,
  text: string,
  params?: any[]
): Promise<QueryResult> {
  const pool = getPool(context);
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 100) {
      console.log(`[${context}] Slow query (${duration}ms):`, text.substring(0, 100));
    }

    return result;
  } catch (error) {
    console.error(`[${context}] Query error:`, error);
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
  console.log('Closing database connections...');
  try {
    await Promise.all([
      pools.personal.end(),
      pools.work.end(),
    ]);
    console.log('✅ All database pools closed');
  } catch (error) {
    console.error('❌ Error closing database pools:', error);
    throw error;
  }
}

/**
 * Setup graceful shutdown handlers
 * Call this in main.ts to ensure connections are closed on exit
 */
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n📴 Received ${signal}. Starting graceful shutdown...`);

    try {
      await closeAllPools();
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Handle different termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await closeAllPools().catch(console.error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
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
    console.log('✓ Personal database connected');
  } catch (error) {
    console.error('✗ Personal database connection failed:', error);
  }

  try {
    await queryContext('work', 'SELECT 1');
    results.work = true;
    console.log('✓ Work database connected');
  } catch (error) {
    console.error('✗ Work database connection failed:', error);
  }

  return results;
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
