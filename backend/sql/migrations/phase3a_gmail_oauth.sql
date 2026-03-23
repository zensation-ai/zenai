-- Phase 3A: Gmail OAuth + Sync
-- New table: google_oauth_tokens (public schema)
-- Altered tables: oauth_states, email_accounts, emails (all 4 context schemas)

-- ===========================================
-- 1. Google OAuth Tokens (public schema)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  google_email VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, google_email)
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_user
  ON public.google_oauth_tokens(user_id);

-- ===========================================
-- 2. Add metadata column to oauth_states (for connect flow distinction)
-- ===========================================
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- ===========================================
-- 3. Alter email_accounts in all 4 schemas
-- ===========================================
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- email_accounts: add provider columns
    EXECUTE format('
      ALTER TABLE %I.email_accounts
        ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT ''resend'',
        ADD COLUMN IF NOT EXISTS google_token_id UUID REFERENCES public.google_oauth_tokens(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS gmail_history_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ
    ', schema_name);

    -- Backfill: existing IMAP accounts
    EXECUTE format('
      UPDATE %I.email_accounts SET provider = ''imap'' WHERE imap_host IS NOT NULL AND provider = ''resend''
    ', schema_name);

    -- emails: add provider tracking columns
    EXECUTE format('
      ALTER TABLE %I.emails
        ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT ''resend''
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_emails_provider_message_id
        ON %I.emails(provider_message_id) WHERE provider_message_id IS NOT NULL
    ', schema_name);

    -- emails: extend status CHECK constraint to include spam
    EXECUTE format('
      ALTER TABLE %I.emails DROP CONSTRAINT IF EXISTS emails_status_check;
      ALTER TABLE %I.emails ADD CONSTRAINT emails_status_check
        CHECK (status IN (''received'', ''read'', ''draft'', ''sending'', ''sent'', ''failed'', ''archived'', ''trash'', ''spam''))
    ', schema_name, schema_name);
  END LOOP;
END $$;
