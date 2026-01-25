-- Migration: Episodic Memory System
-- Part of HiMeS 4-Layer Memory Architecture
--
-- Episodic Memory stores concrete experiences/interactions
-- Biological inspiration: Hippocampus episodic memory

-- ===========================================
-- Episodic Memories Table
-- ===========================================

CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL DEFAULT 'personal',
  session_id VARCHAR(100) NOT NULL,

  -- What happened
  trigger TEXT NOT NULL,           -- User input that triggered the episode
  response TEXT NOT NULL,          -- AI response

  -- Emotional context (inferred from language)
  emotional_valence DECIMAL(4,3) DEFAULT 0,      -- -1 (negative) to +1 (positive)
  emotional_arousal DECIMAL(4,3) DEFAULT 0.5,    -- 0 (calm) to 1 (excited)

  -- Temporal context
  time_of_day VARCHAR(20),         -- morning, afternoon, evening, night
  day_of_week VARCHAR(20),         -- Monday, Tuesday, etc.
  is_weekend BOOLEAN DEFAULT false,

  -- Linkages
  linked_episodes UUID[] DEFAULT '{}',
  linked_facts UUID[] DEFAULT '{}',

  -- Retrieval statistics (for spacing effect)
  retrieval_count INTEGER DEFAULT 0,
  last_retrieved TIMESTAMPTZ,
  retrieval_strength DECIMAL(5,4) DEFAULT 1.0,   -- Decay-based strength

  -- Embedding for semantic search
  embedding vector(768),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Indexes for Episodic Memories
-- ===========================================

-- Context filtering
CREATE INDEX IF NOT EXISTS idx_episodic_context
  ON episodic_memories(context);

-- Session filtering
CREATE INDEX IF NOT EXISTS idx_episodic_session
  ON episodic_memories(session_id);

-- Temporal queries
CREATE INDEX IF NOT EXISTS idx_episodic_created
  ON episodic_memories(created_at DESC);

-- Emotional filtering
CREATE INDEX IF NOT EXISTS idx_episodic_emotional
  ON episodic_memories(emotional_valence, emotional_arousal);

-- Retrieval strength for memory consolidation
CREATE INDEX IF NOT EXISTS idx_episodic_strength
  ON episodic_memories(retrieval_strength DESC)
  WHERE retrieval_count >= 3;

-- Vector similarity search (HNSW for fast ANN)
CREATE INDEX IF NOT EXISTS idx_episodic_embedding
  ON episodic_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ===========================================
-- Working Memory Sessions Table
-- ===========================================

CREATE TABLE IF NOT EXISTS working_memory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) UNIQUE NOT NULL,
  context VARCHAR(50) NOT NULL DEFAULT 'personal',

  -- Current goal state
  current_goal TEXT NOT NULL,
  sub_goals TEXT[] DEFAULT '{}',

  -- Working memory slots (JSON for flexibility)
  slots JSONB DEFAULT '[]',

  -- Capacity (default: Miller's Law 7 +/- 2)
  capacity INTEGER DEFAULT 7,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_working_memory_session
  ON working_memory_sessions(session_id);

-- Index for cleanup (inactive sessions)
CREATE INDEX IF NOT EXISTS idx_working_memory_activity
  ON working_memory_sessions(last_activity);

-- ===========================================
-- Thinking Chains Table (for Extended Thinking)
-- ===========================================

CREATE TABLE IF NOT EXISTS thinking_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  context VARCHAR(50) NOT NULL DEFAULT 'personal',

  -- Task classification
  task_type VARCHAR(50) NOT NULL,  -- simple_structuring, complex_analysis, etc.

  -- Input signature for finding similar chains
  input_hash VARCHAR(64) NOT NULL,
  input_preview TEXT,              -- First 500 chars for debugging

  -- Thinking content
  thinking_content TEXT NOT NULL,
  thinking_tokens_used INTEGER NOT NULL,

  -- Quality metrics (from feedback)
  response_quality DECIMAL(3,2),   -- 0-1 scale
  feedback_text TEXT,
  feedback_at TIMESTAMPTZ,

  -- Embedding for finding similar successful chains
  embedding vector(768),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding similar chains by task type
CREATE INDEX IF NOT EXISTS idx_thinking_task_type
  ON thinking_chains(task_type);

-- Index for quality-based retrieval
CREATE INDEX IF NOT EXISTS idx_thinking_quality
  ON thinking_chains(response_quality DESC NULLS LAST)
  WHERE response_quality IS NOT NULL;

-- Vector index for finding similar chains
CREATE INDEX IF NOT EXISTS idx_thinking_embedding
  ON thinking_chains
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ===========================================
-- Helper Functions
-- ===========================================

-- Function to update retrieval stats with spacing effect
CREATE OR REPLACE FUNCTION update_episodic_retrieval_stats(episode_ids UUID[])
RETURNS void AS $$
BEGIN
  UPDATE episodic_memories
  SET
    retrieval_count = retrieval_count + 1,
    -- Spacing effect: strength increases more with longer intervals
    retrieval_strength = LEAST(
      1.0,
      retrieval_strength +
        0.1 * POWER(0.9, retrieval_count) *
        GREATEST(0.1, EXTRACT(DAYS FROM NOW() - COALESCE(last_retrieved, created_at)) / 30.0)
    ),
    last_retrieved = NOW(),
    updated_at = NOW()
  WHERE id = ANY(episode_ids);
END;
$$ LANGUAGE plpgsql;

-- Function to apply daily decay to episodic memories
CREATE OR REPLACE FUNCTION apply_episodic_decay()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE episodic_memories
  SET
    retrieval_strength = GREATEST(0.05, retrieval_strength * 0.995),
    updated_at = NOW()
  WHERE updated_at < NOW() - INTERVAL '1 day'
    AND retrieval_strength > 0.05;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- Trigger for updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION update_episodic_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_episodic_updated_at ON episodic_memories;
CREATE TRIGGER trigger_episodic_updated_at
  BEFORE UPDATE ON episodic_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_episodic_updated_at();

DROP TRIGGER IF EXISTS trigger_working_memory_updated_at ON working_memory_sessions;
CREATE TRIGGER trigger_working_memory_updated_at
  BEFORE UPDATE ON working_memory_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_episodic_updated_at();

-- ===========================================
-- Comments
-- ===========================================

COMMENT ON TABLE episodic_memories IS 'Stores concrete experiences/interactions for episodic memory layer (HiMeS)';
COMMENT ON TABLE working_memory_sessions IS 'Stores active working memory state during tasks';
COMMENT ON TABLE thinking_chains IS 'Stores thinking chains for Extended Thinking learning';

COMMENT ON COLUMN episodic_memories.emotional_valence IS 'Emotional valence from -1 (negative) to +1 (positive)';
COMMENT ON COLUMN episodic_memories.emotional_arousal IS 'Emotional arousal from 0 (calm) to 1 (excited)';
COMMENT ON COLUMN episodic_memories.retrieval_strength IS 'Memory strength based on spacing effect (decay + reinforcement)';
