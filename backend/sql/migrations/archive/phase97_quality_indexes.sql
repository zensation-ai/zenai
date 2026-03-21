-- Phase 97: Quality Indexes & Foreign Key Constraints
-- Composite indexes for major tables across all 4 schemas
-- Foreign key constraints from user_id columns to public.users(id)

-- ===========================================
-- Composite Indexes (all 4 schemas)
-- ===========================================

DO $$
DECLARE
  s TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH s IN ARRAY schemas
  LOOP
    -- ideas: user_id + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_ideas_user_created ON %I.ideas (user_id, created_at DESC)',
      s, s
    );

    -- ideas: user_id + is_archived partial index (non-archived only)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_ideas_user_active ON %I.ideas (user_id, created_at DESC) WHERE is_archived = false',
      s, s
    );

    -- tasks: user_id + status + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tasks_user_status ON %I.tasks (user_id, status, created_at DESC)',
      s, s
    );

    -- tasks: user_id + project_id
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tasks_user_project ON %I.tasks (user_id, project_id)',
      s, s
    );

    -- emails: user_id + status + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_emails_user_status ON %I.emails (user_id, status, created_at DESC)',
      s, s
    );

    -- emails: user_id + direction
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_emails_user_direction ON %I.emails (user_id, direction)',
      s, s
    );

    -- chat_sessions: user_id + updated_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_chat_sessions_user_updated ON %I.general_chat_sessions (user_id, updated_at DESC)',
      s, s
    );

    -- contacts: user_id + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_contacts_user_created ON %I.contacts (user_id, created_at DESC)',
      s, s
    );

    -- learned_facts: user_id + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_user_created ON %I.learned_facts (user_id, created_at DESC)',
      s, s
    );

    -- smart_suggestions: user_id + suggestion_type
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_smart_suggestions_user_type ON %I.smart_suggestions (user_id, suggestion_type)',
      s, s
    );

    -- security_audit_log: user_id + event_type + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_audit_log_user_event ON %I.security_audit_log (user_id, event_type, created_at DESC)',
      s, s
    );

    -- voice_sessions: user_id + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_voice_sessions_user_created ON %I.voice_sessions (user_id, created_at DESC)',
      s, s
    );

    -- documents: user_id + created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_documents_user_created ON %I.documents (user_id, created_at DESC)',
      s, s
    );

    -- transactions: user_id + date DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_transactions_user_date ON %I.transactions (user_id, date DESC)',
      s, s
    );

    -- calendar_events: user_id + start_time
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_calendar_events_user_start ON %I.calendar_events (user_id, start_time)',
      s, s
    );

    RAISE NOTICE 'Created indexes for schema: %', s;
  END LOOP;
END
$$;

-- ===========================================
-- Foreign Key Constraints (user_id -> public.users)
-- Wrapped in exception handlers for idempotency
-- ===========================================

DO $$
DECLARE
  s TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH s IN ARRAY schemas
  LOOP
    -- ideas
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.ideas ADD CONSTRAINT fk_%s_ideas_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s, s
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- constraint already exists
    WHEN undefined_table THEN
      NULL; -- table does not exist yet
    WHEN undefined_column THEN
      NULL; -- column does not exist yet
    END;

    -- tasks
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.tasks ADD CONSTRAINT fk_%s_tasks_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s, s
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      NULL;
    END;

    -- emails
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.emails ADD CONSTRAINT fk_%s_emails_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s, s
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      NULL;
    END;

    -- chat_sessions
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.general_chat_sessions ADD CONSTRAINT fk_%s_chat_sessions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s, s
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      NULL;
    END;

    -- contacts
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.contacts ADD CONSTRAINT fk_%s_contacts_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s, s
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      NULL;
    END;

    RAISE NOTICE 'Added FK constraints for schema: %', s;
  END LOOP;
END
$$;
