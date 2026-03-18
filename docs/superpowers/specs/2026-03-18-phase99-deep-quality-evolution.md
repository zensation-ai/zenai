# Phase 99: Deep Quality Evolution

> **Goal:** Elevate ZenAI from 7.8-8.2/10 to 9.5+/10 across all dimensions.
> **Approach:** 2 Waves with maximum depth per fix, 4 parallel workers.
> **Date:** 2026-03-18

## Current Quality Baseline

| Area | Score | Critical Weakness |
|------|-------|-------------------|
| Backend | 7.8/10 | No request timeouts, regex recompilation, unbounded tool loops, 24x `as any` |
| Frontend | 8.2/10 | GeneralChat ref-based state, inconsistent error handling |
| RAG Pipeline | 8.5/10 | HyDE no timeout, no Contextual Retrieval |
| Memory | 7.0/10 | Non-atomic consolidation, no agent-managed memory |
| Security | 7.5/10 | Input screening never blocks, error messages unfiltered |
| Accessibility | 7.5/10 | ARIA gaps, missing focus management |

## Research Basis (2025-2026 State-of-the-Art)

### Sources
- Anthropic: Contextual Retrieval (67% fewer retrieval failures), Tool Search Tool, Claude Agent SDK
- Letta V1: Agent-managed memory (self-managed remember/forget/consolidate)
- ICLR 2026 Workshop: MemAgents — consensus on agent self-managed memory
- MCP 2026 Roadmap: Tool discovery, Server Cards, Elicitation
- ONNX Runtime Web + WebGPU: Production-ready local inference
- Langfuse/Braintrust: Eval gates in CI/CD, per-request cost tracking

### Key Findings
1. **Tool Search Tool Pattern** — Loading all tools consumes 40-50% of context window. On-demand discovery is the proven solution.
2. **Contextual Retrieval** — Prepending document-level context to chunks at indexing time delivers 67% fewer retrieval failures when combined with BM25 hybrid + reranking.
3. **Agent-Managed Memory** — Claude decides what to remember/forget/consolidate via tool calls (Letta V1 pattern).
4. **Confidence Indicators** — THE UX pattern of 2026: show retrieval confidence visually.
5. **Eval Gates** — Automated quality checks before prompt/model changes go live.

---

## Wave 1: Infrastructure & AI Core (25 Fixes)

### 1A. Backend Hardening (15 Fixes)

#### Fix 1: Request-Level Timeout Middleware
- **File:** `backend/src/main.ts`
- **Problem:** No global request timeout. Long-running requests can hang indefinitely.
- **Solution:** Express timeout middleware — 30s default, 120s for streaming endpoints, 180s for vision endpoints.
- **Implementation:** Custom middleware that checks route pattern and applies appropriate timeout. On timeout, sends 504 Gateway Timeout with structured error.

#### Fix 2: Regex Compilation Cache
- **File:** `backend/src/services/chat-modes.ts`
- **Problem:** 30+ regex patterns recompiled on every incoming message (O(n) per request).
- **Solution:** Compile all patterns at module load time into a `Map<string, RegExp>`. Export compiled patterns. Single iteration for mode detection.
- **Impact:** Eliminates ~2ms CPU waste per chat message.

#### Fix 3: Tool Execution Hard Limits
- **File:** `backend/src/services/claude/streaming.ts`
- **Problem:** Tool iteration loop has no hard time limit — could execute indefinitely if tools return `tool_use` repeatedly.
- **Solution:** Add `maxToolTime: 60000` (60s total tool execution budget). Check elapsed time after each tool call. If exceeded, send partial result with warning.
- **Also:** Enforce `maxToolIterations: 10` as a hard cap (currently only soft).

#### Fix 4: Tool Result Size Enforcement
- **File:** `backend/src/services/claude/streaming.ts`
- **Problem:** Tool results have no server-side size check. A tool could return MB of data, buffered into SSE stream.
- **Solution:** Truncate tool results to 64KB server-side before including in message. Add `[truncated]` marker. Log truncation event.

#### Fix 5: HyDE Timeout with Fallback
- **File:** `backend/src/services/enhanced-rag.ts`
- **Problem:** HyDE generation can block indefinitely. `Promise.all()` without timeout means entire retrieval blocks.
- **Solution:** `Promise.race()` with 5s timeout on HyDE. On timeout, fall back to direct embedding retrieval. Track timeout rate as metric.

#### Fix 6: Type Safety — Eliminate `as any`
- **Files:** 24 locations across services
- **Problem:** `as any` bypasses TypeScript's type system, hiding potential bugs.
- **Solution:** For each instance, create proper typed interface. Priority: streaming.ts (3 instances), tool-handlers.ts, agent-orchestrator.ts.
- **Approach:** Group by service, create shared types in `backend/src/types/`.
- **Find all:** `grep -rn 'as any' backend/src/ --include='*.ts' | grep -v node_modules | grep -v __tests__`
- **Tests:** TypeScript strict compilation is the test — build must pass with 0 errors after removal.

#### Fix 7: Non-Null Assertion Elimination
- **Files:** `backend/src/main.ts` (server shutdown), `backend/src/routes/auth.ts` (5 instances in MFA/OAuth handlers)
- **Problem:** `!` operator assumes value is non-null. If assumption wrong, runtime crash.
- **Solution:** Guard clauses with early return and structured error. Example: `if (!httpServer) throw new AppError('Server not initialized', 500)`.
- **Find all:** `grep -rn '!\.' backend/src/ --include='*.ts' | grep -v node_modules | grep -v __tests__`
- **Tests:** Unit test that verifies guard clause returns proper error for null cases.

#### Fix 8: Error Message Sanitization
- **File:** `backend/src/services/claude/streaming.ts`
- **Problem:** Error messages sent to client may contain stack traces, DB schema info, or internal paths.
- **Solution:** `sanitizeError()` utility — in production, only send error code + user-friendly message. In development, include full details. Applied at SSE error event emission.

#### Fix 9: Backoff Jitter
- **File:** `backend/src/utils/database-context.ts`
- **Problem:** Exponential backoff without jitter causes thundering herd on mass reconnects.
- **Solution:** Add `Math.random() * baseDelay * 0.5` jitter to backoff calculation. Standard pattern: `delay = Math.pow(2, attempt) * 1000 + Math.random() * 500`.

#### Fix 10: Atomic Memory Consolidation
- **File:** `backend/src/services/memory/long-term-memory.ts`
- **Problem:** Consolidation process is not wrapped in a transaction. Partial failure leaves inconsistent state.
- **Solution:** Wrap consolidation in `BEGIN/COMMIT/ROLLBACK`. Use savepoints for individual fact operations.

#### Fix 11: Stream Resource Cleanup
- **File:** `backend/src/services/claude/streaming.ts`
- **Problem:** Timeout timers not cleared in all error paths. Stream listeners may not be cleaned up on abort.
- **Solution:** Move all cleanup into a `finally` block. Create `cleanupStreamResources()` function called from finally + abort handler.

#### Fix 12: Query Size Limit
- **File:** `backend/src/services/enhanced-rag.ts`
- **Problem:** No limit on query size. 100KB+ queries could be sent.
- **Solution:** Max 10KB query input. Truncate with warning. Validate at handler layer before passing to RAG.

#### Fix 13: Message History Deduplication
- **File:** `backend/src/services/claude/streaming.ts`
- **Problem:** Repeated tool failures stack identical messages indefinitely in conversation history.
- **Solution:** Dedup by content hash before appending to message history. Max 3 identical tool error messages.

#### Fix 14: Safe JSON Serialization
- **File:** `backend/src/services/claude/streaming.ts`
- **Problem:** `JSON.stringify()` without circular reference check. Could throw on complex objects.
- **Solution:** `safeStringify()` utility with circular reference detection and BigInt handling.

#### Fix 15: Pool Threshold Tuning
- **File:** `backend/src/utils/database-context.ts`
- **Problem:** 25% pool exhaustion warning is too aggressive, creates log noise.
- **Solution:** Warning at 50%, Critical at 75%. Add metric emission at each threshold.

---

### 1B. AI Core Evolution (10 Fixes)

#### Fix 16: Contextual Retrieval (Chunk Enrichment at Index Time)
- **File:** New `backend/src/services/contextual-retrieval.ts` + modify `enhanced-rag.ts`
- **Problem:** Chunks indexed without document-level context. Anthropic research shows 67% fewer retrieval failures when chunks include context.
- **Solution:**
  1. At indexing time, for each chunk: generate a short context prefix using the parent document (title, section, summary).
  2. Store enriched chunk alongside original for both embedding and BM25.
  3. Use prompt: "Given document '{title}', this chunk discusses: {brief context}. Content: {chunk}"
  4. Apply to new content immediately; batch-enrich existing content via background job.
- **DB Migration:** `phase99_contextual_retrieval.sql` — ALTER `document_chunks` in all 4 schemas: add `enriched_content TEXT`, `context_prefix TEXT`, `enriched_embedding vector(1536)`. New index on `enriched_embedding`.
- **Background Job:** BullMQ queue `contextual-enrichment`, processes existing chunks in batches of 50. Uses Claude Haiku for context generation (~$1/million tokens).
- **Tests:** Unit test for context prefix generation, integration test for enriched retrieval vs plain retrieval.
- **Impact:** Single highest-impact RAG improvement available.

#### Fix 17: Tool Search Tool Pattern
- **File:** `backend/src/services/tool-handlers.ts` + `backend/src/services/claude/streaming.ts`
- **Problem:** All 49 tool definitions loaded into every prompt = ~40-50% of context window consumed.
- **Solution:**
  1. Create `search_tools` meta-tool that takes a query and returns relevant tool definitions.
  2. Initial prompt includes only 5 core tools: `search_tools`, `remember`, `recall`, `web_search`, `navigate_to`.
  3. When Claude calls `search_tools`, return matching tool definitions as text result (not dynamic injection — stays within single API call).
  4. On next turn, include discovered tools in the tools array alongside core tools.
  5. Tool registry: `Map<string, { definition, categories, keywords }>` for BM25-style search.
- **Fallback:** If `search_tools` fails or returns empty, fall back to loading all tools (current behavior). Chat modes can force-include tools (e.g., RAG mode always includes `search_ideas`).
- **Multi-turn flow:** Turn 1: user message + core tools → Claude calls `search_tools("email drafting")` → Turn 2: user message + core tools + discovered tools (e.g., `draft_email`, `ask_inbox`).
- **Tests:** Unit test for tool search relevance, integration test for multi-turn tool discovery, fallback test.
- **Impact:** Saves ~4000-6000 tokens per request. Enables scaling to 100+ tools.

#### Fix 18: Dynamic Retrieval Weights
- **File:** `backend/src/services/enhanced-rag.ts`
- **Problem:** Fixed HyDE/Agentic weights (0.4/0.6) regardless of result quality.
- **Solution:** Score-based weighting: if HyDE top result > 0.85 confidence, weight HyDE higher. If agentic finds more diverse results, weight it higher. Implement as `calculateDynamicWeights(hydeResults, agenticResults)`.

#### Fix 19: Cross-Encoder Failure Tracking
- **File:** `backend/src/services/enhanced-rag.ts`
- **Problem:** Silent fallback to heuristic reranker. No way to distinguish cross-encoder failures from legitimate low scores.
- **Solution:** Emit metric `rag.reranker.fallback` with reason (timeout, error, unavailable). Log at WARN level. Track fallback rate in observability dashboard.

#### Fix 20: Content-Hash Deduplication
- **File:** `backend/src/services/enhanced-rag.ts`
- **Problem:** Deduplication via ID assumes stable IDs across sources — fragile.
- **Solution:** Combine ID + content hash (first 500 chars SHA-256) for dedup key. Handles cases where same content has different IDs from different retrieval sources.

#### Fix 21: Agent-Managed Memory Tools
- **File:** `backend/src/services/tool-handlers.ts`
- **Problem:** Memory management is purely rule-based. Agent has no ability to promote/demote/forget memories.
- **Solution:** 3 new tools (total: 49 → 52 tools):
  - `memory_promote`: Move a fact from short-term to long-term with reason
  - `memory_demote`: Reduce importance/confidence of a fact
  - `memory_forget`: Mark a fact as outdated/incorrect (soft delete with reason)
- **Integration:** System prompt instructs Claude to manage memory proactively during conversations.
- **Also update:** Tool count in CLAUDE.md (49 → 52), TOOL_LABELS map in `ChatMessageList.tsx` (3 new entries), tool registry for Fix 17 search.
- **Tests:** Unit test for each tool action, integration test for promote→retrieve flow.

#### Fix 22: Memory Transaction Boundaries
- **File:** `backend/src/services/memory/sleep-compute.ts`
- **Problem:** Sleep compute consolidation not wrapped in transactions.
- **Solution:** Each consolidation stage (episodic, contradiction, pre-loading, procedural, entity) runs in its own transaction with savepoint. Stage failures don't affect other stages.

#### Fix 23: Retrieval Confidence Score in Response
- **File:** `backend/src/services/enhanced-rag.ts` + `backend/src/routes/general-chat.ts`
- **Problem:** Frontend has no visibility into retrieval quality.
- **Solution:** Calculate composite confidence score (0.0-1.0) from: top result score, result count, score variance, source diversity. Include in chat response as `retrievalConfidence` field.

#### Fix 24: Self-RAG Critique Step
- **File:** `backend/src/services/enhanced-rag.ts`
- **Problem:** No self-check on retrieval quality. Low-quality results passed directly to LLM.
- **Solution:** After retrieval, if composite confidence < 0.5:
  1. Reformulate query (add context from conversation history)
  2. Re-retrieve with reformulated query
  3. Merge and re-rank both result sets
  4. Max 1 retry to avoid latency explosion

#### Fix 25: Embedding Drift Detection
- **File:** New `backend/src/services/embedding-drift.ts`
- **Problem:** No detection of retrieval quality degradation over time.
- **Solution:** BullMQ queue `embedding-drift` with weekly cron (`0 3 * * 0`):
  1. Sample 50 recent queries with known-good results from `rag_query_history` table
  2. Re-run retrieval, compare top-5 result overlap with stored baseline
  3. If average score drops > 10%, emit `embedding.drift.detected` event
  4. Store drift metrics in `metric_snapshots` table via observability service
- **DB:** No new tables — uses existing `rag_query_history` + `metric_snapshots`.
- **Tests:** Unit test for drift calculation, mock test for alert emission.

---

## Wave 2: Frontend & UX Excellence (25 Fixes)

### 2A. Frontend Architecture (12 Fixes)

#### Fix 26: Chat State Machine
- **File:** `frontend/src/components/GeneralChat/GeneralChat.tsx`
- **Problem:** Session state managed via refs (`skipNextSessionLoadRef`, `sessionKey` hack). Fragile, race-condition prone.
- **Solution:** `useReducer` state machine with explicit states:
  ```
  idle → loadingSession → ready → streaming → streamComplete → error
  ```
  Actions: `LOAD_SESSION`, `SESSION_LOADED`, `START_STREAM`, `STREAM_CHUNK`, `STREAM_COMPLETE`, `ERROR`, `RESET`.
  Eliminates all ref-based guards.

#### Fix 27: Centralized Error Handler
- **File:** New `frontend/src/utils/error-handler.ts`
- **Problem:** Error handling inconsistent: some use `showToast`, some `logError()`, some silent catch.
- **Solution:** `handleError(error, context?)` utility:
  1. Classify: network error, auth error, validation error, server error, unknown
  2. Log to Sentry with context
  3. Show appropriate toast (retry button for network, redirect for auth)
  4. Return user-friendly message
- Apply across all hooks and components.

#### Fix 28: Streaming Test Coverage
- **File:** New `frontend/src/__tests__/hooks/useStreamingChat.test.ts`
- **Problem:** Zero tests for SSE parsing, tool tracking, RAF throttle.
- **Solution:** Test suite covering:
  - `parseSSEChunk()` with various event types
  - Tool use start/end tracking
  - RAF throttle behavior (mock requestAnimationFrame)
  - AbortController cleanup
  - Error recovery paths
  - Optimistic update rollback

#### Fix 29: AbortController Race Fix
- **Files:** `frontend/src/App.tsx`, `frontend/src/components/GeneralChat/GeneralChat.tsx`
- **Problem:** Rapid context switching fires parallel requests without canceling previous.
- **Solution:** AbortController per context. On context change, abort previous controller before creating new request.

#### Fix 30: Artifacts Memory Cleanup
- **File:** `frontend/src/components/GeneralChat/GeneralChat.tsx`
- **Problem:** Artifacts Map grows unbounded. Message deletion doesn't clean artifacts.
- **Solution:** Cleanup artifacts when messages are deleted. Cap at 100 artifacts total, evict oldest first.

#### Fix 31: Tool Results Alignment
- **Files:** `GeneralChat.tsx` (MAX_TOOL_RESULTS=50), `useStreamingChat.ts` (slice(-4))
- **Problem:** Inconsistent limits between components.
- **Solution:** Single constant `MAX_TOOL_RESULTS = 20` in shared config. Both components reference it.

#### Fix 32: Navigation Action Validation
- **File:** `frontend/src/hooks/useStreamingChat.ts`
- **Problem:** Tool navigate action accepts arbitrary page string without validation.
- **Solution:** Validate against `Page` union type from `types/idea.ts`. Ignore invalid pages, log warning.

#### Fix 33: ProactivePanel Lazy Mount
- **File:** `frontend/src/components/layout/AppLayout.tsx`
- **Problem:** ProactivePanel mounted even when closed, potentially firing API calls.
- **Solution:** Conditional render: `{isProactivePanelOpen && <ProactivePanel />}`.

#### Fix 34: Smart Scroll Behavior
- **File:** `frontend/src/components/layout/AppLayout.tsx`
- **Problem:** Scroll-to-top on every page change, including tab switches.
- **Solution:** Only scroll on navigation (page change), not on tab changes within the same page. Compare previous vs current page in effect.

#### Fix 35: Intelligent Query Retry
- **File:** `frontend/src/lib/query-client.ts`
- **Problem:** Retry on all failures including 4xx client errors.
- **Solution:** `retry: (count, error) => count < 3 && error.status >= 500`. No retry on 400/401/403/404.

#### Fix 36: Per-Domain Cache Timing
- **File:** `frontend/src/lib/query-client.ts` + individual hooks
- **Problem:** Global 5min gcTime for all data types.
- **Solution:** Override per domain: chat messages 2min, ideas 10min, dashboard 5min, settings 30min.

#### Fix 37: Image Upload Validation
- **File:** `frontend/src/components/GeneralChat/GeneralChat.tsx`
- **Problem:** No file type or size validation before upload.
- **Solution:** Validate: `accept="image/*"`, max 10MB, show error toast for violations.

---

### 2B. Accessibility & UX Differentiation (13 Fixes)

#### Fix 38: ARIA Loading States
- **File:** `frontend/src/components/GeneralChat/GeneralChat.tsx`
- **Problem:** `aria-live="polite"` without `role="status"`.
- **Solution:** Add `role="status" aria-live="polite" aria-label="Chat wird geladen"`.

#### Fix 39: Tool Activity Semantic Structure
- **File:** `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- **Problem:** Tool results have no semantic HTML structure.
- **Solution:** Wrap in `<ol aria-label="KI-Tool-Aktivitaeten">` with `<li>` per tool result.

#### Fix 40: Sidebar Status ARIA
- **File:** `frontend/src/components/layout/Sidebar.tsx`
- **Problem:** Status dots communicate state through color only.
- **Solution:** Add `aria-label="Datenbank: verbunden"` / `"KI: aktiv"` to status indicators.

#### Fix 41: Sidebar Favorites ARIA
- **File:** `frontend/src/components/layout/Sidebar.tsx`
- **Problem:** Favorite button missing pressed state.
- **Solution:** Add `aria-pressed={isFavorited?.(item.page) ? 'true' : 'false'}`.

#### Fix 42: Focus Trap Improvement
- **File:** `frontend/src/components/GeneralChat/GeneralChat.tsx`
- **Problem:** Manual Tab trap implementation, fragile with nested modals.
- **Solution:** Use `focus-trap-react` library or improve manual implementation with `inert` attribute on background content.

#### Fix 43: Confidence Indicators on AI Responses
- **File:** `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- **Problem:** No visibility into retrieval quality for RAG-sourced responses.
- **Solution:** Subtle badge next to AI responses:
  - Green dot (>0.8): High confidence
  - Amber dot (0.5-0.8): Medium confidence
  - Red dot (<0.5): Low confidence, may be inaccurate
  - Tooltip shows: "Basierend auf X Quellen, Konfidenz: Y%"
  - Only shown when `retrievalConfidence` field present in response.

#### Fix 44: Reasoning Transparency Labels
- **File:** `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- **Problem:** Tool labels show technical names ("recall", "web_search") without explaining why.
- **Solution:** Enhanced TOOL_LABELS map with action descriptions:
  - "recall" → "Durchsucht Erinnerungen nach relevantem Wissen..."
  - "web_search" → "Sucht im Web nach aktuellen Informationen..."
  - "analyze_project" → "Analysiert die Projektstruktur..."

#### Fix 45: Source Citations
- **Files:** `backend/src/routes/general-chat.ts` (add `sources` to response), `backend/src/services/enhanced-rag.ts` (return source metadata), `frontend/src/components/GeneralChat/ChatMessageList.tsx` (render citations)
- **Depends on:** Fix 23 (retrievalConfidence in response)
- **Problem:** RAG-sourced responses don't show which documents/facts were used.
- **Backend:** `enhanced-rag.ts` returns `sources: Array<{ id, title, snippet, score, type }>` alongside results. `general-chat.ts` includes this in SSE response as `sources` field.
- **Frontend:** When response includes `sources` array:
  - Inline citation markers `[1]`, `[2]` in text
  - Expandable footer with source details (title, snippet, confidence)
  - Click citation to highlight source
- **Tests:** Backend: unit test for source metadata extraction. Frontend: render test for citation markers.

#### Fix 46: Skeleton Loading Consistency
- **Files:** Various page components
- **Problem:** Inconsistent loading states (some spinner, some skeleton, some text).
- **Solution:** Unified skeleton patterns per page type:
  - Chat: 3 message bubbles skeleton
  - Dashboard: 4 stat cards + 2 chart areas
  - List pages: 5 row skeletons
  - Detail pages: Header + content block skeleton

#### Fix 47-50: Accessibility Audit Phase (Grouped — discovery + fix)

These 4 items are **audit tasks** that produce specific findings, then fixes. Each runs as a sub-agent that outputs a concrete list of violations.

**Fix 47: Keyboard Navigation**
- **Audit command:** Manual test of CommandPalette, Sidebar, KanbanBoard, Modal, Tabs components with keyboard only.
- **Expected fixes:** Add `onKeyDown` handlers for arrow/Home/End keys where missing. Fix tab order with `tabIndex`.

**Fix 48: Color Contrast**
- **Audit command:** `npx pa11y-ci --config .pa11yci.json` or manual check with browser DevTools accessibility panel.
- **Expected fixes:** Adjust text colors in CSS custom properties to meet 4.5:1 ratio (WCAG AA).

**Fix 49: Dark Mode Hardcoded Colors**
- **Audit command:** `grep -rn 'color:.*#\|background:.*#\|border:.*#' frontend/src/ --include='*.css' --include='*.tsx' | grep -v 'var(--'`
- **Expected fixes:** Replace hardcoded hex colors with `var(--ds-*)` design tokens.

**Fix 50: Mobile Touch Targets**
- **Audit command:** Chrome DevTools → Rendering → Show touch target sizes on mobile viewport (375px).
- **Expected fixes:** Add `min-height: 44px; min-width: 44px` to interactive elements below threshold.

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Backend Quality Score | 7.8/10 | 9.5/10 |
| Frontend Quality Score | 8.2/10 | 9.5/10 |
| RAG Pipeline Score | 8.5/10 | 9.5/10 |
| Memory System Score | 7.0/10 | 9.0/10 |
| Security Score | 7.5/10 | 9.5/10 |
| Accessibility Score | 7.5/10 | 9.5/10 |
| Backend Tests | 4734 | 4800+ |
| Frontend Tests | 664 | 700+ |
| `as any` Count | 24 | 0 |
| All Tests Passing | Yes | Yes |
| Build Clean | Yes | Yes |

## Cross-Fix Dependencies

```
Fix 5 (HyDE Timeout) ──┐
Fix 18 (Dynamic Weights)──┤
                          ├──→ Fix 23 (Confidence Score) ──→ Fix 43 (Confidence UI)
                          │                                └──→ Fix 45 (Source Citations)
Fix 16 (Contextual Retrieval) ──→ Fix 24 (Self-RAG Critique)
Fix 17 (Tool Search) ──→ Fix 44 (Reasoning Labels must handle unknown tools)
Fix 21 (Memory Tools) ──→ Fix 44 (TOOL_LABELS update for 3 new tools)
Fix 26 (State Machine) ──→ Fix 28 (Streaming Tests — test new state machine)
```

**Execution order within waves:**
- Wave 1: Fixes 1-15 are independent (parallel). Fixes 16-20 parallel. Fix 21 after 17. Fix 23 after 5+18. Fix 24 after 16. Fix 25 independent.
- Wave 2: Fixes 26-37 mostly independent (26 before 28). Fix 43 after Wave 1 Fix 23. Fix 44 after Wave 1 Fix 17+21. Fix 45 after Wave 1 Fix 23.

## Execution Plan

- **Wave 1 (Backend + AI):** 2 parallel workers, 25 fixes
  - Worker A: Fixes 1-15 (Backend Hardening)
  - Worker B: Fixes 16-25 (AI Core Evolution)
- **Wave 2 (Frontend + UX):** 2 parallel workers, 25 fixes
  - Worker C: Fixes 26-37 (Frontend Architecture)
  - Worker D: Fixes 38-50 (Accessibility & UX)
  - Note: Fixes 43, 44, 45 depend on Wave 1 completion
- **Review Round:** Cross-integration, full test run, quality re-assessment
- **Total:** 50 targeted fixes across all dimensions
