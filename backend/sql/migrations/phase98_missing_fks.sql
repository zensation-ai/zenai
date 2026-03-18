-- Phase 98: Missing Foreign Key Constraints
-- Adds FK constraints on Phase 92/93/64 tables
-- Uses EXCEPTION WHEN duplicate_object pattern for idempotency

-- =====================================================
-- Schema-scoped FKs: digital_twin + workspace_automations
-- Tables: digital_twin_profiles, digital_twin_snapshots,
--         digital_twin_corrections, workspace_automations
-- All reference public.users(id)
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal', 'work', 'learning', 'creative'] LOOP

    -- digital_twin_profiles.user_id → public.users(id)
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.digital_twin_profiles ADD CONSTRAINT fk_dtp_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN undefined_table THEN NULL;
    END;

    -- digital_twin_snapshots.user_id → public.users(id)
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.digital_twin_snapshots ADD CONSTRAINT fk_dts_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN undefined_table THEN NULL;
    END;

    -- digital_twin_corrections.user_id → public.users(id)
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.digital_twin_corrections ADD CONSTRAINT fk_dtc_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN undefined_table THEN NULL;
    END;

    -- workspace_automations.user_id → public.users(id)
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.workspace_automations ADD CONSTRAINT fk_wa_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE',
        s
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN undefined_table THEN NULL;
    END;

  END LOOP;
END $$;

-- =====================================================
-- Public schema FKs: agent_identities + agent_workflows
-- Both have created_by UUID columns (Phase 64)
-- =====================================================

DO $$ BEGIN
  ALTER TABLE public.agent_identities
    ADD CONSTRAINT fk_ai_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agent_workflows
    ADD CONSTRAINT fk_aw_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;
