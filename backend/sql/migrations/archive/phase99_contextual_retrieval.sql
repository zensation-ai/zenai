-- Phase 99: Contextual Retrieval — Enriched chunk storage
-- Adds enriched_content, context_prefix, and enriched_embedding to document_chunks
-- in all 4 schemas for improved RAG retrieval accuracy.

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Add enriched_content column
    EXECUTE format(
      'ALTER TABLE %I.document_chunks ADD COLUMN IF NOT EXISTS enriched_content TEXT',
      schema_name
    );

    -- Add context_prefix column
    EXECUTE format(
      'ALTER TABLE %I.document_chunks ADD COLUMN IF NOT EXISTS context_prefix TEXT',
      schema_name
    );

    -- Add enriched_embedding column (same dimension as embedding)
    EXECUTE format(
      'ALTER TABLE %I.document_chunks ADD COLUMN IF NOT EXISTS enriched_embedding vector(1536)',
      schema_name
    );

    -- Create index on enriched_embedding for vector similarity search
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_doc_chunks_enriched_emb ON %I.document_chunks USING ivfflat (enriched_embedding vector_cosine_ops) WITH (lists = 100)',
      schema_name, schema_name
    );

    RAISE NOTICE 'Schema % — document_chunks enriched columns added', schema_name;
  END LOOP;
END $$;
