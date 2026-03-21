-- Phase 49: Advanced RAG - Semantic Chunking & Multi-Document Reasoning
-- Creates document_chunks and rag_source_feedback tables in all 4 schemas.
-- Idempotent: safe to run multiple times.

-- ===== PERSONAL =====
DO $$ BEGIN
  SET search_path TO personal, public;

  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID,
    parent_chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    strategy VARCHAR(20) DEFAULT 'fixed',
    position INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_document_chunks_parent ON document_chunks(parent_chunk_id);

  CREATE TABLE IF NOT EXISTS rag_source_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL,
    query_text TEXT,
    helpful BOOLEAN,
    relevance_score REAL,
    query_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON personal.document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===== WORK =====
DO $$ BEGIN
  SET search_path TO work, public;

  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID,
    parent_chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    strategy VARCHAR(20) DEFAULT 'fixed',
    position INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_document_chunks_parent ON document_chunks(parent_chunk_id);

  CREATE TABLE IF NOT EXISTS rag_source_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL,
    query_text TEXT,
    helpful BOOLEAN,
    relevance_score REAL,
    query_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON work.document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===== LEARNING =====
DO $$ BEGIN
  SET search_path TO learning, public;

  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID,
    parent_chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    strategy VARCHAR(20) DEFAULT 'fixed',
    position INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_document_chunks_parent ON document_chunks(parent_chunk_id);

  CREATE TABLE IF NOT EXISTS rag_source_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL,
    query_text TEXT,
    helpful BOOLEAN,
    relevance_score REAL,
    query_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON learning.document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===== CREATIVE =====
DO $$ BEGIN
  SET search_path TO creative, public;

  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID,
    parent_chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    strategy VARCHAR(20) DEFAULT 'fixed',
    position INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_document_chunks_parent ON document_chunks(parent_chunk_id);

  CREATE TABLE IF NOT EXISTS rag_source_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL,
    query_text TEXT,
    helpful BOOLEAN,
    relevance_score REAL,
    query_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON creative.document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Reset search_path
SET search_path TO public;
