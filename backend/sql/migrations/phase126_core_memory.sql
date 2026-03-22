-- Phase 126: Pinned Core Memory + Cross-Context Entity Merging
-- Creates core_memory_blocks per schema and cross_context_entity_links in public schema

-- Per-schema: core_memory_blocks
DO $$ DECLARE schema_name TEXT; BEGIN FOREACH schema_name IN ARRAY ARRAY['personal','work','learning','creative'] LOOP

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.core_memory_blocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      block_type VARCHAR(50) NOT NULL,
      content TEXT DEFAULT '''',
      version INTEGER DEFAULT 1,
      updated_by VARCHAR(20) DEFAULT ''system'',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, block_type)
    )', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I ON %I.core_memory_blocks(user_id)',
    'idx_' || schema_name || '_core_memory_user', schema_name);

END LOOP; END $$;

-- Public schema: cross_context_entity_links
CREATE TABLE IF NOT EXISTS public.cross_context_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_context VARCHAR(20) NOT NULL,
  source_entity_id UUID NOT NULL,
  target_context VARCHAR(20) NOT NULL,
  target_entity_id UUID NOT NULL,
  merge_type VARCHAR(20) DEFAULT 'soft',
  merge_score FLOAT,
  confirmed_by VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_entity_id, target_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_cross_context_links_user ON public.cross_context_entity_links(user_id);
CREATE INDEX IF NOT EXISTS idx_cross_context_links_source ON public.cross_context_entity_links(source_context, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_cross_context_links_target ON public.cross_context_entity_links(target_context, target_entity_id);
