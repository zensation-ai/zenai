-- Phase 29: General Chat Tables
-- ChatGPT-like interface for general questions and conversations

-- Chat Sessions Table
CREATE TABLE IF NOT EXISTS general_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL DEFAULT 'personal',
  title VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS general_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES general_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_context ON general_chat_sessions(context);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON general_chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON general_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON general_chat_messages(created_at ASC);

-- Trigger to auto-update updated_at on session changes
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_session_updated_at ON general_chat_sessions;
CREATE TRIGGER chat_session_updated_at
  BEFORE UPDATE ON general_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_timestamp();

-- Comment on tables
COMMENT ON TABLE general_chat_sessions IS 'Chat sessions for general ChatGPT-like conversations';
COMMENT ON TABLE general_chat_messages IS 'Messages within a chat session';
COMMENT ON COLUMN general_chat_sessions.context IS 'User context: personal or work';
COMMENT ON COLUMN general_chat_sessions.title IS 'Auto-generated title from first message';
COMMENT ON COLUMN general_chat_messages.role IS 'Message sender: user or assistant';
