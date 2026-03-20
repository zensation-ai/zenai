-- =====================================================
-- Phase 117: RLS Activation on Critical Tables
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-20
-- =====================================================
--
-- CAUTION: Run on staging first. RLS can break queries if app.current_user_id is not set.
--
-- This migration ACTIVATES Row-Level Security on the 6 most critical
-- user-scoped tables per schema. Phase 65 PREPARED the policies but
-- never enabled RLS on the tables.
--
-- Policy pattern:
--   user_id matches current_setting('app.current_user_id', true)
--   OR the current user is SYSTEM_USER_ID (API-key backward compat)
--
-- Prerequisites:
--   - phase65_multiuser_core.sql (user_id columns exist)
--   - phase65_rls_policies.sql (policies were created but may need refresh)
--   - database-context.ts sets app.current_user_id via set_config()
--
-- Idempotent: safe to run multiple times.
-- =====================================================

-- =====================================================
-- PART 1: Enable RLS on critical tables
-- =====================================================

DO $$
DECLARE
  s TEXT;
  t TEXT;
  critical_tables TEXT[] := ARRAY[
    'ideas',
    'tasks',
    'emails',
    'general_chat_sessions',
    'learned_facts',
    'contacts'
  ];
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    FOREACH t IN ARRAY critical_tables LOOP
      BEGIN
        -- Check table exists
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = s AND table_name = t
        ) THEN
          -- Enable RLS (idempotent - no error if already enabled)
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t);
          RAISE NOTICE 'RLS enabled on %.%', s, t;
        ELSE
          RAISE NOTICE 'Table %.% does not exist, skipping', s, t;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error enabling RLS on %.%: %', s, t, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Create/refresh user isolation policies
-- =====================================================
--
-- Policy logic:
--   USING (
--     user_id::text = current_setting('app.current_user_id', true)
--     OR current_setting('app.current_user_id', true) = '00000000-0000-0000-0000-000000000001'
--   )
--
-- When app.current_user_id IS set to a real user:
--   -> user_id must match (strict isolation)
-- When app.current_user_id is SYSTEM_USER_ID:
--   -> bypasses filter (API-key backward compat)
-- When app.current_user_id is NULL/empty:
--   -> neither condition matches -> rows blocked
--   -> this is the SAFE default (no data leak)
-- =====================================================

DO $$
DECLARE
  s TEXT;
  t TEXT;
  policy_name TEXT;
  critical_tables TEXT[] := ARRAY[
    'ideas',
    'tasks',
    'emails',
    'general_chat_sessions',
    'learned_facts',
    'contacts'
  ];
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    FOREACH t IN ARRAY critical_tables LOOP
      policy_name := t || '_user_isolation_v2';
      BEGIN
        -- Only proceed if table has user_id column
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = s
            AND table_name = t
            AND column_name = 'user_id'
        ) THEN
          -- Drop any existing policies (old naming patterns from phase65)
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_user_isolation', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_user_isolation_v2', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_policy', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'allow_all_' || t, s, t);

          -- Create strict isolation policy with SYSTEM_USER_ID bypass
          EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR ALL '
            || 'USING ('
            ||   'user_id::text = current_setting(''app.current_user_id'', true) '
            ||   'OR current_setting(''app.current_user_id'', true) = ''00000000-0000-0000-0000-000000000001'''
            || ') '
            || 'WITH CHECK ('
            ||   'user_id::text = current_setting(''app.current_user_id'', true) '
            ||   'OR current_setting(''app.current_user_id'', true) = ''00000000-0000-0000-0000-000000000001'''
            || ')',
            policy_name, s, t
          );

          RAISE NOTICE 'Created policy % on %.%', policy_name, s, t;
        ELSE
          RAISE NOTICE 'Table %.% has no user_id column, skipping policy', s, t;
        END IF;
      EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'Table %.% does not exist, skipping policy', s, t;
      WHEN OTHERS THEN
        RAISE NOTICE 'Error creating policy on %.%: %', s, t, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 3: Verification
-- =====================================================

DO $$
DECLARE
  s TEXT;
  policy_count INTEGER;
  rls_enabled_count INTEGER;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = s;

    SELECT COUNT(*) INTO rls_enabled_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = s
      AND c.relrowsecurity = true;

    RAISE NOTICE 'Schema %: % RLS policies, % tables with RLS enabled', s, policy_count, rls_enabled_count;
  END LOOP;
END $$;
