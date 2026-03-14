-- Phase 57: Real-Time Voice Pipeline
-- Creates voice_sessions and voice_settings tables in all 4 schemas
-- Idempotent: uses IF NOT EXISTS

DO $$
DECLARE
  schema_name TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH schema_name IN ARRAY schemas
  LOOP
    -- voice_sessions: tracks voice conversation sessions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.voice_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_session_id UUID,
        status VARCHAR(20) DEFAULT ''active'' CHECK (status IN (''active'', ''paused'', ''ended'')),
        stt_provider VARCHAR(50) DEFAULT ''whisper'',
        tts_provider VARCHAR(50) DEFAULT ''edge-tts'',
        tts_voice VARCHAR(100) DEFAULT ''de-DE-ConradNeural'',
        language VARCHAR(10) DEFAULT ''de-DE'',
        total_audio_duration_ms INTEGER DEFAULT 0,
        total_tokens_used INTEGER DEFAULT 0,
        turn_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT ''{}''::jsonb,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- voice_settings: per-user voice preferences
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.voice_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stt_provider VARCHAR(50) DEFAULT ''whisper'',
        tts_provider VARCHAR(50) DEFAULT ''edge-tts'',
        tts_voice VARCHAR(100) DEFAULT ''de-DE-ConradNeural'',
        language VARCHAR(10) DEFAULT ''de-DE'',
        vad_sensitivity FLOAT DEFAULT 0.5 CHECK (vad_sensitivity BETWEEN 0 AND 1),
        silence_threshold_ms INTEGER DEFAULT 1500,
        auto_send BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    RAISE NOTICE 'Phase 57: Created voice tables in schema %', schema_name;
  END LOOP;
END $$;
