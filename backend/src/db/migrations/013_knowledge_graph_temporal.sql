-- Phase 3: Knowledge Graph Temporal + Auto-Discovery
-- Adds temporal edges, decay mechanics, and auto-discovery infrastructure

-- ============================================
-- 1. Add temporal fields to idea_relations
-- ============================================
DO $$
BEGIN
    -- Add valid_from timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'valid_from'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added valid_from column to idea_relations';
    END IF;

    -- Add valid_until (NULL = still valid)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'valid_until'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN valid_until TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added valid_until column to idea_relations';
    END IF;

    -- Add last_reinforced timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'last_reinforced'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN last_reinforced TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added last_reinforced column to idea_relations';
    END IF;

    -- Add reinforcement_count
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'reinforcement_count'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN reinforcement_count INTEGER DEFAULT 1;
        RAISE NOTICE 'Added reinforcement_count column to idea_relations';
    END IF;

    -- Add discovery_method (manual, llm_analysis, embedding_similarity, co_occurrence, user_action)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'discovery_method'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN discovery_method VARCHAR(50) DEFAULT 'manual';
        RAISE NOTICE 'Added discovery_method column to idea_relations';
    END IF;

    -- Add confidence score for auto-discovered relations
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'confidence'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1);
        RAISE NOTICE 'Added confidence column to idea_relations';
    END IF;

    -- Add current_strength (decayed from original strength)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'current_strength'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN current_strength FLOAT;
        UPDATE idea_relations SET current_strength = strength WHERE current_strength IS NULL;
        ALTER TABLE idea_relations ALTER COLUMN current_strength SET DEFAULT 0.5;
        RAISE NOTICE 'Added current_strength column to idea_relations';
    END IF;
END $$;

-- Create indexes for temporal queries
CREATE INDEX IF NOT EXISTS idx_relations_valid_from ON idea_relations(valid_from);
CREATE INDEX IF NOT EXISTS idx_relations_valid_until ON idea_relations(valid_until) WHERE valid_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_relations_last_reinforced ON idea_relations(last_reinforced);
CREATE INDEX IF NOT EXISTS idx_relations_discovery_method ON idea_relations(discovery_method);

-- ============================================
-- 2. Create relation_history for temporal tracking
-- ============================================
CREATE TABLE IF NOT EXISTS relation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relation_id UUID REFERENCES idea_relations(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    target_id UUID NOT NULL,
    relation_type VARCHAR(50) NOT NULL,
    strength_before FLOAT NOT NULL,
    strength_after FLOAT NOT NULL,
    change_reason VARCHAR(100) NOT NULL, -- 'reinforcement', 'decay', 'manual_update', 'invalidation'
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    changed_by VARCHAR(100) -- 'system', 'user', 'auto_discovery', etc.
);

CREATE INDEX IF NOT EXISTS idx_relation_history_relation ON relation_history(relation_id);
CREATE INDEX IF NOT EXISTS idx_relation_history_changed_at ON relation_history(changed_at DESC);

COMMENT ON TABLE relation_history IS 'Tracks all changes to knowledge graph relations for temporal analysis';

-- ============================================
-- 3. Create auto_discovery_queue for async processing
-- ============================================
CREATE TABLE IF NOT EXISTS auto_discovery_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    context VARCHAR(20) DEFAULT 'personal',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    last_attempt TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_discovery_queue_status ON auto_discovery_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_discovery_queue_priority ON auto_discovery_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_discovery_queue_idea ON auto_discovery_queue(idea_id);

COMMENT ON TABLE auto_discovery_queue IS 'Queue for asynchronous relationship discovery processing';

-- ============================================
-- 4. Create discovered_patterns for learning
-- ============================================
CREATE TABLE IF NOT EXISTS discovered_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) DEFAULT 'personal',
    pattern_type VARCHAR(50) NOT NULL, -- 'co_occurrence', 'semantic_cluster', 'temporal_sequence', 'causal_chain'
    pattern_description TEXT NOT NULL,
    involved_ideas UUID[] NOT NULL,
    pattern_embedding vector(768),
    occurrence_count INTEGER DEFAULT 1,
    confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_patterns_context ON discovered_patterns(context);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON discovered_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_embedding ON discovered_patterns USING hnsw (pattern_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_patterns_active ON discovered_patterns(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE discovered_patterns IS 'Stores learned patterns from knowledge graph for proactive insights';

-- ============================================
-- 5. Create functions for temporal edge operations
-- ============================================

-- Function to apply decay to all relations
CREATE OR REPLACE FUNCTION apply_relation_decay(
    p_decay_rate FLOAT DEFAULT 0.01,  -- Daily decay rate
    p_min_strength FLOAT DEFAULT 0.1   -- Minimum strength before invalidation
)
RETURNS TABLE (
    updated_count INTEGER,
    invalidated_count INTEGER
) AS $$
DECLARE
    v_updated INTEGER := 0;
    v_invalidated INTEGER := 0;
BEGIN
    -- Calculate days since last reinforcement and apply decay
    WITH decayed AS (
        UPDATE idea_relations
        SET current_strength = GREATEST(
            strength * POWER(1 - p_decay_rate, EXTRACT(DAY FROM NOW() - last_reinforced)),
            p_min_strength
        )
        WHERE valid_until IS NULL
          AND current_strength > p_min_strength
          AND last_reinforced < NOW() - INTERVAL '1 day'
        RETURNING id, current_strength
    )
    SELECT COUNT(*) INTO v_updated FROM decayed;

    -- Invalidate relations that fell below minimum
    WITH invalidated AS (
        UPDATE idea_relations
        SET valid_until = NOW(),
            current_strength = 0
        WHERE valid_until IS NULL
          AND current_strength <= p_min_strength
        RETURNING id
    )
    SELECT COUNT(*) INTO v_invalidated FROM invalidated;

    RETURN QUERY SELECT v_updated, v_invalidated;
END;
$$ LANGUAGE plpgsql;

-- Function to reinforce a relation
CREATE OR REPLACE FUNCTION reinforce_relation(
    p_source_id UUID,
    p_target_id UUID,
    p_reinforcement_strength FLOAT DEFAULT 0.1
)
RETURNS FLOAT AS $$
DECLARE
    v_new_strength FLOAT;
    v_old_strength FLOAT;
    v_relation_id UUID;
BEGIN
    -- Get current relation
    SELECT id, current_strength INTO v_relation_id, v_old_strength
    FROM idea_relations
    WHERE source_id = p_source_id AND target_id = p_target_id
      AND valid_until IS NULL
    LIMIT 1;

    IF v_relation_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate new strength (asymptotic approach to 1.0)
    v_new_strength := v_old_strength + (1 - v_old_strength) * p_reinforcement_strength;

    -- Update relation
    UPDATE idea_relations
    SET current_strength = v_new_strength,
        last_reinforced = NOW(),
        reinforcement_count = reinforcement_count + 1
    WHERE id = v_relation_id;

    -- Log history
    INSERT INTO relation_history (relation_id, source_id, target_id, relation_type, strength_before, strength_after, change_reason, changed_by)
    SELECT id, source_id, target_id, relation_type, v_old_strength, v_new_strength, 'reinforcement', 'system'
    FROM idea_relations WHERE id = v_relation_id;

    RETURN v_new_strength;
END;
$$ LANGUAGE plpgsql;

-- Function to get valid relations at a point in time
CREATE OR REPLACE FUNCTION get_relations_at_time(
    p_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_context VARCHAR DEFAULT 'personal',
    p_min_strength FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    source_id UUID,
    target_id UUID,
    relation_type VARCHAR,
    strength FLOAT,
    current_strength FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.source_id,
        r.target_id,
        r.relation_type::VARCHAR,
        r.strength,
        r.current_strength
    FROM idea_relations r
    WHERE r.context = p_context
      AND r.valid_from <= p_timestamp
      AND (r.valid_until IS NULL OR r.valid_until > p_timestamp)
      AND r.current_strength >= p_min_strength
    ORDER BY r.current_strength DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to find potential relations based on embedding similarity
CREATE OR REPLACE FUNCTION find_potential_relations(
    p_idea_id UUID,
    p_similarity_threshold FLOAT DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    target_id UUID,
    target_title VARCHAR,
    similarity FLOAT,
    already_connected BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH idea_embedding AS (
        SELECT embedding FROM ideas WHERE id = p_idea_id
    )
    SELECT
        i.id as target_id,
        i.title::VARCHAR as target_title,
        (1 - (i.embedding <-> ie.embedding))::FLOAT as similarity,
        EXISTS (
            SELECT 1 FROM idea_relations r
            WHERE (r.source_id = p_idea_id AND r.target_id = i.id)
               OR (r.source_id = i.id AND r.target_id = p_idea_id)
        ) as already_connected
    FROM ideas i, idea_embedding ie
    WHERE i.id != p_idea_id
      AND i.embedding IS NOT NULL
      AND i.is_archived = FALSE
      AND (1 - (i.embedding <-> ie.embedding)) >= p_similarity_threshold
    ORDER BY similarity DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. Create materialized view for graph statistics
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_graph_statistics AS
WITH node_degrees AS (
    SELECT
        i.id,
        i.context,
        COUNT(DISTINCT r1.id) as out_degree,
        COUNT(DISTINCT r2.id) as in_degree,
        COUNT(DISTINCT r1.id) + COUNT(DISTINCT r2.id) as total_degree
    FROM ideas i
    LEFT JOIN idea_relations r1 ON r1.source_id = i.id AND r1.valid_until IS NULL
    LEFT JOIN idea_relations r2 ON r2.target_id = i.id AND r2.valid_until IS NULL
    WHERE i.is_archived = FALSE
    GROUP BY i.id, i.context
)
SELECT
    context,
    COUNT(*) as total_nodes,
    SUM(total_degree)::BIGINT as total_edges,
    AVG(total_degree)::FLOAT as avg_degree,
    MAX(total_degree)::INTEGER as max_degree,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_degree)::FLOAT as median_degree,
    COUNT(*) FILTER (WHERE total_degree = 0)::INTEGER as isolated_nodes,
    NOW() as computed_at
FROM node_degrees
GROUP BY context;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_graph_stats_context ON mv_graph_statistics(context);

-- Function to refresh statistics
CREATE OR REPLACE FUNCTION refresh_graph_statistics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_graph_statistics;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Verification
-- ============================================
DO $$
DECLARE
    v_temporal_cols BOOLEAN;
    v_history_table BOOLEAN;
    v_queue_table BOOLEAN;
    v_patterns_table BOOLEAN;
    v_mv_stats BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'valid_from'
    ) INTO v_temporal_cols;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'relation_history'
    ) INTO v_history_table;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'auto_discovery_queue'
    ) INTO v_queue_table;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'discovered_patterns'
    ) INTO v_patterns_table;

    SELECT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE matviewname = 'mv_graph_statistics'
    ) INTO v_mv_stats;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Phase 3 Migration Verification:';
    RAISE NOTICE '  Temporal columns:          %', CASE WHEN v_temporal_cols THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  relation_history:          %', CASE WHEN v_history_table THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  auto_discovery_queue:      %', CASE WHEN v_queue_table THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  discovered_patterns:       %', CASE WHEN v_patterns_table THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  mv_graph_statistics:       %', CASE WHEN v_mv_stats THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Phase 3 Knowledge Graph Temporal Migration Complete!';
END $$;
