-- Migration: Create episodic_memories table in all schemas
-- Fixes PostgreSQL XX000 error during memory stats collection
-- Date: 2026-02-13

-- ===========================================
-- Personal Schema
-- ===========================================
SET search_path TO personal_ai, public;

CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  embedding VECTOR(1536),
  retrieval_strength FLOAT DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  last_retrieved TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodic_memories_created_at ON episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_retrieval_strength ON episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_embedding ON episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- ===========================================
-- Work Schema
-- ===========================================
SET search_path TO work_ai, public;

CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  embedding VECTOR(1536),
  retrieval_strength FLOAT DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  last_retrieved TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodic_memories_created_at ON episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_retrieval_strength ON episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_embedding ON episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- ===========================================
-- Learning Schema
-- ===========================================
SET search_path TO learning_ai, public;

CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  embedding VECTOR(1536),
  retrieval_strength FLOAT DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  last_retrieved TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodic_memories_created_at ON episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_retrieval_strength ON episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_embedding ON episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- ===========================================
-- Creative Schema
-- ===========================================
SET search_path TO creative_ai, public;

CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  embedding VECTOR(1536),
  retrieval_strength FLOAT DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  last_retrieved TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodic_memories_created_at ON episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_retrieval_strength ON episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memories_embedding ON episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- Reset to default search path
SET search_path TO public;
