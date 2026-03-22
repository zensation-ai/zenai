-- Phase 135-136: Meta-Cognition
-- Evaluation log + capability profiles + calibration data

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Evaluation log: per-response metacognitive state snapshots
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.evaluation_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        query_text TEXT,
        stated_confidence FLOAT,
        coherence FLOAT,
        conflict_level INTEGER DEFAULT 0,
        knowledge_coverage FLOAT,
        confusion_level TEXT DEFAULT ''low'',
        user_feedback FLOAT,
        domain TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Capability profiles: aggregated per-domain performance
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.capability_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        domain TEXT NOT NULL,
        fact_count INTEGER DEFAULT 0,
        avg_confidence FLOAT DEFAULT 0,
        query_success_rate FLOAT DEFAULT 0,
        total_queries INTEGER DEFAULT 0,
        positive_feedback INTEGER DEFAULT 0,
        last_improvement TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, domain)
      )', schema_name);

    -- Calibration bins: stated confidence vs actual success rate
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.calibration_bins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        bin_lower FLOAT NOT NULL,
        bin_upper FLOAT NOT NULL,
        total_count INTEGER DEFAULT 0,
        positive_count INTEGER DEFAULT 0,
        actual_rate FLOAT DEFAULT 0,
        overconfidence FLOAT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, bin_lower, bin_upper)
      )', schema_name);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_eval_log_created ON %I.evaluation_log (created_at DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_eval_log_domain ON %I.evaluation_log (domain)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_capability_domain ON %I.capability_profiles (domain)', schema_name, schema_name);
  END LOOP;
END $$;
