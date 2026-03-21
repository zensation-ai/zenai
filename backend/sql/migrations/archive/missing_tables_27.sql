-- =============================================================================
-- ZenAI Missing Tables Migration
-- 27 tables extracted from backend source code (INSERT/SELECT/interface analysis)
-- Generated: 2026-03-11
--
-- NOTE: Tables marked "per-schema" must be created in all 4 schemas:
--       personal, work, learning, creative
-- Tables marked "global" go in public schema only.
--
-- Some items from the original list turned out to be CTEs (not real tables):
--   - daily_stats      (CTE in ai-evolution-analytics.ts)
--   - daily_activity    (CTE in evolution-analytics.ts)
--   - daily_feedback    (CTE in ai-evolution-analytics.ts)
--   - category_stats    (CTE in ai-evolution-analytics.ts)
--   - idea_clusters     (CTE in proactive-suggestions.ts)
--   - daily_sessions    (CTE; real table = learning_sessions)
--
-- Actual tables: 27 (including replacements for CTEs with real tables found)
-- =============================================================================

-- Helper: run a block in each schema
DO $$ BEGIN RAISE NOTICE 'Creating missing tables in all 4 schemas...'; END $$;

-- =============================================================================
-- 1. contacts (per-schema) — Source: services/contacts.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.contacts (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        display_name      TEXT,
        first_name        TEXT,
        last_name         TEXT,
        email             TEXT[],
        phone             TEXT[],
        organization_id   UUID,
        role              TEXT,
        relationship_type TEXT,
        avatar_url        TEXT,
        notes             TEXT,
        tags              TEXT[],
        source            TEXT,
        is_favorite       BOOLEAN DEFAULT FALSE,
        address           TEXT,
        city              TEXT,
        postal_code       TEXT,
        country           TEXT,
        social_links      JSONB DEFAULT ''{}''::jsonb,
        metadata          JSONB DEFAULT ''{}''::jsonb,
        last_interaction_at TIMESTAMPTZ,
        interaction_count INTEGER DEFAULT 0,
        ai_summary        TEXT,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 2. contact_interactions (per-schema) — Source: services/contacts.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.contact_interactions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id       UUID REFERENCES %I.contacts(id) ON DELETE CASCADE,
        interaction_type TEXT,
        direction        TEXT,
        subject          TEXT,
        summary          TEXT,
        source_id        TEXT,
        source_type      TEXT,
        interaction_at   TIMESTAMPTZ DEFAULT NOW(),
        metadata         JSONB DEFAULT ''{}''::jsonb,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )', s, s);
  END LOOP;
END $do$;

-- =============================================================================
-- 3. organizations (per-schema) — Source: services/contacts.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.organizations (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name           TEXT NOT NULL,
        industry       TEXT,
        website        TEXT,
        email          TEXT,
        phone          TEXT,
        address        TEXT,
        city           TEXT,
        postal_code    TEXT,
        country        TEXT,
        employee_count INTEGER,
        notes          TEXT,
        tags           TEXT[],
        metadata       JSONB DEFAULT ''{}''::jsonb,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 4. knowledge_connections (per-schema) — Source: services/knowledge-graph/graph-analytics.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.knowledge_connections (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_idea_id  UUID,
        target_idea_id  UUID,
        connection_type TEXT,
        strength        DECIMAL DEFAULT 0.5,
        context         VARCHAR(20),
        metadata        JSONB DEFAULT ''{}''::jsonb,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 5. learned_facts (per-schema) — Source: services/memory/memory-governance.ts, global-search.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.learned_facts (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fact_type     VARCHAR(50),
        content       TEXT,
        confidence    DECIMAL DEFAULT 0.5,
        source        TEXT,
        context       VARCHAR(20),
        last_accessed TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 6. conversation_memory (per-schema) — Source: services/memory/memory-governance.ts
--    (Only DELETE/context visible; inferring standard memory table shape)
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.conversation_memory (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id   UUID,
        role         VARCHAR(20),
        content      TEXT,
        context      VARCHAR(20),
        importance   DECIMAL DEFAULT 0.5,
        metadata     JSONB DEFAULT ''{}''::jsonb,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 7. conversation_patterns (per-schema) — Source: services/memory/memory-governance.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.conversation_patterns (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern_type VARCHAR(50),
        description  TEXT,
        confidence   DECIMAL DEFAULT 0.5,
        context      VARCHAR(20),
        metadata     JSONB DEFAULT ''{}''::jsonb,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 8. bookmarks (per-schema) — Source: services/browsing-memory.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.bookmarks (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url         TEXT UNIQUE,
        title       TEXT,
        description TEXT,
        folder      TEXT,
        tags        TEXT[],
        ai_summary  TEXT,
        favicon_url TEXT,
        metadata    JSONB DEFAULT ''{}''::jsonb,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 9. browsing_history (per-schema) — Source: services/browsing-memory.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.browsing_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url             TEXT,
        title           TEXT,
        domain          TEXT,
        visit_time      TIMESTAMPTZ DEFAULT NOW(),
        duration_seconds INTEGER DEFAULT 0,
        content_summary TEXT,
        content_text    TEXT,
        keywords        TEXT[],
        category        TEXT,
        is_bookmarked   BOOLEAN DEFAULT FALSE,
        metadata        JSONB DEFAULT ''{}''::jsonb,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 10. screen_captures (per-schema) — Source: services/screen-memory.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.screen_captures (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp        TIMESTAMPTZ DEFAULT NOW(),
        app_name         TEXT,
        window_title     TEXT,
        url              TEXT,
        ocr_text         TEXT,
        screenshot_path  TEXT,
        duration_seconds INTEGER DEFAULT 0,
        is_sensitive     BOOLEAN DEFAULT FALSE,
        metadata         JSONB DEFAULT ''{}''::jsonb,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 11. financial_accounts (per-schema) — Source: services/finance.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.financial_accounts (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name         TEXT NOT NULL,
        account_type VARCHAR(50) DEFAULT ''checking'',
        currency     VARCHAR(10) DEFAULT ''EUR'',
        balance      DECIMAL DEFAULT 0,
        institution  TEXT,
        is_active    BOOLEAN DEFAULT TRUE,
        metadata     JSONB DEFAULT ''{}''::jsonb,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 12. transactions (per-schema) — Source: services/finance.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.transactions (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id              UUID REFERENCES %I.financial_accounts(id) ON DELETE SET NULL,
        amount                  DECIMAL NOT NULL,
        currency                VARCHAR(10) DEFAULT ''EUR'',
        transaction_type        VARCHAR(50) DEFAULT ''expense'',
        category                TEXT,
        subcategory             TEXT,
        payee                   TEXT,
        description             TEXT,
        transaction_date        DATE DEFAULT CURRENT_DATE,
        is_recurring            BOOLEAN DEFAULT FALSE,
        recurring_id            UUID,
        tags                    TEXT[],
        receipt_url             TEXT,
        ai_category             TEXT,
        ai_category_confidence  DECIMAL,
        metadata                JSONB DEFAULT ''{}''::jsonb,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        updated_at              TIMESTAMPTZ DEFAULT NOW()
      )', s, s);
  END LOOP;
END $do$;

-- =============================================================================
-- 13. financial_goals (per-schema) — Source: services/finance.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.financial_goals (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name           TEXT NOT NULL,
        target_amount  DECIMAL NOT NULL,
        current_amount DECIMAL DEFAULT 0,
        deadline       DATE,
        category       TEXT,
        priority       VARCHAR(20) DEFAULT ''medium'',
        is_completed   BOOLEAN DEFAULT FALSE,
        metadata       JSONB DEFAULT ''{}''::jsonb,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 14. proactive_briefings (per-schema) — Source: services/proactive/proactive-engine.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_briefings (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        briefing_type VARCHAR(50),
        content       JSONB DEFAULT ''{}''::jsonb,
        generated_at  TIMESTAMPTZ DEFAULT NOW(),
        read_at       TIMESTAMPTZ,
        dismissed_at  TIMESTAMPTZ,
        acted_on      JSONB,
        metadata      JSONB DEFAULT ''{}''::jsonb,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 15. workflow_patterns (per-schema) — Source: services/proactive/proactive-engine.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.workflow_patterns (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern_name       TEXT,
        trigger_type       VARCHAR(50) DEFAULT ''manual'',
        trigger_conditions JSONB DEFAULT ''{}''::jsonb,
        suggested_actions  JSONB DEFAULT ''[]''::jsonb,
        confidence         DECIMAL DEFAULT 0.5,
        occurrence_count   INTEGER DEFAULT 0,
        last_seen_at       TIMESTAMPTZ,
        is_confirmed       BOOLEAN DEFAULT FALSE,
        is_automated       BOOLEAN DEFAULT FALSE,
        metadata           JSONB DEFAULT ''{}''::jsonb,
        created_at         TIMESTAMPTZ DEFAULT NOW(),
        updated_at         TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 16. proactive_suggestions (per-schema) — Source: services/ai-evolution-analytics.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_suggestions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        suggestion_type VARCHAR(50),
        title           TEXT,
        content         TEXT,
        accepted        BOOLEAN,
        responded_at    TIMESTAMPTZ,
        context         VARCHAR(20),
        metadata        JSONB DEFAULT ''{}''::jsonb,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 17. idea_corrections (per-schema) — Source: services/ai-evolution-analytics.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_corrections (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id          UUID,
        category         TEXT,
        correction_field TEXT,
        old_value        TEXT,
        new_value        TEXT,
        context          VARCHAR(20),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 18. user_feedback (per-schema) — Source: services/ai-evolution-analytics.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.user_feedback (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rating     INTEGER,
        comment    TEXT,
        source     TEXT,
        context    VARCHAR(20),
        metadata   JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 19. draft_suggestions (per-schema) — Source: services/productivity-analytics.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.draft_suggestions (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id    UUID,
        content    TEXT,
        status     VARCHAR(20) DEFAULT ''pending'',
        context    VARCHAR(20),
        metadata   JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 20. proactive_suggestion_feedback (per-schema) — Source: services/proactive-suggestions.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_suggestion_feedback (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        suggestion_id   UUID,
        context         VARCHAR(20),
        suggestion_type VARCHAR(50) DEFAULT ''unknown'',
        was_accepted    BOOLEAN,
        dismiss_reason  TEXT,
        action_taken    JSONB,
        metadata        JSONB DEFAULT ''{}''::jsonb,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 21. proactive_settings (per-schema) — Source: services/proactive-suggestions.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_settings (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context                 VARCHAR(20) NOT NULL,
        proactivity_level       VARCHAR(20) DEFAULT ''balanced'',
        enabled_types           JSONB DEFAULT ''["routine","connection","reminder","draft","follow_up"]''::jsonb,
        quiet_hours_start       INTEGER DEFAULT 22,
        quiet_hours_end         INTEGER DEFAULT 7,
        max_suggestions_per_day INTEGER DEFAULT 10,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        updated_at              TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(context)
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 22. evolution_snapshots (per-schema) — Source: services/evolution-analytics.ts
--     ON CONFLICT (context, snapshot_date) => UNIQUE constraint
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.evolution_snapshots (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context                VARCHAR(20) NOT NULL,
        snapshot_date          DATE NOT NULL,
        total_ideas            INTEGER DEFAULT 0,
        total_corrections      INTEGER DEFAULT 0,
        total_interactions     INTEGER DEFAULT 0,
        total_automations      INTEGER DEFAULT 0,
        correction_rate        DECIMAL DEFAULT 0,
        ai_accuracy_score      DECIMAL DEFAULT 0,
        context_depth_score    DECIMAL DEFAULT 0,
        profile_completeness   DECIMAL DEFAULT 0,
        learned_patterns_count INTEGER DEFAULT 0,
        automations_active     INTEGER DEFAULT 0,
        active_days_streak     INTEGER DEFAULT 0,
        ideas_created_today    INTEGER DEFAULT 0,
        feedback_given_today   INTEGER DEFAULT 0,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(context, snapshot_date)
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 23. daily_learning_tasks (per-schema) — Source: services/learning-tasks.ts
--     (This is the actual table; "daily_sessions" was a CTE alias)
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.daily_learning_tasks (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                TEXT DEFAULT ''default'',
        context                VARCHAR(20),
        topic                  TEXT,
        description            TEXT,
        category               TEXT,
        priority               VARCHAR(20) DEFAULT ''medium'',
        status                 VARCHAR(20) DEFAULT ''pending'',
        target_completion_date DATE,
        learning_outline       TEXT,
        start_date             DATE DEFAULT CURRENT_DATE,
        completed_at           TIMESTAMPTZ,
        metadata               JSONB DEFAULT ''{}''::jsonb,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 24. learning_sessions (per-schema) — Source: services/learning-tasks.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.learning_sessions (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id           UUID REFERENCES %I.daily_learning_tasks(id) ON DELETE CASCADE,
        user_id           TEXT DEFAULT ''default'',
        session_type      VARCHAR(50),
        duration_minutes  INTEGER DEFAULT 0,
        notes             TEXT,
        key_learnings     TEXT,
        questions         TEXT,
        understanding_level INTEGER DEFAULT 3,
        metadata          JSONB DEFAULT ''{}''::jsonb,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      )', s, s);
  END LOOP;
END $do$;

-- =============================================================================
-- 25. learning_insights (per-schema) — Source: services/learning-tasks.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.learning_insights (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         TEXT DEFAULT ''default'',
        task_id         UUID REFERENCES %I.daily_learning_tasks(id) ON DELETE SET NULL,
        insight_type    VARCHAR(50),
        title           TEXT,
        content         TEXT,
        confidence      DECIMAL DEFAULT 0.5,
        is_acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_at TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )', s, s);
  END LOOP;
END $do$;

-- =============================================================================
-- 26. routine_patterns (per-schema) — Source: services/routine-detection.ts
-- =============================================================================
DO $do$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.routine_patterns (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context        VARCHAR(20),
        pattern_type   VARCHAR(50),
        trigger_config JSONB DEFAULT ''{}''::jsonb,
        action_type    VARCHAR(50),
        action_config  JSONB DEFAULT ''{}''::jsonb,
        confidence     DECIMAL DEFAULT 0.5,
        occurrences    INTEGER DEFAULT 0,
        last_triggered TIMESTAMPTZ,
        is_active      BOOLEAN DEFAULT TRUE,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )', s);
  END LOOP;
END $do$;

-- =============================================================================
-- 27. audit_logs (GLOBAL / public schema) — Source: services/audit-logger.ts
--     Complete CREATE TABLE extracted from source code (ensureTable method)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category           VARCHAR(50) NOT NULL,
  action             VARCHAR(100) NOT NULL,
  severity           VARCHAR(20) NOT NULL DEFAULT 'info',
  actor_type         VARCHAR(20) NOT NULL,
  actor_id           VARCHAR(100),
  actor_name         VARCHAR(255),
  resource_type      VARCHAR(50),
  resource_id        VARCHAR(100),
  resource_name      VARCHAR(255),
  request_ip         VARCHAR(45),
  request_user_agent TEXT,
  request_id         VARCHAR(100),
  request_method     VARCHAR(10),
  request_path       TEXT,
  outcome            VARCHAR(20) NOT NULL,
  details            JSONB,
  metadata           JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
  ON public.audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category
  ON public.audit_logs (category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity
  ON public.audit_logs (severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action);

-- =============================================================================
-- 28. user_integrations (GLOBAL / public schema) — Source: services/github.ts
--     UNIQUE(user_id, provider)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  provider     VARCHAR(50) NOT NULL,
  access_token TEXT,
  scopes       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- =============================================================================
-- Summary
-- =============================================================================
-- Per-schema tables (26 x 4 schemas = 104 table instances):
--   1.  contacts
--   2.  contact_interactions
--   3.  organizations
--   4.  knowledge_connections
--   5.  learned_facts
--   6.  conversation_memory
--   7.  conversation_patterns
--   8.  bookmarks
--   9.  browsing_history
--   10. screen_captures
--   11. financial_accounts
--   12. transactions
--   13. financial_goals
--   14. proactive_briefings
--   15. workflow_patterns
--   16. proactive_suggestions
--   17. idea_corrections
--   18. user_feedback
--   19. draft_suggestions
--   20. proactive_suggestion_feedback
--   21. proactive_settings
--   22. evolution_snapshots
--   23. daily_learning_tasks
--   24. learning_sessions
--   25. learning_insights
--   26. routine_patterns
--
-- Global tables (2):
--   27. audit_logs           (public schema)
--   28. user_integrations    (public schema)
--
-- NOT actual tables (CTEs from the original list):
--   - daily_stats        → CTE in ai-evolution-analytics.ts
--   - daily_activity     → CTE in evolution-analytics.ts
--   - daily_feedback     → CTE in ai-evolution-analytics.ts
--   - category_stats     → CTE in ai-evolution-analytics.ts
--   - idea_clusters      → CTE in proactive-suggestions.ts
--   - daily_sessions     → CTE; real table = learning_sessions

DO $$ BEGIN RAISE NOTICE 'Migration complete: 26 per-schema + 2 global tables created.'; END $$;
