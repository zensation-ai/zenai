-- Migration: Fix episodic_memories schema mismatch
-- Date: 2026-03-17
--
-- Problem: episodic_memories table was created with a minimal 10-column schema
-- (create_episodic_memories_table.sql) instead of the full schema from
-- 012_episodic_memory.sql. The code expects 20+ columns that don't exist.
--
-- Also fixes:
-- - Missing working_memory_sessions table in all 4 schemas
-- - Missing consolidated/importance_score columns for sleep-compute
-- - Adds missing session_id column with default for existing rows

DO $$
DECLARE
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
  s TEXT;
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    RAISE NOTICE 'Fixing episodic_memories in schema: %', s;

    -- =============================================
    -- 1. Add missing columns to episodic_memories
    -- =============================================

    -- Core columns the code needs
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS context VARCHAR(50) DEFAULT %L', s, s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS session_id VARCHAR(100) DEFAULT ''unknown''', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS trigger TEXT DEFAULT ''''', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS response TEXT DEFAULT ''''', s);

    -- Emotional context
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS emotional_valence DECIMAL(4,3) DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS emotional_arousal DECIMAL(4,3) DEFAULT 0.5', s);

    -- Temporal context
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(20)', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(20)', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS is_weekend BOOLEAN DEFAULT false', s);

    -- Linkages
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS linked_episodes UUID[] DEFAULT ''{}''', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS linked_facts UUID[] DEFAULT ''{}''', s);

    -- Retrieval (code uses retrieval_count, migration had access_count)
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS retrieval_count INTEGER DEFAULT 0', s);

    -- Sleep compute columns
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS consolidated BOOLEAN DEFAULT false', s);
    EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS importance_score REAL DEFAULT 0.5', s);

    -- Copy access_count to retrieval_count if access_count exists and retrieval_count is 0
    BEGIN
      EXECUTE format('UPDATE %I.episodic_memories SET retrieval_count = access_count WHERE retrieval_count = 0 AND access_count > 0', s);
    EXCEPTION WHEN undefined_column THEN
      NULL; -- access_count column might not exist
    END;

    -- =============================================
    -- 2. Add indexes for new columns
    -- =============================================

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_episodic_context ON %I.episodic_memories(context)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_episodic_session ON %I.episodic_memories(session_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_episodic_emotional ON %I.episodic_memories(emotional_valence, emotional_arousal)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_episodic_consolidated ON %I.episodic_memories(consolidated) WHERE consolidated = false', s, s);

    -- =============================================
    -- 3. Create working_memory_sessions if missing
    -- =============================================

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.working_memory_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(100) UNIQUE NOT NULL,
        context VARCHAR(50) NOT NULL DEFAULT %L,
        current_goal TEXT NOT NULL DEFAULT '''',
        sub_goals TEXT[] DEFAULT ''{}''::TEXT[],
        slots JSONB DEFAULT ''[]''::JSONB,
        capacity INTEGER DEFAULT 7,
        user_id UUID DEFAULT ''00000000-0000-0000-0000-000000000001'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_activity TIMESTAMPTZ DEFAULT NOW()
      )', s, s);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_working_mem_session ON %I.working_memory_sessions(session_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_working_mem_activity ON %I.working_memory_sessions(last_activity)', s, s);

    RAISE NOTICE 'Schema % fixed successfully', s;
  END LOOP;
END $$;

-- =============================================
-- 4. Helper functions (idempotent)
-- =============================================

-- Update retrieval stats with spacing effect
CREATE OR REPLACE FUNCTION update_episodic_retrieval_stats(episode_ids UUID[])
RETURNS void AS $$
BEGIN
  UPDATE episodic_memories
  SET
    retrieval_count = retrieval_count + 1,
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

-- Apply daily decay to episodic memories
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
