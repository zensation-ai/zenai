/**
 * Hindsight Network 3 — Entity Summaries (Phase H4.3) tests.
 *
 * Covers:
 *   - normaliseEntityId: trim, lowercase, whitespace collapse
 *   - formatContributionLine: confidence clamped + formatted
 *   - applyContribution: append, factCount bump, weighted-mean
 *     confidence aggregation, lastUpdated max, char-cap truncation
 *     (oldest-first eviction + single-line trim fallback), no-mutate
 *     input
 *   - updateEntitySummary: full read-apply-write cycle, defensive
 *     errors, persistence
 *   - searchEntitySummaries: sort by lastUpdated DESC + limit
 */

import {
  normaliseEntityId,
  formatContributionLine,
  applyContribution,
  updateEntitySummary,
  getEntitySummary,
  searchEntitySummaries,
  createInMemoryEntitySummaryStore,
  ENTITY_SUMMARY_CHAR_CAP,
  ENTITY_SUMMARY_NETWORK,
  type EntitySummary,
  type SummaryContribution,
} from '../../../../services/memory/hindsight-networks/entity-summaries';

describe('verbatim constants', () => {
  it('ENTITY_SUMMARY_NETWORK identifier', () => {
    expect(ENTITY_SUMMARY_NETWORK).toBe('entity_summaries');
  });
  it('ENTITY_SUMMARY_CHAR_CAP = 800 (≈200 tokens)', () => {
    expect(ENTITY_SUMMARY_CHAR_CAP).toBe(800);
  });
});

describe('normaliseEntityId', () => {
  it('trims, lowercases, collapses whitespace', () => {
    expect(normaliseEntityId('  Caroline   Smith  ')).toBe('caroline smith');
  });
  it('idempotent', () => {
    const a = normaliseEntityId('  X Y  ');
    expect(normaliseEntityId(a)).toBe(a);
  });
  it('null / undefined → empty string', () => {
    expect(normaliseEntityId(null as unknown as string)).toBe('');
    expect(normaliseEntityId(undefined as unknown as string)).toBe('');
  });
});

describe('formatContributionLine', () => {
  it('formats text + confidence', () => {
    expect(formatContributionLine({ text: 'lives in Madrid', confidence: 0.85 })).toBe(
      'lives in Madrid [conf=0.85]',
    );
  });
  it('clamps confidence to [0, 1]', () => {
    expect(formatContributionLine({ text: 'x', confidence: 1.5 })).toBe('x [conf=1.00]');
    expect(formatContributionLine({ text: 'x', confidence: -0.3 })).toBe('x [conf=0.00]');
    expect(formatContributionLine({ text: 'x', confidence: NaN })).toBe('x [conf=0.00]');
  });
  it('trims text', () => {
    expect(formatContributionLine({ text: '  X  ', confidence: 0.5 })).toBe('X [conf=0.50]');
  });
});

describe('applyContribution — pure rolling-summary builder', () => {
  it('first contribution → fresh summary with factCount=1', () => {
    const s = applyContribution(null, 'caroline', {
      text: 'lives in Madrid',
      confidence: 0.9,
    });
    expect(s.entityId).toBe('caroline');
    expect(s.factCount).toBe(1);
    expect(s.summary).toContain('lives in Madrid');
    expect(s.confidence).toBeCloseTo(0.9, 5);
  });

  it('second contribution → factCount=2, weighted-mean confidence', () => {
    const s1 = applyContribution(null, 'caroline', { text: 'A', confidence: 0.9 });
    const s2 = applyContribution(s1, 'caroline', { text: 'B', confidence: 0.5 });
    expect(s2.factCount).toBe(2);
    expect(s2.confidence).toBeCloseTo(0.7, 5); // (0.9 + 0.5) / 2
    expect(s2.summary).toContain('A');
    expect(s2.summary).toContain('B');
  });

  it('input current is NOT mutated', () => {
    const s1 = applyContribution(null, 'x', { text: 'A', confidence: 1 });
    const s1Copy = { ...s1, summary: s1.summary };
    applyContribution(s1, 'x', { text: 'B', confidence: 0.5 });
    expect(s1.summary).toBe(s1Copy.summary);
    expect(s1.factCount).toBe(s1Copy.factCount);
  });

  it('lastUpdated tracks observedAt max', () => {
    const earlier = '2024-01-01T00:00:00Z';
    const later = '2024-06-01T00:00:00Z';
    const s1 = applyContribution(null, 'x', {
      text: 'A',
      confidence: 1,
      observedAt: later,
    });
    const s2 = applyContribution(s1, 'x', {
      text: 'B',
      confidence: 1,
      observedAt: earlier,
    });
    // The earlier observation does NOT pull lastUpdated backwards.
    expect(s2.lastUpdated.getTime()).toBe(new Date(later).getTime());
  });

  it('char-cap truncation evicts OLDEST line first', () => {
    // Build summary with several short lines then push past the cap.
    const longLine = 'X'.repeat(150);
    const cap = 320;
    let s: EntitySummary | null = null;
    s = applyContribution(s, 'x', { text: 'OLDEST', confidence: 1 }, { charCap: cap });
    s = applyContribution(s, 'x', { text: longLine, confidence: 1 }, { charCap: cap });
    s = applyContribution(s, 'x', { text: longLine, confidence: 1 }, { charCap: cap });
    // After 2nd long line + OLDEST, total > cap → OLDEST is dropped.
    expect(s!.summary).not.toContain('OLDEST');
    expect(s!.summary).toContain('X'.repeat(150));
    expect(s!.summary.length).toBeLessThanOrEqual(cap);
  });

  it('single line longer than cap → trim with ellipsis', () => {
    const huge = 'Y'.repeat(2000);
    const s = applyContribution(null, 'x', { text: huge, confidence: 1 }, { charCap: 100 });
    expect(s.summary.length).toBe(100);
    expect(s.summary.endsWith('…')).toBe(true);
  });

  it('default char cap = ENTITY_SUMMARY_CHAR_CAP (200 tokens ≈ 800 chars)', () => {
    const big = 'Z'.repeat(2000);
    const s = applyContribution(null, 'x', { text: big, confidence: 1 });
    expect(s.summary.length).toBeLessThanOrEqual(ENTITY_SUMMARY_CHAR_CAP);
  });

  it('factCount monotonic across contributions', () => {
    let s: EntitySummary | null = null;
    for (let i = 0; i < 10; i++) {
      s = applyContribution(s, 'x', { text: `fact ${i}`, confidence: 0.5 });
    }
    expect(s!.factCount).toBe(10);
  });

  it('confidence approximates simple mean for equal weights', () => {
    let s: EntitySummary | null = null;
    s = applyContribution(s, 'x', { text: 'A', confidence: 1.0 });
    s = applyContribution(s, 'x', { text: 'B', confidence: 0.0 });
    s = applyContribution(s, 'x', { text: 'C', confidence: 1.0 });
    s = applyContribution(s, 'x', { text: 'D', confidence: 0.0 });
    expect(s!.confidence).toBeCloseTo(0.5, 5);
  });
});

describe('updateEntitySummary — read-apply-write cycle', () => {
  it('creates new summary on first call', async () => {
    const store = createInMemoryEntitySummaryStore();
    const s = await updateEntitySummary(
      'Caroline',
      { text: 'lives in Madrid', confidence: 0.8 },
      store,
    );
    expect(s.entityId).toBe('caroline');
    expect(s.factCount).toBe(1);
    expect(store.size()).toBe(1);
  });

  it('appends on subsequent calls (same entity normalised)', async () => {
    const store = createInMemoryEntitySummaryStore();
    await updateEntitySummary('Caroline', { text: 'A', confidence: 0.9 }, store);
    const s = await updateEntitySummary('  CAROLINE  ', { text: 'B', confidence: 0.5 }, store);
    expect(s.factCount).toBe(2);
    expect(store.size()).toBe(1);
    expect(s.summary).toContain('A');
    expect(s.summary).toContain('B');
  });

  it('throws on empty entityId', async () => {
    const store = createInMemoryEntitySummaryStore();
    await expect(
      updateEntitySummary('', { text: 'X', confidence: 1 }, store),
    ).rejects.toThrow(/entityId/);
  });

  it('throws on empty text', async () => {
    const store = createInMemoryEntitySummaryStore();
    await expect(
      updateEntitySummary('caroline', { text: '   ', confidence: 1 }, store),
    ).rejects.toThrow(/text/);
  });

  it('persists between calls', async () => {
    const store = createInMemoryEntitySummaryStore();
    await updateEntitySummary('caroline', { text: 'A', confidence: 1 }, store);
    const s = await getEntitySummary('Caroline', store); // case-folded read
    expect(s).not.toBeNull();
    expect(s!.summary).toContain('A');
  });

  it('getEntitySummary normalises lookup', async () => {
    const store = createInMemoryEntitySummaryStore();
    await updateEntitySummary('caroline smith', { text: 'X', confidence: 1 }, store);
    const found = await getEntitySummary('  Caroline  Smith  ', store);
    expect(found).not.toBeNull();
  });

  it('returns null for unknown entity', async () => {
    const store = createInMemoryEntitySummaryStore();
    const out = await getEntitySummary('unknown', store);
    expect(out).toBeNull();
  });
});

describe('searchEntitySummaries', () => {
  async function setup() {
    const store = createInMemoryEntitySummaryStore();
    await updateEntitySummary(
      'caroline',
      { text: 'lives in Madrid', confidence: 0.8, observedAt: '2024-01-01T00:00:00Z' },
      store,
    );
    await updateEntitySummary(
      'bob',
      { text: 'works at Stanford', confidence: 0.9, observedAt: '2024-06-01T00:00:00Z' },
      store,
    );
    await updateEntitySummary(
      'caroline',
      { text: 'studies AI', confidence: 0.7, observedAt: '2024-08-01T00:00:00Z' },
      store,
    );
    return store;
  }

  it('sorts by lastUpdated DESC', async () => {
    const store = await setup();
    const out = await searchEntitySummaries('', store, { limit: 5 });
    expect(out[0].entityId).toBe('caroline'); // last update 2024-08
    expect(out[1].entityId).toBe('bob'); // last update 2024-06
  });

  it('limit applied AFTER sort', async () => {
    const store = await setup();
    const out = await searchEntitySummaries('', store, { limit: 1 });
    expect(out.length).toBe(1);
    expect(out[0].entityId).toBe('caroline');
  });

  it('substring search across entity_id + summary', async () => {
    const store = await setup();
    const out = await searchEntitySummaries('Stanford', store, { limit: 5 });
    expect(out.length).toBe(1);
    expect(out[0].entityId).toBe('bob');
  });

  it('determinism: same query → same order', async () => {
    const store = await setup();
    const a = await searchEntitySummaries('', store, { limit: 5 });
    const b = await searchEntitySummaries('', store, { limit: 5 });
    expect(a.map((s) => s.entityId)).toEqual(b.map((s) => s.entityId));
  });
});
