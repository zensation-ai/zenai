-- ===========================================
-- Supabase Setup Script for Personal AI
-- ===========================================
-- Copy and paste this into Supabase SQL Editor
-- Then run it to create the complete database schema

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default personal company
INSERT INTO companies (id, name, description)
VALUES ('personal', 'Persönlich', 'Persönliche Gedanken und Ideen')
ON CONFLICT (id) DO NOTHING;

-- 3. Create ideas table (main table)
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('idea', 'task', 'insight', 'problem', 'question')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('business', 'technical', 'personal', 'learning')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  summary TEXT,
  next_steps JSONB DEFAULT '[]',
  context_needed JSONB DEFAULT '[]',
  keywords JSONB DEFAULT '[]',
  raw_transcript TEXT,
  embedding vector(768),
  embedding_int8 JSONB,
  embedding_binary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  company_id VARCHAR(100) DEFAULT 'personal' REFERENCES companies(id),
  viewed_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  context VARCHAR(50) DEFAULT 'personal'
);

-- 4. Create idea_relations table (Knowledge Graph)
CREATE TABLE IF NOT EXISTS idea_relations (
  id SERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  relation_type VARCHAR(50) NOT NULL CHECK (
    relation_type IN ('similar_to', 'builds_on', 'contradicts', 'supports', 'enables', 'part_of', 'related_tech')
  ),
  strength FLOAT NOT NULL CHECK (strength >= 0 AND strength <= 1),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_id, target_id, relation_type)
);

-- 5. Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL DEFAULT 'personal' REFERENCES companies(id),
  title VARCHAR(255) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER,
  participants JSONB DEFAULT '[]',
  location VARCHAR(255),
  meeting_type VARCHAR(50) CHECK (meeting_type IN ('internal', 'external', 'one_on_one', 'team', 'client', 'other')),
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create meeting_notes table
CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  raw_transcript TEXT,
  structured_summary TEXT,
  key_decisions JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  topics_discussed JSONB DEFAULT '[]',
  follow_ups JSONB DEFAULT '[]',
  sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  embedding vector(768),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create user_profile table
CREATE TABLE IF NOT EXISTS user_profile (
  id VARCHAR(100) PRIMARY KEY DEFAULT 'default',
  preferred_categories JSONB DEFAULT '{}',
  preferred_types JSONB DEFAULT '{}',
  topic_interests JSONB DEFAULT '{}',
  active_hours JSONB DEFAULT '{}',
  productivity_patterns JSONB DEFAULT '{}',
  total_ideas INTEGER DEFAULT 0,
  total_meetings INTEGER DEFAULT 0,
  avg_ideas_per_day FLOAT DEFAULT 0,
  priority_keywords JSONB DEFAULT '{"high": [], "medium": [], "low": []}',
  auto_priority_enabled BOOLEAN DEFAULT FALSE,
  interest_embedding vector(768),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO user_profile (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 8. Create user_interactions table
CREATE TABLE IF NOT EXISTS user_interactions (
  id SERIAL PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL CHECK (
    interaction_type IN ('view', 'edit', 'archive', 'prioritize', 'share', 'search', 'relate')
  ),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Create voice_memos table
CREATE TABLE IF NOT EXISTS voice_memos (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) DEFAULT 'personal' REFERENCES companies(id),
  file_path VARCHAR(500),
  file_size INTEGER,
  duration_seconds INTEGER,
  transcription TEXT,
  processing_status VARCHAR(20) DEFAULT 'pending' CHECK (
    processing_status IN ('pending', 'processing', 'completed', 'failed')
  ),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Create media_items table
CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'audio', 'video', 'document', 'other')),
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Create user_training table
CREATE TABLE IF NOT EXISTS user_training (
  id SERIAL PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  original_priority VARCHAR(20),
  user_priority VARCHAR(20),
  features JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Create thought_clusters table
CREATE TABLE IF NOT EXISTS thought_clusters (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) DEFAULT 'personal' REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  centroid_embedding vector(768),
  idea_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Create loose_thoughts table
CREATE TABLE IF NOT EXISTS loose_thoughts (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) DEFAULT 'personal' REFERENCES companies(id),
  raw_text TEXT NOT NULL,
  embedding vector(768),
  cluster_id UUID REFERENCES thought_clusters(id) ON DELETE SET NULL,
  merged_into_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  is_merged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(10) NOT NULL,
  scopes JSONB DEFAULT '[]',
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Create oauth_tokens table
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL REFERENCES companies(id),
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('microsoft', 'google', 'slack', 'github', 'other')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  scope VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL REFERENCES companies(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('slack', 'microsoft', 'google', 'github', 'custom')),
  name VARCHAR(255) NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. Create webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL REFERENCES companies(id),
  url VARCHAR(500) NOT NULL,
  events JSONB DEFAULT '[]',
  secret VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 18. Create webhook_deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 19. Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL REFERENCES companies(id),
  external_id VARCHAR(255),
  provider VARCHAR(50) CHECK (provider IN ('microsoft', 'google', 'manual')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  location VARCHAR(255),
  attendees JSONB DEFAULT '[]',
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 20. Create slack_messages table
CREATE TABLE IF NOT EXISTS slack_messages (
  id UUID PRIMARY KEY,
  company_id VARCHAR(100) NOT NULL REFERENCES companies(id),
  channel_id VARCHAR(100) NOT NULL,
  channel_name VARCHAR(255),
  user_id VARCHAR(100),
  user_name VARCHAR(255),
  message_text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  thread_ts VARCHAR(50),
  embedding vector(768),
  related_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- Create Indexes for Performance
-- ===========================================

-- Vector similarity search indexes (using HNSW)
CREATE INDEX IF NOT EXISTS idx_ideas_embedding ON ideas USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_embedding ON meeting_notes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_user_profile_interest_embedding ON user_profile USING hnsw (interest_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_embedding ON loose_thoughts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_slack_messages_embedding ON slack_messages USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_thought_clusters_centroid ON thought_clusters USING hnsw (centroid_embedding vector_cosine_ops);

-- Regular indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ideas_context ON ideas(context);
CREATE INDEX IF NOT EXISTS idx_ideas_company_id ON ideas(company_id);
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
CREATE INDEX IF NOT EXISTS idx_ideas_type ON ideas(type);
CREATE INDEX IF NOT EXISTS idx_ideas_priority ON ideas(priority);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_archived ON ideas(is_archived) WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_idea_relations_source ON idea_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_idea_relations_target ON idea_relations(target_id);

CREATE INDEX IF NOT EXISTS idx_meetings_company_id ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_idea ON user_interactions(idea_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_type ON user_interactions(interaction_type);

CREATE INDEX IF NOT EXISTS idx_voice_memos_company_id ON voice_memos(company_id);
CREATE INDEX IF NOT EXISTS idx_voice_memos_status ON voice_memos(processing_status);

CREATE INDEX IF NOT EXISTS idx_loose_thoughts_cluster ON loose_thoughts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_merged ON loose_thoughts(is_merged);

CREATE INDEX IF NOT EXISTS idx_slack_messages_channel ON slack_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_slack_messages_timestamp ON slack_messages(timestamp DESC);

-- ===========================================
-- Create Semantic Search Functions
-- ===========================================

CREATE OR REPLACE FUNCTION search_ideas_by_embedding(
  query_embedding vector(768),
  query_context VARCHAR(50) DEFAULT 'personal',
  match_threshold FLOAT DEFAULT 0.5,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(255),
  summary TEXT,
  type VARCHAR(50),
  category VARCHAR(50),
  priority VARCHAR(20),
  similarity FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.title,
    i.summary,
    i.type,
    i.category,
    i.priority,
    1 - (i.embedding <=> query_embedding) as similarity,
    i.created_at
  FROM ideas i
  WHERE i.context = query_context
    AND i.embedding IS NOT NULL
    AND 1 - (i.embedding <=> query_embedding) > match_threshold
    AND i.is_archived = FALSE
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_ideas(
  target_id UUID,
  query_context VARCHAR(50) DEFAULT 'personal',
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(255),
  summary TEXT,
  type VARCHAR(50),
  category VARCHAR(50),
  priority VARCHAR(20),
  similarity FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  target_embedding vector(768);
BEGIN
  SELECT embedding INTO target_embedding
  FROM ideas
  WHERE ideas.id = target_id;

  IF target_embedding IS NULL THEN
    RAISE EXCEPTION 'Idea not found or has no embedding';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.title,
    i.summary,
    i.type,
    i.category,
    i.priority,
    1 - (i.embedding <=> target_embedding) as similarity,
    i.created_at
  FROM ideas i
  WHERE i.context = query_context
    AND i.id != target_id
    AND i.embedding IS NOT NULL
    AND i.is_archived = FALSE
  ORDER BY i.embedding <=> target_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_idea_recommendations(
  user_context VARCHAR(50) DEFAULT 'personal',
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(255),
  summary TEXT,
  type VARCHAR(50),
  category VARCHAR(50),
  priority VARCHAR(20),
  relevance_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  user_interest_embedding vector(768);
BEGIN
  -- Get user's interest embedding from profile
  SELECT interest_embedding INTO user_interest_embedding
  FROM user_profile
  WHERE user_profile.id = 'default'
  LIMIT 1;

  -- If no user embedding, return recent ideas
  IF user_interest_embedding IS NULL THEN
    RETURN QUERY
    SELECT
      i.id,
      i.title,
      i.summary,
      i.type,
      i.category,
      i.priority,
      0.0::FLOAT as relevance_score,
      i.created_at
    FROM ideas i
    WHERE i.context = user_context
      AND i.is_archived = FALSE
    ORDER BY i.created_at DESC
    LIMIT match_count;
  ELSE
    -- Return ideas similar to user interests
    RETURN QUERY
    SELECT
      i.id,
      i.title,
      i.summary,
      i.type,
      i.category,
      i.priority,
      1 - (i.embedding <=> user_interest_embedding) as relevance_score,
      i.created_at
    FROM ideas i
    WHERE i.context = user_context
      AND i.embedding IS NOT NULL
      AND i.is_archived = FALSE
    ORDER BY i.embedding <=> user_interest_embedding
    LIMIT match_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- Success Message
-- ===========================================

SELECT '✅ Supabase setup complete! All tables, indexes, and functions created.' as message;
