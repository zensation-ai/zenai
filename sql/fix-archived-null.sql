-- =====================================================
-- Fix is_archived NULL Values
-- PersonalAIBrain - Quick Fix
-- =====================================================
--
-- Problem: is_archived might be NULL instead of false
-- Solution: Set all NULL to false
--
-- =====================================================

-- Update personal schema
UPDATE personal.ideas
SET is_archived = false
WHERE is_archived IS NULL;

-- Update work schema
UPDATE work.ideas
SET is_archived = false
WHERE is_archived IS NULL;

-- Verify
SELECT
    'personal' as schema,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_archived = false) as not_archived,
    COUNT(*) FILTER (WHERE is_archived = true) as archived,
    COUNT(*) FILTER (WHERE is_archived IS NULL) as null_archived
FROM personal.ideas

UNION ALL

SELECT
    'work' as schema,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_archived = false) as not_archived,
    COUNT(*) FILTER (WHERE is_archived = true) as archived,
    COUNT(*) FILTER (WHERE is_archived IS NULL) as null_archived
FROM work.ideas;

-- =====================================================
-- DONE!
-- =====================================================
--
-- All ideas should now have is_archived = false
-- API queries will work correctly
--
