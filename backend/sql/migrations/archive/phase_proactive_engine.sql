-- Phase 54: Proactive Event Engine
-- Tables: system_events, proactive_rules in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- system_events: Persistent event log
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.system_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT %L,
        event_type VARCHAR(100) NOT NULL,
        event_source VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL DEFAULT ''{}''::jsonb,
        processed BOOLEAN DEFAULT false,
        decision VARCHAR(50),
        decision_reason TEXT,
        processed_by VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        CONSTRAINT system_events_decision_check CHECK (
          decision IS NULL OR decision IN (''ignored'', ''notified'', ''context_prepared'', ''action_taken'')
        )
      )', schema_name, schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_system_events_unprocessed ON %I.system_events (processed, created_at DESC) WHERE processed = false', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_system_events_type ON %I.system_events (event_type, created_at DESC)', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_system_events_created ON %I.system_events (created_at DESC)', schema_name);

    -- proactive_rules: Rules that match events to decisions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT %L,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        event_types TEXT[] NOT NULL,
        conditions JSONB DEFAULT ''[]''::jsonb,
        decision VARCHAR(50) NOT NULL CHECK (
          decision IN (''notify'', ''prepare_context'', ''take_action'', ''trigger_agent'')
        ),
        action_config JSONB NOT NULL DEFAULT ''{}''::jsonb,
        risk_level VARCHAR(20) DEFAULT ''low'' CHECK (
          risk_level IN (''low'', ''medium'', ''high'', ''critical'')
        ),
        requires_approval BOOLEAN DEFAULT false,
        priority INTEGER DEFAULT 50,
        cooldown_minutes INTEGER DEFAULT 60,
        last_triggered_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name, schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_proactive_rules_active ON %I.proactive_rules (is_active, priority DESC) WHERE is_active = true', schema_name);

  END LOOP;
END $$;
