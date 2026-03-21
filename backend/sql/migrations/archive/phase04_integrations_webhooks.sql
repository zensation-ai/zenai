-- Phase 4: Enterprise Integration Tables (missing from production)
-- Creates integrations, webhooks, and webhook_deliveries in public schema
-- Idempotent: safe to run multiple times

-- Integrations configuration
CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR(100) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('microsoft', 'slack', 'google', 'salesforce', 'hubspot', 'webhook')),
  name VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',
  sync_settings JSONB DEFAULT '{"auto_sync": false, "sync_interval_minutes": 60}',
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(20) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'success', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook endpoints (outgoing)
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(255),
  events JSONB DEFAULT '["idea.created"]',
  is_active BOOLEAN DEFAULT TRUE,
  retry_count INTEGER DEFAULT 3,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempt INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  error_message TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth tokens for external services
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('microsoft', 'slack', 'google', 'salesforce', 'hubspot')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE,
  scopes JSONB DEFAULT '[]',
  user_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);
