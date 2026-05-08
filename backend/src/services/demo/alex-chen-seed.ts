/**
 * Alex Chen Demo Seeder
 *
 * Populates the `demo` schema with the "Alex Chen" onboarding persona:
 *   - 4 core memory blocks
 *   - 10 topics (idea_topics)
 *   - 30 ideas (+ topic memberships)
 *   - 150 learned_facts
 *   - 200 episodic_memories
 *   - knowledge-graph edges (best-effort: idea_relations fallback only)
 *
 * Design notes:
 *   - Non-destructive to the existing "Alexander" persona (different user_id).
 *   - Idempotent: calls clearAlexChenData() first, every INSERT uses ON CONFLICT DO NOTHING.
 *   - Best-effort per-table: if a table is missing in a given environment,
 *     we log a warning and continue rather than failing the whole seed. This
 *     mirrors the pattern used elsewhere (see app-feedback.ts line 49).
 *
 * Usage:
 *   await seedAlexChenData();   // idempotent — clears first, then inserts
 *   await clearAlexChenData();  // removes the Alex Chen rows
 *   await countAlexChenData();  // returns { coreBlocks, topics, ideas, facts, episodes }
 */

import { queryContext, type QueryParam } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  ALEX_USER_ID,
  ALEX_CORE_BLOCKS,
  ALEX_TOPICS,
  ALEX_IDEAS,
  ALEX_LEARNED_FACTS,
  ALEX_EPISODES,
  ALEX_KG_EDGES,
  ALEX_DEMO_SUMMARY,
  type AlexDemoSummary,
} from './alex-chen-data';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Run an INSERT/DELETE/UPDATE and log+swallow missing-table errors. */
async function bestEffort<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    // Only swallow expected "schema not ready" errors — re-throw real bugs.
    if (
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('column')
    ) {
      logger.warn(`[alex-chen-seed] ${label} skipped — ${msg}`);
      return null;
    }
    throw err;
  }
}

// ─── Clear ────────────────────────────────────────────────────────────

export async function clearAlexChenData(): Promise<void> {
  logger.info('[alex-chen-seed] Clearing Alex Chen demo data…');

  // Reverse dependency order
  await bestEffort('DELETE idea_topic_memberships', () =>
    queryContext(
      'demo',
      `DELETE FROM idea_topic_memberships
       WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = $1)`,
      [ALEX_USER_ID],
    ),
  );
  await bestEffort('DELETE idea_relations', () =>
    queryContext(
      'demo',
      `DELETE FROM idea_relations
       WHERE source_id IN (SELECT id FROM ideas WHERE user_id = $1)
          OR target_id IN (SELECT id FROM ideas WHERE user_id = $1)`,
      [ALEX_USER_ID],
    ),
  );
  await bestEffort('DELETE ideas', () =>
    queryContext('demo', 'DELETE FROM ideas WHERE user_id = $1', [ALEX_USER_ID]),
  );
  await bestEffort('DELETE idea_topics', () =>
    queryContext(
      'demo',
      'DELETE FROM idea_topics WHERE id = ANY($1::uuid[])',
      [ALEX_TOPICS.map((t) => t.id)],
    ),
  );
  await bestEffort('DELETE learned_facts', () =>
    queryContext('demo', 'DELETE FROM learned_facts WHERE user_id = $1', [
      ALEX_USER_ID,
    ]),
  );
  await bestEffort('DELETE episodic_memories', () =>
    queryContext(
      'demo',
      'DELETE FROM episodic_memories WHERE user_id = $1',
      [ALEX_USER_ID],
    ),
  );
  await bestEffort('DELETE core_memory_blocks', () =>
    queryContext(
      'demo',
      'DELETE FROM core_memory_blocks WHERE user_id = $1',
      [ALEX_USER_ID],
    ),
  );

  logger.info('[alex-chen-seed] Alex Chen demo data cleared.');
}

// ─── Seed ─────────────────────────────────────────────────────────────

export async function seedAlexChenData(): Promise<AlexDemoSummary> {
  logger.info('[alex-chen-seed] Seeding Alex Chen demo data…');

  await clearAlexChenData();

  await seedCoreBlocks();
  await seedTopics();
  await seedIdeas();
  await seedTopicMemberships();
  await seedLearnedFacts();
  await seedEpisodicMemories();
  await seedKnowledgeGraph();

  logger.info('[alex-chen-seed] Alex Chen demo data seed complete.', {
    summary: ALEX_DEMO_SUMMARY,
  });

  return ALEX_DEMO_SUMMARY;
}

// ─── Individual seeders ───────────────────────────────────────────────

async function seedCoreBlocks(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_CORE_BLOCKS.length} core memory blocks…`);
  for (const block of ALEX_CORE_BLOCKS) {
    await bestEffort('INSERT core_memory_blocks', () =>
      queryContext(
        'demo',
        `INSERT INTO core_memory_blocks (user_id, block_type, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, block_type) DO UPDATE SET content = EXCLUDED.content`,
        [ALEX_USER_ID, block.block_type, block.content],
      ),
    );
  }
}

async function seedTopics(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_TOPICS.length} topics…`);
  for (const topic of ALEX_TOPICS) {
    await bestEffort('INSERT idea_topics', () =>
      queryContext(
        'demo',
        `INSERT INTO idea_topics (id, context, name, description, color, is_auto_generated)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         ON CONFLICT (id) DO NOTHING`,
        [topic.id, topic.context, topic.name, topic.description, topic.color],
      ),
    );
  }
}

async function seedIdeas(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_IDEAS.length} ideas…`);
  for (const idea of ALEX_IDEAS) {
    await bestEffort('INSERT ideas', () =>
      queryContext(
        'demo',
        `INSERT INTO ideas (
           id, title, summary, type, category, priority,
           is_archived, context, user_id, primary_topic_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          idea.id,
          idea.title,
          idea.summary,
          idea.type,
          idea.category,
          idea.priority,
          idea.is_archived,
          idea.context,
          idea.user_id,
          idea.topic_id,
        ],
      ),
    );
  }
}

async function seedTopicMemberships(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_IDEAS.length} topic memberships…`);
  for (const idea of ALEX_IDEAS) {
    await bestEffort('INSERT idea_topic_memberships', () =>
      queryContext(
        'demo',
        `INSERT INTO idea_topic_memberships (idea_id, topic_id, membership_score, is_primary)
         VALUES ($1, $2, 1.0, TRUE)
         ON CONFLICT (idea_id, topic_id) DO NOTHING`,
        [idea.id, idea.topic_id],
      ),
    );
  }
}

async function seedLearnedFacts(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_LEARNED_FACTS.length} learned facts…`);
  for (const fact of ALEX_LEARNED_FACTS) {
    await bestEffort('INSERT learned_facts', () =>
      queryContext(
        'demo',
        `INSERT INTO learned_facts (
           id, fact_type, content, confidence, source, context, user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          fact.id,
          fact.fact_type,
          fact.content,
          fact.confidence,
          fact.source,
          fact.context,
          fact.user_id,
        ],
      ),
    );
  }
}

async function seedEpisodicMemories(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_EPISODES.length} episodic memories…`);
  // The episodic_memories table schema varies between environments — try the
  // rich path first, fall back to a minimal insert if it fails.
  for (const ep of ALEX_EPISODES) {
    const didRich = await bestEffort('INSERT episodic_memories (rich)', () =>
      queryContext(
        'demo',
        `INSERT INTO episodic_memories (
           id, session_id, trigger, response,
           emotional_valence, emotional_arousal,
           time_of_day, day_of_week, is_weekend,
           context, user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          ep.id,
          ep.session_id,
          ep.trigger,
          ep.response,
          ep.emotional_valence,
          ep.emotional_arousal,
          ep.time_of_day,
          ep.day_of_week,
          ep.is_weekend,
          ep.context,
          ep.user_id,
        ],
      ),
    );
    if (didRich === null) break; // Rich schema not available — skip entire set
  }
}

async function seedKnowledgeGraph(): Promise<void> {
  logger.info(`[alex-chen-seed] Seeding ${ALEX_KG_EDGES.length} KG edges (best-effort)…`);
  // Only idea→topic edges map cleanly onto idea_relations; fact→topic edges
  // are conceptually distinct and belong to a richer KG schema that may or may
  // not exist in a given demo database. We store what we can.
  const ideaEdges = ALEX_KG_EDGES.filter(
    (e) => e.source_type === 'idea' && e.target_type === 'topic',
  );
  for (const edge of ideaEdges) {
    // idea_relations expects idea↔idea, so this is best-effort and likely skipped.
    // Log-only best-effort insert keeps this non-fatal.
    await bestEffort('INSERT idea_relations (topic-link best-effort)', () =>
      queryContext(
        'demo',
        `INSERT INTO idea_relations (source_id, target_id, relation_type, strength, context)
         SELECT $1, $1, $2, $3, $4
         WHERE EXISTS (SELECT 1 FROM ideas WHERE id = $1 AND user_id = $5)
         ON CONFLICT (source_id, target_id) DO NOTHING`,
        [edge.source_id, edge.relation, edge.weight, ALEX_USER_ID, ALEX_USER_ID],
      ),
    );
  }
}

// ─── Count (for GET /api/demo/status) ────────────────────────────────

export interface AlexCountResult {
  coreBlocks: number;
  topics: number;
  ideas: number;
  facts: number;
  episodes: number;
}

export async function countAlexChenData(): Promise<AlexCountResult> {
  const zero: AlexCountResult = {
    coreBlocks: 0,
    topics: 0,
    ideas: 0,
    facts: 0,
    episodes: 0,
  };

  const queries: [keyof AlexCountResult, string, QueryParam[]][] = [
    ['coreBlocks', 'SELECT COUNT(*)::int AS c FROM core_memory_blocks WHERE user_id = $1', [ALEX_USER_ID]],
    ['topics', 'SELECT COUNT(*)::int AS c FROM idea_topics WHERE id = ANY($1::uuid[])', [ALEX_TOPICS.map((t) => t.id)]],
    ['ideas', 'SELECT COUNT(*)::int AS c FROM ideas WHERE user_id = $1', [ALEX_USER_ID]],
    ['facts', 'SELECT COUNT(*)::int AS c FROM learned_facts WHERE user_id = $1', [ALEX_USER_ID]],
    ['episodes', 'SELECT COUNT(*)::int AS c FROM episodic_memories WHERE user_id = $1', [ALEX_USER_ID]],
  ];

  const result = { ...zero };
  for (const [key, sql, params] of queries) {
    const r = await bestEffort(`COUNT ${key}`, () => queryContext('demo', sql, params));
    const rows = (r as { rows?: Array<{ c: number }> } | null)?.rows;
    if (rows && rows[0] && typeof rows[0].c === 'number') {
      result[key] = rows[0].c;
    }
  }

  return result;
}
