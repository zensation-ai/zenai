-- =====================================================
-- Fix is_archived Column: DEFAULT Value & NULL Cleanup
-- PersonalAIBrain - Critical Bug Fix
-- =====================================================
--
-- Problem: The personal.ideas and work.ideas tables were created using:
--   CREATE TABLE personal.ideas AS SELECT * FROM public.ideas WHERE 1=0;
-- This syntax copies column types but NOT default values or constraints.
-- As a result, is_archived had no DEFAULT and new ideas got NULL instead of false.
-- The query "WHERE is_archived = false" then failed to find these ideas.
--
-- Solution:
-- 1. Set all NULL values to false (fix existing data)
-- 2. Add DEFAULT false to the column (prevent future issues)
--
-- =====================================================

-- Step 1: Fix existing NULL values in personal schema
UPDATE personal.ideas
SET is_archived = false
WHERE is_archived IS NULL;

-- Step 2: Fix existing NULL values in work schema
UPDATE work.ideas
SET is_archived = false
WHERE is_archived IS NULL;

-- Step 3: Set DEFAULT value for personal.ideas.is_archived
ALTER TABLE personal.ideas
ALTER COLUMN is_archived SET DEFAULT false;

-- Step 4: Set DEFAULT value for work.ideas.is_archived
ALTER TABLE work.ideas
ALTER COLUMN is_archived SET DEFAULT false;

-- Step 5: Also ensure NOT NULL constraint (optional but recommended)
-- Uncomment if you want to enforce this:
-- ALTER TABLE personal.ideas ALTER COLUMN is_archived SET NOT NULL;
-- ALTER TABLE work.ideas ALTER COLUMN is_archived SET NOT NULL;

-- =====================================================
-- Verification
-- =====================================================

SELECT
    'personal' as schema,
    COUNT(*) as total_ideas,
    COUNT(*) FILTER (WHERE is_archived = false) as active,
    COUNT(*) FILTER (WHERE is_archived = true) as archived,
    COUNT(*) FILTER (WHERE is_archived IS NULL) as null_values
FROM personal.ideas

UNION ALL

SELECT
    'work' as schema,
    COUNT(*) as total_ideas,
    COUNT(*) FILTER (WHERE is_archived = false) as active,
    COUNT(*) FILTER (WHERE is_archived = true) as archived,
    COUNT(*) FILTER (WHERE is_archived IS NULL) as null_values
FROM work.ideas;

-- Expected result: null_values should be 0 for both schemas

-- =====================================================
-- DONE!
-- =====================================================
--
-- After running this script:
-- - All existing ideas with NULL is_archived are now false
-- - New ideas will automatically get is_archived = false
-- - Voice memo ideas will persist after browser refresh
--
