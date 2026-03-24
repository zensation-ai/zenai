# Design & UX Premium Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ZenAI from dual-layout dev-tool aesthetic to cockpit-only premium product (Linear/Superhuman quality).

**Architecture:** Remove classic AppLayout/Sidebar entirely. CockpitLayout becomes the only layout. All pages become panels. Rail gets expanded nav. Ghost-style tabs, illustrated empty states, micro-interactions throughout.

**Tech Stack:** React 18, TypeScript, Framer Motion (existing), CSS Custom Properties, Lucide React icons, Vite dev server.

**Spec:** `docs/superpowers/specs/2026-03-24-design-ux-premium-overhaul.md`

**Test command:** `cd frontend && npx vitest run`
**Build command:** `cd frontend && npx tsc --noEmit && npx vite build`
**Dev server:** Already configured in `.claude/launch.json` as "frontend" (port 5173)

---

## Chunk 1: Foundation — Tokens, PanelTabs, PanelEmptyState

These are the shared building blocks that all subsequent tasks depend on.

### Task 1: Add All New CSS Tokens (Accent + Typography + Spacing)

**Files:**
- Modify: `frontend/src/styles/index.css` (`:root` block)
- Modify: `frontend/src/design-system/colors.ts`

- [ ] **Step 1: Add accent tokens to index.css**

In `frontend/src/styles/index.css`, find the `:root {` block and add after existing color definitions:

```css
/* Phase 3: Accent Hierarchy (Design Overhaul) */
--color-accent-orange: hsl(18, 100%, 60%);
--color-accent-orange-hover: hsl(18, 100%, 55%);
--color-accent-orange-ghost: hsla(18, 100%, 60%, 0.12);
--color-accent-orange-ghost-hover: hsla(18, 100%, 60%, 0.18);

--color-accent-indigo: hsl(250, 65%, 58%);
--color-accent-indigo-hover: hsl(250, 65%, 52%);
--color-accent-indigo-ghost: hsla(250, 65%, 58%, 0.12);
--color-accent-indigo-ghost-hover: hsla(250, 65%, 58%, 0.18);

--hover-overlay: rgba(255, 255, 255, 0.06);
--pressed-overlay: rgba(255, 255, 255, 0.10);

/* Aliases for backward compat */
--color-accent: var(--color-accent-indigo);
--primary: var(--color-accent-orange);

/* Phase 3: Typography Scale */
--type-title: 600 18px/1.3 var(--font-sans, system-ui, sans-serif);
--type-subtitle: 500 14px/1.4 var(--font-sans, system-ui, sans-serif);
--type-body: 400 14px/1.5 var(--font-sans, system-ui, sans-serif);
--type-caption: 400 12px/1.4 var(--font-sans, system-ui, sans-serif);
--type-chat: 400 16px/1.6 var(--font-sans, system-ui, sans-serif);
```

Note: The `font` shorthand tokens are optional — implementers may prefer using individual `font-size`, `font-weight`, `line-height` references to existing `--text-sm`, `--text-lg` tokens. The key rule is: panels use 14px base, chat uses 16px.

- [ ] **Step 2: Export tokens from design-system/colors.ts**

Add to the exports in `frontend/src/design-system/colors.ts`:

```typescript
export const accentOrange = {
  base: 'hsl(18, 100%, 60%)',
  hover: 'hsl(18, 100%, 55%)',
  ghost: 'hsla(18, 100%, 60%, 0.12)',
  ghostHover: 'hsla(18, 100%, 60%, 0.18)',
} as const;

export const accentIndigo = {
  base: 'hsl(250, 65%, 58%)',
  hover: 'hsl(250, 65%, 52%)',
  ghost: 'hsla(250, 65%, 58%, 0.12)',
  ghostHover: 'hsla(250, 65%, 58%, 0.18)',
} as const;
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/index.css frontend/src/design-system/colors.ts
git commit -m "style: add accent-orange and accent-indigo token hierarchy"
```

---

### Task 2: Create PanelTabs Component

**Files:**
- Create: `frontend/src/components/cockpit/PanelTabs.tsx`
- Create: `frontend/src/components/cockpit/PanelTabs.css`

- [ ] **Step 1: Create PanelTabs.css**

```css
.panel-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  height: 36px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.panel-tabs::-webkit-scrollbar {
  display: none;
}

.panel-tab {
  padding: 6px 12px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
  line-height: 1.4;
}

.panel-tab:hover {
  color: var(--text-primary);
  background: var(--hover-overlay);
}

.panel-tab[aria-selected="true"] {
  color: var(--color-accent-orange);
  background: var(--color-accent-orange-ghost);
  font-weight: 600;
}

.panel-tab:focus-visible {
  outline: 2px solid var(--color-accent-indigo);
  outline-offset: -2px;
}
```

- [ ] **Step 2: Create PanelTabs.tsx**

```tsx
import { memo } from 'react';
import './PanelTabs.css';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface PanelTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const PanelTabs = memo(function PanelTabs({ tabs, activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="panel-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="panel-tab"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="panel-tab__icon">{tab.icon}</span>}
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="panel-tab__badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
});
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/PanelTabs.tsx frontend/src/components/cockpit/PanelTabs.css
git commit -m "feat: add PanelTabs ghost-style tab component"
```

---

### Task 3: Create SVG Illustrations (8 files)

**Files:**
- Create: `frontend/src/assets/illustrations/empty-ideas.svg`
- Create: `frontend/src/assets/illustrations/empty-inbox.svg`
- Create: `frontend/src/assets/illustrations/empty-tasks.svg`
- Create: `frontend/src/assets/illustrations/empty-documents.svg`
- Create: `frontend/src/assets/illustrations/empty-calendar.svg`
- Create: `frontend/src/assets/illustrations/empty-ai.svg`
- Create: `frontend/src/assets/illustrations/empty-search.svg`
- Create: `frontend/src/assets/illustrations/empty-error.svg`

- [ ] **Step 1: Create all 8 SVG illustrations**

Style: Monochromatische line-art. `stroke="currentColor"`, `stroke-width="1.5"`, `fill="none"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. `viewBox="0 0 120 120"`. Subtle body fills allowed with `fill="currentColor" fill-opacity="0.05"`.

Each SVG should be a simple, elegant line drawing — 120x120 viewBox, under 1KB each. Reference motifs:

| File | Motif |
|------|-------|
| `empty-ideas.svg` | Lightbulb with 3 small sparkle lines radiating |
| `empty-inbox.svg` | Open envelope, flap open, empty inside |
| `empty-tasks.svg` | Clipboard with 3 empty checkbox lines |
| `empty-documents.svg` | Folder outline, slightly open |
| `empty-calendar.svg` | Calendar page with empty grid |
| `empty-ai.svg` | 3 circles connected by lines (neuron network) |
| `empty-search.svg` | Magnifying glass with small "x" inside |
| `empty-error.svg` | Cloud outline with zigzag lightning bolt |

- [ ] **Step 2: Verify SVGs render**

Open any SVG in browser to confirm it renders correctly with `currentColor`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/assets/illustrations/
git commit -m "art: add 8 empty state SVG illustrations (monochromatische line-art)"
```

---

### Task 4: Create PanelEmptyState Component

**Files:**
- Create: `frontend/src/components/cockpit/panels/PanelEmptyState.tsx`
- Create: `frontend/src/components/cockpit/panels/PanelEmptyState.css`

- [ ] **Step 1: Create PanelEmptyState.css**

```css
.panel-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 16px;
  flex: 1;
  min-height: 200px;
  color: var(--text-tertiary);
}

.panel-empty-state__illustration {
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
  color: var(--text-tertiary);
  opacity: 0.6;
}

@media (max-width: 767px) {
  .panel-empty-state__illustration {
    width: 96px;
    height: 96px;
  }
}

.panel-empty-state__title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 8px;
  line-height: 1.4;
}

.panel-empty-state__description {
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--text-secondary);
  margin: 0 0 16px;
  max-width: 280px;
  line-height: 1.5;
}

.panel-empty-state__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.panel-empty-state__primary-action {
  padding: 6px 16px;
  height: 32px;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  background: var(--color-accent-orange);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 150ms ease-out, transform 80ms ease-out;
}

.panel-empty-state__primary-action:hover {
  background: var(--color-accent-orange-hover);
}

.panel-empty-state__primary-action:active {
  transform: scale(0.97);
}

.panel-empty-state__secondary-action {
  padding: 4px 8px;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.panel-empty-state__secondary-action:hover {
  color: var(--text-secondary);
}
```

- [ ] **Step 2: Create PanelEmptyState.tsx**

```tsx
import { memo, type ReactNode } from 'react';
import './PanelEmptyState.css';

interface PanelEmptyStateAction {
  label: string;
  onClick: () => void;
}

interface PanelEmptyStateProps {
  variant: 'welcome' | 'no-results' | 'error';
  illustration?: ReactNode;
  title: string;
  description: string;
  action?: PanelEmptyStateAction;
  secondaryAction?: PanelEmptyStateAction;
}

export const PanelEmptyState = memo(function PanelEmptyState({
  illustration,
  title,
  description,
  action,
  secondaryAction,
}: PanelEmptyStateProps) {
  return (
    <div className="panel-empty-state">
      {illustration && (
        <div className="panel-empty-state__illustration">{illustration}</div>
      )}
      <h3 className="panel-empty-state__title">{title}</h3>
      <p className="panel-empty-state__description">{description}</p>
      {(action || secondaryAction) && (
        <div className="panel-empty-state__actions">
          {action && (
            <button
              className="panel-empty-state__primary-action"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              className="panel-empty-state__secondary-action"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/panels/PanelEmptyState.tsx frontend/src/components/cockpit/panels/PanelEmptyState.css
git commit -m "feat: add PanelEmptyState component with illustration support"
```

---

## Chunk 2: Layout Migration — Cockpit-Only

Remove classic mode, expand Rail, sync URL with panels.

### Task 5: Expand panelRegistry with Settings + Dashboard

**Files:**
- Modify: `frontend/src/components/cockpit/panelRegistry.ts`
- Modify: `frontend/src/contexts/PanelContext.tsx`

- [ ] **Step 1: Add settings and dashboard to PanelType**

In `frontend/src/contexts/PanelContext.tsx`, find the `PanelType` union and add `'settings' | 'dashboard'`:

```typescript
export type PanelType = 'tasks' | 'email' | 'ideas' | 'calendar' | 'contacts' | 'documents' | 'memory' | 'finance' | 'agents' | 'search' | 'settings' | 'dashboard';
```

Also update the `VALID_PANELS` array (if it exists) to include these.

- [ ] **Step 2: Add panel definitions to panelRegistry.ts**

Add to the `panelRegistry` array in `frontend/src/components/cockpit/panelRegistry.ts`:

```typescript
{ id: 'settings', icon: Settings, label: 'Einstellungen', shortcut: '⌘0' },
{ id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
```

Import `Settings` and `LayoutDashboard` from `lucide-react`.

Create placeholder panel components:
- `frontend/src/components/cockpit/panels/SettingsPanel.tsx`
- `frontend/src/components/cockpit/panels/DashboardPanel.tsx`

These are minimal wrappers initially — just a `<div>Einstellungen</div>` / `<div>Dashboard</div>` with the correct PanelProps interface. They will be built out in a later task.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/panelRegistry.ts frontend/src/contexts/PanelContext.tsx frontend/src/components/cockpit/panels/SettingsPanel.tsx frontend/src/components/cockpit/panels/DashboardPanel.tsx
git commit -m "feat: add settings and dashboard to panel registry"
```

---

### Task 6: Expand Rail Navigation (3 → 8 items)

**Files:**
- Modify: `frontend/src/components/cockpit/Rail.tsx`
- Modify: `frontend/src/components/cockpit/Rail.css`

- [ ] **Step 1: Update Rail to use PanelContext**

Replace the current `useNavigate()` + path-based navigation in `Rail.tsx` with `usePanelContext()` dispatch.

The Rail should have these nav items (top to bottom, matching spec Section 3.2):
1. **Chat** (MessageSquare) — `dispatch({ type: 'CLOSE_PANEL' })` (closes any open panel, shows chat)
2. **Ideas** (Lightbulb) — `dispatch({ type: 'OPEN_PANEL', panel: 'ideas' })`
3. **Calendar** (Calendar) — `dispatch({ type: 'OPEN_PANEL', panel: 'calendar' })`
4. **Email** (Mail) — `dispatch({ type: 'OPEN_PANEL', panel: 'email' })`
5. **Documents** (FileText) — `dispatch({ type: 'OPEN_PANEL', panel: 'documents' })`
6. **Finance** (BarChart3) — `dispatch({ type: 'OPEN_PANEL', panel: 'finance' })`
7. **Memory** (Brain) — `dispatch({ type: 'OPEN_PANEL', panel: 'memory' })`
8. **Settings** (Settings) — `dispatch({ type: 'OPEN_PANEL', panel: 'settings' })` (bottom-pinned)

Keep the existing context-cycle button and session-list popup.

Active state: compare `state.activePanel` with each item's panel ID. Chat is active when `activePanel === null`.

- [ ] **Step 2: Update Rail.css for active indicator**

Add active indicator bar (3px rounded, left edge, accent-orange):

```css
.rail__nav-item--active {
  color: var(--color-accent-orange);
}

.rail__nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--color-accent-orange);
}

.rail__nav-item {
  position: relative;
  color: var(--text-tertiary);
  transition: color 150ms ease-out;
}

.rail__nav-item:hover {
  color: var(--text-primary);
  background: var(--hover-overlay);
}
```

- [ ] **Step 3: Add tooltips to Rail items**

Each Rail icon should show a tooltip on hover (after 500ms delay). Use the `title` attribute or a lightweight tooltip implementation. If the codebase has a Tooltip component, use it. Otherwise, use CSS-only tooltips:

```css
.rail__nav-item[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 8px;
  padding: 4px 8px;
  background: var(--surface-3);
  color: var(--text-primary);
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease-out;
}

.rail__nav-item:hover[data-tooltip]::after {
  opacity: 1;
  transition-delay: 500ms;
}
```

- [ ] **Step 4: Verify build + visual check**

Run: `cd frontend && npx tsc --noEmit`
Start dev server and verify Rail shows all 7 items + settings at bottom. Click each to open the corresponding panel.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/Rail.tsx frontend/src/components/cockpit/Rail.css
git commit -m "feat: expand Rail to 8 nav items with PanelContext dispatch"
```

---

### Task 7: Remove Classic Layout Mode from App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Remove cockpitMode conditional**

In `App.tsx`, the `AuthenticatedApp` function has a conditional: `const cockpitMode = safeLocalStorage('get', 'zenai-cockpit-mode') === 'true'`. Remove this and always render CockpitLayout.

Remove the entire classic-mode branch (the `if (!cockpitMode)` path that renders AppLayout with Sidebar).

The `AuthenticatedApp` should always render:
```tsx
return (
  <PanelProvider>
    <CockpitLayout
      currentPage="chat"
      context={context}
      onContextChange={setContext}
      sessions={sessions}
      onSwitchSession={handleSwitchSession}
    >
      <GeneralChat ... />
    </CockpitLayout>
  </PanelProvider>
);
```

- [ ] **Step 2: Add redirect routes for legacy URLs**

In `routes/index.tsx` or in `App.tsx` (wherever the `<Routes>` are defined), add `<Navigate>` redirects for all legacy paths:

```tsx
<Route path="/ideas" element={<Navigate to="/?panel=ideas" replace />} />
<Route path="/ideen" element={<Navigate to="/?panel=ideas" replace />} />
<Route path="/calendar" element={<Navigate to="/?panel=calendar" replace />} />
<Route path="/planer" element={<Navigate to="/?panel=calendar" replace />} />
<Route path="/inbox" element={<Navigate to="/?panel=email" replace />} />
<Route path="/documents" element={<Navigate to="/?panel=documents" replace />} />
<Route path="/wissen" element={<Navigate to="/?panel=documents" replace />} />
<Route path="/settings" element={<Navigate to="/?panel=settings" replace />} />
<Route path="/system" element={<Navigate to="/?panel=settings" replace />} />
<Route path="/my-ai" element={<Navigate to="/?panel=memory" replace />} />
<Route path="/meine-ki" element={<Navigate to="/?panel=memory" replace />} />
```

Keep `/auth` route as-is (public, path-based).

- [ ] **Step 3: Remove localStorage cockpit toggle**

Search for all references to `'zenai-cockpit-mode'` in the codebase and remove them. Settings should no longer offer a cockpit/classic toggle.

- [ ] **Step 4: Verify build + run tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: Build passes. Some tests may fail if they reference AppLayout — note which ones for Task 8.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/routes/index.tsx
git commit -m "feat: remove classic layout mode, cockpit is now the only layout"
```

---

### Task 7b: Delete Classic Layout Files + Clean Up

**Files:**
- Delete: `frontend/src/components/layout/AppLayout.tsx` + `.css`
- Delete: `frontend/src/components/layout/Sidebar.tsx` + `.css`
- Delete: `frontend/src/components/layout/TopBar.tsx` + `.css`
- Delete: `frontend/src/components/layout/MobileSidebarDrawer.tsx` + `.css`
- Delete: `frontend/src/components/Breadcrumbs.tsx` + `.css`
- Modify: `frontend/src/navigation.ts`
- Modify: `frontend/src/components/GeneralChat/GeneralChat.tsx`

- [ ] **Step 1: Delete classic layout files**

```bash
cd frontend/src/components
rm -f layout/AppLayout.tsx layout/AppLayout.css
rm -f layout/Sidebar.tsx layout/Sidebar.css
rm -f layout/TopBar.tsx layout/TopBar.css
rm -f layout/MobileSidebarDrawer.tsx layout/MobileSidebarDrawer.css
rm -f Breadcrumbs.tsx Breadcrumbs.css
```

- [ ] **Step 2: Simplify navigation.ts**

`frontend/src/navigation.ts` currently defines `NAV_ITEMS`, `NAV_HUB_ITEM`, helper functions for classic sidebar navigation. Simplify it:
- Keep the `NavItem` interface and item definitions (used by BottomBar, CommandPalette)
- Remove classic-sidebar-specific helpers that are no longer needed
- Keep `getPageLabel()`, `getPageDescription()` as they may be used in panel headers

- [ ] **Step 3: Remove classic-mode branches from GeneralChat**

Audit `frontend/src/components/GeneralChat/GeneralChat.tsx` for any `cockpitMode`, `isCockpit`, or layout-mode conditionals. Remove the non-cockpit branches. The chat component should always render as if in cockpit mode.

- [ ] **Step 4: Remove all references to `zenai-cockpit-mode`**

Search: `grep -r "zenai-cockpit-mode" frontend/src/`
Remove every occurrence — localStorage reads, writes, and conditionals.

- [ ] **Step 5: Clean up routes/index.tsx**

The `PAGE_PATHS` and `PATH_PAGES` maps in `routes/index.tsx` are used for classic routing. Keep them for now (they're used by redirect routes and deep-linking helpers) but add a comment: `// Legacy: used for redirect routes. Panel navigation uses ?panel= params.`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete classic layout files, clean up navigation and GeneralChat"
```

---

### Task 7c: Enhance PanelContext URL Sync + PanelShell Polish

**Files:**
- Modify: `frontend/src/contexts/PanelContext.tsx`
- Modify: `frontend/src/components/cockpit/PanelShell.tsx`
- Modify: `frontend/src/components/cockpit/PanelShell.css`

- [ ] **Step 1: Verify PanelContext URL sync is bidirectional**

Read `frontend/src/contexts/PanelContext.tsx`. It should already:
- Read `?panel=X` from URL on mount (init state from URL)
- Update URL when `OPEN_PANEL` / `CLOSE_PANEL` dispatched

If the URL → dispatch direction is missing (URL change doesn't update state), add a `useEffect` that watches `searchParams.get('panel')` and dispatches accordingly:

```tsx
useEffect(() => {
  const urlPanel = searchParams.get('panel') as PanelType | null;
  if (urlPanel !== state.activePanel) {
    if (urlPanel && VALID_PANELS.includes(urlPanel)) {
      dispatch({ type: 'OPEN_PANEL', panel: urlPanel });
    } else if (!urlPanel && state.activePanel) {
      dispatch({ type: 'CLOSE_PANEL' });
    }
  }
}, [searchParams]);
```

- [ ] **Step 2: Polish PanelShell header**

Update `PanelShell.tsx` to enforce the spec's panel header anatomy:
- Header row: Panel icon (from panelRegistry) + title (`--type-title`: 18px/600) + close button
- Ensure max 2 control rows below header (tabs + optional toolbar)
- Pin button should use ghost style (not solid)

Update `PanelShell.css`:
- Header height: 44px
- Horizontal padding: 16px
- Icon size: 16px, color: `var(--text-tertiary)`
- Title: `font-size: 1.125rem; font-weight: 600;`
- Close button: 28px, `var(--text-tertiary)`, hover `var(--text-primary)`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/PanelContext.tsx frontend/src/components/cockpit/PanelShell.tsx frontend/src/components/cockpit/PanelShell.css
git commit -m "feat: ensure PanelContext URL sync is bidirectional, polish PanelShell header"
```

---

### Task 7d: Restyle Context Badge

**Files:**
- Modify: `frontend/src/components/cockpit/Rail.tsx` (or wherever context indicator renders)

- [ ] **Step 1: Replace solid pill with dot + text**

Find the context badge rendering (currently a solid colored pill showing "Arbeit" / "Privat"). Replace with:
- 6px circle dot with context color (`var(--context-personal)` etc.)
- Text label in `var(--text-secondary)`, `font-size: 0.75rem`
- Only visible in Rail's context section, not as a permanent top-bar badge

```css
.context-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.context-indicator__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cockpit/Rail.tsx frontend/src/components/cockpit/Rail.css
git commit -m "style: restyle context badge from solid pill to subtle dot + text"
```

---

### Task 8: Fix Broken Imports + Tests

**Files:**
- Modify: Any files that import deleted/changed components

- [ ] **Step 1: Find broken imports**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -50`

Fix any TypeScript errors caused by:
- Imports of `AppLayout`, `Sidebar`, `TopBar`, `Breadcrumbs`, `MobileSidebarDrawer` — remove these imports
- References to `cockpitMode` boolean — remove conditionals
- Tests referencing classic-mode components — update mocks

- [ ] **Step 2: Fix failing tests**

Run: `cd frontend && npx vitest run 2>&1 | tail -30`

Update any tests that:
- Mock `AppLayout` → mock `CockpitLayout` instead
- Test classic-mode navigation → remove or update to panel navigation
- Reference `Sidebar` or `TopBar` → remove

- [ ] **Step 3: Verify full test suite passes**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: update imports and tests for cockpit-only layout"
```

---

### Task 9: Update CockpitBottomBar for Mobile

**Files:**
- Modify: `frontend/src/components/cockpit/CockpitBottomBar.tsx`
- Modify: `frontend/src/components/cockpit/CockpitBottomBar.css`

- [ ] **Step 1: Expand BottomBar to 5 items**

Update `CockpitBottomBar.tsx` to show 5 navigation items:
1. **Chat** (MessageSquare) — closes panel
2. **Ideas** (Lightbulb) — opens ideas panel
3. **Calendar** (Calendar) — opens calendar panel
4. **Email** (Mail) — opens email panel
5. **More** (MoreHorizontal) — toggles a bottom sheet with remaining panels

All items use `usePanelContext()` dispatch, same as Rail.

- [ ] **Step 2: Create "More" bottom sheet**

When "More" is tapped, show a bottom sheet overlay with:
- Documents, Memory, Settings (as a simple list with icons + labels)
- Tap to open panel, sheet closes automatically

Simple implementation: a `position: fixed` div with slide-up animation.

- [ ] **Step 3: Style BottomBar**

Active item: orange icon color + dot indicator below.
Inactive: `var(--text-tertiary)`.
Height: 56px + safe-area-inset-bottom.

- [ ] **Step 4: Verify on mobile viewport**

Use dev tools responsive mode (375px width). Verify:
- BottomBar appears
- Rail is hidden
- Tapping items opens panels as full-screen sheets

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cockpit/CockpitBottomBar.tsx frontend/src/components/cockpit/CockpitBottomBar.css
git commit -m "feat: expand mobile bottom bar to 5 items with 'More' sheet"
```

---

## Chunk 3: Visual Polish — Tabs, Empty States, Floating Assistant

### Task 10: Integrate PanelTabs into Existing Panels

**Files:**
- Modify: All 10 existing panel components in `frontend/src/components/cockpit/panels/`

- [ ] **Step 1: Identify panels that use tabs**

Read each panel file to find which ones have internal tab navigation. Replace their custom tab implementations with the new `PanelTabs` component from Task 2.

For panels without tabs: no changes needed (just empty state integration in Task 11).

- [ ] **Step 2: Replace tab implementations**

For each panel with tabs (likely IdeasPanel, EmailPanel, CalendarPanel at minimum):
- Import `PanelTabs` and `Tab` type from `../PanelTabs`
- Define tab array: `const tabs: Tab[] = [{ id: 'active', label: 'Aktiv' }, ...]`
- Replace custom tab rendering with `<PanelTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />`

- [ ] **Step 3: Verify build + visual check**

Run: `cd frontend && npx tsc --noEmit`
Open dev server. Click through each panel. Verify ghost-style tabs appear correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/panels/
git commit -m "style: integrate PanelTabs ghost-style component across all panels"
```

---

### Task 11: Integrate PanelEmptyState into All Panels

**Files:**
- Modify: All 10+ panel components in `frontend/src/components/cockpit/panels/`

- [ ] **Step 1: Import SVG illustrations**

Create an index file at `frontend/src/assets/illustrations/index.ts` that exports all SVGs as React components (using Vite's `?react` import or as `<img>` tags).

- [ ] **Step 2: Add empty states to each panel**

For each panel, find the "no data" / "loading error" / "empty list" rendering and replace with `PanelEmptyState`:

| Panel | Illustration | Title | Description | CTA |
|-------|-------------|-------|-------------|-----|
| IdeasPanel | empty-ideas | "Deine Ideensammlung" | "Halte Gedanken fest, entwickle sie weiter und verbinde sie miteinander." | "Erste Idee erstellen" |
| EmailPanel | empty-inbox | "Dein Posteingang" | "Verbinde dein E-Mail-Konto, um Nachrichten direkt in ZenAI zu verwalten." | "E-Mail verbinden" |
| TasksPanel | empty-tasks | "Deine Aufgaben" | "Plane und verfolge deine Aufgaben mit Kanban, Gantt und KI-Unterstuetzung." | "Erste Aufgabe erstellen" |
| DocumentsPanel | empty-documents | "Deine Wissensbasis" | "Lade Dokumente hoch und lass die KI sie fuer dich erschliessen." | "Dokument hochladen" |
| CalendarPanel | empty-calendar | "Dein Kalender" | "Verbinde deinen Kalender fuer Termine, Meetings und Tagesplanung." | "Kalender verbinden" |
| MemoryPanel | empty-ai | "Deine KI kennenlernen" | "Starte ein Gespraech — je mehr du mit ZenAI sprichst, desto besser versteht sie dich." | "Gespraech starten" |
| SearchPanel | empty-search | "Keine Ergebnisse" | "Fuer '{query}' wurde nichts gefunden." | — |

For error states, use `empty-error` illustration with:
- Title: "Verbindung fehlgeschlagen"
- Description: "Der Server ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut."
- CTA: "Erneut versuchen"

- [ ] **Step 3: Verify visual appearance**

Open dev server (no backend running = empty states visible everywhere). Verify each panel shows its illustration + text + CTA.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/assets/illustrations/index.ts frontend/src/components/cockpit/panels/
git commit -m "feat: add illustrated empty states to all panels"
```

---

### Task 12: Redesign FloatingAssistant

**Files:**
- Modify: `frontend/src/components/FloatingAssistant/FloatingAssistant.tsx`
- Create: `frontend/src/components/FloatingAssistant/FloatingAssistant.css`

- [ ] **Step 1: Create FloatingAssistant.css**

```css
.floating-assistant__trigger {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 150ms ease-out, transform 80ms ease-out;
}

.floating-assistant__trigger:hover {
  background: var(--color-accent-indigo);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px hsla(250, 65%, 58%, 0.3);
}

.floating-assistant__trigger:active {
  transform: scale(0.93);
}

.floating-assistant__trigger svg {
  width: 18px;
  height: 18px;
}
```

- [ ] **Step 2: Update FloatingAssistant.tsx**

Replace the emoji 🧠 with Lucide's `Sparkles` icon:
```tsx
import { Sparkles } from 'lucide-react';
```

Replace the trigger button rendering to use the new CSS class and Lucide icon instead of the emoji. Remove any orange glow/shadow styles. Import the new CSS file.

- [ ] **Step 3: Verify visual**

Open dev server. FAB should be a 40px circle with subtle border, Sparkles icon, indigo hover.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/FloatingAssistant/
git commit -m "style: redesign floating assistant — 40px, Lucide icon, indigo hover"
```

---

## Chunk 4: Micro-Interactions + Final Polish

### Task 13: Add Panel Animation Enhancement

**Files:**
- Modify: `frontend/src/components/cockpit/PanelArea.tsx`

- [ ] **Step 1: Add content stagger to PanelArea**

Inside `PanelArea.tsx`, wrap the panel content (inside the `motion.div`) with an additional stagger wrapper:

```tsx
import { motion } from 'framer-motion';

// Inside the existing AnimatePresence > motion.div, wrap the Suspense content:
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.05, duration: 0.15 }}
>
  <Suspense fallback={<div className="panel-loading">Laden...</div>}>
    <PanelShell ...>
      <PanelComponent ... />
    </PanelShell>
  </Suspense>
</motion.div>
```

Respect `reduceMotion`: if true, skip the stagger (initial = animate = `{ opacity: 1, y: 0 }`).

- [ ] **Step 2: Verify animation**

Open dev server. Click a Rail icon. Panel should slide in from right with content fading in slightly delayed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cockpit/PanelArea.tsx
git commit -m "style: add content stagger animation to panel entrance"
```

---

### Task 14: Add Global Micro-Interactions

**Files:**
- Modify: `frontend/src/styles/index.css`

- [ ] **Step 1: Add global interaction styles**

Add to `frontend/src/styles/index.css` (at the end, before any media queries):

```css
/* === Global Micro-Interactions (Design Overhaul) === */

/* Button press feedback */
button,
[role="button"] {
  transition: transform 80ms ease-out;
}

button:active,
[role="button"]:active {
  transform: scale(0.97);
}

/* List item hover */
.list-item-interactive {
  transition: background 150ms ease-out, transform 150ms ease-out;
}

.list-item-interactive:hover {
  background: var(--hover-overlay);
  transform: translateX(2px);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  button,
  [role="button"],
  .list-item-interactive {
    transition: none !important;
  }
}
```

- [ ] **Step 2: Apply `.list-item-interactive` class to panel list items**

In each panel that renders a list (IdeasPanel, EmailPanel, TasksPanel, ContactsPanel, DocumentsPanel), add `className="list-item-interactive"` to each list row element.

- [ ] **Step 3: Verify interactions**

Open dev server. Hover over list items — subtle background + 2px shift. Click any button — scale feedback.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/index.css frontend/src/components/cockpit/panels/
git commit -m "style: add global micro-interactions (button press, list hover)"
```

---

### Task 15: Final Build Verification + Cleanup

**Files:**
- Various cleanup across modified files

- [ ] **Step 1: Run full build**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Fix any TypeScript errors or build warnings.

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npx vitest run
```

Fix any failing tests.

- [ ] **Step 3: Visual smoke test**

Start dev server. Verify:
- [ ] Rail shows 7 items + settings (bottom)
- [ ] Clicking Rail items opens correct panels
- [ ] Panels have ghost-style tabs
- [ ] Empty states show illustrations + German copy + CTAs
- [ ] Floating assistant is 40px circle with Sparkles icon
- [ ] Button press shows scale feedback
- [ ] List item hover shows subtle shift
- [ ] Panel open/close animation is smooth
- [ ] Mobile viewport (375px): BottomBar with 5 items, full-screen panels
- [ ] No orange-overload — only primary CTAs are solid orange

- [ ] **Step 4: Remove dead code (if safe)**

Check for any remaining imports of deleted components (AppLayout, Sidebar, TopBar, Breadcrumbs). Remove them.

Check for any remaining references to `cockpitMode` or `zenai-cockpit-mode`. Remove them.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and build verification for design overhaul"
```

---

## Summary

| Chunk | Tasks | Focus |
|-------|-------|-------|
| 1 (Foundation) | 1-4 | All tokens (accent + typography), PanelTabs, SVG illustrations, PanelEmptyState |
| 2 (Layout Migration) | 5, 6, 7, 7b, 7c, 7d, 8, 9 | Cockpit-only, expanded Rail, delete classic files, PanelContext sync, context badge, mobile BottomBar |
| 3 (Visual Polish) | 10-12 | Tab integration, empty states in all panels, FloatingAssistant redesign |
| 4 (Micro-Interactions) | 13-15 | Panel animation stagger, global interactions, final verification |

**Total tasks:** 18 (15 + 7b, 7c, 7d)
**Estimated commits:** 18
**Key constraint:** No backend changes. All existing tests must pass.
