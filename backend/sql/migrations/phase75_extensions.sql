-- Phase 75: Plugin/Extension System
-- Tables in public schema (extensions are global, not per-context)

-- ===========================================
-- Extensions Catalog
-- ===========================================

CREATE TABLE IF NOT EXISTS public.extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  type VARCHAR(50) NOT NULL CHECK (type IN ('tool', 'widget', 'theme', 'integration', 'agent')),
  manifest JSONB NOT NULL DEFAULT '{}',
  entry_point VARCHAR(500) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  author VARCHAR(255) NOT NULL DEFAULT 'Unknown',
  category VARCHAR(50) NOT NULL DEFAULT 'productivity' CHECK (category IN ('productivity', 'developer', 'ai', 'appearance', 'communication')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extensions_type ON public.extensions(type);
CREATE INDEX IF NOT EXISTS idx_extensions_category ON public.extensions(category);

-- ===========================================
-- User Extension Installations
-- ===========================================

CREATE TABLE IF NOT EXISTS public.user_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  extension_id VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  permissions_granted JSONB NOT NULL DEFAULT '[]',
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, extension_id)
);

CREATE INDEX IF NOT EXISTS idx_user_extensions_user_id ON public.user_extensions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_extensions_extension_id ON public.user_extensions(extension_id);

-- ===========================================
-- Extension Execution Logs (Audit)
-- ===========================================

CREATE TABLE IF NOT EXISTS public.extension_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(255) NOT NULL,
  result JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extension_logs_extension_id ON public.extension_logs(extension_id);
CREATE INDEX IF NOT EXISTS idx_extension_logs_user_id ON public.extension_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_extension_logs_created_at ON public.extension_logs(created_at DESC);
