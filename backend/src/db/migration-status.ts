/**
 * Migration Status Utility
 *
 * Provides migration status information for the health endpoint and CLI.
 * Reads migration files from backend/sql/migrations/ and compares against
 * the public.migration_history table.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Pool } from 'pg';

export interface MigrationFile {
  name: string;
  filePath: string;
  checksum: string;
}

export interface AppliedMigration {
  id: number;
  name: string;
  checksum: string;
  applied_at: Date;
  duration_ms: number;
}

export interface MigrationStatus {
  total: number;
  applied: number;
  pending: number;
  pendingNames: string[];
  checksumMismatches: string[];
}

/** Directory containing migration SQL files (relative to project root) */
const MIGRATIONS_DIR = path.resolve(__dirname, '../../sql/migrations');

/**
 * Scan the migrations directory for .sql files, excluding the archive/ subdirectory.
 * Returns files sorted alphabetically by name.
 */
export function scanMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  const files: MigrationFile[] = [];

  for (const entry of entries) {
    // Skip directories (including archive/)
    if (entry.isDirectory()) {
      continue;
    }
    // Only process .sql files
    if (!entry.name.endsWith('.sql')) {
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, entry.name);
    const content = fs.readFileSync(filePath, 'utf-8');
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    files.push({
      name: entry.name,
      filePath,
      checksum,
    });
  }

  // Sort alphabetically for deterministic ordering
  files.sort((a, b) => a.name.localeCompare(b.name));

  return files;
}

/**
 * Ensure the migration_history table exists in the public schema.
 * Uses IF NOT EXISTS so it's safe to call multiple times.
 */
export async function ensureMigrationTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.migration_history (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(255) NOT NULL UNIQUE,
      checksum      VARCHAR(64) NOT NULL,
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration_ms   INTEGER NOT NULL DEFAULT 0
    )
  `);
}

/**
 * Get all applied migrations from the database.
 */
export async function getAppliedMigrations(pool: Pool): Promise<AppliedMigration[]> {
  const result = await pool.query<AppliedMigration>(
    'SELECT id, name, checksum, applied_at, duration_ms FROM public.migration_history ORDER BY name'
  );
  return result.rows;
}

/**
 * Get the current migration status by comparing files on disk against
 * the migration_history table. Creates the tracking table if needed.
 *
 * @param pool - An active pg Pool connected to the database
 */
export async function getMigrationStatus(pool: Pool): Promise<MigrationStatus> {
  // Ensure the tracking table exists
  await ensureMigrationTable(pool);

  const files = scanMigrationFiles();
  const applied = await getAppliedMigrations(pool);

  const appliedMap = new Map(applied.map(m => [m.name, m]));

  const pendingNames: string[] = [];
  const checksumMismatches: string[] = [];

  for (const file of files) {
    const existing = appliedMap.get(file.name);
    if (!existing) {
      pendingNames.push(file.name);
    } else if (existing.checksum !== file.checksum) {
      checksumMismatches.push(file.name);
    }
  }

  return {
    total: files.length,
    applied: applied.length,
    pending: pendingNames.length,
    pendingNames,
    checksumMismatches,
  };
}
