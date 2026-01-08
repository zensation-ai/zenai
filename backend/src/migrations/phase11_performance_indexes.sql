-- Phase 11: Performance Optimization Indexes
-- Run this migration on both personal_ai and work_ai databases

-- ===========================================
-- Ideas Table Indexes
-- ===========================================

-- Composite index for common list queries (type, category, priority filters)
CREATE INDEX IF NOT EXISTS idx_ideas_list_filters
ON ideas (is_archived, type, category, priority, created_at DESC);

-- Index for semantic search (embedding vector)
-- Note: ivfflat index for faster approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_ideas_embedding_ivfflat
ON ideas USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for text search
CREATE INDEX IF NOT EXISTS idx_ideas_title_gin
ON ideas USING gin (to_tsvector('german', title));

CREATE INDEX IF NOT EXISTS idx_ideas_content_gin
ON ideas USING gin (to_tsvector('german', COALESCE(content, '')));

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_ideas_created_at
ON ideas (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ideas_updated_at
ON ideas (updated_at DESC);

-- Index for favorites and archived filtering
CREATE INDEX IF NOT EXISTS idx_ideas_favorite
ON ideas (is_favorite) WHERE is_favorite = true;

-- ===========================================
-- API Keys Table Indexes
-- ===========================================

-- Index for prefix-based lookup (Phase 9 bcrypt optimization)
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
ON api_keys (prefix) WHERE is_active = true;

-- Index for expiration checks
CREATE INDEX IF NOT EXISTS idx_api_keys_expires
ON api_keys (expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- ===========================================
-- Rate Limits Table Indexes
-- ===========================================

-- Index for rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
ON rate_limits (key, window_start DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
ON rate_limits (window_start);

-- ===========================================
-- Loose Thoughts Table Indexes (Incubator)
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_loose_thoughts_user_status
ON loose_thoughts (user_id, processed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loose_thoughts_cluster
ON loose_thoughts (cluster_id) WHERE cluster_id IS NOT NULL;

-- ===========================================
-- Thought Clusters Table Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_thought_clusters_status
ON thought_clusters (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_thought_clusters_ready
ON thought_clusters (status) WHERE status = 'ready';

-- ===========================================
-- Training Data Table Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_training_data_idea
ON training_data (idea_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_data_type
ON training_data (training_type, created_at DESC);

-- ===========================================
-- Media Table Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_media_idea
ON media (idea_id) WHERE idea_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_type
ON media (media_type, created_at DESC);

-- ===========================================
-- Analyze Tables (Update Statistics)
-- ===========================================

ANALYZE ideas;
ANALYZE api_keys;
ANALYZE rate_limits;
ANALYZE loose_thoughts;
ANALYZE thought_clusters;
ANALYZE training_data;
