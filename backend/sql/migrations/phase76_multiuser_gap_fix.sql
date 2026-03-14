-- Phase 76: Multi-User Gap Fix
-- Adds user_id UUID to tables created in Phases 54-64 that were missed
-- by the Phase 65 multi-user migration.
--
-- Affected tables (per schema): procedural_memories, governance_actions,
-- governance_policies, audit_log, context_rules, context_rule_performance,
-- system_events, proactive_rules, smart_suggestions
--
-- Public schema: agent_identities, agent_workflows, agent_workflow_runs, agent_action_logs

DO $$
DECLARE
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
  s TEXT;
  default_user UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOREACH s IN ARRAY schemas
  LOOP
    -- procedural_memories
    EXECUTE format('ALTER TABLE %I.procedural_memories ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.procedural_memories SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_proc_mem_user ON %I.procedural_memories(user_id)', s, s);

    -- governance_actions
    EXECUTE format('ALTER TABLE %I.governance_actions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.governance_actions SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_gov_actions_user ON %I.governance_actions(user_id)', s, s);

    -- governance_policies (shared within context, but track creator)
    EXECUTE format('ALTER TABLE %I.governance_policies ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.governance_policies SET user_id = %L WHERE user_id IS NULL', s, default_user);

    -- audit_log
    EXECUTE format('ALTER TABLE %I.audit_log ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.audit_log SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_audit_log_user ON %I.audit_log(user_id)', s, s);

    -- context_rules
    EXECUTE format('ALTER TABLE %I.context_rules ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.context_rules SET user_id = %L WHERE user_id IS NULL', s, default_user);

    -- context_rule_performance
    EXECUTE format('ALTER TABLE %I.context_rule_performance ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.context_rule_performance SET user_id = %L WHERE user_id IS NULL', s, default_user);

    -- system_events
    EXECUTE format('ALTER TABLE %I.system_events ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.system_events SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_sys_events_user ON %I.system_events(user_id)', s, s);

    -- proactive_rules (shared config, track creator)
    EXECUTE format('ALTER TABLE %I.proactive_rules ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.proactive_rules SET user_id = %L WHERE user_id IS NULL', s, default_user);

    -- smart_suggestions
    EXECUTE format('ALTER TABLE %I.smart_suggestions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.smart_suggestions SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_smart_sugg_user ON %I.smart_suggestions(user_id)', s, s);

    -- memory_entity_links
    EXECUTE format('ALTER TABLE %I.memory_entity_links ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.memory_entity_links SET user_id = %L WHERE user_id IS NULL', s, default_user);
  END LOOP;

  -- Public schema tables
  ALTER TABLE IF EXISTS public.agent_identities ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  UPDATE public.agent_identities SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_agent_identities_user ON public.agent_identities(user_id);

  ALTER TABLE IF EXISTS public.agent_workflows ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  UPDATE public.agent_workflows SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_agent_workflows_user ON public.agent_workflows(user_id);

  ALTER TABLE IF EXISTS public.agent_workflow_runs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  UPDATE public.agent_workflow_runs SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_user ON public.agent_workflow_runs(user_id);

  ALTER TABLE IF EXISTS public.agent_action_logs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  UPDATE public.agent_action_logs SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_agent_action_logs_user ON public.agent_action_logs(user_id);

  RAISE NOTICE 'Phase 76: Multi-user gap fix complete - user_id added to all Phase 54-64 tables';
END $$;
