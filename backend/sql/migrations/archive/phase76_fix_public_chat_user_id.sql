-- Phase 76: Fix missing user_id on PUBLIC schema chat tables
-- ============================================================
-- ROOT CAUSE: Phase 65 migration added user_id to schema-specific tables
-- (personal.general_chat_sessions, etc.) but the actual tables used by
-- the code live in the PUBLIC schema. This migration fixes that.
-- ============================================================

DO $$
DECLARE
  default_user UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ---- PUBLIC.GENERAL_CHAT_SESSIONS ----
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'general_chat_sessions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.general_chat_sessions ADD COLUMN user_id UUID DEFAULT default_user;
    UPDATE public.general_chat_sessions SET user_id = default_user WHERE user_id IS NULL;
    ALTER TABLE public.general_chat_sessions ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_public_chat_sessions_user ON public.general_chat_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_public_chat_sessions_user_updated ON public.general_chat_sessions(user_id, updated_at DESC);
    RAISE NOTICE 'Added user_id to public.general_chat_sessions';
  ELSE
    RAISE NOTICE 'public.general_chat_sessions already has user_id';
  END IF;

  -- ---- PUBLIC.GENERAL_CHAT_MESSAGES ----
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'general_chat_messages' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.general_chat_messages ADD COLUMN user_id UUID DEFAULT default_user;
    UPDATE public.general_chat_messages SET user_id = default_user WHERE user_id IS NULL;
    ALTER TABLE public.general_chat_messages ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_public_chat_messages_user ON public.general_chat_messages(user_id);
    RAISE NOTICE 'Added user_id to public.general_chat_messages';
  ELSE
    RAISE NOTICE 'public.general_chat_messages already has user_id';
  END IF;

  -- ---- PUBLIC.CANVAS_DOCUMENTS (also references general_chat_sessions) ----
  -- No changes needed, just ensure FK still works

END $$;
