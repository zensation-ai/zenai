/**
 * Migration Runner Script
 * Executes SQL migration files against the database
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in environment');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function runMigration(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`ERROR: Migration file not found: ${absolutePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(absolutePath, 'utf8');

  console.log('========================================');
  console.log(`Running migration: ${path.basename(filePath)}`);
  console.log('========================================');
  console.log(`File: ${absolutePath}`);
  console.log(`SQL length: ${sql.length} characters`);
  console.log('----------------------------------------');

  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // Execute migration
    const result = await client.query(sql);

    // Commit transaction
    await client.query('COMMIT');

    console.log('Migration executed successfully!');
    console.log('----------------------------------------');

    // Show any notices
    if (result.rows && result.rows.length > 0) {
      console.log('Result:', result.rows);
    }

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Migration FAILED! Rolling back...');
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const migrationFile = process.argv[2] || 'sql/migrations/fix_missing_schema_elements.sql';

  try {
    await runMigration(migrationFile);
    console.log('========================================');
    console.log('Migration completed successfully!');
    console.log('========================================');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
