-- =====================================================
-- MIGRATION: Full Schema Parity Across All 4 Contexts
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-09
-- =====================================================
--
-- Problem: personal/work schemas have 19/18 tables,
--          learning/creative have 30 tables.
--          22 tables missing from personal/work,
--          10 tables missing from learning/creative.
--
-- Solution: Create ALL missing tables in ALL schemas
--           using CREATE TABLE IF NOT EXISTS for idempotency.
--
-- Run this in Supabase SQL Editor.
-- =====================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PART 1: Core tables (from learning/creative migration)
-- Run against ALL schemas for full idempotent parity.
-- =====================================================
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- 1. voice_memos
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.voice_memos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raw_text TEXT NOT NULL,
        context VARCHAR(20) DEFAULT ''personal'',
        embedding vector(768),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 2. idea_relations (new canonical table, alongside legacy idea_relationships)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_relations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        target_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        relation_type VARCHAR(50) NOT NULL,
        strength DECIMAL(3,2) DEFAULT 0.5,
        context VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(source_id, target_id)
      )', s, s, s);

    -- 3. idea_topics
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_topics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        color VARCHAR(7),
        icon VARCHAR(10),
        centroid_embedding vector(768),
        idea_count INTEGER DEFAULT 0,
        is_auto_generated BOOLEAN DEFAULT FALSE,
        confidence_score DECIMAL(3,2) DEFAULT 0.5,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 4. idea_topic_memberships
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_topic_memberships (
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        topic_id UUID REFERENCES %I.idea_topics(id) ON DELETE CASCADE,
        membership_score DECIMAL(3,2) DEFAULT 0.5,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY(idea_id, topic_id)
      )', s, s, s);

    -- 5. loose_thoughts
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.loose_thoughts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        raw_input TEXT NOT NULL,
        source VARCHAR(50) DEFAULT ''manual'',
        user_tags JSONB DEFAULT ''[]''::jsonb,
        embedding vector(768),
        cluster_id UUID,
        similarity_to_cluster DECIMAL(5,4),
        is_processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 6. thought_clusters
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.thought_clusters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        title VARCHAR(500),
        summary TEXT,
        suggested_type VARCHAR(50),
        suggested_category VARCHAR(50),
        centroid_embedding vector(768),
        thought_count INTEGER DEFAULT 0,
        confidence_score DECIMAL(3,2) DEFAULT 0.0,
        maturity_score DECIMAL(3,2) DEFAULT 0.0,
        status VARCHAR(20) DEFAULT ''forming'',
        consolidated_idea_id UUID REFERENCES %I.ideas(id) ON DELETE SET NULL,
        presented_at TIMESTAMP WITH TIME ZONE,
        consolidated_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- 7. pattern_predictions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.pattern_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100),
        pattern_type VARCHAR(50) NOT NULL,
        pattern_data JSONB DEFAULT ''{}''::jsonb,
        confidence DECIMAL(3,2) DEFAULT 0.0,
        sample_count INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 8. interaction_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.interaction_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE SET NULL,
        interaction_type VARCHAR(50) NOT NULL,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- 9. notification_preferences
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) UNIQUE,
        daily_digest BOOLEAN DEFAULT TRUE,
        weekly_insights BOOLEAN DEFAULT TRUE,
        idea_reminders BOOLEAN DEFAULT TRUE,
        incubator_alerts BOOLEAN DEFAULT TRUE,
        quiet_hours_start TIME,
        quiet_hours_end TIME,
        timezone VARCHAR(50) DEFAULT ''Europe/Berlin'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 10. notification_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.notification_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100),
        notification_type VARCHAR(50) NOT NULL,
        title TEXT,
        body TEXT,
        data JSONB,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        read_at TIMESTAMP WITH TIME ZONE,
        clicked_at TIMESTAMP WITH TIME ZONE
      )', s);

    -- 11. digests
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.digests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL CHECK (type IN (''daily'', ''weekly'')),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        title TEXT,
        summary TEXT,
        highlights JSONB DEFAULT ''[]''::jsonb,
        statistics JSONB DEFAULT ''{}''::jsonb,
        ai_insights TEXT[],
        recommendations TEXT[],
        ideas_count INTEGER DEFAULT 0,
        top_categories TEXT[],
        top_types TEXT[],
        productivity_score DECIMAL(5,2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notified_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(type, period_start, period_end)
      )', s);

    -- 12. productivity_goals (single-row pattern)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.productivity_goals (
        id INTEGER PRIMARY KEY DEFAULT 1,
        daily_ideas_target INTEGER DEFAULT 3,
        weekly_ideas_target INTEGER DEFAULT 15,
        focus_categories TEXT[],
        enabled_insights BOOLEAN DEFAULT TRUE,
        digest_time TIME DEFAULT ''08:00'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT %I_single_row CHECK (id = 1)
      )', s, s || '_productivity_goals');
    EXECUTE format('INSERT INTO %I.productivity_goals (id) VALUES (1) ON CONFLICT (id) DO NOTHING', s);

    -- 13. user_goals
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.user_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        context VARCHAR(20) DEFAULT ''personal'',
        title VARCHAR(500) NOT NULL,
        description TEXT,
        target_date DATE,
        status VARCHAR(20) DEFAULT ''active'',
        progress DECIMAL(5,2) DEFAULT 0.0,
        linked_ideas UUID[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 14. analytics_events
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        context VARCHAR(20),
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 15. personalization_sessions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.personalization_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        status VARCHAR(20) DEFAULT ''active'',
        current_phase INTEGER DEFAULT 1,
        questions_asked INTEGER DEFAULT 0,
        facts_collected INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 16. chat_messages (personalization)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES %I.personalization_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- 17. triage_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.triage_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        previous_priority VARCHAR(20),
        new_priority VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- 18. notifications
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(500),
        message TEXT,
        data JSONB DEFAULT ''{}''::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 19. ai_activity_log
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.ai_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_type VARCHAR(100) NOT NULL,
        title VARCHAR(500),
        description TEXT,
        metadata JSONB DEFAULT ''{}''::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 20. learning_tasks
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.learning_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        topic VARCHAR(500) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        priority VARCHAR(20) DEFAULT ''medium'',
        status VARCHAR(20) DEFAULT ''active'',
        progress DECIMAL(5,2) DEFAULT 0.0,
        target_completion_date DATE,
        learning_outline JSONB,
        summary TEXT,
        total_study_minutes INTEGER DEFAULT 0,
        session_count INTEGER DEFAULT 0,
        avg_understanding DECIMAL(3,2) DEFAULT 0.0,
        next_review_at TIMESTAMP WITH TIME ZONE,
        review_interval_days INTEGER DEFAULT 1,
        recall_streak INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 21. study_sessions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.study_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES %I.learning_tasks(id) ON DELETE CASCADE,
        user_id VARCHAR(100) DEFAULT ''default'',
        session_type VARCHAR(50) DEFAULT ''study'',
        duration_minutes INTEGER,
        notes TEXT,
        key_learnings TEXT[],
        questions TEXT[],
        understanding_level INTEGER CHECK (understanding_level BETWEEN 1 AND 5),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- 22. learning_insights
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.learning_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        insight_type VARCHAR(100),
        title VARCHAR(500),
        description TEXT,
        data JSONB DEFAULT ''{}''::jsonb,
        acknowledged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    RAISE NOTICE 'Part 1 complete: Core tables ensured in schema %', s;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Extended tables (from personal/work migrations)
-- Run against ALL schemas for full idempotent parity.
-- =====================================================
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- 1. idea_drafts
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id UUID NOT NULL REFERENCES %I.ideas(id) ON DELETE CASCADE,
        context VARCHAR(50) NOT NULL DEFAULT ''personal'',
        draft_type VARCHAR(50) NOT NULL,
        trigger_pattern VARCHAR(200),
        trigger_text VARCHAR(500),
        content TEXT NOT NULL,
        word_count INTEGER,
        language VARCHAR(10) DEFAULT ''de'',
        related_idea_ids UUID[],
        research_id UUID,
        profile_snapshot JSONB,
        status VARCHAR(20) DEFAULT ''ready'',
        generation_time_ms INTEGER,
        user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
        user_feedback TEXT,
        edits_made INTEGER DEFAULT 0,
        content_reused_percent INTEGER,
        feedback_count INTEGER DEFAULT 0,
        last_feedback_at TIMESTAMPTZ,
        feedback_sentiment VARCHAR(20),
        quality_score DECIMAL(4,2),
        copy_count INTEGER DEFAULT 0,
        last_copy_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        viewed_at TIMESTAMPTZ,
        used_at TIMESTAMPTZ,
        discarded_at TIMESTAMPTZ
      )', s, s);

    -- 2. draft_trigger_patterns
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.draft_trigger_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(50) NOT NULL DEFAULT ''personal'',
        draft_type VARCHAR(50) NOT NULL,
        pattern_text VARCHAR(200) NOT NULL,
        pattern_type VARCHAR(20) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        times_triggered INTEGER DEFAULT 0,
        times_used INTEGER DEFAULT 0,
        times_discarded INTEGER DEFAULT 0,
        avg_rating DECIMAL(3,2),
        success_rate DECIMAL(5,2),
        quality_score DECIMAL(4,2),
        consecutive_low_ratings INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(context, draft_type, pattern_text)
      )', s);

    -- 3. draft_feedback_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.draft_feedback_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        draft_id UUID NOT NULL REFERENCES %I.idea_drafts(id) ON DELETE CASCADE,
        context VARCHAR(50) NOT NULL DEFAULT ''personal'',
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        feedback_text TEXT,
        content_reused_percent INTEGER CHECK (content_reused_percent >= 0 AND content_reused_percent <= 100),
        edits_description TEXT,
        edit_categories VARCHAR(50)[],
        original_word_count INTEGER,
        final_word_count INTEGER,
        was_helpful BOOLEAN,
        would_use_again BOOLEAN,
        quality_aspects JSONB,
        feedback_sentiment VARCHAR(20),
        improvement_areas VARCHAR(100)[],
        feedback_source VARCHAR(30) DEFAULT ''manual'',
        session_duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', s, s);

    -- 4. draft_learning_suggestions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.draft_learning_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(50) NOT NULL DEFAULT ''personal'',
        draft_type VARCHAR(50) NOT NULL,
        suggestion_type VARCHAR(30) NOT NULL,
        suggestion_text TEXT NOT NULL,
        rationale TEXT,
        based_on_feedback_count INTEGER,
        avg_rating_before DECIMAL(3,2),
        common_issues VARCHAR(100)[],
        priority VARCHAR(20) DEFAULT ''medium'',
        status VARCHAR(20) DEFAULT ''pending'',
        applied_at TIMESTAMPTZ,
        avg_rating_after DECIMAL(3,2),
        improvement_percent DECIMAL(5,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', s);

    -- 5. export_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.export_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        export_type VARCHAR(20) NOT NULL CHECK (export_type IN (''pdf'', ''markdown'', ''csv'', ''json'', ''backup'')),
        filename VARCHAR(255),
        file_size BIGINT,
        ideas_count INTEGER DEFAULT 0,
        filters JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 6. personal_facts
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.personal_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(50) NOT NULL,
        fact_key VARCHAR(100) NOT NULL,
        fact_value TEXT NOT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.8,
        source VARCHAR(20) DEFAULT ''conversation'',
        asked_question TEXT,
        user_response TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT %I_personal_facts_unique UNIQUE (category, fact_key)
      )', s, s);

    -- 7. personalization_conversations
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.personalization_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN (''ai'', ''user'')),
        message TEXT NOT NULL,
        facts_extracted JSONB DEFAULT ''[]'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- 8. personalization_topics
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.personalization_topics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic VARCHAR(100) NOT NULL,
        questions_asked INTEGER DEFAULT 0,
        last_asked_at TIMESTAMP WITH TIME ZONE,
        completion_level DECIMAL(3,2) DEFAULT 0.0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT %I_personalization_topics_topic_unique UNIQUE (topic)
      )', s, s);

    -- Insert default topics
    EXECUTE format('
      INSERT INTO %I.personalization_topics (topic, completion_level)
      SELECT topic, 0.0
      FROM (VALUES
        (''basic_info''), (''personality''), (''work_life''),
        (''goals_dreams''), (''interests_hobbies''), (''communication_style''),
        (''decision_making''), (''daily_routines''), (''values_beliefs''),
        (''challenges'')
      ) AS t(topic)
      WHERE NOT EXISTS (SELECT 1 FROM %I.personalization_topics LIMIT 1)
      ON CONFLICT DO NOTHING
    ', s, s);

    -- 9. rate_limits
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.rate_limits (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL,
        window_start TIMESTAMP WITH TIME ZONE NOT NULL,
        request_count INTEGER DEFAULT 1,
        UNIQUE(key, window_start)
      )', s);

    -- 10. idea_relationships (legacy table for parity)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_idea_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        target_idea_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        relationship_type TEXT,
        confidence NUMERIC,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s, s);

    RAISE NOTICE 'Part 2 complete: Extended tables ensured in schema %', s;
  END LOOP;
END $$;

-- =====================================================
-- PART 3: Indexes for ALL schemas
-- =====================================================
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- voice_memos
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_voice_memos_context ON %I.voice_memos(context)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_voice_memos_created ON %I.voice_memos(created_at DESC)', s, s);

    -- idea_relations
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_source ON %I.idea_relations(source_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_target ON %I.idea_relations(target_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_context ON %I.idea_relations(context)', s, s);

    -- idea_topics
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_topics_context ON %I.idea_topics(context)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_topics_name ON %I.idea_topics(name)', s, s);

    -- idea_topic_memberships
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_topic_memberships_topic ON %I.idea_topic_memberships(topic_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_topic_memberships_idea ON %I.idea_topic_memberships(idea_id)', s, s);

    -- loose_thoughts
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_loose_thoughts_user ON %I.loose_thoughts(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_loose_thoughts_processed ON %I.loose_thoughts(is_processed)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_loose_thoughts_cluster ON %I.loose_thoughts(cluster_id)', s, s);

    -- thought_clusters
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_thought_clusters_user ON %I.thought_clusters(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_thought_clusters_status ON %I.thought_clusters(status)', s, s);

    -- notification_preferences (unique constraint is the index)

    -- notification_history
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notif_history_user ON %I.notification_history(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notif_history_type ON %I.notification_history(notification_type)', s, s);

    -- digests
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_digests_type ON %I.digests(type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_digests_created ON %I.digests(created_at DESC)', s, s);

    -- user_goals
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_goals_user ON %I.user_goals(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_goals_status ON %I.user_goals(status)', s, s);

    -- analytics_events
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_analytics_type ON %I.analytics_events(event_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_analytics_created ON %I.analytics_events(created_at DESC)', s, s);

    -- personalization_sessions
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_sessions_user ON %I.personalization_sessions(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_sessions_status ON %I.personalization_sessions(status)', s, s);

    -- chat_messages
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chat_msgs_session ON %I.chat_messages(session_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chat_msgs_created ON %I.chat_messages(created_at)', s, s);

    -- triage_history
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_triage_idea ON %I.triage_history(idea_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_triage_created ON %I.triage_history(created_at DESC)', s, s);

    -- notifications
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notifications_type ON %I.notifications(type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notifications_read ON %I.notifications(is_read)', s, s);

    -- ai_activity_log
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ai_activity_type ON %I.ai_activity_log(activity_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ai_activity_created ON %I.ai_activity_log(created_at DESC)', s, s);

    -- learning_tasks
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_learning_tasks_user ON %I.learning_tasks(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_learning_tasks_status ON %I.learning_tasks(status)', s, s);

    -- study_sessions
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_study_sessions_task ON %I.study_sessions(task_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_study_sessions_user ON %I.study_sessions(user_id)', s, s);

    -- learning_insights
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_learning_insights_user ON %I.learning_insights(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_learning_insights_type ON %I.learning_insights(insight_type)', s, s);

    -- idea_drafts
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_drafts_idea ON %I.idea_drafts(idea_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_drafts_context ON %I.idea_drafts(context)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_drafts_status ON %I.idea_drafts(status)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_drafts_type ON %I.idea_drafts(draft_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_drafts_created ON %I.idea_drafts(created_at DESC)', s, s);

    -- draft_trigger_patterns
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_draft_patterns_type ON %I.draft_trigger_patterns(draft_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_draft_patterns_active ON %I.draft_trigger_patterns(is_active)', s, s);

    -- draft_feedback_history
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_draft_feedback_draft ON %I.draft_feedback_history(draft_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_draft_feedback_created ON %I.draft_feedback_history(created_at DESC)', s, s);

    -- draft_learning_suggestions
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_draft_learn_type ON %I.draft_learning_suggestions(draft_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_draft_learn_status ON %I.draft_learning_suggestions(status)', s, s);

    -- export_history
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_export_type ON %I.export_history(export_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_export_created ON %I.export_history(created_at DESC)', s, s);

    -- personal_facts
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_personal_facts_cat ON %I.personal_facts(category)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_personal_facts_key ON %I.personal_facts(fact_key)', s, s);

    -- personalization_conversations
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_conv_session ON %I.personalization_conversations(session_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_conv_created ON %I.personalization_conversations(created_at DESC)', s, s);

    -- personalization_topics
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_topics_topic ON %I.personalization_topics(topic)', s, s);

    -- rate_limits
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_rate_limits_key ON %I.rate_limits(key, window_start)', s, s);

    -- general_chat_sessions (ensure indexes exist)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_gchat_sessions_ctx ON %I.general_chat_sessions(context, updated_at DESC)', s, s);

    -- general_chat_messages (ensure indexes exist)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_gchat_msgs_session ON %I.general_chat_messages(session_id, created_at ASC)', s, s);

    -- ideas (ensure standard indexes exist)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_type ON %I.ideas(type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_category ON %I.ideas(category)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_priority ON %I.ideas(priority)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_archived ON %I.ideas(is_archived)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_created ON %I.ideas(created_at DESC)', s, s);

    -- media_items (ensure indexes exist)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_media_context ON %I.media_items(context)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_media_created ON %I.media_items(created_at DESC)', s, s);

    RAISE NOTICE 'Part 3 complete: Indexes created for schema %', s;
  END LOOP;
END $$;

-- =====================================================
-- PART 4: Triggers for updated_at in ALL schemas
-- =====================================================
DO $$
DECLARE
  s TEXT;
  tbl TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- Ensure the update function exists in each schema
    EXECUTE format('
      CREATE OR REPLACE FUNCTION %I.update_updated_at_column()
      RETURNS TRIGGER AS $func$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;
    ', s);

    -- Tables with updated_at columns
    FOR tbl IN SELECT unnest(ARRAY[
      'ideas', 'voice_memos', 'idea_topics', 'thought_clusters',
      'user_profile', 'user_training', 'media_items', 'push_tokens',
      'notification_preferences', 'user_goals', 'personalization_sessions',
      'personalization_facts', 'general_chat_sessions', 'learning_tasks',
      'loose_thoughts', 'idea_drafts', 'draft_trigger_patterns',
      'draft_learning_suggestions', 'productivity_goals', 'personal_facts',
      'personalization_topics'
    ]) LOOP
      BEGIN
        EXECUTE format('
          CREATE TRIGGER update_%s_updated_at
          BEFORE UPDATE ON %I.%I
          FOR EACH ROW EXECUTE FUNCTION %I.update_updated_at_column()
        ', tbl, s, tbl, s);
      EXCEPTION
        WHEN duplicate_object THEN NULL;  -- Trigger already exists
        WHEN undefined_table THEN NULL;   -- Table might not have updated_at
      END;
    END LOOP;

    RAISE NOTICE 'Part 4 complete: Triggers created for schema %', s;
  END LOOP;
END $$;

-- =====================================================
-- PART 5: Verification
-- =====================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Schema Parity Migration Complete!';
  RAISE NOTICE '============================================';

  FOR r IN
    SELECT schemaname, count(*) as table_count
    FROM pg_tables
    WHERE schemaname IN ('personal', 'work', 'learning', 'creative')
    GROUP BY schemaname
    ORDER BY schemaname
  LOOP
    RAISE NOTICE '  %: % tables', r.schemaname, r.table_count;
  END LOOP;

  RAISE NOTICE '============================================';
END $$;

-- Verify with a query you can check:
SELECT schemaname, count(*) as table_count
FROM pg_tables
WHERE schemaname IN ('personal', 'work', 'learning', 'creative')
GROUP BY schemaname
ORDER BY schemaname;
