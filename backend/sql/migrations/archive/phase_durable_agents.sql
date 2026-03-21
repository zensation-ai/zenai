-- Phase Durable Agents: Checkpoint/Resume + Human-in-the-Loop
-- ALTER agent_executions + CREATE agent_checkpoints in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- =============================================
    -- ALTER agent_executions: Add checkpoint + pause columns
    -- =============================================

    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS checkpoint_state JSONB
    ', schema_name);

    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS checkpoint_step INTEGER DEFAULT 0
    ', schema_name);

    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS checkpoint_at TIMESTAMPTZ
    ', schema_name);

    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS resume_count INTEGER DEFAULT 0
    ', schema_name);

    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ
    ', schema_name);

    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS pause_reason TEXT
    ', schema_name);

    -- Add status column if not exists (for paused/awaiting_input states)
    EXECUTE format('
      ALTER TABLE %I.agent_executions
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT ''running''
    ', schema_name);

    -- =============================================
    -- agent_checkpoints: Granular step-level checkpoints
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.agent_checkpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID NOT NULL,
        step_index INTEGER NOT NULL,
        agent_role VARCHAR(50),
        agent_results JSONB,
        shared_memory_snapshot JSONB,
        pipeline_state JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_agent_checkpoints_exec
      ON %I.agent_checkpoints(execution_id, step_index DESC)
    ', schema_name, schema_name);

    RAISE NOTICE 'Durable agent tables created for schema: %', schema_name;
  END LOOP;
END $$;
