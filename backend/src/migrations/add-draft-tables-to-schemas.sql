-- Phase 25: Add Draft Tables to Personal and Work Schemas
-- This migration ensures the draft tables exist in both schemas for proper schema isolation.
--
-- Run this in Supabase SQL Editor.
--
-- IMPORTANT: The tables must exist in each schema (not just public) because:
-- 1. search_path is set to the context schema first
-- 2. Foreign keys reference ideas(id) which should be in the same schema
--
-- Execute this migration in Supabase Dashboard → SQL Editor

-- ===========================================
-- Create tables in PERSONAL schema
-- ===========================================

-- Set search path to personal schema
SET search_path TO personal, public;

-- Create idea_drafts table in personal schema
CREATE TABLE IF NOT EXISTS idea_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL DEFAULT 'personal',

  -- Draft metadata
  draft_type VARCHAR(50) NOT NULL,
  trigger_pattern VARCHAR(200),
  trigger_text VARCHAR(500),

  -- Content
  content TEXT NOT NULL,
  word_count INTEGER,
  language VARCHAR(10) DEFAULT 'de',

  -- Related context
  related_idea_ids UUID[],
  research_id UUID,
  profile_snapshot JSONB,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'ready',
  generation_time_ms INTEGER,

  -- User feedback
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,
  edits_made INTEGER DEFAULT 0,
  content_reused_percent INTEGER,

  -- Phase 25.5 additions
  feedback_count INTEGER DEFAULT 0,
  last_feedback_at TIMESTAMPTZ,
  feedback_sentiment VARCHAR(20),
  quality_score DECIMAL(4,2),
  copy_count INTEGER DEFAULT 0,
  last_copy_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ
);

-- Create indexes in personal schema
CREATE INDEX IF NOT EXISTS idx_idea_drafts_idea ON idea_drafts(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_context ON idea_drafts(context);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_status ON idea_drafts(status);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_type ON idea_drafts(draft_type);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_created ON idea_drafts(created_at DESC);

-- Create draft_trigger_patterns table in personal schema
CREATE TABLE IF NOT EXISTS draft_trigger_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL DEFAULT 'personal',
  draft_type VARCHAR(50) NOT NULL,
  pattern_text VARCHAR(200) NOT NULL,
  pattern_type VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  times_triggered INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,
  times_discarded INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  success_rate DECIMAL(5,2),
  quality_score DECIMAL(4,2),
  consecutive_low_ratings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(context, draft_type, pattern_text)
);

CREATE INDEX IF NOT EXISTS idx_draft_patterns_type ON draft_trigger_patterns(draft_type);
CREATE INDEX IF NOT EXISTS idx_draft_patterns_active ON draft_trigger_patterns(is_active);

-- Insert default patterns for personal schema
INSERT INTO draft_trigger_patterns (context, draft_type, pattern_text, pattern_type) VALUES
  ('personal', 'email', 'e-mail schreiben', 'phrase'),
  ('personal', 'email', 'mail an', 'phrase'),
  ('personal', 'email', 'antworten auf', 'phrase'),
  ('personal', 'email', 'nachricht an', 'phrase'),
  ('personal', 'email', 'kontaktieren', 'keyword'),
  ('personal', 'article', 'artikel schreiben', 'phrase'),
  ('personal', 'article', 'blogpost', 'keyword'),
  ('personal', 'article', 'beitrag über', 'phrase'),
  ('personal', 'article', 'text verfassen', 'phrase'),
  ('personal', 'document', 'notizen aufschreiben', 'phrase')
ON CONFLICT (context, draft_type, pattern_text) DO NOTHING;

-- ===========================================
-- Create tables in WORK schema
-- ===========================================

-- Set search path to work schema
SET search_path TO work, public;

-- Create idea_drafts table in work schema
CREATE TABLE IF NOT EXISTS idea_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL DEFAULT 'work',

  -- Draft metadata
  draft_type VARCHAR(50) NOT NULL,
  trigger_pattern VARCHAR(200),
  trigger_text VARCHAR(500),

  -- Content
  content TEXT NOT NULL,
  word_count INTEGER,
  language VARCHAR(10) DEFAULT 'de',

  -- Related context
  related_idea_ids UUID[],
  research_id UUID,
  profile_snapshot JSONB,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'ready',
  generation_time_ms INTEGER,

  -- User feedback
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,
  edits_made INTEGER DEFAULT 0,
  content_reused_percent INTEGER,

  -- Phase 25.5 additions
  feedback_count INTEGER DEFAULT 0,
  last_feedback_at TIMESTAMPTZ,
  feedback_sentiment VARCHAR(20),
  quality_score DECIMAL(4,2),
  copy_count INTEGER DEFAULT 0,
  last_copy_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ
);

-- Create indexes in work schema
CREATE INDEX IF NOT EXISTS idx_idea_drafts_idea ON idea_drafts(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_context ON idea_drafts(context);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_status ON idea_drafts(status);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_type ON idea_drafts(draft_type);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_created ON idea_drafts(created_at DESC);

-- Create draft_trigger_patterns table in work schema
CREATE TABLE IF NOT EXISTS draft_trigger_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL DEFAULT 'work',
  draft_type VARCHAR(50) NOT NULL,
  pattern_text VARCHAR(200) NOT NULL,
  pattern_type VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  times_triggered INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,
  times_discarded INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  success_rate DECIMAL(5,2),
  quality_score DECIMAL(4,2),
  consecutive_low_ratings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(context, draft_type, pattern_text)
);

CREATE INDEX IF NOT EXISTS idx_draft_patterns_type ON draft_trigger_patterns(draft_type);
CREATE INDEX IF NOT EXISTS idx_draft_patterns_active ON draft_trigger_patterns(is_active);

-- Insert default patterns for work schema
INSERT INTO draft_trigger_patterns (context, draft_type, pattern_text, pattern_type) VALUES
  ('work', 'email', 'e-mail schreiben', 'phrase'),
  ('work', 'email', 'mail an', 'phrase'),
  ('work', 'email', 'antwort schreiben', 'phrase'),
  ('work', 'email', 'kunde kontaktieren', 'phrase'),
  ('work', 'email', 'e-mail an', 'phrase'),
  ('work', 'email', 'mail verfassen', 'phrase'),
  ('work', 'article', 'artikel schreiben', 'phrase'),
  ('work', 'article', 'linkedin post', 'phrase'),
  ('work', 'article', 'pressemitteilung', 'keyword'),
  ('work', 'proposal', 'angebot erstellen', 'phrase'),
  ('work', 'proposal', 'vorschlag schreiben', 'phrase'),
  ('work', 'proposal', 'pitch vorbereiten', 'phrase'),
  ('work', 'proposal', 'präsentation erstellen', 'phrase'),
  ('work', 'document', 'dokumentation', 'keyword'),
  ('work', 'document', 'anleitung schreiben', 'phrase'),
  ('work', 'document', 'prozess dokumentieren', 'phrase')
ON CONFLICT (context, draft_type, pattern_text) DO NOTHING;

-- ===========================================
-- Create feedback tables in PERSONAL schema
-- ===========================================
SET search_path TO personal, public;

-- Draft feedback history
CREATE TABLE IF NOT EXISTS draft_feedback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES idea_drafts(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL DEFAULT 'personal',
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  content_reused_percent INTEGER CHECK (content_reused_percent >= 0 AND content_reused_percent <= 100),
  edits_description TEXT,
  edit_categories VARCHAR(50)[],
  original_word_count INTEGER,
  final_word_count INTEGER,
  was_helpful BOOLEAN,
  would_use_again BOOLEAN,
  quality_aspects JSONB,
  feedback_sentiment VARCHAR(20),
  improvement_areas VARCHAR(100)[],
  feedback_source VARCHAR(30) DEFAULT 'manual',
  session_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_history_draft ON draft_feedback_history(draft_id);
CREATE INDEX IF NOT EXISTS idx_feedback_history_context ON draft_feedback_history(context);
CREATE INDEX IF NOT EXISTS idx_feedback_history_rating ON draft_feedback_history(rating);

-- Draft learning suggestions
CREATE TABLE IF NOT EXISTS draft_learning_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL DEFAULT 'personal',
  draft_type VARCHAR(50) NOT NULL,
  suggestion_type VARCHAR(30) NOT NULL,
  suggestion_text TEXT NOT NULL,
  rationale TEXT,
  based_on_feedback_count INTEGER,
  avg_rating_before DECIMAL(3,2),
  common_issues VARCHAR(100)[],
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  avg_rating_after DECIMAL(3,2),
  improvement_percent DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_suggestions_type ON draft_learning_suggestions(draft_type);
CREATE INDEX IF NOT EXISTS idx_learning_suggestions_status ON draft_learning_suggestions(status);

-- ===========================================
-- Create feedback tables in WORK schema
-- ===========================================
SET search_path TO work, public;

-- Draft feedback history
CREATE TABLE IF NOT EXISTS draft_feedback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES idea_drafts(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL DEFAULT 'work',
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  content_reused_percent INTEGER CHECK (content_reused_percent >= 0 AND content_reused_percent <= 100),
  edits_description TEXT,
  edit_categories VARCHAR(50)[],
  original_word_count INTEGER,
  final_word_count INTEGER,
  was_helpful BOOLEAN,
  would_use_again BOOLEAN,
  quality_aspects JSONB,
  feedback_sentiment VARCHAR(20),
  improvement_areas VARCHAR(100)[],
  feedback_source VARCHAR(30) DEFAULT 'manual',
  session_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_history_draft ON draft_feedback_history(draft_id);
CREATE INDEX IF NOT EXISTS idx_feedback_history_context ON draft_feedback_history(context);
CREATE INDEX IF NOT EXISTS idx_feedback_history_rating ON draft_feedback_history(rating);

-- Draft learning suggestions
CREATE TABLE IF NOT EXISTS draft_learning_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL DEFAULT 'work',
  draft_type VARCHAR(50) NOT NULL,
  suggestion_type VARCHAR(30) NOT NULL,
  suggestion_text TEXT NOT NULL,
  rationale TEXT,
  based_on_feedback_count INTEGER,
  avg_rating_before DECIMAL(3,2),
  common_issues VARCHAR(100)[],
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  avg_rating_after DECIMAL(3,2),
  improvement_percent DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_suggestions_type ON draft_learning_suggestions(draft_type);
CREATE INDEX IF NOT EXISTS idx_learning_suggestions_status ON draft_learning_suggestions(status);

-- ===========================================
-- Reset and verify
-- ===========================================
SET search_path TO public;

-- Verify tables were created
SELECT
  schemaname,
  tablename
FROM pg_tables
WHERE tablename IN ('idea_drafts', 'draft_trigger_patterns', 'draft_feedback_history', 'draft_learning_suggestions')
  AND schemaname IN ('personal', 'work')
ORDER BY schemaname, tablename;
