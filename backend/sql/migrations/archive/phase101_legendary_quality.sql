-- Phase 101: Legendary Quality Migration
-- B1: RAG Evaluation Metrics table
-- B2: Full-text search vector on chat_messages
--
-- Apply to each schema: personal, work, learning, creative
-- Replace {schema} with schema name before executing

-- ===========================================
-- B1: RAG Evaluation Metrics
-- ===========================================

CREATE TABLE IF NOT EXISTS {schema}.rag_evaluation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT NOT NULL,
  precision_at_k FLOAT NOT NULL CHECK (precision_at_k >= 0 AND precision_at_k <= 1),
  mrr FLOAT NOT NULL CHECK (mrr >= 0 AND mrr <= 1),
  ndcg FLOAT NOT NULL CHECK (ndcg >= 0 AND ndcg <= 1),
  k INTEGER NOT NULL DEFAULT 5,
  threshold FLOAT NOT NULL DEFAULT 0.6,
  strategy_used VARCHAR(100),
  result_count INTEGER,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_{schema}_rag_eval_created
  ON {schema}.rag_evaluation_metrics(created_at DESC);

-- Index for per-strategy aggregation
CREATE INDEX IF NOT EXISTS idx_{schema}_rag_eval_strategy
  ON {schema}.rag_evaluation_metrics(strategy_used, created_at DESC);

-- ===========================================
-- B2: Full-text search on chat_messages
-- ===========================================

-- Add tsvector column for full-text search (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = '{schema}'
      AND table_name = 'chat_messages'
      AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE {schema}.chat_messages
    ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('simple',
          COALESCE(content, '') || ' ' ||
          COALESCE((metadata::text), '')
        )
      ) STORED;
  END IF;
END;
$$;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_{schema}_chat_messages_fts
  ON {schema}.chat_messages USING GIN(search_vector);

-- Index for date-filtered search
CREATE INDEX IF NOT EXISTS idx_{schema}_chat_messages_created
  ON {schema}.chat_messages(session_id, created_at DESC);
