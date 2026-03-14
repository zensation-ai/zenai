-- =============================================================================
-- Phase 72: Neuroscience Memory 2.0 - Emotional Tagging + Ebbinghaus Decay
-- =============================================================================
-- Adds emotional tagging columns and Ebbinghaus stability tracking
-- to learned_facts across all 4 schemas.
--
-- New columns:
--   emotional_score FLOAT  - Overall emotional intensity (0-1)
--   arousal FLOAT          - Physiological arousal level (0-1)
--   valence FLOAT          - Hedonic valence (0=unpleasant, 1=pleasant)
--   stability FLOAT        - Ebbinghaus decay stability in days (SM-2)
--   encoding_context JSONB - Context snapshot at encoding time
-- =============================================================================

DO $do$
DECLARE
  s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal','work','learning','creative'] LOOP

    -- 1. emotional_score: overall emotional intensity
    BEGIN
      EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS emotional_score FLOAT DEFAULT 0', s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- 2. arousal: physiological activation level
    BEGIN
      EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS arousal FLOAT DEFAULT 0', s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- 3. valence: hedonic valence (0=negative, 0.5=neutral, 1=positive)
    BEGIN
      EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS valence FLOAT DEFAULT 0.5', s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- 4. stability: Ebbinghaus decay stability in days (SM-2 algorithm)
    BEGIN
      EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS stability FLOAT DEFAULT 1.0', s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- 5. encoding_context: JSONB context snapshot (timeOfDay, dayOfWeek, taskType)
    BEGIN
      EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS encoding_context JSONB DEFAULT ''{}''', s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- Index on stability for efficient spaced-repetition candidate queries
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_stability ON %I.learned_facts (stability) WHERE confidence > 0.3', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- Index on emotional_score for emotional memory retrieval
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_emotional ON %I.learned_facts (emotional_score) WHERE emotional_score > 0.3', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

  END LOOP;
END $do$;
