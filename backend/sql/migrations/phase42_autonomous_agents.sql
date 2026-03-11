-- Phase 42: Autonomous Agent Framework
-- Creates agent_definitions, extends agent_executions, adds agent_action_log
-- Idempotent: safe to run multiple times

DO $$
DECLARE
  schema_name TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH schema_name IN ARRAY schemas LOOP
    -- agent_definitions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.agent_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        instructions TEXT NOT NULL,
        triggers JSONB NOT NULL DEFAULT ''[]''::jsonb,
        tools TEXT[] NOT NULL DEFAULT ''{}''::text[],
        context VARCHAR(20) NOT NULL DEFAULT %L,
        status VARCHAR(20) NOT NULL DEFAULT ''active''
          CHECK (status IN (''active'', ''paused'', ''error'', ''stopped'')),
        approval_required BOOLEAN DEFAULT false,
        max_actions_per_day INTEGER DEFAULT 50,
        token_budget_daily INTEGER DEFAULT 100000,
        template_id VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name, schema_name);

    -- agent_executions (if not exists from earlier orchestrator)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.agent_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_definition_id UUID REFERENCES %I.agent_definitions(id) ON DELETE SET NULL,
        trigger_type VARCHAR(50),
        trigger_data JSONB,
        status VARCHAR(20) NOT NULL DEFAULT ''running''
          CHECK (status IN (''running'', ''completed'', ''failed'', ''pending_approval'', ''rejected'')),
        result TEXT,
        actions_taken JSONB DEFAULT ''[]''::jsonb,
        approval_status VARCHAR(20) DEFAULT ''auto_approved''
          CHECK (approval_status IN (''auto_approved'', ''pending'', ''approved'', ''rejected'')),
        approved_at TIMESTAMPTZ,
        tokens_used INTEGER DEFAULT 0,
        execution_time_ms INTEGER,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )', schema_name, schema_name);

    -- agent_action_log (audit trail)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.agent_action_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES %I.agent_definitions(id) ON DELETE CASCADE,
        execution_id UUID REFERENCES %I.agent_executions(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        action_input JSONB,
        action_output JSONB,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name, schema_name, schema_name);

    -- Indexes
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_agent_def_status ON %I.agent_definitions(status)',
      schema_name, schema_name);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_agent_exec_agent ON %I.agent_executions(agent_definition_id)',
      schema_name, schema_name);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_agent_exec_created ON %I.agent_executions(created_at DESC)',
      schema_name, schema_name);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_agent_log_agent ON %I.agent_action_log(agent_id)',
      schema_name, schema_name);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_agent_log_exec ON %I.agent_action_log(execution_id)',
      schema_name, schema_name);

    RAISE NOTICE 'Schema % — agent tables created', schema_name;
  END LOOP;
END $$;
