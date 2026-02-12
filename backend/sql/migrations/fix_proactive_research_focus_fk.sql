-- =====================================================
-- MIGRATION: Add trigger_focus_id to proactive_research
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-12
-- =====================================================
--
-- Adds trigger_focus_id FK column to proactive_research
-- (references domain_focus). Run AFTER fix_domain_focus_table.sql.
--
-- Idempotent: Kann mehrfach ausgefuehrt werden.
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- Nur wenn proactive_research existiert
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'proactive_research'
    ) THEN

      -- trigger_focus_id Spalte hinzufuegen
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'proactive_research' AND column_name = 'trigger_focus_id'
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I.proactive_research ADD COLUMN trigger_focus_id UUID REFERENCES %I.domain_focus(id) ON DELETE SET NULL',
          s, s
        );
      END IF;

      -- Index fuer trigger_focus_id
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%I_proactive_research_focus ON %I.proactive_research(trigger_focus_id) WHERE trigger_focus_id IS NOT NULL',
        s, s
      );

    END IF;

  END LOOP;
END $$;
