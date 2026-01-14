#!/usr/bin/env ts-node
/**
 * Fix incubator tables schema to match expected structure
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function fixIncubatorSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Fixing incubator schema...\n');

    // === Fix loose_thoughts table ===
    console.log('1. Fixing loose_thoughts table...');

    // Add user_id column (copy from company_id)
    await pool.query(`
      ALTER TABLE loose_thoughts ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) DEFAULT 'default';
      UPDATE loose_thoughts SET user_id = COALESCE(company_id, 'default') WHERE user_id IS NULL OR user_id = 'default';
    `);
    console.log('   ✅ user_id column added');

    // Add raw_input column (copy from raw_text)
    await pool.query(`
      ALTER TABLE loose_thoughts ADD COLUMN IF NOT EXISTS raw_input TEXT;
      UPDATE loose_thoughts SET raw_input = raw_text WHERE raw_input IS NULL;
    `);
    console.log('   ✅ raw_input column added');

    // Add source column
    await pool.query(`
      ALTER TABLE loose_thoughts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'text';
    `);
    console.log('   ✅ source column added');

    // Add user_tags column
    await pool.query(`
      ALTER TABLE loose_thoughts ADD COLUMN IF NOT EXISTS user_tags JSONB DEFAULT '[]';
    `);
    console.log('   ✅ user_tags column added');

    // Add similarity_to_cluster column
    await pool.query(`
      ALTER TABLE loose_thoughts ADD COLUMN IF NOT EXISTS similarity_to_cluster FLOAT;
    `);
    console.log('   ✅ similarity_to_cluster column added');

    // Add is_processed column (copy from is_merged)
    await pool.query(`
      ALTER TABLE loose_thoughts ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;
      UPDATE loose_thoughts SET is_processed = COALESCE(is_merged, FALSE) WHERE is_processed IS NULL;
    `);
    console.log('   ✅ is_processed column added');

    // Add indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_loose_thoughts_user_id ON loose_thoughts(user_id);
      CREATE INDEX IF NOT EXISTS idx_loose_thoughts_is_processed ON loose_thoughts(is_processed);
    `);
    console.log('   ✅ indexes created');

    // === Fix thought_clusters table ===
    console.log('\n2. Fixing thought_clusters table...');

    // Add user_id column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) DEFAULT 'default';
      UPDATE thought_clusters SET user_id = COALESCE(company_id, 'default') WHERE user_id IS NULL OR user_id = 'default';
    `);
    console.log('   ✅ user_id column added');

    // Add title column (copy from name)
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS title VARCHAR(255);
      UPDATE thought_clusters SET title = name WHERE title IS NULL;
    `);
    console.log('   ✅ title column added');

    // Add summary column (copy from description)
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS summary TEXT;
      UPDATE thought_clusters SET summary = description WHERE summary IS NULL;
    `);
    console.log('   ✅ summary column added');

    // Add suggested_type column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS suggested_type VARCHAR(50);
    `);
    console.log('   ✅ suggested_type column added');

    // Add suggested_category column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS suggested_category VARCHAR(50);
    `);
    console.log('   ✅ suggested_category column added');

    // Add thought_count column (copy from idea_count)
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS thought_count INTEGER DEFAULT 0;
      UPDATE thought_clusters SET thought_count = COALESCE(idea_count, 0) WHERE thought_count IS NULL OR thought_count = 0;
    `);
    console.log('   ✅ thought_count column added');

    // Add confidence_score column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS confidence_score FLOAT DEFAULT 0;
    `);
    console.log('   ✅ confidence_score column added');

    // Add maturity_score column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS maturity_score FLOAT DEFAULT 0;
    `);
    console.log('   ✅ maturity_score column added');

    // Add status column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'growing';
    `);
    console.log('   ✅ status column added');

    // Add consolidated_idea_id column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS consolidated_idea_id UUID;
    `);
    console.log('   ✅ consolidated_idea_id column added');

    // Add presented_at column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS presented_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('   ✅ presented_at column added');

    // Add consolidated_at column
    await pool.query(`
      ALTER TABLE thought_clusters ADD COLUMN IF NOT EXISTS consolidated_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('   ✅ consolidated_at column added');

    // Add indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_thought_clusters_user_id ON thought_clusters(user_id);
      CREATE INDEX IF NOT EXISTS idx_thought_clusters_status ON thought_clusters(status);
      CREATE INDEX IF NOT EXISTS idx_thought_clusters_maturity ON thought_clusters(maturity_score DESC);
    `);
    console.log('   ✅ indexes created');

    // === Verify ===
    console.log('\n📋 Verification:');

    const ltCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'loose_thoughts'
    `);
    console.log('loose_thoughts columns:', ltCols.rows.map(r => r.column_name).join(', '));

    const tcCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'thought_clusters'
    `);
    console.log('thought_clusters columns:', tcCols.rows.map(r => r.column_name).join(', '));

    console.log('\n✅ Schema fix complete!');
    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

fixIncubatorSchema();
