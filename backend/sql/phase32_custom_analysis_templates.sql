-- Phase 32 Phase 3: Custom Analysis Templates
-- Users can define their own analysis templates

CREATE TABLE IF NOT EXISTS custom_analysis_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  system_prompt TEXT NOT NULL,
  instruction TEXT NOT NULL,
  icon VARCHAR(50) DEFAULT 'file-text',
  context VARCHAR(20) DEFAULT 'work',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for listing templates by context
CREATE INDEX IF NOT EXISTS idx_custom_analysis_templates_context
  ON custom_analysis_templates (context, created_at DESC);
