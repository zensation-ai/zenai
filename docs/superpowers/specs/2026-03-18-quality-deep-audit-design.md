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
| 3 | High | Backend Code | 49+ silent `catch {}` blocks swallowing errors across services |
| 4 | High | Database | No migration tracking system — no `schema_migrations` table, no ordering guarantee |
| 5 | High | Backend Security | LIKE injection in search queries — `%` and `_` not escaped in user input |
| 6 | Medium | Architecture | 3+ different API response formats across routes |
| 7 | Medium | Architecture | `pool.query()` export bypasses schema isolation — should use `queryPublic()` |
| 8 | Medium | Database | Missing FK constraints on Phase 92/93/64 tables (digital_twin, automation, agent_identity) |
| 9 | Medium | Database | TEXT columns without length limits on contacts, finance, browser tables |
| 10 | Medium | Backend Types | `as any` casts at security-relevant locations (security.ts, extensions.ts, general-chat.ts) |
| 11 | Medium | Backend | `SELECT *` in security/audit routes — leaks internal fields |
| 12 | Medium | Frontend | 5 components use `window.confirm` instead of project's `useConfirm()` hook |
| 13 | Medium | Tests | Integration tests mock everything — don't test real DB behavior |
| 14 | Low | Frontend | 5 dead component files |
| 15 | Low | Backend | Unused parameters (`_config`, `_pipeline`) |

---

## Worker 1: Security Hardening

### 1.1 XSS Fixes (Critical)

**SearchResultCard.tsx** (`frontend/src/components/UniversalSearch/SearchResultCard.tsx`):
- Lines 122, 129: `highlightedTitle` and `highlightedSnippet` rendered via `dangerouslySetInnerHTML`
- **Fix:** Replace with DOMPurify sanitization. Import DOMPurify (already a project dependency for EmailDetail), sanitize before injection:
  ```typescript
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedTitle, { ALLOWED_TAGS: ['mark', 'b', 'em'] }) }}
  ```
- Alternative: Rewrite highlight logic to return React elements (Regex → `<mark>` JSX fragments)

**CanvasEditorPanel.tsx** (`frontend/src/components/canvas/CanvasEditorPanel.tsx`):
- Line 148: Mermaid SVG output injected unsanitized
- **Fix:** DOMPurify with SVG-safe config:
  ```typescript
  DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } })
  ```

### 1.2 LIKE Escaping (High)

**Create utility** `backend/src/utils/sql-helpers.ts`:
```typescript
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}
```

**Apply to:**
- `backend/src/routes/graphrag.ts` lines 82-83: `%${escapeLike(search)}%`
- `backend/src/routes/ideas.ts` lines 467, 534: `%${escapeLike(searchQuery)}%`
- Any other routes using `LIKE` with user input (grep for `LIKE` + `$`)

### 1.3 SELECT * Elimination (Medium)

Replace `SELECT *` with explicit column lists in:
- `backend/src/routes/digest.ts` lines 204, 306, 347, 394
- `backend/src/routes/security.ts` line 89 (especially important — audit log)
- `backend/src/routes/sleep-compute.ts` lines 29, 108
- `backend/src/routes/business/reports.ts` lines 25, 26, 52, 68

### 1.4 `as any` Elimination (Medium)

- `backend/src/routes/security.ts` lines 56, 58, 125: Create `AuditEventType` and `AuditSeverity` union types, validate with type guards
- `backend/src/routes/extensions.ts` lines 39-40: Create `ExtensionType` and `ExtensionCategory` enums
- `backend/src/routes/general-chat.ts` line 664: Define proper typed Request extension interface

---

## Worker 2: Backend Architecture

### 2.1 Ideas Route Deduplication (High)

**Current:** `backend/src/routes/ideas.ts` has `ideasRouter` and `ideasContextRouter` with nearly identical handlers. Only difference: context extraction method.

**Fix:**
1. Extract shared handler functions: `handleTriageGet()`, `handleTriagePost()`, `handleListIdeas()`, etc.
2. Each handler accepts `(context: string, req: Request, res: Response)`
3. Both routers call the same handlers, differing only in how they obtain `context`
4. Expected reduction: ~400 LOC

### 2.2 Silent Catch Blocks (High)

**49+ empty `catch {}` blocks across services.** Categorize and fix:

| Category | Fix | Files |
|----------|-----|-------|
| Cache operations | `logger.debug('Cache op failed', { error })` | rag-cache.ts, context-engine-v2.ts |
| Query/retrieval | `logger.warn('Retrieval failed', { error })` | semantic-search.ts (10x), evolution-analytics.ts (9x) |
| Background tasks | `logger.error('Background task failed', { error })` | sleep-compute.ts, memory services |

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

### 3.1 Migration Tracking (High)

**Create** `backend/sql/migrations/phase98_migration_tracking.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  filename TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT
);

-- Register all existing migrations as applied
INSERT INTO public.schema_migrations (version, filename, applied_at) VALUES
  ('001', 'sync_all_schemas_full_parity.sql', NOW()),
  ('002', 'phase35_calendar.sql', NOW()),
  -- ... all existing migration files
ON CONFLICT (version) DO NOTHING;
```

This is tracking only — no migration runner. Just a record of what's been applied.

### 3.2 Missing FK Constraints (Medium)

**Create** `backend/sql/migrations/phase98_missing_fks.sql`:
```sql
DO $$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal', 'work', 'learning', 'creative'] LOOP
    -- Digital Twin tables
    EXECUTE format('ALTER TABLE %I.digital_twin_profiles ADD CONSTRAINT IF NOT EXISTS fk_dtp_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    EXECUTE format('ALTER TABLE %I.digital_twin_snapshots ADD CONSTRAINT IF NOT EXISTS fk_dts_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    EXECUTE format('ALTER TABLE %I.digital_twin_corrections ADD CONSTRAINT IF NOT EXISTS fk_dtc_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
    -- Workspace Automations
    EXECUTE format('ALTER TABLE %I.workspace_automations ADD CONSTRAINT IF NOT EXISTS fk_wa_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE', s);
  END LOOP;
END $$;

-- Public schema tables
ALTER TABLE public.agent_identities ADD CONSTRAINT IF NOT EXISTS fk_ai_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.agent_workflows ADD CONSTRAINT IF NOT EXISTS fk_aw_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
```

### 3.3 TEXT → VARCHAR with Limits (Medium)

**Create** `backend/sql/migrations/phase98_text_limits.sql`:

Apply `ALTER TABLE ... ALTER COLUMN ... TYPE VARCHAR(N)` for:
- `organizations`: name(255), industry(100), website(2048), email(320), phone(50), address(500), city(100), postal_code(20), country(100)
- `financial_accounts/budgets/goals`: name(255), category(100), currency(3)
- `browsing_history/bookmarks`: url(8192)
- `transactions`: category(100), payee(255)

### 3.4 pool.query() → queryPublic() (Medium)

Audit all files using `pool.query()` for public-schema access. Replace with `queryPublic()` for semantic clarity:
- Identify affected files (~6 files with ~26 occurrences)
- `queryPublic()` explicitly sets `search_path TO public`
- Functionally equivalent but semantically correct

---

## Worker 4: Frontend Polish

### 4.1 window.confirm → useConfirm() (Medium)

Replace `window.confirm()` calls in 5 components with the project's `useConfirm()` hook for consistent UX.

### 4.2 Dead Code Removal (Low)

Remove 5 identified dead component files that are not imported anywhere.

### 4.3 Large File Assessment (Low/Optional)

Review 1,000+ LOC components. Only split where there's a clear separation of concerns — not for the sake of line counts.

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| XSS vulnerabilities | 2 | 0 |
| Silent catch blocks | 49+ | 0 |
| Duplicated LOC (ideas.ts) | ~400 | 0 |
| LIKE injection points | 3+ | 0 |
| `SELECT *` in routes | 8+ | 0 |
| `as any` in security paths | 6+ | 0 |
| Missing FK constraints | 6 | 0 |
| TEXT without limits | 12+ | 0 |
| Migration tracking | None | schema_migrations table |
| Tests passing | 5,398 | >= 5,398 |
| TypeScript errors | 0 | 0 |

## Non-Goals

- No new features
- No ESLint rule additions (follow-up phase)
- No test strategy overhaul (noted for future — integration tests mock everything)
- No large-file splitting unless clearly warranted
