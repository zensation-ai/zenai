-- Push Notifications System
-- Enables real-time notifications for draft completion and other events

-- ================================================
-- 1. DEVICE TOKENS
-- Stores APNs device tokens for each user/device
-- ================================================
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token TEXT NOT NULL,
  device_id TEXT NOT NULL,                          -- Unique device identifier
  device_name TEXT,                                  -- "iPhone 15 Pro"
  device_model TEXT,                                 -- "iPhone16,1"
  os_version TEXT,                                   -- "iOS 17.2"
  app_version TEXT,                                  -- "1.0.0"
  context VARCHAR(50) NOT NULL,                      -- 'personal' or 'work'

  -- Token status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  failed_count INTEGER DEFAULT 0,                    -- Consecutive send failures
  last_failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(device_token, context)
);

CREATE INDEX idx_device_tokens_context ON device_tokens(context);
CREATE INDEX idx_device_tokens_active ON device_tokens(is_active) WHERE is_active = true;
CREATE INDEX idx_device_tokens_device ON device_tokens(device_id);

-- ================================================
-- 2. NOTIFICATION PREFERENCES
-- User preferences for different notification types
-- ================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  context VARCHAR(50) NOT NULL,

  -- Notification categories (all default to true)
  draft_ready BOOLEAN DEFAULT true,                  -- When a draft is generated
  draft_feedback_reminder BOOLEAN DEFAULT true,      -- Reminder to rate drafts
  idea_connections BOOLEAN DEFAULT true,             -- When ideas are connected
  learning_suggestions BOOLEAN DEFAULT true,         -- AI improvement suggestions
  weekly_summary BOOLEAN DEFAULT false,              -- Weekly activity summary

  -- Quiet hours (user's local timezone)
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,                            -- e.g., '22:00'
  quiet_hours_end TIME,                              -- e.g., '08:00'
  timezone TEXT DEFAULT 'Europe/Berlin',

  -- Frequency limits
  max_notifications_per_hour INTEGER DEFAULT 10,
  max_notifications_per_day INTEGER DEFAULT 50,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(device_id, context)
);

CREATE INDEX idx_notification_prefs_device ON notification_preferences(device_id);

-- ================================================
-- 3. NOTIFICATION HISTORY
-- Tracks all sent notifications for analytics and debugging
-- ================================================
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token_id UUID REFERENCES device_tokens(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL,

  -- Notification content
  notification_type VARCHAR(50) NOT NULL,            -- 'draft_ready', 'feedback_reminder', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  subtitle TEXT,

  -- Associated entities
  draft_id UUID REFERENCES idea_drafts(id) ON DELETE SET NULL,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,

  -- Payload
  payload JSONB,                                     -- Additional data sent with notification

  -- Delivery status
  status VARCHAR(20) DEFAULT 'pending',              -- 'pending', 'sent', 'delivered', 'failed', 'opened'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,

  -- Error tracking
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- APNs response
  apns_id TEXT,                                      -- APNs notification ID

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_history_device ON notification_history(device_token_id);
CREATE INDEX idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_created ON notification_history(created_at DESC);
CREATE INDEX idx_notification_history_draft ON notification_history(draft_id) WHERE draft_id IS NOT NULL;

-- ================================================
-- 4. NOTIFICATION QUEUE
-- Queue for pending notifications (batch processing)
-- ================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL,
  device_id TEXT NOT NULL,

  -- Notification details
  notification_type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  subtitle TEXT,

  -- Associated entities
  draft_id UUID,
  idea_id UUID,

  -- Payload and priority
  payload JSONB,
  priority VARCHAR(10) DEFAULT 'normal',             -- 'high', 'normal', 'low'

  -- Scheduling
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                            -- Don't send after this time

  -- Processing status
  status VARCHAR(20) DEFAULT 'pending',              -- 'pending', 'processing', 'sent', 'failed', 'expired'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status) WHERE status = 'pending';
CREATE INDEX idx_notification_queue_scheduled ON notification_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_notification_queue_device ON notification_queue(device_id);

-- ================================================
-- 5. NOTIFICATION RATE LIMITING
-- Tracks notification counts for rate limiting
-- ================================================
CREATE TABLE IF NOT EXISTS notification_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  context VARCHAR(50) NOT NULL,

  -- Counters (reset periodically)
  hourly_count INTEGER DEFAULT 0,
  hourly_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  daily_count INTEGER DEFAULT 0,
  daily_reset_at TIMESTAMPTZ DEFAULT (CURRENT_DATE + INTERVAL '1 day'),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(device_id, context)
);

CREATE INDEX idx_rate_limits_device ON notification_rate_limits(device_id);

-- ================================================
-- 6. HELPER FUNCTIONS
-- ================================================

-- Function to check if notifications are allowed (rate limits + quiet hours)
CREATE OR REPLACE FUNCTION can_send_notification(
  p_device_id TEXT,
  p_context VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_prefs notification_preferences%ROWTYPE;
  v_limits notification_rate_limits%ROWTYPE;
  v_current_time TIME;
  v_in_quiet_hours BOOLEAN;
BEGIN
  -- Get preferences
  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE device_id = p_device_id AND context = p_context;

  -- If no preferences, allow by default
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Check quiet hours
  IF v_prefs.quiet_hours_enabled THEN
    v_current_time := (NOW() AT TIME ZONE COALESCE(v_prefs.timezone, 'Europe/Berlin'))::TIME;

    -- Handle overnight quiet hours (e.g., 22:00 to 08:00)
    IF v_prefs.quiet_hours_start > v_prefs.quiet_hours_end THEN
      v_in_quiet_hours := v_current_time >= v_prefs.quiet_hours_start
                          OR v_current_time <= v_prefs.quiet_hours_end;
    ELSE
      v_in_quiet_hours := v_current_time >= v_prefs.quiet_hours_start
                          AND v_current_time <= v_prefs.quiet_hours_end;
    END IF;

    IF v_in_quiet_hours THEN
      RETURN false;
    END IF;
  END IF;

  -- Check rate limits
  SELECT * INTO v_limits
  FROM notification_rate_limits
  WHERE device_id = p_device_id AND context = p_context;

  IF FOUND THEN
    -- Reset counters if needed
    IF NOW() >= v_limits.hourly_reset_at THEN
      UPDATE notification_rate_limits
      SET hourly_count = 0, hourly_reset_at = NOW() + INTERVAL '1 hour'
      WHERE device_id = p_device_id AND context = p_context;
      v_limits.hourly_count := 0;
    END IF;

    IF NOW() >= v_limits.daily_reset_at THEN
      UPDATE notification_rate_limits
      SET daily_count = 0, daily_reset_at = CURRENT_DATE + INTERVAL '1 day'
      WHERE device_id = p_device_id AND context = p_context;
      v_limits.daily_count := 0;
    END IF;

    -- Check limits
    IF v_limits.hourly_count >= v_prefs.max_notifications_per_hour THEN
      RETURN false;
    END IF;

    IF v_limits.daily_count >= v_prefs.max_notifications_per_day THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to increment notification counters
CREATE OR REPLACE FUNCTION increment_notification_count(
  p_device_id TEXT,
  p_context VARCHAR(50)
) RETURNS VOID AS $$
BEGIN
  INSERT INTO notification_rate_limits (device_id, context, hourly_count, daily_count)
  VALUES (p_device_id, p_context, 1, 1)
  ON CONFLICT (device_id, context)
  DO UPDATE SET
    hourly_count = notification_rate_limits.hourly_count + 1,
    daily_count = notification_rate_limits.daily_count + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 7. VIEWS
-- ================================================

-- Active devices view
CREATE OR REPLACE VIEW v_active_devices AS
SELECT
  dt.id,
  dt.device_id,
  dt.device_name,
  dt.device_model,
  dt.context,
  dt.last_used_at,
  dt.created_at,
  np.draft_ready,
  np.draft_feedback_reminder,
  np.idea_connections,
  np.quiet_hours_enabled,
  (SELECT COUNT(*) FROM notification_history nh WHERE nh.device_token_id = dt.id) as total_notifications,
  (SELECT COUNT(*) FROM notification_history nh WHERE nh.device_token_id = dt.id AND nh.opened_at IS NOT NULL) as opened_notifications
FROM device_tokens dt
LEFT JOIN notification_preferences np ON np.device_id = dt.device_id AND np.context = dt.context
WHERE dt.is_active = true
  AND dt.failed_count < 3
ORDER BY dt.last_used_at DESC NULLS LAST;

-- Notification statistics view
CREATE OR REPLACE VIEW v_notification_stats AS
SELECT
  context,
  notification_type,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(
    (COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::DECIMAL / NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0)) * 100,
    2
  ) as open_rate,
  AVG(EXTRACT(EPOCH FROM (opened_at - sent_at))) FILTER (WHERE opened_at IS NOT NULL) as avg_time_to_open_seconds
FROM notification_history
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY context, notification_type
ORDER BY total_sent DESC;

-- ================================================
-- 8. TRIGGERS
-- ================================================

-- Update updated_at on device_tokens
CREATE OR REPLACE FUNCTION update_device_tokens_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_device_tokens_timestamp ON device_tokens;
CREATE TRIGGER trigger_update_device_tokens_timestamp
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_device_tokens_timestamp();

-- Update updated_at on notification_preferences
DROP TRIGGER IF EXISTS trigger_update_notification_prefs_timestamp ON notification_preferences;
CREATE TRIGGER trigger_update_notification_prefs_timestamp
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_device_tokens_timestamp();
