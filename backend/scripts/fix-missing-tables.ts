#!/usr/bin/env ts-node
/**
 * Script to create missing tables in Supabase
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function fixMissingTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Fixing missing tables in Supabase...\n');

    // 1. Create cluster_analysis_log table
    console.log('Creating cluster_analysis_log...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cluster_analysis_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_type VARCHAR(20) NOT NULL CHECK (run_type IN ('on_input', 'scheduled', 'manual')),
        thoughts_analyzed INTEGER DEFAULT 0,
        clusters_created INTEGER DEFAULT 0,
        clusters_updated INTEGER DEFAULT 0,
        clusters_ready INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ cluster_analysis_log created');

    // 2. Create indexes
    console.log('Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cluster_analysis_log_created_at ON cluster_analysis_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cluster_analysis_log_run_type ON cluster_analysis_log(run_type);
    `);
    console.log('  ✅ Indexes created');

    // 3. Create interaction_history table (for Learning Engine)
    console.log('Creating interaction_history...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interaction_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL DEFAULT 'default',
        idea_id UUID,
        interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('view', 'edit', 'prioritize', 'archive', 'share', 'complete')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_interaction_history_user_id ON interaction_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_interaction_history_idea_id ON interaction_history(idea_id);
      CREATE INDEX IF NOT EXISTS idx_interaction_history_type ON interaction_history(interaction_type);
      CREATE INDEX IF NOT EXISTS idx_interaction_history_created_at ON interaction_history(created_at DESC);
    `);
    console.log('  ✅ interaction_history created');

    // 4. Create pattern_predictions table (for Learning Engine)
    console.log('Creating pattern_predictions...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pattern_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL DEFAULT 'default',
        pattern_type VARCHAR(50) NOT NULL,
        pattern_data JSONB NOT NULL DEFAULT '{}',
        confidence FLOAT DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
        sample_count INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pattern_predictions_user_id ON pattern_predictions(user_id);
      CREATE INDEX IF NOT EXISTS idx_pattern_predictions_type ON pattern_predictions(pattern_type);
    `);
    console.log('  ✅ pattern_predictions created');

    // Verify
    console.log('\n📋 Verification:');
    const tables = ['cluster_analysis_log', 'interaction_history', 'pattern_predictions'];
    for (const t of tables) {
      const r = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${t}')`);
      console.log(`  ${t}: ${r.rows[0].exists ? '✅' : '❌'}`);
    }

    console.log('\n✅ All missing tables created successfully!');
    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

fixMissingTables();
