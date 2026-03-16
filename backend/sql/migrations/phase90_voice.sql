-- Phase 90: Advanced Voice — Emotion + Personas
-- Adds emotion tracking to voice_sessions and persona preferences to voice_settings
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Emotion tracking on voice sessions
    EXECUTE format('ALTER TABLE %I.voice_sessions ADD COLUMN IF NOT EXISTS avg_emotion VARCHAR(20)', schema_name);
    EXECUTE format('ALTER TABLE %I.voice_sessions ADD COLUMN IF NOT EXISTS avg_arousal REAL', schema_name);
    EXECUTE format('ALTER TABLE %I.voice_sessions ADD COLUMN IF NOT EXISTS avg_valence REAL', schema_name);
    EXECUTE format('ALTER TABLE %I.voice_sessions ADD COLUMN IF NOT EXISTS emotion_timeline JSONB DEFAULT ''[]''::jsonb', schema_name);

    -- Voice persona preferences
    EXECUTE format('ALTER TABLE %I.voice_settings ADD COLUMN IF NOT EXISTS active_persona_id VARCHAR(100)', schema_name);
    EXECUTE format('ALTER TABLE %I.voice_settings ADD COLUMN IF NOT EXISTS emotion_detection_enabled BOOLEAN DEFAULT true', schema_name);
    EXECUTE format('ALTER TABLE %I.voice_settings ADD COLUMN IF NOT EXISTS adaptive_responses_enabled BOOLEAN DEFAULT true', schema_name);
  END LOOP;
END $$;
