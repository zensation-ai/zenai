-- Phase 25: Proactive Draft Generation
-- Stores AI-generated drafts for tasks (emails, articles, proposals, etc.)

-- Table for storing generated drafts
CREATE TABLE IF NOT EXISTS idea_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL,  -- 'personal' or 'work'

  -- Draft metadata
  draft_type VARCHAR(50) NOT NULL,       -- 'email', 'article', 'document', 'proposal', 'generic'
  trigger_pattern VARCHAR(200),          -- The pattern that triggered draft generation
  trigger_text VARCHAR(500),             -- The original text that matched

  -- Content
  content TEXT NOT NULL,
  word_count INTEGER,
  language VARCHAR(10) DEFAULT 'de',     -- Primary language of draft

  -- Related context used for generation
  related_idea_ids UUID[],               -- Ideas used as context
  research_id UUID,                      -- Related proactive research if any
  profile_snapshot JSONB,                -- Business profile snapshot at generation time

  -- Status tracking
  status VARCHAR(20) DEFAULT 'ready',    -- 'generating', 'ready', 'viewed', 'used', 'edited', 'discarded'
  generation_time_ms INTEGER,            -- How long generation took

  -- User feedback for learning
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,
  edits_made INTEGER DEFAULT 0,          -- Number of times user edited
  content_reused_percent INTEGER,        -- How much of draft was kept (0-100)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_idea_drafts_idea ON idea_drafts(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_context ON idea_drafts(context);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_status ON idea_drafts(status);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_type ON idea_drafts(draft_type);
CREATE INDEX IF NOT EXISTS idx_idea_drafts_created ON idea_drafts(created_at DESC);

-- Table for draft trigger patterns (learning which patterns work best)
CREATE TABLE IF NOT EXISTS draft_trigger_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL,

  -- Pattern definition
  draft_type VARCHAR(50) NOT NULL,
  pattern_text VARCHAR(200) NOT NULL,    -- The keyword/phrase pattern
  pattern_type VARCHAR(20) NOT NULL,     -- 'keyword', 'phrase', 'regex'
  is_active BOOLEAN DEFAULT true,

  -- Learning metrics
  times_triggered INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,          -- Draft was actually used
  times_discarded INTEGER DEFAULT 0,     -- Draft was discarded
  avg_rating DECIMAL(3,2),               -- Average user rating
  success_rate DECIMAL(5,2),             -- (used / triggered) * 100

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(context, draft_type, pattern_text)
);

CREATE INDEX IF NOT EXISTS idx_draft_patterns_type ON draft_trigger_patterns(draft_type);
CREATE INDEX IF NOT EXISTS idx_draft_patterns_active ON draft_trigger_patterns(is_active);

-- Insert default trigger patterns (German)
INSERT INTO draft_trigger_patterns (context, draft_type, pattern_text, pattern_type) VALUES
  -- Email patterns
  ('personal', 'email', 'e-mail schreiben', 'phrase'),
  ('personal', 'email', 'mail an', 'phrase'),
  ('personal', 'email', 'antworten auf', 'phrase'),
  ('personal', 'email', 'nachricht an', 'phrase'),
  ('personal', 'email', 'kontaktieren', 'keyword'),
  ('work', 'email', 'e-mail schreiben', 'phrase'),
  ('work', 'email', 'mail an', 'phrase'),
  ('work', 'email', 'antwort schreiben', 'phrase'),
  ('work', 'email', 'kunde kontaktieren', 'phrase'),

  -- Article patterns
  ('personal', 'article', 'artikel schreiben', 'phrase'),
  ('personal', 'article', 'blogpost', 'keyword'),
  ('personal', 'article', 'beitrag über', 'phrase'),
  ('personal', 'article', 'text verfassen', 'phrase'),
  ('work', 'article', 'artikel schreiben', 'phrase'),
  ('work', 'article', 'linkedin post', 'phrase'),
  ('work', 'article', 'pressemitteilung', 'keyword'),

  -- Proposal patterns
  ('work', 'proposal', 'angebot erstellen', 'phrase'),
  ('work', 'proposal', 'vorschlag schreiben', 'phrase'),
  ('work', 'proposal', 'pitch vorbereiten', 'phrase'),
  ('work', 'proposal', 'präsentation erstellen', 'phrase'),

  -- Document patterns
  ('work', 'document', 'dokumentation', 'keyword'),
  ('work', 'document', 'anleitung schreiben', 'phrase'),
  ('work', 'document', 'prozess dokumentieren', 'phrase'),
  ('personal', 'document', 'notizen aufschreiben', 'phrase')
ON CONFLICT (context, draft_type, pattern_text) DO NOTHING;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS trigger_update_draft_timestamp ON idea_drafts;
CREATE TRIGGER trigger_update_draft_timestamp
  BEFORE UPDATE ON idea_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_draft_timestamp();
