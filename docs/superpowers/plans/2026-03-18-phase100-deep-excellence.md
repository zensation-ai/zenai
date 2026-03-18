# Phase 100 — Deep Excellence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate ZenAI from 5-6.5/10 to 7.5-9/10 across Memory, RAG, Agents, Chat UX, and Design System through 20 targeted deep-quality fixes.

**Architecture:** 4 independent workers operating in parallel. Worker A (AI Core) and B (Agents) modify backend only. Worker C (Chat UX) modifies both frontend and backend. Worker D (Design/Polish) modifies frontend only. No cross-worker file conflicts by design.

**Tech Stack:** Express.js + TypeScript (backend), React + TypeScript + Vite (frontend), PostgreSQL + pgvector (DB), Claude API (AI), Redis (cache), BullMQ (queues), React Query v5 (data layer), Jest (backend tests), Vitest (frontend tests).

**Spec:** `docs/superpowers/specs/2026-03-18-phase100-deep-excellence-design.md`

**Test commands:**
- Backend: `cd backend && npm test`
- Backend single: `cd backend && npm test -- --testPathPattern="test-name"`
- Frontend: `cd frontend && npx vitest run`
- Frontend single: `cd frontend && npx vitest run src/__tests__/test-name`
- Build check: `cd frontend && npx tsc --noEmit && npm run build`

**Important patterns:**
- All DB queries use `queryContext(context, sql, params)` for schema routing — NEVER `pool.query()`
- All routes use `asyncHandler()` wrapper
- Route registration in `backend/src/modules/*/index.ts` — NOT directly in main.ts
- All tool registrations go through `backend/src/services/tool-handlers/index.ts`
- React Query hooks in `frontend/src/hooks/queries/`
- Query keys in `frontend/src/lib/query-keys.ts`
- Design system components use `ds-` CSS class prefix
- Tests use `as const` for literal types and `mockReset()` in `beforeEach`

---

## Chunk 1: Worker A — AI Core (Memory & RAG Revolution)

### Task A1: Self-Editing Memory Tools

**Files:**
- Modify: `backend/src/services/tool-handlers/memory-management.ts` (182 lines)
- Modify: `backend/src/services/tool-handlers/index.ts` (1223 lines)
- Modify: `backend/src/services/memory/long-term-memory.ts` (1532 lines)
- Test: `backend/src/__tests__/unit/services/memory-self-editing.test.ts`

- [ ] **Step 1: Write failing tests for memory_replace**

Create `backend/src/__tests__/unit/services/memory-self-editing.test.ts`:

```typescript
import { handleMemoryReplace, handleMemoryAbstract, handleMemorySearchAndLink } from '../../../services/tool-handlers/memory-management';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));
jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

const mockQueryContext = require('../../../utils/database-context').queryContext;

describe('Self-Editing Memory Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('memory_replace', () => {
    it('should update fact content and record supersede reason', async () => {
      const existingFact = {
        id: 'fact-1',
        content: 'Paris is the capital of Germany',
        fact_type: 'general',
      };
      mockQueryContext
        .mockResolvedValueOnce({ rows: [existingFact] }) // find existing
        .mockResolvedValueOnce({ rows: [{ id: 'fact-1' }] }) // update
        .mockResolvedValueOnce({ rows: [] }); // embedding update

      const result = await handleMemoryReplace({
        context: 'personal' as const,
        key: 'fact-1',
        old_content: 'Paris is the capital of Germany',
        new_content: 'Berlin is the capital of Germany',
        reason: 'Corrected factual error',
      });

      expect(result).toContain('aktualisiert');
      expect(mockQueryContext).toHaveBeenCalledTimes(3);
    });

    it('should reject if fact not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryReplace({
        context: 'personal' as const,
        key: 'nonexistent',
        old_content: 'anything',
        new_content: 'anything else',
        reason: 'test',
      });

      expect(result).toContain('nicht gefunden');
    });
  });

  describe('memory_abstract', () => {
    it('should consolidate multiple facts into one abstracted fact', async () => {
      const facts = [
        { id: 'f1', content: 'Meeting with Team A on Monday' },
        { id: 'f2', content: 'Meeting with Team A on Wednesday' },
        { id: 'f3', content: 'Meeting with Team A on Friday' },
      ];
      mockQueryContext
        .mockResolvedValueOnce({ rows: facts }) // load facts
        .mockResolvedValueOnce({ rows: [{ id: 'new-fact' }] }) // insert abstracted
        .mockResolvedValueOnce({ rows: [] }) // mark f1 superseded
        .mockResolvedValueOnce({ rows: [] }) // mark f2 superseded
        .mockResolvedValueOnce({ rows: [] }); // mark f3 superseded

      const result = await handleMemoryAbstract({
        context: 'personal' as const,
        fact_ids: ['f1', 'f2', 'f3'],
        instruction: 'Combine into a pattern about regular Team A meetings',
      });

      expect(result).toContain('abstrahiert');
    });

    it('should reject if fewer than 2 facts provided', async () => {
      const result = await handleMemoryAbstract({
        context: 'personal' as const,
        fact_ids: ['f1'],
        instruction: 'test',
      });

      expect(result).toContain('mindestens 2');
    });
  });

  describe('memory_search_and_link', () => {
    it('should find related facts and create relations', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [
          { id: 'f1', content: 'React is a UI library', similarity: 0.85 },
          { id: 'f2', content: 'TypeScript adds types to JS', similarity: 0.72 },
        ]}) // semantic search
        .mockResolvedValueOnce({ rows: [{ id: 'rel-1' }] }) // create relation 1
        .mockResolvedValueOnce({ rows: [{ id: 'rel-2' }] }); // create relation 2

      const result = await handleMemorySearchAndLink({
        context: 'personal' as const,
        query: 'frontend development tools',
        link_type: 'related_to',
      });

      expect(result).toContain('verknüpft');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern="memory-self-editing" --verbose`
Expected: FAIL — `handleMemoryReplace`, `handleMemoryAbstract`, `handleMemorySearchAndLink` not exported

- [ ] **Step 3: Implement memory_replace in memory-management.ts**

Add to `backend/src/services/tool-handlers/memory-management.ts`:

```typescript
export async function handleMemoryReplace(params: {
  context: AIContext;
  key: string;
  old_content: string;
  new_content: string;
  reason: string;
}): Promise<string> {
  const { context, key, old_content, new_content, reason } = params;

  // Find the fact
  const findResult = await queryContext(context,
    `SELECT id, content, fact_type FROM learned_facts
     WHERE id = $1 OR content ILIKE $2 LIMIT 1`,
    [key, `%${old_content.substring(0, 50)}%`]
  );

  if (findResult.rows.length === 0) {
    return `Fakt "${key}" nicht gefunden. Verwende memory_search_and_link um verwandte Fakten zu finden.`;
  }

  const fact = findResult.rows[0];

  // Update the fact content
  const embedding = await generateEmbedding(new_content);
  await queryContext(context,
    `UPDATE learned_facts
     SET content = $1, embedding = $2, supersede_reason = $3, updated_at = NOW()
     WHERE id = $4`,
    [new_content, JSON.stringify(embedding), reason, fact.id]
  );

  return `Fakt aktualisiert: "${old_content.substring(0, 50)}..." → "${new_content.substring(0, 50)}..." (Grund: ${reason})`;
}
```

- [ ] **Step 4: Implement memory_abstract**

Add to `backend/src/services/tool-handlers/memory-management.ts`:

```typescript
export async function handleMemoryAbstract(params: {
  context: AIContext;
  fact_ids: string[];
  instruction: string;
}): Promise<string> {
  const { context, fact_ids, instruction } = params;

  if (fact_ids.length < 2) {
    return 'Fehler: mindestens 2 Fakten-IDs benötigt für Abstraktion.';
  }

  // Load all facts
  const placeholders = fact_ids.map((_, i) => `$${i + 1}`).join(',');
  const factsResult = await queryContext(context,
    `SELECT id, content FROM learned_facts WHERE id IN (${placeholders})`,
    fact_ids
  );

  if (factsResult.rows.length < 2) {
    return 'Fehler: Weniger als 2 der angegebenen Fakten gefunden.';
  }

  // Create abstracted content via Claude
  const factContents = factsResult.rows.map((f: any) => `- ${f.content}`).join('\n');
  const abstractedContent = await callClaudeForAbstraction(factContents, instruction);

  // Insert new abstracted fact
  const embedding = await generateEmbedding(abstractedContent);
  const insertResult = await queryContext(context,
    `INSERT INTO learned_facts (content, fact_type, source, confidence, embedding)
     VALUES ($1, 'abstracted', 'memory_abstract', 0.8, $2)
     RETURNING id`,
    [abstractedContent, JSON.stringify(embedding)]
  );

  const newFactId = insertResult.rows[0].id;

  // Mark source facts as superseded
  for (const factId of fact_ids) {
    await queryContext(context,
      `UPDATE learned_facts SET superseded_by = $1, supersede_reason = $2 WHERE id = $3`,
      [newFactId, `Abstrahiert: ${instruction.substring(0, 100)}`, factId]
    );
  }

  return `${factsResult.rows.length} Fakten abstrahiert zu: "${abstractedContent.substring(0, 100)}..."`;
}

async function callClaudeForAbstraction(facts: string, instruction: string): Promise<string> {
  // Uses Haiku for cost efficiency
  const response = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Hier sind mehrere verwandte Fakten:\n${facts}\n\nAnweisung: ${instruction}\n\nErstelle EINEN abstrahierten Fakt der das Wesentliche zusammenfasst. Nur den Fakt ausgeben, keine Erklärung.`
    }]
  });
  return response.content[0].type === 'text' ? response.content[0].text : facts;
}
```

- [ ] **Step 5: Implement memory_search_and_link**

Add to `backend/src/services/tool-handlers/memory-management.ts`:

```typescript
export async function handleMemorySearchAndLink(params: {
  context: AIContext;
  query: string;
  link_type: string;
}): Promise<string> {
  const { context, query, link_type } = params;

  const embedding = await generateEmbedding(query);

  // Semantic search for related facts
  const results = await queryContext(context,
    `SELECT id, content, 1 - (embedding <=> $1::vector) as similarity
     FROM learned_facts
     WHERE embedding IS NOT NULL AND superseded_by IS NULL
     ORDER BY embedding <=> $1::vector
     LIMIT 5`,
    [JSON.stringify(embedding)]
  );

  const relatedFacts = results.rows.filter((r: any) => r.similarity > 0.5);

  if (relatedFacts.length === 0) {
    return `Keine verwandten Fakten zu "${query}" gefunden.`;
  }

  // Create relations between found facts
  let linkedCount = 0;
  for (let i = 0; i < relatedFacts.length - 1; i++) {
    for (let j = i + 1; j < relatedFacts.length; j++) {
      await queryContext(context,
        `INSERT INTO idea_relations (source_id, target_id, relation_type, strength, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [relatedFacts[i].id, relatedFacts[j].id, link_type, relatedFacts[i].similarity]
      );
      linkedCount++;
    }
  }

  const factList = relatedFacts.map((f: any) =>
    `- "${f.content.substring(0, 60)}..." (${(f.similarity * 100).toFixed(0)}%)`
  ).join('\n');

  return `${relatedFacts.length} Fakten gefunden und ${linkedCount}x verknüpft (Typ: ${link_type}):\n${factList}`;
}
```

- [ ] **Step 6: Register new tools in index.ts**

Add to `backend/src/services/tool-handlers/index.ts` in the `registerAllToolHandlers()` function, after existing memory tools:

```typescript
// Self-Editing Memory Tools (Phase 100 - Letta Paradigm)
toolRegistry.register({
  name: 'memory_replace',
  description: 'Korrigiert oder aktualisiert einen bestehenden Fakt im Langzeitgedächtnis. Nutze dies wenn du feststellst dass eine gespeicherte Information falsch oder veraltet ist.',
  category: 'memory',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Fakt-ID oder Suchbegriff für den zu ändernden Fakt' },
      old_content: { type: 'string', description: 'Der bisherige (falsche/veraltete) Inhalt' },
      new_content: { type: 'string', description: 'Der neue (korrekte/aktuelle) Inhalt' },
      reason: { type: 'string', description: 'Grund für die Änderung' },
    },
    required: ['key', 'old_content', 'new_content', 'reason'],
  },
  keywords: ['korrigieren', 'aktualisieren', 'ändern', 'falsch', 'veraltet', 'replace', 'correct', 'update'],
}, async (params, context) => handleMemoryReplace({ ...params, context }));

toolRegistry.register({
  name: 'memory_abstract',
  description: 'Fasst mehrere verwandte Fakten zu einem höherwertigen, abstrahierten Fakt zusammen. Die Quellfakten werden als "abgelöst" markiert.',
  category: 'memory',
  parameters: {
    type: 'object',
    properties: {
      fact_ids: { type: 'array', items: { type: 'string' }, description: 'IDs der zu abstrahierenden Fakten (mind. 2)' },
      instruction: { type: 'string', description: 'Anweisung wie die Fakten zusammengefasst werden sollen' },
    },
    required: ['fact_ids', 'instruction'],
  },
  keywords: ['zusammenfassen', 'abstrahieren', 'konsolidieren', 'vereinen', 'abstract', 'consolidate'],
}, async (params, context) => handleMemoryAbstract({ ...params, context }));

toolRegistry.register({
  name: 'memory_search_and_link',
  description: 'Sucht nach verwandten Fakten im Gedächtnis und erstellt explizite Verknüpfungen zwischen ihnen.',
  category: 'memory',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Suchbegriff um verwandte Fakten zu finden' },
      link_type: { type: 'string', description: 'Art der Verknüpfung (z.B. related_to, supports, contradicts)' },
    },
    required: ['query', 'link_type'],
  },
  keywords: ['verknüpfen', 'verbinden', 'relation', 'link', 'beziehung'],
}, async (params, context) => handleMemorySearchAndLink({ ...params, context }));
```

- [ ] **Step 7: Add superseded columns to learned_facts**

Create `backend/sql/migrations/phase100_deep_excellence.sql`:

```sql
-- Phase 100: Deep Excellence Migration
-- Apply all ALTER TABLEs to all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- A1: Self-Editing Memory - fact lineage tracking
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS superseded_by UUID', schema_name);
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS supersede_reason TEXT', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_facts_superseded ON %I.learned_facts(superseded_by) WHERE superseded_by IS NOT NULL', schema_name, schema_name);
  END LOOP;
END $$;
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && npm test -- --testPathPattern="memory-self-editing" --verbose`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/tool-handlers/memory-management.ts \
       backend/src/services/tool-handlers/index.ts \
       backend/src/__tests__/unit/services/memory-self-editing.test.ts \
       backend/sql/migrations/phase100_deep_excellence.sql
git commit -m "feat(A1): self-editing memory tools — memory_replace, memory_abstract, memory_search_and_link"
```

---

### Task A2: Real Contextual Retrieval

**Files:**
- Modify: `backend/src/services/contextual-retrieval.ts` (122 lines)
- Modify: `backend/src/services/queue/workers.ts` (533 lines)
- Modify: `backend/src/services/queue/job-queue.ts` (308 lines)
- Test: `backend/src/__tests__/unit/services/contextual-retrieval-llm.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/unit/services/contextual-retrieval-llm.test.ts`:

```typescript
import { generateContextPrefix, backfillTemplateContent } from '../../../services/contextual-retrieval';

jest.mock('../../../services/ai', () => ({
  callClaude: jest.fn(),
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

const mockCallClaude = require('../../../services/ai').callClaude;
const mockQueryContext = require('../../../utils/database-context').queryContext;

describe('Real Contextual Retrieval (LLM-based)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate LLM context prefix instead of template', async () => {
    mockCallClaude.mockResolvedValue({
      content: [{ type: 'text', text: 'This chunk from the Q3 report discusses revenue targets missed due to supply chain delays.' }]
    });

    const result = await generateContextPrefix(
      'Revenue was down 15% compared to Q2',
      'Q3 Financial Report',
      'Full document content about Q3 financials...'
    );

    expect(result).toContain('Q3');
    expect(result).not.toContain("This chunk from '"); // Not template format
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    // Verify Haiku model used for cost
    expect(mockCallClaude).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('haiku') })
    );
  });

  it('should truncate document to 2000 tokens for cost control', async () => {
    mockCallClaude.mockResolvedValue({
      content: [{ type: 'text', text: 'Context sentence.' }]
    });

    const longDoc = 'word '.repeat(5000); // ~5000 words = ~6500 tokens
    await generateContextPrefix('chunk', 'title', longDoc);

    const callArgs = mockCallClaude.mock.calls[0][0];
    const promptContent = callArgs.messages[0].content;
    // Document should be truncated in the prompt
    expect(promptContent.length).toBeLessThan(longDoc.length);
  });

  it('should fall back to template on LLM error', async () => {
    mockCallClaude.mockRejectedValue(new Error('API timeout'));

    const result = await generateContextPrefix(
      'Some chunk content',
      'Document Title',
      'Full document...'
    );

    // Should return template-style fallback, not throw
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  describe('backfillTemplateContent', () => {
    it('should identify template-based content for re-enrichment', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { id: 'c1', enriched_content: "This chunk from 'Doc' discusses topic." },
          { id: 'c2', enriched_content: "This chunk from 'Report' discusses analysis." },
        ]
      });

      const candidates = await backfillTemplateContent('personal' as const, 10);
      expect(candidates.length).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern="contextual-retrieval-llm" --verbose`
Expected: FAIL

- [ ] **Step 3: Rewrite contextual-retrieval.ts with LLM generation**

Replace the `generateContextPrefix` function in `backend/src/services/contextual-retrieval.ts`. Keep the existing exports and interface. Replace the template logic with a Claude Haiku call. Add `backfillTemplateContent` export. Add try/catch with template fallback on LLM error. Truncate document to ~8000 chars (~2000 tokens) before sending to Claude.

Key implementation points:
- Use `claude-haiku-4-5-20251001` model
- Max 100 tokens output
- System prompt: "Generate a 1-2 sentence context explaining WHERE this chunk appears in the document and WHAT it's about. Be specific and concise."
- On error: fall back to existing template format
- `backfillTemplateContent(context, limit)`: queries `learned_facts WHERE enriched_content LIKE 'This chunk from %'`

- [ ] **Step 4: Add backfill worker to queue system**

Add to `backend/src/services/queue/workers.ts` a `contextual-enrichment` processor. Add the queue name to `backend/src/services/queue/job-queue.ts`. The worker picks up jobs containing `{context, factId}`, loads the fact, calls `generateContextPrefix`, and updates `enriched_content` + `enriched_embedding`.

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- --testPathPattern="contextual-retrieval-llm" --verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/contextual-retrieval.ts \
       backend/src/services/queue/workers.ts \
       backend/src/services/queue/job-queue.ts \
       backend/src/__tests__/unit/services/contextual-retrieval-llm.test.ts
git commit -m "feat(A2): real contextual retrieval — LLM-generated context + backfill worker"
```

---

### Task A3: CRAG Quality Gate

**Files:**
- Create: `backend/src/services/rag-quality-gate.ts`
- Modify: `backend/src/services/enhanced-rag.ts` (987 lines)
- Test: `backend/src/__tests__/unit/services/rag-quality-gate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/unit/services/rag-quality-gate.test.ts`:

```typescript
import { evaluateRetrieval, RetrievalVerdict } from '../../../services/rag-quality-gate';

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

describe('CRAG Quality Gate', () => {
  describe('evaluateRetrieval', () => {
    it('should return CONFIDENT for high-quality results', () => {
      const docs = [
        { content: 'Berlin is the capital of Germany', score: 0.92 },
        { content: 'Germany is in Central Europe', score: 0.85 },
        { content: 'The capital has 3.6 million inhabitants', score: 0.80 },
      ];

      const verdict = evaluateRetrieval('What is the capital of Germany?', docs);
      expect(verdict.tier).toBe('CONFIDENT');
      expect(verdict.avgScore).toBeGreaterThan(0.75);
    });

    it('should return AMBIGUOUS for medium-quality results', () => {
      const docs = [
        { content: 'Berlin has many museums', score: 0.65 },
        { content: 'The weather in Berlin is continental', score: 0.55 },
      ];

      const verdict = evaluateRetrieval('What is the capital of Germany?', docs);
      expect(verdict.tier).toBe('AMBIGUOUS');
    });

    it('should return FAILED for low-quality results', () => {
      const docs = [
        { content: 'Cooking recipes for pasta', score: 0.20 },
        { content: 'How to train a dog', score: 0.15 },
      ];

      const verdict = evaluateRetrieval('What is the capital of Germany?', docs);
      expect(verdict.tier).toBe('FAILED');
    });

    it('should return FAILED for empty results', () => {
      const verdict = evaluateRetrieval('What is the capital of Germany?', []);
      expect(verdict.tier).toBe('FAILED');
    });

    it('should include query term coverage in scoring', () => {
      const docs = [
        { content: 'The capital of Germany is Berlin, a vibrant city', score: 0.70 },
      ];

      const verdict = evaluateRetrieval('capital Germany', docs);
      // Term coverage should boost the score
      expect(verdict.termCoverage).toBeGreaterThan(0.5);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern="rag-quality-gate" --verbose`
Expected: FAIL

- [ ] **Step 3: Implement rag-quality-gate.ts**

Create `backend/src/services/rag-quality-gate.ts`:

```typescript
export type RetrievalTier = 'CONFIDENT' | 'AMBIGUOUS' | 'FAILED';

export interface RetrievalVerdict {
  tier: RetrievalTier;
  avgScore: number;
  termCoverage: number;
  documentCount: number;
  recommendation: string;
}

export function evaluateRetrieval(
  query: string,
  documents: Array<{ content: string; score: number }>
): RetrievalVerdict {
  if (documents.length === 0) {
    return {
      tier: 'FAILED',
      avgScore: 0,
      termCoverage: 0,
      documentCount: 0,
      recommendation: 'Keine Dokumente gefunden. Web-Suche oder direkte Antwort empfohlen.',
    };
  }

  // Calculate average score
  const avgScore = documents.reduce((sum, d) => sum + d.score, 0) / documents.length;

  // Calculate query term coverage
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const allContent = documents.map(d => d.content.toLowerCase()).join(' ');
  const coveredTerms = queryTerms.filter(term => allContent.includes(term));
  const termCoverage = queryTerms.length > 0 ? coveredTerms.length / queryTerms.length : 0;

  // Combined score: 70% avg similarity + 30% term coverage
  const combinedScore = avgScore * 0.7 + termCoverage * 0.3;

  let tier: RetrievalTier;
  let recommendation: string;

  if (combinedScore > 0.75) {
    tier = 'CONFIDENT';
    recommendation = 'Dokumente direkt verwenden.';
  } else if (combinedScore > 0.45) {
    tier = 'AMBIGUOUS';
    recommendation = 'Query reformulieren und erneut suchen.';
  } else {
    tier = 'FAILED';
    recommendation = 'Wissensbasis hat keine gute Antwort. Web-Suche oder ehrliche Unsicherheit kommunizieren.';
  }

  return { tier, avgScore, termCoverage, documentCount: documents.length, recommendation };
}
```

- [ ] **Step 4: Integrate CRAG gate into enhanced-rag.ts**

In `backend/src/services/enhanced-rag.ts`, after the retrieval step and before context assembly, add:

```typescript
import { evaluateRetrieval } from './rag-quality-gate';

// After retrieval results are collected:
const verdict = evaluateRetrieval(query, retrievalResults);

if (verdict.tier === 'AMBIGUOUS' && !isReformulation) {
  // Reformulate query once
  const reformulated = await reformulateQuery(query);
  return enhancedRAG(reformulated, context, { ...options, isReformulation: true });
}

if (verdict.tier === 'FAILED') {
  // Return with low confidence, let caller decide (web search or honest uncertainty)
  return { results: [], confidence: 0.1, verdict };
}
```

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- --testPathPattern="rag-quality-gate" --verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/rag-quality-gate.ts \
       backend/src/services/enhanced-rag.ts \
       backend/src/__tests__/unit/services/rag-quality-gate.test.ts
git commit -m "feat(A3): CRAG quality gate — CONFIDENT/AMBIGUOUS/FAILED evaluation before generation"
```

---

### Task A4: LLM-Based Episodic Consolidation

**Files:**
- Modify: `backend/src/services/memory/episodic-memory.ts` (981 lines)
- Modify: `backend/src/services/memory/sleep-compute.ts`
- Test: `backend/src/__tests__/unit/services/llm-consolidation.test.ts`

- [ ] **Step 1: Write failing tests**

Test that consolidation produces LLM-abstracted facts instead of truncated strings. Mock the Claude call. Verify output format is valid JSON with `{content, fact_type, confidence}`.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Replace substring consolidation with LLM call**

In `episodic-memory.ts`, find the consolidation method (around line 546). Replace the `trigger.substring(0,100) + response.substring(0,150)` pattern with a Haiku call that abstracts the episodes into semantic facts. Use the same `callClaudeForAbstraction` pattern from A1. Max 5 groups per cycle, max 200 tokens output per group.

- [ ] **Step 4: Update sleep-compute.ts**

Ensure the episodic consolidation stage in sleep compute calls the new LLM-based method. Add error handling: if LLM call fails, fall back to the old substring method (don't block the entire sleep cycle).

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- --testPathPattern="llm-consolidation" --verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/memory/episodic-memory.ts \
       backend/src/services/memory/sleep-compute.ts \
       backend/src/__tests__/unit/services/llm-consolidation.test.ts
git commit -m "feat(A4): LLM-based episodic consolidation — Claude abstracts episodes to semantic facts"
```

---

### Task A5: Context Window Management with Token Budget

**Files:**
- Create: `backend/src/utils/token-budget.ts`
- Modify: `backend/src/routes/general-chat.ts` (949 lines)
- Test: `backend/src/__tests__/unit/utils/token-budget.test.ts`

- [ ] **Step 1: Write failing tests**

Test `allocateTokenBudget()` with various section sizes. Test that when total exceeds budget, sections are truncated in priority order. Test conversation summarization trigger at 80K tokens.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create token-budget.ts**

```typescript
// backend/src/utils/token-budget.ts

export interface TokenBudget {
  systemPromptBase: number;  // 2000 fixed
  workingMemory: number;     // 2000 fixed
  personalFacts: number;     // 3000 soft
  ragContext: number;         // 8000 soft
  conversationHistory: number; // remainder
}

export function estimateTokens(text: string): number {
  // Simple heuristic: ~4 chars per token for mixed content
  // Language-aware: German averages ~5 chars/token
  const avgCharsPerToken = /[äöüßÄÖÜ]/.test(text) ? 5 : 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // Truncate at sentence boundary
  const maxChars = maxTokens * 4;
  const truncated = text.substring(0, maxChars);
  const lastSentence = truncated.lastIndexOf('. ');
  return lastSentence > maxChars * 0.5
    ? truncated.substring(0, lastSentence + 1)
    : truncated + '...';
}

export function assembleContextWithBudget(sections: {
  systemBase: string;
  workingMemory: string;
  personalFacts: string;
  ragContext: string;
  conversationHistory: Array<{ role: string; content: string }>;
}, totalBudget: number = 100000): {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  summarized: boolean;
} {
  const budget: TokenBudget = {
    systemPromptBase: 2000,
    workingMemory: 2000,
    personalFacts: 3000,
    ragContext: 8000,
    conversationHistory: totalBudget - 15000, // 85K for history
  };

  // Fixed sections (never truncated)
  let systemPrompt = sections.systemBase;

  // Soft-limited sections (truncated if over budget)
  systemPrompt += '\n\n' + truncateToTokenBudget(sections.workingMemory, budget.workingMemory);
  systemPrompt += '\n\n' + truncateToTokenBudget(sections.personalFacts, budget.personalFacts);
  systemPrompt += '\n\n' + truncateToTokenBudget(sections.ragContext, budget.ragContext);

  // Conversation history — summarize if over budget
  let messages = sections.conversationHistory;
  let summarized = false;
  const historyTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  if (historyTokens > budget.conversationHistory) {
    // Keep last 20 messages, summarize the rest
    const keepCount = Math.min(20, messages.length);
    const toSummarize = messages.slice(0, messages.length - keepCount);
    const toKeep = messages.slice(messages.length - keepCount);

    // Create summary placeholder (actual LLM summarization done by caller)
    const summaryText = `[Zusammenfassung von ${toSummarize.length} vorherigen Nachrichten — wird vom System erstellt]`;
    messages = [{ role: 'system' as const, content: summaryText }, ...toKeep];
    summarized = true;
  }

  return { systemPrompt, messages, summarized };
}
```

- [ ] **Step 4: Integrate into general-chat.ts**

In `general-chat.ts`, replace the current system prompt assembly with `assembleContextWithBudget()`. If `summarized` is true, make a Haiku call to summarize the old messages before sending to Claude.

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- --testPathPattern="token-budget" --verbose`
Expected: ALL PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && npm test`
Expected: All existing tests still pass + new tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/token-budget.ts \
       backend/src/routes/general-chat.ts \
       backend/src/__tests__/unit/utils/token-budget.test.ts
git commit -m "feat(A5): context window management — token budget allocation + auto-summarization"
```

---

## Chunk 2: Worker B — Agent System (Parallel & Persistent)

### Task B1: Parallel Agent Execution

**Files:**
- Modify: `backend/src/services/agents/agent-graph.ts` (448 lines)
- Modify: `backend/src/services/agent-orchestrator.ts` (1221 lines)
- Test: `backend/src/__tests__/unit/services/parallel-agents.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/__tests__/unit/services/parallel-agents.test.ts`:

```typescript
import { AgentGraph } from '../../../services/agents/agent-graph';

describe('Parallel Agent Execution', () => {
  it('should execute parallel branches concurrently', async () => {
    const executionOrder: string[] = [];

    const graph = new AgentGraph({
      nodes: [
        {
          id: 'start',
          type: 'parallel',
          config: {
            branches: [
              [{ from: 'start', to: 'researcher1' }],
              [{ from: 'start', to: 'researcher2' }],
            ],
            merge_strategy: 'all',
            timeout_ms: 5000,
          },
        },
        {
          id: 'researcher1',
          type: 'agent',
          config: {
            handler: async (state: any) => {
              executionOrder.push('r1-start');
              await new Promise(r => setTimeout(r, 100));
              executionOrder.push('r1-end');
              return { ...state, r1: 'done' };
            },
          },
        },
        {
          id: 'researcher2',
          type: 'agent',
          config: {
            handler: async (state: any) => {
              executionOrder.push('r2-start');
              await new Promise(r => setTimeout(r, 100));
              executionOrder.push('r2-end');
              return { ...state, r2: 'done' };
            },
          },
        },
        {
          id: 'writer',
          type: 'agent',
          config: {
            handler: async (state: any) => ({ ...state, written: true }),
          },
        },
      ],
      edges: [
        { from: 'start', to: 'writer' }, // after parallel completes
      ],
      entryNode: 'start',
    });

    const result = await graph.execute({ task: 'test' });

    // Both researchers should have started before either finished
    expect(executionOrder[0]).toBe('r1-start');
    expect(executionOrder[1]).toBe('r2-start');
    expect(result.state.r1).toBe('done');
    expect(result.state.r2).toBe('done');
    expect(result.state.written).toBe(true);
  });

  it('should respect timeout on parallel branches', async () => {
    const graph = new AgentGraph({
      nodes: [{
        id: 'start',
        type: 'parallel',
        config: {
          branches: [
            [{ from: 'start', to: 'slow' }],
            [{ from: 'start', to: 'fast' }],
          ],
          merge_strategy: 'all',
          timeout_ms: 200,
        },
      },
      {
        id: 'slow',
        type: 'agent',
        config: { handler: async () => { await new Promise(r => setTimeout(r, 5000)); return {}; } },
      },
      {
        id: 'fast',
        type: 'agent',
        config: { handler: async (s: any) => ({ ...s, fast: 'done' }) },
      }],
      edges: [],
      entryNode: 'start',
    });

    const result = await graph.execute({});
    expect(result.state.fast).toBe('done');
    // Slow branch should have timed out
  });

  it('should use first-wins merge strategy', async () => {
    const graph = new AgentGraph({
      nodes: [{
        id: 'start',
        type: 'parallel',
        config: {
          branches: [
            [{ from: 'start', to: 'slow' }],
            [{ from: 'start', to: 'fast' }],
          ],
          merge_strategy: 'first',
          timeout_ms: 5000,
        },
      },
      {
        id: 'slow',
        type: 'agent',
        config: { handler: async (s: any) => { await new Promise(r => setTimeout(r, 500)); return { ...s, winner: 'slow' }; } },
      },
      {
        id: 'fast',
        type: 'agent',
        config: { handler: async (s: any) => ({ ...s, winner: 'fast' }) },
      }],
      edges: [],
      entryNode: 'start',
    });

    const result = await graph.execute({});
    expect(result.state.winner).toBe('fast');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- --testPathPattern="parallel-agents" --verbose`
Expected: FAIL

- [ ] **Step 3: Add parallel node type to agent-graph.ts**

In `backend/src/services/agents/agent-graph.ts`, extend `WorkflowNodeType` to include `'parallel'`. Add the parallel execution case in the main execution loop using `Promise.allSettled()`. Each branch gets a cloned state. Implement merge strategies: `'all'` (collect all results), `'first'` (Promise.race), `'majority'` (not needed for MVP — log warning and use 'all'). Add timeout via `Promise.race` with a timer.

- [ ] **Step 4: Add parallel strategies to orchestrator**

In `backend/src/services/agent-orchestrator.ts`, add 3 new strategies:
- `parallel_research`: 2x Researcher parallel → Writer → Reviewer
- `parallel_code_review`: Coder + Researcher parallel → Reviewer
- `full_parallel`: Researcher + Coder parallel → Writer → Reviewer

Each builds a workflow graph with a parallel start node.

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- --testPathPattern="parallel-agents" --verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agents/agent-graph.ts \
       backend/src/services/agent-orchestrator.ts \
       backend/src/__tests__/unit/services/parallel-agents.test.ts
git commit -m "feat(B1): parallel agent execution — fan-out/fan-in with merge strategies"
```

---

### Task B2: Persistent Shared Memory

**Files:**
- Modify: `backend/src/services/memory/shared-memory.ts` (396 lines)
- Modify: `backend/sql/migrations/phase100_deep_excellence.sql`
- Test: `backend/src/__tests__/unit/services/persistent-shared-memory.test.ts`

- [ ] **Step 1: Write failing tests**

Test 3-layer write (in-memory + Redis + DB). Test restore from DB on cold start. Test DB precedence over Redis. Test that writes to DB are fire-and-forget (don't slow down the write path).

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Add DB table to migration**

Append to `backend/sql/migrations/phase100_deep_excellence.sql`:

```sql
-- B2: Persistent Shared Memory
CREATE TABLE IF NOT EXISTS agent_shared_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  agent_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(execution_id, key)
);
CREATE INDEX IF NOT EXISTS idx_shared_memory_exec ON agent_shared_memory(execution_id);
```

- [ ] **Step 4: Add DB layer to shared-memory.ts**

Extend the existing `SharedMemory` class:
- Add `writeToDB(executionId, key, value, agentRole)` — fire-and-forget `queryContext` INSERT
- Add `restoreFromDB(executionId)` — loads all entries, populates in-memory + Redis
- Modify `initialize()`: try DB restore first; if no DB data, fall back to existing Redis restore
- Modify `write()`: after in-memory + Redis writes, also `writeToDB()` (no await)

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- --testPathPattern="persistent-shared-memory" --verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/memory/shared-memory.ts \
       backend/sql/migrations/phase100_deep_excellence.sql \
       backend/src/__tests__/unit/services/persistent-shared-memory.test.ts
git commit -m "feat(B2): persistent shared memory — 3-layer write with DB persistence"
```

---

### Task B3: Dynamic Team Composition

**Files:**
- Modify: `backend/src/services/agent-orchestrator.ts`
- Modify: `backend/src/services/agents/base-agent.ts` (330 lines)
- Test: `backend/src/__tests__/unit/services/dynamic-teams.test.ts`

- [ ] **Step 1: Write failing tests**

Test that when a DB identity exists for a role, the agent uses the persona prompt. Test fallback to hardcoded factory when no DB identity. Test `buildPersonaPrompt()` output format.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Add identity-aware agent creation**

In `agent-orchestrator.ts`, add `createAgentWithIdentity(role, taskContext)` that:
1. Calls `agentIdentityService.findByRole(role)`
2. If found: builds persona prompt from identity and passes to BaseAgent constructor
3. If not found: falls back to existing `createResearcher()` etc.

In `base-agent.ts`, accept optional `personaPrompt` in constructor that gets prepended to the system prompt.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agent-orchestrator.ts \
       backend/src/services/agents/base-agent.ts \
       backend/src/__tests__/unit/services/dynamic-teams.test.ts
git commit -m "feat(B3): dynamic team composition — DB identity personas with hardcoded fallback"
```

---

### Task B4: Semantic Tool Search

**Files:**
- Modify: `backend/src/services/tool-handlers/tool-search.ts` (230 lines)
- Test: `backend/src/__tests__/unit/services/semantic-tool-search.test.ts`

- [ ] **Step 1: Write failing tests**

Test that "schreibe einen Brief" finds `draft_email`. Test that "berechne Fibonacci" finds `execute_code`. Test fallback to keyword search when embedding service unavailable.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Add embedding-based search path**

In `tool-search.ts`:
- On `initToolRegistry()`: generate embeddings for all tool descriptions, store in `Map<string, number[]>`
- In `searchTools()`: if embeddings available, compute cosine similarity, merge with keyword results, deduplicate
- Graceful fallback: if embedding generation fails, use keyword-only (existing behavior)

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/tool-handlers/tool-search.ts \
       backend/src/__tests__/unit/services/semantic-tool-search.test.ts
git commit -m "feat(B4): semantic tool search — embedding-based discovery with keyword fallback"
```

---

### Task B5: Expanded Mode Detection Heuristics

**Files:**
- Modify: `backend/src/services/chat-modes.ts` (747 lines)
- Test: `backend/src/__tests__/unit/services/expanded-mode-detection.test.ts`

- [ ] **Step 1: Write failing tests**

Test expanded trigger patterns: "Schreibe einen Brief" → tool_assisted, "Recherchiere über..." → agent, "Was steht in meinen Notizen über..." → rag_enhanced, "Hallo, wie geht's?" → conversation.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Expand keyword lists in chat-modes.ts**

Find the existing heuristic trigger lists and expand them significantly. Add German and English variants. Add verb-based patterns (schreibe → tool, recherchiere → agent, erinnere → rag). Tune confidence thresholds if needed.

- [ ] **Step 4: Run all backend tests**

Run: `cd backend && npm test`
Expected: All pass including existing chat-modes tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chat-modes.ts \
       backend/src/__tests__/unit/services/expanded-mode-detection.test.ts
git commit -m "feat(B5): expanded mode detection heuristics — broader trigger patterns, fewer LLM fallbacks"
```

---

## Chunk 3: Worker C — Chat UX (World-Class Interaction)

### Task C1: Chat Branching Data Model + API

**Files:**
- Modify: `backend/sql/migrations/phase100_deep_excellence.sql`
- Modify: `backend/src/routes/general-chat.ts` (949 lines)
- Test: `backend/src/__tests__/unit/services/chat-branching.test.ts`

- [ ] **Step 1: Add chat branching columns to migration**

Append to `backend/sql/migrations/phase100_deep_excellence.sql`:

```sql
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- C1: Chat Branching
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS parent_message_id UUID', schema_name);
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1', schema_name);
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chat_msg_parent ON %I.chat_messages(parent_message_id) WHERE parent_message_id IS NOT NULL', schema_name, schema_name);

    -- C3: Persistent Tool Disclosure
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT ''[]''', schema_name);

    -- C4: Thinking Persistence
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS thinking_content TEXT', schema_name);
  END LOOP;
END $$;
```

- [ ] **Step 2: Write failing tests for edit/regenerate API**

Test `PUT /api/chat/sessions/:id/messages/:msgId/edit`, `POST .../regenerate`, `GET .../versions`. Test that edit marks old messages as inactive. Test that regenerate creates a new version.

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement edit endpoint in general-chat.ts**

Add 3 new route handlers:
- `PUT /:context/chat/sessions/:sessionId/messages/:messageId/edit` — marks old + descendants inactive, creates new message, triggers re-stream
- `POST /:context/chat/sessions/:sessionId/messages/:messageId/regenerate` — marks old assistant message inactive, creates new version, streams
- `GET /:context/chat/sessions/:sessionId/messages/:messageId/versions` — returns all versions of a message

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git add backend/sql/migrations/phase100_deep_excellence.sql \
       backend/src/routes/general-chat.ts \
       backend/src/__tests__/unit/services/chat-branching.test.ts
git commit -m "feat(C1): chat branching API — edit, regenerate, version history endpoints"
```

---

### Task C2: Unified Chat State (Sequential: Reducer → Hook → Component)

**Files:**
- Modify: `frontend/src/components/GeneralChat/chatReducer.ts` (205 lines)
- Modify: `frontend/src/hooks/useStreamingChat.ts` (437 lines)
- Modify: `frontend/src/components/GeneralChat/GeneralChat.tsx` (1102 lines)
- Test: `frontend/src/__tests__/chatReducer.test.ts`

**IMPORTANT: Implement in strict order — reducer first, then hook, then component.**

- [ ] **Step 1: Write failing tests for new reducer actions**

```typescript
// frontend/src/__tests__/chatReducer.test.ts
import { chatReducer, ChatState, ChatAction } from '../components/GeneralChat/chatReducer';

describe('chatReducer — Phase 100 additions', () => {
  const initialState: ChatState = {
    phase: 'ready',
    messages: [],
    sessionId: null,
    streamingContent: '',
    thinkingContent: '',
    error: null,
    skipNextLoad: false,
    activeTools: [],
    completedTools: [],
  };

  it('SET_TOOL_ACTIVITY should update active and completed tools', () => {
    const action: ChatAction = {
      type: 'SET_TOOL_ACTIVITY',
      payload: {
        activeTools: ['web_search'],
        completedTools: [{ name: 'calculate', duration_ms: 50, status: 'success' as const }],
      },
    };
    const state = chatReducer(initialState, action);
    expect(state.activeTools).toEqual(['web_search']);
    expect(state.completedTools).toHaveLength(1);
  });

  it('EDIT_MESSAGE should mark messages after edit point as inactive', () => {
    const stateWithMessages = {
      ...initialState,
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', is_active: true },
        { id: 'm2', role: 'assistant', content: 'Hi there', is_active: true },
        { id: 'm3', role: 'user', content: 'Follow up', is_active: true },
      ],
    };
    const action: ChatAction = {
      type: 'EDIT_MESSAGE',
      payload: { messageId: 'm1', newContent: 'Hello edited' },
    };
    const state = chatReducer(stateWithMessages as any, action);
    // m2 and m3 should be marked inactive
    expect(state.messages.find((m: any) => m.id === 'm2').is_active).toBe(false);
    expect(state.messages.find((m: any) => m.id === 'm3').is_active).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/chatReducer.test.ts`
Expected: FAIL

- [ ] **Step 3: Add new actions to chatReducer.ts**

Add to `chatReducer.ts`:
- `SET_TOOL_ACTIVITY` action with `activeTools: string[]` and `completedTools: ToolResult[]`
- `EDIT_MESSAGE` action that marks messages after the edited one as `is_active: false`
- `REGENERATE_MESSAGE` action that marks the target assistant message as `is_active: false`
- `SET_BRANCH` action for navigating between versions
- Add `activeTools`, `completedTools` to `ChatState` interface

- [ ] **Step 4: Run reducer tests**

Run: `cd frontend && npx vitest run src/__tests__/chatReducer.test.ts`
Expected: PASS

- [ ] **Step 5: Update useStreamingChat.ts to use reducer**

Modify `useStreamingChat.ts` to:
- Accept and use `chatReducer` internally for all state management
- Dispatch `SET_TOOL_ACTIVITY` on SSE `tool_use_start`/`tool_use_end` events
- Export the dispatch function for component use
- Remove any internal useState that duplicates reducer state

- [ ] **Step 6: Migrate GeneralChat.tsx to use useStreamingChat**

In `GeneralChat.tsx`:
- Remove the 6 `useState` calls (messages, sessionId, sending, streamingContent, isStreaming, thinkingContent)
- Call `useStreamingChat()` hook instead
- Use returned state and dispatch from the hook
- This should remove ~200 lines of manual SSE handling

- [ ] **Step 7: Run full frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/GeneralChat/chatReducer.ts \
       frontend/src/hooks/useStreamingChat.ts \
       frontend/src/components/GeneralChat/GeneralChat.tsx \
       frontend/src/__tests__/chatReducer.test.ts
git commit -m "feat(C2): unified chat state — reducer owns all state, useStreamingChat is primary hook"
```

---

### Task C3: Persistent Tool Disclosure

**Files:**
- Modify: `backend/src/services/claude/streaming.ts` (833 lines)
- Create: `frontend/src/components/GeneralChat/ToolDisclosure.tsx`
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx` (560 lines)
- Test: `frontend/src/__tests__/ToolDisclosure.test.tsx`

- [ ] **Step 1: Write frontend test for ToolDisclosure**

Test collapsed state shows "N Tools verwendet". Test expand shows tool names + durations. Test with 0 tools shows nothing.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Save tool_calls in streaming.ts backend**

In `streaming.ts`, collect tool call metadata (name, duration, status) during the streaming tool-use loop. On final message save, include `tool_calls` JSONB in the INSERT.

- [ ] **Step 4: Create ToolDisclosure.tsx**

```tsx
// frontend/src/components/GeneralChat/ToolDisclosure.tsx
import React, { useState } from 'react';

interface ToolCall {
  name: string;
  duration_ms: number;
  status: 'success' | 'error';
}

interface ToolDisclosureProps {
  toolCalls: ToolCall[];
}

// Import TOOL_LABELS from ChatMessageList for display names
const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  web_search: { label: 'Web-Suche', icon: '🌐' },
  search_ideas: { label: 'Gedanken durchsuchen', icon: '🔍' },
  calculate: { label: 'Berechnung', icon: '🧮' },
  // ... rest from existing TOOL_LABELS in ChatMessageList.tsx
};

export function ToolDisclosure({ toolCalls }: ToolDisclosureProps) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  return (
    <div className="tool-disclosure" role="region" aria-label="Verwendete Tools">
      <button
        className="tool-disclosure-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>🔧 {toolCalls.length} Tool{toolCalls.length !== 1 ? 's' : ''} verwendet</span>
        <span className={`chevron ${expanded ? 'expanded' : ''}`}>▾</span>
      </button>
      {expanded && (
        <ol className="tool-disclosure-list">
          {toolCalls.map((tool, i) => {
            const label = TOOL_LABELS[tool.name]?.label || tool.name;
            const icon = TOOL_LABELS[tool.name]?.icon || '🔧';
            return (
              <li key={i} className="tool-disclosure-item">
                <span className="tool-icon">{icon}</span>
                <span className="tool-name">{label}</span>
                <span className="tool-duration">{(tool.duration_ms / 1000).toFixed(1)}s</span>
                <span className={`tool-status ${tool.status}`}>
                  {tool.status === 'success' ? '✓' : '✗'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Integrate into ChatMessageList.tsx**

After each assistant message's content, render `<ToolDisclosure toolCalls={message.tool_calls || []} />`.

- [ ] **Step 6: Run tests**

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/claude/streaming.ts \
       frontend/src/components/GeneralChat/ToolDisclosure.tsx \
       frontend/src/components/GeneralChat/ChatMessageList.tsx \
       frontend/src/__tests__/ToolDisclosure.test.tsx
git commit -m "feat(C3): persistent tool disclosure — tool_calls saved to DB, expandable UI on messages"
```

---

### Task C4: Expandable Thinking UX

**Files:**
- Create: `frontend/src/components/GeneralChat/ThinkingBlock.tsx`
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- Modify: `backend/src/services/claude/streaming.ts`
- Test: `frontend/src/__tests__/ThinkingBlock.test.tsx`

- [ ] **Step 1: Write test for ThinkingBlock**

Test collapsed shows 2-line preview. Test expanded shows full content. Test streaming state has pulsing indicator. Test keyboard accessibility (Enter/Space to toggle).

- [ ] **Step 2: Create ThinkingBlock.tsx**

Component with collapsed/expanded states, aria-expanded, keyboard handler. During streaming: auto-scroll and pulsing border. After completion: static expandable block.

- [ ] **Step 3: Save thinking_content in streaming.ts**

On final message save, include `thinking_content` TEXT in the INSERT.

- [ ] **Step 4: Replace 100-char truncation in ChatMessageList.tsx**

Replace the existing `chat-thinking-block` div with `<ThinkingBlock content={message.thinking_content} isStreaming={isStreaming} />`.

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/GeneralChat/ThinkingBlock.tsx \
       frontend/src/components/GeneralChat/ChatMessageList.tsx \
       backend/src/services/claude/streaming.ts \
       frontend/src/__tests__/ThinkingBlock.test.tsx
git commit -m "feat(C4): expandable thinking UX — full thinking content with collapse/expand"
```

---

### Task C5: Auto Session Titles

**Files:**
- Modify: `backend/src/services/claude/streaming.ts`
- Modify: `frontend/src/components/GeneralChat/ChatSessionSidebar.tsx`
- Test: `backend/src/__tests__/unit/services/session-titles.test.ts`

- [ ] **Step 1: Write failing test**

Test that after first assistant response in a new session, a title is generated and saved. Test that title generation is fire-and-forget (doesn't delay response). Test that existing sessions with titles are not re-titled.

- [ ] **Step 2: Implement title generation in streaming.ts**

After the first complete assistant response in a session where `title IS NULL`:
- Fire-and-forget Haiku call: "Generate a short title (3-6 words) for: User: {msg} Assistant: {response}"
- UPDATE chat_sessions SET title = $1 WHERE id = $2
- No await — this runs in the background

- [ ] **Step 3: Display title in sidebar**

In `ChatSessionSidebar.tsx`, show `session.title` if present, otherwise show truncated first message or date.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Run full test suites**

Run: `cd backend && npm test` and `cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/claude/streaming.ts \
       frontend/src/components/GeneralChat/ChatSessionSidebar.tsx \
       backend/src/__tests__/unit/services/session-titles.test.ts
git commit -m "feat(C5): auto session titles — Haiku generates titles after first response"
```

---

## Chunk 4: Worker D — Design System & Polish

### Task D1: Design System Glass Variants + Top-10 Migration

**Files:**
- Modify: `frontend/src/design-system/tokens.ts` (128 lines)
- Modify: `frontend/src/design-system/components/Button.tsx` + `.css`
- Modify: `frontend/src/design-system/components/Card.tsx` + `.css`
- Modify: `frontend/src/design-system/components/Input.tsx` + `.css`
- Modify: ~15 component files for pattern migration
- Test: `frontend/src/__tests__/design-system-glass.test.tsx`

- [ ] **Step 1: Write tests for glass variants**

Test that `<Button variant="glass">` renders with `ds-button--glass` class. Test that `<Card variant="glass">` renders correctly. Test that glass variant has backdrop-filter CSS property.

- [ ] **Step 2: Add glass + neuro tokens to tokens.ts**

Add to `frontend/src/design-system/tokens.ts`:

```typescript
export const glassTokens = {
  background: 'var(--glass-bg, rgba(255, 255, 255, 0.05))',
  border: 'var(--glass-border, rgba(255, 255, 255, 0.1))',
  backdropBlur: 'var(--glass-blur, 12px)',
  shadow: 'var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.12))',
} as const;

export const neuroTokens = {
  hoverLift: 'translateY(-2px)',
  focusRingColor: 'var(--accent-primary, #6366f1)',
  focusRingWidth: '2px',
  glowColor: 'var(--glow-color, rgba(99, 102, 241, 0.3))',
} as const;
```

- [ ] **Step 3: Add glass variant to Button, Card, Input**

For each component, add a `"glass"` option to the variant prop. Add corresponding CSS classes (`ds-button--glass`, `ds-card--glass`, `ds-input--glass`) that apply the liquid-glass aesthetic (backdrop-filter, border, shadow, hover-lift).

- [ ] **Step 4: Migrate top-5 patterns (liquid-glass-card → Card glass)**

Start with the most common patterns. Use grep to find all `liquid-glass-card` occurrences and replace with `<Card variant="glass">`. Do the same for `liquid-glass-input` → `<Input variant="glass">`. Verify each replacement renders identically.

- [ ] **Step 5: Migrate next-5 patterns (badges, modals, tabs)**

Replace inline badge spans with `<Badge>`, ad-hoc modals with `<Modal>`, hand-rolled tabs with `<Tabs>`, spinner divs with `<Skeleton>`, empty state divs with `<EmptyState>`.

- [ ] **Step 6: Run frontend build + tests**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx vitest run`
Expected: Build clean, all tests pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design-system/ \
       frontend/src/components/ \
       frontend/src/__tests__/design-system-glass.test.tsx
git commit -m "feat(D1): design system glass variants + top-10 pattern migration"
```

---

### Task D2: Inline Error Recovery

**Files:**
- Modify: 8 page components
- Modify: `frontend/src/utils/error-handler.ts` (110 lines)
- Test: `frontend/src/__tests__/error-recovery.test.tsx`

- [ ] **Step 1: Write test for error state rendering**

Test that when a query returns an error, the page shows an EmptyState with "Erneut versuchen" button. Test that clicking retry calls refetch().

- [ ] **Step 2: Create reusable QueryErrorState component**

```tsx
// Add to error-handler.ts or create separate component:
export function QueryErrorState({ error, refetch }: { error: Error; refetch: () => void }) {
  return (
    <EmptyState
      icon="alert-triangle"
      title="Laden fehlgeschlagen"
      description={getErrorMessage(error)}
      action={{ label: 'Erneut versuchen', onClick: refetch }}
    />
  );
}
```

- [ ] **Step 3: Add error states to 8 main pages**

For each of Dashboard, IdeasPage, PlannerPage, ChatPage, EmailPage, ContactsPage, FinancePage, DocumentVaultPage: find the main data query and add `if (isError) return <QueryErrorState error={error} refetch={refetch} />`.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/error-handler.ts \
       frontend/src/components/Dashboard.tsx \
       frontend/src/components/IdeasPage.tsx \
       frontend/src/components/PlannerPage/PlannerPage.tsx \
       frontend/src/components/ChatPage.tsx \
       frontend/src/components/EmailPage/EmailPage.tsx \
       frontend/src/components/ContactsPage/ContactsPage.tsx \
       frontend/src/components/FinancePage/FinancePage.tsx \
       frontend/src/components/DocumentVaultPage/DocumentVaultPage.tsx \
       frontend/src/__tests__/error-recovery.test.tsx
git commit -m "feat(D2): inline error recovery — retry buttons on all main pages"
```

---

### Task D3: Navigation Cleanup

**Files:**
- Modify: `frontend/src/navigation.ts` (271 lines)
- Modify: `frontend/src/components/layout/MobileSidebarDrawer.tsx` (354 lines)
- Modify: `frontend/src/components/Breadcrumbs.tsx` (282 lines)
- Create: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx` (366 lines)
- Modify: `frontend/src/components/Dashboard.tsx` (525 lines)

- [ ] **Step 1: Replace emoji icons with Lucide names in navigation.ts**

Change `NavItem.icon` type from emoji string to Lucide icon name string. Update all items to use icon names matching `getPageIcon()` in `navIcons.ts`.

- [ ] **Step 2: Update MobileSidebarDrawer + Breadcrumbs atomically**

Replace emoji rendering with Lucide icon component rendering using the new icon name field. Import from `lucide-react`.

- [ ] **Step 3: Extract TopBar component from AppLayout**

Move the inline topbar div (containing CognitiveLoadIndicator, FocusMode, ContextIndicator, etc.) into a new `TopBar.tsx` component. AppLayout renders `<TopBar />`.

- [ ] **Step 4: Add frecency-based quick nav to Dashboard**

Track page visits in localStorage. Compute frecency score. Dashboard QUICK_NAV shows top-8 by frecency instead of static items.

- [ ] **Step 5: Run frontend build + tests**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/navigation.ts \
       frontend/src/components/layout/MobileSidebarDrawer.tsx \
       frontend/src/components/Breadcrumbs.tsx \
       frontend/src/components/layout/TopBar.tsx \
       frontend/src/components/layout/AppLayout.tsx \
       frontend/src/components/Dashboard.tsx
git commit -m "feat(D3): navigation cleanup — Lucide icons, TopBar extraction, frecency quick nav"
```

---

### Task D4: React Query Completion (5 Pages)

**Files:**
- Create: `frontend/src/hooks/queries/useBusinessData.ts`
- Create: `frontend/src/hooks/queries/useInsightsData.ts`
- Create: `frontend/src/hooks/queries/useLearningData.ts`
- Create: `frontend/src/hooks/queries/useMyAI.ts`
- Create: `frontend/src/hooks/queries/useSettings.ts`
- Modify: `frontend/src/lib/query-keys.ts` (173 lines)
- Modify: 5 page components

- [ ] **Step 1: Add 5 new domains to query-keys.ts**

```typescript
business: {
  all: (ctx: string) => ['business', ctx] as const,
  revenue: (ctx: string) => ['business', ctx, 'revenue'] as const,
  traffic: (ctx: string) => ['business', ctx, 'traffic'] as const,
  seo: (ctx: string) => ['business', ctx, 'seo'] as const,
  health: (ctx: string) => ['business', ctx, 'health'] as const,
},
insights: {
  all: (ctx: string) => ['insights', ctx] as const,
  stats: (ctx: string) => ['insights', ctx, 'stats'] as const,
  summary: (ctx: string) => ['insights', ctx, 'summary'] as const,
},
learning: {
  all: (ctx: string) => ['learning', ctx] as const,
  tasks: (ctx: string) => ['learning', ctx, 'tasks'] as const,
  progress: (ctx: string) => ['learning', ctx, 'progress'] as const,
},
myAI: {
  all: (ctx: string) => ['myAI', ctx] as const,
  memory: (ctx: string) => ['myAI', ctx, 'memory'] as const,
  facts: (ctx: string) => ['myAI', ctx, 'facts'] as const,
},
settings: {
  all: () => ['settings'] as const,
  profile: () => ['settings', 'profile'] as const,
  preferences: () => ['settings', 'preferences'] as const,
},
```

- [ ] **Step 2: Create 5 hook files**

For each page, create a hook file following the existing pattern in `hooks/queries/useIdeas.ts`:
- Export `useQuery` hooks for each data need
- Export `useMutation` hooks with cache invalidation
- Use `queryKeys.{domain}` for cache keys
- Use the existing `apiClient` or `axios` instance

- [ ] **Step 3: Migrate each page from useState to React Query**

For each of the 5 pages:
1. Import the new hook
2. Replace `useState` + `useEffect` + `axios` with query/mutation hooks
3. Add loading skeleton from design system
4. Add error state from D2
5. Remove direct axios imports

- [ ] **Step 4: Run frontend build + tests**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx vitest run`
Expected: Build clean, all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/queries/useBusinessData.ts \
       frontend/src/hooks/queries/useInsightsData.ts \
       frontend/src/hooks/queries/useLearningData.ts \
       frontend/src/hooks/queries/useMyAI.ts \
       frontend/src/hooks/queries/useSettings.ts \
       frontend/src/lib/query-keys.ts \
       frontend/src/components/BusinessDashboard.tsx \
       frontend/src/components/InsightsDashboard.tsx \
       frontend/src/components/LearningDashboard/LearningDashboard.tsx \
       frontend/src/components/MyAIPage.tsx \
       frontend/src/components/SettingsDashboard.tsx
git commit -m "feat(D4): React Query completion — 5 remaining pages migrated, 0 direct axios in pages"
```

---

### Task D5: Confidence Indicators on AI Responses

**Files:**
- Modify: `backend/src/services/claude/streaming.ts`
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- Test: `frontend/src/__tests__/ConfidenceBadge.test.tsx`

- [ ] **Step 1: Write test for confidence badge rendering**

Test green badge at confidence > 0.75. Test amber at 0.45-0.75. Test red at < 0.45. Test no badge when no RAG metadata.

- [ ] **Step 2: Save RAG metadata in streaming.ts**

On final message save, extract `rag_confidence` and `rag_sources_count` from the RAG result and save in message `metadata` JSONB.

- [ ] **Step 3: Add ConfidenceBadge to ChatMessageList**

After each assistant message's timestamp, render a confidence badge based on `message.metadata?.rag_confidence`. Use the existing `ConfidenceBadge` component pattern or create a simple one with green/amber/red dots and tooltips.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Final full test suite run**

Run both: `cd backend && npm test` and `cd frontend && npx vitest run`
Expected: All pass, build clean

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/claude/streaming.ts \
       frontend/src/components/GeneralChat/ChatMessageList.tsx \
       frontend/src/__tests__/ConfidenceBadge.test.tsx
git commit -m "feat(D5): confidence indicators — RAG quality visible on AI responses"
```

---

## Final Verification

After all 4 workers complete:

- [ ] **Run full backend test suite:** `cd backend && npm test`
- [ ] **Run full frontend test suite:** `cd frontend && npx vitest run`
- [ ] **Build check:** `cd frontend && npx tsc --noEmit && npm run build`
- [ ] **Backend build check:** `cd backend && npx tsc --noEmit`
- [ ] **Run migration:** Apply `phase100_deep_excellence.sql` to all 4 schemas
- [ ] **Update CLAUDE.md:** Phase 100, new tool count (55), new test counts, changelog entry
- [ ] **Final commit:** `git commit -m "docs: Phase 100 Deep Excellence — CLAUDE.md update"`
