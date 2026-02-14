/**
 * Database Module - Thin facade over database-context.ts
 *
 * CRITICAL: This module reuses the shared pool from database-context.ts
 * instead of creating its own separate pool. Two pools would exhaust
 * Supabase Free Tier connection limits (~15-20 max).
 *
 * For public-schema tables (api_keys, webhooks, general_chat_*, etc.)
 * use queryPublic(). For context-specific tables use queryContext().
 */

import { logger } from './logger';
import { pool as sharedPool, queryPublic, queryContext } from './database-context';
import type { PoolClient, QueryResult } from 'pg';

// Re-export PoolClient type for use in services
export type { PoolClient } from 'pg';

// Re-export the shared pool — eliminates the second connection pool
export const pool = sharedPool;

// Type for SQL query parameters - allows common PostgreSQL parameter types
type QueryParam = string | number | boolean | Date | null | undefined | Buffer | object;

/**
 * Execute a query against the public schema.
 *
 * This is the correct function for tables that live in the public schema:
 * general_chat_sessions, general_chat_messages, api_keys, webhooks, etc.
 *
 * Previously this used a SEPARATE pool (max 8 connections) which competed
 * with the context pool (max 3) for Supabase's limited connection slots.
 * Now it delegates to queryPublic() from database-context.ts.
 */
export async function query(text: string, params?: QueryParam[]): Promise<QueryResult> {
  const start = Date.now();
  const result = await queryPublic(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    logger.debug('Query executed (public)', { duration });
  }

  return result;
}

export async function getClient(): Promise<PoolClient> {
  return sharedPool.connect();
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await sharedPool.query('SELECT NOW()');
    logger.info('Database connected', { timestamp: result.rows[0].now });
    return true;
  } catch (error) {
    logger.error('Database connection failed', error instanceof Error ? error : undefined);
    return false;
  }
}

// Re-export for convenience
export { queryPublic, queryContext };
