import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { logger } from './logger';

// Re-export PoolClient type for use in services
export type { PoolClient } from 'pg';

dotenv.config();

/**
 * Parse DATABASE_URL into connection config
 */
function getPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // Railway-style DATABASE_URL
    const parsed = new URL(databaseUrl);
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

    return {
      host,
      port: parseInt(parsed.port || '5432', 10),
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      ssl: sslConfig,
      // Pool configuration consistent with database-context.ts (Phase 36 Optimized)
      max: parseInt(process.env.DB_POOL_SIZE || '8', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      idleTimeoutMillis: 60000, // 60s to reduce reconnections
      connectionTimeoutMillis: 10000, // 10s for production latency
      statement_timeout: 30000, // 30s to prevent long-running queries
      keepAlive: true,
      keepAliveInitialDelayMillis: 1000, // Fast detection of dead connections
    };
  }

  // Individual environment variables - only for development
  // SECURITY: In production, DATABASE_URL is required
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL environment variable is required in production. ' +
      'Individual DB_* variables are only supported in development.'
    );
  }

  logger.warn('Using individual DB_* environment variables (development mode)', {
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ai_brain',
  });

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ai_brain',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'localpass',
    // Pool size consistent with database-context.ts (Phase 36 Optimized)
    max: parseInt(process.env.DB_POOL_SIZE || '8', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    idleTimeoutMillis: 60000, // 60s to reduce reconnections
    connectionTimeoutMillis: 10000, // 10s for better reliability
    statement_timeout: 30000, // 30s to prevent long-running queries
    keepAlive: true,
    keepAliveInitialDelayMillis: 1000, // Fast detection of dead connections
  };
}

export const pool = new Pool(getPoolConfig());

pool.on('error', (err) => {
  logger.error('Unexpected database error', err instanceof Error ? err : undefined);
});

// Type for SQL query parameters - allows common PostgreSQL parameter types
type QueryParam = string | number | boolean | Date | null | undefined | Buffer | object;

export async function query(text: string, params?: QueryParam[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    logger.debug('Query executed', { duration });
  }

  return result;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info('Database connected', { timestamp: result.rows[0].now });
    return true;
  } catch (error) {
    logger.error('Database connection failed', error instanceof Error ? error : undefined);
    return false;
  }
}
