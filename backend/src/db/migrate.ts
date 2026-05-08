#!/usr/bin/env node
/**
 * Database Migration Runner
 *
 * Reads .sql files from backend/sql/migrations/ (sorted alphabetically),
 * skips the archive/ subdirectory, and applies pending migrations inside
 * individual transactions. Each applied migration is recorded in the
 * public.migration_history table with a SHA-256 checksum.
 *
 * Usage:
 *   npx ts-node src/db/migrate.ts           # Apply pending migrations
 *   npx ts-node src/db/migrate.ts --status   # Show migration status only
 *
 * Environment:
 *   DATABASE_URL  - PostgreSQL connection string (required)
 */

import * as fs from 'fs';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import {
  scanMigrationFiles,
  ensureMigrationTable,
  getAppliedMigrations,
  getMigrationStatus,
} from './migration-status';

// Load .env from backend root
dotenv.config();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

function warn(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] WARN: ${message}`, ...args);
}

function error(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`, ...args);
}

/**
 * Create a standalone Pool for the migration runner.
 * We intentionally do NOT import the shared pool from database-context.ts
 * because the migration runner is a standalone CLI tool that should
 * work independently of the application server.
 */
function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const parsedUrl = new URL(databaseUrl);
  const isSupabase = parsedUrl.hostname.includes('supabase.co');
  const isInternalRailway = parsedUrl.hostname.endsWith('.railway.internal');

  const sslConfig = isInternalRailway
    ? false
    : process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: !isSupabase }
      : undefined;

  return new Pool({
    connectionString: databaseUrl,
    max: 2, // Minimal pool for migration runner
    ssl: sslConfig || undefined,
  });
}

// ---------------------------------------------------------------------------
// Status Command
// ---------------------------------------------------------------------------

async function showStatus(pool: Pool): Promise<void> {
  const status = await getMigrationStatus(pool);

  log('Migration Status:');
  log(`  Total files:   ${status.total}`);
  log(`  Applied:       ${status.applied}`);
  log(`  Pending:       ${status.pending}`);

  if (status.pendingNames.length > 0) {
    log('  Pending migrations:');
    for (const name of status.pendingNames) {
      log(`    - ${name}`);
    }
  }

  if (status.checksumMismatches.length > 0) {
    warn('Checksum mismatches detected (files changed after application):');
    for (const name of status.checksumMismatches) {
      warn(`    - ${name}`);
    }
  }

  if (status.pending === 0 && status.checksumMismatches.length === 0) {
    log('  All migrations are up to date.');
  }
}

// ---------------------------------------------------------------------------
// Migration Runner
// ---------------------------------------------------------------------------

export async function runMigrations(pool: Pool): Promise<void> {
  // Step 1: Ensure tracking table exists
  log('Ensuring migration_history table exists...');
  await ensureMigrationTable(pool);

  // Step 2: Scan migration files
  const files = scanMigrationFiles();
  log(`Found ${files.length} migration file(s)`);

  if (files.length === 0) {
    log('No migration files found. Nothing to do.');
    return;
  }

  // Step 3: Get already-applied migrations
  const applied = await getAppliedMigrations(pool);
  const appliedMap = new Map(applied.map(m => [m.name, m]));
  log(`${applied.length} migration(s) already applied`);

  // Step 4: Process each migration file
  let appliedCount = 0;
  let skippedCount = 0;
  let warnCount = 0;

  for (const file of files) {
    const existing = appliedMap.get(file.name);

    if (existing) {
      // Already applied - check for checksum changes
      if (existing.checksum !== file.checksum) {
        warn(
          `Checksum mismatch for "${file.name}": ` +
          `applied=${existing.checksum.substring(0, 12)}... ` +
          `current=${file.checksum.substring(0, 12)}... ` +
          '(file changed after migration was applied, skipping)'
        );
        warnCount++;
      }
      skippedCount++;
      continue;
    }

    // New migration - apply it
    log(`Applying: ${file.name}...`);
    const sql = fs.readFileSync(file.filePath, 'utf-8');
    const startTime = Date.now();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      const durationMs = Date.now() - startTime;

      // Record in migration_history
      await client.query(
        `INSERT INTO public.migration_history (name, checksum, duration_ms)
         VALUES ($1, $2, $3)`,
        [file.name, file.checksum, durationMs]
      );

      await client.query('COMMIT');
      log(`  Applied "${file.name}" in ${durationMs}ms`);
      appliedCount++;
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => { /* ignore rollback errors */ });
      const errMsg = err instanceof Error ? err.message : String(err);
      error(`  Failed to apply "${file.name}": ${errMsg}`);
      throw err; // Re-throw to exit with code 1
    } finally {
      client.release();
    }
  }

  // Step 5: Summary
  log('');
  log('Migration Summary:');
  log(`  Applied:  ${appliedCount}`);
  log(`  Skipped:  ${skippedCount} (already applied)`);
  if (warnCount > 0) {
    log(`  Warnings: ${warnCount} (checksum mismatches)`);
  }
  log('Done.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isStatusOnly = args.includes('--status');

  const pool = createPool();

  try {
    if (isStatusOnly) {
      await showStatus(pool);
    } else {
      await runMigrations(pool);
    }
  } finally {
    await pool.end();
  }
}

// Only auto-run as a CLI. When server.ts imports { runMigrations } from this
// file, we must NOT kick off main() — otherwise a failed migration will call
// process.exit(1) and crash the server. Server wraps runMigrations() in its
// own try/catch where a failure is logged non-fatally.
if (require.main === module) {
  main().catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    error(`Migration failed: ${errMsg}`);
    process.exit(1);
  });
}
