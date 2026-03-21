-- Phase 65 Supplement: Add user_id to tables missed in original migration
-- Date: 2026-03-15
-- Tables: public.documents, public.document_folders, *.contact_interactions, *.agent_executions
-- Idempotent: safe to run multiple times

DO $$
DECLARE
  s TEXT;
  default_user UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- PUBLIC SCHEMA: documents + document_folders
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  UPDATE public.documents SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_public_documents_user ON public.documents(user_id);

  ALTER TABLE public.document_folders ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  UPDATE public.document_folders SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_public_document_folders_user ON public.document_folders(user_id);

  -- CONTEXT SCHEMAS: contact_interactions + agent_executions
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.contact_interactions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.contact_interactions SET user_id = %L WHERE user_id IS NULL', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_contact_interactions_user ON %I.contact_interactions(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.agent_executions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.agent_executions SET user_id = %L WHERE user_id IS NULL', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_agent_exec_user ON %I.agent_executions(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END
$$;
