# Quality Deep Audit — Surgical Strike Sprint

**Date:** 2026-03-18
**Phase:** 98 — Quality Deep Audit
**Approach:** 4 parallel workers, severity top-down (Critical → High → Medium)

## Context

After Phase 97 (Quality Excellence Sprint), a comprehensive 5-agent deep audit was performed covering Backend Code Quality, Frontend Code Quality, Architecture & Integration, Database Schema, and Build/Test Health.

**Baseline:** 5,398 tests passing, 0 TypeScript errors, 264k LOC (167k backend, 97k frontend).

The audit identified **15 findings** across 4 severity levels. This sprint addresses all of them systematically.

---

## Consolidated Findings

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | Critical | Frontend Security | `dangerouslySetInnerHTML` without sanitization in `SearchResultCard.tsx` (lines 122, 129) and `CanvasEditorPanel.tsx` (line 148) — XSS vulnerability |
| 2 | High | Backend Code | ~400 LOC duplicated between `ideasRouter` and `ideasContextRouter` in `ideas.ts` |
| 3 | High | Backend Code | 345 silent `catch {}` blocks across 133 files — errors completely swallowed |
| 4 | High | Database | No migration tracking system — no `schema_migrations` table, no ordering guarantee |
| 5 | High | Backend Security | LIKE injection in search queries — `%` and `_` not escaped in user input |
| 6 | Medium | Architecture | 3+ different API response formats across routes |
| 7 | Medium | Architecture | `pool.query()` used for public-schema access — should use `queryPublic()` where semantically appropriate |
| 8 | Medium | Database | Missing FK constraints on Phase 92/93/64 tables (digital_twin, automation, agent_identity) |
| 9 | Medium | Database | TEXT columns without length limits on contacts, finance, browser tables |
| 10 | Medium | Backend Types | `as any` casts at security-relevant locations (security.ts, extensions.ts, general-chat.ts) |
| 11 | Medium | Backend | `SELECT *` in 19 locations across 8 route files — leaks internal fields |
| 12 | Medium | Frontend | 6 components use `window.confirm` instead of project's confirm dialog |
| 13 | Medium | Tests | Integration tests mock everything — don't test real DB behavior |
| 14 | Low | Frontend | Dead component files |
| 15 | Low | Backend | Unused parameters (`_config`, `_pipeline`) |

---

## Worker 1: Security Hardening

**File ownership:** All files in `frontend/src/components/UniversalSearch/`, `frontend/src/components/canvas/`, `backend/src/routes/graphrag.ts`, `backend/src/routes/security.ts`, `backend/src/routes/extensions.ts`, `backend/src/routes/general-chat.ts`, `backend/src/routes/digest.ts`, `backend/src/routes/sleep-compute.ts`, `backend/src/routes/business/reports.ts`, `backend/src/routes/media.ts`, `backend/src/routes/ai-traces.ts`, `backend/src/routes/voice-realtime.ts`, `backend/src/utils/sql-helpers.ts` (new), `backend/src/types/express/index.d.ts` (new).

**IMPORTANT:** Worker 1 does NOT touch `backend/src/routes/ideas.ts` — that file belongs to Worker 2. Worker 1 creates the `escapeLike()` utility; Worker 2 applies it to ideas.ts.

### 1.1 XSS Fixes (Critical)

**SearchResultCard.tsx** (`frontend/src/components/UniversalSearch/SearchResultCard.tsx`):
- Lines 122, 129: `highlightedTitle` and `highlightedSnippet` rendered via `dangerouslySetInnerHTML`
- **Fix:** Rewrite `highlightMatch()` to return React elements instead of HTML strings. Use `String.split()` on the search term to produce an array of text/match segments, render matches as `<mark>` JSX elements. This eliminates `dangerouslySetInnerHTML` entirely and avoids unnecessary DOMPurify runtime overhead on every keystroke.

**CanvasEditorPanel.tsx** (`frontend/src/components/canvas/CanvasEditorPanel.tsx`):
- Line 148: Mermaid SVG output injected unsanitized
- **Fix:** DOMPurify with SVG-safe config (DOMPurify is already a project dependency — `package.json` has `"dompurify": "^3.3.2"`):
  ```typescript
  import DOMPurify from 'dompurify';
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
  ```

### 1.2 LIKE Escaping (High)

**Create utility** `backend/src/utils/sql-helpers.ts`:
```typescript
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}
```

**Apply to all routes using LIKE with user input** (grep `LIKE.*\$`):
- `backend/src/routes/graphrag.ts` lines 82-83
- All other route files found by grep — Worker 1 must run the grep and fix all occurrences
- **Exception:** `backend/src/routes/ideas.ts` — Worker 2 handles this file

### 1.3 SELECT * Elimination (Medium)

Replace `SELECT *` with explicit column lists in ALL occurrences (19 total across 8 files):
- `backend/src/routes/digest.ts` (4 occurrences)
- `backend/src/routes/security.ts` (1 — especially important, audit log)
- `backend/src/routes/sleep-compute.ts` (2)
- `backend/src/routes/business/reports.ts` (4)
- `backend/src/routes/media.ts` (1)
- `backend/src/routes/ai-traces.ts` (2)
- `backend/src/routes/voice-realtime.ts` (1)
- **Exception:** `backend/src/routes/ideas.ts` (4) — Worker 2 handles this file

### 1.4 `as any` Elimination (Medium)

- `backend/src/routes/security.ts` lines 56, 58, 125: Create `AuditEventType` and `AuditSeverity` union types, validate with type guards
- `backend/src/routes/extensions.ts` lines 39-40: Create `ExtensionType` and `ExtensionCategory` validated enums
- `backend/src/routes/general-chat.ts` line 664: **Create `backend/src/types/express/index.d.ts`** with Express module augmentation:
  ```typescript
  import { InjectionScreeningData } from '../middleware/input-screening';
  declare global {
    namespace Express {
      interface Request {
        injectionScreening?: InjectionScreeningData;
      }
    }
  }
  ```
  Then remove `(req as any).injectionScreening` cast.

---

## Worker 2: Backend Architecture

**File ownership:** `backend/src/routes/ideas.ts`, all service files with silent catch blocks (see list below), route files needing response format fixes. Worker 2 does NOT touch any files owned by Worker 1.

### 2.1 Ideas Route Deduplication (High)

**Current:** `backend/src/routes/ideas.ts` has `ideasRouter` and `ideasContextRouter` with nearly identical handlers (~400 LOC duplication). Only difference: context extraction method.

**Fix:**
1. Extract shared handler functions: `handleTriageGet()`, `handleTriagePost()`, `handleListIdeas()`, etc.
2. Each handler accepts `(context: string, req: Request, res: Response)`
3. Both routers call the same handlers, differing only in how they obtain `context`
4. Also apply `escapeLike()` from Worker 1's new utility to ideas.ts search queries (lines 467, 534)
5. Also replace `SELECT *` occurrences in ideas.ts (4 occurrences) with explicit columns
6. Expected reduction: ~400 LOC

### 2.2 Silent Catch Blocks (High — Scoped)

**345 empty `catch {}` blocks across 133 files.** This sprint addresses the **highest-risk files** — security paths, retrieval/search, and memory operations. Remaining files are tracked for a follow-up phase.

**Priority 1 — Security & Search (must fix):**

| File | Count | Log Level |
|------|-------|-----------|
| `semantic-search.ts` | 10 | `logger.warn` |
| `evolution-analytics.ts` | 9 | `logger.warn` |
| `memory-governance.ts` | 10 | `logger.warn` |
| `global-search.ts` | 10 | `logger.warn` |

**Priority 2 — Memory & Background (must fix):**

| File | Count | Log Level |
|------|-------|-----------|
| `sleep-compute.ts` | 13 | `logger.debug` (non-critical background) |
| `daily-learning.ts` | 9 | `logger.debug` |
| `proactive-digest.ts` | 9 | `logger.debug` |
| `topic-enhancement.ts` | 8 | `logger.warn` |
| `url-fetch.ts` | 8 | `logger.warn` |
| `business-narrative.ts` | 8 | `logger.debug` |

**Priority 3 — Cache operations (logger.debug):**
- `context-engine-v2.ts` (6), `rag-cache.ts`, and similar cache-layer files

**Remaining ~245 catch blocks** in lower-risk files are documented as tech debt for the next sprint.

### 2.3 Response Format Standardization (Medium)

**Define standard:** All API responses follow:
```typescript
// Success
{ success: true, data: T }
// or for lists:
{ success: true, data: T[], total?: number, page?: number }

// Error (from errorHandler)
{ success: false, error: string, message?: string }
```

**Apply to:** Routes that currently return `{ error: 'message' }` without `success` field.

### 2.4 Unused Parameters (Low)

- `enhanced-rag.ts` line 511: Remove `_config` parameter from `mergeAllResults()`
- `agent-orchestrator.ts` line 1147: Remove `_pipeline` parameter from `aggregateResults()`

---

## Worker 3: Database Integrity

**File ownership:** All files in `backend/sql/migrations/phase98_*`, `backend/src/utils/database-context.ts` (queryPublic documentation only). Worker 3 creates SQL migrations but does NOT modify TypeScript service files.

### 3.1 Migration Tracking (High)

**Create** `backend/sql/migrations/phase98_migration_tracking.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT
);
```

**Version scheme:** Use filename as primary key (not sequential numbers). Worker 3 must enumerate all 91 existing migration files and register them:
```sql
INSERT INTO public.schema_migrations (filename) VALUES
  ('sync_all_schemas_full_parity.sql'),
  ('phase35_calendar.sql'),
  -- ... enumerate ALL 91 files from backend/sql/migrations/
ON CONFLICT (filename) DO NOTHING;
```

### 3.2 Missing FK Constraints (Medium)

**Create** `backend/sql/migrations/phase98_missing_fks.sql`:

Use the existing project pattern (`DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`) — **NOT** `ADD CONSTRAINT IF NOT EXISTS` which is invalid PostgreSQL syntax:

```sql
DO $$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal', 'work', 'learning', 'creative'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.digital_twin_profiles ADD CONSTRAINT fk_dtp_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER TABLE %I.digital_twin_snapshots ADD CONSTRAINT fk_dts_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER TABLE %I.digital_twin_corrections ADD CONSTRAINT fk_dtc_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER TABLE %I.workspace_automations ADD CONSTRAINT fk_wa_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Public schema tables
DO $$ BEGIN
  ALTER TABLE public.agent_identities ADD CONSTRAINT fk_ai_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agent_workflows ADD CONSTRAINT fk_aw_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

**Verification:** These FK migrations must be tested against the Supabase staging environment before applying to production, since there are no integration tests with real DB.

### 3.3 TEXT → VARCHAR with Limits (Medium)

**Create** `backend/sql/migrations/phase98_text_limits.sql`:

**Pre-check required:** Before each `ALTER COLUMN ... TYPE VARCHAR(N)`, run `SELECT MAX(LENGTH(column_name))` to verify no existing data exceeds the limit. If it does, either increase the limit or truncate.

Apply across all 4 schemas:
- `organizations`: name VARCHAR(255), industry VARCHAR(100), website VARCHAR(2048), email VARCHAR(320), phone VARCHAR(50), address VARCHAR(500), city VARCHAR(100), postal_code VARCHAR(20), country VARCHAR(100)
- `financial_accounts/budgets/goals`: name VARCHAR(255), category VARCHAR(100), currency VARCHAR(3)
- `browsing_history/bookmarks`: url VARCHAR(8192)
- `transactions`: category VARCHAR(100), payee VARCHAR(255)

### 3.4 pool.query() → queryPublic() (Medium — Scoped)

**Only replace in files where the intent is clearly public-schema access but `pool.query()` is used instead of `queryPublic()`.** Do NOT replace in:
- Auth services (`user-service.ts`, `session-store.ts`, `jwt-service.ts`) — these correctly use pool directly
- Business connectors (`stripe-connector.ts`, `ga4-connector.ts`) — not context-sensitive
- External service integrations (`github.ts`, `slack.ts`) — not context-sensitive

**Do replace in:** Files that mix `queryContext()` and `pool.query()` for different tables in the same service, where the `pool.query()` calls target public-schema tables. Worker 3 identifies these by auditing imports.

---

## Worker 4: Frontend Polish

**File ownership:** All frontend component files NOT owned by Worker 1 (i.e., NOT in `UniversalSearch/` or `canvas/`).

### 4.1 window.confirm → Confirm Dialog (Medium)

Replace `window.confirm()` calls in **6 components**:
1. `SettingsDashboard.tsx`
2. `OnDeviceAI/OnDeviceAISettings.tsx`
3. `MCPConnectionsPage.tsx`
4. `WorkflowPanel.tsx`
5. `CalendarPage/CalendarAccountsPanel.tsx`
6. `AutomationDashboard.tsx`

Use the project's existing `ConfirmDialog` pattern (see `IdeasPage.tsx`, `IdeaCard.tsx` for reference).

### 4.2 Dead Code Removal (Low)

Worker 4 must grep for components that are defined but never imported. Remove confirmed dead files. List each file with evidence (grep showing zero imports).

### 4.3 Large File Assessment (Low/Optional)

Review 1,000+ LOC components. Only split where there's a clear separation of concerns — not for the sake of line counts. No mandatory action.

---

## Parallel Execution Safety

| File | Owner | Rationale |
|------|-------|-----------|
| `backend/src/routes/ideas.ts` | Worker 2 | Deduplication + LIKE escape + SELECT * — all in one pass |
| `frontend/src/components/canvas/*` | Worker 1 | XSS fix |
| `frontend/src/components/UniversalSearch/*` | Worker 1 | XSS fix |
| `backend/src/utils/sql-helpers.ts` (new) | Worker 1 | Creates utility, Worker 2 imports it |
| `backend/src/types/express/index.d.ts` (new) | Worker 1 | Express type augmentation |
| `backend/sql/migrations/phase98_*` | Worker 3 | All DB migrations |
| All other frontend components | Worker 4 | window.confirm + dead code |
| All other backend services | Worker 2 | catch blocks + response format |

**Dependency:** Worker 2 depends on Worker 1 completing `sql-helpers.ts` before applying `escapeLike()` to ideas.ts. Worker 2 should handle ideas.ts last.

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| XSS vulnerabilities | 2 | 0 |
| Silent catch blocks (priority files) | ~100 | 0 |
| Duplicated LOC (ideas.ts) | ~400 | 0 |
| LIKE injection points | 3+ | 0 |
| `SELECT *` in routes | 19 | 0 |
| `as any` in security paths | 6+ | 0 |
| Missing FK constraints | 6 | 0 |
| TEXT without limits | 12+ | 0 |
| Migration tracking | None | schema_migrations table |
| `window.confirm` usage | 6 | 0 |
| Tests passing | 5,398 | >= 5,398 |
| TypeScript errors | 0 | 0 |

## Non-Goals

- No new features
- No ESLint rule additions (follow-up phase)
- No test strategy overhaul (noted for future — integration tests mock everything)
- No large-file splitting unless clearly warranted
- Remaining ~245 silent catch blocks in low-risk files — tracked for next sprint
