-- Phase 1: Integration Framework Foundation
-- Tables in public schema (tokens are user-level, not context-level)

-- OAuth tokens (encrypted at rest via AES-256-GCM)
CREATE TABLE IF NOT EXISTS public.integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  connector_id VARCHAR(100) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(20) DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_tokens_user
  ON public.integration_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_expires
  ON public.integration_tokens(expires_at)
  WHERE expires_at IS NOT NULL;

-- User integration installations
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connector_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error', 'syncing')),
  config JSONB DEFAULT '{"syncEnabled": true}',
  target_context VARCHAR(20) DEFAULT 'work'
    CHECK (target_context IN ('personal', 'work', 'learning', 'creative')),
  last_sync_at TIMESTAMPTZ,
  last_sync_result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user
  ON public.user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_status
  ON public.user_integrations(status);

-- Webhook audit log
CREATE TABLE IF NOT EXISTS public.integration_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id VARCHAR(100) NOT NULL,
  user_id UUID,
  event_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  payload_hash VARCHAR(64),
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_connector
  ON public.integration_webhook_log(connector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_log_hash
  ON public.integration_webhook_log(payload_hash);
