-- Fix: Add missing columns to public.general_chat_messages
-- These columns were referenced in code (Phase 100: edit/regenerate/branching)
-- but never migrated to the database.
--
-- IMPORTANT: Explicit public schema prefix to avoid Supabase SQL Editor
-- defaulting to the personal schema search path.
--
-- Fixes:
-- 1. is_active: Message branching (edit/regenerate marks old messages inactive)
-- 2. version: Message versioning for edit history
-- 3. parent_message_id: Tree-based message branching
-- 4. tool_calls: Persisted tool call metadata from streaming
-- 5. thinking_content: Extended thinking content from AI responses

ALTER TABLE public.general_chat_messages
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_message_id UUID,
  ADD COLUMN IF NOT EXISTS tool_calls JSONB,
  ADD COLUMN IF NOT EXISTS thinking_content TEXT;

-- Index for efficient active message filtering
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_active
  ON public.general_chat_messages (session_id, is_active)
  WHERE is_active = true;

-- Composite index for the stream handler's history query
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_user_active
  ON public.general_chat_messages (session_id, user_id, is_active, created_at ASC);
