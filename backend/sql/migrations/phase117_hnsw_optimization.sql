-- =====================================================
-- Phase 117: HNSW Index Optimization for Vector Search
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-20
-- =====================================================
--
-- Migrates vector indexes from IVFFlat to HNSW for improved
-- approximate nearest neighbor search performance.
--
-- HNSW vs IVFFlat tradeoffs:
--   - HNSW: Higher recall (~99%), no training needed, better for dynamic data
--     Slower to build, uses more memory. Best for < 1M vectors.
--   - IVFFlat: Faster build, lower memory. Needs training (lists param).
--     Lower recall, especially with small datasets or uneven distributions.
--
-- For ZenAI's scale (< 100K vectors per table), HNSW is clearly superior.
--
-- Parameters:
--   m = 16        (connections per node, default=16, higher = better recall, more memory)
--   ef_construction = 64  (build-time beam width, default=64, higher = better recall, slower build)
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- This migration uses regular CREATE INDEX inside DO blocks for safety.
-- For production, consider running CONCURRENTLY statements individually.
--
-- Idempotent: uses IF NOT EXISTS throughout.
-- =====================================================

-- =====================================================
-- PART 1: Drop old IVFFlat indexes
-- =====================================================

DO $$
DECLARE
  s TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    -- knowledge_entities IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_knowledge_entities_embedding', s, s);
    -- Alternate naming pattern from phase58
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%I_knowledge_entities_embedding', s, s);

    -- graph_communities_v2 IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_graph_communities_v2_summary_embedding', s, s);
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%I_graph_communities_v2_summary_embedding', s, s);

    -- episodic_memories IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_episodic_memories_embedding', s, s);

    -- procedural_memories IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_procedural_memories_embedding', s, s);
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%I_procedural_memories_embedding', s, s);

    -- document_chunks enriched_embedding IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_doc_chunks_enriched_emb', s, s);

    -- ideas embedding IVFFlat (may or may not exist)
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_ideas_embedding', s, s);
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%I_ideas_embedding', s, s);

    -- thinking_chains IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_thinking_chains_embedding', s, s);
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%I_thinking_chains_embedding', s, s);

    -- learned_facts IVFFlat
    EXECUTE format('DROP INDEX IF EXISTS %I.idx_%s_learned_facts_embedding', s, s);

    RAISE NOTICE 'Dropped old IVFFlat indexes in schema %', s;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Create HNSW indexes
-- =====================================================

DO $$
DECLARE
  s TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH s IN ARRAY schemas LOOP

    -- -----------------------------------------
    -- ideas.embedding (vector(768)) - core semantic search
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ideas' AND column_name = 'embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_ideas_embedding_hnsw '
        || 'ON %I.ideas USING hnsw (embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.ideas.embedding', s;
    END IF;

    -- -----------------------------------------
    -- learned_facts.embedding (vector(768/1536)) - memory retrieval
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'learned_facts' AND column_name = 'embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_embedding_hnsw '
        || 'ON %I.learned_facts USING hnsw (embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.learned_facts.embedding', s;
    END IF;

    -- -----------------------------------------
    -- knowledge_entities.embedding (vector(1536)) - GraphRAG
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'knowledge_entities' AND column_name = 'embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_knowledge_entities_embedding_hnsw '
        || 'ON %I.knowledge_entities USING hnsw (embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.knowledge_entities.embedding', s;
    END IF;

    -- -----------------------------------------
    -- graph_communities_v2.summary_embedding (vector(1536)) - community search
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'graph_communities_v2' AND column_name = 'summary_embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_graph_communities_v2_summary_hnsw '
        || 'ON %I.graph_communities_v2 USING hnsw (summary_embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.graph_communities_v2.summary_embedding', s;
    END IF;

    -- -----------------------------------------
    -- episodic_memories.embedding - episodic memory search
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'episodic_memories' AND column_name = 'embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_episodic_memories_embedding_hnsw '
        || 'ON %I.episodic_memories USING hnsw (embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.episodic_memories.embedding', s;
    END IF;

    -- -----------------------------------------
    -- procedural_memories.embedding (vector(1536)) - procedure recall
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'procedural_memories' AND column_name = 'embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_procedural_memories_embedding_hnsw '
        || 'ON %I.procedural_memories USING hnsw (embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.procedural_memories.embedding', s;
    END IF;

    -- -----------------------------------------
    -- thinking_chains.embedding (vector(1536)) - thinking similarity
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'thinking_chains' AND column_name = 'embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_thinking_chains_embedding_hnsw '
        || 'ON %I.thinking_chains USING hnsw (embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.thinking_chains.embedding', s;
    END IF;

    -- -----------------------------------------
    -- document_chunks.enriched_embedding (vector(1536)) - contextual retrieval
    -- -----------------------------------------
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'document_chunks' AND column_name = 'enriched_embedding'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_doc_chunks_enriched_embedding_hnsw '
        || 'ON %I.document_chunks USING hnsw (enriched_embedding vector_cosine_ops) '
        || 'WITH (m = 16, ef_construction = 64)',
        s, s
      );
      RAISE NOTICE 'Created HNSW index on %.document_chunks.enriched_embedding', s;
    END IF;

  END LOOP;
END $$;

-- =====================================================
-- PART 3: Verification
-- =====================================================

DO $$
DECLARE
  s TEXT;
  hnsw_count INTEGER;
  ivfflat_count INTEGER;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    SELECT COUNT(*) INTO hnsw_count
    FROM pg_indexes
    WHERE schemaname = s AND indexdef LIKE '%hnsw%';

    SELECT COUNT(*) INTO ivfflat_count
    FROM pg_indexes
    WHERE schemaname = s AND indexdef LIKE '%ivfflat%';

    RAISE NOTICE 'Schema %: % HNSW indexes, % IVFFlat indexes remaining', s, hnsw_count, ivfflat_count;
  END LOOP;
END $$;
