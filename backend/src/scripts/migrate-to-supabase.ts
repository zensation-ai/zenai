/**
 * Migration Script: Railway PostgreSQL → Supabase
 *
 * Migrates all data from Railway to Supabase with progress tracking
 * Run with: npm run migrate:supabase
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

// ===========================================
// Configuration
// ===========================================

const RAILWAY_URL = process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!RAILWAY_URL) {
  console.error('❌ RAILWAY_DATABASE_URL or DATABASE_URL not set');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
  process.exit(1);
}

// Railway Connection
const railwayPool = new Pool({ connectionString: RAILWAY_URL });

// Supabase Connection (using postgres client for bulk operations)
const supabaseDbUrl = process.env.SUPABASE_DB_URL;
if (!supabaseDbUrl) {
  console.error('❌ SUPABASE_DB_URL not set');
  console.log('   Get it from: Supabase Dashboard → Settings → Database → Connection String (Transaction mode)');
  process.exit(1);
}
const supabasePool = new Pool({ connectionString: supabaseDbUrl });

// ===========================================
// Migration Functions
// ===========================================

async function migrateTable(
  tableName: string,
  orderBy: string = 'created_at'
): Promise<number> {
  console.log(`\n📊 Migrating table: ${tableName}`);

  try {
    // 1. Get row count from Railway
    const countResult = await railwayPool.query(
      `SELECT COUNT(*) FROM ${tableName}`
    );
    const totalRows = parseInt(countResult.rows[0].count, 10);

    if (totalRows === 0) {
      console.log('   ℹ️  No data to migrate');
      return 0;
    }

    console.log(`   Total rows: ${totalRows}`);

    // 2. Fetch all data from Railway
    const dataResult = await railwayPool.query(
      `SELECT * FROM ${tableName} ORDER BY ${orderBy}`
    );
    const rows = dataResult.rows;

    console.log(`   ✅ Fetched ${rows.length} rows from Railway`);

    // 3. Insert into Supabase (batch insert)
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      // Convert rows to column-value format
      if (batch.length > 0) {
        const columns = Object.keys(batch[0]);
        const values = batch.map((row) =>
          columns.map((col) => {
            const val = row[col];
            // Handle special types
            if (val === null) {return 'NULL';}
            if (typeof val === 'object') {return `'${JSON.stringify(val)}'`;}
            if (typeof val === 'string') {return `'${val.replace(/'/g, "''")}'`;}
            return val;
          })
        );

        const valuesStr = values
          .map((v) => `(${v.join(',')})`)
          .join(',');

        const insertQuery = `
          INSERT INTO ${tableName} (${columns.join(',')})
          VALUES ${valuesStr}
          ON CONFLICT (id) DO NOTHING
        `;

        try {
          await supabasePool.query(insertQuery);
          inserted += batch.length;
          console.log(
            `   ⏳ Progress: ${inserted}/${totalRows} (${Math.round(
              (inserted / totalRows) * 100
            )}%)`
          );
        } catch (error) {
          console.error(`   ❌ Batch insert failed at row ${i}:`, error);
          // Try individual inserts for failed batch
          for (const row of batch) {
            const singleValues = columns
              .map((col) => {
                const val = row[col];
                if (val === null) {return 'NULL';}
                if (typeof val === 'object')
                  {return `'${JSON.stringify(val)}'`;}
                if (typeof val === 'string')
                  {return `'${val.replace(/'/g, "''")}'`;}
                return val;
              })
              .join(',');

            const singleQuery = `
              INSERT INTO ${tableName} (${columns.join(',')})
              VALUES (${singleValues})
              ON CONFLICT (id) DO NOTHING
            `;

            try {
              await supabasePool.query(singleQuery);
              inserted++;
            } catch {
              console.error(`   ⚠️  Failed to insert row:`, row.id || row);
            }
          }
        }
      }
    }

    console.log(`   ✅ Successfully migrated ${inserted}/${totalRows} rows`);
    return inserted;
  } catch (error) {
    console.error(`   ❌ Migration failed for ${tableName}:`, error);
    return 0;
  }
}

// ===========================================
// Main Migration
// ===========================================

async function migrate() {
  console.log('🚀 Starting migration from Railway to Supabase...\n');
  console.log('Source: Railway PostgreSQL');
  console.log('Target: Supabase PostgreSQL with pgvector\n');

  const startTime = Date.now();

  try {
    // Test connections
    console.log('🔌 Testing connections...');
    await railwayPool.query('SELECT 1');
    console.log('   ✅ Railway connected');

    await supabasePool.query('SELECT 1');
    console.log('   ✅ Supabase connected');

    // Check pgvector
    const pgvectorCheck = await supabasePool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    if (pgvectorCheck.rows.length === 0) {
      console.error('\n❌ pgvector extension not found in Supabase!');
      console.log('   Run this in Supabase SQL Editor:');
      console.log('   CREATE EXTENSION IF NOT EXISTS vector;');
      process.exit(1);
    }
    console.log('   ✅ pgvector extension verified\n');

    // Migrate tables in order (respecting foreign keys)
    const migrations = [
      { table: 'companies', orderBy: 'created_at' },
      { table: 'user_profile', orderBy: 'created_at' },
      { table: 'ideas', orderBy: 'created_at' },
      { table: 'idea_relations', orderBy: 'created_at' },
      { table: 'meetings', orderBy: 'created_at' },
      { table: 'meeting_notes', orderBy: 'created_at' },
      { table: 'user_interactions', orderBy: 'created_at' },
      { table: 'voice_memos', orderBy: 'created_at' },
      { table: 'media_items', orderBy: 'created_at' },
      { table: 'user_training', orderBy: 'created_at' },
      { table: 'thought_clusters', orderBy: 'created_at' },
      { table: 'loose_thoughts', orderBy: 'created_at' },
      { table: 'api_keys', orderBy: 'created_at' },
      { table: 'oauth_tokens', orderBy: 'created_at' },
      { table: 'integrations', orderBy: 'created_at' },
      { table: 'webhooks', orderBy: 'created_at' },
      { table: 'webhook_deliveries', orderBy: 'created_at' },
      { table: 'calendar_events', orderBy: 'created_at' },
      { table: 'slack_messages', orderBy: 'created_at' },
    ];

    let totalMigrated = 0;

    for (const { table, orderBy } of migrations) {
      const count = await migrateTable(table, orderBy);
      totalMigrated += count;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Total rows migrated: ${totalMigrated}`);
    console.log(`   Duration: ${duration}s\n`);

    console.log('🎯 Next steps:');
    console.log('1. Update your .env file:');
    console.log('   DATABASE_URL=<your-supabase-url>');
    console.log('2. Test the connection:');
    console.log('   npm run test:db');
    console.log('3. Deploy to production with new DATABASE_URL');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await railwayPool.end();
    await supabasePool.end();
  }
}

// Run migration
migrate().catch(console.error);
