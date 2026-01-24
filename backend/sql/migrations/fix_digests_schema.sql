-- Migration: Fix digests table schema mismatch
-- This migration updates the existing digests table to match the expected schema
-- Run this on both personal_ai and work_ai databases

-- Step 1: Create or migrate digests table
DO $$
BEGIN
    -- Check if table exists at all
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'digests'
    ) THEN
        RAISE NOTICE 'Digests table does not exist. Creating...';

        -- Create the table with correct schema
        CREATE TABLE digests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly')),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            highlights JSONB DEFAULT '[]',
            statistics JSONB DEFAULT '{}',
            ai_insights TEXT[],
            recommendations TEXT[],
            ideas_count INTEGER DEFAULT 0,
            top_categories TEXT[],
            top_types TEXT[],
            productivity_score DECIMAL(5,2),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            notified_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(type, period_start, period_end)
        );

        CREATE INDEX idx_digests_type ON digests(type);
        CREATE INDEX idx_digests_period ON digests(period_start, period_end);
        CREATE INDEX idx_digests_created ON digests(created_at DESC);

        RAISE NOTICE 'Digests table created successfully';

    -- Check if old column 'digest_type' exists (indicating old schema)
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'digests' AND column_name = 'digest_type'
    ) THEN
        RAISE NOTICE 'Old digests schema detected. Migrating...';

        -- Drop old indexes
        DROP INDEX IF EXISTS idx_digests_user;
        DROP INDEX IF EXISTS idx_digests_context;

        -- Rename the old table
        ALTER TABLE digests RENAME TO digests_old;

        -- Create the new table with correct schema
        CREATE TABLE digests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly')),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            highlights JSONB DEFAULT '[]',
            statistics JSONB DEFAULT '{}',
            ai_insights TEXT[],
            recommendations TEXT[],
            ideas_count INTEGER DEFAULT 0,
            top_categories TEXT[],
            top_types TEXT[],
            productivity_score DECIMAL(5,2),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            notified_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(type, period_start, period_end)
        );

        -- Migrate data from old table (best effort - some columns won't exist)
        INSERT INTO digests (id, type, period_start, period_end, title, summary, highlights, ideas_count, created_at)
        SELECT
            id,
            COALESCE(digest_type, 'daily'),
            period_start::date,
            period_end::date,
            COALESCE(content->>'title', 'Migrated Digest'),
            COALESCE(content->>'summary', ''),
            COALESCE(highlights, '[]'::jsonb),
            COALESCE(ideas_count, 0),
            created_at
        FROM digests_old;

        -- Drop old table
        DROP TABLE digests_old;

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_digests_type ON digests(type);
        CREATE INDEX IF NOT EXISTS idx_digests_period ON digests(period_start, period_end);
        CREATE INDEX IF NOT EXISTS idx_digests_created ON digests(created_at DESC);

        RAISE NOTICE 'Migration complete: digests table updated';
    ELSE
        RAISE NOTICE 'Digests table already has correct schema';

        -- Ensure indexes exist
        CREATE INDEX IF NOT EXISTS idx_digests_type ON digests(type);
        CREATE INDEX IF NOT EXISTS idx_digests_period ON digests(period_start, period_end);
        CREATE INDEX IF NOT EXISTS idx_digests_created ON digests(created_at DESC);
    END IF;
END $$;

-- Step 2: Create productivity_goals table if not exists
CREATE TABLE IF NOT EXISTS productivity_goals (
    id INTEGER PRIMARY KEY DEFAULT 1,
    daily_ideas_target INTEGER DEFAULT 3,
    weekly_ideas_target INTEGER DEFAULT 15,
    focus_categories TEXT[],
    enabled_insights BOOLEAN DEFAULT true,
    digest_time TIME DEFAULT '09:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize default productivity goals
INSERT INTO productivity_goals (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Step 3: Create analytics_snapshots table if not exists
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL UNIQUE,
    total_ideas INTEGER DEFAULT 0,
    ideas_by_type JSONB DEFAULT '{}',
    ideas_by_category JSONB DEFAULT '{}',
    ideas_by_priority JSONB DEFAULT '{}',
    avg_ideas_per_day DECIMAL(8,2),
    streak_days INTEGER DEFAULT 0,
    most_active_hour INTEGER,
    most_active_day INTEGER,
    processing_time_avg DECIMAL(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date ON analytics_snapshots(snapshot_date DESC);

-- Success message
DO $$ BEGIN RAISE NOTICE 'Digest schema migration completed successfully'; END $$;
