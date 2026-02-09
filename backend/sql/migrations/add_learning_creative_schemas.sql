-- Migration: Add learning and creative schemas
-- Phase 34: Support 4 contexts (personal, work, learning, creative)
--
-- Run this manually in Supabase SQL Editor
-- The migration creates learning and creative schemas with the same table structure
-- as the existing personal/work schemas.

-- Step 1: Create new schemas
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS creative;

-- Step 2: Ensure extensions are available
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 3: Create the update_updated_at function in each new schema
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['learning', 'creative']) LOOP
    EXECUTE format('
      CREATE OR REPLACE FUNCTION %I.update_updated_at_column()
      RETURNS TRIGGER AS $func$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;
    ', schema_name);
  END LOOP;
END $$;

-- Step 4: Create all tables in both new schemas
-- Using a DO block to iterate over both schemas
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['learning', 'creative']) LOOP

    -- ideas
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.ideas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        type VARCHAR(50) DEFAULT ''idea'',
        category VARCHAR(50) DEFAULT ''general'',
        priority VARCHAR(20) DEFAULT ''medium'',
        summary TEXT,
        raw_input TEXT,
        raw_transcript TEXT,
        next_steps TEXT,
        context_needed TEXT,
        keywords TEXT[],
        context VARCHAR(20) DEFAULT ''personal'',
        embedding vector(768),
        is_archived BOOLEAN DEFAULT FALSE,
        primary_topic_id UUID,
        company_id UUID,
        viewed_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- voice_memos
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.voice_memos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raw_text TEXT NOT NULL,
        context VARCHAR(20) DEFAULT ''personal'',
        embedding vector(768),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- idea_relations
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

    -- idea_topics
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

    -- idea_topic_memberships
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.idea_topic_memberships (
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        topic_id UUID REFERENCES %I.idea_topics(id) ON DELETE CASCADE,
        membership_score DECIMAL(3,2) DEFAULT 0.5,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY(idea_id, topic_id)
      )', s, s, s);

    -- loose_thoughts
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

    -- thought_clusters
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

    -- user_profile
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.user_profile (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) UNIQUE,
        name VARCHAR(200),
        preferences JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- user_training
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.user_training (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE SET NULL,
        context VARCHAR(20),
        training_type VARCHAR(50) NOT NULL,
        original_value TEXT,
        corrected_value TEXT,
        corrected_category VARCHAR(50),
        corrected_priority VARCHAR(20),
        corrected_type VARCHAR(50),
        tone_feedback VARCHAR(50),
        feedback TEXT,
        weight INTEGER DEFAULT 5,
        applied BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- pattern_predictions
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

    -- interaction_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.interaction_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE SET NULL,
        interaction_type VARCHAR(50) NOT NULL,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- media_items
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.media_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        media_type VARCHAR(20) NOT NULL,
        filename VARCHAR(500) NOT NULL,
        file_path TEXT NOT NULL,
        mime_type VARCHAR(100),
        file_size BIGINT DEFAULT 0,
        caption TEXT,
        context VARCHAR(20) DEFAULT ''personal'',
        embedding vector(768),
        thumbnail_path TEXT,
        duration_seconds INTEGER,
        width INTEGER,
        height INTEGER,
        ocr_text TEXT,
        ai_description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- push_tokens
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100),
        token TEXT UNIQUE NOT NULL,
        platform VARCHAR(20),
        device_name VARCHAR(200),
        device_id VARCHAR(200),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- notification_preferences
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

    -- notification_history
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

    -- digests
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

    -- productivity_goals
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

    -- user_goals
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

    -- analytics_events
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        context VARCHAR(20),
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- personalization_sessions
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

    -- personalization_facts
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.personalization_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) DEFAULT ''default'',
        session_id UUID REFERENCES %I.personalization_sessions(id) ON DELETE CASCADE,
        category VARCHAR(100) NOT NULL,
        fact_key VARCHAR(200) NOT NULL,
        fact_value TEXT NOT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.5,
        source VARCHAR(50) DEFAULT ''conversation'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, category, fact_key)
      )', s, s);

    -- chat_messages (personalization)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES %I.personalization_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- general_chat_sessions (if exists in personal schema)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.general_chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) DEFAULT ''personal'',
        title VARCHAR(500),
        mode VARCHAR(50) DEFAULT ''conversation'',
        message_count INTEGER DEFAULT 0,
        last_message_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- general_chat_messages
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.general_chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES %I.general_chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT,
        thinking TEXT,
        tool_calls JSONB,
        tool_results JSONB,
        metadata JSONB DEFAULT ''{}''::jsonb,
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- triage_history
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.triage_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id UUID REFERENCES %I.ideas(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        previous_priority VARCHAR(20),
        new_priority VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- notifications
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

    -- ai_activity_log
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.ai_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_type VARCHAR(100) NOT NULL,
        message TEXT,
        idea_id UUID,
        metadata JSONB DEFAULT ''{}''::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- learning_tasks
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

    -- study_sessions
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

    -- learning_insights
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

    RAISE NOTICE 'Created all tables in schema: %', s;
  END LOOP;
END $$;

-- Step 5: Create indexes in both new schemas
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['learning', 'creative']) LOOP
    -- ideas indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_type ON %I.ideas(type)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_category ON %I.ideas(category)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_priority ON %I.ideas(priority)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_context ON %I.ideas(context)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_is_archived ON %I.ideas(is_archived)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON %I.ideas(created_at DESC)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_archived_created ON %I.ideas(is_archived, created_at DESC)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ideas_updated_at ON %I.ideas(updated_at DESC)', s);

    -- voice_memos indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_voice_memos_context ON %I.voice_memos(context)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_voice_memos_created_at ON %I.voice_memos(created_at DESC)', s);

    -- idea_relations indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_idea_relations_source ON %I.idea_relations(source_id)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_idea_relations_target ON %I.idea_relations(target_id)', s);

    -- idea_topics indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_idea_topics_context ON %I.idea_topics(context)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_idea_topics_name ON %I.idea_topics(name)', s);

    -- general_chat indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_chat_sessions_context_updated ON %I.general_chat_sessions(context, updated_at DESC)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON %I.general_chat_messages(session_id, created_at ASC)', s);

    -- media indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_media_context ON %I.media_items(context)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_media_created_at ON %I.media_items(created_at DESC)', s);

    -- learning_tasks indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_learning_tasks_user ON %I.learning_tasks(user_id)', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_learning_tasks_status ON %I.learning_tasks(status)', s);

    RAISE NOTICE 'Created indexes in schema: %', s;
  END LOOP;
END $$;

-- Step 6: Create triggers for updated_at in both schemas
DO $$
DECLARE
  s TEXT;
  tbl TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['learning', 'creative']) LOOP
    FOR tbl IN SELECT unnest(ARRAY[
      'ideas', 'voice_memos', 'idea_topics', 'thought_clusters',
      'user_profile', 'user_training', 'media_items', 'push_tokens',
      'notification_preferences', 'user_goals', 'personalization_sessions',
      'personalization_facts', 'general_chat_sessions', 'learning_tasks'
    ]) LOOP
      BEGIN
        EXECUTE format('
          CREATE TRIGGER update_%s_updated_at
          BEFORE UPDATE ON %I.%I
          FOR EACH ROW EXECUTE FUNCTION %I.update_updated_at_column()
        ', tbl, s, tbl, s);
      EXCEPTION WHEN duplicate_object THEN
        NULL; -- Trigger already exists
      END;
    END LOOP;
    RAISE NOTICE 'Created triggers in schema: %', s;
  END LOOP;
END $$;

-- Step 7: Update context CHECK constraint on ideas table (all schemas)
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.ideas DROP CONSTRAINT IF EXISTS chk_ideas_context', s);
      EXECUTE format('ALTER TABLE %I.ideas ADD CONSTRAINT chk_ideas_context CHECK (context IN (''personal'', ''work'', ''learning'', ''creative''))', s);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not update constraint in schema %: %', s, SQLERRM;
    END;
  END LOOP;
END $$;

-- Done!
-- Run: SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('learning', 'creative') ORDER BY schemaname, tablename;
-- to verify the migration was successful.
