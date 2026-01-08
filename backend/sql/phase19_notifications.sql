-- Phase 19: Push Notifications Tables
-- Run this on both personal_ai and work_ai databases

-- Push Tokens Table
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    device_id TEXT,
    device_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);

-- Notification Preferences Table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id INTEGER PRIMARY KEY DEFAULT 1,
    cluster_ready BOOLEAN DEFAULT true,
    daily_digest BOOLEAN DEFAULT false,
    weekly_insights BOOLEAN DEFAULT true,
    priority_reminders BOOLEAN DEFAULT true,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize default preferences
INSERT INTO notification_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Notification History Table
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    recipients_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(type);
CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at DESC);

-- Add notified_at column to thought_clusters if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'thought_clusters' AND column_name = 'notified_at'
    ) THEN
        ALTER TABLE thought_clusters ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Comment
COMMENT ON TABLE push_tokens IS 'Stores push notification tokens for all devices';
COMMENT ON TABLE notification_preferences IS 'User notification preferences (single row)';
COMMENT ON TABLE notification_history IS 'History of sent notifications';
