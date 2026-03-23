# Cockpit Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the cockpit UI from ~65% to 100% — wire real data, session management, shortcuts, mobile layout, search, and polish.

**Architecture:** 8 tasks in dependency order. Session management first (foundation), then shortcuts + dashboard (depend on sessions), then independent features (search, mobile, quick-actions, rail, touch). Each task produces a working commit.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Framer Motion, Lucide icons, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-cockpit-completion-design.md`

---

## Chunk 1: Foundation (Tasks 1-3)

### Task 1: Chat Session Management Hook

**Files:**
- Create: `frontend/src/hooks/useCockpitSessions.ts`
- Create: `frontend/src/__tests__/hooks/useCockpitSessions.test.ts`

- [ ] **Step 1: Write failing tests for the session hook**

```typescript
// frontend/src/__tests__/hooks/useCockpitSessions.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
});

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'new-session-id' } } }),
    get: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
}));

describe('useCockpitSessions', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it('auto-creates a session on first launch when none exist', async () => {
    // Test that hook calls createSession automatically
  });

  it('restores sessions from localStorage', () => {
    mockStorage['zenai-cockpit-sessions'] = JSON.stringify({
      sessions: [{ id: 's1', title: 'Chat 1' }, { id: 's2', title: 'Chat 2' }],
      activeSessionId: 's2',
    });
    // Verify sessions restored
  });

  it('creates a new session and adds tab', async () => {
    // Call createSession, verify tab appears
  });

  it('switches session by id', () => {
    // Set up 2 sessions, switch to second, verify activeSessionId
  });

  it('switchToPrev wraps around to last', () => {
    // 3 sessions, active = first, switchToPrev → last
  });

  it('switchToNext wraps around to first', () => {
    // 3 sessions, active = last, switchToNext → first
  });

  it('closes session and activates next', () => {
    // Close middle session, verify next is activated
  });

  it('prevents closing last session', () => {
    // Only 1 session, close → still 1 session
  });

  it('persists to localStorage on every change', () => {
    // Create + close → check localStorage was updated
  });

  it('limits visible tabs to 8', () => {
    // Create 10 sessions, verify sessions.length still returns all
    // but a computed visibleSessions returns 8
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/hooks/useCockpitSessions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useCockpitSessions hook**

```typescript
// frontend/src/hooks/useCockpitSessions.ts
import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import type { AIContext } from '../components/ContextSwitcher';

interface CockpitSession {
  id: string;
  title: string;
  createdAt?: string;
}

interface CockpitSessionsState {
  sessions: CockpitSession[];
  activeSessionId: string | null;
}

const STORAGE_KEY = 'zenai-cockpit-sessions';
const MAX_VISIBLE = 8;

function loadFromStorage(): CockpitSessionsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { sessions: [], activeSessionId: null };
}

function saveToStorage(state: CockpitSessionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function useCockpitSessions(context: AIContext) {
  const [state, setState] = useState<CockpitSessionsState>(loadFromStorage);

  // Persist on every change
  useEffect(() => { saveToStorage(state); }, [state]);

  // Auto-create first session
  useEffect(() => {
    if (state.sessions.length === 0) {
      createSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createSession = useCallback(async (): Promise<string> => {
    try {
      const res = await axios.post(`/api/${context}/chat/sessions`, { type: 'general' });
      const id = res.data.data?.id || `local-${Date.now()}`;
      const newSession: CockpitSession = { id, title: `Chat ${state.sessions.length + 1}` };
      setState(prev => ({
        sessions: [...prev.sessions, newSession],
        activeSessionId: id,
      }));
      return id;
    } catch {
      const id = `local-${Date.now()}`;
      setState(prev => ({
        sessions: [...prev.sessions, { id, title: `Chat ${prev.sessions.length + 1}` }],
        activeSessionId: id,
      }));
      return id;
    }
  }, [context, state.sessions.length]);

  const switchSession = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeSessionId: id }));
  }, []);

  const switchToPrev = useCallback(() => {
    setState(prev => {
      const idx = prev.sessions.findIndex(s => s.id === prev.activeSessionId);
      if (idx <= 0) return { ...prev, activeSessionId: prev.sessions[prev.sessions.length - 1]?.id ?? null };
      return { ...prev, activeSessionId: prev.sessions[idx - 1].id };
    });
  }, []);

  const switchToNext = useCallback(() => {
    setState(prev => {
      const idx = prev.sessions.findIndex(s => s.id === prev.activeSessionId);
      if (idx >= prev.sessions.length - 1) return { ...prev, activeSessionId: prev.sessions[0]?.id ?? null };
      return { ...prev, activeSessionId: prev.sessions[idx + 1].id };
    });
  }, []);

  const closeSession = useCallback((id: string) => {
    setState(prev => {
      if (prev.sessions.length <= 1) return prev; // Don't close last
      const filtered = prev.sessions.filter(s => s.id !== id);
      const needsSwitch = prev.activeSessionId === id;
      return {
        sessions: filtered,
        activeSessionId: needsSwitch ? filtered[0]?.id ?? null : prev.activeSessionId,
      };
    });
  }, []);

  return {
    sessions: state.sessions,
    visibleSessions: state.sessions.slice(-MAX_VISIBLE),
    activeSessionId: state.activeSessionId,
    createSession,
    switchSession,
    switchToPrev,
    switchToNext,
    closeSession,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/hooks/useCockpitSessions.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCockpitSessions.ts frontend/src/__tests__/hooks/useCockpitSessions.test.ts
git commit -m "feat(cockpit): session management hook — create, switch, close, persist"
```

---

### Task 2: Wire Sessions + Shortcuts in CockpitShell

**Files:**
- Modify: `frontend/src/App.tsx` (CockpitShell function, ~lines 713-800)

- [ ] **Step 1: Import and wire useCockpitSessions in CockpitShell**

In `App.tsx` CockpitShell function:
1. Import `useCockpitSessions` and `useCockpitShortcuts`
2. Replace the hardcoded `chatTabs` useMemo with data from `useCockpitSessions`
3. Wire `ChatSessionTabs` callbacks to session hook methods
4. Add `key={sessionManager.activeSessionId}` to `GeneralChat`
5. Call `useCockpitShortcuts` with session + panel callbacks

Key changes:
- `const sessionManager = useCockpitSessions(context);`
- `const chatTabs = sessionManager.visibleSessions.map(s => ({ sessionId: s.id, title: s.title }));`
- Wire `onSelectTab`, `onCloseTab`, `onNewTab` to session methods
- `useCockpitShortcuts({ onOpenPanel, onClosePanel, onNavigate, onNewTab, onPrevTab, onNextTab, onCloseTab })`
- `<GeneralChat key={sessionManager.activeSessionId} ...>`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run full frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass (no regressions)

- [ ] **Step 4: Manual verification in browser**

- Open cockpit mode (localStorage zenai-cockpit-mode = true)
- Verify Cmd+T creates new tab
- Verify clicking tabs switches sessions
- Verify Cmd+1 opens tasks panel
- Verify Esc closes panel

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(cockpit): wire session management + keyboard shortcuts in CockpitShell"
```

---

### Task 3: Dashboard Widgets with Real Data

**Files:**
- Modify: `frontend/src/components/cockpit/DashboardPage.tsx`
- Create: `frontend/src/components/cockpit/DashboardPage.css` (already exists, will extend)
- Create: `frontend/src/components/cockpit/__tests__/DashboardWidgets.test.tsx`

- [ ] **Step 1: Write failing tests for dashboard widgets**

```typescript
// Test that each widget renders data, handles loading, handles error, handles click
describe('DashboardPage widgets', () => {
  it('Today widget shows task count and next meeting', () => {});
  it('Today widget shows loading skeleton', () => {});
  it('AI Insights widget shows suggestions', () => {});
  it('Recent Activity widget shows session list', () => {});
  it('Memory Health widget shows ring chart with score', () => {});
  it('Widget click dispatches OPEN_PANEL', () => {});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/DashboardWidgets.test.tsx`

- [ ] **Step 3: Implement DashboardPage with real data**

Replace `DashboardPage.tsx` entirely:
- Import hooks: `useTasksQuery`, `useUpcomingCalendarEventsQuery`, `useEmailStatsQuery`, `useSmartSuggestions`, `useCuriosityGaps`, `useChatSessionsQuery`, `useCognitiveOverview`, `useReviewQueue`
- Import `usePanelContext` for panel dispatch on click
- Each Widget component receives query data + loading/error states
- SVG ring chart component for cognitive score: `<circle>` with `stroke-dasharray` for progress
- Composite score: `Math.round((confidence + coherence + coverage) / 3 * 100)`
- Grid layout: CSS Grid 2x2 on desktop, 1-col on mobile
- Each widget: skeleton pulse on loading, "Nicht verfuegbar" + retry on error
- `refetchInterval: 60_000` on all queries

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/DashboardWidgets.test.tsx`

- [ ] **Step 5: Run full test suite**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: All pass, 0 TS errors

- [ ] **Step 6: Visual verification in browser**

- Navigate to /dashboard in cockpit mode
- Verify widgets show real data (or proper loading/error states)
- Click a widget → verify panel opens

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/cockpit/DashboardPage.tsx frontend/src/components/cockpit/DashboardPage.css frontend/src/components/cockpit/__tests__/DashboardWidgets.test.tsx
git commit -m "feat(cockpit): dashboard widgets with real data — tasks, insights, activity, memory"
```

---

## Chunk 2: Feature Completion (Tasks 4-6)

### Task 4: QuickActionsBar Integration

**Files:**
- Modify: `frontend/src/App.tsx` (CockpitShell — render QuickActionsBar)

- [ ] **Step 1: Add QuickActionsBar to CockpitShell**

In the chat view section of CockpitShell (only when currentPage is chat/hub):
- Import `QuickActionsBar`
- Render between ChatSessionTabs and GeneralChat
- Wire callbacks:
  - `onAttachFile`: create hidden file input, trigger click
  - `onUploadImage`: create hidden file input with accept="image/*", trigger click
  - `onVoiceInput`: toggle voice recording state (passed to GeneralChat)
  - `onQuickCreate`: `panelDispatch({ type: 'OPEN_PANEL', panel: 'ideas' })` (or show dropdown)

- [ ] **Step 2: Verify TypeScript + tests pass**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(cockpit): integrate QuickActionsBar in chat view"
```

---

### Task 5: SearchPanel Implementation

**Files:**
- Modify: `frontend/src/components/cockpit/panels/SearchPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/__tests__/SearchPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
describe('SearchPanel', () => {
  it('renders search input with autofocus', () => {});
  it('debounces search by 300ms', () => {});
  it('calls POST /api/search/global with correct body', () => {});
  it('groups results by type with icons', () => {});
  it('clicking result dispatches OPEN_PANEL', () => {});
  it('keyboard navigation: arrows + enter', () => {});
  it('shows recent searches when input empty', () => {});
  it('shows helpful suggestions when no results', () => {});
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement SearchPanel**

Key implementation:
- `useState<string>('')` for query
- `useRef` for debounce timer (300ms)
- `useQuery` calling `POST /api/search/global` with `{ query, contexts: [context], limit: 30 }`
- Group results by `type` field, show Lucide icon per type
- Result type → panel mapping: `{ idea: 'ideas', email: 'email', contact: 'contacts', ... }`
- Click → `panelDispatch({ type: 'OPEN_PANEL', panel, filter: result.id })`
- Arrow key navigation with `selectedIndex` state
- Recent searches in localStorage `zenai-recent-searches` (max 5)
- Auto-focus on mount via `useEffect` + `inputRef.current?.focus()`

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Run full suite**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/cockpit/panels/SearchPanel.tsx frontend/src/components/cockpit/panels/__tests__/SearchPanel.test.tsx
git commit -m "feat(cockpit): SearchPanel with global search, keyboard nav, recent searches"
```

---

### Task 6: Rail Enhancements

**Files:**
- Modify: `frontend/src/components/cockpit/Rail.tsx`
- Modify: `frontend/src/components/cockpit/Rail.css`

- [ ] **Step 1: Add activity indicator to Rail chat icon**

- Add `hasUnread?: boolean` prop to Rail (or derive from context)
- Render 8px dot (position absolute, top-right of chat icon) when hasUnread
- CSS: `border-radius: 50%`, `background: var(--color-primary)`, pulse animation

- [ ] **Step 2: Add session hover list**

- On chat icon `onMouseEnter`: show absolute-positioned popup
- Popup shows last 5 sessions (title + relative time)
- Click on session → callback to parent to switch session
- New props: `sessions?: { id: string; title: string; updatedAt?: string }[]`, `onSwitchSession?: (id: string) => void`
- CSS: positioned right of rail, glassmorphism background, z-index above panels
- `@media (pointer: coarse)`: hide hover popup (no hover on touch)

- [ ] **Step 3: Wire new Rail props in CockpitLayout**

- CockpitLayout passes `sessions` and `onSwitchSession` from parent
- CockpitShell provides these from `useCockpitSessions`

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/Rail.tsx frontend/src/components/cockpit/Rail.css frontend/src/components/cockpit/CockpitLayout.tsx frontend/src/App.tsx
git commit -m "feat(cockpit): Rail activity indicator + session hover list"
```

---

## Chunk 3: Mobile + Polish (Tasks 7-8)

### Task 7: Mobile Layout

**Files:**
- Create: `frontend/src/components/cockpit/CockpitBottomBar.tsx`
- Create: `frontend/src/components/cockpit/CockpitBottomBar.css`
- Create: `frontend/src/components/cockpit/__tests__/CockpitBottomBar.test.tsx`
- Modify: `frontend/src/components/cockpit/CockpitLayout.tsx`
- Modify: `frontend/src/components/cockpit/CockpitLayout.css`
- Modify: `frontend/src/components/cockpit/PanelArea.tsx`
- Create: `frontend/src/hooks/useMediaQuery.ts` (if not exists)

- [ ] **Step 1: Create useMediaQuery hook (if missing)**

```typescript
// Simple hook: returns true if viewport matches query
export function useMediaQuery(maxWidth: number): boolean {
  const [matches, setMatches] = useState(window.innerWidth <= maxWidth);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [maxWidth]);
  return matches;
}
```

- [ ] **Step 2: Write CockpitBottomBar tests**

```typescript
describe('CockpitBottomBar', () => {
  it('renders 3 navigation icons', () => {});
  it('highlights active page', () => {});
  it('calls onNavigate on click', () => {});
});
```

- [ ] **Step 3: Implement CockpitBottomBar**

- 3 buttons: Chat (MessageSquare), Dashboard (LayoutDashboard), Settings (Settings)
- Fixed bottom, 56px height, safe-area padding
- Active dot indicator under active icon
- onClick → navigate callback

- [ ] **Step 4: Modify CockpitLayout for mobile**

- Import `useMediaQuery`
- `const isMobile = useMediaQuery(767)`
- Conditional render: `isMobile ? <CockpitBottomBar /> : <Rail />`
- Pass `isMobile` to PanelArea

- [ ] **Step 5: Modify PanelArea for mobile bottom-sheet**

- Accept `isMobile` prop
- When `isMobile`:
  - Render backdrop overlay (click to close)
  - Panel slides up from bottom: `variants={{ hidden: { y: '100%' }, visible: { y: 0 } }}`
  - Full width, `height: calc(100dvh - 56px)`
  - Drag handle at top (48px bar)
  - No resize handle on mobile

- [ ] **Step 6: Mobile CSS**

```css
/* CockpitLayout.css additions */
@media (max-width: 767px) {
  .cockpit-layout { flex-direction: column; }
  .cockpit-layout__chat { padding-bottom: calc(56px + env(safe-area-inset-bottom)); }
}

/* CockpitBottomBar.css */
.cockpit-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--surface-primary);
  border-top: 1px solid rgba(255,255,255,0.06);
  z-index: 100;
}
```

- [ ] **Step 7: Run tests**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`

- [ ] **Step 8: Manual mobile verification**

- Resize browser to 375px width
- Verify bottom bar appears, rail hidden
- Open a panel → verify bottom-sheet animation
- Swipe down on handle → verify close

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/cockpit/CockpitBottomBar.tsx frontend/src/components/cockpit/CockpitBottomBar.css frontend/src/components/cockpit/__tests__/CockpitBottomBar.test.tsx frontend/src/components/cockpit/CockpitLayout.tsx frontend/src/components/cockpit/CockpitLayout.css frontend/src/components/cockpit/PanelArea.tsx frontend/src/hooks/useMediaQuery.ts
git commit -m "feat(cockpit): mobile layout — bottom bar, bottom-sheet panels, safe areas"
```

---

### Task 8: Touch-Support for Panel Resize

**Files:**
- Modify: `frontend/src/components/cockpit/PanelShell.tsx`

- [ ] **Step 1: Add touch event handlers to resize handle**

Parallel to existing `onMouseDown` handler:
- `onTouchStart`: capture initial `touches[0].clientX`
- `onTouchMove`: calculate delta, call `onResize(clamp(width - delta))`
- `onTouchEnd`: cleanup

Only enabled when `!isMobile` (desktop touch devices like iPad).

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cockpit/PanelShell.tsx
git commit -m "feat(cockpit): touch support for panel resize handle"
```

---

## Final Verification

- [ ] **Run full test suites**

```bash
cd frontend && npx vitest run
cd backend && npx jest --forceExit --no-coverage
```
Expected: All tests pass, no regressions

- [ ] **TypeScript clean**

```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Manual E2E walkthrough**

1. Standard mode: all 8 pages still work
2. Cockpit mode:
   - Chat with session tabs (create, switch, close)
   - Cmd+1-9 opens panels
   - Cmd+T new tab, Cmd+[/] switch tabs
   - Dashboard shows real data in 4 widgets
   - SearchPanel: type query → see grouped results
   - QuickActionsBar visible above chat input
   - Rail: activity dot, session hover popup
3. Mobile (375px viewport):
   - Bottom bar with 3 icons
   - Panels open as bottom sheet
   - Swipe to close panel

- [ ] **Create PR**

```bash
git push origin claude/interesting-mcclintock
gh pr create --title "feat(cockpit): 100% spec completion — sessions, dashboard, mobile, search" --body "..."
```
