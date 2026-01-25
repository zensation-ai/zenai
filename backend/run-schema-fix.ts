/**
 * Schema Fix Script - Robust Migration
 * Executes each schema change individually to handle partial failures
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});

interface MigrationStep {
  name: string;
  sql: string;
}

const migrations: MigrationStep[] = [
  // 1. Personalization Topics Table
  {
    name: 'Create personalization_topics table',
    sql: `
      CREATE TABLE IF NOT EXISTS personalization_topics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic VARCHAR(100) NOT NULL UNIQUE,
        questions_asked INTEGER DEFAULT 0,
        last_asked_at TIMESTAMP WITH TIME ZONE,
        completion_level DECIMAL(3,2) DEFAULT 0.0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: 'Insert default topics',
    sql: `
      INSERT INTO personalization_topics (topic, completion_level)
      SELECT topic, 0.0
      FROM (VALUES
        ('basic_info'),('personality'),('work_life'),('goals_dreams'),
        ('interests_hobbies'),('communication_style'),('decision_making'),
        ('daily_routines'),('values_beliefs'),('challenges')
      ) AS t(topic)
      ON CONFLICT (topic) DO NOTHING;
    `
  },
  {
    name: 'Create personalization_topics index',
    sql: `CREATE INDEX IF NOT EXISTS idx_personalization_topics_topic ON personalization_topics(topic);`
  },

  // 2. Personal Facts Table
  {
    name: 'Create personal_facts table',
    sql: `
      CREATE TABLE IF NOT EXISTS personal_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(50) NOT NULL,
        fact_key VARCHAR(100) NOT NULL,
        fact_value TEXT NOT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.8,
        source VARCHAR(20) DEFAULT 'conversation',
        asked_question TEXT,
        user_response TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(category, fact_key)
      );
    `
  },
  {
    name: 'Create personal_facts indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_personal_facts_category ON personal_facts(category);
      CREATE INDEX IF NOT EXISTS idx_personal_facts_key ON personal_facts(fact_key);
    `
  },

  // 3. Personalization Conversations Table
  {
    name: 'Create personalization_conversations table',
    sql: `
      CREATE TABLE IF NOT EXISTS personalization_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN ('ai', 'user')),
        message TEXT NOT NULL,
        facts_extracted JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: 'Create personalization_conversations indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_pers_conv_session ON personalization_conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_pers_conv_created ON personalization_conversations(created_at DESC);
    `
  },

  // 4. General Chat Sessions Table
  {
    name: 'Create general_chat_sessions table',
    sql: `
      CREATE TABLE IF NOT EXISTS general_chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        title VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: 'Create general_chat_sessions indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_context ON general_chat_sessions(context);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON general_chat_sessions(updated_at DESC);
    `
  },

  // 5. General Chat Messages Table
  {
    name: 'Create general_chat_messages table',
    sql: `
      CREATE TABLE IF NOT EXISTS general_chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES general_chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: 'Create general_chat_messages indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON general_chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON general_chat_messages(created_at ASC);
    `
  },

  // 6. Media Items Table
  {
    name: 'Create media_items table',
    sql: `
      CREATE TABLE IF NOT EXISTS media_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
        filename VARCHAR(255) NOT NULL DEFAULT 'unknown',
        file_path TEXT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        caption TEXT,
        context VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'Add filename column to media_items if missing',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'media_items' AND column_name = 'filename'
        ) THEN
          ALTER TABLE media_items ADD COLUMN filename VARCHAR(255) NOT NULL DEFAULT 'unknown';
        END IF;
      END $$;
    `
  },
  {
    name: 'Create media_items indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(media_type);
      CREATE INDEX IF NOT EXISTS idx_media_context ON media_items(context);
      CREATE INDEX IF NOT EXISTS idx_media_created_at ON media_items(created_at DESC);
    `
  },

  // 7. Export History Table
  {
    name: 'Create export_history table',
    sql: `
      CREATE TABLE IF NOT EXISTS export_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        export_type VARCHAR(20) NOT NULL CHECK (export_type IN ('pdf', 'markdown', 'csv', 'json', 'backup')),
        filename VARCHAR(255),
        file_size BIGINT,
        ideas_count INTEGER DEFAULT 0,
        filters JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: 'Create export_history indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_export_history_type ON export_history(export_type);
      CREATE INDEX IF NOT EXISTS idx_export_history_created ON export_history(created_at DESC);
    `
  },

  // 8. User Training - Add context column if missing
  {
    name: 'Add context column to user_training if missing',
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'user_training'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'user_training' AND column_name = 'context'
          ) THEN
            ALTER TABLE user_training ADD COLUMN context VARCHAR(20) DEFAULT 'personal';
          END IF;
        END IF;
      END $$;
    `
  },
  {
    name: 'Create user_training context index',
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_training' AND column_name = 'context'
        ) THEN
          CREATE INDEX IF NOT EXISTS idx_user_training_context ON user_training(context);
        END IF;
      END $$;
    `
  },

  // 9. Chat session update trigger
  {
    name: 'Create chat session update trigger function',
    sql: `
      CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `
  },
  {
    name: 'Apply trigger to general_chat_sessions',
    sql: `
      DROP TRIGGER IF EXISTS chat_session_updated_at ON general_chat_sessions;
      CREATE TRIGGER chat_session_updated_at
        BEFORE UPDATE ON general_chat_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_chat_session_timestamp();
    `
  },
];

async function runMigrations(): Promise<void> {
  console.log('========================================');
  console.log('Schema Fix - Running Migrations');
  console.log('========================================\n');

  let successCount = 0;
  let failCount = 0;
  const errors: { name: string; error: string }[] = [];

  for (const migration of migrations) {
    try {
      console.log(`Running: ${migration.name}...`);
      await pool.query(migration.sql);
      console.log(`  ✅ Success\n`);
      successCount++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Failed: ${errorMsg}\n`);
      errors.push({ name: migration.name, error: errorMsg });
      failCount++;
    }
  }

  console.log('========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }

  console.log('========================================\n');
}

async function main() {
  try {
    await runMigrations();
  } catch (error) {
    console.error('Migration script failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
