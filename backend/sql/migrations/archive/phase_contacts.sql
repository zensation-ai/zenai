-- =====================================================
-- MIGRATION: Phase 3 - Kontakte & CRM
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-08
-- =====================================================
--
-- Creates organizations, contacts, and contact_interactions
-- across all 4 context schemas (personal, work, learning, creative).
--
-- Run this in Supabase SQL Editor.
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- =========================================================
    -- Organizations
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        industry TEXT,
        website TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        postal_code TEXT,
        country TEXT,
        employee_count INTEGER,
        notes TEXT,
        tags TEXT[],
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_organizations_name
      ON %I.organizations (name)', s, s);

    -- =========================================================
    -- Contacts
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        display_name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        email TEXT[],
        phone TEXT[],
        organization_id UUID REFERENCES %I.organizations(id) ON DELETE SET NULL,
        role TEXT,
        relationship_type TEXT DEFAULT ''other'',
        avatar_url TEXT,
        notes TEXT,
        tags TEXT[],
        source TEXT,
        last_interaction_at TIMESTAMP WITH TIME ZONE,
        interaction_count INTEGER DEFAULT 0,
        ai_summary TEXT,
        is_favorite BOOLEAN DEFAULT FALSE,
        address TEXT,
        city TEXT,
        postal_code TEXT,
        country TEXT,
        social_links JSONB DEFAULT ''{}''::jsonb,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- Index for name search
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contacts_display_name
      ON %I.contacts (display_name)', s, s);

    -- Index for relationship type
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contacts_relationship
      ON %I.contacts (relationship_type)', s, s);

    -- Index for organization lookup
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contacts_organization
      ON %I.contacts (organization_id)', s, s);

    -- Index for favorites
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contacts_favorite
      ON %I.contacts (is_favorite) WHERE is_favorite = TRUE', s, s);

    -- Index for last interaction (for follow-up suggestions)
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contacts_last_interaction
      ON %I.contacts (last_interaction_at DESC NULLS LAST)', s, s);

    -- =========================================================
    -- Contact Interactions (Timeline)
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.contact_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id UUID NOT NULL REFERENCES %I.contacts(id) ON DELETE CASCADE,
        interaction_type TEXT NOT NULL,
        direction TEXT,
        subject TEXT,
        summary TEXT,
        source_id UUID,
        source_type TEXT,
        interaction_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s, s);

    -- Index for contact timeline
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contact_interactions_contact
      ON %I.contact_interactions (contact_id, interaction_at DESC)', s, s);

    -- Index for source lookup (link back to email, calendar event, etc.)
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_contact_interactions_source
      ON %I.contact_interactions (source_type, source_id)', s, s);

  END LOOP;
END $$;
