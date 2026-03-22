-- Phase 129: Persistent Agent Loops
-- Creates persistent_agent_tasks per schema (personal, work, learning, creative)

DO $$ DECLARE schema_name TEXT; BEGIN FOREACH schema_name IN ARRAY ARRAY['personal','work','learning','creative'] LOOP

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.persistent_agent_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      goal TEXT NOT NULL,
      plan JSONB NOT NULL DEFAULT ''{}'' ,
      current_step INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT ''planning'',
      results JSONB DEFAULT ''[]'',
      max_steps INTEGER DEFAULT 20,
      max_duration_minutes INTEGER DEFAULT 60,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_activity_at TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.persistent_agent_tasks(user_id)',
    'idx_' || schema_name || '_persistent_tasks_user', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.persistent_agent_tasks(status) WHERE status NOT IN (''completed'', ''failed'')',
    'idx_' || schema_name || '_persistent_tasks_status', schema_name);

END LOOP; END $$;
