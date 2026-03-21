-- Phase 51: Plugin & Extension System
-- Creates plugins table in all 4 context schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    EXECUTE format('
      SET search_path TO %I, public;
      CREATE TABLE IF NOT EXISTS plugins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plugin_id VARCHAR(100) NOT NULL,
        name VARCHAR(200) NOT NULL,
        version VARCHAR(20) NOT NULL DEFAULT ''1.0.0'',
        status VARCHAR(20) NOT NULL DEFAULT ''inactive'',
        config JSONB DEFAULT ''{}'',
        manifest JSONB DEFAULT ''{}'',
        permissions TEXT[] DEFAULT ''{}'',
        error_message TEXT,
        installed_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(plugin_id)
      );
      CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
      CREATE INDEX IF NOT EXISTS idx_plugins_plugin_id ON plugins(plugin_id);
    ', schema_name);
  END LOOP;
END $$;
