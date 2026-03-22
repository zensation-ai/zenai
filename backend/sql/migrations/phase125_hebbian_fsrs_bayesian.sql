-- Phase 125: Hebbian Learning + FSRS Memory Scheduling + Bayesian Confidence Propagation
-- Adds Hebbian co-activation weights to entity_relations and knowledge_entities,
-- FSRS (Free Spaced Repetition Scheduler) columns to learned_facts with SM-2 migration,
-- and Bayesian propagated_confidence to learned_facts across all 4 schemas.

DO $$
DECLARE
  s TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH s IN ARRAY schemas
  LOOP
    RAISE NOTICE 'Phase 125 — processing schema: %', s;

    -- =========================================================
    -- 1. Hebbian columns on entity_relations
    -- =========================================================

    -- hebbian_weight: co-activation strength between two entities (Hebb rule: neurons that
    -- fire together wire together). Starts at 1.0, increases with co-activation events.
    EXECUTE format(
      'ALTER TABLE %I.entity_relations ADD COLUMN IF NOT EXISTS hebbian_weight FLOAT DEFAULT 1.0',
      s
    );

    -- coactivation_count: how many times both entities appeared in the same context window
    EXECUTE format(
      'ALTER TABLE %I.entity_relations ADD COLUMN IF NOT EXISTS coactivation_count INTEGER DEFAULT 0',
      s
    );

    -- last_coactivated: timestamp of the most recent co-activation event
    EXECUTE format(
      'ALTER TABLE %I.entity_relations ADD COLUMN IF NOT EXISTS last_coactivated TIMESTAMPTZ',
      s
    );

    -- Index on hebbian_weight for retrieving strongest associations quickly
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_relations_hebbian_weight ON %I.entity_relations (hebbian_weight DESC)',
      s, s
    );

    -- Index on last_coactivated for time-decay queries
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_relations_last_coactivated ON %I.entity_relations (last_coactivated DESC NULLS LAST)',
      s, s
    );

    -- =========================================================
    -- 2. entity_coactivations table
    -- Stores raw co-activation events between entity pairs before
    -- they are folded back into entity_relations.hebbian_weight.
    -- =========================================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.entity_coactivations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_a_id UUID NOT NULL REFERENCES %I.knowledge_entities(id) ON DELETE CASCADE,
        entity_b_id UUID NOT NULL REFERENCES %I.knowledge_entities(id) ON DELETE CASCADE,
        coactivation_count INTEGER NOT NULL DEFAULT 1,
        last_coactivated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_%s_entity_coactivations_pair UNIQUE (entity_a_id, entity_b_id)
      )
    ', s, s, s, s);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_coactivations_a ON %I.entity_coactivations (entity_a_id)',
      s, s
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_coactivations_b ON %I.entity_coactivations (entity_b_id)',
      s, s
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_entity_coactivations_last ON %I.entity_coactivations (last_coactivated DESC)',
      s, s
    );

    -- =========================================================
    -- 3. FSRS columns on learned_facts
    -- FSRS (Free Spaced Repetition Scheduler v4) replaces the
    -- older SM-2 stability field with a proper difficulty +
    -- stability pair and a pre-computed next review timestamp.
    -- =========================================================

    -- fsrs_difficulty: item difficulty in [1, 10]. Lower = easier to remember.
    -- Initialized via SM-2 migration below; new facts start at 5.0 (neutral).
    EXECUTE format(
      'ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS fsrs_difficulty FLOAT DEFAULT 5.0',
      s
    );

    -- fsrs_stability: FSRS stability in days. Higher = longer retention half-life.
    -- Mirrors the SM-2 stability field but on the FSRS scale.
    EXECUTE format(
      'ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS fsrs_stability FLOAT DEFAULT 1.0',
      s
    );

    -- fsrs_next_review: when this fact should next be reviewed.
    -- Initialized to NOW() for all unmigrated facts; updated after each review.
    EXECUTE format(
      'ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS fsrs_next_review TIMESTAMPTZ DEFAULT NOW()',
      s
    );

    -- =========================================================
    -- 4. SM-2 → FSRS migration for existing facts
    -- Only runs on rows where fsrs_stability is still the default
    -- (1.0) AND the SM-2 stability column carries a meaningful
    -- value (> 1.0), so the migration is safe to re-run.
    --
    -- Mapping logic:
    --   fsrs_stability  = COALESCE(stability, 1.0)
    --   fsrs_difficulty = inverse of stability range:
    --     stability >= 30  → difficulty 2.0  (very easy)
    --     stability >= 14  → difficulty 3.5  (easy)
    --     stability >= 7   → difficulty 5.0  (medium)
    --     stability >= 3   → difficulty 6.5  (hard)
    --     else             → difficulty 8.0  (very hard / newly learned)
    --   fsrs_next_review = NOW() + (fsrs_stability * INTERVAL '1 day')
    -- =========================================================
    EXECUTE format('
      UPDATE %I.learned_facts
      SET
        fsrs_stability  = COALESCE(stability, 1.0),
        fsrs_difficulty = CASE
                            WHEN COALESCE(stability, 0) >= 30 THEN 2.0
                            WHEN COALESCE(stability, 0) >= 14 THEN 3.5
                            WHEN COALESCE(stability, 0) >= 7  THEN 5.0
                            WHEN COALESCE(stability, 0) >= 3  THEN 6.5
                            ELSE 8.0
                          END,
        fsrs_next_review = NOW() + (COALESCE(stability, 1.0) * INTERVAL ''1 day'')
      WHERE
        fsrs_stability = 1.0          -- only rows still at the column default
        AND COALESCE(stability, 0) > 1.0  -- only rows with real SM-2 data
    ', s);

    -- Index for review-queue queries: fetch overdue facts efficiently
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_fsrs_next_review ON %I.learned_facts (fsrs_next_review ASC) WHERE is_active = true',
      s, s
    );

    -- Index for difficulty-stratified retrieval
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_fsrs_difficulty ON %I.learned_facts (fsrs_difficulty)',
      s, s
    );

    -- =========================================================
    -- 5. Bayesian confidence propagation columns on learned_facts
    -- propagated_confidence holds the posterior confidence after
    -- evidence from related facts has been folded in via Bayesian
    -- updating. confidence_sources records which fact ids
    -- contributed to the posterior so the computation is auditable.
    -- =========================================================

    -- propagated_confidence: posterior after Bayesian update; NULL means not yet computed
    EXECUTE format(
      'ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS propagated_confidence FLOAT',
      s
    );

    -- confidence_sources: JSON array of {fact_id, weight, confidence} objects
    EXECUTE format(
      'ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS confidence_sources JSONB DEFAULT ''[]''',
      s
    );

    -- Partial index: only index facts that have a computed propagated_confidence
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_propagated_conf ON %I.learned_facts (propagated_confidence DESC) WHERE propagated_confidence IS NOT NULL',
      s, s
    );

    -- =========================================================
    -- 6. Hebbian activation columns on knowledge_entities
    -- hebbian_activation decays over time (like neural firing
    -- rates) and is boosted each time the entity is accessed or
    -- co-activated. last_activated enables time-decay queries.
    -- =========================================================

    EXECUTE format(
      'ALTER TABLE %I.knowledge_entities ADD COLUMN IF NOT EXISTS hebbian_activation FLOAT DEFAULT 1.0',
      s
    );

    EXECUTE format(
      'ALTER TABLE %I.knowledge_entities ADD COLUMN IF NOT EXISTS last_activated TIMESTAMPTZ',
      s
    );

    -- Index for retrieving most-active entities (e.g. for context priming)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_knowledge_entities_hebbian_activation ON %I.knowledge_entities (hebbian_activation DESC)',
      s, s
    );

    -- Index for time-decay maintenance worker
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_knowledge_entities_last_activated ON %I.knowledge_entities (last_activated DESC NULLS LAST)',
      s, s
    );

    RAISE NOTICE 'Phase 125 — schema % complete', s;
  END LOOP;
END $$;
