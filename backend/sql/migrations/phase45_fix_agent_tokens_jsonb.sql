-- Phase 45: Fix agent_executions tokens column type
-- Changes tokens from INTEGER to JSONB to store {input, output} token counts

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Check if column exists and is INTEGER type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = schema_name
        AND table_name = 'agent_executions'
        AND column_name = 'tokens'
        AND data_type = 'integer'
    ) THEN
      -- Convert INTEGER to JSONB
      EXECUTE format(
        $SQL$
          ALTER TABLE %I.agent_executions
            ALTER COLUMN tokens TYPE JSONB
            USING jsonb_build_object('input', COALESCE(tokens, 0), 'output', 0);

          ALTER TABLE %I.agent_executions
            ALTER COLUMN tokens SET DEFAULT '{"input":0,"output":0}'::jsonb;
        $SQL$,
        schema_name, schema_name
      );
      RAISE NOTICE 'Converted tokens to JSONB in schema: %', schema_name;
    ELSE
      RAISE NOTICE 'tokens already JSONB or table missing in schema: %', schema_name;
    END IF;
  END LOOP;
END
$$;
