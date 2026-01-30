-- Migration: Fix personalization_facts schema for HiMeS Long-Term Memory
-- Date: 2026-01-30
-- Issue: Schema mismatch between Phase 27 memory system and legacy personalization tables

-- Check if we need to migrate (if old schema exists)
DO $$
BEGIN
    -- Check if column 'context' already exists (new schema)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'personalization_facts'
        AND column_name = 'context'
    ) THEN
        -- Add new columns required by HiMeS
        ALTER TABLE personalization_facts
            ADD COLUMN IF NOT EXISTS context VARCHAR(20) DEFAULT 'personal',
            ADD COLUMN IF NOT EXISTS fact_type VARCHAR(20),
            ADD COLUMN IF NOT EXISTS content TEXT,
            ADD COLUMN IF NOT EXISTS first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS last_confirmed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS occurrences INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

        -- Migrate data from old columns to new columns
        UPDATE personalization_facts
        SET
            fact_type = COALESCE(category, 'knowledge'),
            content = COALESCE(fact_value, fact_key),
            first_seen = COALESCE(created_at, NOW()),
            last_confirmed = COALESCE(updated_at, NOW())
        WHERE fact_type IS NULL OR content IS NULL;

        RAISE NOTICE 'personalization_facts schema migrated to HiMeS format';
    ELSE
        RAISE NOTICE 'personalization_facts already has HiMeS schema';
    END IF;

    -- Ensure constraints exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_fact_context'
        AND table_name = 'personalization_facts'
    ) THEN
        -- Add constraints if they don't exist (may fail if data violates them)
        BEGIN
            ALTER TABLE personalization_facts
                ADD CONSTRAINT valid_fact_context
                CHECK (context IN ('personal', 'work', 'learning', 'creative'));
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add valid_fact_context constraint: %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_fact_type'
        AND table_name = 'personalization_facts'
    ) THEN
        BEGIN
            ALTER TABLE personalization_facts
                ADD CONSTRAINT valid_fact_type
                CHECK (fact_type IN ('preference', 'behavior', 'knowledge', 'goal', 'context'));
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add valid_fact_type constraint: %', SQLERRM;
        END;
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

-- Ensure source column has correct default
ALTER TABLE personalization_facts
    ALTER COLUMN source SET DEFAULT 'inferred';

-- Add comment for documentation
COMMENT ON TABLE personalization_facts IS 'HiMeS Long-Term Memory: Stores personalization facts about users per context';
