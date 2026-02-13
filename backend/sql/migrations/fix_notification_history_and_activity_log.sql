-- Migration: Ensure notification_history and ai_activity_log exist in all 4 schemas
-- Date: 2026-02-13
--
-- Problem: Production logs show:
--   1. "notification_history not accessible" - table missing in some schemas
--   2. "PostgreSQL Error (XX000)" on dashboard-summary - ai_activity_log missing
--   3. notification_history missing 'status' column that routes expect
--
-- Safe to re-run: Uses IF NOT EXISTS throughout.

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- ==============================================
    -- 1. notification_history table
    -- ==============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.notification_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        data JSONB DEFAULT ''{}''::jsonb,
        status VARCHAR(20) DEFAULT ''pending'',
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        read_at TIMESTAMP WITH TIME ZONE,
        clicked_at TIMESTAMP WITH TIME ZONE
      )', s);

    -- Add status column if missing (older schema versions)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'notification_history' AND column_name = 'status'
    ) THEN
      EXECUTE format('ALTER TABLE %I.notification_history ADD COLUMN status VARCHAR(20) DEFAULT ''pending''', s);
    END IF;

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notif_hist_user ON %I.notification_history(user_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_notif_hist_sent ON %I.notification_history(sent_at DESC)', s, s);

    -- ==============================================
    -- 2. ai_activity_log table
    -- ==============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.ai_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_type VARCHAR(100) NOT NULL,
        message TEXT,
        idea_id UUID,
        metadata JSONB DEFAULT ''{}''::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- Add message column if missing (older schema had 'title' instead)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'message'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log ADD COLUMN message TEXT', s);
    END IF;

    -- Add idea_id column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'idea_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log ADD COLUMN idea_id UUID', s);
    END IF;

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ai_activity_type ON %I.ai_activity_log(activity_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ai_activity_created ON %I.ai_activity_log(created_at DESC)', s, s);

    RAISE NOTICE 'Tables ready in schema: %', s;
  END LOOP;

  RAISE NOTICE 'Migration complete: notification_history + ai_activity_log in all 4 schemas';
END $$;
