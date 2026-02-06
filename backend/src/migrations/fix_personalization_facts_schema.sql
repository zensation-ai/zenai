-- ============================================================================
-- Migration: Create/Fix personalization_facts schema for HiMeS Long-Term Memory
-- ============================================================================
-- Date: 2026-01-30
-- Issue: Schema mismatch between Phase 27 memory system and legacy tables
--
-- This migration handles THREE scenarios:
-- 1. Table doesn't exist → Creates new table with HiMeS schema
-- 2. Legacy schema exists → Adds new columns and migrates data
-- 3. HiMeS schema exists → No changes needed
--
-- Run via: Supabase SQL Editor or psql
-- ============================================================================

-- SCENARIO 1: Create table if it doesn't exist (fresh install)
CREATE TABLE IF NOT EXISTS personalization_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    fact_type VARCHAR(20) NOT NULL DEFAULT 'knowledge',
    content TEXT NOT NULL,
    confidence DECIMAL(5,4) DEFAULT 0.5,
    source VARCHAR(20) DEFAULT 'inferred',
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_confirmed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    occurrences INTEGER DEFAULT 1,
    embedding vector(1024),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Legacy columns for backward compatibility (nullable)
    user_id VARCHAR(255),
    session_id UUID,
    category VARCHAR(50),
    fact_key VARCHAR(100),
    fact_value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_fact_context CHECK (context IN ('personal', 'work', 'learning', 'creative')),
    CONSTRAINT valid_fact_type CHECK (fact_type IN ('preference', 'behavior', 'knowledge', 'goal', 'context')),
    CONSTRAINT valid_fact_source CHECK (source IN ('explicit', 'inferred', 'consolidated'))
);

-- SCENARIO 2: Migrate legacy schema if columns are missing
DO $$
BEGIN
    -- Add HiMeS columns if they don't exist (for legacy schema migration)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'personalization_facts'
        AND column_name = 'fact_type'
    ) THEN
        ALTER TABLE personalization_facts
            ADD COLUMN IF NOT EXISTS fact_type VARCHAR(20) DEFAULT 'knowledge',
            ADD COLUMN IF NOT EXISTS content TEXT,
            ADD COLUMN IF NOT EXISTS first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS last_confirmed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS occurrences INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

        -- Migrate data from legacy columns
        UPDATE personalization_facts
        SET
            fact_type = COALESCE(category, 'knowledge'),
            content = COALESCE(fact_value, fact_key, ''),
            first_seen = COALESCE(created_at, NOW()),
            last_confirmed = COALESCE(updated_at, NOW())
        WHERE content IS NULL;

        RAISE NOTICE 'Legacy schema migrated to HiMeS format';
    END IF;

    -- Add context column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'personalization_facts'
        AND column_name = 'context'
    ) THEN
        ALTER TABLE personalization_facts
            ADD COLUMN context VARCHAR(20) DEFAULT 'personal';
        RAISE NOTICE 'Added context column';
    END IF;

    -- Add metadata column if missing (required for episodic consolidation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'personalization_facts'
        AND column_name = 'metadata'
    ) THEN
        ALTER TABLE personalization_facts
            ADD COLUMN metadata JSONB DEFAULT '{}';
        RAISE NOTICE 'Added metadata column for episodic consolidation';
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_personalization_facts_context
    ON personalization_facts(context);

CREATE INDEX IF NOT EXISTS idx_personalization_facts_type_confidence
    ON personalization_facts(fact_type, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_personalization_facts_active
    ON personalization_facts(is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_personalization_facts_context_active
    ON personalization_facts(context, is_active)
    WHERE is_active = true;

-- GIN index for metadata JSONB queries (episodic consolidation)
CREATE INDEX IF NOT EXISTS idx_personalization_facts_metadata
    ON personalization_facts USING GIN (metadata);

-- Add documentation
COMMENT ON TABLE personalization_facts IS 'HiMeS Long-Term Memory: Stores personalization facts about users per context';
COMMENT ON COLUMN personalization_facts.context IS 'AI context: personal, work, learning, creative';
COMMENT ON COLUMN personalization_facts.fact_type IS 'Type: preference, behavior, knowledge, goal, context';
COMMENT ON COLUMN personalization_facts.content IS 'The actual fact content';
COMMENT ON COLUMN personalization_facts.confidence IS 'Confidence score 0.0-1.0';
COMMENT ON COLUMN personalization_facts.occurrences IS 'How many times this fact was confirmed';
