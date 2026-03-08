-- ============================================================
-- Phase 5: Screen Memory
-- Creates screen_captures table in all 4 context schemas
-- ============================================================

DO $
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.screen_captures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        app_name TEXT,
        window_title TEXT,
        url TEXT,
        ocr_text TEXT,
        screenshot_path TEXT,
        duration_seconds INTEGER DEFAULT 0,
        is_sensitive BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_screen_timestamp ON %I.screen_captures(timestamp DESC);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_screen_app ON %I.screen_captures(app_name);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_screen_sensitive ON %I.screen_captures(is_sensitive) WHERE is_sensitive = FALSE;', s, s);

  END LOOP;
END
$;
