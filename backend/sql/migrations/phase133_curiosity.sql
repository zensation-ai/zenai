-- Phase 133: Artificial Curiosity Engine
-- Knowledge Gaps + Hypotheses tables in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Knowledge Gaps: detected areas where the system lacks knowledge
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.knowledge_gaps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        topic TEXT NOT NULL,
        domain TEXT NOT NULL,
        query_count INTEGER DEFAULT 0,
        fact_count INTEGER DEFAULT 0,
        avg_confidence FLOAT DEFAULT 0,
        avg_rag_score FLOAT DEFAULT 0,
        gap_score FLOAT DEFAULT 0,
        suggested_action TEXT DEFAULT ''monitor'',
        status TEXT DEFAULT ''active'',
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Hypotheses: system-generated hypotheses from graph patterns
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.hypotheses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        hypothesis TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_entities TEXT[] DEFAULT ''{}''::TEXT[],
        confidence FLOAT DEFAULT 0.5,
        status TEXT DEFAULT ''pending'',
        verified_at TIMESTAMPTZ,
        verification_result TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Information gain events: track surprise/novelty over time
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.information_gain_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        query_text TEXT,
        topic TEXT,
        surprise_score FLOAT DEFAULT 0,
        novelty_score FLOAT DEFAULT 0,
        information_gain FLOAT DEFAULT 0,
        retrieved_count INTEGER DEFAULT 0,
        novel_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_knowledge_gaps_score ON %I.knowledge_gaps (gap_score DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_knowledge_gaps_status ON %I.knowledge_gaps (status)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_hypotheses_status ON %I.hypotheses (status)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_ig_events_created ON %I.information_gain_events (created_at DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_ig_events_topic ON %I.information_gain_events (topic)', schema_name, schema_name);
  END LOOP;
END $$;
