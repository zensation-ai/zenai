-- Phase 40: Calendar Sync & AI Enhancement
-- Adds calendar_accounts table + extends calendar_events for external sync
-- Deployed across all 4 context schemas: personal, work, learning, creative

DO $$
DECLARE
  schema_name TEXT;
  schema_names TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH schema_name IN ARRAY schema_names LOOP

    -- Calendar Accounts (iCloud, Google, CalDAV)
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
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_accounts_enabled
        ON %I.calendar_accounts(provider) WHERE is_enabled = true
    ', schema_name, schema_name);

    -- Extend calendar_events with sync fields
    EXECUTE format('
      ALTER TABLE %I.calendar_events
        ADD COLUMN IF NOT EXISTS external_uid VARCHAR(500),
        ADD COLUMN IF NOT EXISTS external_provider VARCHAR(20),
        ADD COLUMN IF NOT EXISTS calendar_account_id UUID,
        ADD COLUMN IF NOT EXISTS etag VARCHAR(255),
        ADD COLUMN IF NOT EXISTS ical_data TEXT,
        ADD COLUMN IF NOT EXISTS sync_state VARCHAR(10) DEFAULT ''local''
          CHECK (sync_state IN (''local'', ''synced'', ''pending'', ''conflict''))
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_events_external_uid
        ON %I.calendar_events(external_uid) WHERE external_uid IS NOT NULL
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_events_account
        ON %I.calendar_events(calendar_account_id) WHERE calendar_account_id IS NOT NULL
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_events_sync_state
        ON %I.calendar_events(sync_state) WHERE sync_state != ''synced''
    ', schema_name, schema_name);

    -- Calendar AI insights cache
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.calendar_ai_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        insight_type VARCHAR(30) NOT NULL CHECK (insight_type IN (
          ''daily_briefing'', ''smart_suggestion'', ''conflict'', ''optimization''
        )),
        insight_date DATE NOT NULL,
        content JSONB NOT NULL,
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        context VARCHAR(20) NOT NULL,
        metadata JSONB DEFAULT ''{}''
      )
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_ai_insights_date
        ON %I.calendar_ai_insights(insight_date, insight_type)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_calendar_ai_insights_expires
        ON %I.calendar_ai_insights(expires_at) WHERE expires_at IS NOT NULL
    ', schema_name, schema_name);

    RAISE NOTICE 'Phase 40 calendar sync tables created for schema: %', schema_name;
  END LOOP;
END $$;
