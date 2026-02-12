-- =====================================================
-- MIGRATION: Phase 35 - AI Calendar System
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-11
-- =====================================================
--
-- Creates calendar_events and calendar_reminders tables
-- across all 4 context schemas (personal, work, learning, creative).
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

    -- 1. calendar_events - Core event table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.calendar_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        event_type VARCHAR(30) NOT NULL DEFAULT ''appointment''
          CHECK (event_type IN (''appointment'', ''reminder'', ''deadline'', ''travel_block'', ''focus_time'')),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        all_day BOOLEAN DEFAULT FALSE,
        location VARCHAR(500),
        participants JSONB DEFAULT ''[]''::jsonb,
        rrule VARCHAR(500),
        recurrence_parent_id UUID,
        recurrence_exception BOOLEAN DEFAULT FALSE,
        source_idea_id UUID,
        source_voice_memo_id UUID,
        travel_duration_minutes INTEGER,
        travel_origin VARCHAR(500),
        travel_destination VARCHAR(500),
        status VARCHAR(20) DEFAULT ''confirmed''
          CHECK (status IN (''tentative'', ''confirmed'', ''cancelled'')),
        color VARCHAR(7),
        context VARCHAR(20) NOT NULL,
        reminder_minutes JSONB DEFAULT ''[15]''::jsonb,
        notes TEXT,
        metadata JSONB DEFAULT ''{}''::jsonb,
        ai_generated BOOLEAN DEFAULT FALSE,
        ai_confidence DECIMAL(3,2),
        embedding vector(768),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- Indexes for calendar_events
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_start
        ON %I.calendar_events(start_time)', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_end
        ON %I.calendar_events(end_time) WHERE end_time IS NOT NULL', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_status
        ON %I.calendar_events(status) WHERE status != ''cancelled''', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_type
        ON %I.calendar_events(event_type)', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_source_idea
        ON %I.calendar_events(source_idea_id) WHERE source_idea_id IS NOT NULL', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_recurrence
        ON %I.calendar_events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL', s, s);

    -- 2. calendar_reminders - Reminder queue
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.calendar_reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES %I.calendar_events(id) ON DELETE CASCADE,
        remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
        type VARCHAR(20) DEFAULT ''push''
          CHECK (type IN (''push'', ''in_app'', ''email'')),
        sent BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP WITH TIME ZONE,
        context VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- Index for pending reminders
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_reminders_pending
        ON %I.calendar_reminders(remind_at) WHERE sent = FALSE', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_reminders_event
        ON %I.calendar_reminders(event_id)', s, s);

  END LOOP;
END $$;

-- Add saved_locations to user_preferences in public schema
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS saved_locations JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_preferences.saved_locations IS
  'Gespeicherte Orte des Nutzers, z.B. [{"label":"Buero","address":"Musterstr. 1, 80333 Muenchen"}]';
