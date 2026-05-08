/**
 * Hindsight Network 2 — Agent Experiences (Phase H4.2) tests.
 *
 * Covers:
 *   - extractEntitiesFromSummary: capitalised non-stop tokens, dedup,
 *     sort, sentence-initial caps, defensive empty inputs
 *   - addExperience: temporal normalisation via H1.1, entity extraction
 *     fallback, anchor support, metadata pass-through, defensive errors
 *   - recallExperiences: sort by eventTime DESC, ingestTime tiebreak,
 *     time-range filter, entity filter, limit
 *   - In-memory store contract
 */

import {
  addExperience,
  recallExperiences,
  extractEntitiesFromSummary,
  createInMemoryAgentExperienceStore,
  AGENT_EXPERIENCE_NETWORK,
} from '../../../../services/memory/hindsight-networks/agent-experiences';

describe('extractEntitiesFromSummary', () => {
  it('captures capitalised non-stop tokens', () => {
    const out = extractEntitiesFromSummary('Caroline mentioned Stanford and Bob');
    expect(out).toContain('caroline');
    expect(out).toContain('stanford');
    expect(out).toContain('bob');
  });

  it('lowercases output', () => {
    const out = extractEntitiesFromSummary('Alice met Bob');
    expect(out).toEqual(['alice', 'bob']);
  });

  it('skips sentence-initial common stop-words', () => {
    const out = extractEntitiesFromSummary('The Caroline mentioned Bob');
    expect(out).not.toContain('the');
    expect(out).toContain('caroline');
  });

  it('dedupes', () => {
    const out = extractEntitiesFromSummary('Alice met Alice and Alice met Bob');
    expect(out.filter((e) => e === 'alice').length).toBe(1);
    expect(out).toContain('bob');
  });

  it('sorts alphabetically', () => {
    const out = extractEntitiesFromSummary('Caroline met Bob and Alice');
    expect(out).toEqual(['alice', 'bob', 'caroline']);
  });

  it('skips ALL-CAPS tokens (treated as acronyms, not entities)', () => {
    const out = extractEntitiesFromSummary('Caroline used GPS to find Bob');
    expect(out).not.toContain('gps');
    expect(out).toContain('caroline');
    expect(out).toContain('bob');
  });

  it('skips short tokens (< 2 chars)', () => {
    const out = extractEntitiesFromSummary('A B C Caroline');
    expect(out).toEqual(['caroline']);
  });

  it('empty / whitespace input → empty array', () => {
    expect(extractEntitiesFromSummary('')).toEqual([]);
    expect(extractEntitiesFromSummary('   ')).toEqual([]);
    expect(extractEntitiesFromSummary(null as unknown as string)).toEqual([]);
  });

  it('strips non-letter chars but preserves the rest of the token', () => {
    // "Caroline's" → strips ' but s remains → 'carolines'.
    // Documenting the contract: the regex is per-character, not
    // word-segmenting. Callers that want lemmatised entity names
    // should pre-process before passing summary in.
    const out = extractEntitiesFromSummary("Caroline's birthday is in May");
    expect(out).toContain('carolines');
    expect(out).toContain('may');
  });
});

describe('AGENT_EXPERIENCE_NETWORK constant', () => {
  it('is the expected network identifier', () => {
    expect(AGENT_EXPERIENCE_NETWORK).toBe('agent_experiences');
  });
});

describe('addExperience — ingest contract', () => {
  it('inserts with normalised event_time', async () => {
    const store = createInMemoryAgentExperienceStore();
    const r = await addExperience(
      {
        summary: 'Caroline mentioned her birthday',
        actor: 'Caroline',
        // Use an ISO format the H1.1 parser actually accepts —
        // YYYY-MM-DDTHH:MM (no trailing Z; the parser's pattern does
        // not include timezone suffix).
        rawTimestamp: '2024-05-08T14:00',
      },
      store,
    );
    expect(r.id).toBeTruthy();
    expect(r.eventTime.iso.startsWith('2024-05-08')).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('extracts entities from summary when not supplied', async () => {
    const store = createInMemoryAgentExperienceStore();
    await addExperience(
      {
        summary: 'Caroline met Bob at Stanford',
        actor: 'Caroline',
        rawTimestamp: '2024-05-08',
      },
      store,
    );
    const snap = store.snapshot();
    expect(snap[0].entities).toEqual(expect.arrayContaining(['caroline', 'bob', 'stanford']));
  });

  it('uses caller-supplied entities when provided', async () => {
    const store = createInMemoryAgentExperienceStore();
    await addExperience(
      {
        summary: 'arbitrary text',
        actor: 'X',
        rawTimestamp: '2024-05-08',
        entities: ['CustomEntity'],
      },
      store,
    );
    const snap = store.snapshot();
    expect(snap[0].entities).toEqual(['customentity']);
  });

  it('relative timestamps resolve via anchor', async () => {
    const store = createInMemoryAgentExperienceStore();
    const anchor = new Date('2024-05-08T00:00:00Z');
    const r = await addExperience(
      {
        summary: 'event happened',
        actor: 'X',
        rawTimestamp: 'yesterday',
      },
      store,
      { anchor },
    );
    // "yesterday" relative to 2024-05-08 → 2024-05-07.
    expect(r.eventTime.iso.startsWith('2024-05-07')).toBe(true);
  });

  it('metadata pass-through', async () => {
    const store = createInMemoryAgentExperienceStore();
    await addExperience(
      {
        summary: 'X',
        actor: 'A',
        rawTimestamp: '2024-01-01',
      },
      store,
      { metadata: { sessionId: 'sess-42', conversationId: 'conv-1' } },
    );
    const snap = store.snapshot();
    expect(snap[0].metadata).toEqual({ sessionId: 'sess-42', conversationId: 'conv-1' });
  });

  it('throws on empty summary', async () => {
    const store = createInMemoryAgentExperienceStore();
    await expect(
      addExperience(
        { summary: '', actor: 'A', rawTimestamp: '2024-01-01' },
        store,
      ),
    ).rejects.toThrow(/summary/);
  });

  it('throws on empty actor', async () => {
    const store = createInMemoryAgentExperienceStore();
    await expect(
      addExperience(
        { summary: 'X', actor: '', rawTimestamp: '2024-01-01' },
        store,
      ),
    ).rejects.toThrow(/actor/);
  });

  it('throws on un-parseable timestamp', async () => {
    const store = createInMemoryAgentExperienceStore();
    await expect(
      addExperience(
        { summary: 'X', actor: 'A', rawTimestamp: 'gobbledygook xyz' },
        store,
      ),
    ).rejects.toThrow(/timestamp/);
  });

  it('summary trimmed before persistence', async () => {
    const store = createInMemoryAgentExperienceStore();
    await addExperience(
      { summary: '  X happened  ', actor: 'A', rawTimestamp: '2024-01-01' },
      store,
    );
    expect(store.snapshot()[0].summary).toBe('X happened');
  });
});

describe('recallExperiences — search + sort + filter', () => {
  async function setup(): Promise<ReturnType<typeof createInMemoryAgentExperienceStore>> {
    const store = createInMemoryAgentExperienceStore();
    await addExperience(
      { summary: 'Caroline mentioned birthday', actor: 'Caroline', rawTimestamp: '2024-05-08' },
      store,
    );
    await addExperience(
      { summary: 'Caroline mentioned Stanford', actor: 'Caroline', rawTimestamp: '2024-06-01' },
      store,
    );
    await addExperience(
      { summary: 'Bob asked about Caroline', actor: 'Bob', rawTimestamp: '2024-04-01' },
      store,
    );
    await addExperience(
      { summary: 'Bob mentioned Berlin', actor: 'Bob', rawTimestamp: '2024-07-15' },
      store,
    );
    return store;
  }

  it('sorts by eventTime DESC (most recent first)', async () => {
    const store = await setup();
    const out = await recallExperiences('Caroline', store, { limit: 5 });
    // Caroline matches: 2024-06-01, 2024-05-08, 2024-04-01.
    expect(out.length).toBe(3);
    expect(out[0].eventTime.iso.startsWith('2024-06-01')).toBe(true);
    expect(out[1].eventTime.iso.startsWith('2024-05-08')).toBe(true);
  });

  it('limit applied AFTER sort', async () => {
    const store = await setup();
    const out = await recallExperiences('Caroline', store, { limit: 1 });
    expect(out.length).toBe(1);
    expect(out[0].eventTime.iso.startsWith('2024-06-01')).toBe(true);
  });

  it('eventTimeFrom filter excludes earlier events', async () => {
    const store = await setup();
    const out = await recallExperiences('', store, {
      limit: 10,
      eventTimeFrom: new Date('2024-05-01'),
    });
    expect(out.every((e) => new Date(e.eventTime.iso) >= new Date('2024-05-01'))).toBe(true);
  });

  it('eventTimeTo filter excludes later events', async () => {
    const store = await setup();
    const out = await recallExperiences('', store, {
      limit: 10,
      eventTimeTo: new Date('2024-05-01'),
    });
    expect(out.every((e) => new Date(e.eventTime.iso) <= new Date('2024-05-01'))).toBe(true);
  });

  it('eventTimeFrom + eventTimeTo combined', async () => {
    const store = await setup();
    const out = await recallExperiences('', store, {
      limit: 10,
      eventTimeFrom: new Date('2024-05-01'),
      eventTimeTo: new Date('2024-06-30'),
    });
    expect(out.length).toBe(2);
    expect(out.every((e) => {
      const d = new Date(e.eventTime.iso);
      return d >= new Date('2024-05-01') && d <= new Date('2024-06-30');
    })).toBe(true);
  });

  it('requireEntity filter (case-insensitive)', async () => {
    const store = await setup();
    const out = await recallExperiences('mentioned', store, {
      requireEntity: 'BERLIN',
    });
    expect(out.length).toBe(1);
    expect(out[0].entities).toContain('berlin');
  });

  it('empty query → all experiences (within other filters)', async () => {
    const store = await setup();
    const out = await recallExperiences('', store, { limit: 10 });
    expect(out.length).toBe(4);
  });

  it('non-matching query → empty', async () => {
    const store = await setup();
    const out = await recallExperiences('nonexistent', store);
    expect(out).toEqual([]);
  });

  it('determinism: same input → same output order', async () => {
    const store = await setup();
    const a = await recallExperiences('Caroline', store, { limit: 5 });
    const b = await recallExperiences('Caroline', store, { limit: 5 });
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });
});
