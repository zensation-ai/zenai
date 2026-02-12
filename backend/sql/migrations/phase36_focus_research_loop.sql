-- Phase 36: Focus Topic Research Loop
-- Verknüpft Fokusthemen mit proaktiver Recherche und ermöglicht
-- automatisiertes, periodisches Recherchieren zu Fokusthemen.
--
-- Idempotent: Kann mehrfach ausgeführt werden (IF NOT EXISTS).
-- Muss in allen 4 Schemas ausgeführt werden: personal, work, learning, creative.

-- 1. Recherche-Tracking auf domain_focus
ALTER TABLE domain_focus
  ADD COLUMN IF NOT EXISTS last_researched_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS research_summary TEXT,
  ADD COLUMN IF NOT EXISTS research_schedule VARCHAR(20) DEFAULT 'weekly';

-- 2. Fokus-Verknüpfung auf proactive_research
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proactive_research' AND column_name = 'trigger_focus_id'
  ) THEN
    ALTER TABLE proactive_research
      ADD COLUMN trigger_focus_id UUID REFERENCES domain_focus(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proactive_research_focus
  ON proactive_research(trigger_focus_id)
  WHERE trigger_focus_id IS NOT NULL;
