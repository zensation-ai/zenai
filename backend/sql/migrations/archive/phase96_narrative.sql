-- Phase 96: Business Narrative Tables
-- Creates business_narratives and custom_kpis in all 4 schemas

DO $$
DECLARE
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
  s TEXT;
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    -- business_narratives
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.business_narratives (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        type VARCHAR(20) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        narrative TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT ''{}''::jsonb,
        action_items JSONB DEFAULT ''[]''::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_narratives_type
        ON %I.business_narratives(type, period_start DESC)', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_narratives_user
        ON %I.business_narratives(user_id)', s, s);

    -- custom_kpis
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.custom_kpis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        formula JSONB NOT NULL,
        target_value FLOAT,
        current_value FLOAT,
        unit VARCHAR(50),
        trend VARCHAR(10) DEFAULT ''stable'',
        last_calculated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_kpis_user
        ON %I.custom_kpis(user_id)', s, s);

    RAISE NOTICE 'Phase 96: Created business_narratives + custom_kpis in schema %', s;
  END LOOP;
END $$;
