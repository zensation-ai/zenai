# Phase 99: Deep Quality Evolution — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate ZenAI from 7.8-8.2/10 to 9.5+/10 across backend hardening, AI core, frontend architecture, and UX.

**Architecture:** 2 waves of parallel work. Wave 1 targets backend robustness + AI pipeline quality. Wave 2 targets frontend state management, error handling, accessibility, and UX differentiation. Each wave runs 2 workers in parallel on independent fix groups.

**Tech Stack:** Express.js, TypeScript strict, React + TanStack Query v5, Anthropic Claude API, PostgreSQL/Supabase, BullMQ, SSE streaming.

**Spec:** `docs/superpowers/specs/2026-03-18-phase99-deep-quality-evolution.md`

**Test commands:**
- Backend: `cd backend && npm test`
- Frontend: `cd frontend && npx vitest run`
- Build: `cd backend && npm run build && cd ../frontend && npm run build`

---

## Chunk 1: Backend Hardening (Fixes 1-15)

> Worker A handles these. All fixes are independent — can be done in any order.

### Task 1: Request-Level Timeout Middleware (Fix 1)

**Files:**
- Create: `backend/src/middleware/request-timeout.ts`
- Create: `backend/src/__tests__/unit/middleware/request-timeout.test.ts`
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Write failing test for timeout middleware**

```typescript
// backend/src/__tests__/unit/middleware/request-timeout.test.ts
import { requestTimeout } from '../../middleware/request-timeout';
import { Request, Response, NextFunction } from 'express';

describe('requestTimeout middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.useFakeTimers();
    mockReq = { path: '/api/personal/ideas', method: 'GET' };
    mockRes = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => jest.useRealTimers());

  it('calls next() immediately for normal requests', () => {
    requestTimeout()(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('sends 504 after default timeout (30s)', () => {
    requestTimeout()(mockReq as Request, mockRes as Response, mockNext);
    jest.advanceTimersByTime(30001);
    expect(mockRes.status).toHaveBeenCalledWith(504);
  });

  it('uses 120s timeout for streaming endpoints', () => {
    mockReq.path = '/api/chat/sessions/123/messages/stream';
    requestTimeout()(mockReq as Request, mockRes as Response, mockNext);
    jest.advanceTimersByTime(30001);
    expect(mockRes.status).not.toHaveBeenCalled();
    jest.advanceTimersByTime(90000);
    expect(mockRes.status).toHaveBeenCalledWith(504);
  });

  it('uses 180s timeout for vision endpoints', () => {
    mockReq.path = '/api/vision/analyze';
    requestTimeout()(mockReq as Request, mockRes as Response, mockNext);
    jest.advanceTimersByTime(120001);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('does not send 504 if response already sent', () => {
    mockRes.headersSent = true;
    requestTimeout()(mockReq as Request, mockRes as Response, mockNext);
    jest.advanceTimersByTime(30001);
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern="request-timeout" --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement timeout middleware**

```typescript
// backend/src/middleware/request-timeout.ts
import { Request, Response, NextFunction } from 'express';

const STREAMING_PATTERNS = ['/stream', '/messages/stream', '/execute/stream', '/voice'];
const VISION_PATTERNS = ['/vision/'];
const DEFAULT_TIMEOUT = 30_000;
const STREAMING_TIMEOUT = 120_000;
const VISION_TIMEOUT = 180_000;

function getTimeout(path: string): number {
  if (STREAMING_PATTERNS.some(p => path.includes(p))) return STREAMING_TIMEOUT;
  if (VISION_PATTERNS.some(p => path.includes(p))) return VISION_TIMEOUT;
  return DEFAULT_TIMEOUT;
}

export function requestTimeout() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = getTimeout(req.path);
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: 'Gateway Timeout',
          message: `Request exceeded ${timeout / 1000}s limit`,
        });
      }
    }, timeout);

    res.on('close', () => clearTimeout(timer));
    res.on('finish', () => clearTimeout(timer));
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern="request-timeout" --verbose`
Expected: 5 tests PASS

- [ ] **Step 5: Register middleware in main.ts**

Add `import { requestTimeout } from './middleware/request-timeout';` and `app.use(requestTimeout());` early in the middleware chain (after CORS, before routes). Read `main.ts` first to find the exact insertion point.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/middleware/request-timeout.ts src/__tests__/unit/middleware/request-timeout.test.ts src/main.ts
git commit -m "feat: add request-level timeout middleware (30s/120s/180s)"
```

---

### Task 2: Regex Compilation Cache (Fix 2)

**Files:**
- Modify: `backend/src/services/chat-modes.ts`
- Modify or create: test file for chat-modes

- [ ] **Step 1: Read `backend/src/services/chat-modes.ts` to understand current regex patterns**

Look for: regex patterns defined inline, how they're used in mode detection. Note which patterns are recompiled per call.

- [ ] **Step 2: Write test for compiled regex performance**

```typescript
// In existing or new test file for chat-modes
describe('chat mode detection with compiled regex', () => {
  it('detects tool_assisted mode for tool-related queries', () => {
    expect(detectChatMode('Suche nach meinen Ideen zum Thema KI')).toBe('tool_assisted');
  });

  it('detects conversation mode for simple greetings', () => {
    expect(detectChatMode('Hallo, wie geht es dir?')).toBe('conversation');
  });

  it('detects rag_enhanced mode for knowledge queries', () => {
    expect(detectChatMode('Was wissen wir ueber das Projekt?')).toBe('rag_enhanced');
  });

  it('uses pre-compiled regex (no recompilation)', () => {
    // Call 1000 times — should complete in < 50ms
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      detectChatMode('Suche nach Informationen ueber TypeScript');
    }
    expect(Date.now() - start).toBeLessThan(50);
  });
});
```

- [ ] **Step 3: Refactor chat-modes.ts to compile regex at module load**

Move all `new RegExp(...)` or `/pattern/` literals into a module-level `const COMPILED_PATTERNS: Map<string, RegExp[]>` that is populated once when the module is first imported. Change `detectChatMode` to iterate the compiled map.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="chat-modes" --verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "perf: compile chat mode regex patterns at module load time"
```

---

### Task 3: Tool Execution Hard Limits (Fix 3)

**Files:**
- Modify: `backend/src/services/claude/streaming.ts`
- Create: `backend/src/__tests__/unit/services/streaming-limits.test.ts`

- [ ] **Step 1: Read `backend/src/services/claude/streaming.ts` lines 380-540 (tool loop)**

Identify the tool iteration loop, current `maxToolIterations` check, and where to add time-based limit.

- [ ] **Step 2: Write test for time-based tool limit**

```typescript
describe('streaming tool execution limits', () => {
  it('enforces maxToolTime of 60s', () => {
    // Test that tool loop exits when elapsed time exceeds 60s
    // Mock Date.now() to simulate time passing
  });

  it('enforces maxToolIterations of 10', () => {
    // Test that tool loop exits after 10 iterations
  });

  it('sends partial result with warning when time limit exceeded', () => {
    // Test that SSE sends a warning event before closing
  });
});
```

- [ ] **Step 3: Implement time-based limit in streaming.ts**

In the tool execution loop, add:
```typescript
const toolStartTime = Date.now();
const MAX_TOOL_TIME = 60_000;
const MAX_TOOL_ITERATIONS = 10;
let toolIterations = 0;

// Inside loop:
toolIterations++;
if (Date.now() - toolStartTime > MAX_TOOL_TIME) {
  sendSSE(res, 'warning', { message: 'Tool execution time limit reached' });
  break;
}
if (toolIterations >= MAX_TOOL_ITERATIONS) {
  sendSSE(res, 'warning', { message: 'Tool iteration limit reached' });
  break;
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest --testPathPattern="streaming" --verbose`
Expected: All pass (existing + new)

- [ ] **Step 5: Commit**

```bash
git commit -m "fix: enforce 60s time limit and 10-iteration cap on tool execution"
```

---

### Task 4: Tool Result Size Enforcement (Fix 4)

**Files:**
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Add size truncation utility**

```typescript
const MAX_TOOL_RESULT_SIZE = 64 * 1024; // 64KB

function truncateToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_SIZE) return result;
  return result.slice(0, MAX_TOOL_RESULT_SIZE) + '\n\n[Result truncated — exceeded 64KB limit]';
}
```

- [ ] **Step 2: Apply truncation before including tool results in messages**

Find where tool results are added to the message history in the tool loop. Apply `truncateToolResult()` to each result.

- [ ] **Step 3: Write test**

```typescript
it('truncates tool results exceeding 64KB', () => {
  const largeResult = 'x'.repeat(100_000);
  const truncated = truncateToolResult(largeResult);
  expect(truncated.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_SIZE + 50);
  expect(truncated).toContain('[Result truncated');
});
```

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "fix: truncate tool results to 64KB to prevent memory exhaustion"
```

---

### Task 5: HyDE Timeout with Fallback (Fix 5)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Read `backend/src/services/enhanced-rag.ts` lines 290-360 (HyDE section)**

Identify where HyDE generation happens and the `Promise.all()` call.

- [ ] **Step 2: Write test**

```typescript
describe('HyDE timeout', () => {
  it('falls back to direct retrieval when HyDE times out', async () => {
    // Mock HyDE generation to take 10s
    // Verify fallback to direct embedding retrieval
    // Verify metric emitted for timeout
  });

  it('uses HyDE result when it completes within 5s', async () => {
    // Mock HyDE generation to complete in 1s
    // Verify HyDE result is used
  });
});
```

- [ ] **Step 3: Implement timeout wrapper**

```typescript
async function hydeWithTimeout(query: string, context: string, timeout = 5000): Promise<string | null> {
  try {
    const result = await Promise.race([
      generateHypotheticalDocument(query, context),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('HyDE timeout')), timeout)),
    ]);
    return result;
  } catch (error) {
    if ((error as Error).message === 'HyDE timeout') {
      logger.warn('HyDE generation timed out, falling back to direct retrieval');
      // recordMetric('rag.hyde.timeout', 1);
      return null;
    }
    throw error;
  }
}
```

Replace the direct HyDE call with `hydeWithTimeout()`. If result is null, skip HyDE embedding and use direct query embedding only.

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "fix: add 5s timeout to HyDE generation with direct retrieval fallback"
```

---

### Task 6: Eliminate `as any` (Fix 6)

**Files:**
- Multiple backend service files

- [ ] **Step 1: Find all `as any` locations**

Run: `grep -rn 'as any' backend/src/ --include='*.ts' | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts'`

- [ ] **Step 2: Group by file and categorize**

For each instance, determine:
- Is it a DB query result? → Use proper row type from `backend/src/types/database-rows.ts`
- Is it an API response? → Create interface in `backend/src/types/`
- Is it a type narrowing issue? → Use `unknown` + type guard

- [ ] **Step 3: Fix each instance — prioritize streaming.ts, tool-handlers, agent-orchestrator**

For DB queries, pattern:
```typescript
// Before: const result = await queryContext(ctx, sql) as any;
// After:
interface IdeaRow { id: string; title: string; content: string; /* ... */ }
const result = await queryContext<IdeaRow>(ctx, sql);
```

For API responses, create typed interfaces.

- [ ] **Step 4: Build to verify**

Run: `cd backend && npm run build`
Expected: 0 TypeScript errors

- [ ] **Step 5: Run all tests**

Run: `cd backend && npm test`
Expected: All 4734+ pass

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: eliminate all 'as any' casts with proper typed interfaces"
```

---

### Task 7: Non-Null Assertion Elimination (Fix 7)

**Files:**
- Modify: Files identified by grep

- [ ] **Step 1: Find all non-null assertions**

Run: `grep -rn '\w\+!' backend/src/ --include='*.ts' | grep -v node_modules | grep -v __tests__ | grep -v '.d.ts' | grep -v '!=\|!=='`

Focus on `backend/src/routes/auth.ts` and `backend/src/main.ts`.

- [ ] **Step 2: Replace each with guard clause**

```typescript
// Before: const userId = req.user!.id;
// After:
if (!req.user) {
  res.status(401).json({ success: false, error: 'Not authenticated' });
  return;
}
const userId = req.user.id;
```

- [ ] **Step 3: Build and test**

Run: `cd backend && npm run build && npm test`

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: replace non-null assertions with guard clauses in auth routes"
```

---

### Task 8: Error Message Sanitization (Fix 8)

**Files:**
- Create: `backend/src/utils/sanitize-error.ts`
- Create: `backend/src/__tests__/unit/utils/sanitize-error.test.ts`
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Write test**

```typescript
describe('sanitizeError', () => {
  it('returns user-friendly message in production', () => {
    const error = new Error('FATAL: password auth failed for user "postgres"');
    const sanitized = sanitizeError(error, 'production');
    expect(sanitized.message).toBe('An internal error occurred');
    expect(sanitized.message).not.toContain('postgres');
  });

  it('returns full details in development', () => {
    const error = new Error('DB connection failed');
    const sanitized = sanitizeError(error, 'development');
    expect(sanitized.message).toContain('DB connection failed');
  });

  it('strips stack traces', () => {
    const error = new Error('test');
    error.stack = 'Error: test\n    at /app/backend/src/services/secret.ts:42:5';
    const sanitized = sanitizeError(error, 'production');
    expect(sanitized.stack).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement sanitizeError**

```typescript
export interface SanitizedError {
  code: string;
  message: string;
  stack?: string;
}

export function sanitizeError(error: unknown, env = process.env.NODE_ENV): SanitizedError {
  const err = error instanceof Error ? error : new Error(String(error));
  if (env === 'production') {
    return { code: 'INTERNAL_ERROR', message: 'An internal error occurred' };
  }
  return { code: 'INTERNAL_ERROR', message: err.message, stack: err.stack };
}
```

- [ ] **Step 3: Apply in streaming.ts SSE error events**

Find SSE error emission points and wrap with `sanitizeError()`.

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "fix: sanitize error messages before sending to client"
```

---

### Task 9: Backoff Jitter (Fix 9)

**Files:**
- Modify: `backend/src/utils/database-context.ts`

- [ ] **Step 1: Read database-context.ts lines 147-160 (retry/backoff section)**

- [ ] **Step 2: Add jitter to backoff calculation**

```typescript
// Before: const delay = Math.pow(2, attempt) * 1000;
// After:
const baseDelay = Math.pow(2, attempt) * 1000;
const jitter = Math.random() * baseDelay * 0.5;
const delay = baseDelay + jitter;
```

- [ ] **Step 3: Write test**

```typescript
it('adds jitter to backoff delay', () => {
  // Run 100 times, verify delays are not identical
  const delays = Array.from({ length: 100 }, () => calculateBackoff(3));
  const unique = new Set(delays);
  expect(unique.size).toBeGreaterThan(1);
});
```

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "fix: add jitter to DB reconnect backoff to prevent thundering herd"
```

---

### Task 10: Atomic Memory Consolidation (Fix 10)

**Files:**
- Modify: `backend/src/services/memory/long-term-memory.ts`

- [ ] **Step 1: Read long-term-memory.ts consolidation section**

Find the consolidation function and identify which DB operations need to be wrapped.

- [ ] **Step 2: Wrap in transaction**

```typescript
async function consolidateMemories(context: string): Promise<void> {
  const client = await getPoolClient(context);
  try {
    await client.query('BEGIN');
    // ... existing consolidation logic, using client.query() instead of queryContext()
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Memory consolidation failed, rolled back', { error, context });
    throw error;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "fix: wrap memory consolidation in DB transaction for atomicity"
```

---

### Task 11: Stream Resource Cleanup (Fix 11)

**Files:**
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Read streaming.ts and identify all resource allocations**

Look for: `setTimeout`, event listeners, stream readers, abort signals. Map which ones have cleanup in `finally` and which don't.

- [ ] **Step 2: Create cleanupStreamResources function**

```typescript
function cleanupStreamResources(resources: {
  timeoutId?: NodeJS.Timeout;
  abortController?: AbortController;
  reader?: ReadableStreamDefaultReader;
}) {
  if (resources.timeoutId) clearTimeout(resources.timeoutId);
  if (resources.reader) resources.reader.cancel().catch(() => {});
}
```

- [ ] **Step 3: Ensure all resource cleanup goes through this function in finally blocks**

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "fix: centralize stream resource cleanup in finally blocks"
```

---

### Task 12: Query Size Limit (Fix 12)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Add query validation at entry point**

```typescript
const MAX_QUERY_LENGTH = 10_000; // 10KB

export async function enhancedRetrieve(query: string, ...args): Promise<...> {
  if (query.length > MAX_QUERY_LENGTH) {
    logger.warn('Query truncated', { originalLength: query.length });
    query = query.slice(0, MAX_QUERY_LENGTH);
  }
  // ... existing logic
}
```

- [ ] **Step 2: Write test**

```typescript
it('truncates queries exceeding 10KB', async () => {
  const longQuery = 'a'.repeat(15_000);
  // Verify truncation happens without error
});
```

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "fix: limit RAG query input to 10KB to prevent excessive processing"
```

---

### Task 13: Message History Dedup (Fix 13)

**Files:**
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Add deduplication before message append**

In the tool loop where messages are appended to history:

```typescript
const MAX_IDENTICAL_ERRORS = 3;

function shouldAppendMessage(messages: Message[], newMessage: Message): boolean {
  if (newMessage.role !== 'tool') return true;
  const recentSame = messages.filter(m =>
    m.role === 'tool' && m.content === newMessage.content
  ).length;
  return recentSame < MAX_IDENTICAL_ERRORS;
}
```

- [ ] **Step 2: Run tests and commit**

```bash
git commit -m "fix: deduplicate repeated tool error messages in conversation history"
```

---

### Task 14: Safe JSON Serialization (Fix 14)

**Files:**
- Create: `backend/src/utils/safe-stringify.ts`
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Implement safeStringify**

```typescript
export function safeStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
}
```

- [ ] **Step 2: Replace `JSON.stringify()` calls in SSE emission with `safeStringify()`**

- [ ] **Step 3: Write test and commit**

```bash
git commit -m "fix: use safe JSON serialization for SSE events (handles circular refs)"
```

---

### Task 15: Pool Threshold Tuning (Fix 15)

**Files:**
- Modify: `backend/src/utils/database-context.ts`

- [ ] **Step 1: Read database-context.ts lines 295-310 (threshold section)**

- [ ] **Step 2: Change thresholds**

```typescript
// Before: const WARNING_THRESHOLD = 0.25;
// After:
const WARNING_THRESHOLD = 0.50;
const CRITICAL_THRESHOLD = 0.75;
```

Add critical-level logging when pool usage exceeds 75%.

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "fix: tune pool exhaustion thresholds (50% warn, 75% critical)"
```

---

## Chunk 2: AI Core Evolution (Fixes 16-25)

> Worker B handles these. Fixes 16-20 are independent. Fix 21 after 17. Fix 23 after 5+18. Fix 24 after 16.

### Task 16: Contextual Retrieval — Chunk Enrichment (Fix 16)

**Files:**
- Create: `backend/src/services/contextual-retrieval.ts`
- Create: `backend/src/__tests__/unit/services/contextual-retrieval.test.ts`
- Create: `backend/sql/migrations/phase99_contextual_retrieval.sql`
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Write SQL migration**

```sql
-- phase99_contextual_retrieval.sql
-- Add enriched content fields to document_chunks in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    EXECUTE format('
      ALTER TABLE %I.document_chunks
        ADD COLUMN IF NOT EXISTS enriched_content TEXT,
        ADD COLUMN IF NOT EXISTS context_prefix TEXT,
        ADD COLUMN IF NOT EXISTS enriched_embedding vector(1536);

      CREATE INDEX IF NOT EXISTS idx_%I_doc_chunks_enriched_emb
        ON %I.document_chunks USING ivfflat (enriched_embedding vector_cosine_ops)
        WITH (lists = 100);
    ', schema_name, schema_name, schema_name);
  END LOOP;
END $$;
```

- [ ] **Step 2: Write test for context prefix generation**

```typescript
describe('contextual retrieval', () => {
  it('generates context prefix for a chunk', async () => {
    const prefix = await generateContextPrefix({
      documentTitle: 'TypeScript Best Practices',
      sectionHeader: 'Error Handling',
      chunkContent: 'Always use try-catch blocks...',
    });
    expect(prefix).toBeDefined();
    expect(prefix.length).toBeLessThan(200);
    expect(prefix).toContain('TypeScript');
  });

  it('enriches chunk with context prefix', () => {
    const enriched = enrichChunk('Always use try-catch blocks...', 'This chunk from "TypeScript Best Practices" discusses error handling patterns.');
    expect(enriched).toStartWith('This chunk from');
    expect(enriched).toContain('Always use try-catch blocks');
  });
});
```

- [ ] **Step 3: Implement contextual-retrieval.ts**

```typescript
// backend/src/services/contextual-retrieval.ts

export interface ChunkContext {
  documentTitle: string;
  sectionHeader?: string;
  chunkContent: string;
}

export function enrichChunk(content: string, contextPrefix: string): string {
  return `${contextPrefix}\n\n${content}`;
}

export async function generateContextPrefix(ctx: ChunkContext): Promise<string> {
  // Use Claude Haiku for cost-efficient context generation
  // Prompt: "Given document '{title}', section '{section}', briefly describe what this chunk discusses in 1-2 sentences: {chunk preview}"
  // Return the generated prefix
}

export async function batchEnrichChunks(context: string, batchSize = 50): Promise<number> {
  // Query chunks without enriched_content
  // Process in batches of 50
  // Generate context prefix + enriched embedding for each
  // Update DB
  // Return count of enriched chunks
}
```

- [ ] **Step 4: Modify enhanced-rag.ts to use enriched embeddings when available**

In the retrieval function, prefer `enriched_embedding` over `embedding` when it exists. Fall back to regular embedding for non-enriched chunks.

- [ ] **Step 5: Run tests and commit**

```bash
git commit -m "feat: add contextual retrieval — chunk enrichment at index time (Anthropic method)"
```

---

### Task 17: Tool Search Tool Pattern (Fix 17)

**Files:**
- Create: `backend/src/services/tool-handlers/tool-search.ts`
- Create: `backend/src/__tests__/unit/services/tool-search.test.ts`
- Modify: `backend/src/services/tool-handlers/index.ts`
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Write test for tool search**

```typescript
describe('tool search', () => {
  it('returns email tools for email-related query', () => {
    const results = searchTools('draft an email response');
    expect(results.map(t => t.name)).toContain('draft_email');
    expect(results.map(t => t.name)).toContain('ask_inbox');
  });

  it('returns code tools for code-related query', () => {
    const results = searchTools('execute python script');
    expect(results.map(t => t.name)).toContain('execute_code');
  });

  it('returns max 10 tools', () => {
    const results = searchTools('do everything');
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('always includes core tools', () => {
    const core = getCoreTools();
    expect(core.map(t => t.name)).toEqual(
      expect.arrayContaining(['search_tools', 'remember', 'recall', 'web_search', 'navigate_to'])
    );
  });
});
```

- [ ] **Step 2: Implement tool-search.ts**

```typescript
// backend/src/services/tool-handlers/tool-search.ts

interface ToolRegistryEntry {
  name: string;
  description: string;
  categories: string[];
  keywords: string[];
  definition: object; // Anthropic tool definition
}

const CORE_TOOL_NAMES = ['search_tools', 'remember', 'recall', 'web_search', 'navigate_to'];

// Build registry from existing tool definitions at module load
const toolRegistry: Map<string, ToolRegistryEntry> = new Map();

export function initToolRegistry(allTools: ToolDefinition[]): void {
  // Populate registry with categories and keywords extracted from descriptions
}

export function getCoreTools(): ToolDefinition[] {
  return CORE_TOOL_NAMES.map(name => toolRegistry.get(name)?.definition).filter(Boolean);
}

export function searchTools(query: string, maxResults = 10): ToolRegistryEntry[] {
  // BM25-style keyword matching against tool names, descriptions, categories
  // Score and rank, return top N
}

// The search_tools tool definition itself:
export const searchToolsDefinition = {
  name: 'search_tools',
  description: 'Search for available AI tools by describing what you need. Returns tool definitions that can be used in subsequent messages.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What capability do you need? E.g., "send email", "analyze code"' },
    },
    required: ['query'],
  },
};
```

- [ ] **Step 3: Modify streaming.ts to use core tools by default**

In the streaming handler where tools are assembled for the API call:
1. Default to `getCoreTools()` instead of all tools
2. Track `discoveredTools` per session
3. When `search_tools` is called, add returned tools to `discoveredTools`
4. On next turn, include `getCoreTools() + discoveredTools`
5. Fallback: if mode is explicitly set (e.g., tool_assisted), load all tools

- [ ] **Step 4: Run full test suite**

Run: `cd backend && npm test`
Expected: All pass (existing tool tests still work because tool_assisted mode loads all tools as fallback)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: implement Tool Search Tool pattern — on-demand tool discovery"
```

---

### Task 18: Dynamic Retrieval Weights (Fix 18)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Read enhanced-rag.ts weight section (around line 516)**

- [ ] **Step 2: Implement dynamic weight calculation**

```typescript
function calculateDynamicWeights(
  hydeResults: RetrievalResult[],
  agenticResults: RetrievalResult[]
): { hydeWeight: number; agenticWeight: number } {
  const hydeTopScore = hydeResults[0]?.score ?? 0;
  const agenticTopScore = agenticResults[0]?.score ?? 0;
  const hydeDiversity = new Set(hydeResults.map(r => r.sourceType)).size;
  const agenticDiversity = new Set(agenticResults.map(r => r.sourceType)).size;

  // Score-based: higher top score gets more weight
  let hydeWeight = hydeTopScore / (hydeTopScore + agenticTopScore + 0.001);
  let agenticWeight = agenticTopScore / (hydeTopScore + agenticTopScore + 0.001);

  // Diversity bonus: more diverse results get 10% bonus
  if (agenticDiversity > hydeDiversity) agenticWeight += 0.1;
  if (hydeDiversity > agenticDiversity) hydeWeight += 0.1;

  // Normalize to sum to 1
  const total = hydeWeight + agenticWeight;
  return { hydeWeight: hydeWeight / total, agenticWeight: agenticWeight / total };
}
```

- [ ] **Step 3: Replace fixed weights with dynamic calculation**

- [ ] **Step 4: Write test and commit**

```bash
git commit -m "feat: dynamic RAG retrieval weights based on result quality scores"
```

---

### Task 19: Cross-Encoder Failure Tracking (Fix 19)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Find the cross-encoder fallback (around line 385)**

- [ ] **Step 2: Add metric + warning log**

```typescript
// At the fallback point:
logger.warn('Cross-encoder reranking failed, falling back to heuristic', {
  reason: error.message,
  queryLength: query.length,
  resultCount: results.length,
});
// recordMetric('rag.reranker.fallback', 1, { reason: error.message });
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: track cross-encoder fallback events with metrics and logging"
```

---

### Task 20: Content-Hash Deduplication (Fix 20)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`

- [ ] **Step 1: Find dedup section (around line 541)**

- [ ] **Step 2: Replace ID-only dedup with content hash**

```typescript
import { createHash } from 'crypto';

function dedupKey(result: RetrievalResult): string {
  const contentHash = createHash('sha256')
    .update(result.content.slice(0, 500))
    .digest('hex')
    .slice(0, 16);
  return `${result.id}_${contentHash}`;
}
```

- [ ] **Step 3: Write test and commit**

```bash
git commit -m "fix: use content hash + ID for robust retrieval deduplication"
```

---

### Task 21: Agent-Managed Memory Tools (Fix 21)

**Files:**
- Create: `backend/src/services/tool-handlers/memory-management.ts`
- Create: `backend/src/__tests__/unit/services/memory-management.test.ts`
- Modify: `backend/src/services/tool-handlers/index.ts`

**Depends on:** Task 17 (tool registry must include new tools)

- [ ] **Step 1: Write tests**

```typescript
describe('agent-managed memory tools', () => {
  describe('memory_promote', () => {
    it('promotes a fact from short-term to long-term', async () => {
      // Mock DB: fact exists in short-term
      // Call memory_promote with factId + reason
      // Verify fact moved to long-term with promoted=true
    });
  });

  describe('memory_demote', () => {
    it('reduces confidence of a fact', async () => {
      // Mock DB: fact with confidence 0.9
      // Call memory_demote with factId + reason
      // Verify confidence reduced (e.g., to 0.5)
    });
  });

  describe('memory_forget', () => {
    it('soft-deletes a fact with reason', async () => {
      // Mock DB: active fact
      // Call memory_forget with factId + reason
      // Verify fact marked as forgotten (not deleted)
    });
  });
});
```

- [ ] **Step 2: Implement memory-management.ts**

3 tool definitions + handlers. Each takes `factId` and `reason` as parameters.

- [ ] **Step 3: Register in tool-handlers/index.ts**

Add to tool definitions array and handler map.

- [ ] **Step 4: Update TOOL_LABELS in frontend (cross-reference with Wave 2)**

Note: Frontend TOOL_LABELS update happens in Wave 2 Task 44. Add a TODO comment here.

- [ ] **Step 5: Run tests and commit**

```bash
git commit -m "feat: add agent-managed memory tools (promote, demote, forget)"
```

---

### Task 22: Memory Transaction Boundaries (Fix 22)

**Files:**
- Modify: `backend/src/services/memory/sleep-compute.ts`

- [ ] **Step 1: Read sleep-compute.ts to identify consolidation stages**

- [ ] **Step 2: Wrap each stage in its own transaction with savepoint**

```typescript
async function runConsolidationStage(
  context: string,
  stageName: string,
  stageFunc: (client: PoolClient) => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  const client = await getPoolClient(context);
  try {
    await client.query('BEGIN');
    await client.query(`SAVEPOINT ${stageName}`);
    await stageFunc(client);
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${stageName}`);
    await client.query('ROLLBACK');
    logger.error(`Sleep compute stage failed: ${stageName}`, { error, context });
    return { success: false, error: (error as Error).message };
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "fix: wrap each sleep compute stage in independent transaction"
```

---

### Task 23: Retrieval Confidence Score (Fix 23)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`
- Modify: `backend/src/routes/general-chat.ts`

**Depends on:** Task 5 (HyDE timeout) + Task 18 (dynamic weights)

- [ ] **Step 1: Implement confidence calculation**

```typescript
function calculateRetrievalConfidence(results: RetrievalResult[]): number {
  if (results.length === 0) return 0;

  const topScore = results[0].score;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const scoreVariance = results.reduce((sum, r) => sum + Math.pow(r.score - avgScore, 2), 0) / results.length;
  const sourceTypes = new Set(results.map(r => r.sourceType)).size;

  // Composite: 40% top score, 30% avg score, 15% low variance bonus, 15% diversity bonus
  const varianceBonus = Math.max(0, 1 - scoreVariance * 5);
  const diversityBonus = Math.min(sourceTypes / 3, 1);

  return Math.min(1, topScore * 0.4 + avgScore * 0.3 + varianceBonus * 0.15 + diversityBonus * 0.15);
}
```

- [ ] **Step 2: Include in RAG response**

Return `{ results, retrievalConfidence, sourceCount }` from `enhancedRetrieve()`.

- [ ] **Step 3: Pass through to SSE response in general-chat.ts**

When sending the AI response via SSE, include `retrievalConfidence` in the metadata event.

- [ ] **Step 4: Write test and commit**

```bash
git commit -m "feat: calculate and expose retrieval confidence score (0.0-1.0)"
```

---

### Task 24: Self-RAG Critique (Fix 24)

**Files:**
- Modify: `backend/src/services/enhanced-rag.ts`

**Depends on:** Task 16 (contextual retrieval) and Task 23 (confidence score)

- [ ] **Step 1: Add self-critique after initial retrieval**

```typescript
async function selfCritique(
  query: string,
  results: RetrievalResult[],
  confidence: number,
  conversationContext?: string
): Promise<RetrievalResult[]> {
  if (confidence >= 0.5 || !conversationContext) return results;

  // Reformulate query with conversation context
  const reformulated = `${query} (Context: ${conversationContext.slice(0, 500)})`;
  logger.info('Self-RAG: low confidence, reformulating query', { confidence, reformulated });

  const retryResults = await enhancedRetrieveInternal(reformulated, /* skip self-critique */);

  // Merge and re-rank
  const merged = mergeResults(results, retryResults);
  return merged;
}
```

- [ ] **Step 2: Integrate after confidence calculation, max 1 retry**

- [ ] **Step 3: Write test and commit**

```bash
git commit -m "feat: self-RAG critique — reformulate and retry when confidence < 0.5"
```

---

### Task 25: Embedding Drift Detection (Fix 25)

**Files:**
- Create: `backend/src/services/embedding-drift.ts`
- Create: `backend/src/__tests__/unit/services/embedding-drift.test.ts`
- Modify: `backend/src/services/queue/job-queue.ts` (add queue)
- Modify: `backend/src/services/queue/workers.ts` (add worker)

- [ ] **Step 1: Write test**

```typescript
describe('embedding drift detection', () => {
  it('detects drift when score drops > 10%', async () => {
    // Mock baseline scores [0.85, 0.80, 0.90]
    // Mock current scores [0.70, 0.65, 0.75]
    const result = calculateDrift(baseline, current);
    expect(result.driftDetected).toBe(true);
    expect(result.driftPercentage).toBeGreaterThan(10);
  });

  it('no drift when scores are stable', async () => {
    const baseline = [0.85, 0.80, 0.90];
    const current = [0.83, 0.82, 0.88];
    const result = calculateDrift(baseline, current);
    expect(result.driftDetected).toBe(false);
  });
});
```

- [ ] **Step 2: Implement embedding-drift.ts**

- [ ] **Step 3: Add BullMQ queue and weekly cron worker**

In `job-queue.ts`, add `'embedding-drift'` queue. In `workers.ts`, add processor with cron `0 3 * * 0`.

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "feat: weekly embedding drift detection with alerting"
```

---

## Chunk 3: Frontend Architecture (Fixes 26-37)

> Worker C handles these. Fix 26 before 28. All others independent.

### Task 26: Chat State Machine (Fix 26)

**Files:**
- Modify: `frontend/src/components/GeneralChat/GeneralChat.tsx`
- Create: `frontend/src/__tests__/components/GeneralChat/chatStateMachine.test.ts`

- [ ] **Step 1: Write test for state machine**

```typescript
describe('chat state machine', () => {
  it('transitions idle → loadingSession on LOAD_SESSION', () => {
    const state = chatReducer({ status: 'idle' }, { type: 'LOAD_SESSION', sessionId: '123' });
    expect(state.status).toBe('loadingSession');
    expect(state.sessionId).toBe('123');
  });

  it('transitions loadingSession → ready on SESSION_LOADED', () => {
    const state = chatReducer(
      { status: 'loadingSession', sessionId: '123' },
      { type: 'SESSION_LOADED', messages: [] }
    );
    expect(state.status).toBe('ready');
  });

  it('transitions ready → streaming on START_STREAM', () => {
    const state = chatReducer({ status: 'ready' }, { type: 'START_STREAM' });
    expect(state.status).toBe('streaming');
  });

  it('transitions streaming → streamComplete on STREAM_COMPLETE', () => {
    const state = chatReducer({ status: 'streaming' }, { type: 'STREAM_COMPLETE' });
    expect(state.status).toBe('streamComplete');
  });

  it('transitions any → error on ERROR', () => {
    const state = chatReducer({ status: 'streaming' }, { type: 'ERROR', error: 'Network failed' });
    expect(state.status).toBe('error');
  });
});
```

- [ ] **Step 2: Implement chatReducer**

Extract state machine from GeneralChat.tsx into a `useReducer`:

```typescript
type ChatStatus = 'idle' | 'loadingSession' | 'ready' | 'streaming' | 'streamComplete' | 'error';

interface ChatState {
  status: ChatStatus;
  sessionId?: string;
  messages: ChatMessage[];
  error?: string;
  streamContent?: string;
  activeToolName?: string;
  toolResults?: Map<string, ToolResult>;
}

type ChatAction =
  | { type: 'LOAD_SESSION'; sessionId: string }
  | { type: 'SESSION_LOADED'; messages: ChatMessage[] }
  | { type: 'START_STREAM' }
  | { type: 'STREAM_CHUNK'; content: string }
  | { type: 'STREAM_COMPLETE' }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'LOAD_SESSION':
      return { ...state, status: 'loadingSession', sessionId: action.sessionId };
    case 'SESSION_LOADED':
      return { ...state, status: 'ready', messages: action.messages };
    case 'START_STREAM':
      return { ...state, status: 'streaming', streamContent: '' };
    case 'STREAM_CHUNK':
      return { ...state, streamContent: (state.streamContent ?? '') + action.content };
    case 'STREAM_COMPLETE':
      return { ...state, status: 'streamComplete', streamContent: undefined };
    case 'ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'RESET':
      return { ...state, status: 'idle', messages: [], error: undefined };
    default:
      return state;
  }
}
```

- [ ] **Step 3: Replace ref-based guards with state machine dispatches**

Remove `skipNextSessionLoadRef`, `sessionKey` hack, and similar refs. Replace with state machine transitions.

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All 664+ pass

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: replace ref-based chat state with useReducer state machine"
```

---

### Task 27: Centralized Error Handler (Fix 27)

**Files:**
- Create: `frontend/src/utils/error-handler.ts`
- Create: `frontend/src/__tests__/utils/error-handler.test.ts`

- [ ] **Step 1: Write test**

```typescript
describe('handleError', () => {
  it('classifies network errors', () => {
    const result = handleError(new TypeError('Failed to fetch'));
    expect(result.type).toBe('network');
    expect(result.userMessage).toContain('Netzwerk');
  });

  it('classifies 401 as auth error', () => {
    const result = handleError({ response: { status: 401 } });
    expect(result.type).toBe('auth');
  });

  it('classifies 500 as server error', () => {
    const result = handleError({ response: { status: 500 } });
    expect(result.type).toBe('server');
  });

  it('returns user-friendly message for unknown errors', () => {
    const result = handleError('something weird');
    expect(result.type).toBe('unknown');
    expect(result.userMessage).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement error-handler.ts**

```typescript
type ErrorType = 'network' | 'auth' | 'validation' | 'server' | 'unknown';

interface HandledError {
  type: ErrorType;
  userMessage: string;
  shouldRetry: boolean;
  originalError: unknown;
}

export function handleError(error: unknown, context?: string): HandledError {
  // Classify error
  // Log to Sentry if available
  // Return user-friendly result
}
```

- [ ] **Step 3: Apply in key hooks (useStreamingChat, useIdeas, etc.)**

Replace direct `logError()` / `showToast()` calls with `handleError()`.

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "feat: centralized error handler with classification and Sentry integration"
```

---

### Task 28: Streaming Test Coverage (Fix 28)

**Files:**
- Create: `frontend/src/__tests__/hooks/useStreamingChat.test.ts`

**Depends on:** Task 26 (state machine)

- [ ] **Step 1: Write comprehensive test suite**

Test: parseSSEChunk, tool tracking, RAF throttle, AbortController cleanup, error recovery, optimistic update rollback.

- [ ] **Step 2: Run tests and commit**

```bash
git commit -m "test: add streaming chat hook test coverage (SSE parsing, tool tracking)"
```

---

### Task 29: AbortController Race Fix (Fix 29)

**Files:**
- Modify: `frontend/src/components/GeneralChat/GeneralChat.tsx`

- [ ] **Step 1: Add AbortController per context**

```typescript
const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  // Cancel previous requests when context changes
  abortControllerRef.current?.abort();
  abortControllerRef.current = new AbortController();
  // Use abortControllerRef.current.signal for all fetch calls
}, [context]);
```

- [ ] **Step 2: Run tests and commit**

```bash
git commit -m "fix: abort pending requests on context switch to prevent race conditions"
```

---

### Task 30-37: Remaining Frontend Fixes

Each of these is a small, focused fix. Implement in order:

- [ ] **Task 30: Artifacts cleanup** — Cap artifacts Map at 100, evict oldest
- [ ] **Task 31: Tool results alignment** — Single `MAX_TOOL_RESULTS = 20` constant
- [ ] **Task 32: Navigation validation** — Validate page against Page union type
- [ ] **Task 33: ProactivePanel lazy mount** — Conditional render in AppLayout.tsx
- [ ] **Task 34: Smart scroll** — Only scroll on page change, not tab change
- [ ] **Task 35: Intelligent query retry** — Only retry on 5xx + network errors
- [ ] **Task 36: Per-domain cache timing** — Override gcTime per query domain
- [ ] **Task 37: Image upload validation** — Max 10MB, image/* only

Each follows the pattern: read file → write test → implement fix → run tests → commit.

---

## Chunk 4: Accessibility & UX (Fixes 38-50)

> Worker D handles these. Fixes 43, 44, 45 depend on Wave 1 completion.

### Task 38-42: ARIA & Accessibility Fixes

These are small, targeted fixes. Each takes 2-5 minutes:

- [ ] **Task 38:** Add `role="status" aria-live="polite"` to loading states in GeneralChat.tsx
- [ ] **Task 39:** Wrap tool results in `<ol aria-label="KI-Tool-Aktivitaeten">` in ChatMessageList.tsx
- [ ] **Task 40:** Add `aria-label` to status dots in Sidebar.tsx
- [ ] **Task 41:** Add `aria-pressed` to favorite buttons in Sidebar.tsx
- [ ] **Task 42:** Add `inert` attribute to background content when voice overlay is open

Each: read file → add ARIA attribute → run `npx vitest run` → commit.

---

### Task 43: Confidence Indicators (Fix 43)

**Files:**
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- Modify: `frontend/src/components/GeneralChat.css`

**Depends on:** Wave 1 Task 23 (backend provides `retrievalConfidence`)

- [ ] **Step 1: Add ConfidenceBadge component**

```tsx
function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence == null) return null;
  const level = confidence > 0.8 ? 'high' : confidence > 0.5 ? 'medium' : 'low';
  const colors = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };
  return (
    <span
      className={`confidence-badge confidence-${level}`}
      title={`Konfidenz: ${Math.round(confidence * 100)}%`}
      aria-label={`Retrieval-Konfidenz: ${Math.round(confidence * 100)}%`}
    >
      <span className="confidence-dot" style={{ backgroundColor: colors[level] }} />
    </span>
  );
}
```

- [ ] **Step 2: Add CSS**

```css
.confidence-badge { display: inline-flex; align-items: center; margin-left: 8px; cursor: help; }
.confidence-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
```

- [ ] **Step 3: Render next to AI message header when retrievalConfidence is present**

- [ ] **Step 4: Run tests and commit**

```bash
git commit -m "feat: show retrieval confidence indicators on AI responses"
```

---

### Task 44: Reasoning Transparency Labels (Fix 44)

**Files:**
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx`

- [ ] **Step 1: Enhance TOOL_LABELS map**

Update from technical names to descriptive German labels:

```typescript
const TOOL_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  search_tools: { label: 'Tool-Suche', icon: '🔎', description: 'Sucht passende Werkzeuge...' },
  remember: { label: 'Merken', icon: '💾', description: 'Speichert Information im Gedaechtnis...' },
  recall: { label: 'Erinnern', icon: '🧠', description: 'Durchsucht Erinnerungen...' },
  memory_promote: { label: 'Wissen foerdern', icon: '⬆️', description: 'Stuft Wissen als wichtig ein...' },
  memory_demote: { label: 'Wissen abstufen', icon: '⬇️', description: 'Reduziert Wichtigkeit...' },
  memory_forget: { label: 'Vergessen', icon: '🗑️', description: 'Markiert als veraltet...' },
  web_search: { label: 'Web-Suche', icon: '🌐', description: 'Sucht im Web nach aktuellen Infos...' },
  // ... all 52 tools
};
```

- [ ] **Step 2: Handle unknown tools gracefully (for Tool Search dynamic discovery)**

```typescript
function getToolLabel(toolName: string): { label: string; description: string } {
  return TOOL_LABELS[toolName] ?? { label: toolName, description: `Fuehrt ${toolName} aus...` };
}
```

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "feat: enhanced tool labels with descriptive German reasoning transparency"
```

---

### Task 45: Source Citations (Fix 45)

**Files:**
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- Modify: `frontend/src/components/GeneralChat.css`

**Depends on:** Wave 1 Task 23 (backend provides `sources` array)

- [ ] **Step 1: Add SourceCitations component**

```tsx
interface Source { id: string; title: string; snippet: string; score: number; type: string }

function SourceCitations({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className="source-citations">
      <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        {sources.length} Quelle{sources.length > 1 ? 'n' : ''} {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <ol className="source-list">
          {sources.map((s, i) => (
            <li key={s.id}>
              <strong>[{i + 1}]</strong> {s.title}
              <span className="source-snippet">{s.snippet}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render below AI messages when sources are present**

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "feat: expandable source citations on RAG-sourced AI responses"
```

---

### Task 46: Skeleton Loading Consistency (Fix 46)

**Files:**
- Modify: Various page components

- [ ] **Step 1: Create unified skeleton patterns**

```tsx
// In design-system or shared components:
export const ChatSkeleton = () => (/* 3 message bubble skeletons */);
export const DashboardSkeleton = () => (/* 4 stat cards + 2 chart areas */);
export const ListSkeleton = () => (/* 5 row skeletons */);
```

- [ ] **Step 2: Apply to all pages using React.lazy + Suspense**

- [ ] **Step 3: Run tests and commit**

```bash
git commit -m "fix: consistent skeleton loading patterns across all pages"
```

---

### Task 47-50: Accessibility Audit Phase (Fixes 47-50)

- [ ] **Step 1: Run dark mode hardcoded color audit**

Run: `grep -rn 'color:.*#\|background:.*#\|border:.*#' frontend/src/ --include='*.css' --include='*.tsx' | grep -v 'var(--' | grep -v node_modules`

- [ ] **Step 2: Fix all hardcoded colors with design tokens**

- [ ] **Step 3: Run keyboard navigation test on key components**

Test CommandPalette, Sidebar, KanbanBoard, Modal, Tabs with keyboard only.

- [ ] **Step 4: Fix any navigation gaps**

- [ ] **Step 5: Audit touch targets on mobile viewport (375px)**

- [ ] **Step 6: Fix targets below 44px**

- [ ] **Step 7: Commit all a11y fixes**

```bash
git commit -m "fix: accessibility audit — keyboard nav, color contrast, touch targets"
```

---

## Post-Implementation: Review Round

After all 4 workers complete:

- [ ] **Run full backend tests:** `cd backend && npm test`
- [ ] **Run full frontend tests:** `cd frontend && npx vitest run`
- [ ] **Build both:** `cd backend && npm run build && cd ../frontend && npm run build`
- [ ] **Verify `as any` count is 0:** `grep -rn 'as any' backend/src/ --include='*.ts' | grep -v node_modules | grep -v __tests__ | wc -l`
- [ ] **Update CLAUDE.md:** Phase 99, test counts, changelog, tool count (49 → 52)
- [ ] **Final commit:** `git commit -m "docs: Phase 99 — Deep Quality Evolution complete"`
