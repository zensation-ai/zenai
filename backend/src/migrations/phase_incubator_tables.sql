-- Phase Incubator Tables Migration
-- KRITISCH: Diese Tabellen fehlen für das Thought-Incubator System
-- Run on BOTH personal_ai AND work_ai databases
-- Usage:
--   docker exec ai-brain-postgres psql -U postgres -d personal_ai -f /path/to/phase_incubator_tables.sql
--   docker exec ai-brain-postgres psql -U postgres -d work_ai -f /path/to/phase_incubator_tables.sql

-- ============================================
-- 1. Create loose_thoughts table
-- ============================================
CREATE TABLE IF NOT EXISTS loose_thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    raw_input TEXT NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice', 'quick_jot')),
    user_tags JSONB DEFAULT '[]',
    embedding vector(768),
    cluster_id UUID,
    similarity_to_cluster FLOAT,
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loose_thoughts_user_id ON loose_thoughts(user_id);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_cluster_id ON loose_thoughts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_is_processed ON loose_thoughts(is_processed);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_created_at ON loose_thoughts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_embedding ON loose_thoughts USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE loose_thoughts IS 'Stores unstructured thoughts that incubate before becoming structured ideas';
COMMENT ON COLUMN loose_thoughts.cluster_id IS 'Reference to thought_clusters when thought is assigned to a cluster';
COMMENT ON COLUMN loose_thoughts.similarity_to_cluster IS 'Cosine similarity score to the cluster centroid (0-1)';

-- ============================================
-- 2. Create thought_clusters table
-- ============================================
CREATE TABLE IF NOT EXISTS thought_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    title VARCHAR(255),
    summary TEXT,
    suggested_type VARCHAR(50),
    suggested_category VARCHAR(50),
    centroid_embedding vector(768),
    thought_count INTEGER DEFAULT 0,
    confidence_score FLOAT DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    maturity_score FLOAT DEFAULT 0 CHECK (maturity_score >= 0 AND maturity_score <= 1),
    status VARCHAR(20) DEFAULT 'growing' CHECK (status IN ('growing', 'ready', 'presented', 'consolidated', 'dismissed')),
    consolidated_idea_id UUID,
    presented_at TIMESTAMP WITH TIME ZONE,
    consolidated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thought_clusters_user_id ON thought_clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_thought_clusters_status ON thought_clusters(status);
CREATE INDEX IF NOT EXISTS idx_thought_clusters_maturity ON thought_clusters(maturity_score DESC);
CREATE INDEX IF NOT EXISTS idx_thought_clusters_created_at ON thought_clusters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thought_clusters_centroid ON thought_clusters USING hnsw (centroid_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE thought_clusters IS 'Groups of related loose thoughts that form emerging patterns';
COMMENT ON COLUMN thought_clusters.maturity_score IS 'Score 0-1 indicating how ready the cluster is to become a structured idea';
COMMENT ON COLUMN thought_clusters.status IS 'growing: accumulating thoughts, ready: can be presented, presented: shown to user, consolidated: became idea, dismissed: user rejected';

-- ============================================
-- 3. Create cluster_analysis_log table
-- ============================================
CREATE TABLE IF NOT EXISTS cluster_analysis_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type VARCHAR(20) NOT NULL CHECK (run_type IN ('on_input', 'scheduled', 'manual')),
    thoughts_analyzed INTEGER DEFAULT 0,
    clusters_created INTEGER DEFAULT 0,
    clusters_updated INTEGER DEFAULT 0,
    clusters_ready INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_analysis_log_created_at ON cluster_analysis_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_analysis_log_run_type ON cluster_analysis_log(run_type);

COMMENT ON TABLE cluster_analysis_log IS 'Logs cluster analysis runs for monitoring and debugging';

-- ============================================
-- 4. Create interaction_history table (for Learning Engine)
-- ============================================
CREATE TABLE IF NOT EXISTS interaction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('view', 'edit', 'prioritize', 'archive', 'share', 'complete')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_history_user_id ON interaction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_history_idea_id ON interaction_history(idea_id);
CREATE INDEX IF NOT EXISTS idx_interaction_history_type ON interaction_history(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interaction_history_created_at ON interaction_history(created_at DESC);

COMMENT ON TABLE interaction_history IS 'Tracks user interactions with ideas for learning and recommendations';

-- ============================================
-- 5. Create pattern_predictions table (for Learning Engine)
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    pattern_type VARCHAR(50) NOT NULL,
    pattern_data JSONB NOT NULL DEFAULT '{}',
    confidence FLOAT DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
    sample_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_predictions_user_id ON pattern_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_pattern_predictions_type ON pattern_predictions(pattern_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_predictions_unique ON pattern_predictions(user_id, pattern_type);

COMMENT ON TABLE pattern_predictions IS 'Stores learned patterns for category, priority, and type predictions';

-- ============================================
-- 6. Add foreign key from loose_thoughts to thought_clusters
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_loose_thoughts_cluster'
    ) THEN
        ALTER TABLE loose_thoughts
        ADD CONSTRAINT fk_loose_thoughts_cluster
        FOREIGN KEY (cluster_id) REFERENCES thought_clusters(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- 7. Add foreign key from thought_clusters to ideas
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_thought_clusters_idea'
    ) THEN
        ALTER TABLE thought_clusters
        ADD CONSTRAINT fk_thought_clusters_idea
        FOREIGN KEY (consolidated_idea_id) REFERENCES ideas(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- 8. Create triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_loose_thoughts_updated_at ON loose_thoughts;
CREATE TRIGGER update_loose_thoughts_updated_at
    BEFORE UPDATE ON loose_thoughts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_thought_clusters_updated_at ON thought_clusters;
CREATE TRIGGER update_thought_clusters_updated_at
    BEFORE UPDATE ON thought_clusters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. Verification
-- ============================================
DO $$
DECLARE
    v_loose_thoughts BOOLEAN;
    v_thought_clusters BOOLEAN;
    v_cluster_analysis_log BOOLEAN;
    v_interaction_history BOOLEAN;
    v_pattern_predictions BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'loose_thoughts'
    ) INTO v_loose_thoughts;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'thought_clusters'
    ) INTO v_thought_clusters;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'cluster_analysis_log'
    ) INTO v_cluster_analysis_log;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'interaction_history'
    ) INTO v_interaction_history;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'pattern_predictions'
    ) INTO v_pattern_predictions;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Incubator Tables Migration Verification:';
    RAISE NOTICE '  loose_thoughts:        %', CASE WHEN v_loose_thoughts THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  thought_clusters:      %', CASE WHEN v_thought_clusters THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  cluster_analysis_log:  %', CASE WHEN v_cluster_analysis_log THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  interaction_history:   %', CASE WHEN v_interaction_history THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  pattern_predictions:   %', CASE WHEN v_pattern_predictions THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Incubator Tables Migration Complete!';
END $$;
