-- =====================================================
-- Add Structured Columns to Ideas Table
-- PersonalAIBrain - Schema Extension
-- =====================================================
--
-- PURPOSE: Add structured columns that routes expect
-- IMPACT: Routes will work, JSONB stays for flexibility
--
-- This extends the JSONB-based schema with typed columns
-- for better performance and type safety.
-- =====================================================

-- Helper function to add columns to both schemas
CREATE OR REPLACE FUNCTION add_structured_columns_to_ideas()
RETURNS void AS $$
DECLARE
    schema_name text;
BEGIN
    -- Loop through both schemas
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        RAISE NOTICE 'Adding structured columns to %.ideas...', schema_name;

        -- Add title column (extracted from content or structured_content)
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS title VARCHAR(500)
        ', schema_name);

        -- Add type column
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT ''idea''
        ', schema_name);

        -- Add priority column
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT ''medium''
        ', schema_name);

        -- Add summary column (can extract from structured_content)
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS summary TEXT
        ', schema_name);

        -- Add next_steps as TEXT (can be JSONB array or text with newlines)
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS next_steps TEXT
        ', schema_name);

        -- Add context_needed as TEXT
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS context_needed TEXT
        ', schema_name);

        -- Add keywords (keeping tags for array support)
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS keywords TEXT[]
        ', schema_name);

        -- Add raw_transcript/raw_input
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS raw_transcript TEXT
        ', schema_name);

        -- Add is_archived for soft deletes
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE
        ', schema_name);

        -- Add viewed_count for interaction tracking
        EXECUTE format('
            ALTER TABLE %I.ideas
            ADD COLUMN IF NOT EXISTS viewed_count INTEGER DEFAULT 0
        ', schema_name);

        RAISE NOTICE '✅ Structured columns added to %.ideas', schema_name;
    END LOOP;

    RAISE NOTICE '🎉 All structured columns added successfully!';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- EXECUTE COLUMN ADDITION
-- =====================================================

SELECT add_structured_columns_to_ideas();

-- =====================================================
-- DATA MIGRATION (Extract from JSONB to columns)
-- =====================================================

DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        RAISE NOTICE 'Migrating data in %.ideas...', schema_name;

        -- Update title from content (first 500 chars) if title is null
        EXECUTE format('
            UPDATE %I.ideas
            SET title = LEFT(content, 500)
            WHERE title IS NULL AND content IS NOT NULL
        ', schema_name);

        -- Extract summary from structured_content if available
        EXECUTE format('
            UPDATE %I.ideas
            SET summary = structured_content->>''summary''
            WHERE summary IS NULL
              AND structured_content IS NOT NULL
              AND structured_content ? ''summary''
        ', schema_name);

        -- Extract type from structured_content if available
        EXECUTE format('
            UPDATE %I.ideas
            SET type = structured_content->>''type''
            WHERE type = ''idea''
              AND structured_content IS NOT NULL
              AND structured_content ? ''type''
        ', schema_name);

        -- Extract priority from structured_content if available
        EXECUTE format('
            UPDATE %I.ideas
            SET priority = structured_content->>''priority''
            WHERE priority = ''medium''
              AND structured_content IS NOT NULL
              AND structured_content ? ''priority''
        ', schema_name);

        -- Copy tags to keywords if keywords is null
        EXECUTE format('
            UPDATE %I.ideas
            SET keywords = tags
            WHERE keywords IS NULL AND tags IS NOT NULL
        ', schema_name);

        -- Copy content to raw_transcript if raw_transcript is null
        EXECUTE format('
            UPDATE %I.ideas
            SET raw_transcript = content
            WHERE raw_transcript IS NULL AND content IS NOT NULL
        ', schema_name);

        RAISE NOTICE 'Data migrated in %.ideas', schema_name;
    END LOOP;
END $$;

-- =====================================================
-- CREATE INDEXES ON NEW COLUMNS
-- =====================================================

DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        -- Index on is_archived for filtering
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_ideas_is_archived
            ON %I.ideas(is_archived, created_at DESC)
            WHERE is_archived = false
        ', schema_name, schema_name);

        -- Index on type
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_ideas_type
            ON %I.ideas(type, created_at DESC)
            WHERE is_archived = false AND type IS NOT NULL
        ', schema_name, schema_name);

        -- Index on priority
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_ideas_priority
            ON %I.ideas(priority, created_at DESC)
            WHERE is_archived = false AND priority IS NOT NULL
        ', schema_name, schema_name);

        -- Index on keywords (array)
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_ideas_keywords
            ON %I.ideas USING GIN(keywords)
        ', schema_name, schema_name);

        RAISE NOTICE 'Indexes created on new columns in %.ideas', schema_name;
    END LOOP;
END $$;

-- =====================================================
-- ANALYZE TABLES
-- =====================================================

ANALYZE personal.ideas;
ANALYZE work.ideas;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show column additions
SELECT
    pg_namespace.nspname AS schema_name,
    pg_class.relname AS table_name,
    attname AS column_name,
    format_type(atttypid, atttypmod) AS data_type
FROM pg_attribute
JOIN pg_class ON pg_attribute.attrelid = pg_class.oid
JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
WHERE pg_namespace.nspname IN ('personal', 'work')
  AND pg_class.relname = 'ideas'
  AND attname IN ('title', 'type', 'priority', 'summary', 'next_steps',
                   'context_needed', 'keywords', 'raw_transcript',
                   'is_archived', 'viewed_count')
ORDER BY pg_namespace.nspname, attnum;

-- Count ideas in each schema
DO $$
DECLARE
    personal_count bigint;
    work_count bigint;
BEGIN
    SELECT COUNT(*) INTO personal_count FROM personal.ideas;
    SELECT COUNT(*) INTO work_count FROM work.ideas;

    RAISE NOTICE '';
    RAISE NOTICE '📊 Migration Summary:';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Personal Ideas: % rows migrated', personal_count;
    RAISE NOTICE 'Work Ideas: % rows migrated', work_count;
    RAISE NOTICE '';
    RAISE NOTICE 'New Columns Added:';
    RAISE NOTICE '  • title (VARCHAR)';
    RAISE NOTICE '  • type (VARCHAR)';
    RAISE NOTICE '  • priority (VARCHAR)';
    RAISE NOTICE '  • summary (TEXT)';
    RAISE NOTICE '  • next_steps (TEXT)';
    RAISE NOTICE '  • context_needed (TEXT)';
    RAISE NOTICE '  • keywords (TEXT[])';
    RAISE NOTICE '  • raw_transcript (TEXT)';
    RAISE NOTICE '  • is_archived (BOOLEAN)';
    RAISE NOTICE '  • viewed_count (INTEGER)';
    RAISE NOTICE '';
    RAISE NOTICE 'Existing JSONB columns preserved:';
    RAISE NOTICE '  • structured_content (JSONB) - for flexible data';
    RAISE NOTICE '  • metadata (JSONB) - for additional metadata';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: Test API endpoints!';
END $$;

-- Cleanup helper function
DROP FUNCTION IF EXISTS add_structured_columns_to_ideas();

-- =====================================================
-- DONE!
-- =====================================================
--
-- Schema now supports both:
--  ✅ Structured typed columns (routes work!)
--  ✅ Flexible JSONB fields (extensibility!)
--
-- Best of both worlds approach.
--
