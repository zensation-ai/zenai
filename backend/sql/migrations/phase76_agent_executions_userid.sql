-- Phase 76: Add user_id to agent_executions table
-- This was missed in Phase 65 multi-user migration

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Add user_id column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = schema_name
        AND table_name = 'agent_executions'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.agent_executions ADD COLUMN user_id UUID DEFAULT ''00000000-0000-0000-0000-000000000001''',
        schema_name
      );
      RAISE NOTICE 'Added user_id to %.agent_executions', schema_name;
    END IF;

    -- Add index on user_id
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%1$s_agent_exec_user ON %1$I.agent_executions (user_id)',
      schema_name
    );
  END LOOP;
END
$$;
