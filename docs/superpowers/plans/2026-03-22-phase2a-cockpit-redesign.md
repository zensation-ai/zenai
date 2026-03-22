# Phase 2A: AI Cockpit Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure ZenAI from 20+ pages to a chat-centric "AI Cockpit" with 3 routes (`/chat`, `/dashboard`, `/settings`) and 10 contextual slide-out panels.

**Architecture:** Split-layout with Rail (48px) + Chat (flex) + Panel (0-480px). Panels lazy-load existing page components wrapped in PanelShell. Chat gets session tabs, slash-commands, and an `open_panel` AI tool. Old routes become legacy redirects.

**Tech Stack:** React 18, TypeScript, React Router v7, Framer Motion (panels), React Context + useReducer (panel state), existing React Query setup.

**Spec:** `docs/superpowers/specs/2026-03-22-phase2a-cockpit-redesign-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/contexts/PanelContext.tsx` | Panel state (active panel, pinned, width, filter) via useReducer + URL sync |
| `frontend/src/components/cockpit/CockpitLayout.tsx` | Top-level layout: Rail + ChatArea + PanelArea |
| `frontend/src/components/cockpit/CockpitLayout.css` | Cockpit layout styles (grid, responsive) |
| `frontend/src/components/cockpit/Rail.tsx` | 48px icon-only sidebar with nav icons + context switcher |
| `frontend/src/components/cockpit/Rail.css` | Rail styles |
| `frontend/src/components/cockpit/PanelShell.tsx` | Panel wrapper: header, close, pin, resize handle |
| `frontend/src/components/cockpit/PanelShell.css` | Panel shell styles + resize handle |
| `frontend/src/components/cockpit/PanelArea.tsx` | Panel container with Framer Motion animation |
| `frontend/src/components/cockpit/panelRegistry.ts` | Panel definitions (id, icon, label, shortcut, lazy component) |
| `frontend/src/components/cockpit/ChatSessionTabs.tsx` | Tab bar for parallel chat sessions |
| `frontend/src/components/cockpit/ChatSessionTabs.css` | Tab styles |
| `frontend/src/components/cockpit/DashboardPage.tsx` | New compact 4-widget dashboard |
| `frontend/src/components/cockpit/DashboardPage.css` | Dashboard grid styles |
| `frontend/src/components/cockpit/__tests__/PanelContext.test.ts` | PanelContext reducer tests |
| `frontend/src/components/cockpit/__tests__/CockpitLayout.test.tsx` | CockpitLayout rendering tests |
| `frontend/src/components/cockpit/__tests__/PanelShell.test.tsx` | PanelShell behavior tests |
| `frontend/src/components/cockpit/__tests__/Rail.test.tsx` | Rail navigation tests |
| `frontend/src/components/cockpit/__tests__/ChatSessionTabs.test.tsx` | Tab management tests |
| `frontend/src/components/cockpit/__tests__/panelRegistry.test.ts` | Registry completeness tests |
| `frontend/src/components/cockpit/__tests__/DashboardPage.test.tsx` | Dashboard widget tests |

### Modified Files

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Replace AppLayout with CockpitLayout, simplify routing to 3 routes + legacy redirects |
| `frontend/src/routes/index.tsx` | New route definitions for `/chat`, `/dashboard`, `/settings`, panel query params |
| `frontend/src/types/idea.ts` | Simplify Page type to 3 pages + PanelType union |
| `frontend/src/navigation.ts` | Simplify to Rail items (3 nav + context switcher) |
| `frontend/src/components/GeneralChat/GeneralChat.tsx` | Add panel_action SSE handler, pass panelDispatch |
| `frontend/src/hooks/useStreamingChat.ts` | Handle `panel_action` SSE event type |
| `frontend/src/components/CommandPalette.tsx` | Add panel-opening commands |
| `frontend/src/components/layout/MobileBottomBar.tsx` | Reduce to 3 items (Chat, Dashboard, Settings) |
| `backend/src/services/claude/tool-definitions.ts` | Add `open_panel` tool definition |
| `backend/src/services/claude/tool-execution.ts` | Add `open_panel` handler (returns synthetic success) |
| `backend/src/services/claude/streaming.ts` | Emit `panel_action` SSE event for open_panel tool |

### Deleted Files (in final cleanup task)

All old page components stay in place until Chunk 5. They are accessed through PanelShell wrappers, not removed.

---

## Chunk 1: Panel Foundation

### Task 1: PanelContext — State Management

**Files:**
- Create: `frontend/src/contexts/PanelContext.tsx`
- Create: `frontend/src/components/cockpit/__tests__/PanelContext.test.ts`

- [ ] **Step 1: Write failing tests for PanelContext reducer**

```typescript
// frontend/src/components/cockpit/__tests__/PanelContext.test.ts
import { panelReducer, initialPanelState, PanelState, PanelAction } from '../../../contexts/PanelContext';

describe('panelReducer', () => {
  const initial: PanelState = initialPanelState;

  it('opens a panel with OPEN_PANEL', () => {
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'tasks' };
    const state = panelReducer(initial, action);
    expect(state.activePanel).toBe('tasks');
    expect(state.pinned).toBe(false);
    expect(state.filter).toBeUndefined();
  });

  it('opens a panel with filter', () => {
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'tasks', filter: 'today' };
    const state = panelReducer(initial, action);
    expect(state.activePanel).toBe('tasks');
    expect(state.filter).toBe('today');
  });

  it('OPEN_PANEL always resets pinned to false', () => {
    const pinned: PanelState = { ...initial, activePanel: 'email', pinned: true };
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'tasks' };
    const state = panelReducer(pinned, action);
    expect(state.activePanel).toBe('tasks');
    expect(state.pinned).toBe(false);
  });

  it('closes panel with CLOSE_PANEL', () => {
    const open: PanelState = { ...initial, activePanel: 'tasks', pinned: true };
    const state = panelReducer(open, { type: 'CLOSE_PANEL' });
    expect(state.activePanel).toBeNull();
    expect(state.pinned).toBe(false);
  });

  it('toggles pin with TOGGLE_PIN', () => {
    const open: PanelState = { ...initial, activePanel: 'tasks', pinned: false };
    const state = panelReducer(open, { type: 'TOGGLE_PIN' });
    expect(state.pinned).toBe(true);
  });

  it('sets width with SET_WIDTH clamped to 360-600', () => {
    const state1 = panelReducer(initial, { type: 'SET_WIDTH', width: 500 });
    expect(state1.width).toBe(500);

    const state2 = panelReducer(initial, { type: 'SET_WIDTH', width: 200 });
    expect(state2.width).toBe(360);

    const state3 = panelReducer(initial, { type: 'SET_WIDTH', width: 800 });
    expect(state3.width).toBe(600);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/PanelContext.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PanelContext**

```typescript
// frontend/src/contexts/PanelContext.tsx
import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

export type PanelType = 'tasks' | 'email' | 'ideas' | 'calendar' | 'contacts'
  | 'documents' | 'memory' | 'finance' | 'agents' | 'search';

export type PanelState = {
  activePanel: PanelType | null;
  pinned: boolean;
  width: number;
  filter?: string;
};

export type PanelAction =
  | { type: 'OPEN_PANEL'; panel: PanelType; filter?: string }
  | { type: 'CLOSE_PANEL' }
  | { type: 'TOGGLE_PIN' }
  | { type: 'SET_WIDTH'; width: number };

const MIN_WIDTH = 360;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 420;

export const initialPanelState: PanelState = {
  activePanel: null,
  pinned: false,
  width: DEFAULT_WIDTH,
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return {
        ...state,
        activePanel: action.panel,
        pinned: false,
        filter: action.filter,
      };
    case 'CLOSE_PANEL':
      return {
        ...state,
        activePanel: null,
        pinned: false,
        filter: undefined,
      };
    case 'TOGGLE_PIN':
      return { ...state, pinned: !state.pinned };
    case 'SET_WIDTH':
      return {
        ...state,
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, action.width)),
      };
    default:
      return state;
  }
}

interface PanelContextValue {
  state: PanelState;
  dispatch: Dispatch<PanelAction>;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  return (
    <PanelContext.Provider value={{ state, dispatch }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanelContext(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanelContext must be used within PanelProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/PanelContext.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/PanelContext.tsx frontend/src/components/cockpit/__tests__/PanelContext.test.ts
git commit -m "feat(cockpit): add PanelContext with reducer for panel state management"
```

---

### Task 2: Panel Registry

**Files:**
- Create: `frontend/src/components/cockpit/panelRegistry.ts`
- Create: `frontend/src/components/cockpit/__tests__/panelRegistry.test.ts`

- [ ] **Step 1: Write failing tests for panel registry**

```typescript
// frontend/src/components/cockpit/__tests__/panelRegistry.test.ts
import { panelRegistry, getPanelDefinition } from '../panelRegistry';
import type { PanelType } from '../../../contexts/PanelContext';

describe('panelRegistry', () => {
  const allPanelTypes: PanelType[] = [
    'tasks', 'email', 'ideas', 'calendar', 'contacts',
    'documents', 'memory', 'finance', 'agents', 'search',
  ];

  it('has definitions for all 10 panel types', () => {
    expect(panelRegistry).toHaveLength(10);
    for (const type of allPanelTypes) {
      expect(panelRegistry.find(p => p.id === type)).toBeDefined();
    }
  });

  it('each definition has required fields', () => {
    for (const panel of panelRegistry) {
      expect(panel.id).toBeTruthy();
      expect(panel.label).toBeTruthy();
      expect(panel.shortcut).toBeTruthy();
      expect(panel.component).toBeDefined();
    }
  });

  it('getPanelDefinition returns correct panel', () => {
    const tasks = getPanelDefinition('tasks');
    expect(tasks?.id).toBe('tasks');
    expect(tasks?.label).toBeTruthy();
  });

  it('getPanelDefinition returns undefined for unknown', () => {
    expect(getPanelDefinition('unknown' as PanelType)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/panelRegistry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement panel registry**

```typescript
// frontend/src/components/cockpit/panelRegistry.ts
import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import {
  CheckSquare, Mail, Lightbulb, Calendar, Users,
  FileText, Brain, DollarSign, Bot, Search,
} from 'lucide-react';
import type { PanelType } from '../../contexts/PanelContext';

export interface PanelProps {
  filter?: string;
  onClose: () => void;
  context: AIContext;
}

// AIContext is imported from the existing ContextSwitcher:
// import type { AIContext } from '../../components/ContextSwitcher';

export interface PanelDefinition {
  id: PanelType;
  icon: typeof CheckSquare;
  label: string;
  shortcut: string;
  component: LazyExoticComponent<ComponentType<PanelProps>>;
}

// Lazy-load existing page components wrapped for panel use.
// Each panel wrapper imports the existing page component and passes embedded={true}.
// These wrapper files will be created in Chunk 3 (Tasks 7-9).
// For now, use placeholder components.
const PlaceholderPanel = lazy(() =>
  Promise.resolve({
    default: ({ filter, onClose }: PanelProps) => null,
  })
);

export const panelRegistry: PanelDefinition[] = [
  { id: 'tasks', icon: CheckSquare, label: 'Aufgaben', shortcut: '⌘1', component: PlaceholderPanel },
  { id: 'email', icon: Mail, label: 'Email', shortcut: '⌘2', component: PlaceholderPanel },
  { id: 'ideas', icon: Lightbulb, label: 'Ideen', shortcut: '⌘3', component: PlaceholderPanel },
  { id: 'calendar', icon: Calendar, label: 'Kalender', shortcut: '⌘4', component: PlaceholderPanel },
  { id: 'contacts', icon: Users, label: 'Kontakte', shortcut: '⌘5', component: PlaceholderPanel },
  { id: 'documents', icon: FileText, label: 'Dokumente', shortcut: '⌘6', component: PlaceholderPanel },
  { id: 'memory', icon: Brain, label: 'Gedaechtnis', shortcut: '⌘7', component: PlaceholderPanel },
  { id: 'finance', icon: DollarSign, label: 'Finanzen', shortcut: '⌘8', component: PlaceholderPanel },
  { id: 'agents', icon: Bot, label: 'Agenten', shortcut: '⌘9', component: PlaceholderPanel },
  { id: 'search', icon: Search, label: 'Suche', shortcut: '⌘/', component: PlaceholderPanel },
];

export function getPanelDefinition(id: PanelType): PanelDefinition | undefined {
  return panelRegistry.find(p => p.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/panelRegistry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/panelRegistry.ts frontend/src/components/cockpit/__tests__/panelRegistry.test.ts
git commit -m "feat(cockpit): add panel registry with 10 panel definitions"
```

---

### Task 3: PanelShell Component

**Files:**
- Create: `frontend/src/components/cockpit/PanelShell.tsx`
- Create: `frontend/src/components/cockpit/PanelShell.css`
- Create: `frontend/src/components/cockpit/__tests__/PanelShell.test.tsx`

- [ ] **Step 1: Write failing tests for PanelShell**

```typescript
// frontend/src/components/cockpit/__tests__/PanelShell.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelShell } from '../PanelShell';

describe('PanelShell', () => {
  const defaultProps = {
    title: 'Aufgaben',
    icon: () => <span data-testid="icon">icon</span>,
    pinned: false,
    onClose: vi.fn(),
    onTogglePin: vi.fn(),
    width: 420,
    onResize: vi.fn(),
  };

  it('renders title and close button', () => {
    render(
      <PanelShell {...defaultProps}>
        <div>content</div>
      </PanelShell>
    );
    expect(screen.getByText('Aufgaben')).toBeInTheDocument();
    expect(screen.getByLabelText('Panel schliessen')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(
      <PanelShell {...defaultProps}>
        <div>content</div>
      </PanelShell>
    );
    fireEvent.click(screen.getByLabelText('Panel schliessen'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onTogglePin when pin button clicked', () => {
    render(
      <PanelShell {...defaultProps}>
        <div>content</div>
      </PanelShell>
    );
    fireEvent.click(screen.getByLabelText('Panel anpinnen'));
    expect(defaultProps.onTogglePin).toHaveBeenCalled();
  });

  it('shows pinned state visually', () => {
    render(
      <PanelShell {...defaultProps} pinned={true}>
        <div>content</div>
      </PanelShell>
    );
    expect(screen.getByLabelText('Panel lospinnen')).toBeInTheDocument();
  });

  it('renders children in scrollable content area', () => {
    render(
      <PanelShell {...defaultProps}>
        <div data-testid="child">Hello</div>
      </PanelShell>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/PanelShell.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PanelShell**

```typescript
// frontend/src/components/cockpit/PanelShell.tsx
import { type ReactNode, useCallback, useRef } from 'react';
import { X, Pin, PinOff } from 'lucide-react';
import './PanelShell.css';

interface PanelShellProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  width: number;
  onResize: (width: number) => void;
  children: ReactNode;
}

export function PanelShell({
  title, icon: Icon, pinned, onClose, onTogglePin, width, onResize, children,
}: PanelShellProps) {
  const resizeRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      onResize(startWidth + delta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onResize]);

  return (
    <div className="panel-shell" style={{ width }}>
      <div className="panel-shell__resize" ref={resizeRef} onMouseDown={handleMouseDown} />
      <div className="panel-shell__header">
        <div className="panel-shell__title">
          <Icon size={16} />
          <span>{title}</span>
        </div>
        <div className="panel-shell__actions">
          <button
            className="panel-shell__btn"
            onClick={onTogglePin}
            aria-label={pinned ? 'Panel lospinnen' : 'Panel anpinnen'}
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            className="panel-shell__btn"
            onClick={onClose}
            aria-label="Panel schliessen"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="panel-shell__content">
        {children}
      </div>
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/PanelShell.css */
.panel-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-secondary, #111);
  border-left: 1px solid var(--border-primary, rgba(255,255,255,0.08));
  position: relative;
}

.panel-shell__resize {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 10;
}

.panel-shell__resize:hover {
  background: var(--color-accent, rgba(99,102,241,0.3));
}

.panel-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-primary, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.panel-shell__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.panel-shell__actions {
  display: flex;
  gap: 4px;
}

.panel-shell__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary, rgba(255,255,255,0.5));
}

.panel-shell__btn:hover {
  background: var(--surface-hover, rgba(255,255,255,0.06));
  color: var(--text-primary, #fff);
}

.panel-shell__content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/PanelShell.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/PanelShell.tsx frontend/src/components/cockpit/PanelShell.css frontend/src/components/cockpit/__tests__/PanelShell.test.tsx
git commit -m "feat(cockpit): add PanelShell component with resize, pin, close"
```

---

### Task 4: Rail Component

**Files:**
- Create: `frontend/src/components/cockpit/Rail.tsx`
- Create: `frontend/src/components/cockpit/Rail.css`
- Create: `frontend/src/components/cockpit/__tests__/Rail.test.tsx`

- [ ] **Step 1: Write failing tests for Rail**

```typescript
// frontend/src/components/cockpit/__tests__/Rail.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Rail } from '../Rail';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Rail', () => {
  const defaultProps = {
    currentPage: 'chat' as const,
    context: 'personal' as const,
    onContextChange: vi.fn(),
  };

  const renderRail = (props = {}) =>
    render(
      <MemoryRouter>
        <Rail {...defaultProps} {...props} />
      </MemoryRouter>
    );

  it('renders chat, dashboard, and settings icons', () => {
    renderRail();
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('marks current page as active', () => {
    renderRail({ currentPage: 'chat' });
    expect(screen.getByLabelText('Chat').closest('button')).toHaveClass('rail__item--active');
  });

  it('navigates to dashboard on click', () => {
    renderRail();
    fireEvent.click(screen.getByLabelText('Dashboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('renders context switcher', () => {
    renderRail();
    expect(screen.getByLabelText('Kontext wechseln')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/Rail.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Rail**

```typescript
// frontend/src/components/cockpit/Rail.tsx
import { useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Settings } from 'lucide-react';
import type { AIContext } from '../ContextSwitcher';
import './Rail.css';

const CONTEXT_COLORS: Record<string, string> = {
  personal: '#0EA5E9',
  work: '#3B82F6',
  learning: '#10B981',
  creative: '#8B5CF6',
};

interface RailProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
}

const NAV_ITEMS = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat', path: '/chat' },
  { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
] as const;

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

export function Rail({ currentPage, context, onContextChange }: RailProps) {
  const navigate = useNavigate();

  const cycleContext = () => {
    const idx = CONTEXTS.indexOf(context);
    const next = CONTEXTS[(idx + 1) % CONTEXTS.length];
    onContextChange(next);
  };

  return (
    <nav className="rail" role="navigation" aria-label="Hauptnavigation">
      <div className="rail__top">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`rail__item ${currentPage === item.id ? 'rail__item--active' : ''}`}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
          >
            <item.icon size={20} />
          </button>
        ))}
      </div>
      <div className="rail__bottom">
        <button
          className="rail__item rail__context"
          onClick={cycleContext}
          aria-label="Kontext wechseln"
          style={{ '--context-color': CONTEXT_COLORS[context] } as React.CSSProperties}
        >
          <div className="rail__context-ring" />
        </button>
        <button
          className={`rail__item ${currentPage === 'settings' ? 'rail__item--active' : ''}`}
          onClick={() => navigate('/settings')}
          aria-label="Einstellungen"
        >
          <Settings size={20} />
        </button>
      </div>
    </nav>
  );
}
```

```css
/* frontend/src/components/cockpit/Rail.css */
.rail {
  width: 48px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  background: var(--surface-primary, #0a0a0f);
  border-right: 1px solid var(--border-primary, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.rail__top,
.rail__bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rail__item {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary, rgba(255,255,255,0.4));
  transition: background 150ms, color 150ms;
}

.rail__item:hover {
  background: var(--surface-hover, rgba(255,255,255,0.06));
  color: var(--text-primary, #fff);
}

.rail__item--active {
  background: var(--color-accent-muted, rgba(99,102,241,0.15));
  color: var(--color-accent, #6366f1);
}

.rail__context-ring {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--context-color, #3B82F6);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/Rail.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/Rail.tsx frontend/src/components/cockpit/Rail.css frontend/src/components/cockpit/__tests__/Rail.test.tsx
git commit -m "feat(cockpit): add Rail component with nav icons and context switcher"
```

---

### Task 5: PanelArea with Framer Motion Animation

**Files:**
- Create: `frontend/src/components/cockpit/PanelArea.tsx`

- [ ] **Step 1: Implement PanelArea** (no separate test — tested via CockpitLayout integration)

```typescript
// frontend/src/components/cockpit/PanelArea.tsx
import { Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { usePanelContext } from '../../contexts/PanelContext';
import { getPanelDefinition } from './panelRegistry';
import { PanelShell } from './PanelShell';

interface PanelAreaProps {
  context: AIContext;
}

export function PanelArea({ context }: PanelAreaProps) {
  const { state, dispatch } = usePanelContext();
  const reduceMotion = useReducedMotion();

  const panel = state.activePanel ? getPanelDefinition(state.activePanel) : null;

  if (!panel) return null;

  const PanelContent = panel.component;

  return (
    <AnimatePresence mode="wait">
      {state.activePanel && (
        <motion.div
          key={state.activePanel}
          initial={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { width: state.width, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <PanelShell
            title={panel.label}
            icon={panel.icon}
            pinned={state.pinned}
            onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
            onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })}
            width={state.width}
            onResize={(w) => dispatch({ type: 'SET_WIDTH', width: w })}
          >
            <Suspense fallback={<div className="panel-shell__loading">Laden...</div>}>
              <PanelContent
                filter={state.filter}
                onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
                context={context}
              />
            </Suspense>
          </PanelShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cockpit/PanelArea.tsx
git commit -m "feat(cockpit): add PanelArea with Framer Motion spring animation"
```

---

### Task 6: CockpitLayout — Assembling the Shell

**Files:**
- Create: `frontend/src/components/cockpit/CockpitLayout.tsx`
- Create: `frontend/src/components/cockpit/CockpitLayout.css`
- Create: `frontend/src/components/cockpit/__tests__/CockpitLayout.test.tsx`

- [ ] **Step 1: Write failing tests for CockpitLayout**

```typescript
// frontend/src/components/cockpit/__tests__/CockpitLayout.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CockpitLayout } from '../CockpitLayout';
import { PanelProvider } from '../../../contexts/PanelContext';

vi.mock('../Rail', () => ({
  Rail: (props: any) => <div data-testid="rail" />,
}));
vi.mock('../PanelArea', () => ({
  PanelArea: () => <div data-testid="panel-area" />,
}));

describe('CockpitLayout', () => {
  const renderLayout = () =>
    render(
      <MemoryRouter>
        <PanelProvider>
          <CockpitLayout
            currentPage="chat"
            context="personal"
            onContextChange={vi.fn()}
          >
            <div data-testid="chat-content">Chat here</div>
          </CockpitLayout>
        </PanelProvider>
      </MemoryRouter>
    );

  it('renders Rail, chat content, and PanelArea', () => {
    renderLayout();
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    expect(screen.getByTestId('chat-content')).toBeInTheDocument();
    expect(screen.getByTestId('panel-area')).toBeInTheDocument();
  });

  it('has correct layout structure', () => {
    const { container } = renderLayout();
    const layout = container.querySelector('.cockpit-layout');
    expect(layout).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/CockpitLayout.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement CockpitLayout**

```typescript
// frontend/src/components/cockpit/CockpitLayout.tsx
import { type ReactNode } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { Rail } from './Rail';
import { PanelArea } from './PanelArea';
import './CockpitLayout.css';

interface CockpitLayoutProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  children: ReactNode;
}

export function CockpitLayout({ currentPage, context, onContextChange, children }: CockpitLayoutProps) {
  return (
    <div className="cockpit-layout">
      <Rail
        currentPage={currentPage}
        context={context}
        onContextChange={onContextChange}
      />
      <main className="cockpit-layout__chat">
        {children}
      </main>
      <PanelArea context={context} />
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/CockpitLayout.css */
.cockpit-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--surface-primary, #0a0a0f);
  color: var(--text-primary, #e5e5e5);
}

.cockpit-layout__chat {
  flex: 1;
  min-width: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Mobile: hide Rail, show Bottom Bar */
@media (max-width: 767px) {
  .cockpit-layout {
    flex-direction: column;
  }
  .cockpit-layout > .rail {
    display: none;
  }
  .cockpit-layout__chat {
    min-width: 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/CockpitLayout.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/CockpitLayout.tsx frontend/src/components/cockpit/CockpitLayout.css frontend/src/components/cockpit/__tests__/CockpitLayout.test.tsx
git commit -m "feat(cockpit): add CockpitLayout assembling Rail + Chat + PanelArea"
```

---

## Chunk 2: Chat Enhancements

### Task 7: ChatSessionTabs Component

**Files:**
- Create: `frontend/src/components/cockpit/ChatSessionTabs.tsx`
- Create: `frontend/src/components/cockpit/ChatSessionTabs.css`
- Create: `frontend/src/components/cockpit/__tests__/ChatSessionTabs.test.tsx`

- [ ] **Step 1: Write failing tests for ChatSessionTabs**

```typescript
// frontend/src/components/cockpit/__tests__/ChatSessionTabs.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatSessionTabs } from '../ChatSessionTabs';

describe('ChatSessionTabs', () => {
  const tabs = [
    { sessionId: 's1', title: 'API Design' },
    { sessionId: 's2', title: 'Deploy Planung' },
  ];

  const defaultProps = {
    tabs,
    activeSessionId: 's1',
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onNewTab: vi.fn(),
  };

  it('renders all tabs', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    expect(screen.getByText('API Design')).toBeInTheDocument();
    expect(screen.getByText('Deploy Planung')).toBeInTheDocument();
  });

  it('marks active tab', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    const tab = screen.getByText('API Design').closest('button');
    expect(tab).toHaveClass('session-tabs__tab--active');
  });

  it('calls onSelectTab when clicking inactive tab', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    fireEvent.click(screen.getByText('Deploy Planung'));
    expect(defaultProps.onSelectTab).toHaveBeenCalledWith('s2');
  });

  it('calls onNewTab when clicking new tab button', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Neuer Chat'));
    expect(defaultProps.onNewTab).toHaveBeenCalled();
  });

  it('calls onCloseTab when clicking close on a tab', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    const closeBtns = screen.getAllByLabelText('Tab schliessen');
    fireEvent.click(closeBtns[0]);
    expect(defaultProps.onCloseTab).toHaveBeenCalledWith('s1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/ChatSessionTabs.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ChatSessionTabs**

```typescript
// frontend/src/components/cockpit/ChatSessionTabs.tsx
import { Plus, X } from 'lucide-react';
import './ChatSessionTabs.css';

interface SessionTab {
  sessionId: string;
  title: string;
}

interface ChatSessionTabsProps {
  tabs: SessionTab[];
  activeSessionId: string;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewTab: () => void;
}

export function ChatSessionTabs({
  tabs, activeSessionId, onSelectTab, onCloseTab, onNewTab,
}: ChatSessionTabsProps) {
  return (
    <div className="session-tabs" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.sessionId}
          role="tab"
          aria-selected={tab.sessionId === activeSessionId}
          className={`session-tabs__tab ${tab.sessionId === activeSessionId ? 'session-tabs__tab--active' : ''}`}
          onClick={() => onSelectTab(tab.sessionId)}
        >
          <span className="session-tabs__title">{tab.title}</span>
          <span
            className="session-tabs__close"
            role="button"
            aria-label="Tab schliessen"
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.sessionId); }}
          >
            <X size={12} />
          </span>
        </button>
      ))}
      <button
        className="session-tabs__new"
        onClick={onNewTab}
        aria-label="Neuer Chat"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/ChatSessionTabs.css */
.session-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-primary, rgba(255,255,255,0.08));
  overflow-x: auto;
  flex-shrink: 0;
}

.session-tabs__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary, rgba(255,255,255,0.5));
  white-space: nowrap;
  max-width: 160px;
  transition: background 150ms, color 150ms;
}

.session-tabs__tab:hover {
  background: var(--surface-hover, rgba(255,255,255,0.06));
  color: var(--text-primary, #fff);
}

.session-tabs__tab--active {
  background: var(--surface-hover, rgba(255,255,255,0.06));
  color: var(--text-primary, #fff);
}

.session-tabs__title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-tabs__close {
  display: flex;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 150ms;
}

.session-tabs__tab:hover .session-tabs__close {
  opacity: 1;
}

.session-tabs__close:hover {
  background: var(--surface-hover, rgba(255,255,255,0.1));
}

.session-tabs__new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-tertiary, rgba(255,255,255,0.3));
  flex-shrink: 0;
}

.session-tabs__new:hover {
  background: var(--surface-hover, rgba(255,255,255,0.06));
  color: var(--text-primary, #fff);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/ChatSessionTabs.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/ChatSessionTabs.tsx frontend/src/components/cockpit/ChatSessionTabs.css frontend/src/components/cockpit/__tests__/ChatSessionTabs.test.tsx
git commit -m "feat(cockpit): add ChatSessionTabs for parallel conversations"
```

---

### Task 8: Backend — open_panel Tool + SSE Event

**Files:**
- Modify: `backend/src/services/claude/tool-definitions.ts`
- Modify: `backend/src/services/claude/tool-execution.ts`
- Modify: `backend/src/services/claude/streaming.ts`

- [ ] **Step 1: Add open_panel tool definition**

In `backend/src/services/claude/tool-definitions.ts`, add to the tools array:

```typescript
{
  name: 'open_panel',
  description: 'Opens a context panel in the ZenAI UI. Use this when the user asks to see their tasks, emails, ideas, calendar, contacts, documents, memory, finances, or agents. The panel slides out on the right side of the chat.',
  input_schema: {
    type: 'object' as const,
    properties: {
      panel: {
        type: 'string',
        enum: ['tasks', 'email', 'ideas', 'calendar', 'contacts', 'documents', 'memory', 'finance', 'agents', 'search'],
        description: 'Which panel to open',
      },
      filter: {
        type: 'string',
        description: 'Optional filter (e.g. "today", "unread", "high-priority")',
      },
    },
    required: ['panel'],
  },
}
```

- [ ] **Step 2: Add open_panel handler in tool-execution.ts**

In `backend/src/services/claude/tool-execution.ts`, add the handler:

```typescript
case 'open_panel': {
  const { panel, filter } = toolInput as { panel: string; filter?: string };
  // Emit SSE event for frontend — handled in streaming.ts
  return { success: true, panel, filter, message: `Panel "${panel}" opened` };
}
```

- [ ] **Step 3: Add panel_action SSE event in streaming.ts**

In `backend/src/services/claude/streaming.ts`, in the tool result handling section, add:

```typescript
if (toolName === 'open_panel') {
  const { panel, filter } = toolResult;
  res.write(`event: panel_action\ndata: ${JSON.stringify({ action: 'open', panel, filter })}\n\n`);
}
```

- [ ] **Step 4: Run backend tests to verify nothing breaks**

Run: `cd backend && npm test -- --testPathPattern="tool" --bail`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/claude/tool-definitions.ts backend/src/services/claude/tool-execution.ts backend/src/services/claude/streaming.ts
git commit -m "feat(backend): add open_panel tool with panel_action SSE event"
```

---

### Task 9: Frontend — Handle panel_action SSE Event

**Files:**
- Modify: `frontend/src/hooks/useStreamingChat.ts`

- [ ] **Step 1: Add panel_action handler to useStreamingChat**

In `frontend/src/hooks/useStreamingChat.ts`, in the SSE event handling section, add a handler for the new event type. The hook needs to accept an optional `onPanelAction` callback:

```typescript
// Add to hook params interface:
onPanelAction?: (action: { action: string; panel: string; filter?: string }) => void;

// Add in the SSE event handling (alongside existing tool_use_start, tool_use_end handlers):
if (eventType === 'panel_action') {
  const data = JSON.parse(eventData);
  onPanelAction?.(data);
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: PASS (all existing tests still pass)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useStreamingChat.ts
git commit -m "feat(cockpit): handle panel_action SSE event in useStreamingChat"
```

---

## Chunk 3: App Integration + First Panels

### Task 10: Integrate CockpitLayout into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/index.tsx`
- Modify: `frontend/src/types/idea.ts`

This is the biggest integration task. The old AppLayout routing (switch/case over 20+ pages) is replaced with React Router routes rendering CockpitLayout for `/chat`, DashboardPage for `/dashboard`, and SettingsPage for `/settings`. Legacy URLs redirect to `/chat?panel=X`.

- [ ] **Step 1: Update types/idea.ts — add PanelType, simplify Page type**

Add `CockpitPage` type alongside existing `Page` type (don't remove old type yet — backward compat):

```typescript
// Add to types/idea.ts:
export type CockpitPage = 'chat' | 'dashboard' | 'settings';
```

- [ ] **Step 2: Update routes/index.tsx — add cockpit routes and legacy redirects**

Add new route mappings alongside existing ones:

```typescript
// Add cockpit route helpers:
export const COCKPIT_ROUTES = {
  chat: '/chat',
  dashboard: '/dashboard',
  settings: '/settings',
} as const;

export function legacyPageToPanel(page: string): string | null {
  const mapping: Record<string, string> = {
    'ideas': 'ideas',
    'ideas/incubator': 'ideas',
    'ideas/archive': 'ideas',
    'ideas/triage': 'ideas',
    'calendar': 'calendar',
    'calendar/tasks': 'tasks',
    'calendar/kanban': 'tasks',
    'email': 'email',
    'contacts': 'contacts',
    'documents': 'documents',
    'finance': 'finance',
    'my-ai': 'memory',
    'my-ai/memory': 'memory',
    'workshop': 'agents',
    'workshop/agent-teams': 'agents',
  };
  return mapping[page] ?? null;
}
```

- [ ] **Step 3: Update App.tsx — add CockpitLayout route alongside old layout**

Wrap the new cockpit route in a feature flag so both old and new layouts work during migration. Add a `useCockpitMode` flag (localStorage-based):

```typescript
// At top of App.tsx:
const cockpitMode = localStorage.getItem('zenai-cockpit-mode') === 'true';
```

When `cockpitMode` is true, render the new CockpitLayout routes. When false, render the old AppLayout. This allows gradual rollout and easy rollback.

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: PASS (old tests unchanged, cockpit mode off by default)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/routes/index.tsx frontend/src/types/idea.ts
git commit -m "feat(cockpit): integrate CockpitLayout into App.tsx with feature flag"
```

---

### Task 11: Wire First Panel — Tasks Panel

**Files:**
- Create: `frontend/src/components/cockpit/panels/TasksPanel.tsx`
- Modify: `frontend/src/components/cockpit/panelRegistry.ts`

- [ ] **Step 1: Create TasksPanel wrapper**

```typescript
// frontend/src/components/cockpit/panels/TasksPanel.tsx
import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

// Re-use existing PlannerPage — lazy with named export handling
const PlannerPage = lazy(() =>
  import('../../PlannerPage/PlannerPage').then(m => ({ default: m.default || m.PlannerPage }))
);

export default function TasksPanel({ filter, onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Laden...</div>}>
      <PlannerPage context={context} initialTab="tasks" onBack={onClose} />
    </Suspense>
  );
}
```

Note: Check the actual export of PlannerPage before implementing. If it's a default export, the `.then()` is unnecessary. The `context` and `onBack` props are required by PlannerPage's interface.

- [ ] **Step 2: Update panelRegistry to use TasksPanel**

In `panelRegistry.ts`, replace the tasks PlaceholderPanel:

```typescript
const TasksPanel = lazy(() => import('./panels/TasksPanel'));
// ...
{ id: 'tasks', icon: CheckSquare, label: 'Aufgaben', shortcut: '⌘1', component: TasksPanel },
```

- [ ] **Step 3: Test manually — enable cockpit mode and open tasks panel**

Set `localStorage.setItem('zenai-cockpit-mode', 'true')` in browser console, reload, and verify tasks panel opens with `⌘1` or via command palette.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/panels/TasksPanel.tsx frontend/src/components/cockpit/panelRegistry.ts
git commit -m "feat(cockpit): wire Tasks panel wrapping existing PlannerPage"
```

---

### Task 12: Wire Email Panel + Ideas Panel

**Files:**
- Create: `frontend/src/components/cockpit/panels/EmailPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/IdeasPanel.tsx`
- Modify: `frontend/src/components/cockpit/panelRegistry.ts`

- [ ] **Step 1: Create EmailPanel wrapper**

```typescript
// frontend/src/components/cockpit/panels/EmailPanel.tsx
import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

// EmailPage barrel exports InboxSmartPage — check actual export name before implementing
const EmailPage = lazy(() =>
  import('../../EmailPage').then(m => ({ default: m.default || m.InboxSmartPage || m.EmailPage }))
);

export default function EmailPanel({ filter, onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Laden...</div>}>
      <EmailPage context={context} onBack={onClose} />
    </Suspense>
  );
}
```

Note: Verify the actual export from `EmailPage/index.ts` before implementing. The barrel may export `InboxSmartPage` as default or named.

- [ ] **Step 2: Create IdeasPanel wrapper**

```typescript
// frontend/src/components/cockpit/panels/IdeasPanel.tsx
import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

// IdeasPage barrel uses named export — handle both default and named
const IdeasPage = lazy(() =>
  import('../../IdeasPage').then(m => ({ default: m.default || m.IdeasPage || m.IdeasSmartPage }))
);

export default function IdeasPanel({ filter, onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Laden...</div>}>
      <IdeasPage context={context} initialTab="ideas" onBack={onClose} />
    </Suspense>
  );
}
```

Note: Verify the actual export from `IdeasPage/index.ts`. Pass `context` and `onBack` as required by the existing component interface.

- [ ] **Step 3: Update panelRegistry**

Replace PlaceholderPanel entries for email and ideas with real lazy imports.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/panels/EmailPanel.tsx frontend/src/components/cockpit/panels/IdeasPanel.tsx frontend/src/components/cockpit/panelRegistry.ts
git commit -m "feat(cockpit): wire Email and Ideas panels wrapping existing pages"
```

---

## Chunk 4: Remaining Panels + Dashboard

### Task 13: Wire Remaining 7 Panels

**Files:**
- Create: `frontend/src/components/cockpit/panels/CalendarPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/ContactsPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/DocumentsPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/MemoryPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/FinancePanel.tsx`
- Create: `frontend/src/components/cockpit/panels/AgentsPanel.tsx`
- Create: `frontend/src/components/cockpit/panels/SearchPanel.tsx`
- Modify: `frontend/src/components/cockpit/panelRegistry.ts`

Each panel follows the same pattern as Tasks/Email/Ideas: lazy-load existing page component, pass `context` and `onBack` props. Handle named exports with `.then()` pattern.

```typescript
// Template for each panel:
import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const ExistingPage = lazy(() =>
  import('../../ExistingPage').then(m => ({ default: m.default || m.ExistingPage }))
);

export default function XPanel({ filter, onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Laden...</div>}>
      <ExistingPage context={context} onBack={onClose} />
    </Suspense>
  );
}
```

**Important:** Before implementing each panel, check the actual component's props interface and export type. Pass all required props (`context`, `onBack`, `initialTab` where applicable).

Specific mappings:
- CalendarPanel → `PlannerPage` with `initialTab="calendar"`, pass `context`, `onBack`
- ContactsPanel → `ContactsPage`, pass `context`, `onBack`
- DocumentsPanel → `DocumentVaultPage`, pass `context`, `onBack`
- MemoryPanel → `MyAIPage` with `initialTab="memory"`, pass `context`, `onBack`
- FinancePanel → `FinancePage`, pass `context`, `onBack`
- AgentsPanel → `AgentTeamsPage` (directory with barrel export — use `.then(m => ({ default: m.AgentTeamsPage }))`)
- SearchPanel → new minimal component with search input + results (reuses existing search APIs)

- [ ] **Step 1: Create all 7 panel wrapper files**
- [ ] **Step 2: Update panelRegistry to use real components for all 10 panels**
- [ ] **Step 3: Run registry tests to verify all 10 panels are registered**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/panelRegistry.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/panels/ frontend/src/components/cockpit/panelRegistry.ts
git commit -m "feat(cockpit): wire all 10 panels wrapping existing page components"
```

---

### Task 14: New Dashboard Page

**Files:**
- Create: `frontend/src/components/cockpit/DashboardPage.tsx`
- Create: `frontend/src/components/cockpit/DashboardPage.css`
- Create: `frontend/src/components/cockpit/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Write failing tests for DashboardPage**

```typescript
// frontend/src/components/cockpit/__tests__/DashboardPage.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../DashboardPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DashboardPage', () => {
  const renderDashboard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage context="personal" />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders 4 widget sections', () => {
    renderDashboard();
    expect(screen.getByText('Heute')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('Letzte Aktivitaet')).toBeInTheDocument();
    expect(screen.getByText('Memory Health')).toBeInTheDocument();
  });

  it('has dashboard grid layout', () => {
    const { container } = renderDashboard();
    expect(container.querySelector('.dashboard-grid')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement DashboardPage**

```typescript
// frontend/src/components/cockpit/DashboardPage.tsx
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Mail, Calendar, Brain } from 'lucide-react';
import type { AIContext } from '../ContextSwitcher';
import './DashboardPage.css';

interface DashboardPageProps {
  context: AIContext;
}

interface WidgetProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  panel: string;
  children: React.ReactNode;
}

function Widget({ title, icon: Icon, panel, children }: WidgetProps) {
  const navigate = useNavigate();
  return (
    <button
      className="dashboard-widget"
      onClick={() => navigate(`/chat?panel=${panel}`)}
    >
      <div className="dashboard-widget__header">
        <Icon size={16} />
        <span>{title}</span>
      </div>
      <div className="dashboard-widget__content">
        {children}
      </div>
    </button>
  );
}

export function DashboardPage({ context }: DashboardPageProps) {
  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page__title">Dashboard</h1>
      <div className="dashboard-grid">
        <Widget title="Heute" icon={CheckSquare} panel="tasks">
          <p className="dashboard-widget__placeholder">Tasks und Termine laden...</p>
        </Widget>
        <Widget title="AI Insights" icon={Brain} panel="memory">
          <p className="dashboard-widget__placeholder">Vorschlaege laden...</p>
        </Widget>
        <Widget title="Letzte Aktivitaet" icon={Calendar} panel="ideas">
          <p className="dashboard-widget__placeholder">Aktivitaeten laden...</p>
        </Widget>
        <Widget title="Memory Health" icon={Brain} panel="memory">
          <p className="dashboard-widget__placeholder">Cognitive Score laden...</p>
        </Widget>
      </div>
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/DashboardPage.css */
.dashboard-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px;
}

.dashboard-page__title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.dashboard-widget {
  background: var(--surface-secondary, #111);
  border: 1px solid var(--border-primary, rgba(255,255,255,0.08));
  border-radius: 12px;
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
  color: inherit;
  font: inherit;
}

.dashboard-widget:hover {
  background: var(--surface-hover, rgba(255,255,255,0.04));
  border-color: var(--border-hover, rgba(255,255,255,0.12));
}

.dashboard-widget__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-secondary, rgba(255,255,255,0.6));
}

.dashboard-widget__content {
  font-size: 14px;
}

.dashboard-widget__placeholder {
  color: var(--text-tertiary, rgba(255,255,255,0.3));
  font-size: 12px;
}

@media (max-width: 640px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
```

Note: This is a skeleton DashboardPage. Each widget shows placeholder text initially. In a follow-up iteration, integrate existing React Query hooks (`useDashboard`, `useCognitiveData`) to populate widgets with real data. The skeleton structure and click-to-panel navigation is the core deliverable for Phase 2A.

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/DashboardPage.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/DashboardPage.tsx frontend/src/components/cockpit/DashboardPage.css frontend/src/components/cockpit/__tests__/DashboardPage.test.tsx
git commit -m "feat(cockpit): add new compact DashboardPage with 4 widget grid"
```

---

## Chunk 5: Keyboard Shortcuts + Command Palette + Mobile

### Task 15: Keyboard Shortcuts for Panels

**Files:**
- Modify: `frontend/src/components/cockpit/CockpitLayout.tsx`

- [ ] **Step 1: Add useEffect for keyboard shortcuts**

In CockpitLayout, add a `useEffect` that listens for `⌘1`-`⌘9`, `⌘/`, `Esc`, `⌘D`, `⌘,`:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const meta = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape') {
      dispatch({ type: 'CLOSE_PANEL' });
      return;
    }

    if (meta && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const panels: PanelType[] = ['tasks','email','ideas','calendar','contacts','documents','memory','finance','agents'];
      const idx = parseInt(e.key) - 1;
      if (idx < panels.length) {
        dispatch({ type: 'OPEN_PANEL', panel: panels[idx] });
      }
    }

    if (meta && e.key === '/') {
      e.preventDefault();
      dispatch({ type: 'OPEN_PANEL', panel: 'search' });
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [dispatch]);
```

- [ ] **Step 2: Test manually — verify ⌘1 opens Tasks panel, Esc closes it**
- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cockpit/CockpitLayout.tsx
git commit -m "feat(cockpit): add keyboard shortcuts for panel switching"
```

---

### Task 16: Update Command Palette for Panels

**Files:**
- Modify: `frontend/src/components/CommandPalette.tsx`

- [ ] **Step 1: Add panel commands to CommandPalette**

Add panel-opening commands to the command list. Each panel becomes a command:

```typescript
// Add to command list:
const panelCommands = panelRegistry.map(p => ({
  id: `panel-${p.id}`,
  label: p.label,
  shortcut: p.shortcut,
  icon: p.icon,
  action: () => panelDispatch({ type: 'OPEN_PANEL', panel: p.id }),
  category: 'Panels',
}));
```

- [ ] **Step 2: Run existing CommandPalette tests**

Run: `cd frontend && npx vitest run src/components/__tests__/CommandPalette.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CommandPalette.tsx
git commit -m "feat(cockpit): add panel commands to Command Palette"
```

---

### Task 17: Mobile Bottom Bar (3 items)

**Files:**
- Modify: `frontend/src/components/layout/MobileBottomBar.tsx`

- [ ] **Step 1: Simplify MobileBottomBar to 3 items when in cockpit mode**

When cockpit mode is active, render only Chat, Dashboard, Settings. The existing 5-item bar stays for old mode.

- [ ] **Step 2: Run existing tests**

Run: `cd frontend && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/MobileBottomBar.tsx
git commit -m "feat(cockpit): simplify MobileBottomBar to 3 items in cockpit mode"
```

---

## Chunk 6: Routing Migration + Legacy Redirects

### Task 18: Legacy Route Redirects

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Add redirect routes for all old URLs**

All old page URLs redirect to `/chat?panel=X` using the `legacyPageToPanel` mapping from Task 10. Add React Router `<Navigate>` elements for each old route.

- [ ] **Step 2: Verify redirects work**

Test in browser: navigating to `/ideen` should redirect to `/chat?panel=ideas`, `/planer` to `/chat?panel=tasks`, etc.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx frontend/src/routes/index.tsx
git commit -m "feat(cockpit): add legacy URL redirects to panel routes"
```

---

### Task 19: URL ↔ Panel State Sync

**Files:**
- Modify: `frontend/src/contexts/PanelContext.tsx`

- [ ] **Step 1: Add URL sync to PanelProvider**

The PanelProvider reads `?panel=X&filter=Y` from the URL on mount and dispatches `OPEN_PANEL`. When panel state changes, it updates the URL with `useSearchParams`. This makes panels deep-linkable and back-button compatible.

```typescript
// In PanelProvider:
const [searchParams, setSearchParams] = useSearchParams();

// On mount: read URL → dispatch
useEffect(() => {
  const panel = searchParams.get('panel') as PanelType | null;
  const filter = searchParams.get('filter') ?? undefined;
  if (panel) dispatch({ type: 'OPEN_PANEL', panel, filter });
}, []); // only on mount

// On state change: update URL
useEffect(() => {
  if (state.activePanel) {
    const params: Record<string, string> = { panel: state.activePanel };
    if (state.filter) params.filter = state.filter;
    setSearchParams(params, { replace: true });
  } else {
    setSearchParams({}, { replace: true });
  }
}, [state.activePanel, state.filter]);
```

- [ ] **Step 2: Run PanelContext tests**

Run: `cd frontend && npx vitest run src/components/cockpit/__tests__/PanelContext.test.ts`
Expected: PASS (reducer tests don't use URL)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/PanelContext.tsx
git commit -m "feat(cockpit): sync panel state with URL query parameters"
```

---

### Task 20: Final Integration Test + Cleanup

**Files:**
- All cockpit files

- [ ] **Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All existing + new tests PASS

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && npm test`
Expected: All tests PASS

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: Clean build, no TypeScript errors

- [ ] **Step 4: Build backend**

Run: `cd backend && npm run build`
Expected: Clean build

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(cockpit): integration fixes from full test suite"
```

---

## Summary

| Chunk | Tasks | New Files | Tests |
|-------|-------|-----------|-------|
| 1: Panel Foundation | 1-6 | 12 files | ~21 tests |
| 2: Chat Enhancements | 7-9 | 3 files + 3 modified | ~5 tests |
| 3: App Integration + First Panels | 10-12 | 4 files + 3 modified | — |
| 4: Remaining Panels + Dashboard | 13-14 | 9 files | ~2 tests |
| 5: Shortcuts + Command Palette + Mobile | 15-17 | 3 modified | — |
| 6: Routing + Legacy Redirects | 18-20 | 2 modified | — |
| **Total** | **20 tasks** | **~28 new files** | **~28 new tests** |
