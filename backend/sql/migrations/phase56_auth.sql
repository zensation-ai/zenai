-- Phase 56: OAuth 2.1 + JWT + Multi-User Foundation
-- Creates user management tables in public schema (not context-specific)

-- ===========================================
-- Users Table
-- ===========================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  password_hash VARCHAR(255),          -- NULL for OAuth-only users
  display_name VARCHAR(255),
  avatar_url TEXT,
  auth_provider VARCHAR(50) DEFAULT 'local', -- local, google, microsoft, github
  auth_provider_id VARCHAR(255),       -- OAuth Provider User ID
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret VARCHAR(255),             -- TOTP Secret (encrypted)
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'owner')),
  preferences JSONB DEFAULT '{}',
  last_login TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON public.users(auth_provider, auth_provider_id);

-- ===========================================
-- User Sessions (persistent, not in-memory)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_info JSONB DEFAULT '{}',
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token ON public.user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON public.user_sessions(expires_at) WHERE revoked = false;

-- ===========================================
-- OAuth State (persistent, not in-memory Map!)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  redirect_uri TEXT,
  code_verifier VARCHAR(255),          -- PKCE
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.oauth_states(expires_at);

-- ===========================================
-- API Keys: Add user_id column
-- ===========================================
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

-- ===========================================
-- User-Context Mapping (which user has access to which context)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.user_contexts (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work', 'learning', 'creative')),
  role VARCHAR(50) DEFAULT 'owner',
  PRIMARY KEY (user_id, context)
);

-- ===========================================
-- Cleanup: periodic deletion of expired oauth states
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_oauth_states_cleanup ON public.oauth_states(expires_at);
