-- Phase 8: Advanced Knowledge Graph Migration
-- Run on BOTH personal_ai AND work_ai databases
-- Usage:
--   docker exec ai-brain-postgres psql -U postgres -d personal_ai -f /path/to/phase_8_knowledge_graph.sql
--   docker exec ai-brain-postgres psql -U postgres -d work_ai -f /path/to/phase_8_knowledge_graph.sql

-- ============================================
-- 1. Create idea_topics table (Topic/Cluster)
-- ============================================
CREATE TABLE IF NOT EXISTS idea_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) DEFAULT 'personal' CHECK (context IN ('personal', 'work', 'creative', 'strategic')),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#60a5fa',
    icon VARCHAR(10) DEFAULT '📁',
    centroid_embedding vector(768),
    idea_count INTEGER DEFAULT 0,
    is_auto_generated BOOLEAN DEFAULT TRUE,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_topics_context ON idea_topics(context);
CREATE INDEX IF NOT EXISTS idx_idea_topics_name ON idea_topics(name);
CREATE INDEX IF NOT EXISTS idx_idea_topics_created_at ON idea_topics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_topics_centroid ON idea_topics USING hnsw (centroid_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE idea_topics IS 'Automatically generated topic clusters based on idea embeddings';
COMMENT ON COLUMN idea_topics.centroid_embedding IS 'Average embedding of all ideas in this topic cluster';
COMMENT ON COLUMN idea_topics.confidence_score IS 'Clustering confidence 0-1, higher means tighter cluster';

-- ============================================
-- 2. Create idea_topic_memberships table (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS idea_topic_memberships (
    idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES idea_topics(id) ON DELETE CASCADE,
    membership_score FLOAT DEFAULT 1.0 CHECK (membership_score >= 0 AND membership_score <= 1),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (idea_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_memberships_idea ON idea_topic_memberships(idea_id);
CREATE INDEX IF NOT EXISTS idx_topic_memberships_topic ON idea_topic_memberships(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_memberships_primary ON idea_topic_memberships(is_primary) WHERE is_primary = TRUE;

COMMENT ON TABLE idea_topic_memberships IS 'Junction table linking ideas to their topic clusters';
COMMENT ON COLUMN idea_topic_memberships.membership_score IS 'How strongly the idea belongs to this topic (0-1)';
COMMENT ON COLUMN idea_topic_memberships.is_primary IS 'TRUE if this is the primary topic for the idea';

-- ============================================
-- 3. Add primary_topic_id to ideas table
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ideas' AND column_name = 'primary_topic_id'
    ) THEN
        ALTER TABLE ideas ADD COLUMN primary_topic_id UUID REFERENCES idea_topics(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_ideas_primary_topic ON ideas(primary_topic_id);
        RAISE NOTICE 'Added primary_topic_id column to ideas table';
    END IF;
END $$;

-- ============================================
-- 4. Add context to idea_relations if missing
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'context'
    ) THEN
        ALTER TABLE idea_relations ADD COLUMN context VARCHAR(20) DEFAULT 'personal';
        CREATE INDEX IF NOT EXISTS idx_idea_relations_context ON idea_relations(context);
        RAISE NOTICE 'Added context column to idea_relations table';
    END IF;
END $$;

-- ============================================
-- 5. Create graph_layout_cache table (optional performance)
-- ============================================
CREATE TABLE IF NOT EXISTS graph_layout_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL,
    layout_type VARCHAR(50) NOT NULL DEFAULT 'full',
    node_positions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '5 minutes'),
    UNIQUE(context, layout_type)
);

CREATE INDEX IF NOT EXISTS idx_graph_layout_context ON graph_layout_cache(context);
CREATE INDEX IF NOT EXISTS idx_graph_layout_expires ON graph_layout_cache(expires_at);

COMMENT ON TABLE graph_layout_cache IS 'Caches computed graph layouts for performance';

-- ============================================
-- 6. Create helper functions for topic clustering
-- ============================================

-- Function to get topic statistics
CREATE OR REPLACE FUNCTION get_topic_stats(p_context VARCHAR DEFAULT 'personal')
RETURNS TABLE (
    topic_id UUID,
    topic_name VARCHAR,
    idea_count BIGINT,
    avg_membership_score FLOAT,
    newest_idea TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id as topic_id,
        t.name::VARCHAR as topic_name,
        COUNT(m.idea_id)::BIGINT as idea_count,
        AVG(m.membership_score)::FLOAT as avg_membership_score,
        MAX(i.created_at) as newest_idea
    FROM idea_topics t
    LEFT JOIN idea_topic_memberships m ON t.id = m.topic_id
    LEFT JOIN ideas i ON m.idea_id = i.id
    WHERE t.context = p_context
    GROUP BY t.id, t.name
    ORDER BY idea_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to find orphaned ideas (no topic)
CREATE OR REPLACE FUNCTION get_orphaned_ideas(p_context VARCHAR DEFAULT 'personal')
RETURNS TABLE (
    idea_id UUID,
    title VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id as idea_id,
        i.title::VARCHAR as title,
        i.created_at
    FROM ideas i
    WHERE i.context = p_context
      AND i.is_archived = FALSE
      AND NOT EXISTS (
          SELECT 1 FROM idea_topic_memberships m WHERE m.idea_id = i.id
      )
    ORDER BY i.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get graph analytics
CREATE OR REPLACE FUNCTION get_graph_analytics(p_context VARCHAR DEFAULT 'personal')
RETURNS TABLE (
    total_ideas BIGINT,
    total_relations BIGINT,
    total_topics BIGINT,
    avg_relations_per_idea FLOAT,
    orphaned_ideas BIGINT,
    most_connected_idea_id UUID
) AS $$
BEGIN
    RETURN QUERY
    WITH idea_counts AS (
        SELECT COUNT(*) as cnt FROM ideas WHERE context = p_context AND is_archived = FALSE
    ),
    relation_counts AS (
        SELECT COUNT(*) as cnt FROM idea_relations WHERE context = p_context
    ),
    topic_counts AS (
        SELECT COUNT(*) as cnt FROM idea_topics WHERE context = p_context
    ),
    orphan_counts AS (
        SELECT COUNT(*) as cnt FROM get_orphaned_ideas(p_context)
    ),
    connection_counts AS (
        SELECT source_id, COUNT(*) as connections
        FROM idea_relations
        WHERE context = p_context
        GROUP BY source_id
        ORDER BY connections DESC
        LIMIT 1
    )
    SELECT
        (SELECT cnt FROM idea_counts)::BIGINT as total_ideas,
        (SELECT cnt FROM relation_counts)::BIGINT as total_relations,
        (SELECT cnt FROM topic_counts)::BIGINT as total_topics,
        CASE
            WHEN (SELECT cnt FROM idea_counts) > 0
            THEN (SELECT cnt FROM relation_counts)::FLOAT / (SELECT cnt FROM idea_counts)::FLOAT
            ELSE 0
        END as avg_relations_per_idea,
        (SELECT cnt FROM orphan_counts)::BIGINT as orphaned_ideas,
        (SELECT source_id FROM connection_counts) as most_connected_idea_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Create triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_idea_topics_updated_at ON idea_topics;
CREATE TRIGGER update_idea_topics_updated_at
    BEFORE UPDATE ON idea_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. Create function to update topic idea_count
-- ============================================
CREATE OR REPLACE FUNCTION update_topic_idea_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE idea_topics SET idea_count = idea_count + 1 WHERE id = NEW.topic_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE idea_topics SET idea_count = idea_count - 1 WHERE id = OLD.topic_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_topic_count ON idea_topic_memberships;
CREATE TRIGGER trigger_update_topic_count
    AFTER INSERT OR DELETE ON idea_topic_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_topic_idea_count();

-- ============================================
-- 9. Verification
-- ============================================
DO $$
DECLARE
    v_idea_topics BOOLEAN;
    v_topic_memberships BOOLEAN;
    v_ideas_topic_id BOOLEAN;
    v_relations_context BOOLEAN;
    v_layout_cache BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'idea_topics'
    ) INTO v_idea_topics;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'idea_topic_memberships'
    ) INTO v_topic_memberships;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ideas' AND column_name = 'primary_topic_id'
    ) INTO v_ideas_topic_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'idea_relations' AND column_name = 'context'
    ) INTO v_relations_context;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'graph_layout_cache'
    ) INTO v_layout_cache;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Phase 8 Migration Verification:';
    RAISE NOTICE '  idea_topics:              %', CASE WHEN v_idea_topics THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  idea_topic_memberships:   %', CASE WHEN v_topic_memberships THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  ideas.primary_topic_id:   %', CASE WHEN v_ideas_topic_id THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  idea_relations.context:   %', CASE WHEN v_relations_context THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  graph_layout_cache:       %', CASE WHEN v_layout_cache THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Phase 8 Knowledge Graph Migration Complete!';
END $$;
