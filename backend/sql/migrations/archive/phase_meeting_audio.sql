-- =====================================================
-- MIGRATION: Meeting Audio Recording & Management
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-13
-- =====================================================
--
-- Creates meetings + meeting_notes tables (idempotent)
-- across all 4 context schemas (personal, work, learning, creative).
-- Adds audio storage columns and full-text search vector.
--
-- Run this in Supabase SQL Editor.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- =========================================================
    -- Meetings table (idempotent)
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.meetings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR(100) DEFAULT ''personal'',
        title VARCHAR(500) NOT NULL,
        date TIMESTAMP WITH TIME ZONE,
        duration_minutes INTEGER,
        participants JSONB DEFAULT ''[]''::jsonb,
        location VARCHAR(500),
        meeting_type VARCHAR(30) DEFAULT ''other''
          CHECK (meeting_type IN (''internal'', ''external'', ''one_on_one'', ''team'', ''client'', ''other'')),
        status VARCHAR(20) DEFAULT ''scheduled''
          CHECK (status IN (''scheduled'', ''in_progress'', ''completed'', ''cancelled'')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_meetings_date
        ON %I.meetings(date DESC)', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_meetings_status
        ON %I.meetings(status)', s, s);

    -- =========================================================
    -- Meeting Notes table (idempotent)
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.meeting_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID NOT NULL REFERENCES %I.meetings(id) ON DELETE CASCADE,
        raw_transcript TEXT,
        structured_summary TEXT,
        key_decisions JSONB DEFAULT ''[]''::jsonb,
        action_items JSONB DEFAULT ''[]''::jsonb,
        topics_discussed JSONB DEFAULT ''[]''::jsonb,
        follow_ups JSONB DEFAULT ''[]''::jsonb,
        sentiment VARCHAR(20) DEFAULT ''neutral''
          CHECK (sentiment IN (''positive'', ''neutral'', ''negative'', ''mixed'')),
        embedding vector(768),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_meeting_notes_meeting
        ON %I.meeting_notes(meeting_id)', s, s);

    -- =========================================================
    -- New columns for audio storage
    -- =========================================================

    EXECUTE format('
      ALTER TABLE %I.meeting_notes
        ADD COLUMN IF NOT EXISTS audio_storage_path TEXT', s);

    EXECUTE format('
      ALTER TABLE %I.meeting_notes
        ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER', s);

    EXECUTE format('
      ALTER TABLE %I.meeting_notes
        ADD COLUMN IF NOT EXISTS audio_size_bytes BIGINT', s);

    EXECUTE format('
      ALTER TABLE %I.meeting_notes
        ADD COLUMN IF NOT EXISTS audio_mime_type VARCHAR(50)', s);

    -- =========================================================
    -- Full-text search vector
    -- =========================================================

    EXECUTE format('
      ALTER TABLE %I.meeting_notes
        ADD COLUMN IF NOT EXISTS search_vector tsvector', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_meeting_notes_search
        ON %I.meeting_notes USING GIN(search_vector)', s, s);

    -- =========================================================
    -- Partial index for audio-only queries
    -- =========================================================

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_meeting_notes_has_audio
        ON %I.meeting_notes(meeting_id)
        WHERE audio_storage_path IS NOT NULL', s, s);

  END LOOP;
END $$;
