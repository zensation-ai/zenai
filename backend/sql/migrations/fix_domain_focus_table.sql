-- =====================================================
-- MIGRATION: Create domain_focus table + Phase 36 columns
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-12
-- =====================================================
--
-- Creates missing domain_focus table across all 4 schemas.
-- Includes Phase 36 research columns directly.
--
-- Idempotent: Kann mehrfach ausgefuehrt werden.
-- Fuehre dieses Script im Supabase SQL Editor aus.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- domain_focus - Haupttabelle fuer Fokusthemen (inkl. Phase 36 Spalten)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.domain_focus (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
        learning_goals TEXT[] DEFAULT ARRAY[]::TEXT[],
        document_sources JSONB DEFAULT ''[]''::jsonb,
        api_connections JSONB DEFAULT ''[]''::jsonb,
        priority INTEGER DEFAULT 5,
        focus_embedding vector(768),
        is_active BOOLEAN DEFAULT TRUE,
        ideas_count INTEGER DEFAULT 0,
        last_activity_at TIMESTAMP WITH TIME ZONE,
        last_researched_at TIMESTAMP WITH TIME ZONE,
        research_summary TEXT,
        research_schedule VARCHAR(20) DEFAULT ''weekly'',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- Indexes fuer domain_focus
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_domain_focus_context ON %I.domain_focus(context)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_domain_focus_active ON %I.domain_focus(is_active) WHERE is_active = TRUE', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_domain_focus_priority ON %I.domain_focus(priority DESC)', s, s);

  END LOOP;
END $$;
