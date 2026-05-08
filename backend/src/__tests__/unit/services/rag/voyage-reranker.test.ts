/**
 * Tests for services/rag/voyage-reranker (H3.3).
 *
 * Coverage:
 *   - Happy path: stub HTTP returns sorted scores, results sorted desc
 *     with payload propagated.
 *   - Cache: hit short-circuits (no HTTP call), miss populates cache,
 *     mixed cache+API works.
 *   - maxDocs cap: drops excess candidates BEFORE the HTTP call.
 *   - topK cap on output.
 *   - parseVoyageResponse: valid shape, alt key names, malformed inputs.
 *   - Defensive: missing apiKey throws, empty query throws,
 *     empty candidates → [], non-2xx HTTP throws with body excerpt.
 *
 * @module tests/unit/services/rag/voyage-reranker
 */

import {
  voyageRerank,
  parseVoyageResponse,
  createMemoryRerankCache,
  type HttpFetch,
  type HttpFetchResponse,
  type RerankCandidate,
} from '../../../../services/rag/voyage-reranker';

// ===========================================================================
// HTTP stub
// ===========================================================================

function makeOkResponse(items: Array<{ index: number; score: number }>): HttpFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: items.map((x) => ({ index: x.index, relevance_score: x.score })) }),
    text: async () => JSON.stringify({ data: items }),
  };
}

function makeErrorResponse(status: number, body: string): HttpFetchResponse {
  return {
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  };
}

// ===========================================================================
// Fixtures
// ===========================================================================

const CANDS: RerankCandidate<{ tag: string }>[] = [
  { id: 'd1', text: 'Caroline lives in Madrid', payload: { tag: 'a' } },
  { id: 'd2', text: 'Caroline visited Spain in 2019', payload: { tag: 'b' } },
  { id: 'd3', text: 'Joanna paints sunrises', payload: { tag: 'c' } },
  { id: 'd4', text: 'random unrelated text', payload: { tag: 'd' } },
];

// ===========================================================================
// Happy path
// ===========================================================================

describe('voyageRerank — happy path', () => {
  it('returns top-K sorted by score desc', async () => {
    const httpFetch: HttpFetch = async () =>
      makeOkResponse([
        { index: 0, score: 0.95 },
        { index: 1, score: 0.85 },
        { index: 2, score: 0.10 },
        { index: 3, score: 0.05 },
      ]);
    const r = await voyageRerank('Caroline Madrid', CANDS, {
      apiKey: 'test',
      httpFetch,
      topK: 3,
    });
    expect(r.length).toBe(3);
    expect(r[0].id).toBe('d1');
    expect(r[0].score).toBe(0.95);
    expect(r[1].id).toBe('d2');
    expect(r[2].id).toBe('d3');
  });

  it('propagates payload', async () => {
    const httpFetch: HttpFetch = async () =>
      makeOkResponse([{ index: 0, score: 0.9 }]);
    const r = await voyageRerank('Q', [CANDS[0]], { apiKey: 'k', httpFetch });
    expect(r[0].payload).toEqual({ tag: 'a' });
  });

  it('preserves originalIndex', async () => {
    const httpFetch: HttpFetch = async () =>
      makeOkResponse([
        { index: 2, score: 0.95 }, // d3 wins despite being 3rd
        { index: 0, score: 0.85 },
        { index: 1, score: 0.50 },
        { index: 3, score: 0.10 },
      ]);
    const r = await voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch });
    expect(r[0].id).toBe('d3');
    expect(r[0].originalIndex).toBe(2);
  });

  it('builds the correct request body', async () => {
    let captured: unknown;
    const httpFetch: HttpFetch = async (_url, init) => {
      captured = JSON.parse(init.body);
      return makeOkResponse([{ index: 0, score: 0.9 }]);
    };
    await voyageRerank('Caroline Madrid', [CANDS[0]], {
      apiKey: 'sk-secret',
      httpFetch,
      model: 'rerank-2.5-test',
    });
    const body = captured as Record<string, unknown>;
    expect(body.query).toBe('Caroline Madrid');
    expect(body.documents).toEqual(['Caroline lives in Madrid']);
    expect(body.model).toBe('rerank-2.5-test');
  });

  it('sends Bearer auth header', async () => {
    let capturedHeaders: Record<string, string> = {};
    const httpFetch: HttpFetch = async (_url, init) => {
      capturedHeaders = init.headers;
      return makeOkResponse([{ index: 0, score: 0.9 }]);
    };
    await voyageRerank('Q', [CANDS[0]], { apiKey: 'sk-foo', httpFetch });
    expect(capturedHeaders.Authorization).toBe('Bearer sk-foo');
  });
});

// ===========================================================================
// Cap behaviour
// ===========================================================================

describe('voyageRerank — caps', () => {
  it('maxDocs caps the candidates BEFORE the HTTP call', async () => {
    let docCountSent = 0;
    const httpFetch: HttpFetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      docCountSent = (body.documents as unknown[]).length;
      return makeOkResponse(
        (body.documents as string[]).map((_d, i) => ({ index: i, score: 1 - i * 0.1 })),
      );
    };
    await voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch, maxDocs: 2 });
    expect(docCountSent).toBe(2);
  });

  it('topK caps the output', async () => {
    const httpFetch: HttpFetch = async () =>
      makeOkResponse(CANDS.map((_, i) => ({ index: i, score: 1 - i * 0.1 })));
    const r = await voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch, topK: 2 });
    expect(r.length).toBe(2);
  });

  it('topK > N returns N', async () => {
    const httpFetch: HttpFetch = async () =>
      makeOkResponse([{ index: 0, score: 0.9 }]);
    const r = await voyageRerank('Q', [CANDS[0]], { apiKey: 'k', httpFetch, topK: 99 });
    expect(r.length).toBe(1);
  });
});

// ===========================================================================
// Cache
// ===========================================================================

describe('voyageRerank — cache', () => {
  it('all-cache-hit short-circuits without HTTP call', async () => {
    const cache = createMemoryRerankCache();
    let calls = 0;
    const httpFetch: HttpFetch = async () => {
      calls++;
      return makeOkResponse(CANDS.map((_, i) => ({ index: i, score: 1 - i * 0.1 })));
    };

    // First call populates cache.
    await voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch, cache });
    expect(calls).toBe(1);

    // Second identical call should hit cache for ALL candidates → no HTTP call.
    await voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch, cache });
    expect(calls).toBe(1); // still 1
  });

  it('partial cache hit only sends uncached docs', async () => {
    const cache = createMemoryRerankCache();
    let lastSentDocs: string[] = [];
    const httpFetch: HttpFetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      lastSentDocs = body.documents as string[];
      return makeOkResponse(
        lastSentDocs.map((_d, i) => ({ index: i, score: 0.5 })),
      );
    };

    // Pre-populate cache with d1 only.
    await voyageRerank('Q', [CANDS[0]], { apiKey: 'k', httpFetch, cache });
    expect(lastSentDocs.length).toBe(1);

    // Now call with [d1, d2, d3] — d1 should hit cache, only d2 + d3 sent.
    lastSentDocs = [];
    await voyageRerank('Q', [CANDS[0], CANDS[1], CANDS[2]], {
      apiKey: 'k', httpFetch, cache,
    });
    expect(lastSentDocs.length).toBe(2);
    expect(lastSentDocs).toContain('Caroline visited Spain in 2019');
    expect(lastSentDocs).toContain('Joanna paints sunrises');
  });

  it('different query → different cache key, fresh API call', async () => {
    const cache = createMemoryRerankCache();
    let calls = 0;
    const httpFetch: HttpFetch = async () => {
      calls++;
      return makeOkResponse([{ index: 0, score: 0.9 }]);
    };
    await voyageRerank('Q1', [CANDS[0]], { apiKey: 'k', httpFetch, cache });
    await voyageRerank('Q2', [CANDS[0]], { apiKey: 'k', httpFetch, cache });
    expect(calls).toBe(2);
  });
});

// ===========================================================================
// Defensive
// ===========================================================================

describe('voyageRerank — defensive', () => {
  it('throws when apiKey is missing', async () => {
    await expect(
      voyageRerank('Q', CANDS, { apiKey: '', httpFetch: async () => makeOkResponse([]) }),
    ).rejects.toThrow(/apiKey/);
  });

  it('throws when query is empty', async () => {
    await expect(
      voyageRerank('', CANDS, { apiKey: 'k', httpFetch: async () => makeOkResponse([]) }),
    ).rejects.toThrow(/query/);
  });

  it('throws when query is whitespace-only', async () => {
    await expect(
      voyageRerank('   \t  ', CANDS, { apiKey: 'k', httpFetch: async () => makeOkResponse([]) }),
    ).rejects.toThrow(/query/);
  });

  it('returns [] when candidates is empty', async () => {
    const r = await voyageRerank('Q', [], {
      apiKey: 'k', httpFetch: async () => makeOkResponse([]),
    });
    expect(r).toEqual([]);
  });

  it('throws on non-2xx HTTP response with body excerpt', async () => {
    const httpFetch: HttpFetch = async () => makeErrorResponse(429, 'rate limited');
    await expect(
      voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch }),
    ).rejects.toThrow(/429.*rate limited/);
  });

  it('throws on network error from fetch', async () => {
    const httpFetch: HttpFetch = async () => {
      throw new Error('connection refused');
    };
    await expect(
      voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch }),
    ).rejects.toThrow(/connection refused/);
  });

  it('throws on malformed response (no data array)', async () => {
    const httpFetch: HttpFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ wrong: 'shape' }),
      text: async () => '',
    });
    await expect(
      voyageRerank('Q', CANDS, { apiKey: 'k', httpFetch }),
    ).rejects.toThrow(/data is not an array/);
  });
});

// ===========================================================================
// parseVoyageResponse
// ===========================================================================

describe('parseVoyageResponse', () => {
  it('parses canonical shape (relevance_score)', () => {
    const r = parseVoyageResponse(
      { data: [{ index: 0, relevance_score: 0.9 }, { index: 1, relevance_score: 0.5 }] },
      2,
    );
    expect(r).toEqual([{ index: 0, score: 0.9 }, { index: 1, score: 0.5 }]);
  });

  it('parses alt keys (document_index + score)', () => {
    const r = parseVoyageResponse(
      { data: [{ document_index: 0, score: 0.9 }] },
      1,
    );
    expect(r).toEqual([{ index: 0, score: 0.9 }]);
  });

  it('drops malformed rows', () => {
    const r = parseVoyageResponse(
      {
        data: [
          { index: 0, relevance_score: 0.9 },
          { /* missing index */ relevance_score: 0.5 },
          'not-an-object',
          null,
          { index: 1, /* missing score */ },
        ],
      },
      2,
    );
    expect(r).toEqual([{ index: 0, score: 0.9 }]);
  });

  it('drops out-of-range indexes (defends against API drift)', () => {
    const r = parseVoyageResponse(
      { data: [{ index: 99, relevance_score: 0.9 }, { index: -1, relevance_score: 0.5 }] },
      3,
    );
    expect(r).toEqual([]);
  });

  it('throws on non-object input', () => {
    expect(() => parseVoyageResponse('string', 1)).toThrow(/not an object/);
    expect(() => parseVoyageResponse(null, 1)).toThrow(/not an object/);
  });

  it('throws when data is not an array', () => {
    expect(() => parseVoyageResponse({ data: 'string' }, 1)).toThrow(/not an array/);
  });
});

// ===========================================================================
// Memory cache
// ===========================================================================

describe('createMemoryRerankCache', () => {
  it('round-trip get/set', () => {
    const c = createMemoryRerankCache();
    c.set('k', 0.5);
    expect(c.get('k')).toBe(0.5);
  });

  it('miss returns undefined', () => {
    const c = createMemoryRerankCache();
    expect(c.get('missing')).toBeUndefined();
  });
});
