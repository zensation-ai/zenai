-- Phase 5: Slack + Autonomous Workflows
-- Creates: public.slack_workspaces, public.slack_channels, {context}.slack_messages

-- ============================================================
-- PUBLIC SCHEMA: Workspace-level tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.slack_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id VARCHAR(50) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  bot_user_id VARCHAR(50) NOT NULL,
  channel_context_mapping JSONB DEFAULT '{}',
  proactive_config JSONB DEFAULT '{"enabled": true, "confidenceThreshold": 0.8, "rateLimitMinutes": 30, "mutedChannels": []}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_workspaces_user ON public.slack_workspaces(user_id);

CREATE TABLE IF NOT EXISTS public.slack_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.slack_workspaces(id) ON DELETE CASCADE,
  channel_id VARCHAR(50) NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  is_member BOOLEAN DEFAULT false,
  target_context VARCHAR(20) DEFAULT 'work'
    CHECK (target_context IN ('personal', 'work', 'learning', 'creative')),
  last_sync_cursor VARCHAR(100),
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_channels_workspace ON public.slack_channels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_slack_channels_context ON public.slack_channels(target_context);

-- ============================================================
-- PER-CONTEXT SCHEMAS: Synced message data
-- ============================================================

DO $$
DECLARE
  ctx TEXT;
BEGIN
  FOR ctx IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.slack_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        channel_id VARCHAR(50) NOT NULL,
        message_ts VARCHAR(50) NOT NULL,
        thread_ts VARCHAR(50),
        slack_user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(255),
        text TEXT NOT NULL,
        extracted_facts UUID[] DEFAULT ''{}''::UUID[],
        importance_score FLOAT DEFAULT 0.0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(channel_id, message_ts)
      );

      CREATE INDEX IF NOT EXISTS idx_slack_messages_channel
        ON %I.slack_messages(channel_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_slack_messages_user
        ON %I.slack_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_slack_messages_thread
        ON %I.slack_messages(thread_ts) WHERE thread_ts IS NOT NULL;
    ', ctx, ctx, ctx, ctx);
  END LOOP;
END
$$;

-- ============================================================
-- LEGACY CLEANUP: Drop old Slack tables if they exist
-- ============================================================

DROP TABLE IF EXISTS public.slack_webhook_events;
DROP TABLE IF EXISTS public.slack_messages;
