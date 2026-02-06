-- ============================================================================
-- Quick Fix: Add metadata column to personalization_facts
-- ============================================================================
-- Date: 2026-02-06
-- Issue: Episodic consolidation fails due to missing metadata column
-- Run via: Supabase SQL Editor
-- ============================================================================

-- Apply to PERSONAL schema
SET search_path TO personal, public;

ALTER TABLE personalization_facts
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_personalization_facts_metadata
    ON personalization_facts USING GIN (metadata);

-- Apply to WORK schema
SET search_path TO work, public;

ALTER TABLE personalization_facts
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_personalization_facts_metadata
    ON personalization_facts USING GIN (metadata);

-- Reset to default
SET search_path TO public;

-- Verify
SELECT
    table_schema,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'personalization_facts'
AND column_name = 'metadata'
ORDER BY table_schema;
