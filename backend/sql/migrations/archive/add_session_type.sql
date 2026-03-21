-- Migration: Add session_type column to general_chat_sessions
-- Purpose: Distinguish assistant sessions from regular chat sessions

ALTER TABLE general_chat_sessions
ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_type
ON general_chat_sessions(session_type);
