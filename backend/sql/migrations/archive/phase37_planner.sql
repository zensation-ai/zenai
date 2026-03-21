-- =====================================================
-- MIGRATION: Phase 37 - Planner (Tasks, Projects, Meeting-Link)
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-12
-- =====================================================
--
-- Creates projects, tasks, and task_dependencies tables
-- across all 4 context schemas (personal, work, learning, creative).
-- Also ensures Phase 35 calendar tables exist and adds meeting_id column.
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
    -- Phase 35 Calendar Tables (idempotent, in case not yet run)
    -- =========================================================

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

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_reminders_pending
        ON %I.calendar_reminders(remind_at) WHERE sent = FALSE', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_reminders_event
        ON %I.calendar_reminders(event_id)', s, s);

    -- =========================================================
    -- Phase 37: Add meeting_id column to calendar_events
    -- =========================================================

    EXECUTE format('
      ALTER TABLE %I.calendar_events
        ADD COLUMN IF NOT EXISTS meeting_id UUID', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_calendar_events_meeting
        ON %I.calendar_events(meeting_id) WHERE meeting_id IS NOT NULL', s, s);

    -- =========================================================
    -- Phase 37: Projects table
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(7) DEFAULT ''#4A90D9'',
        icon VARCHAR(10) DEFAULT ''📁'',
        status VARCHAR(20) DEFAULT ''active''
          CHECK (status IN (''active'', ''on_hold'', ''completed'', ''archived'')),
        context VARCHAR(20) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_projects_status
        ON %I.projects(status) WHERE status != ''archived''', s, s);

    -- =========================================================
    -- Phase 37: Tasks table
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT ''backlog''
          CHECK (status IN (''backlog'', ''todo'', ''in_progress'', ''done'', ''cancelled'')),
        priority VARCHAR(20) DEFAULT ''medium''
          CHECK (priority IN (''low'', ''medium'', ''high'', ''urgent'')),
        project_id UUID REFERENCES %I.projects(id) ON DELETE SET NULL,
        source_idea_id UUID,
        calendar_event_id UUID REFERENCES %I.calendar_events(id) ON DELETE SET NULL,
        due_date TIMESTAMP WITH TIME ZONE,
        start_date TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        assignee VARCHAR(255),
        estimated_hours DECIMAL(6,2),
        actual_hours DECIMAL(6,2),
        sort_order INTEGER DEFAULT 0,
        context VARCHAR(20) NOT NULL,
        labels JSONB DEFAULT ''[]''::jsonb,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_tasks_project
        ON %I.tasks(project_id) WHERE project_id IS NOT NULL', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_tasks_status
        ON %I.tasks(status) WHERE status != ''cancelled''', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_tasks_due_date
        ON %I.tasks(due_date) WHERE due_date IS NOT NULL', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_tasks_calendar_event
        ON %I.tasks(calendar_event_id) WHERE calendar_event_id IS NOT NULL', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_tasks_sort_order
        ON %I.tasks(status, sort_order)', s, s);

    -- =========================================================
    -- Phase 37: Task Dependencies table
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.task_dependencies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES %I.tasks(id) ON DELETE CASCADE,
        depends_on_id UUID NOT NULL REFERENCES %I.tasks(id) ON DELETE CASCADE,
        dependency_type VARCHAR(20) DEFAULT ''finish_to_start''
          CHECK (dependency_type IN (''finish_to_start'', ''start_to_start'', ''finish_to_finish'')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(task_id, depends_on_id)
      )', s, s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_task_deps_task
        ON %I.task_dependencies(task_id)', s, s);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_task_deps_depends_on
        ON %I.task_dependencies(depends_on_id)', s, s);

  END LOOP;
END $$;

-- Add saved_locations to user_preferences if not exists (from Phase 35)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences') THEN
    ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS saved_locations JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
