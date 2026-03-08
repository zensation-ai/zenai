-- =====================================================
-- MIGRATION: Phase 2 - Eingebetteter Browser
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-08
-- =====================================================
--
-- Creates browsing_history and bookmarks tables
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
    -- Browsing History
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.browsing_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL,
        title TEXT,
        domain TEXT NOT NULL,
        visit_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        duration_seconds INTEGER,
        content_summary TEXT,
        content_text TEXT,
        keywords TEXT[],
        category TEXT,
        is_bookmarked BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- Index for domain lookups
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_browsing_history_domain
      ON %I.browsing_history (domain)', s, s);

    -- Index for visit_time range queries
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_browsing_history_visit_time
      ON %I.browsing_history (visit_time DESC)', s, s);

    -- Index for category filtering
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_browsing_history_category
      ON %I.browsing_history (category)', s, s);

    -- =========================================================
    -- Bookmarks
    -- =========================================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.bookmarks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        folder TEXT DEFAULT ''Unsortiert'',
        tags TEXT[],
        ai_summary TEXT,
        favicon_url TEXT,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- Index for folder filtering
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_bookmarks_folder
      ON %I.bookmarks (folder)', s, s);

    -- Index for URL uniqueness within context
    EXECUTE format('
      CREATE UNIQUE INDEX IF NOT EXISTS idx_%I_bookmarks_url_unique
      ON %I.bookmarks (url)', s, s);

  END LOOP;
END $$;
