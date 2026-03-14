-- Phase 62: Enterprise Security
-- Creates security_audit_log, rate_limit_config, user_roles in all 4 schemas
-- Idempotent: Uses CREATE TABLE IF NOT EXISTS

-- ===========================================
-- Schema: personal
-- ===========================================

CREATE TABLE IF NOT EXISTS personal.security_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) DEFAULT 'unknown',
  user_agent TEXT DEFAULT 'unknown',
  details JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  context VARCHAR(20) DEFAULT 'personal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_sal_event_type ON personal.security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_personal_sal_user_id ON personal.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_sal_severity ON personal.security_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_personal_sal_created_at ON personal.security_audit_log(created_at);

CREATE TABLE IF NOT EXISTS personal.rate_limit_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tier VARCHAR(50) UNIQUE NOT NULL,
  max_requests INT NOT NULL DEFAULT 100,
  window_seconds INT NOT NULL DEFAULT 60,
  block_seconds INT DEFAULT 0,
  endpoints TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default rate limit configs
INSERT INTO personal.rate_limit_config (tier, max_requests, window_seconds, block_seconds)
VALUES
  ('default', 100, 60, 0),
  ('auth', 10, 60, 300),
  ('ai', 30, 60, 0),
  ('upload', 20, 60, 0)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS personal.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',
  granted_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Schema: work
-- ===========================================

CREATE TABLE IF NOT EXISTS work.security_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) DEFAULT 'unknown',
  user_agent TEXT DEFAULT 'unknown',
  details JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  context VARCHAR(20) DEFAULT 'work',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_sal_event_type ON work.security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_work_sal_user_id ON work.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sal_severity ON work.security_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_work_sal_created_at ON work.security_audit_log(created_at);

CREATE TABLE IF NOT EXISTS work.rate_limit_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tier VARCHAR(50) UNIQUE NOT NULL,
  max_requests INT NOT NULL DEFAULT 100,
  window_seconds INT NOT NULL DEFAULT 60,
  block_seconds INT DEFAULT 0,
  endpoints TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO work.rate_limit_config (tier, max_requests, window_seconds, block_seconds)
VALUES
  ('default', 100, 60, 0),
  ('auth', 10, 60, 300),
  ('ai', 30, 60, 0),
  ('upload', 20, 60, 0)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS work.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',
  granted_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Schema: learning
-- ===========================================

CREATE TABLE IF NOT EXISTS learning.security_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) DEFAULT 'unknown',
  user_agent TEXT DEFAULT 'unknown',
  details JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  context VARCHAR(20) DEFAULT 'learning',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_sal_event_type ON learning.security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_learning_sal_user_id ON learning.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sal_severity ON learning.security_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_learning_sal_created_at ON learning.security_audit_log(created_at);

CREATE TABLE IF NOT EXISTS learning.rate_limit_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tier VARCHAR(50) UNIQUE NOT NULL,
  max_requests INT NOT NULL DEFAULT 100,
  window_seconds INT NOT NULL DEFAULT 60,
  block_seconds INT DEFAULT 0,
  endpoints TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO learning.rate_limit_config (tier, max_requests, window_seconds, block_seconds)
VALUES
  ('default', 100, 60, 0),
  ('auth', 10, 60, 300),
  ('ai', 30, 60, 0),
  ('upload', 20, 60, 0)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS learning.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',
  granted_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Schema: creative
-- ===========================================

CREATE TABLE IF NOT EXISTS creative.security_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) DEFAULT 'unknown',
  user_agent TEXT DEFAULT 'unknown',
  details JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  context VARCHAR(20) DEFAULT 'creative',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_sal_event_type ON creative.security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_creative_sal_user_id ON creative.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_sal_severity ON creative.security_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_creative_sal_created_at ON creative.security_audit_log(created_at);

CREATE TABLE IF NOT EXISTS creative.rate_limit_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tier VARCHAR(50) UNIQUE NOT NULL,
  max_requests INT NOT NULL DEFAULT 100,
  window_seconds INT NOT NULL DEFAULT 60,
  block_seconds INT DEFAULT 0,
  endpoints TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO creative.rate_limit_config (tier, max_requests, window_seconds, block_seconds)
VALUES
  ('default', 100, 60, 0),
  ('auth', 10, 60, 300),
  ('ai', 30, 60, 0),
  ('upload', 20, 60, 0)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS creative.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',
  granted_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
