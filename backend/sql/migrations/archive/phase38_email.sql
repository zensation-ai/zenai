-- =====================================================
-- MIGRATION: Phase 38 - Email Integration (Resend)
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-16
-- =====================================================
--
-- Creates email_accounts, emails, and email_labels tables
-- across all 4 context schemas (personal, work, learning, creative).
-- Also creates global resend_webhook_log in public schema.
--
-- Run this in Supabase SQL Editor.
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- =========================================================
    -- Email Accounts (sender identities per context)
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.email_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email_address VARCHAR(320) NOT NULL,
        display_name VARCHAR(255),
        domain VARCHAR(255) NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        signature_html TEXT,
        signature_text TEXT,
        context VARCHAR(20) NOT NULL,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (email_address, context)
      )', s);

    -- =========================================================
    -- Emails (inbound + outbound)
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.emails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resend_email_id VARCHAR(255),
        account_id UUID REFERENCES %I.email_accounts(id) ON DELETE SET NULL,
        direction VARCHAR(10) NOT NULL CHECK (direction IN (''inbound'', ''outbound'')),
        status VARCHAR(20) DEFAULT ''received''
          CHECK (status IN (''received'', ''read'', ''draft'', ''sending'', ''sent'', ''failed'', ''archived'', ''trash'')),
        from_address VARCHAR(320) NOT NULL,
        from_name VARCHAR(255),
        to_addresses JSONB NOT NULL DEFAULT ''[]''::jsonb,
        cc_addresses JSONB DEFAULT ''[]''::jsonb,
        bcc_addresses JSONB DEFAULT ''[]''::jsonb,
        subject VARCHAR(1000),
        body_html TEXT,
        body_text TEXT,
        reply_to_id UUID,
        thread_id UUID,
        message_id VARCHAR(500),
        in_reply_to VARCHAR(500),
        has_attachments BOOLEAN DEFAULT FALSE,
        attachments JSONB DEFAULT ''[]''::jsonb,
        ai_summary TEXT,
        ai_category VARCHAR(50),
        ai_priority VARCHAR(10),
        ai_sentiment VARCHAR(20),
        ai_action_items JSONB DEFAULT ''[]''::jsonb,
        ai_reply_suggestions JSONB DEFAULT ''[]''::jsonb,
        ai_processed_at TIMESTAMP WITH TIME ZONE,
        labels JSONB DEFAULT ''[]''::jsonb,
        is_starred BOOLEAN DEFAULT FALSE,
        context VARCHAR(20) NOT NULL,
        metadata JSONB DEFAULT ''{}''::jsonb,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_status ON %I.emails(status) WHERE status != ''trash''', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_direction ON %I.emails(direction)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_thread ON %I.emails(thread_id) WHERE thread_id IS NOT NULL', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_account ON %I.emails(account_id) WHERE account_id IS NOT NULL', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_received ON %I.emails(received_at DESC)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_from ON %I.emails(from_address)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_resend_id ON %I.emails(resend_email_id) WHERE resend_email_id IS NOT NULL', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_category ON %I.emails(ai_category) WHERE ai_category IS NOT NULL', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_starred ON %I.emails(is_starred) WHERE is_starred = TRUE', s, s);

    -- =========================================================
    -- Email Labels (custom folders/tags)
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.email_labels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7) DEFAULT ''#4A90D9'',
        icon VARCHAR(10) DEFAULT ''🏷️'',
        context VARCHAR(20) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (name, context)
      )', s);

    RAISE NOTICE 'Phase 38 Email tables created for schema: %', s;
  END LOOP;
END $$;

-- =========================================================
-- Global: Resend Webhook Log (public schema)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.resend_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  resend_email_id VARCHAR(255),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  target_context VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resend_webhook_log_processed ON public.resend_webhook_log(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_resend_webhook_log_event ON public.resend_webhook_log(event_type);

-- Done
DO $$ BEGIN RAISE NOTICE 'Phase 38 Email Integration migration complete'; END $$;
