-- Migration: Add preferred_contexts column to user_profile
-- Supports context-aware learning (personal/work/learning/creative)

DO $$
BEGIN
    -- Add preferred_contexts to public.user_profile
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'preferred_contexts') THEN
        ALTER TABLE public.user_profile ADD COLUMN preferred_contexts JSONB DEFAULT '{}';
    END IF;

    -- Add to personal schema if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'personal' AND table_name = 'user_profile') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'personal' AND table_name = 'user_profile' AND column_name = 'preferred_contexts') THEN
            ALTER TABLE personal.user_profile ADD COLUMN preferred_contexts JSONB DEFAULT '{}';
        END IF;
    END IF;

    -- Add to work schema if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'work' AND table_name = 'user_profile') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'work' AND table_name = 'user_profile' AND column_name = 'preferred_contexts') THEN
            ALTER TABLE work.user_profile ADD COLUMN preferred_contexts JSONB DEFAULT '{}';
        END IF;
    END IF;

    -- Add to learning schema if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'learning' AND table_name = 'user_profile') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'learning' AND table_name = 'user_profile' AND column_name = 'preferred_contexts') THEN
            ALTER TABLE learning.user_profile ADD COLUMN preferred_contexts JSONB DEFAULT '{}';
        END IF;
    END IF;

    -- Add to creative schema if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'creative' AND table_name = 'user_profile') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'creative' AND table_name = 'user_profile' AND column_name = 'preferred_contexts') THEN
            ALTER TABLE creative.user_profile ADD COLUMN preferred_contexts JSONB DEFAULT '{}';
        END IF;
    END IF;
END $$;
