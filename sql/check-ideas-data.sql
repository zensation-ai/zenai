-- =====================================================
-- Check Ideas Data Status
-- PersonalAIBrain - Debugging Empty Results
-- =====================================================

-- Check row counts
SELECT
    'personal' as schema,
    COUNT(*) as total_ideas,
    COUNT(*) FILTER (WHERE title IS NOT NULL) as has_title,
    COUNT(*) FILTER (WHERE title IS NULL) as null_title,
    COUNT(*) FILTER (WHERE is_archived = false) as not_archived,
    COUNT(*) FILTER (WHERE is_archived = true) as archived,
    COUNT(*) FILTER (WHERE is_archived IS NULL) as null_archived
FROM personal.ideas

UNION ALL

SELECT
    'work' as schema,
    COUNT(*) as total_ideas,
    COUNT(*) FILTER (WHERE title IS NOT NULL) as has_title,
    COUNT(*) FILTER (WHERE title IS NULL) as null_title,
    COUNT(*) FILTER (WHERE is_archived = false) as not_archived,
    COUNT(*) FILTER (WHERE is_archived = true) as archived,
    COUNT(*) FILTER (WHERE is_archived IS NULL) as null_archived
FROM work.ideas;

-- Show sample data from work schema
SELECT
    id,
    title,
    LEFT(content, 50) as content_preview,
    type,
    priority,
    is_archived,
    created_at
FROM work.ideas
LIMIT 5;