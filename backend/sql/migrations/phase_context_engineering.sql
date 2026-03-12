-- Phase Context Engineering: Programmatic Context Rules & Performance Tracking
-- Creates context_rules, context_rule_performance in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- =============================================
    -- context_rules: Domain-specific context building rules
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.context_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT %L,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        domain VARCHAR(50) NOT NULL,
        priority INTEGER DEFAULT 50,
        conditions JSONB DEFAULT ''[]'',
        data_sources JSONB NOT NULL,
        context_template TEXT,
        token_budget INTEGER DEFAULT 2000,
        is_active BOOLEAN DEFAULT true,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_context_rules_domain
      ON %I.context_rules(domain, priority DESC, is_active)
    ', schema_name, schema_name);

    -- =============================================
    -- context_rule_performance: Track how well rules perform
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.context_rule_performance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id UUID REFERENCES %I.context_rules(id) ON DELETE CASCADE,
        tokens_used INTEGER,
        retrieval_time_ms INTEGER,
        user_satisfaction INTEGER,
        was_relevant BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_context_rule_perf_rule
      ON %I.context_rule_performance(rule_id, created_at DESC)
    ', schema_name, schema_name);

    RAISE NOTICE 'Context engineering tables created for schema: %', schema_name;
  END LOOP;
END $$;
