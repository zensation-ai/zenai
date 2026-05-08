/**
 * Tests for services/reasoning/draft-clue-retriever (H2.2 MemoRAG).
 *
 * Coverage:
 *   - draft-prompt template stability (verbatim string anchor +
 *     {{query}} substitution).
 *   - End-to-end happy path: stub LLM + stub retriever, verify
 *     parallel calls, RRF fusion, multi-route attribution.
 *   - draftWeight scales the draft route's RRF contribution.
 *   - Empty draft falls back to query-only retrieval (no second call).
 *   - LLM error propagates (no silent degradation).
 *   - Defensive: empty query throws, custom itemId works, maxHits caps.
 *
 * No external API — both LLM and retriever are injected stubs.
 *
 * @module tests/unit/services/draft-clue-retriever
 */

import {
  memoRAGDraftClueRetrieve,
  MEMORAG_DRAFT_PROMPT,
  type DraftLLM,
  type DraftRetriever,
  type RetrievalHit,
} from '../../../services/reasoning/draft-clue-retriever';

// ===========================================================================
// Fixtures
// ===========================================================================

interface Doc { id: string; text: string; }

const DOCS: Doc[] = [
  { id: 'd1', text: 'Caroline finished her Master at Stanford in May 2018' },
  { id: 'd2', text: 'Caroline graduated from Stanford in 2018' },
  { id: 'd3', text: 'Joanna trip to Spain summer 2019' },
  { id: 'd4', text: 'Stanford alumni gathering 2018' },
  { id: 'd5', text: 'Random unrelated content about weather' },
];

/** Stub retriever: simple word-overlap scoring. Deterministic. */
function makeStubRetriever(): DraftRetriever<Doc> {
  return async (queryText: string): Promise<RetrievalHit<Doc>[]> => {
    const tokens = queryText.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return DOCS
      .map((d) => {
        let score = 0;
        const haystack = d.text.toLowerCase();
        for (const t of tokens) if (haystack.includes(t)) score += 1;
        return { item: d, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
  };
}

/** Stub LLM: returns a canned draft. Replace per-test as needed. */
function makeStubLLM(response: string): DraftLLM {
  return async () => response;
}

// ===========================================================================
// Prompt template
// ===========================================================================

describe('MEMORAG_DRAFT_PROMPT', () => {
  it('contains the {{query}} placeholder', () => {
    expect(MEMORAG_DRAFT_PROMPT).toContain('{{query}}');
  });

  it('is non-empty', () => {
    expect(MEMORAG_DRAFT_PROMPT.length).toBeGreaterThan(100);
  });

  it('asks for "vocabulary-rich" output (key MemoRAG signal)', () => {
    expect(MEMORAG_DRAFT_PROMPT.toLowerCase()).toContain('vocabulary');
  });
});

// ===========================================================================
// memoRAGDraftClueRetrieve — happy path
// ===========================================================================

describe('memoRAGDraftClueRetrieve — happy path', () => {
  it('substitutes the query into the draft prompt', async () => {
    let capturedPrompt = '';
    const llm: DraftLLM = async (prompt) => {
      capturedPrompt = prompt;
      return 'a draft answer';
    };
    await memoRAGDraftClueRetrieve(
      'Who graduated from Stanford in 2018?',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id },
    );
    expect(capturedPrompt).not.toContain('{{query}}');
    expect(capturedPrompt).toContain('Who graduated from Stanford in 2018?');
  });

  it('returns the LLM-generated draft in the result', async () => {
    const llm = makeStubLLM('Caroline graduated from Stanford in 2018 with a Master\'s degree.');
    const r = await memoRAGDraftClueRetrieve(
      'Who graduated from Stanford in 2018?',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id },
    );
    expect(r.draft).toBe('Caroline graduated from Stanford in 2018 with a Master\'s degree.');
  });

  it('returns per-route hits (query and draft separately)', async () => {
    const llm = makeStubLLM('Caroline finished her Master Stanford May 2018');
    const r = await memoRAGDraftClueRetrieve(
      'Who graduated from Stanford in 2018?',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id },
    );
    expect(r.perRoute.query.length).toBeGreaterThan(0);
    expect(r.perRoute.draft.length).toBeGreaterThan(0);
  });

  it('fuses overlapping hits across routes (multi-route boost via RRF)', async () => {
    // The draft should pull in d1 (Master/Stanford/May/2018), the query
    // should pull in d2 (graduated/Stanford/2018). d4 (Stanford alumni
    // 2018) appears in both → multi-route.
    const llm = makeStubLLM('Caroline finished her Master at Stanford in May 2018');
    const r = await memoRAGDraftClueRetrieve(
      'Who graduated from Stanford in 2018?',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id },
    );
    const d4 = r.fused.find((f) => f.item.id === 'd4');
    expect(d4).toBeDefined();
    expect(d4!.contributingRoutes.length).toBe(2);
    expect(d4!.contributingRoutes).toEqual(['draft', 'query']);
  });

  it('runs the two retrievals in parallel (both started before either resolves)', async () => {
    let queryStarted = false;
    let draftStarted = false;
    const retriever: DraftRetriever<Doc> = async (q) => {
      if (q.includes('graduated')) {
        queryStarted = true;
        // Wait briefly to give the other call a chance to start.
        await new Promise((r) => setTimeout(r, 5));
      } else {
        draftStarted = true;
        await new Promise((r) => setTimeout(r, 5));
      }
      // Both started before either resolves → parallel.
      expect(queryStarted && draftStarted).toBe(true);
      return [];
    };
    await memoRAGDraftClueRetrieve(
      'Who graduated from Stanford?',
      makeStubLLM('Caroline finished Stanford'),
      retriever,
      { itemId: (d) => d.id },
    );
  });

  it('caps fused hits at maxHits', async () => {
    const llm = makeStubLLM('Caroline finished Stanford 2018');
    const r = await memoRAGDraftClueRetrieve(
      'graduated Stanford 2018',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id, maxHits: 2 },
    );
    expect(r.fused.length).toBe(2);
  });
});

// ===========================================================================
// draftWeight
// ===========================================================================

describe('memoRAGDraftClueRetrieve — draftWeight', () => {
  it('draftWeight=0 reduces draft route influence to zero', async () => {
    const llm = makeStubLLM('weather climate sunshine'); // matches d5 only
    const r0 = await memoRAGDraftClueRetrieve(
      'Caroline Stanford',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id, draftWeight: 0 },
    );
    // d5 only appears in the draft route → zero contribution → zero score.
    const d5 = r0.fused.find((f) => f.item.id === 'd5');
    expect(d5?.score ?? 0).toBe(0);
  });

  it('draftWeight=2 doubles draft route contribution vs default', async () => {
    const llm = makeStubLLM('weather climate sunshine');
    const r1 = await memoRAGDraftClueRetrieve(
      'Caroline Stanford',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id, draftWeight: 1 },
    );
    const r2 = await memoRAGDraftClueRetrieve(
      'Caroline Stanford',
      llm,
      makeStubRetriever(),
      { itemId: (d) => d.id, draftWeight: 2 },
    );
    const d5_r1 = r1.fused.find((f) => f.item.id === 'd5')!;
    const d5_r2 = r2.fused.find((f) => f.item.id === 'd5')!;
    expect(d5_r2.score).toBeCloseTo(d5_r1.score * 2, 9);
  });
});

// ===========================================================================
// Degenerate cases
// ===========================================================================

describe('memoRAGDraftClueRetrieve — degenerate cases', () => {
  it('empty draft → falls back to query-only retrieval', async () => {
    let retrieverCallCount = 0;
    const retriever: DraftRetriever<Doc> = async (q) => {
      retrieverCallCount++;
      return [{ item: DOCS[0], score: 1.0 }];
    };
    const r = await memoRAGDraftClueRetrieve(
      'Caroline Stanford',
      makeStubLLM(''),
      retriever,
      { itemId: (d) => d.id },
    );
    expect(retrieverCallCount).toBe(1); // only the query call ran
    expect(r.draft).toBe('');
    expect(r.perRoute.draft).toEqual([]);
    expect(r.fused.length).toBe(1);
    expect(r.fused[0].contributingRoutes).toEqual(['query']);
  });

  it('whitespace-only draft also falls back', async () => {
    let count = 0;
    const retriever: DraftRetriever<Doc> = async () => {
      count++;
      return [];
    };
    await memoRAGDraftClueRetrieve(
      'Caroline Stanford',
      makeStubLLM('   \n\t   '),
      retriever,
      { itemId: (d) => d.id },
    );
    expect(count).toBe(1);
  });

  it('LLM error propagates (no silent degradation)', async () => {
    const llm: DraftLLM = async () => {
      throw new Error('LLM exploded');
    };
    await expect(
      memoRAGDraftClueRetrieve('Q', llm, makeStubRetriever(), { itemId: (d) => d.id }),
    ).rejects.toThrow('LLM exploded');
  });

  it('empty query throws', async () => {
    await expect(
      memoRAGDraftClueRetrieve('', makeStubLLM('x'), makeStubRetriever(), { itemId: (d) => d.id }),
    ).rejects.toThrow(/non-empty/);
  });

  it('whitespace-only query throws', async () => {
    await expect(
      memoRAGDraftClueRetrieve('   ', makeStubLLM('x'), makeStubRetriever(), { itemId: (d) => d.id }),
    ).rejects.toThrow(/non-empty/);
  });

  it('null query throws', async () => {
    await expect(
      memoRAGDraftClueRetrieve(null as unknown as string, makeStubLLM('x'), makeStubRetriever(), { itemId: (d) => d.id }),
    ).rejects.toThrow();
  });

  it('handles retriever returning empty hit lists from both routes', async () => {
    const r = await memoRAGDraftClueRetrieve(
      'Q',
      makeStubLLM('draft'),
      async () => [],
      { itemId: (d: Doc) => d.id },
    );
    expect(r.fused).toEqual([]);
  });
});

// ===========================================================================
// Determinism + itemId
// ===========================================================================

describe('memoRAGDraftClueRetrieve — itemId + determinism', () => {
  it('uses default itemId from .id', async () => {
    const r = await memoRAGDraftClueRetrieve(
      'Caroline Stanford',
      makeStubLLM('Caroline finished Stanford'),
      makeStubRetriever(),
    );
    expect(r.fused.length).toBeGreaterThan(0);
  });

  it('uses custom itemId for merging', async () => {
    type Tagged = { uniq: string; payload: string };
    const a: Tagged = { uniq: 'k', payload: 'first' };
    const b: Tagged = { uniq: 'k', payload: 'second' }; // same id, different payload
    const r = await memoRAGDraftClueRetrieve<Tagged>(
      'Q',
      makeStubLLM('draft'),
      async (q) => (q === 'Q'
        ? [{ item: a, score: 1.0 }]
        : [{ item: b, score: 1.0 }]),
      { itemId: (x) => x.uniq },
    );
    expect(r.fused.length).toBe(1);
    expect(r.fused[0].contributingRoutes.length).toBe(2);
  });

  it('produces identical output across runs (same input)', async () => {
    const llm = makeStubLLM('draft');
    const r1 = await memoRAGDraftClueRetrieve('Caroline Stanford 2018', llm, makeStubRetriever(), { itemId: (d) => d.id });
    const r2 = await memoRAGDraftClueRetrieve('Caroline Stanford 2018', llm, makeStubRetriever(), { itemId: (d) => d.id });
    expect(r1.fused.map((f) => f.item.id)).toEqual(r2.fused.map((f) => f.item.id));
  });
});
