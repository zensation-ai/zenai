-- Phase 67.2: Database Performance Indexes
--
-- Adds targeted indexes for high-frequency query patterns across all 4 schemas.
-- Uses CREATE INDEX CONCURRENTLY IF NOT EXISTS for safe production deployment.
--
-- NOTE: CONCURRENTLY cannot run inside a transaction block.
-- Execute each statement individually or outside BEGIN/COMMIT.

-- ===========================================
-- Helper: Run for each schema
-- ===========================================

DO $$
DECLARE
  ctx TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH ctx IN ARRAY schemas
  LOOP
    -- -----------------------------------------
    -- Chat messages: session_id + created_at (message history ordering)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_chat_messages_session_created
       ON %I.general_chat_messages (session_id, created_at DESC)',
      ctx, ctx
    );

    -- Chat sessions: user_id + updated_at (recent sessions list)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_chat_sessions_user_updated
       ON %I.general_chat_sessions (user_id, updated_at DESC)',
      ctx, ctx
    );

    -- -----------------------------------------
    -- Learned facts: user_id + context + confidence (memory retrieval)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_user_confidence
       ON %I.learned_facts (user_id, confidence DESC)',
      ctx, ctx
    );

    -- (is_active column does not exist on learned_facts - skipped)

    -- -----------------------------------------
    -- Emails: user_id + status (inbox queries)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_emails_user_status
       ON %I.emails (user_id, status)',
      ctx, ctx
    );

    -- Emails: user_id + created_at (chronological listing)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_emails_user_created
       ON %I.emails (user_id, created_at DESC)',
      ctx, ctx
    );

    -- -----------------------------------------
    -- Entity relations: source + target (graph traversal)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_relations_source
       ON %I.entity_relations (source_entity_id)',
      ctx, ctx
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_relations_target
       ON %I.entity_relations (target_entity_id)',
      ctx, ctx
    );

    -- -----------------------------------------
    -- Ideas: user_id + is_archived + created_at (filtered listings)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_ideas_user_archived_created
       ON %I.ideas (user_id, is_archived, created_at DESC)',
      ctx, ctx
    );

    -- Ideas: full-text search on title + summary
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_ideas_textsearch
       ON %I.ideas USING gin (to_tsvector(''german'', coalesce(title, '''') || '' '' || coalesce(summary, '''')))',
      ctx, ctx
    );

    -- -----------------------------------------
    -- Tasks: user_id + status (kanban/list views)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tasks_user_status
       ON %I.tasks (user_id, status)',
      ctx, ctx
    );

    -- Tasks: due_date for upcoming/overdue queries
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tasks_due_date
       ON %I.tasks (due_date) WHERE due_date IS NOT NULL',
      ctx, ctx
    );

    -- -----------------------------------------
    -- Knowledge entities: type + name (entity lookup)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_knowledge_entities_type
       ON %I.knowledge_entities (type, name)',
      ctx, ctx
    );

    -- -----------------------------------------
    -- Contacts: user_id + name (alphabetical listing)
    -- -----------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_contacts_user_name
       ON %I.contacts (user_id, last_name, first_name)',
      ctx, ctx
    );

    RAISE NOTICE 'Created performance indexes for schema: %', ctx;
  END LOOP;
END
$$;
