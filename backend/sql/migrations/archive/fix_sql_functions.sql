-- Fix SQL Functions - Review Findings
-- Migration Date: 2026-02-10
--
-- Fixes:
-- 1. get_folder_tree(): Add recursion depth guard (max 50 levels)
-- 2. update_folder_document_count(): Correct AFTER trigger return value
-- 3. Consolidate redundant timestamp functions to use shared update_updated_at_column()

-- =====================================================
-- 1. FIX get_folder_tree() - Add depth guard
-- =====================================================

CREATE OR REPLACE FUNCTION get_folder_tree(p_context VARCHAR(20))
RETURNS TABLE (
    id UUID,
    path VARCHAR(500),
    name VARCHAR(255),
    parent_path VARCHAR(500),
    depth INTEGER,
    document_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE folder_tree AS (
        SELECT f.id, f.path, f.name, f.parent_path, 0 AS depth, f.document_count
        FROM document_folders f
        WHERE f.context = p_context AND f.parent_path IS NULL

        UNION ALL

        SELECT f.id, f.path, f.name, f.parent_path, ft.depth + 1, f.document_count
        FROM document_folders f
        JOIN folder_tree ft ON f.parent_path = ft.path
        WHERE f.context = p_context
          AND ft.depth < 50  -- Prevent infinite recursion from circular references
    )
    SELECT * FROM folder_tree ORDER BY path;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. FIX update_folder_document_count() - AFTER trigger return
-- =====================================================

CREATE OR REPLACE FUNCTION update_folder_document_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE document_folders
        SET document_count = document_count + 1, updated_at = NOW()
        WHERE context = NEW.context AND path = NEW.folder_path;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE document_folders
        SET document_count = document_count - 1, updated_at = NOW()
        WHERE context = OLD.context AND path = OLD.folder_path;
    ELSIF TG_OP = 'UPDATE' AND OLD.folder_path != NEW.folder_path THEN
        UPDATE document_folders
        SET document_count = document_count - 1, updated_at = NOW()
        WHERE context = OLD.context AND path = OLD.folder_path;
        UPDATE document_folders
        SET document_count = document_count + 1, updated_at = NOW()
        WHERE context = NEW.context AND path = NEW.folder_path;
    END IF;
    -- AFTER triggers: return value is ignored by PostgreSQL, use NULL by convention
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. CONSOLIDATE redundant timestamp functions
--    All point to the shared update_updated_at_column()
-- =====================================================

-- Ensure the shared function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-point chat session triggers to use shared function
DO $$
DECLARE
    schema_name TEXT;
BEGIN
    FOR schema_name IN SELECT unnest(ARRAY['public', 'personal', 'work', 'learning', 'creative'])
    LOOP
        -- general_chat_sessions trigger
        EXECUTE format(
            'DROP TRIGGER IF EXISTS update_chat_session_timestamp ON %I.general_chat_sessions',
            schema_name
        );
        EXECUTE format(
            'CREATE TRIGGER update_chat_session_timestamp BEFORE UPDATE ON %I.general_chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            schema_name
        );

        -- routine_patterns trigger
        EXECUTE format(
            'DROP TRIGGER IF EXISTS update_routine_patterns_timestamp ON %I.routine_patterns',
            schema_name
        );
        BEGIN
            EXECUTE format(
                'CREATE TRIGGER update_routine_patterns_timestamp BEFORE UPDATE ON %I.routine_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                schema_name
            );
        EXCEPTION WHEN undefined_table THEN
            NULL; -- Table may not exist in all schemas
        END;

        -- proactive_settings trigger
        EXECUTE format(
            'DROP TRIGGER IF EXISTS update_proactive_settings_timestamp ON %I.proactive_settings',
            schema_name
        );
        BEGIN
            EXECUTE format(
                'CREATE TRIGGER update_proactive_settings_timestamp BEFORE UPDATE ON %I.proactive_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                schema_name
            );
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;
    END LOOP;
END $$;

-- Re-point documents trigger to shared function
DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;
CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Re-point canvas_documents trigger to shared function (if table exists)
DO $$
BEGIN
    DROP TRIGGER IF EXISTS update_canvas_document_timestamp ON canvas_documents;
    CREATE TRIGGER update_canvas_document_timestamp
        BEFORE UPDATE ON canvas_documents
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN undefined_table THEN
    NULL; -- canvas_documents may not exist yet
END $$;

-- Drop the now-redundant functions (they may still be referenced by name, so use IF EXISTS)
-- Note: These are safe to drop because all triggers now point to update_updated_at_column()
DROP FUNCTION IF EXISTS update_chat_session_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_routine_patterns_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_proactive_settings_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_documents_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_canvas_document_timestamp() CASCADE;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
