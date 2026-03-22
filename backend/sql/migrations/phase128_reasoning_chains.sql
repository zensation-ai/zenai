-- Phase 128: Chain-of-Thought Persistence + Inference Engine
-- Creates reasoning_chains and inferred_facts per schema (personal, work, learning, creative)

DO $$ DECLARE schema_name TEXT; BEGIN FOREACH schema_name IN ARRAY ARRAY['personal','work','learning','creative'] LOOP

  -- reasoning_chains: persistent reasoning chains (full thought process, not just conclusions)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.reasoning_chains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      query TEXT NOT NULL,
      query_embedding vector(1536),
      steps JSONB NOT NULL DEFAULT ''[]'',
      conclusion TEXT,
      confidence FLOAT DEFAULT 0.5,
      domain VARCHAR(50),
      used_facts UUID[] DEFAULT ''{}'',
      used_tools TEXT[] DEFAULT ''{}'',
      user_feedback SMALLINT,
      reusable BOOLEAN DEFAULT false,
      reuse_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.reasoning_chains USING hnsw (query_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)',
    'idx_' || schema_name || '_chains_embedding', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.reasoning_chains(domain)',
    'idx_' || schema_name || '_chains_domain', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.reasoning_chains(reusable) WHERE reusable = true',
    'idx_' || schema_name || '_chains_reusable', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.reasoning_chains(user_id)',
    'idx_' || schema_name || '_chains_user', schema_name);

  -- inferred_facts: facts derived by the inference engine (not directly from user input)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inferred_facts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,
      inference_type VARCHAR(30) NOT NULL,
      source_fact_ids UUID[] NOT NULL,
      confidence FLOAT DEFAULT 0.3,
      reasoning TEXT,
      verified BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.inferred_facts(inference_type)',
    'idx_' || schema_name || '_inferred_type', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.inferred_facts USING GIN(source_fact_ids)',
    'idx_' || schema_name || '_inferred_sources', schema_name);

END LOOP; END $$;
