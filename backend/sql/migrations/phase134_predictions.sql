-- Phase 134: Active Inference + Prediction Error
-- Prediction history + user patterns tables in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- User activity patterns: temporal + sequential
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.user_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        pattern_type TEXT NOT NULL,
        time_of_day INTEGER,
        day_of_week INTEGER,
        domain TEXT,
        intent TEXT,
        frequency INTEGER DEFAULT 1,
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Prediction history: what we predicted vs what happened
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.prediction_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        predicted_intent TEXT NOT NULL,
        predicted_domain TEXT,
        predicted_entities TEXT[] DEFAULT ''{}''::TEXT[],
        confidence FLOAT DEFAULT 0.5,
        basis TEXT[] DEFAULT ''{}''::TEXT[],
        actual_intent TEXT,
        actual_domain TEXT,
        error_magnitude FLOAT,
        learning_signal TEXT,
        was_correct BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )', schema_name);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_user_patterns_type ON %I.user_patterns (pattern_type)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_user_patterns_time ON %I.user_patterns (time_of_day, day_of_week)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_prediction_history_created ON %I.prediction_history (created_at DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_prediction_history_correct ON %I.prediction_history (was_correct)', schema_name, schema_name);
  END LOOP;
END $$;
