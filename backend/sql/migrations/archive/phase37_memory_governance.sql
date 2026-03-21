-- Phase 37: Memory Governance & GDPR Tables
-- Provides DSGVO-compliant memory management:
-- 1. memory_privacy_settings - Per-context privacy controls
-- 2. memory_audit_trail - What was remembered/accessed/deleted

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['personal', 'work', 'learning', 'creative']
  LOOP
    -- Privacy settings per context
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.memory_privacy_settings (
        context VARCHAR(20) PRIMARY KEY,
        enabled_layers JSONB NOT NULL DEFAULT ''["working","episodic","short_term","long_term","procedural","reflection"]'',
        enable_implicit_feedback BOOLEAN NOT NULL DEFAULT true,
        enable_cross_context_sharing BOOLEAN NOT NULL DEFAULT true,
        enable_proactive_suggestions BOOLEAN NOT NULL DEFAULT true,
        retention_days INTEGER NOT NULL DEFAULT 0,
        auto_delete_expired BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )', schema_name);

    -- Audit trail for memory operations
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.memory_audit_trail (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        action VARCHAR(20) NOT NULL,
        memory_layer VARCHAR(20) NOT NULL,
        item_id UUID,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT audit_action_check CHECK (action IN (''created'', ''accessed'', ''updated'', ''deleted'', ''exported'')),
        CONSTRAINT audit_layer_check CHECK (memory_layer IN (''working'', ''episodic'', ''short_term'', ''long_term'', ''procedural'', ''reflection''))
      )', schema_name);

    -- Index for efficient audit trail queries
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_audit_context_time
      ON %I.memory_audit_trail (context, created_at DESC)',
      schema_name, schema_name);
  END LOOP;
END $$;
