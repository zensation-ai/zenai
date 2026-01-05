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
  await Promise.all([
    pools.personal.end(),
    pools.work.end(),
  ]);
  console.log('All database pools closed');
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

// Export original database.ts functions for compatibility
export * from './database';
