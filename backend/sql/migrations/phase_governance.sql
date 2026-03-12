-- Phase Governance: Governance Actions, Policies & Audit Trail
-- Creates governance_actions, governance_policies, audit_log in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- =============================================
    -- governance_actions: Pending/approved/rejected action queue
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.governance_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT %L,
        action_type VARCHAR(50) NOT NULL,
        action_source VARCHAR(50) NOT NULL,
        source_id UUID,
        description TEXT NOT NULL,
        payload JSONB,
        risk_level VARCHAR(20) DEFAULT ''low'' CHECK (risk_level IN (''low'', ''medium'', ''high'', ''critical'')),
        status VARCHAR(20) DEFAULT ''pending'' CHECK (status IN (''pending'', ''auto_approved'', ''approved'', ''rejected'', ''expired'', ''executed'', ''failed'')),
        requires_approval BOOLEAN DEFAULT false,
        approved_by VARCHAR(100),
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        executed_at TIMESTAMPTZ,
        execution_result JSONB,
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL ''24 hours'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_governance_actions_status
      ON %I.governance_actions(status, created_at DESC)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_governance_actions_source
      ON %I.governance_actions(source_id) WHERE source_id IS NOT NULL
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_governance_actions_type
      ON %I.governance_actions(action_type, created_at DESC)
    ', schema_name, schema_name);

    -- =============================================
    -- governance_policies: Rules for auto-approve / require approval
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.governance_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT %L,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        action_type VARCHAR(50) NOT NULL,
        conditions JSONB DEFAULT ''[]'',
        risk_level VARCHAR(20) DEFAULT ''medium'' CHECK (risk_level IN (''low'', ''medium'', ''high'', ''critical'')),
        auto_approve BOOLEAN DEFAULT false,
        notify_on_auto_approve BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_governance_policies_type
      ON %I.governance_policies(action_type, is_active)
    ', schema_name, schema_name);

    -- =============================================
    -- audit_log: Immutable event log for all governance actions
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL DEFAULT %L,
        event_type VARCHAR(100) NOT NULL,
        actor VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id UUID,
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_audit_log_event
      ON %I.audit_log(event_type, created_at DESC)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_audit_log_target
      ON %I.audit_log(target_id) WHERE target_id IS NOT NULL
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_audit_log_actor
      ON %I.audit_log(actor, created_at DESC)
    ', schema_name, schema_name);

    RAISE NOTICE 'Governance tables created for schema: %', schema_name;
  END LOOP;
END $$;
