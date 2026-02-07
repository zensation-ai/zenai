-- Phase 32: Document Analysis History Table
-- Stores analysis results for document history feature

CREATE TABLE IF NOT EXISTS document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  analysis_type VARCHAR(50) DEFAULT 'general',
  analysis_result JSONB,
  token_usage JSONB,
  context VARCHAR(20) DEFAULT 'work',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast history queries by context and date
CREATE INDEX IF NOT EXISTS idx_document_analyses_context_date
  ON document_analyses (context, created_at DESC);

-- Index for individual analysis lookup
CREATE INDEX IF NOT EXISTS idx_document_analyses_id
  ON document_analyses (id);
