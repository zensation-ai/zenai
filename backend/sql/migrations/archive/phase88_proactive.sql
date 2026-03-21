-- Phase 88: Intelligent Proactive Engine
-- Tables: habit_patterns, habit_activities, focus_sessions in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Habit patterns (detected behavioral patterns)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.habit_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT ''00000000-0000-0000-0000-000000000001'',
        pattern_type VARCHAR(30) NOT NULL CHECK (pattern_type IN (''routine'', ''productivity'', ''break'')),
        description TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.0 CHECK (confidence BETWEEN 0 AND 1),
        data JSONB DEFAULT ''{}''::jsonb,
        detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status VARCHAR(20) NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''dismissed'', ''expired'')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_%1$s_habit_patterns_user
        ON %1$I.habit_patterns(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_%1$s_habit_patterns_type
        ON %1$I.habit_patterns(pattern_type)
        WHERE status = ''active'';
    ', schema_name);

    -- Habit activities (user action log for pattern detection)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.habit_activities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT ''00000000-0000-0000-0000-000000000001'',
        activity_type VARCHAR(50) NOT NULL,
        page VARCHAR(100),
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_%1$s_habit_activities_user_time
        ON %1$I.habit_activities(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_%1$s_habit_activities_type
        ON %1$I.habit_activities(activity_type, created_at DESC);
    ', schema_name);

    -- Focus sessions (focus mode state)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.focus_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT ''00000000-0000-0000-0000-000000000001'',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMPTZ,
        duration_minutes INTEGER NOT NULL DEFAULT 25,
        active_task_id UUID,
        status VARCHAR(20) NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''completed'', ''cancelled'')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_%1$s_focus_sessions_user_status
        ON %1$I.focus_sessions(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_%1$s_focus_sessions_active
        ON %1$I.focus_sessions(user_id)
        WHERE status = ''active'';
    ', schema_name);

    RAISE NOTICE 'Phase 88 tables created for schema: %', schema_name;
  END LOOP;
END $$;
