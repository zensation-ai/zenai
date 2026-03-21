# Phase 119: Deep Quality Audit — Design Specification

**Date:** 2026-03-21
**Author:** Alexander Bering + Claude
**Status:** Approved
**Scope:** Full-stack quality audit bringing ZenAI to 100% code quality

## Context

ZenAI has grown to ~355,000 LOC across 118 phases. While the codebase compiles cleanly (0 TS errors) and has strong test coverage (6,400+ tests), technical debt has accumulated in several areas that need to be addressed before the next feature push.

### Current Health (2026-03-21)

| Metric | Backend | Frontend |
|--------|---------|----------|
| TypeScript | 0 errors | 0 errors |
| Tests | 5,287 pass, 24 skip, 0 fail | 1,185 pass, 6 fail |
| Build | Clean | Clean (2 chunks >250kB) |
| `as any` (production) | 5 occurrences | 2 occurrences |
| `as any` (incl. tests) | 71 files | 7 files |
| TODO/FIXME | 0 | 3 |
| eslint-disable | — | 34 |
| console.log (prod) | 5 files | 3 files |
| Files >1,000 LOC | 5 | 3 |
| catch blocks | 756 | — |
| SQL migrations | 104 | — |

## Architecture: 6 Parallel Workers

All 6 workers operate on non-overlapping file sets, enabling true parallel execution. Each worker produces an independent commit.

---

### Worker 1: Test Stability

**Goal:** 100% green tests, clean exit, no warnings.

**Tasks:**

1. **Fix 6 failing frontend tests** (`InboxSmartPage.test.tsx`)
   - Root cause: `TypeError: Cannot read properties of null (reading 'useEffect')` in QueryClientProvider
   - Fix: Correct test setup with proper React context wrapping (likely duplicate React instance or missing test wrapper)

2. **Resolve Jest force-exit warning** (Backend)
   - Open async handles (DB pools, timers) survive test teardown
   - Fix: Add proper `afterAll` cleanup in affected test suites
   - Ensure `globalTeardown` closes all pool connections

3. **Test count reconciliation**
   - CLAUDE.md documents 5,715 tests (Phase 118), actual count is 6,472 (5,287 + 1,185)
   - Update documentation to match actual counts

**Success metric:** `npm test` on both sides: 0 failures, 0 warnings, clean exit.

**Files:** ~10 test files

---

### Worker 2: Type Safety

**Goal:** Eliminate all avoidable `as any` casts across the entire project.

**Tasks:**

1. **Audit 71 backend files with `as any`**
   - Categorize each cast:
     - **Fixable** (~80%): Missing types, lazy casts, untyped imports → proper typing
     - **Library-induced** (~15%): Incomplete external types → `// @ts-expect-error` with justification
     - **Structural** (~5%): Generic/overload contexts → `unknown` + type guard

2. **Audit 7 frontend files with `as any`**
   - Same categorization as backend

3. **Verify strict mode**
   - Ensure `tsconfig.json` has `"strict": true`
   - Consider adding `"noUncheckedIndexedAccess": true` if not present

**Patterns:**

```typescript
// BEFORE:
const result = data as any;

// AFTER (known type):
const result: SpecificType = data;

// AFTER (library gap):
// @ts-expect-error Library XY has incomplete types for Z
const result = data;

// AFTER (unknown + guard):
const result: unknown = data;
if (isSpecificType(result)) { /* ... */ }
```

**Success metric:** `grep -r "as any" src/ | wc -l` → max 15 total, each remaining cast must have a `// @ts-expect-error` or inline comment justifying why `as any` is unavoidable (library typing gaps, generic dispatch, etc.).

**Files:** ~78 files

---

### Worker 3: Error Handling

**Goal:** Consistent error handling across all 756 catch blocks.

**Tasks:**

1. **Identify and fix silent swallows** (priority — these are the dangerous ones)
   - **Definition of "silent catch":** A catch block that neither (a) logs via `logger`, (b) re-throws, nor (c) returns a documented fallback value. `catch (e) { return defaultValue; }` with a comment explaining the fallback is NOT silent.
   - `catch (error) { }` (empty) or `catch (e) { console.log(e) }` (console instead of logger) → replace with structured logging
   - **Triage strategy:** Focus on silent/empty catch blocks first. Catch blocks that already use `logger.error/warn` and handle the error are already compliant — skip them. This reduces the audit from 756 to an estimated ~50-100 blocks.

2. **Standardize patterns:**
   - **Routes:** `asyncHandler` + central `errorHandler` middleware (already exists)
   - **Services:** `throw` instead of silent fail — caller decides handling
   - **Background jobs:** Log + retry policy (BullMQ already supports this)

3. **Migrate backend console.log → logger**
   - 5 backend files still use `console.log` instead of `logger.ts`
   - Note: Frontend console.log cleanup is handled by Worker 5 (no overlap)

4. **Standardize error types:**

```typescript
// Operational (expected, recoverable):
throw new AppError('NOT_FOUND', 'Idea not found', 404);

// Programmer error (bug):
// Don't catch — ErrorHandler + Sentry will handle
```

5. **Verify Sentry integration**
   - All unexpected errors should be reported to Sentry
   - Check `errorHandler.ts` for proper Sentry `captureException` calls

**Success metric:** 0 silent catch blocks, all error logs go through `logger.ts`.

**Files:** ~50 service/route files

---

### Worker 4: Architecture (File Decomposition)

**Goal:** No file exceeds 1,000 LOC, clear single-responsibility.

**Split plan for 8 files >1,000 LOC:**

| File | LOC | Split Into |
|------|-----|-----------|
| `mcp/server.ts` | 1,823 | `mcp-tools.ts` + `mcp-resources.ts` + `mcp-prompts.ts` + `mcp-server.ts` (core) |
| `memory/long-term-memory.ts` | 1,722 | `ltm-storage.ts` + `ltm-retrieval.ts` + `ltm-consolidation.ts` + `long-term-memory.ts` (facade) |
| `claude/tool-use.ts` | 1,689 | `tool-dispatcher.ts` + `tool-formatters.ts` + `tool-use.ts` (registry) |
| `agent-orchestrator.ts` | 1,467 | `strategy-selector.ts` + `agent-factories.ts` + `agent-orchestrator.ts` (core) |
| `routes/ideas.ts` | 1,358 | `ideas-service.ts` (business logic) + `ideas.ts` (routing only) |
| `GeneralChat.tsx` | 1,138 | `ChatMessageArea.tsx` + `ChatInputArea.tsx` + `GeneralChat.tsx` (container) |
| `ProceduralMemoryPanel.tsx` | 1,065 | `ProcedureList.tsx` + `ProcedureDetail.tsx` + `ProceduralMemoryPanel.tsx` |
| `SystemAdminPage.tsx` | 1,046 | `AdminTabs/` directory with one file per tab |

**Principles:**
- Facade pattern: Original file becomes thin re-export layer
- All existing imports remain stable (no breaking changes)
- New files test through existing test suites

**Success metric:** `find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1 > 1000'` → 0 results.

**Note on Worker 1 overlap:** Worker 4 splits frontend components but does NOT touch test files. Worker 1 only touches test files. If a test imports from a split component, the facade re-export layer ensures the import path remains stable — no merge conflict.

**Files:** ~8 existing + ~15 new files

---

### Worker 5: Bundle & Frontend Polish

**Goal:** All chunks under 250kB, clean linting, no debug artifacts.

**Tasks:**

1. **Sentry chunk optimization**
   - `vendor-sentry` chunk (251kB) → split into separate Vite manual chunk with `manualChunks` config
   - Keep Sentry loaded eagerly in production (error tracking must not miss first errors)
   - In development: lazy-load via dynamic import to speed up dev builds
   - Alternative: tree-shake unused Sentry integrations (replay, profiling) if they're imported but not used

2. **Index chunk splitting**
   - Analyze what's in the 257kB index chunk
   - Extend route-based code splitting if needed (Phase 118 already has 7 manual chunks)

3. **34 eslint-disable audit**
   - Each directive: still justified? → add comment with reason
   - No longer needed? → remove and fix the underlying issue

4. **3 TODO/FIXME resolution**
   - Resolve or document as conscious decision

5. **3 frontend console.log**
   - Replace with Sentry breadcrumbs or remove

6. **Tree-shaking check**
   - Unnecessary re-exports in barrel files (`index.ts`) that prevent dead code elimination

**Success metric:** Build output shows 0 chunks >250kB, `grep "eslint-disable" | wc -l` ≤ 10 (justified only).

**Files:** ~20 files

---

### Worker 6: Database & Migrations

**Goal:** Clean migration baseline, optimized queries, verified DB health.

**Tasks:**

1. **Migration consolidation**
   - Create `phase119_consolidated_baseline.sql` — current schema state as single idempotent migration
   - Move 104 old migrations to `backend/sql/migrations/archive/`
   - Add README with consolidation date and rationale
   - **Pre-check:** Verify no migration runner is in use (the project uses manual SQL migrations via Supabase SQL Editor, not an automated runner like Flyway/Knex). If a runner IS used, the baseline must be marked as "already applied" in the runner's state table.

2. **Index audit**
   - Cross-reference existing indexes with actual query patterns
   - Identify unused indexes (cost write performance)
   - Add missing indexes for frequent WHERE clauses

3. **Pool health validation**
   - Verify `DB_POOL_SIZE=8` is optimal for Supabase Transaction Mode Pooler (port 6543)
   - Check pool metrics under load

4. **Schema parity verification**
   - All 4 schemas (personal/work/learning/creative) must have identical table structure
   - Generate diff report between schemas

**Success metric:** 1 baseline migration, all schemas identical, pool metrics clean.

**Files:** ~10 SQL + config files

---

## Execution Plan

1. All 6 workers run in parallel (no file overlaps)
2. Each worker produces its own commit with descriptive message
3. After all workers complete: full test suite + build verification
4. Update CLAUDE.md changelog with Phase 119 results
5. Final commit with updated documentation

## Risk Mitigation

- **File decomposition (W4)** is the highest risk — facade pattern ensures backward compatibility
- **Migration consolidation (W6)** is zero-risk — only reorganizes SQL files, doesn't touch DB
- **`as any` removal (W2)** could surface hidden type issues — run full test suite after each batch
- All workers run in worktrees to isolate changes

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Failed tests | 6 | 0 |
| `as any` files | 78 | ≤15 (all justified) |
| Files >1,000 LOC | 8 | 0 |
| Silent catch blocks | Unknown | 0 |
| console.log (prod) | 8 | 0 |
| Chunks >250kB | 2 | 0 |
| SQL migrations | 104 | 1 baseline + archive |
| eslint-disable | 34 | ≤10 |
| Jest warnings | force-exit | clean exit |
