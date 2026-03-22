-- Phase 139-140: Integration + Self-Improvement
-- Pipeline execution history + improvement action log

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Pipeline execution log: post-response pipeline runs
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.pipeline_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        total_duration_ms INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        step_results JSONB DEFAULT ''[]''::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Improvement actions: self-improvement action log
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.improvement_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        risk_level TEXT DEFAULT ''low'',
        requires_approval BOOLEAN DEFAULT false,
        estimated_impact FLOAT DEFAULT 0,
        basis TEXT[] DEFAULT ''{}''::TEXT[],
        status TEXT DEFAULT ''pending'',
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_pipeline_exec_created ON %I.pipeline_executions (created_at DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_improvement_actions_type ON %I.improvement_actions (type)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_improvement_actions_status ON %I.improvement_actions (status)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_improvement_actions_created ON %I.improvement_actions (created_at DESC)', schema_name, schema_name);
  END LOOP;
END $$;
