/**
 * Run Missing Migrations
 * Fuegt alle fehlenden Tabellen zur Datenbank hinzu
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MIGRATIONS = [
  // Phase 20: Analytics & Goals
  {
    name: 'analytics_events',
    sql: `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL DEFAULT 'default',
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
    `
  },
  {
    name: 'user_goals',
    sql: `
      CREATE TABLE IF NOT EXISTS user_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL DEFAULT 'default',
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        title VARCHAR(255) NOT NULL,
        description TEXT,
        target_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        progress INTEGER DEFAULT 0,
        linked_ideas UUID[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_goals_user ON user_goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_goals_context ON user_goals(context);
      CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);
    `
  },

  // Phase 21: Personalization Chat
  {
    name: 'personalization_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS personalization_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL DEFAULT 'default',
        status VARCHAR(20) DEFAULT 'active',
        current_phase VARCHAR(50) DEFAULT 'introduction',
        questions_asked INTEGER DEFAULT 0,
        facts_collected INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_personalization_sessions_user ON personalization_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_personalization_sessions_status ON personalization_sessions(status);
    `
  },
  {
    name: 'chat_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES personalization_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
    `
  },

  // Phase 27: Conversation Memory
  {
    name: 'conversation_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        messages JSONB NOT NULL DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        compressed_summary TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_context CHECK (context IN ('personal', 'work'))
      );
      CREATE INDEX IF NOT EXISTS idx_conv_sessions_context ON conversation_sessions(context);
      CREATE INDEX IF NOT EXISTS idx_conv_sessions_activity ON conversation_sessions(last_activity DESC);
      CREATE INDEX IF NOT EXISTS idx_conv_sessions_created ON conversation_sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conv_sessions_metadata ON conversation_sessions USING GIN (metadata);
    `
  },
  {
    name: 'routine_patterns',
    sql: `
      CREATE TABLE IF NOT EXISTS routine_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        pattern_type VARCHAR(50) NOT NULL,
        trigger_config JSONB NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        action_config JSONB DEFAULT '{}',
        confidence DECIMAL(5,4) DEFAULT 0.5,
        occurrences INTEGER DEFAULT 0,
        last_triggered TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_pattern_context CHECK (context IN ('personal', 'work')),
        CONSTRAINT valid_pattern_type CHECK (pattern_type IN ('time_based', 'sequence_based', 'context_based')),
        CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
      );
      CREATE INDEX IF NOT EXISTS idx_routine_patterns_context ON routine_patterns(context);
      CREATE INDEX IF NOT EXISTS idx_routine_patterns_active ON routine_patterns(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_routine_patterns_type ON routine_patterns(pattern_type);
    `
  },
  {
    name: 'user_action_log',
    sql: `
      CREATE TABLE IF NOT EXISTS user_action_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        action_type VARCHAR(100) NOT NULL,
        action_data JSONB DEFAULT '{}',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        day_of_week INTEGER GENERATED ALWAYS AS (EXTRACT(DOW FROM timestamp)) STORED,
        hour_of_day INTEGER GENERATED ALWAYS AS (EXTRACT(HOUR FROM timestamp)) STORED,
        CONSTRAINT valid_action_context CHECK (context IN ('personal', 'work'))
      );
      CREATE INDEX IF NOT EXISTS idx_user_actions_context_time ON user_action_log(context, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_user_actions_type ON user_action_log(action_type);
      CREATE INDEX IF NOT EXISTS idx_user_actions_dow ON user_action_log(day_of_week);
      CREATE INDEX IF NOT EXISTS idx_user_actions_hour ON user_action_log(hour_of_day);
      CREATE INDEX IF NOT EXISTS idx_user_actions_timestamp ON user_action_log(timestamp DESC);
    `
  },
  {
    name: 'proactive_suggestion_feedback',
    sql: `
      CREATE TABLE IF NOT EXISTS proactive_suggestion_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        suggestion_id UUID NOT NULL,
        context VARCHAR(20) NOT NULL DEFAULT 'personal',
        suggestion_type VARCHAR(50) NOT NULL,
        was_accepted BOOLEAN NOT NULL,
        dismiss_reason TEXT,
        action_taken JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_feedback_context CHECK (context IN ('personal', 'work'))
      );
      CREATE INDEX IF NOT EXISTS idx_proactive_feedback_context ON proactive_suggestion_feedback(context);
      CREATE INDEX IF NOT EXISTS idx_proactive_feedback_type ON proactive_suggestion_feedback(suggestion_type);
      CREATE INDEX IF NOT EXISTS idx_proactive_feedback_accepted ON proactive_suggestion_feedback(was_accepted);
    `
  },
  {
    name: 'proactive_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS proactive_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL UNIQUE,
        proactivity_level VARCHAR(20) DEFAULT 'balanced',
        enabled_types JSONB DEFAULT '["routine", "connection", "reminder", "draft", "follow_up"]',
        quiet_hours_start INTEGER DEFAULT 22,
        quiet_hours_end INTEGER DEFAULT 7,
        max_suggestions_per_day INTEGER DEFAULT 10,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_settings_context CHECK (context IN ('personal', 'work')),
        CONSTRAINT valid_proactivity_level CHECK (proactivity_level IN ('aggressive', 'balanced', 'minimal', 'off')),
        CONSTRAINT valid_quiet_hours CHECK (quiet_hours_start >= 0 AND quiet_hours_start <= 23 AND quiet_hours_end >= 0 AND quiet_hours_end <= 23)
      );
      INSERT INTO proactive_settings (context, proactivity_level)
      VALUES ('personal', 'balanced'), ('work', 'balanced')
      ON CONFLICT (context) DO NOTHING;
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Running missing migrations...\n');

    // Check which tables already exist
    const { rows: existingTables } = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    const tableSet = new Set(existingTables.map(r => r.tablename));

    let created = 0;
    let skipped = 0;

    for (const migration of MIGRATIONS) {
      if (tableSet.has(migration.name)) {
        console.log(`⊘ ${migration.name} already exists (skipped)`);
        skipped++;
      } else {
        try {
          await client.query(migration.sql);
          console.log(`✓ ${migration.name} created`);
          created++;
        } catch (err: any) {
          console.error(`✗ ${migration.name} failed:`, err.message);
        }
      }
    }

    console.log(`\n✅ Migrations complete!`);
    console.log(`   Created: ${created} tables`);
    console.log(`   Skipped: ${skipped} tables (already exist)`);

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
