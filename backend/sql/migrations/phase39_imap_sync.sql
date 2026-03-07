-- Phase 39: IMAP Email Sync
-- Adds IMAP connection fields to email_accounts in all 4 context schemas.

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['personal', 'work', 'learning', 'creative']
  LOOP
    -- IMAP connection settings
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255)', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT 993', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS imap_user VARCHAR(320)', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS imap_password_encrypted TEXT', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS imap_tls BOOLEAN DEFAULT TRUE', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS imap_enabled BOOLEAN DEFAULT FALSE', schema_name);

    -- Sync state tracking
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS last_sync_uid BIGINT DEFAULT 0', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS last_sync_uidvalidity BIGINT', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS sync_error TEXT', schema_name);
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS sync_folder VARCHAR(100) DEFAULT ''INBOX''', schema_name);

    -- Index for scheduler queries
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_email_accounts_imap_enabled ON %I.email_accounts (imap_enabled) WHERE imap_enabled = TRUE', schema_name, schema_name);

    RAISE NOTICE 'Schema % — IMAP columns added to email_accounts', schema_name;
  END LOOP;
END $$;
