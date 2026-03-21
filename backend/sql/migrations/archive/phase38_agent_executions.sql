-- Phase 38: Agent Executions Table
-- Persists multi-agent task execution results for history & "save as idea"

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    EXECUTE format(
      $SQL$
        CREATE TABLE IF NOT EXISTS %I.agent_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id TEXT NOT NULL,
          task_description TEXT NOT NULL,
          strategy TEXT NOT NULL,
          final_output TEXT,
          agent_results JSONB DEFAULT '[]'::jsonb,
          execution_time_ms INTEGER DEFAULT 0,
          tokens JSONB DEFAULT '{"input":0,"output":0}'::jsonb,
          success BOOLEAN DEFAULT false,
          context TEXT NOT NULL DEFAULT 'personal',
          saved_as_idea_id UUID,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_%1$s_agent_exec_context
          ON %1$I.agent_executions (context, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_%1$s_agent_exec_team
          ON %1$I.agent_executions (team_id);
      $SQL$,
      schema_name, schema_name, schema_name
    );

    RAISE NOTICE 'Created agent_executions in schema: %', schema_name;
  END LOOP;
END
$$;
