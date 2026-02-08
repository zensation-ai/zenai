-- Phase 33 Sprint 4: Interactive Canvas Mode
-- Persistent canvas documents for side-by-side editing with chat

-- Canvas Documents Table
CREATE TABLE IF NOT EXISTS canvas_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL DEFAULT 'personal',
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type VARCHAR(20) NOT NULL DEFAULT 'markdown'
    CHECK (type IN ('markdown', 'code', 'html')),
  language VARCHAR(50),
  chat_session_id UUID REFERENCES general_chat_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canvas Version History (for undo/restore)
CREATE TABLE IF NOT EXISTS canvas_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_canvas_documents_context
  ON canvas_documents(context);
CREATE INDEX IF NOT EXISTS idx_canvas_documents_updated
  ON canvas_documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_documents_chat_session
  ON canvas_documents(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_canvas_versions_document
  ON canvas_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_canvas_versions_created
  ON canvas_versions(created_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_canvas_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS canvas_document_updated_at ON canvas_documents;
CREATE TRIGGER canvas_document_updated_at
  BEFORE UPDATE ON canvas_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_canvas_document_timestamp();

-- Comments
COMMENT ON TABLE canvas_documents IS 'Interactive canvas documents for side-by-side chat editing';
COMMENT ON TABLE canvas_versions IS 'Version history for canvas documents (auto-save snapshots)';
COMMENT ON COLUMN canvas_documents.type IS 'Document type: markdown, code, or html';
COMMENT ON COLUMN canvas_documents.language IS 'Programming language for code type documents';
COMMENT ON COLUMN canvas_documents.chat_session_id IS 'Linked chat session for AI-assisted editing';
COMMENT ON COLUMN canvas_versions.source IS 'Who made the change: user or ai';
