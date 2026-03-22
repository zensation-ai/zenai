# Phase 2B: Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Midnight Dark Petrol color scheme and premium visual polish to the AI Cockpit (P1-P3 scope: cockpit components, layout shell, chat).

**Architecture:** Update existing `[data-theme="dark"]` block in `index.css` with Midnight Petrol values. Rename cockpit CSS token references to match canonical names. Apply component-level polish (shadows, hover states, active indicators).

**Tech Stack:** CSS Custom Properties, existing design token system in `index.css`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-22-phase2b-visual-polish-design.md`

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `frontend/src/index.css` | Update `[data-theme="dark"]` block with Midnight Petrol values, add new accent tokens |
| `frontend/src/components/cockpit/Rail.css` | Token rename + active indicator polish |
| `frontend/src/components/cockpit/PanelShell.css` | Token rename + shadow polish |
| `frontend/src/components/cockpit/CockpitLayout.css` | Token rename |
| `frontend/src/components/cockpit/ChatSessionTabs.css` | Token rename + pill-style active tab |
| `frontend/src/components/cockpit/DashboardPage.css` | Token rename + hover-lift |
| `frontend/src/components/cockpit/QuickActionsBar.css` | Token rename |
| `frontend/src/components/cockpit/SlashCommandMenu.css` | Token rename |
| `frontend/src/components/cockpit/ChatEnhancements.css` | Token rename + accent color update |
| `frontend/src/components/GeneralChat.css` | Chat bubble + input polish |
| `frontend/src/components/CommandPalette.tsx` | Glassmorphism overlay (inline styles → CSS) |

No new files. This is purely a styling update across existing files.

---

## Chunk 1: Token Foundation

### Task 1: Update Dark Mode Tokens in index.css

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Update `[data-theme="dark"]` block with Midnight Petrol values**

Find the `[data-theme="dark"]` block (around line 481) and update these tokens:

```css
[data-theme="dark"] {
  /* Midnight Petrol surfaces */
  --surface-bg: #0A1A24;
  --surface-1: #0F2230;
  --surface-2: #142A3A;
  --surface-3: #1A3345;

  /* Text for dark backgrounds */
  --text-primary: #E5E5E5;
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-tertiary: rgba(255, 255, 255, 0.3);

  /* Glass on petrol */
  --glass-bg: rgba(10, 26, 36, 0.8);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-l1-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  --glass-l2-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 2: Add new accent tokens to `:root` (both modes)**

Add these tokens at the end of the `:root` block (before the closing `}`). These are mode-independent:

```css
/* Phase 2B: Accent tokens */
--accent: #FF6B35;
--accent-hover: #FF8F5A;
--accent-muted: rgba(255, 107, 53, 0.15);
--accent-ai: #6366F1;
--accent-ai-muted: rgba(99, 102, 241, 0.15);
--border-hover: rgba(0, 0, 0, 0.15);
```

And add dark mode overrides in the `[data-theme="dark"]` block:

```css
--border-hover: rgba(255, 255, 255, 0.12);
```

- [ ] **Step 3: Update `@media (prefers-color-scheme: dark)` block**

Find the `@media (prefers-color-scheme: dark)` block (around line 501) and update these surface tokens to match Midnight Petrol:

```css
--background: #0A1A24;
--surface: rgba(15, 34, 48, 0.6);
--surface-solid: #0F2230;
--surface-light: rgba(20, 42, 58, 0.4);
--surface-hover: rgba(26, 51, 69, 0.5);
--bg-secondary: #0F2230;
--bg-tertiary: #142A3A;
--card-bg: #142A3A;
--hover-bg: rgba(26, 51, 69, 0.5);
```

- [ ] **Step 4: Run frontend tests to verify nothing breaks**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (token changes are CSS-only, no test impact)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(visual): update dark mode tokens to Midnight Petrol color scheme"
```

---

## Chunk 2: Cockpit Token Migration (P1)

### Task 2: Migrate cockpit CSS tokens — Rail + CockpitLayout

**Files:**
- Modify: `frontend/src/components/cockpit/Rail.css`
- Modify: `frontend/src/components/cockpit/CockpitLayout.css`

- [ ] **Step 1: Update Rail.css token names**

Replace all token references in Rail.css:

| Old | New |
|-----|-----|
| `--surface-primary` | `--surface-bg` |
| `--border-primary` | `--border` |
| `--text-tertiary` | `--text-tertiary` (keep) |
| `--surface-hover` | `--surface-3` |
| `--text-primary` | `--text-primary` (keep) |
| `--color-accent-muted` | `--accent-muted` |
| `--color-accent` | `--accent` |

Also update fallback values:
- `var(--surface-primary, #0a0a0f)` → `var(--surface-bg)`
- `var(--border-primary, rgba(255,255,255,0.08))` → `var(--border)`
- `var(--surface-hover, rgba(255,255,255,0.06))` → `var(--surface-3)`
- `var(--color-accent-muted, rgba(99,102,241,0.15))` → `var(--accent-muted)`
- `var(--color-accent, #6366f1)` → `var(--accent)`
- `var(--text-tertiary, rgba(255,255,255,0.4))` → `var(--text-tertiary)`

- [ ] **Step 2: Apply Rail polish — active indicator + background**

Change `.rail` background from `--surface-bg` to `--surface-1`:

```css
.rail {
  background: var(--surface-1);
}
```

Replace `.rail__item--active` background fill with left-border indicator:

```css
.rail__item--active {
  color: var(--accent);
  position: relative;
}

.rail__item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 20px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
```

- [ ] **Step 3: Update CockpitLayout.css token names**

Replace:
- `var(--surface-primary, #0a0a0f)` → `var(--surface-bg)`
- `var(--text-primary, #e5e5e5)` → `var(--text-primary)`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/Rail.css frontend/src/components/cockpit/CockpitLayout.css
git commit -m "feat(visual): migrate Rail + CockpitLayout to canonical tokens, add active indicator"
```

---

### Task 3: Migrate PanelShell + ChatSessionTabs + DashboardPage

**Files:**
- Modify: `frontend/src/components/cockpit/PanelShell.css`
- Modify: `frontend/src/components/cockpit/ChatSessionTabs.css`
- Modify: `frontend/src/components/cockpit/DashboardPage.css`

- [ ] **Step 1: Update PanelShell.css**

Token renames:
- `--surface-secondary` → `--surface-1`
- `--border-primary` → `--border`
- `--text-secondary` → `--text-secondary` (keep)
- `--surface-hover` → `--surface-3`
- `--text-primary` → `--text-primary` (keep)
- `--color-accent` → `--accent`

Remove all fallback values (e.g. `, #111`). Tokens are now defined in `:root`.

Add polish:
```css
.panel-shell__header {
  background: var(--surface-1);
}

.panel-shell {
  box-shadow: inset 2px 0 8px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 2: Update ChatSessionTabs.css**

Token renames:
- `--border-primary` → `--border`
- `--text-secondary` → `--text-secondary` (keep)
- `--surface-hover` → `--surface-3`
- `--text-primary` → `--text-primary` (keep)

Apply pill-style active tab:
```css
.session-tabs__tab--active {
  background: var(--accent-ai-muted);
  color: var(--accent-ai);
}
```

- [ ] **Step 3: Update DashboardPage.css**

Token renames:
- `--surface-secondary` → `--surface-2`
- `--border-primary` → `--border`
- `--surface-hover` → `--surface-3`
- `--border-hover` → `--border-hover` (keep)
- `--text-secondary` → `--text-secondary` (keep)
- `--text-tertiary` → `--text-tertiary` (keep)

Add hover-lift:
```css
.dashboard-widget:hover {
  background: var(--surface-3);
  border-color: var(--border-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.dashboard-widget {
  transition: background 150ms, border-color 150ms, transform 150ms, box-shadow 150ms;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/PanelShell.css frontend/src/components/cockpit/ChatSessionTabs.css frontend/src/components/cockpit/DashboardPage.css
git commit -m "feat(visual): polish PanelShell, ChatSessionTabs, DashboardPage with Midnight Petrol tokens"
```

---

### Task 4: Migrate QuickActionsBar + SlashCommandMenu + ChatEnhancements

**Files:**
- Modify: `frontend/src/components/cockpit/QuickActionsBar.css`
- Modify: `frontend/src/components/cockpit/SlashCommandMenu.css`
- Modify: `frontend/src/components/cockpit/ChatEnhancements.css`

- [ ] **Step 1: Update QuickActionsBar.css**

Token renames:
- `--text-tertiary` → `--text-tertiary` (keep)
- `--surface-hover` → `--surface-3`
- `--text-primary` → `--text-primary` (keep)

Remove fallback values.

- [ ] **Step 2: Update SlashCommandMenu.css**

Token renames:
- `--surface-secondary` → `--surface-1`
- `--border-primary` → `--border`
- `--text-primary` → `--text-primary` (keep)
- `--surface-hover` → `--surface-3`
- `--text-tertiary` → `--text-tertiary` (keep)

Remove hardcoded fallback values.

- [ ] **Step 3: Update ChatEnhancements.css**

Token renames:
- `--color-accent` → `--accent`
- `--text-primary` → `--text-primary` (keep)
- `--border-primary` → `--border`
- `--surface-hover` → `--surface-3`
- `--surface-secondary` → `--surface-2`
- `--color-danger` → `--danger`
- `--text-tertiary` → `--text-tertiary` (keep)

Update ActionButtons primary to use accent orange:
```css
.action-buttons__btn--primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.action-buttons__btn--primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/QuickActionsBar.css frontend/src/components/cockpit/SlashCommandMenu.css frontend/src/components/cockpit/ChatEnhancements.css
git commit -m "feat(visual): migrate remaining cockpit CSS to canonical tokens"
```

---

## Chunk 3: Chat + Command Palette Polish (P3)

### Task 5: Chat Bubble + Input Polish

**Files:**
- Modify: `frontend/src/components/GeneralChat.css`

- [ ] **Step 1: Update chat bubble styles**

Find the user message bubble styles (likely `.message--user` or similar). Update:

```css
/* User messages: Indigo tint */
.message--user .message-bubble,
.chat-message--user .message-content {
  background: var(--accent-ai-muted);
  border-radius: 16px;
}

/* AI messages: Surface-2 */
.message--assistant .message-bubble,
.chat-message--assistant .message-content {
  background: var(--surface-2);
  border-radius: 16px;
}
```

**IMPORTANT:** Read GeneralChat.css first to find the actual class names. The names above are guesses — adapt to the actual selectors used.

- [ ] **Step 2: Update chat input styles**

Find the chat input field styles. Update:

```css
/* Chat input */
.chat-input,
.message-input {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-primary);
}

.chat-input:focus,
.message-input:focus {
  border-color: var(--accent);
  outline: none;
}

.chat-input::placeholder,
.message-input::placeholder {
  color: var(--text-tertiary);
}
```

**IMPORTANT:** Read GeneralChat.css to find actual selectors. Adapt to existing class names.

- [ ] **Step 3: Update tool pill styles**

Find tool activity pill styles. Update to use accent-ai tokens:

```css
/* Tool pills */
.tool-pill,
.tool-activity {
  background: var(--accent-ai-muted);
  color: var(--accent-ai);
}
```

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GeneralChat.css
git commit -m "feat(visual): polish chat bubbles, input, and tool pills with Midnight Petrol tokens"
```

---

### Task 6: Command Palette Glassmorphism

**Files:**
- Modify: `frontend/src/components/CommandPalette.tsx` (or its CSS file if separate)

- [ ] **Step 1: Find and update Command Palette overlay styles**

Read `CommandPalette.tsx` to find how the overlay/backdrop is styled. It may use inline styles or a CSS file. Update to use glass tokens:

```css
/* Command Palette overlay */
.command-palette-overlay {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
}

/* Selected item */
.command-palette-item--selected {
  background: var(--accent-ai-muted);
}

/* Input */
.command-palette-input {
  background: var(--surface-1);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.command-palette-input:focus {
  border-color: var(--accent);
}
```

**IMPORTANT:** Read the actual file first. Class names above are guesses. Adapt to existing selectors. If styles are inline in the TSX, extract static colors to CSS classes.

- [ ] **Step 2: Run tests**

Run: `cd frontend && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CommandPalette.tsx
git commit -m "feat(visual): apply glassmorphism to Command Palette overlay"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npx vite build`
Expected: Clean build

- [ ] **Step 3: Visual check with dev server**

Start dev server, enable cockpit mode, verify:
- Midnight Petrol background visible
- Rail has accent-colored active indicator
- Panel slides out with correct surface colors
- Chat bubbles have Indigo (user) / Surface-2 (AI) backgrounds
- Dashboard widgets have hover-lift effect
- Command Palette has glass overlay

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(visual): final polish fixes from visual verification"
```

---

## Summary

| Task | Scope | Files | Commits |
|------|-------|-------|---------|
| 1 | Token foundation in index.css | 1 | 1 |
| 2 | Rail + CockpitLayout migration | 2 | 1 |
| 3 | PanelShell + Tabs + Dashboard | 3 | 1 |
| 4 | QuickActions + Slash + Enhancements | 3 | 1 |
| 5 | Chat bubble + input polish | 1 | 1 |
| 6 | Command Palette glassmorphism | 1 | 1 |
| 7 | Final verification | — | 0-1 |
| **Total** | **7 tasks** | **~11 files** | **6-7 commits** |
