# ZenAI Design & UX Premium Overhaul — "Cockpit Commitment"

**Date:** 2026-03-24
**Author:** Claude (Design Audit) + Alexander Bering (Direction)
**Status:** Draft
**Scope:** Frontend-only. No backend changes. No new features — pure visual/UX transformation.

---

## 1. Problem Statement

ZenAI has mature functionality (141 phases, 55 AI tools, 9228 tests) but looks like a developer tool, not a $29/month premium product. A visual audit identified 10 systemic design problems:

1. **Tab & chip overload** — 2-4 rows of controls before content on every page
2. **Inconsistent page structure** — some pages have hero headers, others don't
3. **Empty states are plain text** — no illustrations, no guidance
4. **Light mode is broken** — sidebar stays dark, partial token coverage
5. **Orange accent dominates** — solid orange pills on every active element
6. **Spacing & density mismatch** — 48px rail vs 64px sidebar, mixed px values
7. **Floating brain emoji** — literal emoji as FAB
8. **Two layout modes coexist** — cockpit and classic feel like different apps
9. **Typography lacks hierarchy** — no clear size/weight progression
10. **No micro-interactions** — spring tokens exist but aren't applied

**Root cause:** The app grew organically over 141 phases. Each phase added functionality but visual debt accumulated. Two layout systems (Classic + Cockpit) split design attention.

**Target:** Visual parity with Linear, Superhuman, Arc Browser. One cohesive design language.

---

## 2. Design Decisions (User-Approved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout mode | **Cockpit-only** | Eliminates dual-layout maintenance, enables single density/design |
| Accent strategy | **Minimal Orange** | Orange reserved for primary CTAs only. Ghost-style for tabs/chips. AI-Indigo for AI features |
| Empty states | **Illustrations + CTA** | SVG line-art illustrations per panel, clear guidance for new users |

---

## 3. Architecture: Cockpit-Only Layout

### 3.1 What Gets Removed

| File | Reason |
|------|--------|
| `components/layout/AppLayout.tsx` + `.css` | Replaced by CockpitLayout |
| `components/layout/Sidebar.tsx` + `.css` | Replaced by Rail |
| `components/layout/TopBar.tsx` + `.css` | Merged into CockpitLayout header area |
| `components/layout/MobileSidebarDrawer.tsx` + `.css` | Mobile uses BottomBar + full-screen panels |
| `components/layout/Breadcrumbs.tsx` + `.css` | Panels don't need breadcrumbs |
| Classic-mode branch in `App.tsx` | The `if (!cockpitMode)` conditional and all classic routing |
| `localStorage 'zenai-cockpit-mode'` toggle | Always cockpit, no toggle |
| Page-hero sections ("← Zurueck" + icon + title) | Redundant — panel header is sufficient |

**Migration path — existing panels are kept, not replaced:**
The cockpit already has 10 purpose-built panel components in `components/cockpit/panels/` (IdeasPanel, EmailPanel, TasksPanel, etc.). These are already optimized for 360-600px panel width. They stay as-is and get the visual polish described in this spec. The full-page components (IdeasPage, EmailPage, etc.) become dead code once classic mode is removed — they are NOT squeezed into panels.

**Panel components to polish (existing, in `cockpit/panels/`):**
- `IdeasPanel.tsx` — ideas list with search + filters
- `EmailPanel.tsx` — email list with tabs (Eingang/Gesendet/etc.)
- `TasksPanel.tsx` — task list with status filter
- `CalendarPanel.tsx` — compact calendar view
- `ContactsPanel.tsx` — contact list
- `DocumentsPanel.tsx` — document browser
- `MemoryPanel.tsx` — AI memory/knowledge view
- `FinancePanel.tsx` — financial overview
- `AgentsPanel.tsx` — agent management
- `SearchPanel.tsx` — global search

**New panels to add:**
- `SettingsPanel.tsx` — settings moved from full page to panel format
- `DashboardPanel.tsx` — optional dashboard widget view (existing `DashboardPage.tsx` adapted)

### 3.2 Desktop Layout (1024px+)

```
┌──────┬──────────────────────────┬─────────────────────┐
│ Rail │      Chat Area           │     Panel Area      │
│ 48px │      flex: 1             │     360px default   │
│      │      min-width: 400px    │     min: 320px      │
│      │                          │     max: 640px      │
│      │                          │     resizable        │
│      │                          │                     │
│  ◉   │   [welcome / messages]   │  [panel content]    │
│  💡  │                          │                     │
│  📅  │                          │                     │
│  ✉   │                          │                     │
│  📚  │                          │                     │
│  🧠  │                          │                     │
│  ⚙   │                          │                     │
│      │   [input bar]            │                     │
└──────┴──────────────────────────┴─────────────────────┘
```

**Rail items (top to bottom):**

| Position | Icon (Lucide) | Panel ID | Tooltip | PanelContext Action |
|----------|--------------|----------|---------|---------------------|
| Top | `MessageSquare` | — (closes panel) | "Chat" | `dispatch({ type: 'CLOSE_PANEL' })` |
| — | `Lightbulb` | `ideas` | "Ideen" | `dispatch({ type: 'OPEN_PANEL', panel: 'ideas' })` |
| — | `Calendar` | `calendar` | "Planer" | `dispatch({ type: 'OPEN_PANEL', panel: 'calendar' })` |
| — | `Mail` | `email` | "Inbox" | `dispatch({ type: 'OPEN_PANEL', panel: 'email' })` |
| — | `FileText` | `documents` | "Wissen" | `dispatch({ type: 'OPEN_PANEL', panel: 'documents' })` |
| — | `BarChart3` | `finance` | "Cockpit" | `dispatch({ type: 'OPEN_PANEL', panel: 'finance' })` |
| — | `Brain` | `memory` | "Meine KI" | `dispatch({ type: 'OPEN_PANEL', panel: 'memory' })` |
| Bottom | `Settings` | `settings` | "Einstellungen" | `dispatch({ type: 'OPEN_PANEL', panel: 'settings' })` |

**Rail-PanelContext integration:** Rail imports `usePanelContext()` and dispatches `OPEN_PANEL` / `CLOSE_PANEL` actions (replacing current `useNavigate()` path-based nav). The URL is synchronized by `CockpitLayout` which watches PanelContext state and calls `setSearchParams()` accordingly. Rail highlights the active icon by comparing `state.activePanel` with each item's panel ID.

**Panels NOT in Rail (intentional):** `tasks`, `contacts`, `agents`, `search`, `finance` are accessible via:
- Chat slash commands (`/tasks`, `/contacts`, etc.)
- Keyboard shortcuts (existing `Cmd+1` through `Cmd+9`)
- The mobile "More" bottom sheet
- Direct URL (`/?panel=tasks`)

Rail shows only the 7 most-used panels + Chat to avoid icon overload. The dashboard grid (accessible via Rail's grid icon) provides access to all panels.

**PanelType expansion:** The `PanelType` union in `PanelContext.tsx` and the `VALID_PANELS` array must be updated to include `'settings' | 'dashboard'` when those panels are added to `panelRegistry.ts`.

**Rail visual spec:**
- Width: 48px
- Background: `var(--surface-bg)`
- Border-right: `1px solid var(--border)`
- Icon size: 20px
- Icon color (inactive): `var(--text-tertiary)`
- Icon color (active): `var(--color-accent)` (orange)
- Active indicator: 3px rounded bar on left edge, `var(--color-accent)`
- Icon vertical spacing: 8px gap
- Hover: `var(--text-primary)` + background `rgba(255,255,255, 0.06)`
- Tooltip: appears on hover after 500ms delay, right-aligned

**Panel Area spec (update existing PanelContext constants):**
- Default width: 420px (existing `DEFAULT_WIDTH`, keep as-is)
- Resizable via drag handle (existing PanelShell mechanism)
- Min: 360px (existing `MIN_WIDTH`, keep as-is), Max: 640px (update `MAX_WIDTH` from 600 to 640 for Settings panel)
- When no panel open: Chat area takes full width (no empty right column)
- Panel open/close: slide animation (see Section 7)
- Background: `var(--surface-bg)`
- Border-left: `1px solid var(--border)`

**Chat Area spec:**
- Takes remaining space (`flex: 1`)
- Min-width: 400px
- Max-width for messages: 720px (centered within chat area)
- Welcome state centered vertically and horizontally
- Background: `var(--calmSurface-bg, var(--surface-bg))`

### 3.3 Tablet Layout (768px - 1023px)

- Rail collapses to icon-only (already 48px, stays)
- Panel opens as overlay (absolute positioned, slides from right)
- Panel gets close button in header
- Chat area stays full-width underneath
- Panel backdrop: `rgba(0,0,0, 0.3)` click-to-close

### 3.4 Mobile Layout (< 768px)

```
┌─────────────────────────────┐
│  Active View (full screen)  │
│  Chat OR Panel              │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│  BottomBar (56px + safe)    │
│  💬  💡  📅  ✉  ···        │
└─────────────────────────────┘
```

- No Rail on mobile
- BottomBar: 5 items (Chat, Ideas, Planner, Inbox, More)
- "More" opens a bottom sheet with remaining nav items
- Panel = full-screen view, replaces chat
- Swipe-right to go back to chat (stretch goal — requires touch event handling with 50px threshold. Implement via custom hook or `react-swipeable` if added. Core functionality works without swipe — close button in panel header is sufficient.)
- BottomBar highlights active item

### 3.5 URL Strategy

**Hybrid routing:** Public routes stay path-based. Authenticated app uses query params on `/`.

**Router structure (react-router-dom):**
```tsx
<Routes>
  {/* Public routes — path-based, no auth */}
  <Route path="/auth" element={<AuthPage />} />
  <Route path="/demo" element={<DemoPage />} />

  {/* Authenticated — single route, panel state from query params */}
  <Route path="/" element={<CockpitLayout />} />

  {/* Back-compat redirects for legacy URLs */}
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

  {/* Catch-all */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

**Panel state from `useSearchParams()`:**
```tsx
const [searchParams, setSearchParams] = useSearchParams();
const activePanel = searchParams.get('panel') as PanelType | null;
const activeTab = searchParams.get('tab');
```

**Navigation via query params:**

| URL | State |
|-----|-------|
| `/` | Chat only, no panel |
| `/?panel=ideas` | Chat + Ideas panel |
| `/?panel=ideas&tab=incubator` | Chat + Ideas panel, Incubator tab |
| `/?panel=email` | Chat + Email panel |
| `/?panel=settings&tab=ai` | Chat + Settings panel, AI tab |
| `/?panel=calendar&tab=tasks` | Chat + Calendar panel, Tasks tab |

**Panel IDs (matching existing `panelRegistry.ts`):**
`tasks`, `email`, `ideas`, `calendar`, `contacts`, `documents`, `memory`, `finance`, `agents`, `search`

**New panel IDs to register:**
`settings`, `dashboard`

**Browser history:** `setSearchParams()` uses `history.pushState` — back button navigates between panel states correctly.

---

## 4. Color & Accent Hierarchy

### 4.1 Accent Usage Rules

| Level | CSS | Usage | Examples |
|-------|-----|-------|----------|
| **Primary CTA** | `background: var(--color-accent-orange); color: white` | ONE per visible panel. The main action. | "Neue Idee", "Verfassen", "Senden" |
| **Active State** | `background: var(--color-accent-orange-ghost); color: var(--color-accent-orange)` | Active tab, active nav item | Active tab in panel, active rail icon |
| **AI Accent** | `color: var(--color-accent-indigo)` or `background: var(--color-accent-indigo-ghost)` | AI-generated content, AI features | Thinking indicator, smart suggestions, AI badges |
| **Neutral Interactive** | `color: var(--text-secondary); background: transparent` | Inactive tabs, secondary actions | Inactive tabs, filter chips, secondary buttons |

### 4.2 New CSS Custom Properties

**Token integration:** New tokens must be added to BOTH:
1. `design-system/colors.ts` (TypeScript source of truth) — as new exports
2. `styles/index.css` `:root` block — as CSS custom properties

The existing `--color-accent` (hsl(250, 65%, 58%)) becomes an alias for `--color-accent-indigo`. The existing `--primary` (#ff6b35) becomes an alias for `--color-accent-orange`. Both aliases kept for backward compatibility.

```css
:root {
  /* Primary accent (Orange — brand) */
  --color-accent-orange: hsl(18, 100%, 60%);        /* #ff6b35 */
  --color-accent-orange-hover: hsl(18, 100%, 55%);
  --color-accent-orange-ghost: hsla(18, 100%, 60%, 0.12);
  --color-accent-orange-ghost-hover: hsla(18, 100%, 60%, 0.18);

  /* AI accent (Indigo) */
  --color-accent-indigo: hsl(250, 65%, 58%);
  --color-accent-indigo-hover: hsl(250, 65%, 52%);
  --color-accent-indigo-ghost: hsla(250, 65%, 58%, 0.12);
  --color-accent-indigo-ghost-hover: hsla(250, 65%, 58%, 0.18);

  /* Semantic status */
  --color-success: hsl(160, 70%, 42%);
  --color-success-ghost: hsla(160, 70%, 42%, 0.12);
  --color-warning: hsl(38, 95%, 55%);
  --color-warning-ghost: hsla(38, 95%, 55%, 0.12);
  --color-danger: hsl(0, 72%, 55%);
  --color-danger-ghost: hsla(0, 72%, 55%, 0.12);

  /* Interactive overlays (theme-aware) */
  --hover-overlay: rgba(255, 255, 255, 0.06);    /* dark mode */
  --pressed-overlay: rgba(255, 255, 255, 0.10);   /* dark mode */

  /* Alias existing tokens for backward compat */
  --color-accent: var(--color-accent-indigo);      /* existing alias */
  --primary: var(--color-accent-orange);            /* existing alias */
}
```

### 4.3 Tab Restyling

**Before:**
```
[████ Aktiv ████]  [ Inkubator ]  [ Archiv ]  [ Sortieren ]
 solid orange bg    border pill    border pill  border pill
```

**After:**
```
 Aktiv              Inkubator       Archiv       Sortieren
 ─────              (plain)         (plain)      (plain)
 orange text         secondary       secondary    secondary
 ghost bg            no bg           no bg        no bg
```

**CSS spec for panel tabs:**
```css
.panel-tab {
  padding: 6px 12px;
  font-size: var(--text-sm);  /* 14px */
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);  /* 6px */
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.panel-tab:hover {
  color: var(--text-primary);
  background: var(--hover-overlay);  /* defined as rgba(255,255,255,0.06) dark / rgba(0,0,0,0.04) light */
}

.panel-tab[aria-selected="true"] {
  color: var(--color-accent-orange);
  background: var(--color-accent-orange-ghost);
  font-weight: 600;
}
```

### 4.4 Context Badge Restyling

**Before:** Solid colored pill "Arbeit" / "Privat" in top bar.

**After:** Small dot (6px) + text label in secondary color. Only visible in Rail tooltip or panel header, not a permanent badge consuming attention.

```css
.context-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--context-work);  /* or --context-personal etc */
}
```

### 4.5 Floating Assistant Redesign

**Before:** ~56px orange circle with 🧠 emoji, permanent glow.

**After:**
```css
.floating-assistant {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
  /* Lucide BrainCircuit or Sparkles icon, 18px */
}

.floating-assistant:hover {
  background: var(--color-accent-indigo);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px hsla(250, 65%, 58%, 0.3);
}
```

Position: `bottom: 16px; right: 16px`. Hidden when chat area is visible (only shows when user is in a panel on mobile without chat visible).

---

## 5. Typography & Spacing

### 5.1 Type Scale

| Token | Size | Weight | Line-Height | Letter-Spacing | Use |
|-------|------|--------|-------------|----------------|-----|
| `--type-title` | 18px | 600 | 1.3 | -0.01em | Panel headers |
| `--type-subtitle` | 14px | 500 | 1.4 | 0 | Section headers, tab labels |
| `--type-body` | 14px | 400 | 1.5 | 0 | All content text in panels |
| `--type-caption` | 12px | 400 | 1.4 | 0.01em | Timestamps, meta, help text |
| `--type-chat` | 16px | 400 | 1.6 | 0 | Chat messages only |

**Rules:**
- Panels use 14px as base (`--type-body`). This is the "Linear density".
- Chat area uses 16px (`--type-chat`). This is the "ChatGPT comfort".
- No UPPERCASE section labels. Use `--type-subtitle` with `var(--text-tertiary)`.
- Heading levels within panels: `--type-title` for panel header, `--type-subtitle` for sections, `--type-body` for everything else.

### 5.2 Spacing Scale (strict)

Only these values are allowed:

| Token | Value | Alias | Primary Use |
|-------|-------|-------|-------------|
| `--space-0` | 0 | — | Reset |
| `--space-1` | 4px | tight | Icon-label gap, inline spacing |
| `--space-2` | 8px | default | List item gap, chip gap, compact padding |
| `--space-3` | 12px | comfortable | Message gap, panel section gap |
| `--space-4` | 16px | loose | Panel padding, card padding, section separator |
| `--space-6` | 24px | spacious | Between major sections |
| `--space-8` | 32px | generous | Page-level spacing (rarely used in panels) |

**Forbidden values:** 10px, 14px, 20px, 60px, 80px. If found in code, replace with nearest token.

**Note:** There is intentionally no `--space-5` (20px) or `--space-7` (28px). The scale is non-linear — jump from 16→24 and 24→32 is deliberate for visual rhythm.

### 5.3 Density Zones

| Zone | Base Font | Padding | Item Gap | Character |
|------|-----------|---------|----------|-----------|
| **Rail** | — (icons only) | 8px | 8px | Ultra-compact |
| **Panel** | 14px | 16px horizontal, 12px vertical | 8px between items | Dense (Linear-like) |
| **Chat** | 16px | 16px | 12px between messages | Comfortable (ChatGPT-like) |
| **Mobile BottomBar** | 11px | 8px | — | Touch-optimized (44px targets) |

### 5.4 Panel Header Spec

Every panel has a consistent header:

```
┌─────────────────────────────────┐
│  💡 Ideen              [×]     │  ← 44px height, 16px h-padding
├─────────────────────────────────┤
│  Aktiv  Inkubator  Archiv      │  ← tabs row, 36px height, 12px h-padding
├─────────────────────────────────┤
│  🔍 Ideen suchen...    [+ ▼]  │  ← toolbar row (optional), 40px height
├─────────────────────────────────┤
│                                 │
│  [content area, scrollable]     │
│                                 │
└─────────────────────────────────┘
```

- **Header row:** Panel icon (16px, `--text-tertiary`) + title (`--type-title`) + close button (right)
- **Tabs row:** Ghost-style tabs, horizontally scrollable if overflow
- **Toolbar row:** Optional. Search input + action buttons. Only for panels that need it (Ideas, Inbox, Tasks).
- **Content:** `overflow-y: auto`, padding `var(--space-4)` horizontal

**Max 2 control rows** (tabs + toolbar). Never 3 or more. If a panel needs complex filtering, use a dropdown/popover instead of additional chip rows.

---

## 6. Empty States

### 6.1 Component Spec

```tsx
interface PanelEmptyStateProps {
  variant: 'welcome' | 'no-results' | 'error';
  illustration?: string;       // SVG component name
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'ghost';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}
```

**Layout:**
```
         [SVG illustration]      ← 120x120px, centered
              max 96px on mobile

          Title goes here        ← --type-subtitle, --text-primary, center
       Description text here     ← --type-body, --text-secondary, center
          max-width: 280px

        [ Primary Action ]       ← Button, 32px height
        Secondary action          ← Ghost link
```

Vertical centering within available panel space. 24px gap between illustration and title, 8px between title and description, 16px between description and actions.

### 6.2 Illustrations (8 SVGs)

Style: **Monochromatische Line-Art.** Single stroke color: `currentColor` (inherits `--text-tertiary`). Stroke width: 1.5px. No fills. Rounded line caps. Simple, geometric, elegant. Inspired by Linear's empty states.

| ID | Panel | Motif | Description |
|----|-------|-------|-------------|
| `empty-ideas` | Ideas | Lightbulb with small sparkle lines | Single lightbulb outline, 3 small lines radiating |
| `empty-inbox` | Inbox | Open envelope, empty inside | Envelope outline with flap open, nothing inside |
| `empty-tasks` | Tasks/Planner | Clipboard with unchecked items | Clipboard outline, 3 small empty checkbox lines |
| `empty-documents` | Knowledge | Open folder, nothing in it | Folder outline, slightly open, empty |
| `empty-calendar` | Calendar | Calendar grid, no events | Calendar page outline, grid lines, all cells empty |
| `empty-ai` | My AI / Memory | Simple neuron network (3 nodes) | 3 circles connected by lines, minimal |
| `empty-search` | Search (any panel) | Magnifying glass, no result | Magnifier with small "×" or empty circle |
| `empty-error` | Error state | Cloud with small lightning bolt | Cloud outline, single zigzag line below |

Each SVG: `viewBox="0 0 120 120"`, `stroke="currentColor"`, `stroke-width="1.5"`, `fill="none"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Subtle body fills allowed with `fill="currentColor" fill-opacity="0.05"` where needed to prevent overly sparse appearance at small sizes.

### 6.3 Empty State Copy (German)

| Panel | Welcome Title | Welcome Description | CTA |
|-------|--------------|--------------------|----|
| Ideas | Deine Ideensammlung | Halte Gedanken fest, entwickle sie weiter und verbinde sie miteinander. | Erste Idee erstellen |
| Inbox | Dein Posteingang | Verbinde dein E-Mail-Konto, um Nachrichten direkt in ZenAI zu verwalten. | E-Mail verbinden |
| Tasks | Deine Aufgaben | Plane und verfolge deine Aufgaben mit Kanban, Gantt und KI-Unterstuetzung. | Erste Aufgabe erstellen |
| Documents | Deine Wissensbasis | Lade Dokumente hoch und lass die KI sie fuer dich erschliessen. | Dokument hochladen |
| Calendar | Dein Kalender | Verbinde deinen Kalender fuer Termine, Meetings und Tagesplanung. | Kalender verbinden |
| My AI | Deine KI kennenlernen | Starte ein Gespraech — je mehr du mit ZenAI sprichst, desto besser versteht sie dich. | Gespraech starten |

**Error state (universal):**
- Title: "Verbindung fehlgeschlagen"
- Description: "Der Server ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut."
- CTA: "Erneut versuchen"

**No-results state (universal):**
- Title: "Keine Ergebnisse"
- Description: "Fuer '{query}' wurde nichts gefunden."
- Secondary: "Filter zuruecksetzen" (if filters active)

---

## 7. Micro-Interactions

### 7.1 Interaction Patterns

| Pattern | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| **Panel slide-in** | Panel opens | `translateX(100%) → translateX(0)` | 250ms | `var(--ease-spring)` |
| **Panel slide-out** | Panel closes | `translateX(0) → translateX(100%)` + `opacity 1 → 0` | 200ms | `ease-out` |
| **Panel content fade** | After panel slides in | `opacity 0 → 1` + `translateY(8px) → translateY(0)` | 150ms, 50ms delay | `ease-out` |
| **Tab switch** | Click tab | Active indicator background morphs (width + position) | 150ms | `var(--ease-spring)` |
| **List item hover** | Mouse enters list row | `background: rgba(255,255,255, 0.04)` + `translateX(2px)` | 150ms | `ease-out` |
| **Button press** | `:active` on any button | `scale(0.97)` | 80ms | `ease-out` |
| **Success pulse** | After create/save action | Button turns green, checkmark fades in, reverts after 1.5s | 350ms in, 350ms out | `var(--ease-spring)` |
| **Rail icon hover** | Mouse enters rail icon | Icon color transitions + subtle scale(1.05) | 150ms | `ease-out` |
| **Mobile panel enter** | Bottom sheet panel opens | `translateY(100%) → translateY(0)` | 300ms | `var(--ease-spring)` |
| **Mobile panel exit** | Swipe down or close | `translateY(0) → translateY(100%)` | 250ms | `ease-out` |

### 7.2 Implementation Strategy

**Panel animations: Keep Framer Motion (existing).** `PanelArea.tsx` already uses `framer-motion` with `AnimatePresence`, `motion.div`, and `useReducedMotion()`. Do NOT replace with CSS keyframes — enhance the existing implementation.

**Current Framer Motion config (PanelArea.tsx) — includes reduceMotion path:**
```tsx
const reduceMotion = useReducedMotion();

// Full animation config with accessibility:
initial={reduceMotion ? { opacity: 0 } : isMobile ? { y: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
animate={reduceMotion ? { opacity: 1 } : isMobile ? { y: 0, opacity: 1 } : { width: state.width, opacity: 1 }}
exit={reduceMotion ? { opacity: 0 } : isMobile ? { y: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
transition={{ type: 'spring', stiffness: 300, damping: 30 }}
```
**Keep the `reduceMotion` ternary intact** — do not regress accessibility when enhancing animations.

**Enhancement — add content stagger:**
```tsx
// Inside panel content wrapper, add:
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.05, duration: 0.15 }}
>
  {children}
</motion.div>
```

**Non-panel animations: CSS (simple, no library needed):**

```css
/* List item hover */
.list-item {
  transition: background var(--duration-fast) ease-out,
              transform var(--duration-fast) ease-out;
}
.list-item:hover {
  background: var(--hover-overlay);
  transform: translateX(2px);
}

/* Button press — global */
button, [role="button"] {
  transition: transform 80ms ease-out;
}
button:active, [role="button"]:active {
  transform: scale(0.97);
}

/* Tab switch — ghost background morph */
.panel-tab {
  transition: all var(--duration-fast) var(--ease-spring);
}

/* Reduced motion — CSS-based interactions */
@media (prefers-reduced-motion: reduce) {
  .list-item,
  .panel-tab,
  button, [role="button"] {
    transition: none !important;
  }
}
```

**Note:** Framer Motion's `useReducedMotion()` already handles the panel animations. The CSS `@media` block handles the non-Framer interactions.

---

## 8. Component Inventory — What Changes

### 8.1 Components to DELETE

| Component | Replacement |
|-----------|-------------|
| `layout/AppLayout.tsx` + `.css` | `CockpitLayout.tsx` (existing) |
| `layout/Sidebar.tsx` + `.css` | `Rail.tsx` (existing) |
| `layout/TopBar.tsx` + `.css` | Integrated into CockpitLayout |
| `layout/MobileSidebarDrawer.tsx` + `.css` | Mobile BottomBar + full-screen panels |
| `layout/Breadcrumbs.tsx` + `.css` | Removed entirely |
| Page hero sections in hub pages | Panel headers |

### 8.2 Components to CREATE

| Component | Purpose |
|-----------|---------|
| `PanelEmptyState.tsx` + `.css` | Unified empty state with illustration/title/description/CTA |
| `illustrations/*.svg` (8 files) | Empty state SVG illustrations |
| `PanelTabs.tsx` + `.css` | Unified ghost-style tab component for all panels |
| `PanelToolbar.tsx` + `.css` | Unified search + actions toolbar for panels |
| `SuccessPulse.tsx` | Button success animation wrapper |

### 8.3 Components to MODIFY

| Component (correct path) | Changes |
|-----------|---------|
| `cockpit/CockpitLayout.tsx` | Becomes the only layout. Widen `currentPage` type. Sync panel ↔ URL via `useSearchParams`. |
| `cockpit/Rail.tsx` + `.css` | Expand from 3 to 8 nav items. Add `usePanelContext()` dispatch. Active indicator bar, hover states, tooltips. |
| `cockpit/PanelShell.tsx` + `.css` | Standardize header (icon + title + close). Enforce max 2 control rows. |
| `cockpit/PanelArea.tsx` | Enhance existing framer-motion: add content stagger `motion.div`. Keep `useReducedMotion()`. |
| `cockpit/panelRegistry.ts` | Add `settings` and `dashboard` panel definitions to registry array. |
| `contexts/PanelContext.tsx` | Two-way sync: `OPEN_PANEL` → `setSearchParams`, URL change → dispatch. |
| `cockpit/CockpitBottomBar.tsx` + `.css` | Update to 5 items (Chat, Ideas, Calendar, Email, More). "More" opens bottom sheet. |
| `App.tsx` | Remove `cockpitMode` conditional branch. Single `<Route path="/" element={<CockpitLayout />} />`. Add redirect routes. |
| `FloatingAssistant/FloatingAssistant.tsx` + `.css` | 40px circle, Lucide `Sparkles` icon, no emoji, indigo hover. |
| `GeneralChat/GeneralChat.tsx` | Audit for `cockpitMode`, `isCockpit`, or layout-mode branches and remove non-cockpit paths. |
| `navigation.ts` | Simplify: panel-based config, remove classic page/section definitions. |
| `routes/index.tsx` | Replace classic PAGE_PATHS with redirect routes to `/?panel=X`. |
| All 10 existing panels in `cockpit/panels/` | Integrate `PanelTabs` (ghost style) + `PanelEmptyState` (illustrations). |

### 8.4 CSS Files — Token Migration Priority

**Tier 1 (must-fix, visible in cockpit):**
- `PanelShell.css` — already tokenized (Phase 2B)
- `Rail.css` — needs polish
- `GeneralChat.css` — largest file (53KB), needs audit
- `MobileBottomBar.css` — needs update

**Tier 2 (panel content, high visibility):**
- `IdeasSmartPage.css`, `InboxSmartPage.css`, `CockpitSmartPage.css`
- `WissenSmartPage.css`, `MeineKISmartPage.css`, `SystemSmartPage.css`

**Tier 3 (sub-components within panels):**
- `IdeaCard.css`, `EmailRow.css`, `TaskCard.css`
- Individual panel-specific CSS files

**Tier 4 (defer to later phase):**
- All 150+ remaining component CSS files
- Full light mode fix (out of scope for this spec — focus on dark mode excellence first)

---

## 9. Out of Scope

These are explicitly NOT part of this spec:

| Item | Reason |
|------|--------|
| **Light mode fix** | Focus on one excellent dark theme first. Light mode is a separate phase. |
| **New features** | Pure visual/UX transformation. No new backend endpoints. |
| **Tailwind migration** | Work with existing CSS custom property system. |
| **Design system component library expansion** | Use existing ds-* components where possible. |
| **Onboarding wizard redesign** | Existing wizard is adequate. Empty states provide implicit onboarding. |
| **Full CSS-file-by-file token migration** | Only Tier 1-2 files. Tier 3-4 in future phases. |
| **Mobile-first redesign** | Mobile gets functional treatment (bottom bar + sheets) but desktop is primary focus. |

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Layout modes | 1 (cockpit only) — zero classic-mode code paths |
| Control rows above content | Max 2 per panel (tabs + toolbar) |
| Orange accent instances | Only on primary CTAs (est. ~8-10 per session vs current ~30+) |
| Empty states with illustrations | 8 panel types covered |
| Micro-interaction patterns | All 10 patterns from Section 7.1 applied consistently |
| Hardcoded px values in Tier 1-2 CSS | 0 (all using spacing tokens) |
| Typography violations | 0 in panels (only 4 type levels used) |
| Build passes | TypeScript 0 errors, all existing tests pass |
| No backend changes | Zero backend file modifications |

---

## 11. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Removing classic mode breaks deep-linked URLs | High | Medium | Redirect rules: `/ideas` → `/?panel=ideas` etc. |
| Panel-based routing loses browser history | Medium | Medium | Use `history.pushState` with query params — back button works |
| Existing tests reference classic-mode components | High | Low | Update imports, mock PanelShell instead of AppLayout |
| Panel width insufficient for complex pages (Settings) | Medium | Medium | Max panel width 640px + overflow scroll within tabs |
| Some page components assume full-width | Medium | Low | Add responsive breakpoints within panels |

---

## 12. File Manifest

**New files to create:**
```
frontend/src/components/cockpit/panels/PanelEmptyState.tsx
frontend/src/components/cockpit/panels/PanelEmptyState.css
frontend/src/components/cockpit/PanelTabs.tsx
frontend/src/components/cockpit/PanelTabs.css
frontend/src/components/cockpit/PanelToolbar.tsx
frontend/src/components/cockpit/PanelToolbar.css
frontend/src/components/cockpit/SuccessPulse.tsx
frontend/src/components/cockpit/SuccessPulse.css
frontend/src/components/cockpit/panels/SettingsPanel.tsx
frontend/src/components/cockpit/panels/DashboardPanel.tsx
frontend/src/assets/illustrations/empty-ideas.svg
frontend/src/assets/illustrations/empty-inbox.svg
frontend/src/assets/illustrations/empty-tasks.svg
frontend/src/assets/illustrations/empty-documents.svg
frontend/src/assets/illustrations/empty-calendar.svg
frontend/src/assets/illustrations/empty-ai.svg
frontend/src/assets/illustrations/empty-search.svg
frontend/src/assets/illustrations/empty-error.svg
```

**Files to delete:**
```
frontend/src/components/layout/AppLayout.tsx
frontend/src/components/layout/AppLayout.css
frontend/src/components/layout/Sidebar.tsx
frontend/src/components/layout/Sidebar.css
frontend/src/components/layout/TopBar.tsx
frontend/src/components/layout/TopBar.css
frontend/src/components/layout/MobileSidebarDrawer.tsx
frontend/src/components/layout/MobileSidebarDrawer.css
frontend/src/components/Breadcrumbs.tsx
frontend/src/components/Breadcrumbs.css
```

**Files to modify (major):**
```
frontend/src/App.tsx                                         — Remove classic-mode routing, single CockpitLayout route
frontend/src/navigation.ts                                    — Simplify to panel-based config
frontend/src/routes/index.tsx                                 — Replace PAGE_PATHS/PATH_PAGES with redirect routes
frontend/src/components/cockpit/CockpitLayout.tsx             — Becomes only layout, sync panel state with URL
frontend/src/components/cockpit/Rail.tsx                       — Add all nav items, PanelContext dispatch, visual polish
frontend/src/components/cockpit/Rail.css                       — Active indicator, hover states, tooltip styles
frontend/src/components/cockpit/PanelArea.tsx                  — Enhanced framer-motion animations, content stagger
frontend/src/components/cockpit/PanelShell.tsx                 — Standardize header, icon+title+close
frontend/src/components/cockpit/PanelShell.css                 — Token-based spacing, typography scale
frontend/src/components/cockpit/panelRegistry.ts               — Add 'settings' and 'dashboard' panel IDs
frontend/src/contexts/PanelContext.tsx                          — Sync with URL searchParams
frontend/src/components/cockpit/CockpitBottomBar.tsx           — Update nav items, "More" overflow sheet
frontend/src/components/cockpit/CockpitBottomBar.css           — Match new design tokens
frontend/src/components/FloatingAssistant/FloatingAssistant.tsx — Redesign: 40px, Lucide icon, indigo hover
frontend/src/components/FloatingAssistant/FloatingAssistant.css — CREATE (no CSS file exists yet, styles may be inline)
frontend/src/components/GeneralChat/GeneralChat.tsx            — Remove layout-mode conditionals
frontend/src/styles/index.css                                   — New accent tokens, --hover-overlay
frontend/src/design-system/colors.ts                            — Add accent-orange, accent-indigo token exports
```

**Files to modify (existing panels — visual polish):**
```
frontend/src/components/cockpit/panels/IdeasPanel.tsx          — PanelTabs + PanelEmptyState integration
frontend/src/components/cockpit/panels/EmailPanel.tsx          — Ghost tabs, empty state
frontend/src/components/cockpit/panels/TasksPanel.tsx          — Ghost tabs, empty state
frontend/src/components/cockpit/panels/CalendarPanel.tsx       — Ghost tabs, empty state
frontend/src/components/cockpit/panels/ContactsPanel.tsx       — Empty state
frontend/src/components/cockpit/panels/DocumentsPanel.tsx      — Empty state
frontend/src/components/cockpit/panels/MemoryPanel.tsx         — Empty state
frontend/src/components/cockpit/panels/FinancePanel.tsx        — Empty state
frontend/src/components/cockpit/panels/AgentsPanel.tsx         — Empty state
frontend/src/components/cockpit/panels/SearchPanel.tsx         — Already exists, polish
```

**Files that become dead code (delete in a SEPARATE follow-up PR after cockpit-only is stable):**
These files may still be imported transitionally. Do NOT delete in the same PR as the cockpit migration — verify zero imports first.
```
frontend/src/components/IdeasPage/               — Full-page version, replaced by IdeasPanel
frontend/src/components/EmailPage/               — Full-page version, replaced by EmailPanel
frontend/src/components/PlannerPage/             — Full-page version, replaced by CalendarPanel
frontend/src/components/DocumentVaultPage/       — Full-page version, replaced by DocumentsPanel
frontend/src/components/MyAIPage/                — Full-page version, replaced by MemoryPanel
frontend/src/components/SettingsDashboard.tsx     — Full-page version, replaced by SettingsPanel
frontend/src/components/BusinessDashboard.tsx     — Full-page version, replaced by FinancePanel
frontend/src/routes/LazyPages.tsx                — No longer needed (panels loaded by registry)
```
