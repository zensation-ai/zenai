-- Phase 46: Extended Thinking Excellence
-- Creates thinking_chains table for dynamic budget learning and thinking chain persistence
-- Runs across all 4 schemas: personal, work, learning, creative

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- 1. Create thinking_chains table for thinking chain persistence
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.thinking_chains (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(100) NOT NULL,
        context VARCHAR(20) NOT NULL,
        task_type VARCHAR(50) NOT NULL,
        input_hash CHAR(64) NOT NULL,
        input_preview VARCHAR(500),
        thinking_content TEXT NOT NULL,
        thinking_tokens_used INTEGER NOT NULL DEFAULT 0,
        response_quality DECIMAL(3,2),
        feedback_text TEXT,
        feedback_at TIMESTAMPTZ,
        embedding vector(1536),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    ', s);

    -- 2. Create indexes for thinking_chains
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_thinking_chains_context
        ON %I.thinking_chains (context)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_thinking_chains_task_type
        ON %I.thinking_chains (task_type)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_thinking_chains_quality
        ON %I.thinking_chains (response_quality DESC NULLS LAST)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_thinking_chains_created
        ON %I.thinking_chains (created_at DESC)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_thinking_chains_session
        ON %I.thinking_chains (session_id)
    ', s, s);

    -- 3. Create thinking_budget_strategies table for persisting learned strategies
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.thinking_budget_strategies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_type VARCHAR(50) NOT NULL UNIQUE,
        base_tokens INTEGER NOT NULL,
        complexity_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.0,
        min_tokens INTEGER NOT NULL,
        max_tokens INTEGER NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        avg_quality DECIMAL(3,2),
        last_optimized_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    ', s);

    -- 4. Create rag_feedback table for RAG quality feedback (Phase 47)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.rag_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query_id VARCHAR(100),
        query_text TEXT NOT NULL,
        session_id VARCHAR(100),
        result_id VARCHAR(100),
        was_helpful BOOLEAN NOT NULL,
        relevance_rating SMALLINT CHECK (relevance_rating BETWEEN 1 AND 5),
        feedback_text TEXT,
        strategies_used TEXT[],
        confidence DECIMAL(3,2),
        response_time_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    ', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_rag_feedback_created
        ON %I.rag_feedback (created_at DESC)
    ', s, s);

    -- 5. Create rag_query_analytics table for strategy performance tracking (Phase 47)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.rag_query_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query_text TEXT NOT NULL,
        query_type VARCHAR(50),
        strategies_used TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        strategy_selected VARCHAR(50),
        result_count INTEGER NOT NULL DEFAULT 0,
        top_score DECIMAL(4,3),
        avg_score DECIMAL(4,3),
        confidence DECIMAL(3,2),
        response_time_ms INTEGER,
        hyde_used BOOLEAN DEFAULT FALSE,
        cross_encoder_used BOOLEAN DEFAULT FALSE,
        reformulation_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    ', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_rag_analytics_created
        ON %I.rag_query_analytics (created_at DESC)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_rag_analytics_strategy
        ON %I.rag_query_analytics (strategy_selected)
    ', s, s);

    -- 6. Create graph_reasoning_cache table for inference results (Phase 48)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.graph_reasoning_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID NOT NULL,
        target_id UUID NOT NULL,
        inference_type VARCHAR(50) NOT NULL,
        confidence DECIMAL(3,2) NOT NULL,
        reasoning TEXT,
        path_ids UUID[] DEFAULT ARRAY[]::UUID[],
        is_validated BOOLEAN DEFAULT FALSE,
        validated_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL ''7 days'',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(source_id, target_id, inference_type)
      )
    ', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_graph_reasoning_source
        ON %I.graph_reasoning_cache (source_id)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_graph_reasoning_target
        ON %I.graph_reasoning_cache (target_id)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_graph_reasoning_expires
        ON %I.graph_reasoning_cache (expires_at)
    ', s, s);

    -- 7. Create graph_communities table for community detection (Phase 48)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.graph_communities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200),
        description TEXT,
        member_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
        centroid_embedding vector(1536),
        coherence_score DECIMAL(3,2),
        member_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    ', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_graph_communities_updated
        ON %I.graph_communities (updated_at DESC)
    ', s, s);

  END LOOP;
END $$;
