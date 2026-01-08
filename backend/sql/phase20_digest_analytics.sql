-- Phase 20: Digest & Advanced Analytics Tables
-- Run this on both personal_ai and work_ai databases

-- Digest History Table
CREATE TABLE IF NOT EXISTS digests (
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

CREATE INDEX IF NOT EXISTS idx_digests_type ON digests(type);
CREATE INDEX IF NOT EXISTS idx_digests_period ON digests(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_digests_created ON digests(created_at DESC);

-- Analytics Snapshots Table (for historical trend analysis)
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

-- User Productivity Goals Table
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

-- Initialize default goals
INSERT INTO productivity_goals (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Add digest preference columns to notification_preferences if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notification_preferences' AND column_name = 'digest_time'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN digest_time TIME DEFAULT '09:00';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notification_preferences' AND column_name = 'weekly_digest_day'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN weekly_digest_day INTEGER DEFAULT 1; -- Monday
    END IF;
END $$;

-- Comments
COMMENT ON TABLE digests IS 'Stores generated daily and weekly digests with AI insights';
COMMENT ON TABLE analytics_snapshots IS 'Daily snapshots for historical trend analysis';
COMMENT ON TABLE productivity_goals IS 'User productivity targets and preferences';
