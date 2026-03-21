-- Migration: Create episodic_memories table in all schemas
-- Fixes PostgreSQL XX000 error during memory stats collection
-- Date: 2026-02-13

-- ===========================================
-- Personal Schema
-- ===========================================

CREATE TABLE IF NOT EXISTS personal.episodic_memories (
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

CREATE INDEX IF NOT EXISTS idx_personal_episodic_created_at
  ON personal.episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_episodic_retrieval
  ON personal.episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_personal_episodic_embedding
  ON personal.episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- ===========================================
-- Work Schema
-- ===========================================

CREATE TABLE IF NOT EXISTS work.episodic_memories (
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

CREATE INDEX IF NOT EXISTS idx_work_episodic_created_at
  ON work.episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_episodic_retrieval
  ON work.episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_work_episodic_embedding
  ON work.episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- ===========================================
-- Learning Schema
-- ===========================================

CREATE TABLE IF NOT EXISTS learning.episodic_memories (
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

CREATE INDEX IF NOT EXISTS idx_learning_episodic_created_at
  ON learning.episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_episodic_retrieval
  ON learning.episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_learning_episodic_embedding
  ON learning.episodic_memories USING ivfflat (embedding vector_cosine_ops);

-- ===========================================
-- Creative Schema
-- ===========================================

CREATE TABLE IF NOT EXISTS creative.episodic_memories (
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

CREATE INDEX IF NOT EXISTS idx_creative_episodic_created_at
  ON creative.episodic_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_episodic_retrieval
  ON creative.episodic_memories(retrieval_strength DESC);
CREATE INDEX IF NOT EXISTS idx_creative_episodic_embedding
  ON creative.episodic_memories USING ivfflat (embedding vector_cosine_ops);
