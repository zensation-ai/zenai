# Phase 119: Deep Quality Audit — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring ZenAI to 100% code quality across tests, types, error handling, architecture, bundle size, and database.

**Architecture:** 6 parallel workers on non-overlapping file sets. Each worker produces an independent commit. After all complete, a final verification pass runs full test suite + build.

**Tech Stack:** TypeScript, React, Vitest, Jest, Vite, PostgreSQL, Express

**Spec:** `docs/superpowers/specs/2026-03-21-phase119-quality-audit-design.md`

---

## Chunk 1: Worker 1 — Test Stability

### Task 1.1: Fix 6 failing InboxSmartPage tests (React dual-instance)

**Files:**
- Modify: `frontend/vitest.config.ts`
- Test: `frontend/src/components/EmailPage/__tests__/InboxSmartPage.test.tsx`

**Root cause:** `@tanstack/react-query` resolves to root `node_modules/react` while test rendering uses `frontend/node_modules/react`. Two React instances → `useEffect` is null in QueryClientProvider.

- [ ] **Step 1: Add React resolve alias to vitest config**

In `frontend/vitest.config.ts`, add resolve aliases inside the `test` config or at the top level:

```typescript
import path from 'path';

// Inside defineConfig:
resolve: {
  alias: {
    react: path.resolve(__dirname, 'node_modules/react'),
    'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
  }
}
```

If a `resolve.alias` block already exists (for `@`), merge into it.

- [ ] **Step 2: Run the failing tests to verify fix**

Run: `cd frontend && npx vitest run src/components/EmailPage/__tests__/InboxSmartPage.test.tsx`
Expected: 6/6 PASS

- [ ] **Step 3: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (0 failures)

### Task 1.2: Resolve backend Jest force-exit warning

**Files:**
- Modify: `backend/jest.config.js`
- Potentially modify: test files with leaked timers

- [ ] **Step 4: Identify leaked handles**

Run: `cd backend && npx jest --detectOpenHandles --forceExit 2>&1 | grep -A5 "has been detected"`
Note which test files leak handles (likely health check intervals or rate limit timers).

- [ ] **Step 5: Add cleanup to leaking test files**

For each identified test file, add proper teardown:

```typescript
afterAll(async () => {
  // Clear any intervals/timeouts
  jest.clearAllTimers();
  // Close any open connections
  // await pool.end(); // if DB pool is open
});
```

- [ ] **Step 6: Remove forceExit from jest.config.js**

In `backend/jest.config.js`, change:
```javascript
// BEFORE:
forceExit: true,

// AFTER:
// forceExit removed — all handles properly cleaned up
```

- [ ] **Step 7: Verify clean exit**

Run: `cd backend && npm test 2>&1 | tail -10`
Expected: Tests pass without "worker process has failed to exit gracefully" warning.

If tests hang (>60s after completion), re-add `forceExit: true` and document which handles couldn't be cleaned. This is acceptable — the goal is to try, not to block on it.

### Task 1.3: Update test count documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 8: Record actual test counts**

Run both test suites and note exact counts:
```bash
cd backend && npm test 2>&1 | tail -5
cd frontend && npx vitest run 2>&1 | tail -5
```

- [ ] **Step 9: Update CLAUDE.md test table**

Update the "Test-Status" table in CLAUDE.md with actual counts from Step 8.

- [ ] **Step 10: Commit Worker 1**

```bash
git add frontend/vitest.config.ts backend/jest.config.js CLAUDE.md
# + any modified test files from Step 5
git commit -m "fix(phase119): stabilize test suite — fix React dual-instance, clean Jest handles

- Fix 6 InboxSmartPage test failures via React resolve alias
- Address Jest force-exit warning with proper handle cleanup
- Update test counts in documentation"
```

---

## Chunk 2: Worker 2 — Type Safety

### Task 2.1: Fix 3 fixable `as any` casts

**Files:**
- Modify: `backend/src/middleware/input-screening.ts:153`
- Modify: `backend/src/services/agent-orchestrator.ts:524`
- Modify: `frontend/src/components/IdeasPage/FilterChipBar.tsx:16`
- Create: `backend/src/types/express-augmentation.d.ts`

- [ ] **Step 1: Create Express type augmentation**

Create `backend/src/types/express-augmentation.d.ts`:

```typescript
import 'express';

interface InjectionScreeningResult {
  score: number;
  flagged: boolean;
  patterns: string[];
}

declare module 'express' {
  interface Request {
    injectionScreening?: InjectionScreeningResult;
  }
}
```

Then in `backend/src/middleware/input-screening.ts:153`, change:
```typescript
// BEFORE:
(req as any).injectionScreening = { ... };

// AFTER:
req.injectionScreening = { ... };
```

- [ ] **Step 2: Fix agent-orchestrator personaPrompt cast**

In `backend/src/services/agent-orchestrator.ts:524`, find the BaseAgent config type and add `personaPrompt`:

First check `backend/src/services/agents/base-agent.ts` for the config interface, then add `personaPrompt?: string` to it. Then change:
```typescript
// BEFORE:
(agent as any).config.personaPrompt = personaPrompt;

// AFTER:
agent.config.personaPrompt = personaPrompt;
```

- [ ] **Step 3: Fix FilterChipBar value cast**

In `frontend/src/components/IdeasPage/FilterChipBar.tsx:16`, narrow the type:
```typescript
// BEFORE:
chip.value as any

// AFTER:
chip.value as string  // or use proper generic typing if FilterChipDef supports it
```

- [ ] **Step 4: Add justification comments to 4 library-induced casts**

For each of these, add a `// @ts-expect-error` or keep `as any` with a comment:

1. `backend/src/middleware/security-headers.ts:131` — add: `// Helmet v7 CSP directives type is overly strict for dynamic construction`
2. `backend/src/services/security/rate-limit-advanced.ts:97` — add: `// Dynamic import erases module type information`
3. `backend/src/services/resend.ts:97` — add: `// Resend SDK CreateEmailOptions type doesn't match optional attachments pattern`
4. `frontend/src/components/business/RevenueDashboard.tsx:112` — add: `// Recharts Tooltip formatter type signature mismatch`

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: 0 errors on both

- [ ] **Step 6: Run tests**

Run: `cd backend && npm test && cd ../frontend && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit Worker 2**

```bash
git add backend/src/types/express-augmentation.d.ts \
  backend/src/middleware/input-screening.ts \
  backend/src/middleware/security-headers.ts \
  backend/src/services/agent-orchestrator.ts \
  backend/src/services/security/rate-limit-advanced.ts \
  backend/src/services/resend.ts \
  frontend/src/components/IdeasPage/FilterChipBar.tsx \
  frontend/src/components/business/RevenueDashboard.tsx
git commit -m "refactor(phase119): eliminate as-any casts — 3 fixed, 4 documented

- Create Express type augmentation for injectionScreening
- Add personaPrompt to BaseAgent config interface
- Narrow FilterChipBar value type
- Document 4 library-induced casts with justification comments"
```

**Note on scope:** The initial estimate of "71 files with `as any`" included test files. Detailed research confirmed only **7 `as any` occurrences in production code** (5 backend, 2 frontend). All 7 are addressed above (3 fixed, 4 documented). The spec's success metric of "max 15" is already met.

**`noUncheckedIndexedAccess`:** Check `backend/tsconfig.json` and `frontend/tsconfig.json` for this setting. If not present, do NOT add it — it would cause hundreds of new errors across the codebase and is out of scope for this audit. Document as a future improvement.

---

## Chunk 3: Worker 3 — Error Handling

### Task 3.1: Audit and fix ~77 silent catch blocks

**Files:**
- Multiple files across `backend/src/routes/` and `backend/src/services/`
- Key focus: `routes/auth.ts` (7 catches), `routes/extensions.ts` (4), `utils/database-context.ts` (6), `utils/ollama.ts` (8)

**Definition of "silent catch":** A catch block that neither (a) logs via `logger`, (b) re-throws, nor (c) returns a documented fallback value with a comment.

- [ ] **Step 1: Generate audit list**

Run: `cd backend && node -e "
const { execSync } = require('child_process');
const result = execSync('grep -rn \"catch\" src/ --include=\"*.ts\" | grep -v __tests__ | grep -v test | grep -v node_modules', { encoding: 'utf8' });
console.log('Total catch blocks:', result.split('\\n').filter(Boolean).length);
"`

- [ ] **Step 2: Fix silent catches in auth routes**

In `backend/src/routes/auth.ts`, for each of the 7 silent catch blocks, add `logger.error` or `logger.warn`:

Pattern to apply:
```typescript
// BEFORE:
catch (error) {
  res.status(500).json({ success: false, error: 'Internal error' });
}

// AFTER:
catch (error) {
  logger.error('Auth operation failed', { error, operation: 'login' });
  res.status(500).json({ success: false, error: 'Internal error' });
}
```

- [ ] **Step 3: Fix silent catches in extensions, database-context, ollama**

Apply same pattern: add `logger.warn` or `logger.error` before every return/response in catch blocks that currently have no logging.

For intentional fire-and-forget patterns (25 instances), add a comment:
```typescript
// Fire-and-forget: cache write failure is non-critical
.catch(() => {});

// Better:
.catch((err) => logger.debug('Non-critical cache write failed', { error: err }));
```

- [ ] **Step 3b: Fix remaining silent catches across all route/service files**

Systematically process all files identified in Step 1. For each file with silent catches:
1. Open the file, search for `catch`
2. For each catch block: does it log, re-throw, or return a documented fallback?
3. If not: add `logger.error` or `logger.warn` with context (operation name, relevant IDs)

Priority order: routes first (user-facing), then services, then utils.

- [ ] **Step 4: Verify AppError usage consistency**

Check that `errorHandler.ts` properly uses `AppError` hierarchy. Run:
`cd backend && grep -rn "new AppError\|new ValidationError\|new NotFoundError" src/ --include="*.ts" | grep -v __tests__ | wc -l`

Verify the error handler catches these and formats them correctly. No code changes needed unless inconsistencies found.

- [ ] **Step 5: Verify Sentry integration in errorHandler**

Read `backend/src/middleware/errorHandler.ts` and confirm:
- Non-operational errors call `captureException(error)`
- Sentry is imported and used correctly
- No silent swallows in the error handler itself

- [ ] **Step 6: Verify no empty catch blocks remain**

Run: `cd backend && grep -Pn "catch\s*\([^)]*\)\s*\{\s*\}" src/ -r --include="*.ts" | grep -v __tests__ | grep -v test`
Expected: 0 results (no completely empty catch blocks)

- [ ] **Step 7: Run tests**

Run: `cd backend && npm test`
Expected: All pass

- [ ] **Step 8: Commit Worker 3**

```bash
git add -A backend/src/routes/ backend/src/services/ backend/src/utils/
git commit -m "refactor(phase119): eliminate silent error swallowing — 77 catch blocks audited

- Add structured logging to all silent catch blocks
- Convert fire-and-forget .catch(() => {}) to logger.debug
- Standardize error handling in auth, extensions, database, ollama routes
- Verify AppError hierarchy and Sentry integration"
```

---

## Chunk 4: Worker 4 — Architecture (File Decomposition)

**Note:** `mcp-server.ts` was initially estimated at 1,823 LOC but research confirmed it's only **577 LOC** — well under the 1,000 threshold. No split needed. 7 files remain to split.

### Task 4.1: Split long-term-memory.ts (1,722 LOC)

**Files:**
- Modify: `backend/src/services/memory/long-term-memory.ts`
- Create: `backend/src/services/memory/ltm-utils.ts`
- Create: `backend/src/services/memory/ltm-consolidation.ts`
- Create: `backend/src/services/memory/ltm-neuroscience.ts`

- [ ] **Step 1: Extract utility functions**

Create `backend/src/services/memory/ltm-utils.ts` with:
- `detectNegation(text)` — find by searching for `export function detectNegation`
- `stripNegation(text)` — find by searching for `export function stripNegation`
- `computeStringSimilarity(a, b)` — find by searching for `export function computeStringSimilarity`
- All related types (`NegationResult`)

Note: Line numbers are approximate and may have shifted. Always search by function name.

Update `long-term-memory.ts` to import from `./ltm-utils`.

- [ ] **Step 2: Extract consolidation logic**

Create `backend/src/services/memory/ltm-consolidation.ts` with:
- `consolidate()` method logic (lines ~649-1010)
- Helper methods: `getRecentSessions()`, `extractPatterns()`, `extractFacts()`, `mergePatterns()`, `mergeFacts()`, `persistFact()`, `storeSignificantInteractions()`, `updateProfileEmbedding()`

The main class calls these via composition: `import { consolidateMemory } from './ltm-consolidation'`.

- [ ] **Step 3: Extract neuroscience helpers**

Create `backend/src/services/memory/ltm-neuroscience.ts` with:
- `decayRateToStability()` (lines ~1613-1640)
- `updateFactStability()` (lines ~1640-1670)
- `tagFactWithEmotion()` (lines ~1670-1700)
- `storeEncodingContext()` (lines ~1700-1716)
- `applyContextBoost()` helper

- [ ] **Step 4: Verify facade re-exports**

Ensure `long-term-memory.ts` re-exports everything from the new files so that the 11 dependent files don't need changes:

```typescript
// At top of long-term-memory.ts:
export { detectNegation, stripNegation, computeStringSimilarity } from './ltm-utils';
```

- [ ] **Step 5: Run tests to verify split**

Run: `cd backend && npm test -- --testPathPattern="memory"`
Expected: All memory-related tests pass. If any fail, fix before proceeding.

### Task 4.2: Split tool-use.ts (1,689 LOC)

**Files:**
- Modify: `backend/src/services/claude/tool-use.ts`
- Create: `backend/src/services/claude/tool-definitions.ts`
- Create: `backend/src/services/claude/tool-execution.ts`

- [ ] **Step 6: Extract tool definitions**

Create `backend/src/services/claude/tool-definitions.ts` with:
- All 55+ `TOOL_*` constants (lines 120-1382)
- All tool-related types that are only used by definitions

- [ ] **Step 7: Extract execution functions**

Create `backend/src/services/claude/tool-execution.ts` with:
- `executeWithTools()` (lines ~1452-1600)
- `callWithTools()` (lines ~1600-1640)
- `forceToolCall()` (lines ~1640-1670)
- `parseToolCalls()`, `hasToolUse()`, `extractText()` (lines ~1670-1690)

- [ ] **Step 8: Keep registry + re-exports in tool-use.ts**

`tool-use.ts` becomes the facade:
```typescript
// Re-export everything for backward compatibility
export * from './tool-definitions';
export * from './tool-execution';
// ToolRegistry class stays here (small, ~70 lines)
export { toolRegistry };
```

- [ ] **Step 9: Run tests to verify split**

Run: `cd backend && npm test -- --testPathPattern="tool"`
Expected: All tool-related tests pass. If any fail, fix before proceeding.

### Task 4.3: Split agent-orchestrator.ts (1,467 LOC)

**Files:**
- Modify: `backend/src/services/agent-orchestrator.ts`
- Create: `backend/src/services/agents/strategy-classifier.ts`
- Create: `backend/src/services/agents/agent-graph-executor.ts`

- [ ] **Step 10: Extract strategy classification + templates**

Create `backend/src/services/agents/strategy-classifier.ts` with:
- `AGENT_TEMPLATES` array (lines ~120-250)
- `classifyTeamStrategy()` (lines ~250-350)
- `getAgentPipeline()` (lines ~350-450)

- [ ] **Step 11: Extract graph execution**

Create `backend/src/services/agents/agent-graph-executor.ts` with:
- `buildGraphForStrategy()` (lines ~800-1100)
- `executeWithGraph()` (lines ~1100-1320)

- [ ] **Step 12: Facade in agent-orchestrator.ts**

```typescript
export { AGENT_TEMPLATES, classifyTeamStrategy, getAgentPipeline } from './agents/strategy-classifier';
// Keep: createAgent, createAgentWithIdentity, executeTeamTask, executeTeamTaskStreaming
// These stay because they're the core orchestration logic
```

- [ ] **Step 12b: Run tests to verify agent splits**

Run: `cd backend && npm test -- --testPathPattern="agent|orchestrator"`
Expected: All agent-related tests pass. If any fail, fix before proceeding.

### Task 4.4: Split ideas.ts route (1,358 LOC)

**Files:**
- Modify: `backend/src/routes/ideas.ts`
- Create: `backend/src/routes/ideas-handlers.ts`

- [ ] **Step 13: Extract shared handler functions**

Create `backend/src/routes/ideas-handlers.ts` with:
- `handleTriageGet()`, `handleTriagePost()`, `handleListIdeas()`, `handleArchivedList()`
- `handleDeleteIdea()`, `handleArchiveIdea()`, `handleRestoreIdea()`
- `getContext()`, `validateUUID()` utilities
- Column constants

`ideas.ts` keeps the router definitions (thin: just `router.get('/path', asyncHandler(handler))`).

### Task 4.5: Split GeneralChat.tsx (1,138 LOC)

**Files:**
- Modify: `frontend/src/components/GeneralChat/GeneralChat.tsx`
- Create: `frontend/src/components/GeneralChat/useMarkdownRenderer.ts`
- Create: `frontend/src/components/GeneralChat/useArtifactProcessor.ts`

- [ ] **Step 14: Extract markdown renderer**

Create `frontend/src/components/GeneralChat/useMarkdownRenderer.ts` with:
- `renderContent()`, `renderBlockFormatting()`, `renderInline()` (lines ~730-983)
- Export as a custom hook or utility functions

- [ ] **Step 15: Extract artifact processor**

Create `frontend/src/components/GeneralChat/useArtifactProcessor.ts` with:
- `getMessageArtifacts()` with LRU cache (lines ~600-728)

### Task 4.6: Split ProceduralMemoryPanel.tsx (1,065 LOC)

**Files:**
- Modify: `frontend/src/components/ProceduralMemoryPanel.tsx`
- Create: `frontend/src/components/ProceduralMemory/ProcedureListTab.tsx`
- Create: `frontend/src/components/ProceduralMemory/RecallTab.tsx`
- Create: `frontend/src/components/ProceduralMemory/SearchTab.tsx`

- [ ] **Step 16: Extract 3 tab components**

Each tab (~250-350 LOC) becomes its own component. Parent becomes thin tab router.

### Task 4.7: Split SystemAdminPage.tsx (1,046 LOC)

**Files:**
- Modify: `frontend/src/components/SystemAdminPage.tsx`
- Create: `frontend/src/components/SystemAdmin/OverviewTab.tsx`
- Create: `frontend/src/components/SystemAdmin/QueuesTab.tsx`
- Create: `frontend/src/components/SystemAdmin/SecurityTab.tsx`
- Create: `frontend/src/components/SystemAdmin/SleepTab.tsx`

- [ ] **Step 17: Extract 4 tab components**

Each tab (~150-200 LOC) becomes its own component.

- [ ] **Step 18: Run full test suite**

Run: `cd backend && npm test && cd ../frontend && npx vitest run`
Expected: All pass

- [ ] **Step 19: Verify no file >1000 LOC**

Run: `cd backend && find src -name "*.ts" | xargs wc -l | sort -rn | head -5`
Run: `cd frontend && find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -5`
Expected: No file exceeds 1,000 lines

- [ ] **Step 20: Commit Worker 4**

```bash
git add -A backend/src/services/ backend/src/routes/ frontend/src/components/
git commit -m "refactor(phase119): decompose 7 files >1000 LOC into focused modules

- Split long-term-memory.ts → ltm-utils + ltm-consolidation + ltm-neuroscience
- Split tool-use.ts → tool-definitions + tool-execution
- Split agent-orchestrator.ts → strategy-classifier + agent-graph-executor
- Split ideas.ts → ideas-handlers + ideas (routes only)
- Split GeneralChat.tsx → useMarkdownRenderer + useArtifactProcessor
- Split ProceduralMemoryPanel.tsx → 3 tab components
- Split SystemAdminPage.tsx → 4 tab components
- All re-exports maintain backward compatibility"
```

---

## Chunk 5: Worker 5 — Bundle & Frontend Polish

### Task 5.1: Optimize bundle chunks

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/services/sentry.ts` (potentially)

- [ ] **Step 1: Split contacts feature chunk**

In `frontend/vite.config.ts`, the `feature-contacts` chunk (185kB) likely bundles too many components. Split into `feature-contacts` (list/detail) and `feature-contacts-crm` (organization, timeline).

Check the manualChunks function and add a more granular split if the contacts chunk includes CRM-heavy components.

- [ ] **Step 2: Optimize Sentry chunk**

In vite.config.ts manualChunks, check if `@sentry/react` includes replay/profiling modules. If `Sentry.replayIntegration()` or `Sentry.browserProfilingIntegration()` are imported but could be made optional:

```typescript
// In sentry.ts, lazy-load replay:
const { replayIntegration } = await import('@sentry/react');
```

**Target deviation:** The spec targets 0 chunks >250kB. Sentry at 251kB (80kB gzip) may not be reducible without removing integrations. If tree-shaking doesn't bring it under 250kB, accept and document the deviation — 80kB gzip is reasonable for full error tracking.

- [ ] **Step 3: Analyze index chunk**

Run: `cd frontend && npx vite-bundle-visualizer` (or check build output)
If index chunk (257kB) contains components that should be lazy-loaded, move them to manualChunks.

- [ ] **Step 4: Build and verify**

Run: `cd frontend && npm run build 2>&1 | grep "kB"`
Target: Reduce chunks >250kB. Accept if gzip size is reasonable (<100kB gzip each).

### Task 5.2: Audit eslint-disable directives

**Files:**
- 25+ files with eslint-disable comments

- [ ] **Step 5: Review react-hooks/exhaustive-deps (18 occurrences)**

For each: check if the dependency array is actually correct. Common patterns:
- Intentional omission (stable refs, dispatch functions) → keep with comment
- Actual missing dependency → add to array and remove eslint-disable
- Hook that should use useCallback → refactor

- [ ] **Step 6: Review @typescript-eslint/no-explicit-any (4 occurrences)**

These are in files NOT touched by Worker 2 (Worker 2 handles the 7 production `as any` files; these eslint-disables are in separate files). For each: either fix the underlying `any` usage or keep with justification comment.

- [ ] **Step 7: Remove unnecessary eslint-disables**

Any directive that's no longer needed (e.g., the underlying issue was fixed in a later phase) → remove.

### Task 5.3: Resolve TODOs and console.log

**Files:**
- Modify: `frontend/src/components/EmailPage/InboxSmartPage.tsx`
- Check: `frontend/src/utils/webVitals.ts`, `frontend/src/api/codeExecution.ts`

- [ ] **Step 8: Implement or document 2 TODOs**

In `InboxSmartPage.tsx:110,116`:
```typescript
// TODO: implement batch archive mutation
// TODO: implement batch delete mutation
```

Either implement (if the backend endpoint exists) or convert to explicit comments:
```typescript
// Batch archive not yet implemented — requires POST /api/:context/emails/batch endpoint
```

- [ ] **Step 9: Review 3 frontend console.log files**

Note: `drop_console: true` in terser strips these in production. But for code hygiene:
- `utils/webVitals.ts` — likely performance logging, keep or replace with Sentry breadcrumb
- `utils/logger.ts` — the logger itself, keep (it IS the console wrapper)
- `api/codeExecution.ts` — check if debug logging, remove or wrap in `if (import.meta.env.DEV)`

- [ ] **Step 10: Build and verify**

Run: `cd frontend && npm run build`
Expected: Clean build, reduced chunk warnings

- [ ] **Step 11: Commit Worker 5**

```bash
git add frontend/vite.config.ts frontend/src/
git commit -m "refactor(phase119): optimize bundle and clean frontend code hygiene

- Optimize chunk splitting for contacts and sentry
- Audit 33 eslint-disable directives, remove unnecessary ones
- Resolve 2 TODOs in InboxSmartPage
- Clean console.log usage in non-logger files"
```

---

## Chunk 6: Worker 6 — Database & Migrations + Final Verification

### Task 6.1: Consolidate migrations

**Files:**
- Create: `backend/sql/migrations/phase119_consolidated_baseline.sql`
- Create: `backend/sql/migrations/archive/` (move 104 files)
- Create: `backend/sql/migrations/README.md`

- [ ] **Step 1: Verify no migration runner exists**

Run: `cd backend && grep -r "knex\|drizzle\|prisma\|typeorm\|migration.*run\|runMigrations" src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules`
Expected: No automated migration runner found. All migrations are manual via Supabase SQL Editor.

- [ ] **Step 2: Generate current schema state**

Connect to Supabase and dump current schema for all 4 contexts:
```sql
-- Run in Supabase SQL Editor:
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname IN ('personal', 'work', 'learning', 'creative', 'public')
ORDER BY schemaname, tablename;
```

Use this to create the baseline migration.

- [ ] **Step 3: Create baseline migration file**

Create `backend/sql/migrations/phase119_consolidated_baseline.sql` with:
- Header comment explaining this is a consolidated baseline
- `CREATE SCHEMA IF NOT EXISTS` for all 4 schemas
- All `CREATE TABLE IF NOT EXISTS` statements
- All indexes
- All constraints

This file is for documentation/new-environment setup only — not meant to be run on existing databases.

- [ ] **Step 4: Archive old migrations**

```bash
mkdir -p backend/sql/migrations/archive
mv backend/sql/migrations/*.sql backend/sql/migrations/archive/
mv backend/sql/migrations/archive/phase119_consolidated_baseline.sql backend/sql/migrations/
```

- [ ] **Step 4b: Validate baseline SQL syntax**

Run: `cd backend && psql -f sql/migrations/phase119_consolidated_baseline.sql --set ON_ERROR_STOP=on -h localhost -p 5432 -U postgres -d test_validation 2>&1 | tail -10`

If no local PostgreSQL available, at minimum do a syntax check by reading through the file for common SQL errors (missing semicolons, unmatched parentheses, wrong column types). The file is for documentation/new setup — it doesn't need to be perfect, but should be syntactically valid.

- [ ] **Step 5: Create README**

Create `backend/sql/migrations/README.md`:
```markdown
# SQL Migrations

## Current Baseline
- `phase119_consolidated_baseline.sql` — Full schema state as of Phase 119 (2026-03-21)

## Archive
The `archive/` directory contains all 104 historical migrations from Phases 1-118.
These are preserved for reference but should not be re-run.

## How to Apply
Migrations are applied manually via Supabase SQL Editor.
There is no automated migration runner.
```

### Task 6.2: Index audit

- [ ] **Step 6b: Identify existing indexes**

Run in Supabase SQL Editor:
```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname IN ('personal', 'work', 'learning', 'creative')
ORDER BY schemaname, tablename, indexname;
```

- [ ] **Step 6c: Cross-reference with common query patterns**

Check backend route/service files for frequent WHERE clauses. Key patterns to verify have indexes:
- `WHERE user_id = $1` (on all main tables)
- `WHERE context = $1 AND status = $2` (ideas, tasks, emails)
- `WHERE created_at > $1` (for time-range queries)
- Vector similarity indexes (HNSW on embedding columns)

If missing indexes are found, create them in a separate migration file `phase119_index_additions.sql`.

- [ ] **Step 6d: Identify potentially unused indexes**

Look for indexes on columns that are never queried in WHERE/JOIN/ORDER BY clauses. Do NOT drop them — just document as candidates for future cleanup.

### Task 6.3: Verify schema parity

- [ ] **Step 6: Check all 4 schemas have identical tables**

```sql
-- Run in Supabase SQL Editor:
SELECT
  p.tablename as personal_table,
  w.tablename as work_table,
  l.tablename as learning_table,
  c.tablename as creative_table
FROM
  (SELECT tablename FROM pg_tables WHERE schemaname = 'personal') p
FULL OUTER JOIN
  (SELECT tablename FROM pg_tables WHERE schemaname = 'work') w ON p.tablename = w.tablename
FULL OUTER JOIN
  (SELECT tablename FROM pg_tables WHERE schemaname = 'learning') l ON p.tablename = l.tablename
FULL OUTER JOIN
  (SELECT tablename FROM pg_tables WHERE schemaname = 'creative') c ON p.tablename = c.tablename
WHERE p.tablename IS NULL OR w.tablename IS NULL OR l.tablename IS NULL OR c.tablename IS NULL;
```

Expected: 0 rows (all schemas have identical table sets)

### Task 6.3: Pool health check

- [ ] **Step 7: Verify pool config is optimal**

Read `backend/src/utils/database-context.ts` and confirm:
- `max=8, min=2` for Supabase Transaction Mode Pooler (port 6543)
- `idleTimeoutMillis=60000`, `connectionTimeoutMillis=5000`
- Pool monitoring with event listeners (already added in Phase 67)

This is already well-configured. Document current state — no changes needed.

- [ ] **Step 8: Commit Worker 6**

```bash
git add backend/sql/migrations/
git commit -m "chore(phase119): consolidate 104 SQL migrations into baseline

- Create phase119_consolidated_baseline.sql with full schema state
- Archive 104 historical migrations for reference
- Add migrations README with usage instructions
- Verify schema parity across all 4 contexts"
```

---

## Chunk 7: Final Verification & Documentation

### Task 7.1: Full verification pass

- [ ] **Step 1: Run complete backend tests**

Run: `cd backend && npm test`
Expected: All pass, 0 failures

- [ ] **Step 2: Run complete frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass, 0 failures

- [ ] **Step 3: TypeScript compilation**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: 0 errors on both

- [ ] **Step 4: Frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 5: Verify success metrics**

| Metric | Target | Command |
|--------|--------|---------|
| Failed tests | 0 | `npm test` on both sides |
| `as any` (prod) | ≤7 | `grep -r "as any" src/ --include="*.ts" \| grep -v __tests__` |
| Files >1000 LOC | 0 | `find src -name "*.ts" \| xargs wc -l \| sort -rn \| head -5` |
| Empty catch blocks | 0 | `grep -Pn "catch.*\{\s*\}" src/ -r` |
| console.log (backend runtime) | 0 | `grep -rln "console.log" src/ \| grep -v __tests__ \| grep -v scripts \| grep -v logger \| grep -v mcp-server` |

### Task 7.2: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 6: Add Phase 119 changelog entry**

Add to CLAUDE.md changelog:

```markdown
### 2026-03-21: Phase 119 — Deep Quality Audit (6 Parallel Workers)

**Umfassendes Quality-Upgrade: Tests, Types, Error Handling, Architektur, Bundle, Datenbank.**

| Worker | Scope | Ergebnis |
|--------|-------|----------|
| **W1: Test Stability** | 6 Frontend-Test-Failures, Jest force-exit | React dual-instance fix, Handle cleanup |
| **W2: Type Safety** | 7 `as any` Casts (3 fixed, 4 documented) | Express type augmentation, BaseAgent typing |
| **W3: Error Handling** | 77 silent catch blocks | Structured logging, fire-and-forget documentation |
| **W4: Architecture** | 7 Dateien >1000 LOC | 15+ neue fokussierte Module, Facade re-exports |
| **W5: Bundle & Polish** | 4 Chunks >250kB, 33 eslint-disables | Chunk optimization, directive audit |
| **W6: Database** | 104 Migrationen | Konsolidierte Baseline, Schema-Parität verifiziert |
```

- [ ] **Step 7: Update phase number**

Change "Current Phase: 118" to "Current Phase: 119" in CLAUDE.md.

- [ ] **Step 8: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs(phase119): update documentation with quality audit results

- Add Phase 119 changelog entry
- Update test counts
- Bump phase number to 119"
```
