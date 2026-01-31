/**
 * Database Reset Script
 * Loescht alle Benutzerdaten, behaelt System-Konfigurationen
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TABLES_TO_TRUNCATE = [
  // Chat Messages und Sessions
  'general_chat_messages',
  'general_chat_sessions',
  'chat_messages',
  'personalization_sessions',
  'conversation_sessions',

  // Ideas und zugehoerige Daten
  'idea_topic_memberships',
  'idea_relations',
  'ideas',
  'idea_topics',

  // Incubator
  'loose_thoughts',
  'thought_clusters',

  // Voice Memos
  'voice_memos',

  // Training & Patterns
  'user_training',
  'pattern_predictions',
  'interaction_history',

  // Media
  'media_items',

  // Analytics & Events
  'analytics_events',
  'user_action_log',

  // Notifications (Historie)
  'notification_history',

  // Digests
  'digests',

  // User Goals
  'user_goals',

  // Proactive Suggestions
  'proactive_suggestion_feedback',
  'routine_patterns',

  // Personalization Facts (Long-Term Memory)
  'personalization_facts',
];

async function resetDatabase() {
  const client = await pool.connect();

  try {
    console.log('Starting database reset...\n');

    // First, check which tables exist
    const { rows: existingTables } = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    const tableSet = new Set(existingTables.map(r => r.tablename));

    // Filter to only existing tables
    const tablesToTruncate = TABLES_TO_TRUNCATE.filter(t => tableSet.has(t));
    const skippedTables = TABLES_TO_TRUNCATE.filter(t => !tableSet.has(t));

    // Show skipped tables first
    for (const table of skippedTables) {
      console.log(`⊘ ${table} does not exist (skipped)`);
    }

    // Now truncate all existing tables in a single transaction
    if (tablesToTruncate.length > 0) {
      await client.query('BEGIN');

      for (const table of tablesToTruncate) {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`✓ ${table} truncated`);
      }

      await client.query('COMMIT');
    }

    console.log('\n✅ Database reset complete!');
    console.log('\nPreserved tables:');
    console.log('  - user_profile');
    console.log('  - notification_preferences');
    console.log('  - proactive_settings');
    console.log('  - productivity_goals');
    console.log('  - push_tokens');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();
