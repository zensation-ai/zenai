-- ==============================================
-- Migration: Fix user_profile table schema
-- Run this in Supabase SQL Editor
-- ==============================================

-- This migration adds the missing columns to user_profile table
-- and creates the table in personal and work schemas

-- Step 1: Create schemas if they don't exist
CREATE SCHEMA IF NOT EXISTS personal;
CREATE SCHEMA IF NOT EXISTS work;

-- Step 2: Add missing columns to public.user_profile (if it exists)
DO $$
BEGIN
    -- Add preferred_categories if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'preferred_categories') THEN
        ALTER TABLE public.user_profile ADD COLUMN preferred_categories JSONB DEFAULT '{}';
    END IF;

    -- Add preferred_types if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'preferred_types') THEN
        ALTER TABLE public.user_profile ADD COLUMN preferred_types JSONB DEFAULT '{}';
    END IF;

    -- Add topic_interests if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'topic_interests') THEN
        ALTER TABLE public.user_profile ADD COLUMN topic_interests JSONB DEFAULT '{}';
    END IF;

    -- Add active_hours if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'active_hours') THEN
        ALTER TABLE public.user_profile ADD COLUMN active_hours JSONB DEFAULT '{}';
    END IF;

    -- Add productivity_patterns if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'productivity_patterns') THEN
        ALTER TABLE public.user_profile ADD COLUMN productivity_patterns JSONB DEFAULT '{}';
    END IF;

    -- Add total_ideas if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'total_ideas') THEN
        ALTER TABLE public.user_profile ADD COLUMN total_ideas INTEGER DEFAULT 0;
    END IF;

    -- Add total_meetings if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'total_meetings') THEN
        ALTER TABLE public.user_profile ADD COLUMN total_meetings INTEGER DEFAULT 0;
    END IF;

    -- Add avg_ideas_per_day if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'avg_ideas_per_day') THEN
        ALTER TABLE public.user_profile ADD COLUMN avg_ideas_per_day NUMERIC(10,2) DEFAULT 0;
    END IF;

    -- Add priority_keywords if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'priority_keywords') THEN
        ALTER TABLE public.user_profile ADD COLUMN priority_keywords JSONB DEFAULT '{"high": [], "medium": [], "low": []}';
    END IF;

    -- Add auto_priority_enabled if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'auto_priority_enabled') THEN
        ALTER TABLE public.user_profile ADD COLUMN auto_priority_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add thinking_patterns if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'thinking_patterns') THEN
        ALTER TABLE public.user_profile ADD COLUMN thinking_patterns JSONB;
    END IF;

    -- Add language_style if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'language_style') THEN
        ALTER TABLE public.user_profile ADD COLUMN language_style JSONB;
    END IF;

    -- Add interest_embedding if not exists (for vector similarity)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'interest_embedding') THEN
        -- Note: vector(768) requires pgvector extension
        ALTER TABLE public.user_profile ADD COLUMN interest_embedding vector(768);
    END IF;
END $$;

-- Step 3: Create user_profile in personal schema
SET search_path TO personal, public;

CREATE TABLE IF NOT EXISTS user_profile (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
    name VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    preferred_categories JSONB DEFAULT '{}',
    preferred_types JSONB DEFAULT '{}',
    topic_interests JSONB DEFAULT '{}',
    active_hours JSONB DEFAULT '{}',
    productivity_patterns JSONB DEFAULT '{}',
    total_ideas INTEGER DEFAULT 0,
    total_meetings INTEGER DEFAULT 0,
    avg_ideas_per_day NUMERIC(10,2) DEFAULT 0,
    priority_keywords JSONB DEFAULT '{"high": [], "medium": [], "low": []}',
    auto_priority_enabled BOOLEAN DEFAULT false,
    thinking_patterns JSONB,
    language_style JSONB,
    interest_embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default profile if not exists
INSERT INTO personal.user_profile (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Step 4: Create user_profile in work schema
SET search_path TO work, public;

CREATE TABLE IF NOT EXISTS user_profile (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
    name VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    preferred_categories JSONB DEFAULT '{}',
    preferred_types JSONB DEFAULT '{}',
    topic_interests JSONB DEFAULT '{}',
    active_hours JSONB DEFAULT '{}',
    productivity_patterns JSONB DEFAULT '{}',
    total_ideas INTEGER DEFAULT 0,
    total_meetings INTEGER DEFAULT 0,
    avg_ideas_per_day NUMERIC(10,2) DEFAULT 0,
    priority_keywords JSONB DEFAULT '{"high": [], "medium": [], "low": []}',
    auto_priority_enabled BOOLEAN DEFAULT false,
    thinking_patterns JSONB,
    language_style JSONB,
    interest_embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default profile if not exists
INSERT INTO work.user_profile (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Reset search_path
SET search_path TO public;

-- Verify
SELECT 'Migration completed!' as status;
SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'user_profile' ORDER BY schemaname;
