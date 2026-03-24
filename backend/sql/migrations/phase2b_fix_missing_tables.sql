-- Phase 2B Fix: Create missing tables that cause 500 errors
-- Fixes: calendar_accounts, focus_sessions, email_accounts
-- Idempotent: IF NOT EXISTS on all statements
-- Must run on: personal, work, learning, creative schemas

DO $$
DECLARE
  schema_name TEXT;
  schema_names TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH schema_name IN ARRAY schema_names LOOP

    -- =========================================================
    -- 1. calendar_accounts (from archived phase40)
    -- =========================================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.calendar_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(20) NOT NULL CHECK (provider IN (''icloud'', ''google'', ''caldav'', ''ics'')),
        username VARCHAR(320) NOT NULL,
        password_encrypted VARCHAR(1000) NOT NULL,
        display_name VARCHAR(255),
        caldav_url VARCHAR(500) DEFAULT ''https://caldav.icloud.com'',
        calendars JSONB DEFAULT ''[]'',
        is_enabled BOOLEAN DEFAULT TRUE,
        sync_interval_minutes INTEGER DEFAULT 5,
        last_sync_at TIMESTAMP WITH TIME ZONE,
        last_sync_error TEXT,
        sync_token VARCHAR(500),
        context VARCHAR(20) NOT NULL,
        user_id UUID DEFAULT ''00000000-0000-0000-0000-000000000001'',
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_accounts_enabled
        ON %I.calendar_accounts(provider) WHERE is_enabled = true
    ', schema_name, schema_name);

    -- =========================================================
    -- 2. focus_sessions (from archived phase88)
    -- =========================================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.focus_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT ''00000000-0000-0000-0000-000000000001'',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMPTZ,
        duration_minutes INTEGER NOT NULL DEFAULT 25,
        active_task_id UUID,
        status VARCHAR(20) NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''completed'', ''cancelled'')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_focus_sessions_user_status
        ON %I.focus_sessions(user_id, status)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_focus_sessions_active
        ON %I.focus_sessions(user_id)
        WHERE status = ''active''
    ', schema_name, schema_name);

    -- =========================================================
    -- 3. email_accounts (from archived phase38)
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
        user_id UUID DEFAULT ''00000000-0000-0000-0000-000000000001'',
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (email_address, context)
      )
    ', schema_name);

    RAISE NOTICE 'Missing tables created for schema: %', schema_name;

  END LOOP;
END $$;
