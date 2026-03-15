/**
 * Fix voice_settings, canvas_documents, canvas_versions, rag_feedback, rag_query_analytics
 * Ensures all tables exist with user_id columns in all schemas
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SCHEMAS = ['personal', 'work', 'learning', 'creative'];
const DEFAULT_USER = '00000000-0000-0000-0000-000000000001';

async function run() {
  const client = await pool.connect();
  try {
    for (const schema of SCHEMAS) {
      console.log(`\n=== Schema: ${schema} ===`);

      // 1. voice_settings
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.voice_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stt_provider VARCHAR(50) DEFAULT 'whisper',
          tts_provider VARCHAR(50) DEFAULT 'edge-tts',
          tts_voice VARCHAR(100) DEFAULT 'de-DE-ConradNeural',
          language VARCHAR(10) DEFAULT 'de-DE',
          vad_sensitivity FLOAT DEFAULT 0.5 CHECK (vad_sensitivity BETWEEN 0 AND 1),
          silence_threshold_ms INTEGER DEFAULT 1500,
          auto_send BOOLEAN DEFAULT true,
          user_id UUID DEFAULT '${DEFAULT_USER}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      // Add user_id if table existed without it
      await client.query(`ALTER TABLE ${schema}.voice_settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '${DEFAULT_USER}'`);
      console.log(`  ✓ voice_settings`);

      // 2. voice_sessions (may also be missing)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.voice_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          chat_session_id UUID,
          status VARCHAR(20) DEFAULT 'active',
          stt_provider VARCHAR(50) DEFAULT 'whisper',
          tts_provider VARCHAR(50) DEFAULT 'edge-tts',
          tts_voice VARCHAR(100) DEFAULT 'de-DE-ConradNeural',
          language VARCHAR(10) DEFAULT 'de-DE',
          total_audio_duration_ms INTEGER DEFAULT 0,
          total_tokens_used INTEGER DEFAULT 0,
          turn_count INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}'::jsonb,
          user_id UUID DEFAULT '${DEFAULT_USER}',
          started_at TIMESTAMPTZ DEFAULT NOW(),
          ended_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`ALTER TABLE ${schema}.voice_sessions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '${DEFAULT_USER}'`);
      console.log(`  ✓ voice_sessions`);

      // 3. rag_feedback
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.rag_feedback (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          query_id UUID,
          query_text TEXT NOT NULL,
          session_id UUID,
          result_id UUID,
          was_helpful BOOLEAN NOT NULL,
          relevance_rating INT CHECK (relevance_rating BETWEEN 1 AND 5),
          feedback_text TEXT,
          strategies_used JSONB,
          confidence NUMERIC,
          response_time_ms INT,
          user_id UUID DEFAULT '${DEFAULT_USER}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${schema}_rag_feedback_query ON ${schema}.rag_feedback(query_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${schema}_rag_feedback_created ON ${schema}.rag_feedback(created_at)`);
      console.log(`  ✓ rag_feedback`);

      // 4. rag_query_analytics
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.rag_query_analytics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          query_text TEXT NOT NULL,
          session_id UUID,
          strategies_used JSONB,
          results_count INT DEFAULT 0,
          avg_confidence NUMERIC,
          response_time_ms INT,
          used_hyde BOOLEAN DEFAULT false,
          used_cross_encoder BOOLEAN DEFAULT false,
          user_id UUID DEFAULT '${DEFAULT_USER}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${schema}_rag_analytics_created ON ${schema}.rag_query_analytics(created_at)`);
      console.log(`  ✓ rag_query_analytics`);
    }

    // 5. Canvas tables in PUBLIC schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.canvas_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL DEFAULT 'Untitled',
        content TEXT DEFAULT '',
        document_type TEXT DEFAULT 'freeform',
        context TEXT DEFAULT 'personal',
        chat_session_id UUID,
        user_id UUID DEFAULT '${DEFAULT_USER}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE public.canvas_documents ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '${DEFAULT_USER}'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_canvas_docs_user ON public.canvas_documents(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_canvas_docs_context ON public.canvas_documents(context)`);
    console.log(`\n  ✓ public.canvas_documents`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.canvas_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES public.canvas_documents(id) ON DELETE CASCADE,
        title TEXT,
        content TEXT,
        version_number INT DEFAULT 1,
        user_id UUID DEFAULT '${DEFAULT_USER}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE public.canvas_versions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '${DEFAULT_USER}'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_canvas_versions_doc ON public.canvas_versions(document_id)`);
    console.log(`  ✓ public.canvas_versions`);

    console.log('\n✅ All tables fixed successfully');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
