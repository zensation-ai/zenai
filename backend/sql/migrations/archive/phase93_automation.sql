-- Phase 93: Workspace Automation — AI-Driven Workflows
-- Creates workspace_automations and automation_executions tables in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- Workspace Automations
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.workspace_automations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        trigger_type VARCHAR(50) NOT NULL,
        trigger_config JSONB NOT NULL DEFAULT ''{}''::jsonb,
        conditions JSONB DEFAULT ''[]''::jsonb,
        actions JSONB NOT NULL DEFAULT ''[]''::jsonb,
        enabled BOOLEAN DEFAULT true,
        template_id VARCHAR(50),
        last_run_at TIMESTAMPTZ,
        run_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Automation Executions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.automation_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id UUID REFERENCES %I.workspace_automations(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT ''running'',
        trigger_data JSONB,
        results JSONB DEFAULT ''[]''::jsonb,
        error TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )', schema_name, schema_name);

    -- Indexes
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_auto_exec_automation
        ON %I.automation_executions(automation_id, started_at DESC)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_workspace_auto_user
        ON %I.workspace_automations(user_id)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_workspace_auto_enabled
        ON %I.workspace_automations(enabled) WHERE enabled = true
    ', schema_name, schema_name);

  END LOOP;
END $$;
