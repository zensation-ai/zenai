-- =====================================================
-- Fix user_profile Table: Add Missing Columns
-- PersonalAIBrain - Schema Migration Fix
-- =====================================================
--
-- Problem: The user_profile table is missing columns that the code expects:
-- - preferred_categories
-- - preferred_types
-- - topic_interests
-- - active_hours
-- - productivity_patterns
-- - priority_keywords
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add missing columns to personal.user_profile
ALTER TABLE personal.user_profile
ADD COLUMN IF NOT EXISTS preferred_categories JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS preferred_types JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS topic_interests JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS active_hours JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS productivity_patterns JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS priority_keywords JSONB DEFAULT '{"high": [], "medium": [], "low": []}',
ADD COLUMN IF NOT EXISTS auto_priority_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS total_ideas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_meetings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_ideas_per_day FLOAT DEFAULT 0;

-- Add missing columns to work.user_profile (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'work' AND table_name = 'user_profile') THEN
    ALTER TABLE work.user_profile
    ADD COLUMN IF NOT EXISTS preferred_categories JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS preferred_types JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS topic_interests JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS active_hours JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS productivity_patterns JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS priority_keywords JSONB DEFAULT '{"high": [], "medium": [], "low": []}',
    ADD COLUMN IF NOT EXISTS auto_priority_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS total_ideas INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_meetings INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_ideas_per_day FLOAT DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- Verification
-- =====================================================

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'personal' AND table_name = 'user_profile'
ORDER BY ordinal_position;

-- Expected: Should now include preferred_categories, preferred_types, etc.
