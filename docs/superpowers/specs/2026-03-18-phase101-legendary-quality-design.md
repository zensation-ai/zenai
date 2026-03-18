# Phase 101: Legendary Quality — Design Spec

> **Status:** Approved
> **Date:** 2026-03-18
> **Goal:** Elevate ZenAI from 8.2/10 to 9.5+/10 across all quality dimensions
> **Strategy:** 7 parallel workers, each going deep into one domain

## Context

ZenAI is at Phase 100 with 5715 tests, 55 tools, and a mature architecture. The codebase audit reveals:
- **No circuit breakers** around external APIs (Claude, Brave, Supabase)
- **No formal RAG evaluation metrics** (Precision@k, MRR)
- **CSS cubic-bezier everywhere** instead of spring-physics
- **113 inline styles** with hardcoded colors outside design tokens
- **Missing focus traps** in modals, no skip-link, no axe-core tests
- **Generic error messages** ("An unexpected error occurred") instead of contextual German UX
- **Response types not enforced** — routes can deviate from `{ success, data }` contract

Research basis: Cursor agent architecture, Letta/MemGPT memory, ICLR 2026 MemAgents, Anthropic Contextual Retrieval, CRAG, A-RAG (arXiv:2602.03442), Linear design system, neuroscience of cognitive load (Miller's Law, Hick's Law, dopamine micro-loops).

---

## Worker A: Backend Resilience

### A1: Circuit Breaker Class

**New file:** `backend/src/utils/circuit-breaker.ts`

Generic, reusable circuit breaker with 3 states:

```typescript
interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;    // failures before OPEN
  resetTimeoutMs: number;      // time in OPEN before HALF_OPEN
  halfOpenMaxAttempts: number;  // test requests in HALF_OPEN
  monitorWindowMs: number;     // sliding window for failure counting
}

class CircuitBreaker {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
  getStats(): { state, failures, lastFailure, lastSuccess };
}
```

- Sliding window failure tracking (not cumulative)
- EventEmitter for state transitions (logs + metrics)
- Optional fallback function executed in OPEN state
- Thread-safe (single Node.js event loop)

### A2: Claude API Circuit Breaker

**Modified file:** `backend/src/services/claude/streaming.ts`

- Wrap `anthropic.messages.stream()` in circuit breaker
- Config: `failureThreshold: 3, resetTimeoutMs: 60_000, halfOpenMaxAttempts: 1`
- OPEN fallback chain:
  1. Ollama local model (if `OLLAMA_URL` configured)
  2. Cached similar response (if RAG cache has high-confidence match)
  3. SSE error: `"KI voruebergehend nicht erreichbar. Bitte in einer Minute erneut versuchen."`
- Breaker state exposed via `/api/health/detailed`

### A3: Brave Search Circuit Breaker

**Modified file:** `backend/src/services/web-search.ts`

- Wrap Brave API call in circuit breaker
- Config: `failureThreshold: 5, resetTimeoutMs: 120_000`
- OPEN fallback: DuckDuckGo (already exists, just wire through breaker)
- Log state transitions to observability metrics

### A4: Database Circuit Breaker

**Modified file:** `backend/src/utils/database-context.ts`

- Monitor pool error rate via existing pool event listeners
- Config: `failureThreshold: 5 errors in 30s window`
- OPEN state: Return 503 `"Datenbank wird wiederhergestellt"` immediately
- HALF_OPEN: Single test query `SELECT 1` before reopening
- Integrate with pool stats already tracked in Phase 67

### A5: Centralized Timeout Config

**New file:** `backend/src/config/timeouts.ts`

```typescript
export const TIMEOUTS = {
  CLAUDE_STREAM: 90_000,
  CLAUDE_TOOL_BUDGET: 60_000,
  WEB_SEARCH: 10_000,
  WEB_SEARCH_DEEP_FETCH: 5_000,
  DB_QUERY: 5_000,
  HYDE_GENERATION: 5_000,
  REQUEST_DEFAULT: 30_000,
  REQUEST_STREAMING: 120_000,
  REQUEST_VISION: 180_000,
  CIRCUIT_BREAKER_CLAUDE: 60_000,
  CIRCUIT_BREAKER_BRAVE: 120_000,
  CIRCUIT_BREAKER_DB: 30_000,
} as const;
```

Replace all hardcoded timeout values in `streaming.ts` (90_000), `web-search.ts` (10_000), `request-timeout.ts` (30_000/120_000/180_000) with imports from this config.

### A6: Graceful Degradation Hierarchy

**Modified file:** `backend/src/services/claude/streaming.ts`

Formalized fallback chain as explicit code path:

```
1. Claude API (primary) — circuit breaker protected
2. Ollama local (if configured) — circuit breaker protected
3. Cached RAG response (if confidence > 0.8)
4. Heuristic response (Phase 74 HeuristicProvider, server-side)
5. Error with retry suggestion (never blank screen)
```

Each level logged to AI trace service (Phase 73) with `fallback_level` tag.

### A7: Tests

- `backend/src/__tests__/unit/utils/circuit-breaker.test.ts`: State transitions, sliding window, fallback execution, concurrent access, stats reporting (~35 tests)

---

## Worker B: RAG & Memory Evolution

### B1: Formal RAG Evaluation Metrics

**New file:** `backend/src/services/rag-evaluation.ts`

Per-query metrics logged automatically after each retrieval:

```typescript
interface RAGEvaluation {
  queryId: string;
  strategy: 'hyde' | 'agentic' | 'graphrag' | 'arag' | 'direct';
  precisionAt5: number;    // relevant docs in top 5 / 5
  precisionAt10: number;   // relevant docs in top 10 / 10
  mrr: number;             // 1 / rank of first relevant doc
  ndcg: number;            // normalized discounted cumulative gain
  latencyMs: number;
  resultCount: number;
  confidenceScore: number; // from CRAG quality gate
}
```

- Relevance determined by: (a) CRAG confidence tier, (b) cross-encoder score threshold > 0.6
- Stored in `rag_evaluation_metrics` table (new, x4 schemas)
- Dashboard endpoint: `GET /api/:context/rag/evaluation?days=7`
- Aggregates: mean/p50/p95 per strategy, trend over time

**New migration:** `backend/sql/migrations/phase101_rag_evaluation.sql`

### B2: Conversation Search Tools

**New file:** `backend/src/services/tool-handlers/conversation-search.ts`

Two new Claude tools closing the Letta gap:

**`conversation_search`:**
- Full-text + embedding search over `chat_messages` table
- Input: `{ query: string, limit?: number }`
- Returns: Top-k messages with session context, timestamps, similarity scores
- Uses hybrid search: BM25 (`ts_vector` on message content) + embedding cosine similarity
- RRF merge (k=60)

**`conversation_search_date`:**
- Date-filtered conversation search
- Input: `{ query: string, start_date: string, end_date: string, limit?: number }`
- Returns: Messages within time window matching query
- Useful for "What did we discuss last week about X?"

Both registered in tool-handlers.ts with German labels:
- `conversation_search`: "Konversationssuche — Durchsucht vergangene Gespraeche"
- `conversation_search_date`: "Zeitbasierte Konversationssuche — Sucht in einem Zeitfenster"

### B3: Memory Benchmark Framework

**New file:** `backend/src/services/memory/memory-benchmark.ts`

Automated memory quality testing:

```typescript
interface BenchmarkResult {
  totalFacts: number;
  retrievedCorrectly: number;
  recallAtK: number;         // k=5
  averageRetrievalLatency: number;
  contradictionsFound: number;
  staleFactsFound: number;   // facts with very low retrieval score
}
```

Process:
1. Sample 50 random facts from `learned_facts`
2. For each: generate a natural-language query that should retrieve it
3. Run retrieval pipeline, check if fact appears in top-5
4. Calculate Recall@5, log results
5. Scheduled weekly via BullMQ job queue

Endpoint: `GET /api/:context/memory/benchmark` (returns last benchmark result)

### B4: memory_rethink Tool

**Modified file:** `backend/src/services/tool-handlers/memory-self-editing.ts`

New tool complementing `memory_replace`:

```typescript
// memory_rethink: Agent reflects on existing memory and revises contextually
// Input: { fact_id: string, new_context: string }
// Process: Loads fact + related facts, Claude generates revised version
//          that incorporates new context while preserving core truth
// Output: Updated fact with revision reason
```

Unlike `memory_replace` (direct overwrite), `memory_rethink` uses Claude to synthesize old fact + new context into an improved version. Tracks revision chain via `superseded_by`.

### B5: Query Routing (Simple vs Complex)

**Modified file:** `backend/src/services/enhanced-rag.ts`

Pre-classification before retrieval:

```typescript
function classifyQueryComplexity(query: string): 'simple' | 'complex' {
  // Simple: < 10 words, no comparison keywords, no causal keywords
  // Complex: multi-part, comparison, temporal, causal
  const wordCount = query.split(/\s+/).length;
  const hasComplexSignals = /vergleich|warum|wieso|unterschied|einerseits|vs\.?|pros?\s*(und|&)|cons?/i.test(query);
  return (wordCount < 10 && !hasComplexSignals) ? 'simple' : 'complex';
}
```

- Simple queries: Direct HyDE + semantic search (skip A-RAG overhead, ~500ms faster)
- Complex queries: Full A-RAG pipeline
- Logged to RAG evaluation metrics for comparison

### B6: Tests

- `backend/src/__tests__/unit/services/rag-evaluation.test.ts`: Metric calculation, aggregation, edge cases (~25 tests)
- `backend/src/__tests__/unit/services/conversation-search.test.ts`: Hybrid search, date filtering, RRF merge (~20 tests)
- `backend/src/__tests__/unit/services/memory-benchmark.test.ts`: Benchmark pipeline, scoring (~15 tests)

---

## Worker C: Motion & Neuroscience

### C1: Spring-Physics System

**New file:** `frontend/src/design-system/springs.ts`

Dual-export: CSS `linear()` approximations + framer-motion configs.

```typescript
export const springs = {
  snappy:  { stiffness: 400, damping: 30, mass: 1 },   // buttons, toggles
  gentle:  { stiffness: 170, damping: 26, mass: 1 },   // page transitions
  bouncy:  { stiffness: 300, damping: 10, mass: 1 },   // signature moments
  stiff:   { stiffness: 500, damping: 40, mass: 1 },   // tooltips, popovers
  wobbly:  { stiffness: 180, damping: 12, mass: 1 },   // playful micro-interactions
} as const;

// CSS linear() approximations for non-JS contexts
export const springCSS = {
  snappy:  'linear(0, 0.25 8%, 0.74 20%, 0.96 35%, 1.01 48%, 1 60%, 0.99 80%, 1)',
  gentle:  'linear(0, 0.19 8%, 0.58 20%, 0.84 35%, 0.96 50%, 1.01 65%, 1 80%, 1)',
  // ... etc
} as const;
```

### C2: Motion Variants Library

**New file:** `frontend/src/design-system/motion-variants.ts`

Standardized framer-motion variants replacing all ad-hoc `initial/animate`:

```typescript
export const motionVariants = {
  fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slideUp: { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } },
  scaleIn: { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 } },
  listItem: { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 } },
  stagger: { animate: { transition: { staggerChildren: 0.05 } } },
};
```

Each variant auto-uses spring preset from `springs.ts`. Each has `reducedMotion` alternative (opacity-only).

### C3: 5 Signature Moments

**New file:** `frontend/src/components/effects/SignatureMoments.tsx`

5 neuroscience-designed reward animations (dopamine micro-loops):

| Moment | Trigger | Animation | Duration |
|--------|---------|-----------|----------|
| Idea Created | `ideaCreated` event | Radial glow from cursor + 3 floating particles | 500ms |
| Task Completed | Status → 'done' | SVG checkmark draw + mini confetti burst (6 particles) | 600ms |
| Memory Stored | `memoryStored` event | Concentric pulse wave from center | 400ms |
| AI Response Complete | Stream end | Subtle shimmer gradient sweep left-to-right | 300ms |
| Context Switch | Context change | Morphing color shift on TopBar accent | 350ms |

Implementation:
- Render via React Portal (overlay, no layout impact)
- Canvas-based particles (no DOM nodes per particle)
- Each respects `prefers-reduced-motion` (replaced with subtle opacity flash)
- Event-driven: components emit events, SignatureMoments listens globally

### C4: prefers-reduced-motion System

**Modified file:** `frontend/src/index.css` (global layer)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Plus: `springs.ts` exports `useReducedMotion()` hook that returns simplified variants (opacity-only transitions, no scale/translate).

### C5: Progressive Disclosure on AI Responses

**New file:** `frontend/src/components/GeneralChat/CollapsibleResponse.tsx`

- AI responses > 500 characters: Show first 3 lines + gradient fade
- "Vollstaendig anzeigen" button expands with `springs.gentle` animation
- Metadata (ConfidenceBadge, ToolDisclosure, ThinkingBlock) always visible above fold
- Short responses (< 500 chars) render normally (no collapse)
- User preference: "Immer vollstaendig anzeigen" toggle in Settings/AI

### C6: Migration of Existing Animations

**Modified files:** ~15 components

Replace all `transition: ... cubic-bezier(...)` and ad-hoc framer-motion configs with:
- CSS: `transition: ... var(--spring-snappy)` or `transition-timing-function: ${springCSS.gentle}`
- JS: `<motion.div variants={motionVariants.fadeIn} transition={{ type: 'spring', ...springs.gentle }}>`

Priority components: SuggestionCard, ToolDisclosure, ThinkingBlock, Sidebar, CommandPalette, ChatMessageList, Dashboard cards.

### C7: Tests

- `frontend/src/__tests__/motion-system.test.ts`: Spring config validation, reduced-motion variants, variant completeness (~15 tests)

---

## Worker D: Design System Consolidation

### D1: Opacity Tokens

**Modified file:** `frontend/src/design-system/tokens.ts`

```typescript
export const opacity = {
  muted: 0.6,      // secondary text, inactive icons
  subtle: 0.4,     // placeholder text, dividers
  ghost: 0.2,      // background overlays
  disabled: 0.38,  // disabled elements (WCAG compliant)
  hover: 0.08,     // hover overlay on surfaces
  pressed: 0.12,   // pressed state overlay
} as const;
```

CSS variables generated: `--opacity-muted: 0.6`, etc.

### D2: Inline Style Elimination

**Modified files:** ~25 components

Systematic migration. For each component with inline `style={{ color: '#xxx' }}`:
1. Create CSS class using `var(--token-name)`
2. Replace inline style with className
3. Verify visual parity

Target components (identified in audit):
- IncubatorPage.tsx (~8 inline styles)
- ProactiveRulesPanel.tsx (~6 inline styles)
- CommandPalette.tsx (~4 inline styles)
- Dashboard QuickActions (~5 inline styles)
- AgentTeamsPage.tsx (~7 inline styles)
- CanvasPage.tsx (~4 inline styles)
- HubPage.tsx (~3 inline styles)
- GovernanceDashboard.tsx (~5 inline styles)
- ExtensionMarketplace.tsx (~4 inline styles)
- ~10 additional smaller components

### D3: Animation Duration Token References

**Modified files:** SuggestionCard.tsx, and any component with hardcoded `setTimeout` animation delays

```typescript
// BEFORE
setTimeout(cb, 280);

// AFTER
import { animations } from '../../design-system/tokens';
setTimeout(cb, animations.duration.layout); // 280
```

### D4: Shadow Token Migration

**Modified files:** ConfidenceBadge.tsx, SuggestionCard.tsx, SmartSurface.tsx

Replace inline `boxShadow: '0 2px 12px rgba(...)'` with design-system shadow tokens:
```typescript
import { shadows } from '../../design-system/tokens';
// boxShadow: shadows.light.card
```

### D5: CSS Variable Audit Script

**New file:** `scripts/audit-hardcoded-styles.ts`

```typescript
// Scans all .tsx and .css files outside design-system/ for:
// - #[0-9a-fA-F]{3,8} (hex colors)
// - rgb(, rgba( (rgb colors)
// - opacity: 0.X (hardcoded opacity)
// - font-size: Xpx (hardcoded font size)
// Output: JSON report with file, line, value, suggested token
```

Can be run as `npm run audit:styles`. Future: integrate into CI as warning.

### D6: Tests

- `frontend/src/__tests__/design-tokens.test.ts`: Token completeness, opacity coverage, no undefined tokens (~10 tests)

---

## Worker E: Accessibility Excellence

### E1: Focus Trap Hook

**New file:** `frontend/src/hooks/useFocusTrap.ts`

```typescript
function useFocusTrap(containerRef: RefObject<HTMLElement>, options?: {
  enabled?: boolean;
  onEscape?: () => void;
  initialFocusRef?: RefObject<HTMLElement>;
  returnFocusOnDeactivate?: boolean;
}): void;
```

Behavior:
- Tab cycles within container (wraps from last to first focusable element)
- Shift+Tab cycles backward
- Escape calls `onEscape` callback
- On mount: focus `initialFocusRef` or first focusable element
- On unmount: return focus to previously focused element

Applied to:
- CommandPalette (currently missing)
- ServerSetupWizard
- MobileSidebarDrawer
- All Modal instances (design-system Modal already has partial support — verify and complete)

### E2: Skip Link

**Modified file:** `frontend/src/components/layout/AppLayout.tsx`

```tsx
// First element in DOM
<a
  href="#main-content"
  className="skip-link"
  // Visually hidden, visible on focus
>
  Zum Hauptinhalt springen
</a>

// On content container
<main id="main-content" tabIndex={-1}>
  {children}
</main>
```

CSS for `.skip-link`:
```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  z-index: 10000;
  padding: 8px 16px;
  background: var(--accent-primary);
  color: white;
  transition: top 0.15s;
}
.skip-link:focus {
  top: 0;
}
```

### E3: Card Keyboard Navigation

**Modified files:** Dashboard cards, IdeasPage cards, ContactsPage cards

All interactive card components receive:
```tsx
<div
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }}
  aria-label={cardTitle}
>
```

### E4: axe-core Integration

**New file:** `frontend/src/__tests__/accessibility.test.tsx`

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

// Test 5 critical pages
const pages = ['ChatSkeleton', 'DashboardSkeleton', 'QueryErrorState', 'ConfidenceBadge', 'ToolDisclosure'];

pages.forEach(page => {
  test(`${page} has no accessibility violations`, async () => {
    const { container } = render(<Component />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**New dev dependency:** `jest-axe` (or `vitest-axe` for vitest)

### E5: ARIA Live Region Additions

**Modified files:**

| Component | Addition |
|-----------|----------|
| Error Toast (showToast) | `aria-live="assertive"` on toast container |
| SmartSurface | `aria-live="polite"` on suggestion container |
| OfflineIndicator | `role="alert"` (already has `aria-live`) |
| Chat tool activity | `aria-live="polite"` on tool activity area |

### E6: Color Contrast Fixes

**Modified file:** `frontend/src/design-system/colors.ts`

Audit `--text-secondary` against all surface colors in both light and dark mode.

Known issues (from audit):
- Dark mode: `--text-secondary` against `--surface-tertiary` may be < 4.5:1
- Fix: Increase `--text-secondary` lightness in dark mode from `hsl(220, 15%, 55%)` to `hsl(220, 15%, 65%)`

### E7: Tests

- `frontend/src/__tests__/accessibility.test.tsx`: 5 critical pages (~10 tests)
- `frontend/src/__tests__/hooks/useFocusTrap.test.ts`: Tab cycling, escape, focus restore (~12 tests)

---

## Worker F: Error UX & Empty States

### F1: Contextual Empty States

**Modified files:** 8 main pages

Each page gets a specific empty state instead of generic "No items":

| Page | Empty State Title | Description | CTA |
|------|------------------|-------------|-----|
| IdeasPage | "Dein erster Gedanke wartet" | "Halte Ideen fest, entwickle sie weiter und lass die KI Verbindungen entdecken." | "Neue Idee erstellen" |
| DocumentVaultPage | "Deine Wissensbasis ist leer" | "Lade Dokumente hoch und die KI macht sie durchsuchbar." | "Dokument hochladen" |
| PlannerPage (Tasks) | "Keine Aufgaben vorhanden" | "Erstelle Aufgaben oder konvertiere Ideen in konkrete Schritte." | "Neue Aufgabe" |
| ContactsPage | "Noch keine Kontakte" | "Fuege Kontakte hinzu und die KI hilft dir, Beziehungen zu pflegen." | "Kontakt hinzufuegen" |
| EmailPage | "Posteingang leer" | "Verbinde ein E-Mail-Konto um loszulegen." | "Konto verbinden" |
| FinancePage | "Keine Finanzdaten" | "Erstelle dein erstes Konto um Finanzen zu tracken." | "Konto erstellen" |
| AgentTeamsPage | "Keine Ausfuehrungen" | "Starte dein erstes KI-Team um komplexe Aufgaben zu loesen." | "Team starten" |
| LearningDashboard | "Lernreise beginnen" | "Die KI erkennt Wissenslucken und schlaegt Lernpfade vor." | "Thema erkunden" |

Uses existing `EmptyState` design-system component with contextual Lucide icons.

### F2: German Error Messages

**New file:** `backend/src/utils/error-messages-de.ts`

```typescript
export const ERROR_MESSAGES_DE: Record<string, string> = {
  NETWORK_ERROR: 'Verbindung zum Server unterbrochen. Bitte Internetverbindung pruefen.',
  AI_UNAVAILABLE: 'KI voruebergehend nicht erreichbar. Bitte in einer Minute erneut versuchen.',
  RATE_LIMIT: 'Zu viele Anfragen. Bitte kurz warten.',
  NOT_FOUND: 'Die angeforderte Ressource wurde nicht gefunden.',
  VALIDATION_ERROR: 'Die Eingabe ist ungueltig. Bitte ueberpruefen.',
  DB_ERROR: 'Datenbankfehler. Bitte spaeter erneut versuchen.',
  TIMEOUT: 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.',
  UNAUTHORIZED: 'Nicht autorisiert. Bitte erneut anmelden.',
  FORBIDDEN: 'Keine Berechtigung fuer diese Aktion.',
  CONFLICT: 'Konflikt mit bestehenden Daten.',
  TOOL_ERROR: 'Ein Werkzeug konnte nicht ausgefuehrt werden.',
  STREAMING_ERROR: 'Fehler bei der Echtzeit-Verbindung.',
};
```

**Modified file:** `backend/src/middleware/errorHandler.ts`

- Import error messages map
- In production: Use German message based on error code
- In development: Keep full English error details

### F3: Collapsible AI Response

**New file:** `frontend/src/components/GeneralChat/CollapsibleResponse.tsx`

```typescript
interface CollapsibleResponseProps {
  content: string;
  threshold?: number;  // default 500 chars
  metadata?: ReactNode; // ConfidenceBadge, ToolDisclosure etc. — always visible
}
```

- Content > threshold: Show first 3 lines + gradient overlay
- Expand button: "Vollstaendig anzeigen" with spring animation
- Collapse button: "Weniger anzeigen"
- Settings toggle: "Antworten immer vollstaendig anzeigen" bypasses collapse

### F4: Tool Error Surfacing

**Modified file:** `frontend/src/components/GeneralChat/ToolDisclosure.tsx`

Currently: Failed tools silently skipped.
After: Failed tools show inline error:

```tsx
{tool.status === 'error' && (
  <span className="tool-disclosure-error">
    <AlertCircle size={12} />
    Fehlgeschlagen
    {onRetry && <button onClick={() => onRetry(tool.name)}>Erneut</button>}
  </span>
)}
```

Red badge with error icon. Optional retry button (if tool supports retry).

### F5: Offline Queue Status

**Modified file:** `frontend/src/components/OfflineIndicator.tsx`

Enhanced from simple banner to informative status:

```tsx
// BEFORE: "Sie sind offline"
// AFTER:
<div className="offline-indicator">
  <WifiOff size={16} />
  <span>Offline — {pendingCount} Aenderungen warten auf Sync</span>
  {expanded && (
    <ul className="offline-queue">
      {pendingItems.map(item => (
        <li key={item.id}>{item.type}: {item.summary}</li>
      ))}
    </ul>
  )}
</div>
```

### F6: Tests

- `frontend/src/__tests__/empty-states.test.tsx`: Each page renders correct empty state (~8 tests)
- `frontend/src/__tests__/collapsible-response.test.tsx`: Collapse/expand, threshold, settings override (~8 tests)

---

## Worker G: Type Safety & Testing

### G1: ApiResponse Branded Type

**New file:** `backend/src/types/api-response.ts`

```typescript
export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId?: string;
};

export type ApiError = {
  success: false;
  error: string;
  code: string;
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Helper functions
export function successResponse<T>(data: T, requestId?: string): ApiSuccess<T>;
export function errorResponse(error: string, code: string, requestId?: string): ApiError;
```

Gradually migrate route handlers to use `successResponse()` / `errorResponse()` instead of raw object literals. Start with 10 most-used routes.

### G2: Branded Context Type

**New file:** `backend/src/types/context.ts`

```typescript
export type AIContext = 'personal' | 'work' | 'learning' | 'creative';

export function validateContext(value: string): AIContext {
  const valid: AIContext[] = ['personal', 'work', 'learning', 'creative'];
  if (!valid.includes(value as AIContext)) {
    throw new ValidationError(`Invalid context: ${value}`);
  }
  return value as AIContext;
}

export function getContextFromRequest(req: Request): AIContext {
  return validateContext(req.params.context);
}
```

Replace `req.params.context as string` with `getContextFromRequest(req)` in route handlers. Start with 10 most-used routes.

### G3: Chat-RAG-Response Integration Test

**New file:** `backend/src/__tests__/integration/chat-rag-flow.test.ts`

End-to-end test of the core chat pipeline:

```typescript
describe('Chat → RAG → Response Flow', () => {
  // Mock only: Claude API responses
  // Real: database, RAG pipeline, tool handlers, memory

  test('simple query uses direct retrieval (skip A-RAG)', async () => {
    // Send short query → verify HyDE path taken → verify response format
  });

  test('complex query uses full A-RAG pipeline', async () => {
    // Send multi-part query → verify strategy agent called → verify results merged
  });

  test('tool-assisted query executes tools and includes results', async () => {
    // Send "search for X" → verify web_search tool called → verify results in response
  });

  test('low-confidence retrieval triggers CRAG reformulation', async () => {
    // Mock low-score results → verify reformulation → verify retry
  });

  test('streaming response includes tool activity events', async () => {
    // SSE stream → verify tool_use_start/end events → verify final response
  });
});
```

~15 tests covering the happy path and major branch points.

### G4: Memory Consistency Integration Test

**New file:** `backend/src/__tests__/integration/memory-consistency.test.ts`

```typescript
describe('Memory Pipeline Consistency', () => {
  test('stored fact is retrievable via recall', async () => {
    // remember("X is Y") → recall("What is X?") → verify Y in results
  });

  test('updated fact supersedes old version', async () => {
    // remember("X is A") → memory_replace("X is B") → recall → verify B, not A
  });

  test('emotional facts have higher retrieval priority', async () => {
    // Store neutral fact + emotional fact → recall → verify emotional ranks higher
  });

  test('procedural memory recalls similar procedures', async () => {
    // Record procedure → recall similar trigger → verify procedure returned
  });
});
```

~12 tests covering HiMeS pipeline.

### G5: Concurrent Stress Test

**New file:** `backend/src/__tests__/stress/concurrent-operations.test.ts`

```typescript
describe('Concurrent Operations', () => {
  test('50 parallel chat requests complete without deadlock', async () => {
    const requests = Array(50).fill(null).map(() => sendChatMessage(...));
    const results = await Promise.allSettled(requests);
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThan(45); // allow ~10% failure under load
  });

  test('100 parallel idea creates maintain data integrity', async () => {
    // Create 100 ideas → verify all saved → verify no duplicates → verify correct user_id
  });

  test('20 parallel memory writes maintain consistency', async () => {
    // Write 20 facts → verify all persisted → verify no data corruption
  });
});
```

~8 tests. Timeout: 60s per test.

### G6: Frontend Streaming Edge Cases

**New file:** `frontend/src/__tests__/streaming-edge-cases.test.ts`

```typescript
describe('Streaming Edge Cases', () => {
  test('rapid cancelStream does not leave orphaned state');
  test('multiple SSE errors trigger reconnect');
  test('tool-use during streaming updates UI correctly');
  test('AbortController cleanup on unmount');
  test('concurrent streams from different sessions isolated');
});
```

~8 tests using vitest + mock SSE.

### G7: Tests Summary

Total new tests across Worker G: ~55 tests

---

## Database Migration

**New file:** `backend/sql/migrations/phase101_legendary_quality.sql`

```sql
-- Worker B: RAG Evaluation Metrics
CREATE TABLE IF NOT EXISTS {schema}.rag_evaluation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID,
  strategy VARCHAR(50) NOT NULL,
  precision_at_5 REAL,
  precision_at_10 REAL,
  mrr REAL,
  ndcg REAL,
  latency_ms INTEGER,
  result_count INTEGER,
  confidence_score REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_{schema}_rag_eval_strategy ON {schema}.rag_evaluation_metrics(strategy, created_at);
CREATE INDEX idx_{schema}_rag_eval_date ON {schema}.rag_evaluation_metrics(created_at);
```

Applied to all 4 schemas (personal, work, learning, creative).

---

## Summary

| Worker | New Files | Modified Files | New Tests |
|--------|-----------|----------------|-----------|
| A: Resilience | 2 | 3 | ~35 |
| B: RAG & Memory | 4 | 3 | ~60 |
| C: Motion | 4 | ~15 | ~15 |
| D: Design Tokens | 1 | ~25 | ~10 |
| E: Accessibility | 2 | ~10 | ~22 |
| F: Error UX | 2 | ~12 | ~16 |
| G: Type Safety | 7 | ~20 | ~55 |
| **Total** | **22** | **~88** | **~213** |

**Target Quality Score:** 8.2/10 → 9.5+/10

**Target Test Count:** 5715 → ~5928
