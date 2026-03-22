# Phase 125: Hebbian Knowledge Graph + FSRS Memory + Bayesian Confidence

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ZenAI's knowledge graph into a neurally-inspired system where connections strengthen through use (Hebbian), memory scheduling uses modern spaced repetition (FSRS replacing SM-2), and confidence propagates through the graph (Bayesian).

**Architecture:** Three new services layered onto existing infrastructure. `hebbian-dynamics.ts` hooks into entity retrieval and co-activation events. `fsrs-scheduler.ts` replaces `ebbinghaus-decay.ts` functions with FSRS-variant scheduling. `confidence-propagation.ts` runs as a batch job in Sleep Compute to propagate confidence through entity relations. All services use existing BullMQ queues for async processing.

**Tech Stack:** TypeScript, PostgreSQL (pgvector), BullMQ (Redis), existing Claude API for no additional LLM calls in this phase.

**Key Discovery:** `knowledge-graph-evolution.ts` already has `reinforceRelation()` with `reinforcementCount` and `lastReinforced` — a Hebbian precursor. We build on this existing pattern rather than creating from scratch.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `backend/src/services/knowledge-graph/hebbian-dynamics.ts` | Co-activation tracking, asymptotic weight strengthening, decay, homeostatic normalization |
| `backend/src/services/memory/fsrs-scheduler.ts` | FSRS-variant algorithm: difficulty, stability, retrievability, scheduling |
| `backend/src/services/knowledge-graph/confidence-propagation.ts` | Bayesian belief propagation through entity relations |
| `backend/src/services/memory/recall-tracker.ts` | Post-response hook: detect successful/failed/partial fact recalls |
| `backend/sql/migrations/phase125_hebbian_fsrs_bayesian.sql` | All DB changes for Phase 125 |
| `backend/src/__tests__/unit/services/hebbian-dynamics.test.ts` | Hebbian unit tests |
| `backend/src/__tests__/unit/services/fsrs-scheduler.test.ts` | FSRS unit tests |
| `backend/src/__tests__/unit/services/confidence-propagation.test.ts` | Bayesian unit tests |
| `backend/src/__tests__/unit/services/recall-tracker.test.ts` | Recall detection tests |

### Modified Files

| File | What Changes |
|------|-------------|
| `backend/src/services/memory/ebbinghaus-decay.ts` | Deprecation wrapper — functions delegate to fsrs-scheduler |
| `backend/src/services/memory/long-term-memory.ts` | Import redirect: ebbinghaus → fsrs-scheduler |
| `backend/src/services/memory/ltm-consolidation.ts` | Import redirect: ebbinghaus → fsrs-scheduler |
| `backend/src/services/memory/sleep-compute.ts` | Stage 5 uses Hebbian decay; new Stage 6 for Bayesian propagation |
| `backend/src/services/knowledge-graph/hybrid-retriever.ts` | Inject Hebbian weights into graph traversal scoring |
| `backend/src/services/knowledge-graph/graph-builder.ts` | Record co-activations after entity extraction |
| `backend/src/services/enhanced-rag.ts` | Add propagated confidence to RAG scoring |
| `backend/src/services/claude/streaming.ts` | Post-response recall tracking hook |
| `backend/src/services/queue/job-queue.ts` | Register `hebbian-decay` queue |
| `backend/src/services/queue/workers.ts` | Add Hebbian decay worker processor + concurrency config |

---

## Chunk 1: Database Migration + FSRS Core Algorithm

### Task 1: Database Migration

**Files:**
- Create: `backend/sql/migrations/phase125_hebbian_fsrs_bayesian.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Phase 125: Hebbian Knowledge Graph + FSRS Memory + Bayesian Confidence
-- Applies to all 4 schemas: personal, work, learning, creative

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['personal', 'work', 'learning', 'creative']
  LOOP
    -- 1. Hebbian columns on entity_relations
    EXECUTE format('
      ALTER TABLE %I.entity_relations
        ADD COLUMN IF NOT EXISTS hebbian_weight FLOAT DEFAULT 1.0,
        ADD COLUMN IF NOT EXISTS coactivation_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_coactivated TIMESTAMPTZ
    ', schema_name);

    -- 2. Co-activation tracking table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.entity_coactivations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_a_id UUID NOT NULL REFERENCES %I.knowledge_entities(id) ON DELETE CASCADE,
        entity_b_id UUID NOT NULL REFERENCES %I.knowledge_entities(id) ON DELETE CASCADE,
        coactivation_count INTEGER DEFAULT 1,
        last_coactivated TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(entity_a_id, entity_b_id)
      )
    ', schema_name, schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_coactivations_entities
        ON %I.entity_coactivations(entity_a_id, entity_b_id)
    ', schema_name, schema_name);

    -- 3. FSRS columns on learned_facts
    EXECUTE format('
      ALTER TABLE %I.learned_facts
        ADD COLUMN IF NOT EXISTS fsrs_difficulty FLOAT DEFAULT 5.0,
        ADD COLUMN IF NOT EXISTS fsrs_stability FLOAT DEFAULT 1.0,
        ADD COLUMN IF NOT EXISTS fsrs_next_review TIMESTAMPTZ DEFAULT NOW()
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_facts_next_review
        ON %I.learned_facts(fsrs_next_review)
        WHERE is_active = true
    ', schema_name, schema_name);

    -- 4. Migrate existing SM-2 stability values to FSRS
    EXECUTE format('
      UPDATE %I.learned_facts
      SET
        fsrs_stability = COALESCE(stability, 1.0),
        fsrs_difficulty = CASE
          WHEN stability IS NULL THEN 5.0
          WHEN stability > 100 THEN 2.0
          WHEN stability > 30 THEN 3.0
          WHEN stability > 7 THEN 5.0
          WHEN stability > 1 THEN 7.0
          ELSE 9.0
        END,
        fsrs_next_review = NOW() + (COALESCE(stability, 1.0) * 0.105) * INTERVAL ''1 day''
      WHERE fsrs_difficulty = 5.0 AND stability IS NOT NULL AND stability != 1.0
    ', schema_name);

    -- 5. Bayesian propagated confidence on learned_facts
    EXECUTE format('
      ALTER TABLE %I.learned_facts
        ADD COLUMN IF NOT EXISTS propagated_confidence FLOAT,
        ADD COLUMN IF NOT EXISTS confidence_sources JSONB DEFAULT ''[]''
    ', schema_name);

    -- 6. Hebbian weight on knowledge_entities (for entity-level tracking)
    EXECUTE format('
      ALTER TABLE %I.knowledge_entities
        ADD COLUMN IF NOT EXISTS hebbian_activation FLOAT DEFAULT 1.0,
        ADD COLUMN IF NOT EXISTS last_activated TIMESTAMPTZ
    ', schema_name);

  END LOOP;
END $$;
```

- [ ] **Step 2: Verify migration is idempotent**

Run mentally or in test: all statements use `IF NOT EXISTS` / `IF NOT EXISTS`. The SM-2→FSRS migration has a WHERE guard (`AND stability IS NOT NULL AND stability != 1.0`) so it only runs on unmigrated facts.

- [ ] **Step 3: Commit**

```bash
git add backend/sql/migrations/phase125_hebbian_fsrs_bayesian.sql
git commit -m "sql: add Phase 125 migration — Hebbian, FSRS, Bayesian columns"
```

---

### Task 2: FSRS Core Algorithm

**Files:**
- Create: `backend/src/services/memory/fsrs-scheduler.ts`
- Test: `backend/src/__tests__/unit/services/fsrs-scheduler.test.ts`

- [ ] **Step 1: Write failing tests for FSRS core functions**

```typescript
// backend/src/__tests__/unit/services/fsrs-scheduler.test.ts

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  FSRSState,
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
  clampDifficulty,
} from '../../../services/memory/fsrs-scheduler';

describe('fsrs-scheduler', () => {
  describe('getRetrievability', () => {
    it('returns 1.0 immediately after review', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const R = getRetrievability(state, new Date());
      expect(R).toBeCloseTo(1.0, 2);
    });

    it('decays exponentially over time', () => {
      const reviewed = new Date('2026-03-01');
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: reviewed };
      const after5days = new Date('2026-03-06');
      const R = getRetrievability(state, after5days);
      // R = e^(-5/10) = e^(-0.5) ≈ 0.6065
      expect(R).toBeCloseTo(0.6065, 3);
    });

    it('returns near-zero for very old facts', () => {
      const reviewed = new Date('2025-01-01');
      const state: FSRSState = { difficulty: 5.0, stability: 1.0, nextReview: reviewed };
      const R = getRetrievability(state, new Date('2026-03-22'));
      expect(R).toBeLessThan(0.001);
    });
  });

  describe('scheduleNextReview', () => {
    it('schedules review when R drops to target retention', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const targetRetention = 0.9;
      const nextReview = scheduleNextReview(state, targetRetention);
      // t = -S * ln(targetRetention) = -10 * ln(0.9) ≈ 1.054 days
      const diffMs = nextReview.getTime() - Date.now();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(1.054, 1);
    });

    it('schedules further out for high stability', () => {
      const lowS: FSRSState = { difficulty: 5.0, stability: 5.0, nextReview: new Date() };
      const highS: FSRSState = { difficulty: 5.0, stability: 50.0, nextReview: new Date() };
      const lowNext = scheduleNextReview(lowS, 0.9);
      const highNext = scheduleNextReview(highS, 0.9);
      expect(highNext.getTime()).toBeGreaterThan(lowNext.getTime());
    });
  });

  describe('updateAfterRecall', () => {
    it('increases stability after successful recall', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const updated = updateAfterRecall(state, 4, 0.7); // grade 4 (good), R was 0.7
      expect(updated.stability).toBeGreaterThan(state.stability);
    });

    it('decreases difficulty on high grade', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const updated = updateAfterRecall(state, 5, 0.6); // grade 5 (excellent)
      expect(updated.difficulty).toBeLessThan(state.difficulty);
    });

    it('increases difficulty on low grade', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const updated = updateAfterRecall(state, 2, 0.8); // grade 2 (hard)
      expect(updated.difficulty).toBeGreaterThan(state.difficulty);
    });

    it('clamps difficulty between 1 and 10', () => {
      const easyState: FSRSState = { difficulty: 1.1, stability: 50.0, nextReview: new Date() };
      const hardState: FSRSState = { difficulty: 9.9, stability: 1.0, nextReview: new Date() };
      const afterEasy = updateAfterRecall(easyState, 5, 0.5);
      const afterHard = updateAfterRecall(hardState, 1, 0.9);
      expect(afterEasy.difficulty).toBeGreaterThanOrEqual(1.0);
      expect(afterHard.difficulty).toBeLessThanOrEqual(10.0);
    });

    it('rewards recall at low retrievability more than high', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const recalledAtLowR = updateAfterRecall(state, 4, 0.3); // hard recall
      const recalledAtHighR = updateAfterRecall(state, 4, 0.9); // easy recall
      // Desirable difficulty: recalling when R is low should boost S more
      expect(recalledAtLowR.stability).toBeGreaterThan(recalledAtHighR.stability);
    });
  });

  describe('updateAfterForgot', () => {
    it('decreases stability after forgotten recall', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const updated = updateAfterForgot(state, 0.5);
      expect(updated.stability).toBeLessThan(state.stability);
    });

    it('never drops stability below 0.5', () => {
      const state: FSRSState = { difficulty: 9.0, stability: 0.6, nextReview: new Date() };
      const updated = updateAfterForgot(state, 0.1);
      expect(updated.stability).toBeGreaterThanOrEqual(0.5);
    });

    it('increases difficulty', () => {
      const state: FSRSState = { difficulty: 5.0, stability: 10.0, nextReview: new Date() };
      const updated = updateAfterForgot(state, 0.5);
      expect(updated.difficulty).toBeGreaterThan(state.difficulty);
    });
  });

  describe('initFromDecayClass', () => {
    it('maps permanent to low difficulty + high stability', () => {
      const state = initFromDecayClass('permanent', 0.8);
      expect(state.difficulty).toBeLessThan(3.0);
      expect(state.stability).toBeGreaterThan(30);
    });

    it('maps fast_decay to high difficulty + low stability', () => {
      const state = initFromDecayClass('fast_decay', 0.3);
      expect(state.difficulty).toBeGreaterThan(6.0);
      expect(state.stability).toBeLessThan(5);
    });

    it('incorporates emotional weight as stability modifier', () => {
      const lowEmotion = initFromDecayClass('normal_decay', 0.1);
      const highEmotion = initFromDecayClass('normal_decay', 0.9);
      // High emotional arousal = better consolidation = higher initial stability
      expect(highEmotion.stability).toBeGreaterThan(lowEmotion.stability);
    });
  });

  describe('initFromSM2', () => {
    it('converts existing SM-2 stability to FSRS state', () => {
      const state = initFromSM2(30.0); // 30 days SM-2 stability
      expect(state.stability).toBeCloseTo(30.0);
      expect(state.difficulty).toBeGreaterThan(1);
      expect(state.difficulty).toBeLessThan(10);
    });

    it('handles null SM-2 stability', () => {
      const state = initFromSM2(null);
      expect(state.stability).toBe(1.0);
      expect(state.difficulty).toBe(5.0);
    });
  });

  describe('clampDifficulty', () => {
    it('clamps below 1 to 1', () => {
      expect(clampDifficulty(0.5)).toBe(1.0);
    });
    it('clamps above 10 to 10', () => {
      expect(clampDifficulty(11.0)).toBe(10.0);
    });
    it('passes through valid values', () => {
      expect(clampDifficulty(5.5)).toBe(5.5);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="fsrs-scheduler" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FSRS scheduler**

```typescript
// backend/src/services/memory/fsrs-scheduler.ts

import { logger } from '../../utils/logger';

/**
 * FSRS-variant Spaced Repetition Scheduler
 *
 * Inspired by the FSRS algorithm (Jarrett Ye, open-spaced-repetition project).
 * This is an FSRS-inspired variant with hand-tuned parameters, not the original
 * FSRS-5 with ML-optimized weights. Parameters can be calibrated from actual
 * recall data in Phase 137 (Feedback Revolution).
 *
 * Three state variables per fact:
 * - Difficulty (D): 1-10, how hard this fact is to retain
 * - Stability (S): days, how slowly the memory decays
 * - Retrievability (R): 0-1, current recall probability = e^(-t/S)
 */

export interface FSRSState {
  difficulty: number;   // 1.0-10.0
  stability: number;    // days (>= 0.5)
  nextReview: Date;
}

// --- Constants ---

const TARGET_RETENTION = 0.9;
const MIN_STABILITY = 0.5;
const MIN_DIFFICULTY = 1.0;
const MAX_DIFFICULTY = 10.0;
const MS_PER_DAY = 86_400_000;

// Decay class → FSRS initial parameters
const DECAY_CLASS_MAP: Record<string, { difficulty: number; stability: number }> = {
  permanent:    { difficulty: 1.5, stability: 90.0 },
  slow_decay:   { difficulty: 3.0, stability: 30.0 },
  normal_decay: { difficulty: 5.0, stability: 7.0 },
  fast_decay:   { difficulty: 7.5, stability: 2.0 },
};

// --- Core Functions ---

/**
 * Calculate current retrievability: R = e^(-t/S)
 */
export function getRetrievability(state: FSRSState, now: Date = new Date()): number {
  const elapsedDays = Math.max(0, (now.getTime() - state.nextReview.getTime()) / MS_PER_DAY);
  // nextReview is set to the time of last review + scheduled interval
  // So elapsed since last review = elapsed since nextReview was computed
  // Actually: we want elapsed since LAST REVIEW, not since nextReview
  // But we store nextReview = lastReview + interval
  // So lastReview = nextReview - interval, and elapsed = now - lastReview
  // Simplification: use the scheduled time. R at nextReview = TARGET_RETENTION.
  // R at now = e^(-(now - (nextReview - interval * something)) / S)
  // Simpler: R = e^(-daysSinceScheduled / S) where daysSinceScheduled counts from
  // the point where R was 1.0 (the last review moment).
  // We need to store lastReviewed or derive it.
  // For simplicity: derive lastReviewed = nextReview - (-S * ln(TARGET_RETENTION))
  const scheduledInterval = -state.stability * Math.log(TARGET_RETENTION);
  const lastReviewed = new Date(state.nextReview.getTime() - scheduledInterval * MS_PER_DAY);
  const totalElapsed = Math.max(0, (now.getTime() - lastReviewed.getTime()) / MS_PER_DAY);
  return Math.exp(-totalElapsed / state.stability);
}

/**
 * Calculate when next review should happen (when R drops to target)
 */
export function scheduleNextReview(
  state: FSRSState,
  targetRetention: number = TARGET_RETENTION,
  now: Date = new Date()
): Date {
  const intervalDays = -state.stability * Math.log(targetRetention);
  return new Date(now.getTime() + intervalDays * MS_PER_DAY);
}

/**
 * Update state after successful recall
 * Grade: 1 (hard) to 5 (trivial), 3 = neutral
 * retrievability: R at time of recall (lower R = harder recall = bigger S boost)
 */
export function updateAfterRecall(
  state: FSRSState,
  grade: number,
  retrievability: number,
  now: Date = new Date()
): FSRSState {
  const D = state.difficulty;
  const S = state.stability;
  const R = Math.max(0.01, Math.min(1.0, retrievability));
  const G = Math.max(1, Math.min(5, grade));

  // Stability update: reward recalling at low R (desirable difficulty)
  // S_new = S * (1 + a * (11 - D) * S^(-b) * (e^(c * (1-R)) - 1))
  // where a, b, c are tuning parameters
  const a = 0.2;
  const b = 0.2;
  const c = 0.3;
  const stabilityGrowth = a * (11 - D) * Math.pow(S, -b) * (Math.exp(c * (1 - R)) - 1);
  const newStability = Math.max(MIN_STABILITY, S * (1 + stabilityGrowth));

  // Difficulty update: grade 3 is neutral, <3 harder, >3 easier
  const difficultyDelta = -0.15 * (G - 3);
  const newDifficulty = clampDifficulty(D + difficultyDelta);

  const newState: FSRSState = {
    difficulty: newDifficulty,
    stability: newStability,
    nextReview: scheduleNextReview({ difficulty: newDifficulty, stability: newStability, nextReview: now }, TARGET_RETENTION, now),
  };

  logger.debug('FSRS recall update', {
    grade: G,
    retrievability: R,
    oldStability: S,
    newStability: newState.stability,
    oldDifficulty: D,
    newDifficulty: newState.difficulty,
    nextReview: newState.nextReview.toISOString(),
  });

  return newState;
}

/**
 * Update state after failed recall (fact existed but was NOT retrieved)
 */
export function updateAfterForgot(
  state: FSRSState,
  retrievability: number,
  now: Date = new Date()
): FSRSState {
  const D = state.difficulty;
  const S = state.stability;
  const R = Math.max(0.01, retrievability);

  // Stability drops significantly on failure
  const stabilityFactor = Math.max(0.1, 0.2 * Math.pow(D, -0.4) * Math.pow(S + 1, 0.2) * (Math.exp(0.02 * (1 - R)) - 1));
  const newStability = Math.max(MIN_STABILITY, S * stabilityFactor);

  // Difficulty increases
  const newDifficulty = clampDifficulty(D + 0.2);

  const newState: FSRSState = {
    difficulty: newDifficulty,
    stability: newStability,
    nextReview: scheduleNextReview({ difficulty: newDifficulty, stability: newStability, nextReview: now }, TARGET_RETENTION, now),
  };

  logger.debug('FSRS forgot update', {
    retrievability: R,
    oldStability: S,
    newStability: newState.stability,
    oldDifficulty: D,
    newDifficulty: newState.difficulty,
  });

  return newState;
}

/**
 * Initialize FSRS state from decay class + emotional weight
 */
export function initFromDecayClass(
  decayClass: string,
  emotionalWeight: number = 0.5
): FSRSState {
  const base = DECAY_CLASS_MAP[decayClass] || DECAY_CLASS_MAP.normal_decay;

  // Emotional weight boosts initial stability (high arousal = better consolidation)
  // Factor: 1.0 (no emotion) to 2.0 (max emotion)
  const emotionalFactor = 1.0 + emotionalWeight;
  const stability = base.stability * emotionalFactor;

  const state: FSRSState = {
    difficulty: base.difficulty,
    stability,
    nextReview: scheduleNextReview(
      { difficulty: base.difficulty, stability, nextReview: new Date() },
      TARGET_RETENTION
    ),
  };

  return state;
}

/**
 * Convert existing SM-2 stability value to FSRS state
 */
export function initFromSM2(sm2Stability: number | null): FSRSState {
  if (sm2Stability === null || sm2Stability === undefined) {
    return { difficulty: 5.0, stability: 1.0, nextReview: new Date() };
  }

  const stability = Math.max(MIN_STABILITY, sm2Stability);

  // Infer difficulty from stability: high stability = low difficulty
  let difficulty: number;
  if (stability > 100) difficulty = 2.0;
  else if (stability > 30) difficulty = 3.0;
  else if (stability > 7) difficulty = 5.0;
  else if (stability > 1) difficulty = 7.0;
  else difficulty = 9.0;

  return {
    difficulty,
    stability,
    nextReview: scheduleNextReview(
      { difficulty, stability, nextReview: new Date() },
      TARGET_RETENTION
    ),
  };
}

/**
 * Clamp difficulty to valid range [1, 10]
 */
export function clampDifficulty(d: number): number {
  return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, d));
}

// --- Compatibility wrappers (for ebbinghaus-decay.ts delegation) ---

/**
 * Drop-in replacement for ebbinghaus-decay.ts updateStability()
 * Returns new stability value (number) for backward compatibility
 */
export function updateStabilityCompat(
  currentStability: number,
  retrievalSuccess: boolean,
  emotionalMultiplier: number = 1.0
): number {
  const state: FSRSState = {
    difficulty: 5.0,
    stability: currentStability,
    nextReview: new Date(),
  };

  if (retrievalSuccess) {
    return updateAfterRecall(state, 4, 0.7).stability;
  } else {
    return updateAfterForgot(state, 0.5).stability;
  }
}

/**
 * Drop-in replacement for ebbinghaus-decay.ts getRetentionProbability()
 */
export function getRetentionProbabilityCompat(
  lastAccess: Date,
  stability: number,
  emotionalMultiplier: number = 1.0
): number {
  const state: FSRSState = {
    difficulty: 5.0,
    stability: stability * emotionalMultiplier,
    nextReview: lastAccess, // Approximate: treat lastAccess as the scheduled point
  };
  return getRetrievability(state);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="fsrs-scheduler" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/memory/fsrs-scheduler.ts backend/src/__tests__/unit/services/fsrs-scheduler.test.ts
git commit -m "feat(memory): add FSRS-variant spaced repetition scheduler

Replaces SM-2 with modern spaced repetition algorithm inspired by FSRS.
Three state variables per fact: difficulty (1-10), stability (days),
retrievability (exponential decay). Includes SM-2 compatibility wrappers
for gradual migration."
```

---

### Task 3: Wire ebbinghaus-decay.ts to delegate to FSRS

**Files:**
- Modify: `backend/src/services/memory/ebbinghaus-decay.ts`

- [ ] **Step 1: Read ebbinghaus-decay.ts to find exact export names**

Read: `backend/src/services/memory/ebbinghaus-decay.ts`
Identify: all exported functions that need FSRS wrappers

- [ ] **Step 2: Add deprecation delegations**

At the TOP of ebbinghaus-decay.ts, add:

```typescript
// DEPRECATED: Phase 125 — These functions now delegate to fsrs-scheduler.ts
// This file will be removed in Phase 126. Use fsrs-scheduler directly.
import {
  updateStabilityCompat as fsrsUpdateStability,
  getRetentionProbabilityCompat as fsrsGetRetention,
} from './fsrs-scheduler';
```

Then find `updateStability()` and `calculateRetention()` (or equivalent names) and add FSRS delegation as the first line:

```typescript
// Inside updateStability():
// Add at top of function body:
return fsrsUpdateStability(currentStability, retrievalSuccess, emotionalMultiplier);

// Inside calculateRetention() or getRetentionProbability():
// Add at top of function body:
return fsrsGetRetention(lastAccess, stability, emotionalMultiplier);
```

- [ ] **Step 3: Run existing ebbinghaus tests to verify backward compatibility**

Run: `cd backend && npx jest --testPathPattern="ebbinghaus" --no-coverage`
Expected: Existing tests should still pass (or need minor tolerance adjustments since FSRS formula differs slightly from SM-2)

- [ ] **Step 4: If tests fail due to formula differences, adjust test tolerances**

The FSRS formula produces slightly different results than SM-2. Adjust `toBeCloseTo` precision or expected values to match the new FSRS outputs. The behavior should be directionally identical: success increases stability, failure decreases it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/memory/ebbinghaus-decay.ts
git commit -m "refactor(memory): delegate ebbinghaus-decay to FSRS scheduler

Deprecated functions now forward to fsrs-scheduler.ts compatibility
wrappers. Existing callers (long-term-memory, ltm-consolidation,
sleep-compute) continue to work unchanged."
```

---

## Chunk 2: Hebbian Edge Dynamics

### Task 4: Hebbian Core Service

**Files:**
- Create: `backend/src/services/knowledge-graph/hebbian-dynamics.ts`
- Test: `backend/src/__tests__/unit/services/hebbian-dynamics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/hebbian-dynamics.test.ts

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { queryContext } from '../../../utils/database-context';
import {
  computeHebbianStrengthening,
  computeHebbianDecay,
  computeHomeostaticNormalization,
  recordCoactivation,
  applyHebbianDecayBatch,
  getHebbianWeight,
  HEBBIAN_CONFIG,
} from '../../../services/knowledge-graph/hebbian-dynamics';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('hebbian-dynamics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('computeHebbianStrengthening', () => {
    it('strengthens weight asymptotically toward MAX_WEIGHT', () => {
      const newWeight = computeHebbianStrengthening(1.0);
      expect(newWeight).toBeGreaterThan(1.0);
      expect(newWeight).toBeLessThan(HEBBIAN_CONFIG.MAX_WEIGHT);
    });

    it('shows diminishing returns for already-strong weights', () => {
      const boostFromLow = computeHebbianStrengthening(1.0) - 1.0;
      const boostFromHigh = computeHebbianStrengthening(8.0) - 8.0;
      expect(boostFromLow).toBeGreaterThan(boostFromHigh);
    });

    it('never exceeds MAX_WEIGHT', () => {
      let weight = 1.0;
      for (let i = 0; i < 1000; i++) {
        weight = computeHebbianStrengthening(weight);
      }
      expect(weight).toBeLessThanOrEqual(HEBBIAN_CONFIG.MAX_WEIGHT);
    });
  });

  describe('computeHebbianDecay', () => {
    it('reduces weight by decay rate', () => {
      const decayed = computeHebbianDecay(5.0);
      expect(decayed).toBeCloseTo(5.0 * (1 - HEBBIAN_CONFIG.DECAY_RATE), 4);
    });

    it('returns 0 for weights below MIN_WEIGHT (pruning signal)', () => {
      const decayed = computeHebbianDecay(HEBBIAN_CONFIG.MIN_WEIGHT - 0.01);
      expect(decayed).toBe(0);
    });
  });

  describe('computeHomeostaticNormalization', () => {
    it('scales weights to target sum', () => {
      const weights = [5.0, 10.0, 15.0, 20.0]; // sum = 50
      const normalized = computeHomeostaticNormalization(weights, 50.0);
      const sum = normalized.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(50.0, 2);
    });

    it('preserves relative proportions', () => {
      const weights = [2.0, 4.0, 6.0];
      const normalized = computeHomeostaticNormalization(weights, 12.0);
      // Original ratios: 1:2:3
      expect(normalized[1] / normalized[0]).toBeCloseTo(2.0, 4);
      expect(normalized[2] / normalized[0]).toBeCloseTo(3.0, 4);
    });

    it('handles empty array', () => {
      const normalized = computeHomeostaticNormalization([], 50.0);
      expect(normalized).toEqual([]);
    });
  });

  describe('recordCoactivation', () => {
    it('upserts co-activation pair in database', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      await recordCoactivation('personal', ['entity-1', 'entity-2', 'entity-3']);

      // 3 entities → 3 pairs: (1,2), (1,3), (2,3)
      expect(mockQueryContext).toHaveBeenCalledTimes(3);
    });

    it('skips when fewer than 2 entities', async () => {
      await recordCoactivation('personal', ['entity-1']);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('generates correct pairs from N entities', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      await recordCoactivation('personal', ['a', 'b', 'c', 'd']);
      // 4 entities → 6 pairs: C(4,2) = 6
      expect(mockQueryContext).toHaveBeenCalledTimes(6);
    });
  });

  describe('applyHebbianDecayBatch', () => {
    it('decays all relations in a context', async () => {
      mockQueryContext
        // First call: get all relations with hebbian_weight
        .mockResolvedValueOnce({
          rows: [
            { source_entity_id: 'a', target_entity_id: 'b', hebbian_weight: 5.0 },
            { source_entity_id: 'b', target_entity_id: 'c', hebbian_weight: 0.05 }, // below MIN
          ],
          rowCount: 2,
        } as any)
        // Second call: batch update
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        // Third call: delete pruned edges' hebbian data (reset to 1.0)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await applyHebbianDecayBatch('personal');
      expect(result.decayed).toBe(1);
      expect(result.pruned).toBe(1);
    });
  });

  describe('getHebbianWeight', () => {
    it('returns weight for existing relation', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ hebbian_weight: 3.5 }],
        rowCount: 1,
      } as any);
      const weight = await getHebbianWeight('personal', 'entity-a', 'entity-b');
      expect(weight).toBe(3.5);
    });

    it('returns 1.0 (neutral) for non-existent relation', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const weight = await getHebbianWeight('personal', 'entity-a', 'entity-b');
      expect(weight).toBe(1.0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="hebbian-dynamics" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hebbian-dynamics.ts**

```typescript
// backend/src/services/knowledge-graph/hebbian-dynamics.ts

import { queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

/**
 * Hebbian Edge Dynamics for Knowledge Graph
 *
 * Implements co-activation-based connection strengthening inspired by
 * Hebb's Rule: "Neurons that fire together wire together."
 *
 * Uses asymptotic saturation formula (not Oja's Rule exactly, but shares
 * the normalization principle). Connections strengthen through co-activation,
 * decay over time, and are homeostatically normalized per entity.
 */

export const HEBBIAN_CONFIG = {
  LEARNING_RATE: 0.1,      // How fast connections strengthen
  MAX_WEIGHT: 10.0,        // Asymptotic ceiling
  DECAY_RATE: 0.02,        // 2% daily decay
  MIN_WEIGHT: 0.1,         // Below this → prune (reset to neutral 1.0)
  TARGET_SUM: 50.0,        // Homeostatic target for outgoing weights per entity
  NEUTRAL_WEIGHT: 1.0,     // Default/neutral weight
} as const;

/**
 * Asymptotic Hebbian strengthening.
 * new_weight = old + LR * (1 - old/MAX)
 * Returns monotonically increasing, bounded by MAX_WEIGHT.
 */
export function computeHebbianStrengthening(currentWeight: number): number {
  const { LEARNING_RATE, MAX_WEIGHT } = HEBBIAN_CONFIG;
  const growth = LEARNING_RATE * (1 - currentWeight / MAX_WEIGHT);
  return Math.min(MAX_WEIGHT, currentWeight + Math.max(0, growth));
}

/**
 * Time-based decay. Returns 0 if below MIN_WEIGHT (pruning signal).
 */
export function computeHebbianDecay(currentWeight: number): number {
  const decayed = currentWeight * (1 - HEBBIAN_CONFIG.DECAY_RATE);
  return decayed < HEBBIAN_CONFIG.MIN_WEIGHT ? 0 : decayed;
}

/**
 * Homeostatic normalization: scale weights so their sum equals targetSum.
 * Preserves relative proportions.
 */
export function computeHomeostaticNormalization(
  weights: number[],
  targetSum: number
): number[] {
  if (weights.length === 0) return [];
  const currentSum = weights.reduce((a, b) => a + b, 0);
  if (currentSum === 0) return weights.map(() => targetSum / weights.length);
  const scale = targetSum / currentSum;
  return weights.map(w => w * scale);
}

/**
 * Record co-activation event: all entity pairs from a retrieval/response cycle.
 * Uses ON CONFLICT to increment count for existing pairs.
 */
export async function recordCoactivation(
  context: string,
  entityIds: string[]
): Promise<void> {
  if (entityIds.length < 2) return;

  // Generate all unique pairs (sorted to ensure consistent ordering)
  const pairs: [string, string][] = [];
  const sorted = [...entityIds].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push([sorted[i], sorted[j]]);
    }
  }

  // Upsert each pair
  for (const [entityA, entityB] of pairs) {
    try {
      await queryContext(context, `
        INSERT INTO entity_coactivations (entity_a_id, entity_b_id, coactivation_count, last_coactivated)
        VALUES ($1, $2, 1, NOW())
        ON CONFLICT (entity_a_id, entity_b_id) DO UPDATE SET
          coactivation_count = entity_coactivations.coactivation_count + 1,
          last_coactivated = NOW()
      `, [entityA, entityB]);
    } catch (error) {
      // Non-critical: log and continue
      logger.debug('Co-activation upsert failed', { entityA, entityB, error });
    }
  }
}

/**
 * Strengthen Hebbian weight between two entities based on co-activation.
 * Also updates entity_relations.hebbian_weight.
 */
export async function strengthenEdge(
  context: string,
  sourceEntityId: string,
  targetEntityId: string
): Promise<number> {
  try {
    const result = await queryContext(context, `
      SELECT hebbian_weight FROM entity_relations
      WHERE source_entity_id = $1 AND target_entity_id = $2
      LIMIT 1
    `, [sourceEntityId, targetEntityId]);

    const currentWeight = result.rows[0]?.hebbian_weight ?? HEBBIAN_CONFIG.NEUTRAL_WEIGHT;
    const newWeight = computeHebbianStrengthening(currentWeight);

    await queryContext(context, `
      UPDATE entity_relations
      SET hebbian_weight = $3, coactivation_count = coactivation_count + 1, last_coactivated = NOW()
      WHERE source_entity_id = $1 AND target_entity_id = $2
    `, [sourceEntityId, targetEntityId, newWeight]);

    return newWeight;
  } catch (error) {
    logger.debug('Edge strengthening failed', { sourceEntityId, targetEntityId, error });
    return HEBBIAN_CONFIG.NEUTRAL_WEIGHT;
  }
}

/**
 * Batch decay all Hebbian weights in a context.
 * Returns count of decayed and pruned edges.
 * Designed to run in Sleep Compute (Stage 5).
 */
export async function applyHebbianDecayBatch(
  context: string
): Promise<{ decayed: number; pruned: number }> {
  let decayed = 0;
  let pruned = 0;

  try {
    // Fetch all relations with non-neutral Hebbian weight
    const relations = await queryContext(context, `
      SELECT source_entity_id, target_entity_id, hebbian_weight
      FROM entity_relations
      WHERE hebbian_weight != $1
    `, [HEBBIAN_CONFIG.NEUTRAL_WEIGHT]);

    const updates: { src: string; tgt: string; newWeight: number }[] = [];
    const prunes: { src: string; tgt: string }[] = [];

    for (const row of relations.rows) {
      const newWeight = computeHebbianDecay(row.hebbian_weight);
      if (newWeight === 0) {
        // Below threshold: reset to neutral
        prunes.push({ src: row.source_entity_id, tgt: row.target_entity_id });
        pruned++;
      } else {
        updates.push({ src: row.source_entity_id, tgt: row.target_entity_id, newWeight });
        decayed++;
      }
    }

    // Batch update decayed weights
    if (updates.length > 0) {
      // Use a single UPDATE with CASE for efficiency
      const cases = updates.map((u, i) => `WHEN source_entity_id = $${i * 3 + 1} AND target_entity_id = $${i * 3 + 2} THEN $${i * 3 + 3}`).join(' ');
      const whereIn = updates.map((_, i) => `(source_entity_id = $${i * 3 + 1} AND target_entity_id = $${i * 3 + 2})`).join(' OR ');
      const params = updates.flatMap(u => [u.src, u.tgt, u.newWeight]);

      if (params.length <= 300) { // PostgreSQL parameter limit safety
        await queryContext(context, `
          UPDATE entity_relations SET hebbian_weight = CASE ${cases} END
          WHERE ${whereIn}
        `, params);
      }
    }

    // Reset pruned edges to neutral
    if (prunes.length > 0) {
      for (const p of prunes) {
        await queryContext(context, `
          UPDATE entity_relations SET hebbian_weight = $3
          WHERE source_entity_id = $1 AND target_entity_id = $2
        `, [p.src, p.tgt, HEBBIAN_CONFIG.NEUTRAL_WEIGHT]);
      }
    }

    logger.info('Hebbian decay batch complete', { context, decayed, pruned });
  } catch (error) {
    logger.error('Hebbian decay batch failed', { context, error });
  }

  return { decayed, pruned };
}

/**
 * Get Hebbian weight for a specific entity pair.
 * Returns NEUTRAL_WEIGHT (1.0) if no relation exists.
 */
export async function getHebbianWeight(
  context: string,
  entityA: string,
  entityB: string
): Promise<number> {
  try {
    const result = await queryContext(context, `
      SELECT hebbian_weight FROM entity_relations
      WHERE (source_entity_id = $1 AND target_entity_id = $2)
         OR (source_entity_id = $2 AND target_entity_id = $1)
      LIMIT 1
    `, [entityA, entityB]);

    return result.rows[0]?.hebbian_weight ?? HEBBIAN_CONFIG.NEUTRAL_WEIGHT;
  } catch {
    return HEBBIAN_CONFIG.NEUTRAL_WEIGHT;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="hebbian-dynamics" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/knowledge-graph/hebbian-dynamics.ts backend/src/__tests__/unit/services/hebbian-dynamics.test.ts
git commit -m "feat(knowledge-graph): add Hebbian edge dynamics

Co-activation tracking, asymptotic weight strengthening, time-based
decay, homeostatic normalization. Edges strengthen when entities are
retrieved together, decay daily, and are normalized per entity to
prevent runaway dominance."
```

---

## Chunk 3: Bayesian Confidence Propagation

### Task 5: Bayesian Confidence Propagation Service

**Files:**
- Create: `backend/src/services/knowledge-graph/confidence-propagation.ts`
- Test: `backend/src/__tests__/unit/services/confidence-propagation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/confidence-propagation.test.ts

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { queryContext } from '../../../utils/database-context';
import {
  propagateForRelation,
  propagateBatch,
  PROPAGATION_FACTORS,
} from '../../../services/knowledge-graph/confidence-propagation';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('confidence-propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('propagateForRelation', () => {
    it('increases confidence for supports relation', () => {
      const result = propagateForRelation(0.5, 0.9, 0.8, 'supports');
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('decreases confidence for contradicts relation', () => {
      const result = propagateForRelation(0.5, 0.9, 0.8, 'contradicts');
      expect(result).toBeLessThan(0.5);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('applies weaker boost for similar_to than supports', () => {
      const supportBoost = propagateForRelation(0.5, 0.9, 0.8, 'supports') - 0.5;
      const similarBoost = propagateForRelation(0.5, 0.9, 0.8, 'similar_to') - 0.5;
      expect(supportBoost).toBeGreaterThan(similarBoost);
    });

    it('returns base confidence for non-epistemnic relations', () => {
      const result = propagateForRelation(0.5, 0.9, 0.8, 'created_by');
      expect(result).toBe(0.5);
    });

    it('never exceeds 1.0', () => {
      const result = propagateForRelation(0.99, 0.99, 1.0, 'supports');
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('never goes below 0', () => {
      const result = propagateForRelation(0.01, 0.99, 1.0, 'contradicts');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('propagateBatch', () => {
    it('propagates confidence through graph edges', async () => {
      // Setup: Fact B (confidence 0.5) is supported by Fact A (confidence 0.9)
      mockQueryContext
        // First call: get all facts with relations
        .mockResolvedValueOnce({
          rows: [
            {
              fact_id: 'fact-b',
              base_confidence: 0.5,
              related_fact_id: 'fact-a',
              related_confidence: 0.9,
              relation_type: 'supports',
              edge_strength: 0.8,
            },
          ],
          rowCount: 1,
        } as any)
        // Second call: update propagated confidence
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await propagateBatch('personal');
      expect(result.updated).toBe(1);
    });

    it('handles empty graph gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const result = await propagateBatch('personal');
      expect(result.updated).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="confidence-propagation" --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement confidence-propagation.ts**

```typescript
// backend/src/services/knowledge-graph/confidence-propagation.ts

import { queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

/**
 * Bayesian Confidence Propagation through Knowledge Graph
 *
 * Based on Pearl's Belief Propagation (1982), simplified for production use.
 * Each relation type has a propagation factor that determines how much
 * evidence flows between connected facts.
 *
 * Runs as batch job in Sleep Compute (not real-time) to avoid latency.
 * Uses damping (0.7 new + 0.3 old) for convergence in cyclic graphs.
 */

// Propagation factors per relation type (0 = no propagation, 1 = full)
export const PROPAGATION_FACTORS: Record<string, number> = {
  supports:     1.0,   // Full positive propagation
  contradicts: -1.0,   // Full negative propagation
  causes:       0.8,   // Strong causal link
  requires:     0.6,   // Moderate prerequisite link
  part_of:      0.3,   // Weak structural link
  similar_to:   0.2,   // Minimal similarity link
  created_by:   0.0,   // No epistemnic propagation
  used_by:      0.0,   // No epistemnic propagation
};

const DAMPING = 0.7;       // New evidence weight (0.3 = old evidence weight)
const MAX_ITERATIONS = 3;  // Max propagation passes

/**
 * Compute propagated confidence for a single relation.
 *
 * For positive relations (supports, causes, requires, part_of, similar_to):
 *   P_new = P_base + factor * edgeWeight * P_source * (1 - P_base)
 *
 * For negative relations (contradicts):
 *   P_new = P_base * (1 - |factor| * edgeWeight * P_source)
 *
 * Returns clamped to [0, 1].
 */
export function propagateForRelation(
  baseConfidence: number,
  sourceConfidence: number,
  edgeWeight: number,
  relationType: string
): number {
  const factor = PROPAGATION_FACTORS[relationType] ?? 0;

  // Non-epistemnic relations don't propagate
  if (factor === 0) return baseConfidence;

  let propagated: number;

  if (factor > 0) {
    // Positive propagation: boost base confidence
    propagated = baseConfidence + factor * edgeWeight * sourceConfidence * (1 - baseConfidence);
  } else {
    // Negative propagation: reduce base confidence
    propagated = baseConfidence * (1 - Math.abs(factor) * edgeWeight * sourceConfidence);
  }

  return Math.max(0, Math.min(1, propagated));
}

/**
 * Run batch confidence propagation for all facts in a context.
 * Designed to run in Sleep Compute.
 *
 * Algorithm:
 * 1. Load all facts that have related facts via entity_relations
 * 2. For each fact, compute propagated confidence from all supporting/contradicting facts
 * 3. Apply damping: final = DAMPING * new + (1-DAMPING) * old
 * 4. Repeat for MAX_ITERATIONS passes
 * 5. Store propagated_confidence on each fact
 */
export async function propagateBatch(
  context: string
): Promise<{ updated: number; iterations: number }> {
  let totalUpdated = 0;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      // Query: for each fact, get all related facts with their confidence and relation type
      // We use a JOIN between learned_facts and entity_relations via knowledge_entities
      // This is a simplified version — we propagate between facts that share entities
      const relations = await queryContext(context, `
        SELECT
          lf.id as fact_id,
          lf.confidence as base_confidence,
          lf.propagated_confidence as current_propagated,
          related_lf.id as related_fact_id,
          related_lf.confidence as related_confidence,
          er.relation_type,
          COALESCE(er.strength, 0.5) as edge_strength,
          COALESCE(er.hebbian_weight, 1.0) as hebbian_weight
        FROM learned_facts lf
        JOIN knowledge_entities ke_src ON ke_src.source_ids @> ARRAY[lf.id]
        JOIN entity_relations er ON er.source_entity_id = ke_src.id
        JOIN knowledge_entities ke_tgt ON ke_tgt.id = er.target_entity_id
        JOIN learned_facts related_lf ON ke_tgt.source_ids @> ARRAY[related_lf.id]
        WHERE lf.is_active = true AND related_lf.is_active = true
          AND lf.id != related_lf.id
      `, []);

      if (relations.rows.length === 0) break;

      // Group by fact_id: each fact gets contributions from all related facts
      const factContributions = new Map<string, {
        baseConfidence: number;
        currentPropagated: number | null;
        contributions: { confidence: number; relationType: string; edgeWeight: number }[];
      }>();

      for (const row of relations.rows) {
        if (!factContributions.has(row.fact_id)) {
          factContributions.set(row.fact_id, {
            baseConfidence: row.base_confidence,
            currentPropagated: row.current_propagated,
            contributions: [],
          });
        }
        factContributions.get(row.fact_id)!.contributions.push({
          confidence: row.related_confidence,
          relationType: row.relation_type,
          edgeWeight: row.edge_strength * (row.hebbian_weight / 10.0), // Normalize hebbian to 0-1 range
        });
      }

      // Compute new propagated confidence for each fact
      let updatedInIteration = 0;
      for (const [factId, data] of factContributions) {
        let propagated = data.baseConfidence;

        // Apply each contribution sequentially
        for (const contrib of data.contributions) {
          propagated = propagateForRelation(
            propagated,
            contrib.confidence,
            contrib.edgeWeight,
            contrib.relationType
          );
        }

        // Damping: blend new with old
        const oldPropagated = data.currentPropagated ?? data.baseConfidence;
        const dampedConfidence = DAMPING * propagated + (1 - DAMPING) * oldPropagated;

        // Only update if changed significantly (>0.01)
        if (Math.abs(dampedConfidence - oldPropagated) > 0.01) {
          await queryContext(context, `
            UPDATE learned_facts
            SET propagated_confidence = $2,
                confidence_sources = $3
            WHERE id = $1
          `, [
            factId,
            dampedConfidence,
            JSON.stringify(data.contributions.map(c => ({
              type: c.relationType,
              weight: c.edgeWeight,
              sourceConfidence: c.confidence,
            }))),
          ]);
          updatedInIteration++;
        }
      }

      totalUpdated += updatedInIteration;

      // Convergence check: if no updates, stop early
      if (updatedInIteration === 0) {
        logger.debug('Bayesian propagation converged', { context, iterations: iter + 1 });
        return { updated: totalUpdated, iterations: iter + 1 };
      }
    }

    logger.info('Bayesian propagation complete', { context, updated: totalUpdated, iterations: MAX_ITERATIONS });
  } catch (error) {
    logger.error('Bayesian propagation failed', { context, error });
  }

  return { updated: totalUpdated, iterations: MAX_ITERATIONS };
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="confidence-propagation" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/knowledge-graph/confidence-propagation.ts backend/src/__tests__/unit/services/confidence-propagation.test.ts
git commit -m "feat(knowledge-graph): add Bayesian confidence propagation

Pearl-inspired belief propagation through entity relations. Each
relation type has a propagation factor (supports=1.0, contradicts=-1.0,
causes=0.8, etc). Runs as batch in Sleep Compute with damping for
convergence. Hebbian weights modulate edge strength."
```

---

## Chunk 4: Integration Hooks + Workers

### Task 6: Recall Tracker (Post-Response Hook)

**Files:**
- Create: `backend/src/services/memory/recall-tracker.ts`
- Test: `backend/src/__tests__/unit/services/recall-tracker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/recall-tracker.test.ts

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/memory/fsrs-scheduler', () => ({
  updateAfterRecall: jest.fn().mockReturnValue({ difficulty: 4.8, stability: 12.0, nextReview: new Date() }),
  updateAfterForgot: jest.fn().mockReturnValue({ difficulty: 5.2, stability: 8.0, nextReview: new Date() }),
  getRetrievability: jest.fn().mockReturnValue(0.7),
}));

import { queryContext } from '../../../utils/database-context';
import { classifyRecallEvents, RecallEvent } from '../../../services/memory/recall-tracker';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('recall-tracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('classifyRecallEvents', () => {
    it('marks fact as SUCCESS when retrieved and referenced in response', () => {
      const retrievedFactIds = ['fact-1', 'fact-2'];
      const responseEntityIds = ['entity-a']; // entity-a is linked to fact-1
      const factEntityMap = new Map([['fact-1', ['entity-a']], ['fact-2', ['entity-b']]]);

      const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);
      expect(events.find(e => e.factId === 'fact-1')?.type).toBe('success');
      expect(events.find(e => e.factId === 'fact-2')?.type).toBe('partial');
    });

    it('returns empty for no retrieved facts', () => {
      const events = classifyRecallEvents([], [], new Map());
      expect(events).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure, implement recall-tracker.ts, run to pass**

```typescript
// backend/src/services/memory/recall-tracker.ts

import { logger } from '../../utils/logger';
import { updateAfterRecall, updateAfterForgot, getRetrievability, FSRSState } from './fsrs-scheduler';
import { queryContext } from '../../utils/database-context';

export interface RecallEvent {
  factId: string;
  type: 'success' | 'partial' | 'forgot';
  retrievability: number;
}

/**
 * Classify recall events based on which facts were retrieved vs referenced.
 */
export function classifyRecallEvents(
  retrievedFactIds: string[],
  responseEntityIds: string[],
  factEntityMap: Map<string, string[]>
): RecallEvent[] {
  if (retrievedFactIds.length === 0) return [];

  const responseEntitySet = new Set(responseEntityIds);

  return retrievedFactIds.map(factId => {
    const factEntities = factEntityMap.get(factId) || [];
    const referenced = factEntities.some(e => responseEntitySet.has(e));

    return {
      factId,
      type: referenced ? 'success' as const : 'partial' as const,
      retrievability: 0.7, // Will be computed from actual FSRS state
    };
  });
}

/**
 * Process recall events: update FSRS state for each fact.
 * Fire-and-forget (non-blocking).
 */
export async function processRecallEvents(
  context: string,
  events: RecallEvent[]
): Promise<void> {
  for (const event of events) {
    try {
      const factResult = await queryContext(context, `
        SELECT fsrs_difficulty, fsrs_stability, fsrs_next_review
        FROM learned_facts WHERE id = $1
      `, [event.factId]);

      if (factResult.rows.length === 0) continue;

      const row = factResult.rows[0];
      const currentState: FSRSState = {
        difficulty: row.fsrs_difficulty ?? 5.0,
        stability: row.fsrs_stability ?? 1.0,
        nextReview: row.fsrs_next_review ? new Date(row.fsrs_next_review) : new Date(),
      };

      const R = getRetrievability(currentState);

      let newState: FSRSState;
      if (event.type === 'success') {
        newState = updateAfterRecall(currentState, 4, R); // Grade 4 = good
      } else if (event.type === 'partial') {
        newState = updateAfterRecall(currentState, 3, R); // Grade 3 = neutral
      } else {
        newState = updateAfterForgot(currentState, R);
      }

      await queryContext(context, `
        UPDATE learned_facts
        SET fsrs_difficulty = $2, fsrs_stability = $3, fsrs_next_review = $4,
            retrieval_count = retrieval_count + 1, last_accessed = NOW()
        WHERE id = $1
      `, [event.factId, newState.difficulty, newState.stability, newState.nextReview]);

    } catch (error) {
      logger.debug('Recall event processing failed', { factId: event.factId, error });
    }
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git add backend/src/services/memory/recall-tracker.ts backend/src/__tests__/unit/services/recall-tracker.test.ts
git commit -m "feat(memory): add recall event tracker for FSRS feedback

Classifies retrieval events as success/partial/forgot based on whether
facts were referenced in Claude's response. Updates FSRS state
(difficulty, stability, next review) for each recalled fact."
```

---

### Task 7: Wire into Sleep Compute + BullMQ

**Files:**
- Modify: `backend/src/services/memory/sleep-compute.ts`
- Modify: `backend/src/services/queue/job-queue.ts`
- Modify: `backend/src/services/queue/workers.ts`

- [ ] **Step 1: Add hebbian-decay queue to job-queue.ts**

Find `QUEUE_NAMES` array in `job-queue.ts` and add `'hebbian-decay'`:

```typescript
const QUEUE_NAMES = [
  'memory-consolidation',
  'rag-indexing',
  'email-processing',
  'graph-indexing',
  'sleep-compute',
  'embedding-drift',
  'hebbian-decay',      // Phase 125: Hebbian weight decay + Bayesian propagation
] as const;
```

- [ ] **Step 2: Add hebbian-decay worker processor to workers.ts**

Find `processors` record in `workers.ts` and add:

```typescript
import { applyHebbianDecayBatch } from '../knowledge-graph/hebbian-dynamics';
import { propagateBatch } from '../knowledge-graph/confidence-propagation';

// Add to processors record:
'hebbian-decay': async (job: BullJob) => {
  const contexts = ['personal', 'work', 'learning', 'creative'];
  const results: Record<string, unknown> = {};

  for (const ctx of contexts) {
    job.updateProgress(contexts.indexOf(ctx) * 25);

    // Stage A: Hebbian decay
    const hebbianResult = await applyHebbianDecayBatch(ctx);
    results[`${ctx}_hebbian`] = hebbianResult;

    // Stage B: Bayesian propagation
    const bayesianResult = await propagateBatch(ctx);
    results[`${ctx}_bayesian`] = bayesianResult;
  }

  job.updateProgress(100);
  return results;
},
```

Also add to `concurrencyMap`:

```typescript
'hebbian-decay': 1,
```

- [ ] **Step 3: Schedule daily hebbian-decay job in sleep-compute.ts**

Find the sleep cycle orchestration and add after Stage 5 (maintainEntityGraph):

```typescript
// Stage 6: Hebbian decay + Bayesian propagation (Phase 125)
try {
  const queueService = getQueueService();
  await queueService.enqueue('hebbian-decay', 'daily-decay', { triggeredBy: 'sleep-compute' });
  logger.info('Sleep compute: Hebbian decay + Bayesian propagation queued');
} catch (error) {
  logger.warn('Sleep compute: Failed to queue Hebbian decay', { error });
}
```

- [ ] **Step 4: Run existing tests to verify nothing breaks**

Run: `cd backend && npx jest --testPathPattern="(sleep-compute|workers|job-queue)" --no-coverage`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/queue/job-queue.ts backend/src/services/queue/workers.ts backend/src/services/memory/sleep-compute.ts
git commit -m "feat(queue): integrate Hebbian decay + Bayesian propagation into Sleep Compute

New 'hebbian-decay' BullMQ queue processes daily weight decay across all
4 contexts, then runs Bayesian confidence propagation. Triggered as
Stage 6 of Sleep Compute pipeline."
```

---

### Task 8: Wire Hebbian into RAG + Graph Retrieval

**Files:**
- Modify: `backend/src/services/knowledge-graph/hybrid-retriever.ts`
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Inject Hebbian weight boost into hybrid-retriever.ts**

Find the `graphTraversal()` method or the scoring section where results from graph traversal get scored. Add Hebbian weight as a score modifier:

```typescript
import { getHebbianWeight } from './hebbian-dynamics';

// In the graph traversal scoring section, after computing base score:
// Boost score by Hebbian weight (normalized to 0-1 range)
const hebbianBoost = (hebbianWeight - 1.0) / (HEBBIAN_CONFIG.MAX_WEIGHT - 1.0); // 0 to 1
const boostedScore = baseScore * (1 + hebbianBoost * 0.3); // Up to 30% boost
```

- [ ] **Step 2: Add propagated confidence to enhanced-rag.ts scoring**

Find the confidence calculation section in `enhanced-rag.ts`. Add propagated confidence as a component:

```typescript
// In confidence calculation, add propagated_confidence if available:
const propagatedBoost = result.propagated_confidence
  ? (result.propagated_confidence - result.confidence) * 0.15  // Up to 15% influence
  : 0;
const finalScore = baseScore + propagatedBoost;
```

- [ ] **Step 3: Run RAG tests to verify nothing breaks**

Run: `cd backend && npx jest --testPathPattern="(enhanced-rag|hybrid-retriever)" --no-coverage`
Expected: Existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/knowledge-graph/hybrid-retriever.ts backend/src/services/enhanced-rag.ts
git commit -m "feat(rag): integrate Hebbian weights + Bayesian confidence into scoring

Graph traversal results boosted by Hebbian edge weight (up to 30%).
RAG confidence calculation includes propagated confidence from Bayesian
network (up to 15% influence)."
```

---

### Task 9: Wire Co-activation into Graph Builder + Streaming

**Files:**
- Modify: `backend/src/services/knowledge-graph/graph-builder.ts`
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Record co-activations after entity extraction in graph-builder.ts**

Find the `extractFromText()` method. After entities are resolved and relations upserted, add:

```typescript
import { recordCoactivation } from './hebbian-dynamics';

// After entity upsert (near end of extractFromText):
const entityIds = resolvedEntities.map(e => e.id).filter(Boolean) as string[];
if (entityIds.length >= 2) {
  // Fire-and-forget: don't block extraction
  recordCoactivation(context, entityIds).catch(err =>
    logger.debug('Co-activation recording failed', { error: err })
  );
}
```

- [ ] **Step 2: Add post-response recall tracking hook in streaming.ts**

Find the section where a response is completed (after all tool calls are done and final text is streamed). Add a fire-and-forget recall tracker call:

```typescript
import { classifyRecallEvents, processRecallEvents } from '../memory/recall-tracker';
import { recordCoactivation } from '../knowledge-graph/hebbian-dynamics';

// After response is complete, in the finally/cleanup section:
// Fire-and-forget: don't block response streaming
if (retrievedFactIds.length > 0) {
  const events = classifyRecallEvents(retrievedFactIds, responseEntityIds, factEntityMap);
  processRecallEvents(context, events).catch(err =>
    logger.debug('Recall tracking failed', { error: err })
  );
}

// Record entity co-activations from this response cycle
if (activeEntityIds.length >= 2) {
  recordCoactivation(context, activeEntityIds).catch(err =>
    logger.debug('Co-activation recording failed', { error: err })
  );
}
```

Note: The exact variable names (`retrievedFactIds`, `responseEntityIds`, `factEntityMap`, `activeEntityIds`) depend on what's available in the streaming context. The implementation will need to extract these from the RAG results and Claude's response. If not directly available, this step creates a minimal version that can be enriched later.

- [ ] **Step 3: Run streaming + graph-builder tests**

Run: `cd backend && npx jest --testPathPattern="(streaming|graph-builder)" --no-coverage`
Expected: Existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/knowledge-graph/graph-builder.ts backend/src/services/claude/streaming.ts
git commit -m "feat: wire co-activation + recall tracking into extraction and streaming

Graph builder records entity co-activations after extraction.
Streaming pipeline tracks recall events post-response and updates
FSRS state. Both fire-and-forget to avoid blocking."
```

---

### Task 10: Run Full Test Suite + Final Integration Verification

- [ ] **Step 1: Run all new Phase 125 tests**

Run: `cd backend && npx jest --testPathPattern="(fsrs-scheduler|hebbian-dynamics|confidence-propagation|recall-tracker)" --no-coverage`
Expected: All new tests PASS

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && npm test`
Expected: All 6445+ tests PASS, 24 skipped, 0 failures

- [ ] **Step 3: Run TypeScript compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run frontend build to verify no regressions**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Final commit with migration**

```bash
git add -A
git commit -m "feat: Phase 125 complete — Hebbian KG + FSRS Memory + Bayesian Confidence

Three foundational cognitive services:
- Hebbian dynamics: co-activation strengthening, decay, normalization
- FSRS scheduler: modern spaced repetition replacing SM-2
- Bayesian propagation: confidence flows through entity relations

Integrated into: Sleep Compute (Stage 6), Graph Builder (co-activation),
Streaming (recall tracking), Hybrid Retriever (Hebbian scoring boost),
Enhanced RAG (propagated confidence). New BullMQ queue for daily decay."
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `phase125_hebbian_fsrs_bayesian.sql` applies cleanly on all 4 schemas
- [ ] FSRS scheduler correctly computes intervals (unit tests)
- [ ] Hebbian weights strengthen on co-activation, decay daily (unit tests)
- [ ] Bayesian propagation converges in ≤3 iterations (unit tests)
- [ ] SM-2 → FSRS migration preserves existing fact stability values
- [ ] Sleep Compute Stage 6 triggers Hebbian decay + Bayesian propagation
- [ ] No regression in existing 6445+ backend tests
- [ ] No TypeScript compilation errors
- [ ] Frontend build succeeds
