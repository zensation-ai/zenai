-- Phase 95: Semantic Search 2.0 — Universal Cross-Feature Search
-- Creates search_history table in all 4 schemas

-- Personal
CREATE TABLE IF NOT EXISTS personal.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  selected_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_personal_search_history_user ON personal.search_history(user_id, created_at DESC);

-- Work
CREATE TABLE IF NOT EXISTS work.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  selected_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_search_history_user ON work.search_history(user_id, created_at DESC);

-- Learning
CREATE TABLE IF NOT EXISTS learning.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  selected_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_search_history_user ON learning.search_history(user_id, created_at DESC);

-- Creative
CREATE TABLE IF NOT EXISTS creative.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  selected_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creative_search_history_user ON creative.search_history(user_id, created_at DESC);
