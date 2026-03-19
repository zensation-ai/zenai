# Project Zenith — Mega-Phase I: Foundation (Phases 102–105)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the design system, build the Chat Hub, and scaffold the 7+1 navigation — so the app looks and feels world-class before Smart Pages land.

**Architecture:** Four sequential phases: (1) Rewrite design tokens to Calm Neurodesign color/type/spacing/animation system, (2) Expand DS to 20 components and begin migrating pages, (3) Build Chat Hub as start page with Smart Surface v2, Intent Bar, and Slide Panel framework, (4) Rewrite navigation to 7+1 structure pointing to existing pages as intermediaries.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest + @testing-library/react, TanStack Query v5, React Router v7, CSS custom properties (no CSS-in-JS), Lucide icons

---

## File Structure

### Phase 102: Design Token Consolidation

| Action | Path | Responsibility |
|--------|------|---------------|
| Extend | `frontend/src/design-system/colors.ts` | Add Calm Neurodesign HSL tokens alongside ALL existing exports. Aggregate EXTENDS (spread legacy + new). |
| Create | `frontend/src/design-system/colors-legacy.ts` | Move ALL current colors.ts content here unchanged |
| Extend | `frontend/src/design-system/typography.ts` | Add modular 1.25 scale alongside ALL existing exports. Aggregate EXTENDS. |
| Create | `frontend/src/design-system/typography-legacy.ts` | Move ALL current typography.ts content here unchanged |
| Extend | `frontend/src/design-system/spacing.ts` | Add Gestalt 4px scale alongside ALL existing exports. Aggregate EXTENDS. |
| Create | `frontend/src/design-system/spacing-legacy.ts` | Move ALL current spacing.ts content here unchanged |
| Extend | `frontend/src/design-system/animations.ts` | Add spring physics presets alongside ALL existing exports. Aggregate EXTENDS. |
| Create | `frontend/src/design-system/animations-legacy.ts` | Move ALL current animations.ts content here unchanged |
| Extend | `frontend/src/design-system/shadows.ts` | Add glass levels + elevation alongside ALL existing exports. Aggregate EXTENDS. |
| Create | `frontend/src/design-system/shadows-legacy.ts` | Move ALL current shadows.ts content here unchanged |
| Modify | `frontend/src/design-system/tokens.ts` | Re-export new token names alongside all existing exports |
| Modify | `frontend/src/design-system/index.ts` | Add new named exports, keep ALL existing exports |
| Modify | `frontend/src/index.css` | ADD new Calm Neurodesign CSS custom properties above existing ones. Keep ALL legacy variables. Add `[data-theme="dark"]` block. Add reduced-motion + visual haptics. |
| Create | `frontend/src/__tests__/design-tokens.test.ts` | Token snapshot test: new + legacy tokens coexist |
| Create | `scripts/css-token-audit.ts` | Script to find legacy token usage across all CSS files |

> **CRITICAL RULE — Aggregate Extension Strategy:**
> Every token module (colors, typography, spacing, animations, shadows) uses the same pattern:
> 1. Move ALL current content to `*-legacy.ts` (unchanged)
> 2. Rewrite main file: import legacy aggregate, define new tokens, spread `...legacy` + new into aggregate
> 3. Re-export ALL legacy named exports so `import { surfaceLight } from './colors'` still works
> 4. Verify with `npx tsc --noEmit` — zero errors means no breakage
>
> The aggregate object KEEPS all ~30 old properties AND adds ~8 new ones.
> Example: `export const colors = { ...legacyColors, accent, success, ... } as const;`
>
> **Note on `neurodesign.css`:** Not modified in Phase 102. It will be aligned during per-file migration in Phases 106-110.
> **Note on dark mode:** New `[data-theme="dark"]` block is ADDED for new tokens only. Existing `.dark-mode` / `:has(.dark-mode)` selectors are NOT touched — unification happens during per-file migration.

### Phase 103: Component System Upgrade

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/design-system/components/Tooltip.tsx` | Floating tooltip with arrow, delay, placement |
| Create | `frontend/src/design-system/components/Tooltip.css` | Tooltip styles |
| Create | `frontend/src/design-system/components/Dropdown.tsx` | Dropdown menu with keyboard nav |
| Create | `frontend/src/design-system/components/Dropdown.css` | Dropdown styles |
| Create | `frontend/src/design-system/components/Switch.tsx` | Toggle switch (accessible) |
| Create | `frontend/src/design-system/components/Switch.css` | Switch styles |
| Create | `frontend/src/design-system/components/Progress.tsx` | Determinate/indeterminate progress bar |
| Create | `frontend/src/design-system/components/Progress.css` | Progress styles |
| Create | `frontend/src/design-system/components/Alert.tsx` | Info/success/warning/danger alert |
| Create | `frontend/src/design-system/components/Alert.css` | Alert styles |
| Create | `frontend/src/design-system/components/Dialog.tsx` | Dialog/Sheet (replaces custom modals) |
| Create | `frontend/src/design-system/components/Dialog.css` | Dialog styles |
| Create | `frontend/src/design-system/components/Popover.tsx` | Popover with trigger + content |
| Create | `frontend/src/design-system/components/Popover.css` | Popover styles |
| Create | `frontend/src/design-system/components/Chip.tsx` | Filter chip / tag |
| Create | `frontend/src/design-system/components/Chip.css` | Chip styles |
| Create | `frontend/src/design-system/components/Divider.tsx` | Horizontal/vertical divider |
| Create | `frontend/src/design-system/components/Divider.css` | Divider styles |
| Create | `frontend/src/design-system/components/Spinner.tsx` | Loading spinner |
| Create | `frontend/src/design-system/components/Spinner.css` | Spinner styles |
| Modify | `frontend/src/design-system/components/index.ts` | Export 10 new components |
| Modify | `frontend/src/design-system/index.ts` | Export new component types |
| Create | `frontend/src/design-system/components/__tests__/` | Tests for all 10 new components |

### Phase 104: Chat Hub MVP

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/ChatHub/ChatHub.tsx` | Chat Hub page: Smart Surface + Conversation + Intent Bar |
| Create | `frontend/src/components/ChatHub/ChatHub.css` | Chat Hub layout styles |
| Create | `frontend/src/components/ChatHub/IntentBar.tsx` | Universal input: text + voice + file + thinking mode |
| Create | `frontend/src/components/ChatHub/IntentBar.css` | Intent Bar styles |
| Create | `frontend/src/components/ChatHub/SmartSurfaceV2.tsx` | Max 3 proactive cards, staggered spring entry, empty = hidden |
| Create | `frontend/src/components/ChatHub/SmartSurfaceV2.css` | Smart Surface v2 styles |
| Create | `frontend/src/components/ChatHub/SuggestionChips.tsx` | 3-4 contextual suggestion chips when input is empty+focused |
| Create | `frontend/src/components/ChatHub/SlidePanel.tsx` | 400px right-side panel framework with glass backdrop |
| Create | `frontend/src/components/ChatHub/SlidePanel.css` | Slide panel styles (desktop + mobile full-screen) |
| Create | `frontend/src/components/ChatHub/AdaptiveResult.tsx` | Renders AI response as typed surface (task card, code, table, etc.) |
| Create | `frontend/src/components/ChatHub/types.ts` | ChatHub-specific types |
| Create | `frontend/src/components/ChatHub/__tests__/` | Tests for ChatHub, IntentBar, SmartSurfaceV2, SlidePanel |
| Modify | `frontend/src/components/ChatPage.tsx` | Delegate to ChatHub when used as start page |
| Modify | `frontend/src/App.tsx` | Route `/` to ChatHub instead of Dashboard |
| Modify | `frontend/src/hooks/queries/useDashboard.ts` | Adapt for Smart Surface card data |

### Phase 105: Navigation Scaffolding

| Action | Path | Responsibility |
|--------|------|---------------|
| Rewrite | `frontend/src/navigation.ts` | 7+1 structure: Chat Hub + Ideen, Planer, Inbox, Wissen, Cockpit, Meine KI, System |
| Modify | `frontend/src/types/idea.ts` | Add new Page types (`'hub'`), mark deprecated types with comments |
| Rewrite | `frontend/src/routes/index.tsx` | New PAGE_PATHS/PATH_PAGES for 7+1 nav, new legacy redirects for all old routes |
| Modify | `frontend/src/components/layout/Sidebar.tsx` | Render new 7+1 nav, no sections — flat list with icons |
| Modify | `frontend/src/components/layout/Sidebar.css` | New sidebar styles: context accent stripe, collapsed/expanded |
| Modify | `frontend/src/components/layout/MobileBottomBar.tsx` | 5 tabs: Chat, Ideen, Planer, Inbox, More |
| Modify | `frontend/src/components/layout/MobileSidebarDrawer.tsx` | New 7+1 items |
| Modify | `frontend/src/components/layout/TopBar.tsx` | Show context accent badge, simplified breadcrumbs |
| Modify | `frontend/src/components/CommandPalette.tsx` | Update page list to 7+1 |
| Modify | `frontend/src/App.tsx` | Update route definitions for new structure |
| Create | `frontend/src/components/layout/__tests__/Sidebar.test.tsx` | Sidebar renders 7+1 items |
| Create | `frontend/src/components/layout/__tests__/MobileBottomBar.test.tsx` | Bottom bar renders 5 tabs |
| Modify | `frontend/src/routes/LazyPages.tsx` | Update lazy imports |

---

## Chunk 1: Phase 102 — Design Token Consolidation

### Task 1: Extend color tokens with Calm Neurodesign system

**Files:**
- Create: `frontend/src/design-system/colors-legacy.ts`
- Rewrite: `frontend/src/design-system/colors.ts`
- Create: `frontend/src/__tests__/design-tokens.test.ts`

- [ ] **Step 1: Write the failing test for new color tokens**

```typescript
// frontend/src/__tests__/design-tokens.test.ts
import { describe, it, expect } from 'vitest';
import { colors } from '../design-system/colors';

describe('Calm Neurodesign Color Tokens', () => {
  it('exports new accent colors (5 semantic hues)', () => {
    expect(colors.accent).toBeDefined();
    expect(colors.accent.primary).toMatch(/^hsl\(/);
    expect(colors.accent.secondary).toMatch(/^hsl\(/);
    expect(colors.calmSuccess).toBeDefined();
    expect(colors.calmWarning).toBeDefined();
    expect(colors.calmDanger).toBeDefined();
  });

  it('exports 4 context colors', () => {
    expect(colors.context.personal).toMatch(/^hsl\(/);
    expect(colors.context.work).toMatch(/^hsl\(/);
    expect(colors.context.learning).toMatch(/^hsl\(/);
    expect(colors.context.creative).toMatch(/^hsl\(/);
  });

  it('exports light and dark surface scales', () => {
    expect(colors.calmSurface.light.bg).toMatch(/^hsl\(/);
    expect(colors.calmSurface.light.s1).toMatch(/^hsl\(/);
    expect(colors.calmSurface.dark.bg).toMatch(/^hsl\(/);
  });

  it('exports new text color scales', () => {
    expect(colors.calmText.light.primary).toMatch(/^hsl\(/);
    expect(colors.calmText.dark.primary).toMatch(/^hsl\(/);
  });

  it('exports new glass tokens', () => {
    expect(colors.calmGlass.light.bg).toMatch(/^rgba\(/);
    expect(colors.calmGlass.dark.bg).toMatch(/^rgba\(/);
  });

  // CRITICAL: backward compatibility — ALL old aggregate properties still exist
  it('preserves ALL legacy aggregate properties', () => {
    expect(colors.brand).toBeDefined();
    expect(colors.brand.primary).toBe('#ff6b35');
    expect(colors.brandDark).toBeDefined();
    expect(colors.surfaceLight).toBeDefined();
    expect(colors.surfaceLight.background).toBe('#dce5eb');
    expect(colors.surfaceDark).toBeDefined();
    expect(colors.glassLight).toBeDefined();
    expect(colors.glassDark).toBeDefined();
    expect(colors.textLight).toBeDefined();
    expect(colors.textDark).toBeDefined();
    expect(colors.textOnDark).toBeDefined();
    expect(colors.borderLight).toBeDefined();
    expect(colors.borderDark).toBeDefined();
    expect(colors.semantic).toBeDefined();
    expect(colors.warm).toBeDefined();
    expect(colors.petrol).toBeDefined();
    expect(colors.header).toBeDefined();
    expect(colors.sidebar).toBeDefined();
    expect(colors.neuro).toBeDefined();
    expect(colors.gradients).toBeDefined();
  });
});
```

> **Note on naming:** New tokens use prefixed names (`calmSuccess`, `calmSurface`, `calmText`, `calmGlass`) to avoid collisions with legacy aggregate properties (`semantic.success`, `surfaceLight`, `textLight`, `glassLight`). This is intentional — once legacy properties are removed in Phases 106-110, the `calm` prefix can be dropped.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: FAIL — `colors.accent` is undefined (old structure doesn't have it)

- [ ] **Step 3: Create colors-legacy.ts**

Move the ENTIRE current content of `frontend/src/design-system/colors.ts` (all 410 lines) into `frontend/src/design-system/colors-legacy.ts`. No changes to the content — just a file move. This preserves all 31 named exports (`brand`, `brandDark`, `warm`, `petrol`, `semantic`, `semanticDark`, `error`, `status`, `contextWork`, `aiStatus`, `triage`, `surfaceLight`, `surfaceDark`, `glassLight`, `glassDark`, `glass2026Light`, `glass2026Dark`, `textLight`, `textDark`, `textOnDark`, `borderLight`, `borderDark`, `inputLight`, `codeLight`, `codeDark`, `gradients`, `header`, `sidebar`, `commandLight`, `commandDark`, `bottomBar`, `neuro`) and the `colors` aggregate + `Colors` type.

- [ ] **Step 4: Verify legacy file compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (colors-legacy.ts is standalone, no imports)

- [ ] **Step 5: Rewrite colors.ts with extended aggregate**

```typescript
// frontend/src/design-system/colors.ts
/**
 * ZenAI Design System — Color Tokens
 * Phase 102 — Calm Neurodesign HSL tokens ADDED alongside all legacy tokens.
 *
 * EXTENSION STRATEGY: The `colors` aggregate spreads ALL legacy properties
 * and adds new Calm Neurodesign namespaces. Code using `colors.surfaceLight`,
 * `colors.brand`, etc. continues to work unchanged.
 */

// ── Re-export ALL legacy named exports (backward compat) ────────
export {
  brand, brandDark, warm, petrol, semantic, semanticDark, error, status,
  contextWork, aiStatus, triage, surfaceLight, surfaceDark, glassLight,
  glassDark, glass2026Light, glass2026Dark, textLight, textDark, textOnDark,
  borderLight, borderDark, inputLight, codeLight, codeDark, gradients,
  header, sidebar, commandLight, commandDark, bottomBar, neuro,
} from './colors-legacy';

// Import legacy aggregate for spreading into new aggregate
import { colors as legacyColors } from './colors-legacy';

// ── NEW: Accent / Semantic (5 hues) ────────────────────────────
export const accent = {
  primary: 'hsl(250, 65%, 58%)',
  primaryHover: 'hsl(250, 65%, 52%)',
  primaryGlow: 'hsla(250, 65%, 58%, 0.25)',
  secondary: 'hsl(190, 60%, 45%)',
  secondaryHover: 'hsl(190, 60%, 40%)',
} as const;

export const calmSuccess = {
  base: 'hsl(160, 70%, 42%)',
  light: 'hsla(160, 70%, 42%, 0.12)',
  glow: 'hsla(160, 70%, 42%, 0.25)',
} as const;

export const calmWarning = {
  base: 'hsl(38, 95%, 55%)',
  light: 'hsla(38, 95%, 55%, 0.12)',
  glow: 'hsla(38, 95%, 55%, 0.25)',
} as const;

export const calmDanger = {
  base: 'hsl(0, 72%, 55%)',
  light: 'hsla(0, 72%, 55%, 0.12)',
  glow: 'hsla(0, 72%, 55%, 0.25)',
} as const;

// ── NEW: Context Colors ────────────────────────────────────────
export const context = {
  personal: 'hsl(210, 70%, 55%)',
  work: 'hsl(160, 60%, 45%)',
  learning: 'hsl(280, 60%, 55%)',
  creative: 'hsl(35, 90%, 55%)',
} as const;

// ── NEW: Surface System (Neutral) ──────────────────────────────
export const calmSurface = {
  light: {
    bg: 'hsl(220, 14%, 97%)', s1: 'hsl(220, 14%, 99%)',
    s2: 'hsl(220, 12%, 95%)', s3: 'hsl(220, 10%, 91%)',
  },
  dark: {
    bg: 'hsl(225, 18%, 10%)', s1: 'hsl(225, 16%, 14%)',
    s2: 'hsl(225, 14%, 18%)', s3: 'hsl(225, 12%, 24%)',
  },
} as const;

// ── NEW: Text (never pure black/white) ─────────────────────────
export const calmText = {
  light: { primary: 'hsl(220, 15%, 15%)', secondary: 'hsl(220, 10%, 45%)', tertiary: 'hsl(220, 8%, 62%)' },
  dark: { primary: 'hsl(220, 15%, 95%)', secondary: 'hsl(220, 10%, 72%)', tertiary: 'hsl(220, 8%, 55%)' },
} as const;

// ── NEW: Glass Surfaces ────────────────────────────────────────
export const calmGlass = {
  light: { bg: 'rgba(255, 255, 255, 0.72)', border: 'rgba(255, 255, 255, 0.25)', blur: '16px' },
  dark: { bg: 'rgba(30, 30, 46, 0.72)', border: 'rgba(255, 255, 255, 0.08)', blur: '16px' },
} as const;

// ── EXTENDED Aggregate (ALL legacy + ALL new) ──────────────────
export const colors = {
  ...legacyColors,    // 31 legacy properties: brand, surfaceLight, textLight, etc.
  // New Calm Neurodesign namespaces:
  accent,
  calmSuccess,
  calmWarning,
  calmDanger,
  context,
  calmSurface,
  calmText,
  calmGlass,
} as const;

export type Colors = typeof colors;
```

- [ ] **Step 6: Verify zero TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors — all existing `colors.surfaceLight`, `colors.brand`, `import { surfaceLight }` usages still work

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 8: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All 782+ tests pass (no regressions)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/design-system/colors.ts frontend/src/design-system/colors-legacy.ts frontend/src/__tests__/design-tokens.test.ts
git commit -m "feat(phase102): extend color tokens with Calm Neurodesign HSL system

New accent/context/calmSurface/calmText/calmGlass tokens added alongside
all 31 legacy properties. Aggregate extends via spread, zero breakage.
Old tokens preserved in colors-legacy.ts."
```

---

### Task 2: Extend typography tokens with modular scale

**Files:**
- Create: `frontend/src/design-system/typography-legacy.ts`
- Rewrite: `frontend/src/design-system/typography.ts`
- Test: `frontend/src/__tests__/design-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
// Append to frontend/src/__tests__/design-tokens.test.ts
import { typography } from '../design-system/typography';

describe('Calm Neurodesign Typography Tokens', () => {
  it('exports modular scale sizes', () => {
    expect(typography.size.xs).toBe('0.75rem');
    expect(typography.size.sm).toBe('0.875rem');
    expect(typography.size.base).toBe('1rem');
    expect(typography.size.lg).toBe('1.125rem');
    expect(typography.size.xl).toBe('1.25rem');
    expect(typography.size['2xl']).toBe('1.5rem');
    expect(typography.size['3xl']).toBe('1.875rem');
  });

  it('exports font weights', () => {
    expect(typography.weight.normal).toBe(400);
    expect(typography.weight.medium).toBe(500);
    expect(typography.weight.semibold).toBe(600);
    expect(typography.weight.bold).toBe(700);
  });

  it('exports line heights', () => {
    expect(typography.leading.tight).toBe(1.3);
    expect(typography.leading.normal).toBe(1.55);
    expect(typography.leading.relaxed).toBe(1.7);
  });

  it('exports font families', () => {
    expect(typography.family.sans).toContain('Inter');
    expect(typography.family.mono).toContain('JetBrains Mono');
  });

  // CRITICAL: backward compat
  it('preserves ALL legacy aggregate properties', () => {
    expect(typography.fontFamily).toBeDefined();
    expect(typography.fontFamily.sans).toContain('Inter');
    expect(typography.fontSize).toBeDefined();
    expect(typography.fontSize.base).toBe('0.875rem');
    expect(typography.fontWeight).toBeDefined();
    expect(typography.fontWeight.bold).toBe(700);
    expect(typography.lineHeight).toBeDefined();
    expect(typography.lineHeight.base).toBe(1.6);
    expect(typography.letterSpacing).toBeDefined();
    expect(typography.fontFeatureSettings).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: FAIL — `typography.size` is undefined

- [ ] **Step 3: Create typography-legacy.ts**

Move the ENTIRE current content of `typography.ts` (127 lines) to `typography-legacy.ts`. No changes.

- [ ] **Step 4: Verify legacy file compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Rewrite typography.ts with extended aggregate**

```typescript
/**
 * ZenAI Design System — Typography Tokens
 * Phase 102 — Calm Neurodesign modular 1.25 scale ADDED alongside legacy.
 */

// Re-export ALL legacy named exports
export {
  fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, fontFeatureSettings,
} from './typography-legacy';

import { typography as legacyTypography } from './typography-legacy';

// ── NEW: Modular scale ─────────────────────────────────────────
export const family = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
} as const;

export const size = {
  xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
  xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem',
} as const;

export const weight = {
  normal: 400, medium: 500, semibold: 600, bold: 700,
} as const;

export const leading = {
  tight: 1.3, normal: 1.55, relaxed: 1.7,
} as const;

export const tracking = {
  tight: '-0.02em', normal: '0', wide: '0.02em', wider: '0.05em',
} as const;

// ── EXTENDED Aggregate ─────────────────────────────────────────
export const typography = {
  ...legacyTypography, // fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, fontFeatureSettings
  family, size, weight, leading, tracking,
} as const;

export type Typography = typeof typography;
```

> **Note:** New letter-spacing uses `tracking` (not `letterSpacing`) to avoid collision with the legacy `letterSpacing` property which has different values.

- [ ] **Step 6: Verify zero TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/design-system/typography.ts frontend/src/design-system/typography-legacy.ts frontend/src/__tests__/design-tokens.test.ts
git commit -m "feat(phase102): extend typography tokens with modular 1.25 scale

New family/size/weight/leading/tracking alongside legacy fontFamily/fontSize etc.
Old tokens in typography-legacy.ts, aggregate extends via spread."
```

---

### Task 3: Extend spacing tokens with Gestalt scale

**Files:**
- Create: `frontend/src/design-system/spacing-legacy.ts`
- Rewrite: `frontend/src/design-system/spacing.ts`
- Test: `frontend/src/__tests__/design-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
import { spacing, scale, gestalt } from '../design-system/spacing';

describe('Calm Neurodesign Spacing Tokens', () => {
  it('exports 4px base scale as string px values', () => {
    expect(scale[1]).toBe('4px');
    expect(scale[2]).toBe('8px');
    expect(scale[4]).toBe('16px');
    expect(scale[6]).toBe('24px');
    expect(scale[8]).toBe('32px');
    expect(scale[12]).toBe('48px');
    expect(scale[16]).toBe('64px');
  });

  it('exports gestalt proximity aliases', () => {
    expect(gestalt.intraGroup).toBe('8px');
    expect(gestalt.interGroup).toBe('24px');
  });

  // CRITICAL: backward compat — spacing is still the old numeric object
  it('preserves legacy spacing as numeric object', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(12);
    expect(spacing.lg).toBe(16);
    expect(spacing.xl).toBe(20);
    expect(spacing['2xl']).toBe(24);
    expect(spacing['3xl']).toBe(32);
    expect(spacing['4xl']).toBe(48);
  });

  it('preserves legacy space, layout, px exports', async () => {
    const { space, layout, px } = await import('../design-system/spacing');
    expect(space[1]).toBe(4);
    expect(layout.sidebarWidth).toBe(260);
    expect(px(16)).toBe('16px');
  });
});
```

> **Note:** The `spacing` export keeps the OLD numeric shape (`{ xs: 4, sm: 8, ... }`). The NEW string-based scale is exported as `scale` (a separate named export). This avoids breaking `spacing.xs`, `spacing.sm` etc.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: FAIL — `scale` is undefined

- [ ] **Step 3: Create spacing-legacy.ts**

Move the ENTIRE current content of `spacing.ts` (89 lines) to `spacing-legacy.ts`. No changes.

- [ ] **Step 4: Verify legacy file compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Rewrite spacing.ts with new exports alongside legacy**

```typescript
/**
 * ZenAI Design System — Spacing Tokens
 * Phase 102 — Gestalt 4px string scale ADDED alongside legacy numeric scale.
 *
 * `spacing` export keeps the OLD numeric shape for backward compat.
 * New `scale` and `gestalt` are separate named exports.
 */

// Re-export ALL legacy exports (spacing stays the old numeric object)
export { spacing, space, layout, px } from './spacing-legacy';
export type { Spacing, Space, Layout } from './spacing-legacy';

// ── NEW: String-based 4px scale ────────────────────────────────
export const scale = {
  1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px',
  6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px',
} as const;

/** Gestalt proximity: intra ≤ 12px, inter ≥ 24px (≥ 2:1 ratio) */
export const gestalt = {
  intraGroup: '8px',
  interGroup: '24px',
} as const;
```

> **Key difference from original plan:** `spacing` is NOT an aggregate object — it's re-exported from legacy as-is. New tokens (`scale`, `gestalt`) are separate named exports. This is because the old `spacing` is a flat numeric object (`{ xs: 4, sm: 8, ... }`) and adding sub-objects would change its type.

- [ ] **Step 6: Verify zero TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/design-system/spacing.ts frontend/src/design-system/spacing-legacy.ts frontend/src/__tests__/design-tokens.test.ts
git commit -m "feat(phase102): extend spacing tokens with Gestalt 4px string scale

New scale/gestalt exports alongside legacy numeric spacing object.
Old spacing shape preserved for backward compat."
```

---

### Task 4: Extend animation tokens with spring physics

**Files:**
- Create: `frontend/src/design-system/animations-legacy.ts`
- Rewrite: `frontend/src/design-system/animations.ts`
- Test: `frontend/src/__tests__/design-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
import { animations } from '../design-system/animations';

describe('Calm Neurodesign Animation Tokens', () => {
  it('exports new spring easing curves', () => {
    expect(animations.ease.default).toContain('cubic-bezier');
    expect(animations.ease.spring).toContain('1.56');
    expect(animations.ease.outExpo).toContain('cubic-bezier');
    expect(animations.ease.exit).toContain('cubic-bezier');
  });

  it('exports new string durations', () => {
    expect(animations.dur.instant).toBe('80ms');
    expect(animations.dur.fast).toBe('150ms');
    expect(animations.dur.base).toBe('250ms');
    expect(animations.dur.smooth).toBe('350ms');
    expect(animations.dur.layout).toBe('450ms');
  });

  it('exports preset transition combinations', () => {
    expect(animations.preset.enter).toContain('350ms');
    expect(animations.preset.exit).toContain('250ms');
    expect(animations.preset.layout).toContain('450ms');
  });

  // CRITICAL: backward compat
  it('preserves ALL legacy aggregate properties', () => {
    expect(animations.easing).toBeDefined();
    expect(animations.easing.default).toContain('cubic-bezier');
    expect(animations.duration).toBeDefined();
    expect(animations.duration.instant).toBe(80);  // NOTE: number, not string
    expect(animations.duration.fast).toBe(150);
    expect(animations.transition).toBeDefined();
    expect(animations.neuroTransition).toBeDefined();
    expect(animations.keyframes).toBeDefined();
  });
});
```

> **Note on naming:** New string durations use `dur` (not `duration`) because old `duration` has numeric values (`{ instant: 80, fast: 150, ... }`) while new `dur` has string values (`{ instant: '80ms', ... }`). Both coexist in the aggregate.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: FAIL — `animations.ease` is undefined

- [ ] **Step 3: Create animations-legacy.ts**

Move the ENTIRE current content of `animations.ts` (121 lines) to `animations-legacy.ts`. No changes.

- [ ] **Step 4: Verify legacy file compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Rewrite animations.ts with extended aggregate**

```typescript
/**
 * ZenAI Design System — Animation Tokens
 * Phase 102 — Spring physics presets ADDED alongside legacy.
 */

// Re-export ALL legacy named exports
export { easing, duration, transition, neuroTransition, keyframes } from './animations-legacy';

import { animations as legacyAnimations } from './animations-legacy';

// ── NEW: Spring physics easings ────────────────────────────────
export const ease = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

// ── NEW: String durations (named `dur` to avoid collision with legacy `duration`) ──
export const dur = {
  instant: '80ms', fast: '150ms', base: '250ms', smooth: '350ms', layout: '450ms',
} as const;

// ── NEW: Transition presets ────────────────────────────────────
export const preset = {
  enter: `${dur.smooth} ${ease.spring}`,
  exit: `${dur.base} ${ease.exit}`,
  layout: `${dur.layout} ${ease.outExpo}`,
  hover: `${dur.instant} ${ease.default}`,
  micro: `${dur.fast} ${ease.default}`,
} as const;

// ── EXTENDED Aggregate ─────────────────────────────────────────
export const animations = {
  ...legacyAnimations, // easing, duration (numbers), transition, neuroTransition, keyframes
  ease, dur, preset,
} as const;

export type Animations = typeof animations;
```

- [ ] **Step 6: Verify zero TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/design-system/animations.ts frontend/src/design-system/animations-legacy.ts frontend/src/__tests__/design-tokens.test.ts
git commit -m "feat(phase102): extend animation tokens with spring physics presets

New ease/dur/preset alongside legacy easing/duration/transition/keyframes.
Old tokens in animations-legacy.ts, aggregate extends via spread."
```

---

### Task 5: Extend shadow tokens with glass levels

**Files:**
- Create: `frontend/src/design-system/shadows-legacy.ts`
- Rewrite: `frontend/src/design-system/shadows.ts`
- Test: `frontend/src/__tests__/design-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
import { shadows } from '../design-system/shadows';

describe('Calm Neurodesign Shadow Tokens', () => {
  it('exports new glass levels', () => {
    expect(shadows.glassLevel.level1).toBeDefined();
    expect(shadows.glassLevel.level2).toBeDefined();
    expect(shadows.glassLevel.backdrop).toBeDefined();
  });

  it('exports new elevation shadows', () => {
    expect(shadows.elevation.sm).toBeDefined();
    expect(shadows.elevation.md).toBeDefined();
    expect(shadows.elevation.lg).toBeDefined();
  });

  // CRITICAL: backward compat
  it('preserves ALL legacy aggregate properties', () => {
    expect(shadows.light).toBeDefined();
    expect(shadows.light.sm).toBeDefined();
    expect(shadows.light.card).toBeDefined();
    expect(shadows.dark).toBeDefined();
    expect(shadows.dark.sm).toBeDefined();
    expect(shadows.glass2026).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: FAIL — `shadows.glassLevel` is undefined

- [ ] **Step 3: Create shadows-legacy.ts**

Move the ENTIRE current content of `shadows.ts` (79 lines) to `shadows-legacy.ts`. No changes.

- [ ] **Step 4: Verify legacy file compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Rewrite shadows.ts with extended aggregate**

```typescript
/**
 * ZenAI Design System — Shadow Tokens
 * Phase 102 — Glass levels + elevation ADDED alongside legacy.
 */

// Re-export ALL legacy named exports
export { shadowLight, shadowDark, shadowGlass2026 } from './shadows-legacy';

import { shadows as legacyShadows } from './shadows-legacy';

// ── NEW: Glass Levels ──────────────────────────────────────────
export const glassLevel = {
  level1: '0 2px 16px rgba(0, 0, 0, 0.04)',
  level2: '0 8px 32px rgba(0, 0, 0, 0.08)',
  backdrop: '0 0 0 9999px rgba(0, 0, 0, 0.3)',
} as const;

// ── NEW: Elevation scale ───────────────────────────────────────
export const elevation = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06)',
} as const;

export const elevationDark = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.15)',
  md: '0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.35), 0 4px 8px rgba(0, 0, 0, 0.2)',
} as const;

// ── EXTENDED Aggregate ─────────────────────────────────────────
export const shadows = {
  ...legacyShadows, // light (shadowLight), dark (shadowDark), glass2026
  glassLevel, elevation, elevationDark,
} as const;

export type Shadows = typeof shadows;
```

- [ ] **Step 6: Verify zero TypeScript errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/design-system/shadows.ts frontend/src/design-system/shadows-legacy.ts frontend/src/__tests__/design-tokens.test.ts
git commit -m "feat(phase102): extend shadow tokens with glass levels + elevation scale

New glassLevel/elevation/elevationDark alongside legacy light/dark/glass2026.
Old tokens in shadows-legacy.ts, aggregate extends via spread."
```

---

### Task 6: Update tokens.ts barrel and design-system index

**Files:**
- Modify: `frontend/src/design-system/tokens.ts`
- Modify: `frontend/src/design-system/index.ts`

- [ ] **Step 1: Update tokens.ts to re-export new modules**

Update `tokens.ts` to import from new module shapes while keeping legacy re-exports. The `tokens` aggregate object now contains both new and old token namespaces.

- [ ] **Step 2: Update index.ts barrel exports**

Add new named exports: `accent`, `success`, `warning`, `danger`, `context`, `surface`, `text`, `glass`, `ease`, `dur`, `preset`, `scale`, `gestalt`, `size`, `weight`, `leading`, `glassLevel`, `elevation`.

Keep ALL existing exports unchanged for backward compat.

- [ ] **Step 3: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/design-system/tokens.ts frontend/src/design-system/index.ts
git commit -m "feat(phase102): update design system barrel exports for new tokens"
```

---

### Task 7: Add Calm Neurodesign CSS custom properties to index.css

**Files:**
- Modify: `frontend/src/index.css`

> **Strategy:** ADD new CSS custom properties ABOVE existing ones. Do NOT remove or rename ANY existing variables. The ~120 CSS files consuming legacy tokens will be migrated file-by-file in Phases 106-110.
>
> **Dark mode:** New `[data-theme="dark"]` block added for new tokens only. Existing `.dark-mode` / `:has(.dark-mode)` selectors are NOT touched — unification to `[data-theme="dark"]` happens during per-file migration.

- [ ] **Step 7a: Add new `:root` tokens**

Add the following block at the TOP of the `:root` selector in `index.css`, before any existing variables:

```css
/* ===== Phase 102: Calm Neurodesign Tokens ===== */

/* Semantic Colors (5 hues) */
--color-accent: hsl(250, 65%, 58%);
--color-accent-hover: hsl(250, 65%, 52%);
--color-accent-glow: hsla(250, 65%, 58%, 0.25);
--color-accent-2: hsl(190, 60%, 45%);
--color-accent-2-hover: hsl(190, 60%, 40%);
--color-success: hsl(160, 70%, 42%);
--color-success-light: hsla(160, 70%, 42%, 0.12);
--color-warning: hsl(38, 95%, 55%);
--color-warning-light: hsla(38, 95%, 55%, 0.12);
--color-danger: hsl(0, 72%, 55%);
--color-danger-light: hsla(0, 72%, 55%, 0.12);

/* Context Colors (spec uses --context- prefix) */
--context-personal: hsl(210, 70%, 55%);
--context-work: hsl(160, 60%, 45%);
--context-learning: hsl(280, 60%, 55%);
--context-creative: hsl(35, 90%, 55%);

/* Surface Scale (Light) */
--surface-bg: hsl(220, 14%, 97%);
--surface-1: hsl(220, 14%, 99%);
--surface-2: hsl(220, 12%, 95%);
--surface-3: hsl(220, 10%, 91%);

/* Text (never pure black/white) */
--text-primary: hsl(220, 15%, 15%);
--text-secondary: hsl(220, 10%, 45%);
--text-tertiary: hsl(220, 8%, 62%);

/* Glass */
--glass-bg: rgba(255, 255, 255, 0.72);
--glass-blur: 16px;
--glass-border: rgba(255, 255, 255, 0.25);

/* Typography (Modular 1.25 scale) */
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-3xl: 1.875rem;
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--leading-tight: 1.3;
--leading-normal: 1.55;
--leading-relaxed: 1.7;

/* Spacing (4px base) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* Animation */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
--duration-instant: 80ms;
--duration-fast: 150ms;
--duration-base: 250ms;
--duration-smooth: 350ms;
--duration-layout: 450ms;

/* Glass Level Shadows */
--glass-l1-shadow: 0 2px 16px rgba(0, 0, 0, 0.04);
--glass-l2-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

/* Visual Haptics (spec 6.5) */
--haptic-press: scale(0.97);
```

- [ ] **Step 7b: Add `[data-theme="dark"]` block for new tokens**

Add this block AFTER the `:root` block (coexists with existing `.dark-mode` selectors):

```css
/* Phase 102: Dark mode for new Calm Neurodesign tokens */
[data-theme="dark"] {
  --surface-bg: hsl(225, 18%, 10%);
  --surface-1: hsl(225, 16%, 14%);
  --surface-2: hsl(225, 14%, 18%);
  --surface-3: hsl(225, 12%, 24%);
  --text-primary: hsl(220, 15%, 95%);
  --text-secondary: hsl(220, 10%, 72%);
  --text-tertiary: hsl(220, 8%, 55%);
  --glass-bg: rgba(30, 30, 46, 0.72);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-l1-shadow: 0 2px 16px rgba(0, 0, 0, 0.15);
  --glass-l2-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 7c: Add reduced-motion + visual haptics rules**

Add at the END of `index.css`:

```css
/* Phase 102: Reduced motion (mandatory per spec) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Phase 102: Visual Haptics (spec 6.5) — tactile press feedback */
.interactive:active {
  transform: var(--haptic-press);
}

@keyframes success-flash {
  0% { box-shadow: 0 0 0 0 var(--color-success-light); }
  100% { box-shadow: 0 0 0 8px transparent; }
}
```

- [ ] **Step 7d: Verify build succeeds**

Run: `cd frontend && npx vite build`
Expected: Build succeeds with no errors

- [ ] **Step 7e: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 7f: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(phase102): add Calm Neurodesign CSS custom properties to index.css

New tokens coexist with all legacy tokens. Includes [data-theme=dark],
reduced-motion media query, and visual haptics (.interactive:active).
Legacy token removal happens per-file in Phases 106-110."
```

---

### Task 8: Create CSS token audit script

**Files:**
- Create: `scripts/css-token-audit.ts`

- [ ] **Step 1: Write the audit script**

```typescript
// scripts/css-token-audit.ts
/**
 * CSS Token Audit — finds usage of legacy tokens across all CSS files.
 * Run: npx tsx scripts/css-token-audit.ts
 *
 * Outputs a report of legacy token usage per file,
 * so we can track migration progress.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const LEGACY_TOKENS = [
  '--primary', '--primary-dark', '--primary-light', '--primary-lighter', '--primary-glow',
  '--petrol', '--petrol-light', '--petrol-lighter',
  '--warm-coral', '--warm-peach', '--warm-cream',
  '--background:', '--background-gradient',
  '--surface:', '--surface-solid', '--surface-light:',
  '--card-bg', '--hover-bg',
  '--text:', '--text-muted', '--text-secondary:',
  '--border:', '--border-light',
];

function findCssFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      results.push(full);
    }
  }
  return results;
}

const cssFiles = findCssFiles('frontend/src');
const report: Array<{ file: string; count: number; tokens: string[] }> = [];

for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const found: string[] = [];
  for (const token of LEGACY_TOKENS) {
    const regex = new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const matches = content.match(regex);
    if (matches) {
      found.push(`${token} (${matches.length}x)`);
    }
  }
  if (found.length > 0) {
    report.push({ file: path.relative(process.cwd(), file), count: found.length, tokens: found });
  }
}

report.sort((a, b) => b.count - a.count);

console.log(`\n=== CSS Token Audit ===`);
console.log(`Files with legacy tokens: ${report.length} / ${cssFiles.length}`);
console.log(`Total legacy token usages: ${report.reduce((sum, r) => sum + r.count, 0)}\n`);

for (const entry of report.slice(0, 20)) {
  console.log(`${entry.file} (${entry.count} usages)`);
  for (const t of entry.tokens) {
    console.log(`  ${t}`);
  }
}
```

> **Note:** Uses `node:fs` recursive readdir instead of `glob` (no extra dependency). Uses `npx tsx` instead of `npx ts-node` (Vite project, tsx is faster and requires no tsconfig).

- [ ] **Step 2: Run the audit script**

Run: `npx tsx scripts/css-token-audit.ts`
Expected: Report showing files using legacy tokens (baseline for tracking migration progress)

- [ ] **Step 3: Commit**

```bash
git add scripts/css-token-audit.ts
git commit -m "feat(phase102): add CSS token audit script for migration tracking"
```

---

### Task 9: Verify Phase 102 completion

- [ ] **Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All 782+ tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds, 0 TypeScript errors

- [ ] **Step 3: Run backend tests (regression check)**

Run: `cd backend && npm test`
Expected: All 4933+ tests pass

- [ ] **Step 4: Commit phase completion marker**

```bash
git commit --allow-empty -m "milestone(phase102): Design Token Consolidation complete

New Calm Neurodesign tokens: colors (HSL), typography (1.25 scale),
spacing (Gestalt 4px), animations (spring physics), shadows (glass levels).
Legacy tokens preserved in *-legacy.ts files for backward compat.
CSS audit script available at scripts/css-token-audit.ts."
```


## Chunk 2: Phase 103 — Component System Upgrade

> **Note for implementer:** Each component task follows the pattern: failing test → implement → passing test → commit. Task 19b at the end adds ALL components to the barrel export and runs `tsc --noEmit` + full test suite. Individual tasks omit `tsc --noEmit` for speed since these are new leaf files with no existing imports — the final barrel + verify step catches any issues.

### Task 10: Spinner component

**Files:**
- Create: `frontend/src/design-system/components/Spinner.tsx`
- Create: `frontend/src/design-system/components/Spinner.css`
- Test: `frontend/src/design-system/components/__tests__/Spinner.test.tsx`

- [ ] **Step 1: Write the failing test for Spinner**

```typescript
// frontend/src/design-system/components/__tests__/Spinner.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('renders with role="status" and accessible label', () => {
    render(<Spinner label="Laden" />);
    const el = screen.getByRole('status');
    expect(el).toBeDefined();
    expect(el.getAttribute('aria-label')).toBe('Laden');
  });

  it('applies ds-spinner base class', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.ds-spinner')).not.toBeNull();
  });

  it('supports sm/md/lg sizes', () => {
    const { container, rerender } = render(<Spinner size="sm" />);
    expect(container.querySelector('.ds-spinner--sm')).not.toBeNull();
    rerender(<Spinner size="lg" />);
    expect(container.querySelector('.ds-spinner--lg')).not.toBeNull();
  });

  it('defaults to md size', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.ds-spinner--md')).not.toBeNull();
  });

  it('passes through className', () => {
    const { container } = render(<Spinner className="custom" />);
    expect(container.querySelector('.ds-spinner.custom')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Spinner.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Spinner component**

Create `frontend/src/design-system/components/Spinner.tsx`:

```typescript
import type { HTMLAttributes } from 'react';
import './Spinner.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual size of the spinner */
  size?: SpinnerSize;
  /** Accessible label for screen readers */
  label?: string;
}

/**
 * Animated loading spinner with accessible status role.
 * Uses CSS animation with `var(--color-accent)` and `var(--duration-smooth)`.
 */
export function Spinner({
  size = 'md',
  label = 'Wird geladen',
  className,
  ...rest
}: SpinnerProps) {
  const classes = ['ds-spinner', `ds-spinner--${size}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="status" aria-label={label} {...rest}>
      <svg viewBox="0 0 24 24" fill="none" className="ds-spinner__svg" aria-hidden="true">
        <circle cx="12" cy="12" r="10" strokeWidth="2.5" stroke="currentColor" opacity="0.2" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          strokeWidth="2.5"
          stroke="currentColor"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
```

Create `frontend/src/design-system/components/Spinner.css`:

```css
/* Design System: Spinner */

.ds-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent, hsl(250, 65%, 58%));
}

.ds-spinner--sm { width: 16px; height: 16px; }
.ds-spinner--md { width: 24px; height: 24px; }
.ds-spinner--lg { width: 36px; height: 36px; }

.ds-spinner__svg {
  width: 100%;
  height: 100%;
  animation: ds-spin var(--duration-smooth, 350ms) linear infinite;
}

@keyframes ds-spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Spinner.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Spinner.tsx frontend/src/design-system/components/Spinner.css frontend/src/design-system/components/__tests__/Spinner.test.tsx
git commit -m "feat(phase103): add Spinner DS component with accessible status role"
```

---

### Task 11: Divider component

**Files:**
- Create: `frontend/src/design-system/components/Divider.tsx`
- Create: `frontend/src/design-system/components/Divider.css`
- Test: `frontend/src/design-system/components/__tests__/Divider.test.tsx`

- [ ] **Step 1: Write the failing test for Divider**

```typescript
// frontend/src/design-system/components/__tests__/Divider.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Divider } from '../Divider';

describe('Divider', () => {
  it('renders an hr with role="separator"', () => {
    const { container } = render(<Divider />);
    const hr = container.querySelector('hr');
    expect(hr).not.toBeNull();
    expect(hr?.getAttribute('role')).toBe('separator');
  });

  it('defaults to horizontal orientation', () => {
    const { container } = render(<Divider />);
    expect(container.querySelector('.ds-divider--horizontal')).not.toBeNull();
    expect(container.querySelector('hr')?.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('supports vertical orientation', () => {
    const { container } = render(<Divider orientation="vertical" />);
    expect(container.querySelector('.ds-divider--vertical')).not.toBeNull();
    expect(container.querySelector('hr')?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('renders label text when provided', () => {
    const { container } = render(<Divider label="oder" />);
    expect(container.querySelector('.ds-divider__label')?.textContent).toBe('oder');
  });

  it('passes through className', () => {
    const { container } = render(<Divider className="custom" />);
    expect(container.querySelector('.ds-divider.custom')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Divider.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Divider component**

Create `frontend/src/design-system/components/Divider.tsx`:

```typescript
import type { HTMLAttributes } from 'react';
import './Divider.css';

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  /** Direction of the divider line */
  orientation?: DividerOrientation;
  /** Optional centered label text */
  label?: string;
}

/**
 * Horizontal or vertical separator line with optional label.
 * Uses `var(--surface-3)` for the line color.
 */
export function Divider({
  orientation = 'horizontal',
  label,
  className,
  ...rest
}: DividerProps) {
  const classes = [
    'ds-divider',
    `ds-divider--${orientation}`,
    label ? 'ds-divider--with-label' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (label && orientation === 'horizontal') {
    return (
      <div className={classes}>
        <hr role="separator" aria-orientation="horizontal" {...rest} />
        <span className="ds-divider__label">{label}</span>
        <hr role="separator" aria-orientation="horizontal" />
      </div>
    );
  }

  return (
    <hr
      className={classes}
      role="separator"
      aria-orientation={orientation}
      {...rest}
    />
  );
}
```

Create `frontend/src/design-system/components/Divider.css`:

```css
/* Design System: Divider */

.ds-divider {
  border: none;
  margin: 0;
}

.ds-divider--horizontal {
  width: 100%;
  height: 1px;
  background: var(--surface-3, hsl(220, 10%, 91%));
}

.ds-divider--vertical {
  width: 1px;
  height: 100%;
  min-height: var(--space-6, 24px);
  background: var(--surface-3, hsl(220, 10%, 91%));
}

.ds-divider--with-label {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  height: auto;
  background: none;
}

.ds-divider--with-label hr {
  flex: 1;
  height: 1px;
  border: none;
  background: var(--surface-3, hsl(220, 10%, 91%));
}

.ds-divider__label {
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--font-medium, 500);
  color: var(--text-tertiary, hsl(220, 8%, 62%));
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Divider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Divider.tsx frontend/src/design-system/components/Divider.css frontend/src/design-system/components/__tests__/Divider.test.tsx
git commit -m "feat(phase103): add Divider DS component with label and vertical support"
```

---

### Task 12: Chip component

**Files:**
- Create: `frontend/src/design-system/components/Chip.tsx`
- Create: `frontend/src/design-system/components/Chip.css`
- Test: `frontend/src/design-system/components/__tests__/Chip.test.tsx`

- [ ] **Step 1: Write the failing test for Chip**

```typescript
// frontend/src/design-system/components/__tests__/Chip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders label text', () => {
    render(<Chip label="TypeScript" />);
    expect(screen.getByText('TypeScript')).toBeDefined();
  });

  it('applies ds-chip base class', () => {
    const { container } = render(<Chip label="Tag" />);
    expect(container.querySelector('.ds-chip')).not.toBeNull();
  });

  it('supports color variants', () => {
    const { container } = render(<Chip label="Active" color="success" />);
    expect(container.querySelector('.ds-chip--success')).not.toBeNull();
  });

  it('renders dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<Chip label="Remove me" onDismiss={onDismiss} />);
    const btn = screen.getByRole('button', { name: /entfernen/i });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not render dismiss button when onDismiss is absent', () => {
    render(<Chip label="Static" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders as selected when selected prop is true', () => {
    const { container } = render(<Chip label="Filter" selected />);
    expect(container.querySelector('.ds-chip--selected')).not.toBeNull();
  });

  it('renders icon when provided', () => {
    const { container } = render(<Chip label="Code" icon={<span data-testid="icon" />} />);
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Chip.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Chip component**

Create `frontend/src/design-system/components/Chip.tsx`:

```typescript
import type { HTMLAttributes, ReactNode } from 'react';
import './Chip.css';

export type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Text label displayed inside the chip */
  label: string;
  /** Semantic color variant */
  color?: ChipColor;
  /** Whether the chip is in selected/active state */
  selected?: boolean;
  /** Leading icon element */
  icon?: ReactNode;
  /** Callback to dismiss — shows an X button when provided */
  onDismiss?: () => void;
}

/**
 * Filter chip / tag element for categorization and filtering.
 * Uses `var(--surface-2)` background, `var(--color-accent)` when selected.
 */
export function Chip({
  label,
  color = 'default',
  selected = false,
  icon,
  onDismiss,
  className,
  ...rest
}: ChipProps) {
  const classes = [
    'ds-chip',
    `ds-chip--${color}`,
    selected ? 'ds-chip--selected' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {icon && <span className="ds-chip__icon" aria-hidden="true">{icon}</span>}
      <span className="ds-chip__label">{label}</span>
      {onDismiss && (
        <button
          type="button"
          className="ds-chip__dismiss"
          onClick={onDismiss}
          aria-label={`${label} entfernen`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M10 4L4 10M4 4l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
```

Create `frontend/src/design-system/components/Chip.css`:

```css
/* Design System: Chip */

.ds-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 4px);
  height: 28px;
  padding: 0 var(--space-3, 12px);
  border-radius: 9999px;
  font-size: var(--text-sm, 0.875rem);
  font-weight: var(--font-medium, 500);
  line-height: 1;
  white-space: nowrap;
  background: var(--surface-2, hsl(220, 12%, 95%));
  color: var(--text-primary, hsl(220, 15%, 15%));
  border: 1px solid transparent;
  transition: all var(--duration-fast, 150ms) var(--ease-default, cubic-bezier(0.4, 0, 0.2, 1));
}

.ds-chip--selected {
  background: var(--color-accent, hsl(250, 65%, 58%));
  color: #fff;
}

.ds-chip--accent { background: hsla(250, 65%, 58%, 0.12); color: var(--color-accent); }
.ds-chip--success { background: var(--color-success-light, hsla(160, 70%, 42%, 0.12)); color: var(--color-success); }
.ds-chip--warning { background: var(--color-warning-light, hsla(38, 95%, 55%, 0.12)); color: var(--color-warning); }
.ds-chip--danger { background: var(--color-danger-light, hsla(0, 72%, 55%, 0.12)); color: var(--color-danger); }

.ds-chip__icon {
  display: flex;
  font-size: 14px;
}

.ds-chip__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-left: var(--space-1, 4px);
  border: none;
  background: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  border-radius: 50%;
  transition: opacity var(--duration-instant, 80ms) var(--ease-default);
}

.ds-chip__dismiss:hover { opacity: 1; }
.ds-chip__dismiss:focus-visible {
  outline: 2px solid var(--color-accent, hsl(250, 65%, 58%));
  outline-offset: 1px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Chip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Chip.tsx frontend/src/design-system/components/Chip.css frontend/src/design-system/components/__tests__/Chip.test.tsx
git commit -m "feat(phase103): add Chip DS component with dismiss, selected, and color variants"
```

---

### Task 13: Switch component

**Files:**
- Create: `frontend/src/design-system/components/Switch.tsx`
- Create: `frontend/src/design-system/components/Switch.css`
- Test: `frontend/src/design-system/components/__tests__/Switch.test.tsx`

- [ ] **Step 1: Write the failing test for Switch**

```typescript
// frontend/src/design-system/components/__tests__/Switch.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '../Switch';

describe('Switch', () => {
  it('renders as a checkbox with switch role', () => {
    render(<Switch label="Dark Mode" checked={false} onChange={() => {}} />);
    const input = screen.getByRole('switch');
    expect(input).toBeDefined();
  });

  it('associates label text via aria-label', () => {
    render(<Switch label="Notifications" checked={false} onChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe('Notifications');
  });

  it('renders visible label text', () => {
    render(<Switch label="Notifications" checked={false} onChange={() => {}} />);
    expect(screen.getByText('Notifications')).toBeDefined();
  });

  it('reflects checked state', () => {
    const { rerender } = render(<Switch label="Toggle" checked={false} onChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    rerender(<Switch label="Toggle" checked={true} onChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
  });

  it('calls onChange when toggled', () => {
    const onChange = vi.fn();
    render(<Switch label="Toggle" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('supports disabled state', () => {
    const { container } = render(<Switch label="Off" checked={false} onChange={() => {}} disabled />);
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('.ds-switch--disabled')).not.toBeNull();
  });

  it('supports sm and lg sizes', () => {
    const { container, rerender } = render(<Switch label="S" size="sm" checked={false} onChange={() => {}} />);
    expect(container.querySelector('.ds-switch--sm')).not.toBeNull();
    rerender(<Switch label="L" size="lg" checked={false} onChange={() => {}} />);
    expect(container.querySelector('.ds-switch--lg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Switch.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Switch component**

Create `frontend/src/design-system/components/Switch.tsx`:

```typescript
import type { InputHTMLAttributes } from 'react';
import './Switch.css';

export type SwitchSize = 'sm' | 'md' | 'lg';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'role'> {
  /** Visible label and aria-label for the switch */
  label: string;
  /** Controlled checked state */
  checked: boolean;
  /** Change handler */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Visual size */
  size?: SwitchSize;
}

/**
 * Toggle switch input with `role="switch"` for accessibility.
 * Uses `var(--color-accent)` for the active track and `var(--ease-spring)` thumb animation.
 */
export function Switch({
  label,
  checked,
  onChange,
  size = 'md',
  disabled = false,
  className,
  ...rest
}: SwitchProps) {
  const classes = [
    'ds-switch',
    `ds-switch--${size}`,
    disabled ? 'ds-switch--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes}>
      <input
        type="checkbox"
        role="switch"
        className="ds-switch__input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        id={rest.id}
        {...rest}
      />
      <span className="ds-switch__track" aria-hidden="true">
        <span className="ds-switch__thumb" />
      </span>
      <span className="ds-switch__label" id={rest.id ? `${rest.id}-label` : undefined}>{label}</span>
    </label>
  );
}
```

Create `frontend/src/design-system/components/Switch.css`:

```css
/* Design System: Switch */

.ds-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  cursor: pointer;
  user-select: none;
}

.ds-switch--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ds-switch__input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.ds-switch__track {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  background: var(--surface-3, hsl(220, 10%, 91%));
  transition: background var(--duration-fast, 150ms) var(--ease-default, cubic-bezier(0.4, 0, 0.2, 1));
  flex-shrink: 0;
}

/* Sizes: track dimensions */
.ds-switch--sm .ds-switch__track { width: 32px; height: 18px; }
.ds-switch--md .ds-switch__track { width: 40px; height: 22px; }
.ds-switch--lg .ds-switch__track { width: 48px; height: 26px; }

.ds-switch__thumb {
  position: absolute;
  left: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform var(--duration-fast, 150ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.ds-switch--sm .ds-switch__thumb { width: 14px; height: 14px; }
.ds-switch--md .ds-switch__thumb { width: 18px; height: 18px; }
.ds-switch--lg .ds-switch__thumb { width: 22px; height: 22px; }

/* Checked state */
.ds-switch__input:checked + .ds-switch__track {
  background: var(--color-accent, hsl(250, 65%, 58%));
}

.ds-switch--sm .ds-switch__input:checked + .ds-switch__track .ds-switch__thumb { transform: translateX(14px); }
.ds-switch--md .ds-switch__input:checked + .ds-switch__track .ds-switch__thumb { transform: translateX(18px); }
.ds-switch--lg .ds-switch__input:checked + .ds-switch__track .ds-switch__thumb { transform: translateX(22px); }

/* Focus visible */
.ds-switch__input:focus-visible + .ds-switch__track {
  outline: 2px solid var(--color-accent, hsl(250, 65%, 58%));
  outline-offset: 2px;
}

.ds-switch__label {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-primary, hsl(220, 15%, 15%));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Switch.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Switch.tsx frontend/src/design-system/components/Switch.css frontend/src/design-system/components/__tests__/Switch.test.tsx
git commit -m "feat(phase103): add Switch DS component with spring thumb animation"
```

---

### Task 14: Progress component

**Files:**
- Create: `frontend/src/design-system/components/Progress.tsx`
- Create: `frontend/src/design-system/components/Progress.css`
- Test: `frontend/src/design-system/components/__tests__/Progress.test.tsx`

- [ ] **Step 1: Write the failing test for Progress**

```typescript
// frontend/src/design-system/components/__tests__/Progress.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from '../Progress';

describe('Progress', () => {
  it('renders a progressbar role with value', () => {
    render(<Progress value={45} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeDefined();
    expect(bar.getAttribute('aria-valuenow')).toBe('45');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('clamps value between 0 and 100', () => {
    const { rerender } = render(<Progress value={-10} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    rerender(<Progress value={150} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('applies ds-progress base class', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('.ds-progress')).not.toBeNull();
  });

  it('renders indeterminate mode when value is undefined', () => {
    const { container } = render(<Progress />);
    expect(container.querySelector('.ds-progress--indeterminate')).not.toBeNull();
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('renders label when provided', () => {
    render(<Progress value={75} label="75% abgeschlossen" />);
    expect(screen.getByText('75% abgeschlossen')).toBeDefined();
  });

  it('supports color variants', () => {
    const { container } = render(<Progress value={50} color="success" />);
    expect(container.querySelector('.ds-progress--success')).not.toBeNull();
  });

  it('supports sm/md/lg sizes', () => {
    const { container } = render(<Progress value={50} size="lg" />);
    expect(container.querySelector('.ds-progress--lg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Progress.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Progress component**

Create `frontend/src/design-system/components/Progress.tsx`:

```typescript
import type { HTMLAttributes } from 'react';
import './Progress.css';

export type ProgressSize = 'sm' | 'md' | 'lg';
export type ProgressColor = 'accent' | 'success' | 'warning' | 'danger';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Current value (0-100). Omit for indeterminate mode. */
  value?: number;
  /** Visual size of the bar */
  size?: ProgressSize;
  /** Bar fill color */
  color?: ProgressColor;
  /** Optional text label shown below the bar */
  label?: string;
}

/**
 * Determinate or indeterminate progress bar.
 * Uses `var(--color-accent)` fill with `var(--ease-out-expo)` animation.
 */
export function Progress({
  value,
  size = 'md',
  color = 'accent',
  label,
  className,
  ...rest
}: ProgressProps) {
  const isIndeterminate = value === undefined;
  const clamped = isIndeterminate ? 0 : Math.min(100, Math.max(0, value));

  const classes = [
    'ds-progress',
    `ds-progress--${size}`,
    `ds-progress--${color}`,
    isIndeterminate ? 'ds-progress--indeterminate' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      <div
        className="ds-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(isIndeterminate ? {} : { 'aria-valuenow': clamped })}
      >
        <div
          className="ds-progress__fill"
          style={isIndeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
      {label && <span className="ds-progress__label">{label}</span>}
    </div>
  );
}
```

Create `frontend/src/design-system/components/Progress.css`:

```css
/* Design System: Progress */

.ds-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  width: 100%;
}

.ds-progress__track {
  width: 100%;
  border-radius: 9999px;
  background: var(--surface-2, hsl(220, 12%, 95%));
  overflow: hidden;
}

.ds-progress--sm .ds-progress__track { height: 4px; }
.ds-progress--md .ds-progress__track { height: 8px; }
.ds-progress--lg .ds-progress__track { height: 12px; }

.ds-progress__fill {
  height: 100%;
  border-radius: 9999px;
  transition: width var(--duration-smooth, 350ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
}

/* Color variants */
.ds-progress--accent .ds-progress__fill { background: var(--color-accent, hsl(250, 65%, 58%)); }
.ds-progress--success .ds-progress__fill { background: var(--color-success, hsl(160, 70%, 42%)); }
.ds-progress--warning .ds-progress__fill { background: var(--color-warning, hsl(38, 95%, 55%)); }
.ds-progress--danger .ds-progress__fill { background: var(--color-danger, hsl(0, 72%, 55%)); }

/* Indeterminate */
.ds-progress--indeterminate .ds-progress__fill {
  width: 40% !important;
  animation: ds-progress-slide 1.2s var(--ease-default, cubic-bezier(0.4, 0, 0.2, 1)) infinite;
}

@keyframes ds-progress-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

.ds-progress__label {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-secondary, hsl(220, 10%, 45%));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Progress.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Progress.tsx frontend/src/design-system/components/Progress.css frontend/src/design-system/components/__tests__/Progress.test.tsx
git commit -m "feat(phase103): add Progress DS component with determinate and indeterminate modes"
```

---

### Task 15: Alert component

**Files:**
- Create: `frontend/src/design-system/components/Alert.tsx`
- Create: `frontend/src/design-system/components/Alert.css`
- Test: `frontend/src/design-system/components/__tests__/Alert.test.tsx`

- [ ] **Step 1: Write the failing test for Alert**

```typescript
// frontend/src/design-system/components/__tests__/Alert.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from '../Alert';

describe('Alert', () => {
  it('renders with role="alert"', () => {
    render(<Alert variant="info">Hinweis</Alert>);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders children text', () => {
    render(<Alert variant="info">Bitte beachten</Alert>);
    expect(screen.getByText('Bitte beachten')).toBeDefined();
  });

  it('supports all 4 variants', () => {
    const { container, rerender } = render(<Alert variant="info">I</Alert>);
    expect(container.querySelector('.ds-alert--info')).not.toBeNull();
    rerender(<Alert variant="success">S</Alert>);
    expect(container.querySelector('.ds-alert--success')).not.toBeNull();
    rerender(<Alert variant="warning">W</Alert>);
    expect(container.querySelector('.ds-alert--warning')).not.toBeNull();
    rerender(<Alert variant="danger">D</Alert>);
    expect(container.querySelector('.ds-alert--danger')).not.toBeNull();
  });

  it('renders title when provided', () => {
    render(<Alert variant="info" title="Wichtig">Details</Alert>);
    expect(screen.getByText('Wichtig')).toBeDefined();
  });

  it('renders dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<Alert variant="info" onDismiss={onDismiss}>Info</Alert>);
    const btn = screen.getByRole('button', { name: /schlie/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not render dismiss button by default', () => {
    render(<Alert variant="info">Info</Alert>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Alert.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Alert component**

Create `frontend/src/design-system/components/Alert.tsx`:

```typescript
import type { HTMLAttributes, ReactNode } from 'react';
import './Alert.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  /** Semantic variant controlling color and icon */
  variant: AlertVariant;
  /** Optional bold title line */
  title?: string;
  /** Callback to dismiss — shows close button when provided */
  onDismiss?: () => void;
  children: ReactNode;
}

const VARIANT_ICONS: Record<AlertVariant, string> = {
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  success: 'M9 16.2l-3.5-3.5L4.09 14.1 9 19 20 8l-1.41-1.42L9 16.2z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  danger: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
};

/**
 * Contextual alert banner for info, success, warning, and danger messages.
 * Uses semantic color tokens with light background tints.
 */
export function Alert({
  variant,
  title,
  onDismiss,
  children,
  className,
  ...rest
}: AlertProps) {
  const classes = [
    'ds-alert',
    `ds-alert--${variant}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="alert" {...rest}>
      <svg className="ds-alert__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={VARIANT_ICONS[variant]} />
      </svg>
      <div className="ds-alert__content">
        {title && <strong className="ds-alert__title">{title}</strong>}
        <div className="ds-alert__body">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="ds-alert__dismiss"
          onClick={onDismiss}
          aria-label="Schlie\u00dfen"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M13 5L5 13M5 5l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

Create `frontend/src/design-system/components/Alert.css`:

```css
/* Design System: Alert */

.ds-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--space-2, 8px);
  border: 1px solid transparent;
  font-size: var(--text-sm, 0.875rem);
  line-height: var(--leading-normal, 1.55);
}

.ds-alert--info {
  background: hsla(250, 65%, 58%, 0.08);
  border-color: hsla(250, 65%, 58%, 0.2);
  color: var(--color-accent, hsl(250, 65%, 58%));
}

.ds-alert--success {
  background: var(--color-success-light, hsla(160, 70%, 42%, 0.12));
  border-color: hsla(160, 70%, 42%, 0.2);
  color: var(--color-success, hsl(160, 70%, 42%));
}

.ds-alert--warning {
  background: var(--color-warning-light, hsla(38, 95%, 55%, 0.12));
  border-color: hsla(38, 95%, 55%, 0.2);
  color: var(--color-warning, hsl(38, 95%, 55%));
}

.ds-alert--danger {
  background: var(--color-danger-light, hsla(0, 72%, 55%, 0.12));
  border-color: hsla(0, 72%, 55%, 0.2);
  color: var(--color-danger, hsl(0, 72%, 55%));
}

.ds-alert__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 1px;
}

.ds-alert__content {
  flex: 1;
  min-width: 0;
}

.ds-alert__title {
  display: block;
  font-weight: var(--font-semibold, 600);
  margin-bottom: var(--space-1, 4px);
}

.ds-alert__body {
  color: var(--text-primary, hsl(220, 15%, 15%));
}

.ds-alert__dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1, 4px);
  border: none;
  background: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  border-radius: var(--space-1, 4px);
  transition: opacity var(--duration-instant, 80ms) var(--ease-default);
}

.ds-alert__dismiss:hover { opacity: 1; }
.ds-alert__dismiss:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Alert.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Alert.tsx frontend/src/design-system/components/Alert.css frontend/src/design-system/components/__tests__/Alert.test.tsx
git commit -m "feat(phase103): add Alert DS component with 4 semantic variants and dismiss"
```

---

### Task 16: Tooltip component

**Files:**
- Create: `frontend/src/design-system/components/Tooltip.tsx`
- Create: `frontend/src/design-system/components/Tooltip.css`
- Test: `frontend/src/design-system/components/__tests__/Tooltip.test.tsx`

- [ ] **Step 1: Write the failing test for Tooltip**

```typescript
// frontend/src/design-system/components/__tests__/Tooltip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

describe('Tooltip', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not show tooltip content initially', () => {
    render(
      <Tooltip content="Hilfetext">
        <button>Hover mich</button>
      </Tooltip>
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows tooltip on mouseenter after delay', () => {
    render(
      <Tooltip content="Hilfetext">
        <button>Hover mich</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText('Hover mich'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('Hilfetext')).toBeDefined();
  });

  it('hides tooltip on mouseleave', () => {
    render(
      <Tooltip content="Hilfetext">
        <button>Hover mich</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText('Hover mich'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.mouseLeave(screen.getByText('Hover mich'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows tooltip on focus and hides on blur', () => {
    render(
      <Tooltip content="Focus text">
        <button>Focus me</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByText('Focus me'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.blur(screen.getByText('Focus me'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('supports placement prop', () => {
    render(
      <Tooltip content="Top tip" placement="top">
        <button>Top</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText('Top'));
    act(() => { vi.advanceTimersByTime(300); });
    const tip = screen.getByRole('tooltip');
    expect(tip.className).toContain('ds-tooltip--top');
  });

  it('hides on Escape key', () => {
    render(
      <Tooltip content="Escape me">
        <button>Trigger</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText('Trigger'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.keyDown(screen.getByText('Trigger'), { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Tooltip.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Tooltip component**

Create `frontend/src/design-system/components/Tooltip.tsx`:

```typescript
import { useState, useRef, useCallback, useId } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip text content */
  content: string;
  /** Placement relative to trigger */
  placement?: TooltipPlacement;
  /** Delay before showing (ms) */
  delayShow?: number;
  /** Delay before hiding (ms) */
  delayHide?: number;
  /** Trigger element (rendered inline) */
  children: ReactElement;
}

/**
 * Floating tooltip shown on hover/focus with configurable placement and delay.
 * Uses dark background with `var(--ease-spring)` entry animation.
 * Accessible via `aria-describedby` and keyboard (Escape to dismiss).
 */
export function Tooltip({
  content,
  placement = 'top',
  delayShow = 200,
  delayHide = 100,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const showTimer = useRef<ReturnType<typeof setTimeout>>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 8;

    const positions: Record<TooltipPlacement, { top: number; left: number }> = {
      top: { top: rect.top - gap + window.scrollY, left: rect.left + rect.width / 2 + window.scrollX },
      bottom: { top: rect.bottom + gap + window.scrollY, left: rect.left + rect.width / 2 + window.scrollX },
      left: { top: rect.top + rect.height / 2 + window.scrollY, left: rect.left - gap + window.scrollX },
      right: { top: rect.top + rect.height / 2 + window.scrollY, left: rect.right + gap + window.scrollX },
    };

    setCoords(positions[placement]);
  }, [placement]);

  const show = useCallback(() => {
    clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, delayShow);
  }, [delayShow, updatePosition]);

  const hide = useCallback(() => {
    clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, delayHide);
  }, [delayHide]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearTimeout(showTimer.current);
      setVisible(false);
    }
  }, []);

  const tooltip = visible
    ? createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className={`ds-tooltip ds-tooltip--${placement}`}
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="ds-tooltip__trigger"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={handleKeyDown}
        aria-describedby={visible ? tooltipId : undefined}
      >
        {children}
      </span>
      {tooltip}
    </>
  );
}
```

Create `frontend/src/design-system/components/Tooltip.css`:

```css
/* Design System: Tooltip */

.ds-tooltip__trigger {
  display: inline-flex;
}

.ds-tooltip {
  position: absolute;
  z-index: 9999;
  max-width: 240px;
  padding: var(--space-1, 4px) var(--space-2, 8px);
  border-radius: 6px;
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--font-medium, 500);
  line-height: var(--leading-tight, 1.3);
  color: #fff;
  background: hsl(220, 15%, 18%);
  box-shadow: var(--glass-l1-shadow, 0 2px 16px rgba(0, 0, 0, 0.04));
  pointer-events: none;
  white-space: normal;
  animation: ds-tooltip-in var(--duration-fast, 150ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.ds-tooltip--top    { transform: translateX(-50%) translateY(-100%); }
.ds-tooltip--bottom { transform: translateX(-50%); }
.ds-tooltip--left   { transform: translateX(-100%) translateY(-50%); }
.ds-tooltip--right  { transform: translateY(-50%); }

@keyframes ds-tooltip-in {
  from { opacity: 0; scale: 0.95; }
  to   { opacity: 1; scale: 1; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Tooltip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Tooltip.tsx frontend/src/design-system/components/Tooltip.css frontend/src/design-system/components/__tests__/Tooltip.test.tsx
git commit -m "feat(phase103): add Tooltip DS component with placement, delay, and keyboard dismiss"
```

---

### Task 17: Popover component

**Files:**
- Create: `frontend/src/design-system/components/Popover.tsx`
- Create: `frontend/src/design-system/components/Popover.css`
- Test: `frontend/src/design-system/components/__tests__/Popover.test.tsx`

- [ ] **Step 1: Write the failing test for Popover**

```typescript
// frontend/src/design-system/components/__tests__/Popover.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Popover } from '../Popover';

describe('Popover', () => {
  it('does not show content initially when closed', () => {
    render(
      <Popover
        isOpen={false}
        onClose={() => {}}
        trigger={<button>Open</button>}
      >
        <p>Popover body</p>
      </Popover>
    );
    expect(screen.queryByText('Popover body')).toBeNull();
  });

  it('renders content when isOpen is true', () => {
    render(
      <Popover
        isOpen={true}
        onClose={() => {}}
        trigger={<button>Open</button>}
      >
        <p>Popover body</p>
      </Popover>
    );
    expect(screen.getByText('Popover body')).toBeDefined();
  });

  it('renders trigger element', () => {
    render(
      <Popover
        isOpen={false}
        onClose={() => {}}
        trigger={<button>Click me</button>}
      >
        Content
      </Popover>
    );
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Popover
        isOpen={true}
        onClose={onClose}
        trigger={<button>Trigger</button>}
      >
        Content
      </Popover>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies placement class', () => {
    const { container } = render(
      <Popover
        isOpen={true}
        onClose={() => {}}
        placement="bottom-start"
        trigger={<button>Trigger</button>}
      >
        Content
      </Popover>
    );
    expect(container.querySelector('.ds-popover__content--bottom-start')).not.toBeNull();
  });

  it('has accessible attributes', () => {
    render(
      <Popover
        isOpen={true}
        onClose={() => {}}
        trigger={<button>Trigger</button>}
      >
        Content
      </Popover>
    );
    const content = screen.getByText('Content').closest('[role]');
    expect(content?.getAttribute('role')).toBe('dialog');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Popover.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Popover component**

Create `frontend/src/design-system/components/Popover.tsx`:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode, ReactElement } from 'react';
import './Popover.css';

export type PopoverPlacement =
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'right';

export interface PopoverProps {
  /** Whether the popover is visible */
  isOpen: boolean;
  /** Called when the popover should close */
  onClose: () => void;
  /** Trigger element that the popover anchors to */
  trigger: ReactElement;
  /** Placement relative to trigger */
  placement?: PopoverPlacement;
  /** Popover body content */
  children: ReactNode;
  /** Additional className on the wrapper */
  className?: string;
}

/**
 * Anchored popover panel with Glass L1 styling.
 * Closes on Escape and outside click. Uses `var(--ease-spring)` entry animation.
 */
export function Popover({
  isOpen,
  onClose,
  trigger,
  placement = 'bottom-start',
  children,
  className,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleKeyDown, handleClickOutside]);

  const wrapperClasses = ['ds-popover', className ?? ''].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={wrapperClasses}>
      <div className="ds-popover__trigger">{trigger}</div>
      {isOpen && (
        <div
          className={`ds-popover__content ds-popover__content--${placement}`}
          role="dialog"
          aria-modal="false"
        >
          {children}
        </div>
      )}
    </div>
  );
}
```

Create `frontend/src/design-system/components/Popover.css`:

```css
/* Design System: Popover */

.ds-popover {
  position: relative;
  display: inline-flex;
}

.ds-popover__trigger {
  display: inline-flex;
}

.ds-popover__content {
  position: absolute;
  z-index: 1000;
  min-width: 180px;
  padding: var(--space-3, 12px);
  border-radius: var(--space-2, 8px);
  background: var(--glass-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.25));
  box-shadow: var(--glass-l1-shadow, 0 2px 16px rgba(0, 0, 0, 0.04));
  animation: ds-popover-in var(--duration-fast, 150ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}

/* Placement classes */
.ds-popover__content--top          { bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: var(--space-2, 8px); }
.ds-popover__content--top-start    { bottom: 100%; left: 0; margin-bottom: var(--space-2, 8px); }
.ds-popover__content--top-end      { bottom: 100%; right: 0; margin-bottom: var(--space-2, 8px); }
.ds-popover__content--bottom       { top: 100%; left: 50%; transform: translateX(-50%); margin-top: var(--space-2, 8px); }
.ds-popover__content--bottom-start { top: 100%; left: 0; margin-top: var(--space-2, 8px); }
.ds-popover__content--bottom-end   { top: 100%; right: 0; margin-top: var(--space-2, 8px); }
.ds-popover__content--left         { right: 100%; top: 50%; transform: translateY(-50%); margin-right: var(--space-2, 8px); }
.ds-popover__content--right        { left: 100%; top: 50%; transform: translateY(-50%); margin-left: var(--space-2, 8px); }

@keyframes ds-popover-in {
  from { opacity: 0; scale: 0.95; }
  to   { opacity: 1; scale: 1; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Popover.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Popover.tsx frontend/src/design-system/components/Popover.css frontend/src/design-system/components/__tests__/Popover.test.tsx
git commit -m "feat(phase103): add Popover DS component with Glass L1 styling and Escape close"
```

---

### Task 18: Dropdown component

**Files:**
- Create: `frontend/src/design-system/components/Dropdown.tsx`
- Create: `frontend/src/design-system/components/Dropdown.css`
- Test: `frontend/src/design-system/components/__tests__/Dropdown.test.tsx`

- [ ] **Step 1: Write the failing test for Dropdown**

```typescript
// frontend/src/design-system/components/__tests__/Dropdown.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropdown } from '../Dropdown';

const items = [
  { id: 'edit', label: 'Bearbeiten' },
  { id: 'copy', label: 'Kopieren' },
  { id: 'delete', label: 'Loeschen', danger: true },
];

describe('Dropdown', () => {
  it('does not show menu initially', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows menu when trigger is clicked', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Aktionen'));
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('renders all menu items with menuitem role', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Aktionen'));
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).toHaveLength(3);
    expect(menuItems[0].textContent).toBe('Bearbeiten');
  });

  it('calls onSelect with item id when clicked', () => {
    const onSelect = vi.fn();
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Aktionen'));
    fireEvent.click(screen.getByText('Kopieren'));
    expect(onSelect).toHaveBeenCalledWith('copy');
  });

  it('closes menu after selection', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Aktionen'));
    fireEvent.click(screen.getByText('Bearbeiten'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes menu on Escape', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Aktionen'));
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('navigates items with arrow keys', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Aktionen'));
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const firstItem = screen.getAllByRole('menuitem')[0];
    expect(document.activeElement).toBe(firstItem);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[1]);
  });

  it('marks danger items', () => {
    render(<Dropdown trigger={<button>Aktionen</button>} items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Aktionen'));
    const deleteItem = screen.getByText('Loeschen');
    expect(deleteItem.closest('.ds-dropdown__item--danger')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Dropdown.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Dropdown component**

Create `frontend/src/design-system/components/Dropdown.tsx`:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactElement, ReactNode, KeyboardEvent } from 'react';
import './Dropdown.css';

export interface DropdownItem {
  /** Unique identifier returned to onSelect */
  id: string;
  /** Display label */
  label: string;
  /** Optional leading icon */
  icon?: ReactNode;
  /** Render in danger color */
  danger?: boolean;
  /** Disable this item */
  disabled?: boolean;
}

export interface DropdownProps {
  /** Trigger element that opens the menu */
  trigger: ReactElement;
  /** Menu items */
  items: DropdownItem[];
  /** Called with item id when an item is selected */
  onSelect: (id: string) => void;
  /** Alignment of the menu relative to trigger */
  align?: 'start' | 'end';
  /** Additional className on the wrapper */
  className?: string;
}

/**
 * Dropdown menu with keyboard navigation (Arrow keys, Enter, Escape).
 * Uses Glass L1 styling with `var(--ease-spring)` entry animation.
 */
export function Dropdown({
  trigger,
  items,
  onSelect,
  align = 'start',
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusIndex(-1);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      close();
    },
    [onSelect, close]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(focusIndex + 1, items.length - 1);
        setFocusIndex(next);
        itemRefs.current[next]?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(focusIndex - 1, 0);
        setFocusIndex(prev);
        itemRefs.current[prev]?.focus();
      }
      if (e.key === 'Enter' && focusIndex >= 0) {
        e.preventDefault();
        const item = items[focusIndex];
        if (item && !item.disabled) handleSelect(item.id);
      }
    },
    [focusIndex, items, handleSelect, close]
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, close]);

  // Focus menu on open
  useEffect(() => {
    if (isOpen && menuRef.current) {
      menuRef.current.focus();
    }
  }, [isOpen]);

  const wrapperClasses = ['ds-dropdown', className ?? ''].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={wrapperClasses}>
      <div
        className="ds-dropdown__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>
      {isOpen && (
        <div
          ref={menuRef}
          className={`ds-dropdown__menu ds-dropdown__menu--${align}`}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              className={[
                'ds-dropdown__item',
                item.danger ? 'ds-dropdown__item--danger' : '',
                item.disabled ? 'ds-dropdown__item--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="menuitem"
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => !item.disabled && handleSelect(item.id)}
            >
              {item.icon && <span className="ds-dropdown__item-icon" aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `frontend/src/design-system/components/Dropdown.css`:

```css
/* Design System: Dropdown */

.ds-dropdown {
  position: relative;
  display: inline-flex;
}

.ds-dropdown__trigger {
  display: inline-flex;
  cursor: pointer;
}

.ds-dropdown__menu {
  position: absolute;
  z-index: 1000;
  top: 100%;
  min-width: 180px;
  margin-top: var(--space-1, 4px);
  padding: var(--space-1, 4px);
  border-radius: var(--space-2, 8px);
  background: var(--glass-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.25));
  box-shadow: var(--glass-l1-shadow, 0 2px 16px rgba(0, 0, 0, 0.04));
  animation: ds-dropdown-in var(--duration-fast, 150ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  outline: none;
}

.ds-dropdown__menu--start { left: 0; }
.ds-dropdown__menu--end { right: 0; }

.ds-dropdown__item {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  width: 100%;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: none;
  border-radius: 6px;
  background: none;
  font-size: var(--text-sm, 0.875rem);
  font-weight: var(--font-normal, 400);
  color: var(--text-primary, hsl(220, 15%, 15%));
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-instant, 80ms) var(--ease-default);
}

.ds-dropdown__item:hover,
.ds-dropdown__item:focus {
  background: var(--surface-2, hsl(220, 12%, 95%));
  outline: none;
}

.ds-dropdown__item--danger {
  color: var(--color-danger, hsl(0, 72%, 55%));
}

.ds-dropdown__item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.ds-dropdown__item-icon {
  display: flex;
  font-size: 16px;
  opacity: 0.7;
}

@keyframes ds-dropdown-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Dropdown.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Dropdown.tsx frontend/src/design-system/components/Dropdown.css frontend/src/design-system/components/__tests__/Dropdown.test.tsx
git commit -m "feat(phase103): add Dropdown DS component with keyboard nav and Glass L1 menu"
```

---

### Task 19: Dialog component

**Files:**
- Create: `frontend/src/design-system/components/Dialog.tsx`
- Create: `frontend/src/design-system/components/Dialog.css`
- Test: `frontend/src/design-system/components/__tests__/Dialog.test.tsx`

- [ ] **Step 1: Write the failing test for Dialog**

```typescript
// frontend/src/design-system/components/__tests__/Dialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '../Dialog';

describe('Dialog', () => {
  it('does not render when isOpen is false', () => {
    render(
      <Dialog isOpen={false} onClose={() => {}} title="Confirm">
        Body
      </Dialog>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders dialog with role and aria-modal when open', () => {
    render(
      <Dialog isOpen={true} onClose={() => {}} title="Confirm">
        Body
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders title in heading', () => {
    render(
      <Dialog isOpen={true} onClose={() => {}} title="Bestaetigen">
        Body
      </Dialog>
    );
    expect(screen.getByText('Bestaetigen')).toBeDefined();
  });

  it('renders children as body content', () => {
    render(
      <Dialog isOpen={true} onClose={() => {}} title="T">
        <p>Dialog Inhalt</p>
      </Dialog>
    );
    expect(screen.getByText('Dialog Inhalt')).toBeDefined();
  });

  it('renders footer when provided', () => {
    render(
      <Dialog isOpen={true} onClose={() => {}} title="T" footer={<button>OK</button>}>
        Body
      </Dialog>
    );
    expect(screen.getByText('OK')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={onClose} title="T">Body</Dialog>
    );
    fireEvent.click(screen.getByLabelText(/schlie/i));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={onClose} title="T">Body</Dialog>
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog isOpen={true} onClose={onClose} title="T">Body</Dialog>
    );
    const backdrop = container.querySelector('.ds-dialog__backdrop');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('supports size variants', () => {
    render(
      <Dialog isOpen={true} onClose={() => {}} title="T" size="lg">Body</Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('ds-dialog--lg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Dialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Dialog component**

Create `frontend/src/design-system/components/Dialog.tsx`:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './Dialog.css';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  className?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const classes = [
    'ds-dialog',
    `ds-dialog--${size}`,
    className ?? '',
  ].filter(Boolean).join(' ');

  return createPortal(
    <div className="ds-dialog__backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="ds-dialog__header">
          <h2 id="ds-dialog-title" className="ds-dialog__title">{title}</h2>
          <button
            className="ds-dialog__close"
            onClick={onClose}
            aria-label="Schliessen"
          >
            ×
          </button>
        </div>
        <div className="ds-dialog__body">{children}</div>
        {footer && <div className="ds-dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
```

Create `frontend/src/design-system/components/Dialog.css`:

```css
/* Design System: Dialog */

.ds-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: ds-dialog-backdrop-in var(--duration-fast, 150ms) ease;
}

.ds-dialog {
  position: relative;
  width: 90vw;
  border-radius: var(--space-3, 12px);
  background: var(--glass-bg, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(var(--glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.3));
  box-shadow: var(--glass-l2-shadow, 0 8px 32px rgba(0, 0, 0, 0.08));
  animation: ds-dialog-in var(--duration-smooth, 350ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  outline: none;
  overflow: hidden;
}

.ds-dialog--sm { max-width: 400px; }
.ds-dialog--md { max-width: 560px; }
.ds-dialog--lg { max-width: 720px; }

.ds-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4, 16px) var(--space-5, 20px);
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
}

.ds-dialog__title {
  margin: 0;
  font-size: var(--text-lg, 1.125rem);
  font-weight: var(--font-semibold, 600);
  color: var(--text-primary, hsl(220, 15%, 15%));
}

.ds-dialog__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: none;
  font-size: 20px;
  color: var(--text-secondary, hsl(220, 10%, 45%));
  cursor: pointer;
  transition: background var(--duration-instant, 80ms);
}

.ds-dialog__close:hover {
  background: var(--surface-2, hsl(220, 12%, 95%));
}

.ds-dialog__body {
  padding: var(--space-5, 20px);
  font-size: var(--text-base, 0.875rem);
  color: var(--text-primary, hsl(220, 15%, 15%));
}

.ds-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px) var(--space-5, 20px);
  border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
}

@keyframes ds-dialog-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes ds-dialog-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .ds-dialog,
  .ds-dialog__backdrop {
    animation: none;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/design-system/components/__tests__/Dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Run `tsc --noEmit` to verify no type regressions**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/design-system/components/Dialog.tsx frontend/src/design-system/components/Dialog.css frontend/src/design-system/components/__tests__/Dialog.test.tsx
git commit -m "feat(phase103): add Dialog DS component with focus trap, portal, and Glass L2 backdrop"
```

---

### Task 19b: Update barrel exports and verify Phase 103

> **IMPORTANT:** This task adds all 10 new components to the barrel export and runs a full verification. Without this, components are invisible to the rest of the codebase.

**Files:**
- Modify: `frontend/src/design-system/components/index.ts`

- [ ] **Step 1: Add 10 new component exports to barrel**

Append to `frontend/src/design-system/components/index.ts`:

```typescript
// Phase 103: New components

// Spinner
export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize } from './Spinner';

// Divider
export { Divider } from './Divider';
export type { DividerProps } from './Divider';

// Chip
export { Chip } from './Chip';
export type { ChipProps, ChipVariant, ChipSize } from './Chip';

// Switch
export { Switch } from './Switch';
export type { SwitchProps, SwitchSize } from './Switch';

// Progress
export { Progress } from './Progress';
export type { ProgressProps, ProgressVariant } from './Progress';

// Alert
export { Alert } from './Alert';
export type { AlertProps, AlertVariant } from './Alert';

// Tooltip
export { Tooltip } from './Tooltip';
export type { TooltipProps, TooltipPosition } from './Tooltip';

// Popover
export { Popover } from './Popover';
export type { PopoverProps, PopoverPosition } from './Popover';

// Dropdown
export { Dropdown } from './Dropdown';
export type { DropdownProps, DropdownItem, DropdownAlign } from './Dropdown';

// Dialog
export { Dialog } from './Dialog';
export type { DialogProps, DialogSize } from './Dialog';
```

- [ ] **Step 2: Run `tsc --noEmit` to verify all exports resolve**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass including all 10 new component test files

- [ ] **Step 4: Commit**

```bash
git add frontend/src/design-system/components/index.ts
git commit -m "feat(phase103): add 10 new components to DS barrel export

Spinner, Divider, Chip, Switch, Progress, Alert, Tooltip, Popover, Dropdown, Dialog.
All exported from design-system/components/index.ts for codebase consumption."
```

## Chunk 3: Phase 104 — Chat Hub MVP

**Goal:** Transform the app's start page from Dashboard to Chat Hub. The Chat Hub is a 3-layer layout: Smart Surface v2 (proactive cards) + Conversation Stream (existing GeneralChat) + Intent Bar (evolved ChatInput). A SlidePanel framework enables rich inline interactions. The route `/` points to ChatHub instead of Dashboard.

**Architecture:** ChatHub wraps the existing `GeneralChat` component — it does NOT rewrite chat logic. `SmartSurfaceV2` evolves `SmartSurface`. `IntentBar` evolves `ChatInput`. The same backend chat API is used throughout.

**Files:**

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/ChatHub/types.ts` | ChatHub-specific types |
| Create | `frontend/src/components/ChatHub/SmartSurfaceV2.tsx` | Max 3 proactive cards, spring entry, empty=hidden |
| Create | `frontend/src/components/ChatHub/SmartSurfaceV2.css` | Smart Surface v2 styles |
| Create | `frontend/src/components/ChatHub/IntentBar.tsx` | Universal input: text + voice + file + thinking mode |
| Create | `frontend/src/components/ChatHub/IntentBar.css` | Intent Bar styles |
| Create | `frontend/src/components/ChatHub/SuggestionChips.tsx` | 3-4 contextual chips when input empty+focused |
| Create | `frontend/src/components/ChatHub/SlidePanel.tsx` | 400px right panel framework with glass backdrop |
| Create | `frontend/src/components/ChatHub/SlidePanel.css` | Slide panel styles (desktop + mobile bottom sheet) |
| Create | `frontend/src/components/ChatHub/AdaptiveResult.tsx` | Renders AI response as typed surface (task card, code, table) |
| Create | `frontend/src/components/ChatHub/ChatHub.tsx` | Chat Hub page: Smart Surface + Conversation + Intent Bar |
| Create | `frontend/src/components/ChatHub/ChatHub.css` | Chat Hub layout styles |
| Create | `frontend/src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx` | SmartSurfaceV2 tests |
| Create | `frontend/src/components/ChatHub/__tests__/IntentBar.test.tsx` | IntentBar tests |
| Create | `frontend/src/components/ChatHub/__tests__/SlidePanel.test.tsx` | SlidePanel tests |
| Create | `frontend/src/components/ChatHub/__tests__/SuggestionChips.test.tsx` | SuggestionChips tests |
| Create | `frontend/src/components/ChatHub/__tests__/AdaptiveResult.test.tsx` | AdaptiveResult tests |
| Create | `frontend/src/components/ChatHub/__tests__/ChatHub.test.tsx` | ChatHub assembly tests |
| Modify | `frontend/src/components/ChatPage.tsx` | Delegate to ChatHub when used as start page |
| Modify | `frontend/src/App.tsx` | Route `/` to ChatHub instead of Dashboard |
| Modify | `frontend/src/routes/index.tsx` | Update PAGE_PATHS for `home` to ChatHub |
| Modify | `frontend/src/routes/LazyPages.tsx` | Add ChatHub lazy import |
| Modify | `frontend/src/hooks/queries/useDashboard.ts` | Export `useSmartSurfaceCards` hook for Smart Surface card data |

---

### Task 20: ChatHub types and SmartSurfaceV2

**Files:**
- Create: `frontend/src/components/ChatHub/types.ts`
- Create: `frontend/src/components/ChatHub/SmartSurfaceV2.tsx`
- Create: `frontend/src/components/ChatHub/SmartSurfaceV2.css`
- Test: `frontend/src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx`

- [ ] **Step 1: Write failing tests for SmartSurfaceV2**

```typescript
// frontend/src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartSurfaceV2 } from '../SmartSurfaceV2';

// Mock the useSmartSuggestions hook
vi.mock('../../../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: vi.fn(),
  isMorningBriefingTime: vi.fn(() => false),
  getTimeOfDay: vi.fn(() => 'morning'),
  getDayOfWeek: vi.fn(() => 'monday'),
}));

import { useSmartSuggestions } from '../../../hooks/useSmartSuggestions';
const mockUseSmartSuggestions = vi.mocked(useSmartSuggestions);

const baseSuggestion = {
  userId: 'u1',
  metadata: {},
  priority: 1,
  status: 'active',
  snoozedUntil: null,
  dismissedAt: null,
  createdAt: new Date().toISOString(),
};

describe('SmartSurfaceV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there are no suggestions', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    const { container } = render(<SmartSurfaceV2 context="personal" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while loading (no skeleton, no placeholder)', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [],
      loading: true,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    const { container } = render(<SmartSurfaceV2 context="personal" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders max 3 cards with staggered animation delays', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: '1', type: 'task_reminder', title: 'Task 1', description: 'Do it' },
        { ...baseSuggestion, id: '2', type: 'email_followup', title: 'Email 1', description: 'Reply' },
        { ...baseSuggestion, id: '3', type: 'meeting_prep', title: 'Meeting', description: 'Prep' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);

    // Verify staggered animation delay (0ms, 100ms, 200ms)
    expect(cards[0].style.animationDelay).toBe('0ms');
    expect(cards[1].style.animationDelay).toBe('100ms');
    expect(cards[2].style.animationDelay).toBe('200ms');
  });

  it('has aria-live region for accessibility', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: '1', type: 'task_reminder', title: 'Task 1', description: 'Do it' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    const liveRegion = screen.getByRole('region');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-label', 'Proaktive Vorschlaege');
  });

  it('calls dismiss when dismiss button is clicked', () => {
    const dismissFn = vi.fn();
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: 'abc', type: 'task_reminder', title: 'Task', description: 'Do' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: dismissFn,
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    const dismissBtn = screen.getByLabelText('Verwerfen');
    fireEvent.click(dismissBtn);
    expect(dismissFn).toHaveBeenCalledWith('abc');
  });

  it('truncates to max 3 cards even when more suggestions exist', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: '1', type: 'a', title: 'A', description: '' },
        { ...baseSuggestion, id: '2', type: 'b', title: 'B', description: '' },
        { ...baseSuggestion, id: '3', type: 'c', title: 'C', description: '' },
        { ...baseSuggestion, id: '4', type: 'd', title: 'D', description: '' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create types file**

```typescript
// frontend/src/components/ChatHub/types.ts
/**
 * ChatHub-specific types — Phase 104
 */

import type { AIContext } from '../ContextSwitcher';

/** Props for the ChatHub page component */
export interface ChatHubProps {
  context: AIContext;
  onContextChange?: (context: AIContext) => void;
}

/** A Smart Surface card (extends SmartSuggestion with rendering hints) */
export interface SmartSurfaceCard {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  priority: number;
  /** Icon name from Lucide */
  icon?: string;
  /** Primary action label (e.g. "Reply", "Mark Done") */
  actionLabel?: string;
}

/** Suggestion chip shown when Intent Bar is empty + focused */
export interface SuggestionChip {
  id: string;
  label: string;
  /** The prompt text injected into the Intent Bar on click */
  prompt: string;
  /** Optional icon name from Lucide */
  icon?: string;
}

/** Content type for AdaptiveResult rendering */
export type AdaptiveResultType =
  | 'text'
  | 'task_card'
  | 'email_composer'
  | 'code_block'
  | 'table'
  | 'event_card'
  | 'agent_progress'
  | 'expandable_cards';

/** SlidePanel configuration */
export interface SlidePanelConfig {
  /** Unique ID for the panel instance */
  id: string;
  /** Panel title shown in header */
  title: string;
  /** Content type determines which child component renders */
  type: string;
  /** Arbitrary data passed to the panel content */
  data?: Record<string, unknown>;
}
```

- [ ] **Step 4: Implement SmartSurfaceV2**

```typescript
// frontend/src/components/ChatHub/SmartSurfaceV2.tsx
/**
 * SmartSurfaceV2 — Proactive, time-aware suggestion cards (Phase 104)
 *
 * Evolution of SmartSurface (Phase 69). Key differences:
 * - Glass L1 cards with spring entry animation
 * - Max 3 cards, empty = completely hidden (no "all caught up")
 * - Staggered animation: 0ms, 100ms, 200ms
 * - Horizontal scroll on mobile
 * - aria-live for screen readers
 */

import { useMemo } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useSmartSuggestions, isMorningBriefingTime } from '../../hooks/useSmartSuggestions';
import type { SmartSuggestion } from '../../hooks/useSmartSuggestions';
import { X, ChevronRight } from 'lucide-react';
import './SmartSurfaceV2.css';

const MAX_CARDS = 3;
const STAGGER_MS = 100;

interface SmartSurfaceV2Props {
  context: AIContext;
}

/** Map suggestion types to compact icon + color pairs */
function getCardMeta(type: string): { emoji: string; accentVar: string } {
  switch (type) {
    case 'morning_briefing': return { emoji: '\u2600\uFE0F', accentVar: 'var(--color-warning)' };
    case 'task_reminder': return { emoji: '\u2705', accentVar: 'var(--color-success)' };
    case 'email_followup': return { emoji: '\u2709\uFE0F', accentVar: 'var(--color-accent-2)' };
    case 'meeting_prep': return { emoji: '\uD83D\uDCC5', accentVar: 'var(--color-accent)' };
    case 'contradiction': return { emoji: '\u26A0\uFE0F', accentVar: 'var(--color-danger)' };
    case 'learning_suggestion': return { emoji: '\uD83D\uDCDA', accentVar: 'var(--ctx-learning)' };
    case 'pattern_detected': return { emoji: '\uD83D\uDD0D', accentVar: 'var(--color-accent)' };
    default: return { emoji: '\uD83D\uDCA1', accentVar: 'var(--color-accent)' };
  }
}

/** Build a synthetic morning briefing card */
function buildMorningBriefing(suggestions: SmartSuggestion[]): SmartSuggestion {
  let tasksDueToday = 0;
  let unreadEmails = 0;
  let upcomingEvents = 0;
  for (const s of suggestions) {
    if (s.type === 'task_reminder') tasksDueToday++;
    if (s.type === 'email_followup') unreadEmails++;
    if (s.type === 'meeting_prep') upcomingEvents++;
  }
  const dayOfWeek = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date().getDay()];
  const dateStr = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  return {
    id: '__morning_briefing__',
    userId: '',
    type: 'morning_briefing',
    title: 'Guten Morgen',
    description: `${dayOfWeek}, ${dateStr} \u2014 ${tasksDueToday} Aufgaben, ${unreadEmails} E-Mails, ${upcomingEvents} Termine`,
    metadata: { tasksDueToday, unreadEmails, upcomingEvents },
    priority: 999,
    status: 'active',
    snoozedUntil: null,
    dismissedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function SmartSurfaceV2({ context }: SmartSurfaceV2Props) {
  const { suggestions, loading, dismiss, accept } = useSmartSuggestions(context);

  const cards = useMemo(() => {
    const showBriefing = isMorningBriefingTime();
    let result = [...suggestions];

    if (showBriefing && !result.some(s => s.type === 'morning_briefing')) {
      result = [buildMorningBriefing(suggestions), ...result];
    }

    return result.slice(0, MAX_CARDS);
  }, [suggestions]);

  // Empty = hidden. No skeleton, no placeholder. Calm technology.
  if (loading || cards.length === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    if (id === '__morning_briefing__') return;
    dismiss(id);
  };

  const handleAccept = (id: string) => {
    if (id === '__morning_briefing__') return;
    accept(id);
  };

  return (
    <section
      className="smart-surface-v2"
      role="region"
      aria-live="polite"
      aria-label="Proaktive Vorschlaege"
    >
      <div className="smart-surface-v2__track">
        {cards.map((card, i) => {
          const { emoji, accentVar } = getCardMeta(card.type);
          return (
            <article
              key={card.id}
              className="smart-surface-v2__card"
              style={{
                animationDelay: `${i * STAGGER_MS}ms`,
                '--card-accent': accentVar,
              } as React.CSSProperties}
            >
              <div className="smart-surface-v2__card-icon">{emoji}</div>
              <div className="smart-surface-v2__card-body">
                <h3 className="smart-surface-v2__card-title">{card.title}</h3>
                {card.description && (
                  <p className="smart-surface-v2__card-desc">{card.description}</p>
                )}
              </div>
              <div className="smart-surface-v2__card-actions">
                <button
                  className="smart-surface-v2__action smart-surface-v2__action--accept"
                  onClick={() => handleAccept(card.id)}
                  aria-label="Aktion ausfuehren"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className="smart-surface-v2__action smart-surface-v2__action--dismiss"
                  onClick={() => handleDismiss(card.id)}
                  aria-label="Verwerfen"
                >
                  <X size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement SmartSurfaceV2 styles**

```css
/* frontend/src/components/ChatHub/SmartSurfaceV2.css */

/* ===== SmartSurfaceV2 — Phase 104 ===== */

.smart-surface-v2 {
  padding: var(--space-3) var(--space-4);
  overflow: visible;
}

.smart-surface-v2__track {
  display: flex;
  gap: var(--space-3);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: var(--space-1);
}

.smart-surface-v2__track::-webkit-scrollbar {
  display: none;
}

.smart-surface-v2__card {
  flex: 1 1 0;
  min-width: 220px;
  max-width: 340px;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: var(--glass-l1-shadow);
  scroll-snap-align: start;
  animation: ssv2-enter var(--duration-smooth) var(--ease-spring) both;
  cursor: default;
  transition: transform var(--duration-fast) var(--ease-default),
              box-shadow var(--duration-fast) var(--ease-default);
}

.smart-surface-v2__card:hover {
  transform: translateY(-2px);
  box-shadow: var(--glass-l2-shadow);
}

.smart-surface-v2__card:active {
  transform: var(--haptic-press);
}

@keyframes ssv2-enter {
  from {
    opacity: 0;
    transform: translateY(-12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.smart-surface-v2__card-icon {
  font-size: var(--text-xl);
  line-height: 1;
  flex-shrink: 0;
}

.smart-surface-v2__card-body {
  flex: 1;
  min-width: 0;
}

.smart-surface-v2__card-title {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-1) 0;
}

.smart-surface-v2__card-desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  line-height: var(--leading-normal);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.smart-surface-v2__card-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex-shrink: 0;
}

.smart-surface-v2__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-default);
  color: var(--text-tertiary);
  background: transparent;
}

.smart-surface-v2__action:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.smart-surface-v2__action--accept {
  color: var(--card-accent, var(--color-accent));
}

.smart-surface-v2__action--accept:hover {
  background: var(--color-accent-glow);
  color: var(--color-accent);
}

/* ===== Mobile: horizontal scroll, fixed card width ===== */
@media (max-width: 768px) {
  .smart-surface-v2 {
    padding: var(--space-2) var(--space-3);
  }

  .smart-surface-v2__card {
    flex: 0 0 260px;
  }
}

/* ===== Reduced motion ===== */
@media (prefers-reduced-motion: reduce) {
  .smart-surface-v2__card {
    animation: none;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatHub/types.ts frontend/src/components/ChatHub/SmartSurfaceV2.tsx frontend/src/components/ChatHub/SmartSurfaceV2.css frontend/src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx
git commit -m "feat(phase104): add SmartSurfaceV2 with glassmorphism cards and spring animations

Max 3 proactive cards, staggered entry, empty=hidden (calm technology).
Horizontal scroll on mobile. aria-live for accessibility."
```

---

### Task 21: IntentBar component

**Files:**
- Create: `frontend/src/components/ChatHub/IntentBar.tsx`
- Create: `frontend/src/components/ChatHub/IntentBar.css`
- Test: `frontend/src/components/ChatHub/__tests__/IntentBar.test.tsx`

- [ ] **Step 1: Write failing tests for IntentBar**

```typescript
// frontend/src/components/ChatHub/__tests__/IntentBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentBar } from '../IntentBar';

describe('IntentBar', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onFocusChange: vi.fn(),
    sending: false,
    thinkingMode: 'assist' as const,
    onThinkingModeChange: vi.fn(),
    context: 'personal' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a textarea with placeholder', () => {
    render(<IntentBar {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/frag mich|gib mir/i);
    expect(textarea).toBeInTheDocument();
  });

  it('calls onChange when typing', () => {
    render(<IntentBar {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(defaultProps.onChange).toHaveBeenCalledWith('Hello');
  });

  it('calls onSend when send button is clicked', () => {
    render(<IntentBar {...defaultProps} value="Hello" />);
    const sendBtn = screen.getByLabelText('Nachricht senden');
    fireEvent.click(sendBtn);
    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it('disables send button when value is empty', () => {
    render(<IntentBar {...defaultProps} value="" />);
    const sendBtn = screen.getByLabelText('Nachricht senden');
    expect(sendBtn).toBeDisabled();
  });

  it('disables send button when sending is true', () => {
    render(<IntentBar {...defaultProps} value="Hello" sending={true} />);
    const sendBtn = screen.getByLabelText('Nachricht senden');
    expect(sendBtn).toBeDisabled();
  });

  it('sends on Enter key (without Shift)', () => {
    render(<IntentBar {...defaultProps} value="Hello" />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it('does NOT send on Shift+Enter (allows newline)', () => {
    render(<IntentBar {...defaultProps} value="Hello" />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('renders thinking mode toggle with three options', () => {
    render(<IntentBar {...defaultProps} />);
    expect(screen.getByLabelText(/schnell/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gruendlich/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tief/i)).toBeInTheDocument();
  });

  it('calls onFocusChange when textarea gains/loses focus', () => {
    render(<IntentBar {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);
    expect(defaultProps.onFocusChange).toHaveBeenCalledWith(true);
    fireEvent.blur(textarea);
    expect(defaultProps.onFocusChange).toHaveBeenCalledWith(false);
  });

  it('has accessible send button with aria-label', () => {
    render(<IntentBar {...defaultProps} />);
    expect(screen.getByLabelText('Nachricht senden')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/IntentBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement IntentBar**

```typescript
// frontend/src/components/ChatHub/IntentBar.tsx
/**
 * IntentBar — Universal input for the Chat Hub (Phase 104)
 *
 * Evolution of ChatInput. Same backend API, new presentation layer.
 * Features: text input, voice button, file drop zone, thinking mode toggle.
 * Suggestion chips are rendered externally via SuggestionChips component.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { Send, Mic, Paperclip } from 'lucide-react';
import './IntentBar.css';

export type ThinkingDepth = 'fast' | 'thorough' | 'deep';

interface IntentBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onFocusChange: (focused: boolean) => void;
  sending: boolean;
  thinkingMode: ThinkingDepth | 'assist' | 'challenge' | 'coach' | 'synthesize';
  onThinkingModeChange: (mode: ThinkingDepth) => void;
  context: AIContext;
  onVoiceClick?: () => void;
  onFileClick?: () => void;
  /** Reference to the textarea for external focus control */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

const THINKING_MODES = [
  { value: 'fast' as const, label: 'Schnell', ariaLabel: 'Schnell' },
  { value: 'thorough' as const, label: 'Gruendlich', ariaLabel: 'Gruendlich' },
  { value: 'deep' as const, label: 'Tief', ariaLabel: 'Tief' },
] as const;

/** Map old thinking modes to new depth scale */
function resolveDepth(mode: string): ThinkingDepth {
  if (mode === 'fast' || mode === 'assist') return 'fast';
  if (mode === 'thorough' || mode === 'challenge' || mode === 'coach') return 'thorough';
  if (mode === 'deep' || mode === 'synthesize') return 'deep';
  return 'thorough';
}

export function IntentBar({
  value,
  onChange,
  onSend,
  onFocusChange,
  sending,
  thinkingMode,
  onThinkingModeChange,
  context: _context,
  onVoiceClick,
  onFileClick,
  textareaRef: externalRef,
}: IntentBarProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  const currentDepth = resolveDepth(thinkingMode);
  const canSend = value.trim().length > 0 && !sending;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, textareaRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) onSend();
      }
    },
    [canSend, onSend]
  );

  return (
    <div className="intent-bar">
      <div className="intent-bar__input-row">
        {/* Voice button */}
        <button
          className="intent-bar__icon-btn"
          onClick={onVoiceClick}
          aria-label="Spracheingabe"
          type="button"
        >
          <Mic size={18} />
        </button>

        {/* File attach button */}
        <button
          className="intent-bar__icon-btn"
          onClick={onFileClick}
          aria-label="Datei anhaengen"
          type="button"
        >
          <Paperclip size={18} />
        </button>

        {/* Main textarea */}
        <textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          className="intent-bar__textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="Frag mich etwas oder gib mir eine Aufgabe..."
          rows={1}
          aria-label="Nachricht eingeben"
        />

        {/* Send button */}
        <button
          className="intent-bar__send-btn"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Nachricht senden"
          type="button"
        >
          <Send size={18} />
        </button>
      </div>

      {/* Thinking depth toggle */}
      <div className="intent-bar__toolbar" role="radiogroup" aria-label="Denktiefe">
        {THINKING_MODES.map(({ value: mode, label, ariaLabel }) => (
          <button
            key={mode}
            role="radio"
            aria-checked={currentDepth === mode}
            aria-label={ariaLabel}
            className={`intent-bar__depth-btn ${currentDepth === mode ? 'intent-bar__depth-btn--active' : ''}`}
            onClick={() => onThinkingModeChange(mode)}
            type="button"
          >
            <span className="intent-bar__depth-dot" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement IntentBar styles**

```css
/* frontend/src/components/ChatHub/IntentBar.css */

/* ===== IntentBar — Phase 104 ===== */

.intent-bar {
  padding: var(--space-3) var(--space-4);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-top: 1px solid var(--glass-border);
  border-radius: 16px 16px 0 0;
}

.intent-bar__input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  background: var(--surface-1);
  border: 1px solid var(--surface-3);
  border-radius: 14px;
  padding: var(--space-2) var(--space-3);
  transition: border-color var(--duration-fast) var(--ease-default),
              box-shadow var(--duration-fast) var(--ease-default);
}

.intent-bar__input-row:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-glow);
}

.intent-bar__textarea {
  flex: 1;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-primary);
  resize: none;
  outline: none;
  min-height: 24px;
  max-height: 200px;
}

.intent-bar__textarea::placeholder {
  color: var(--text-tertiary);
}

.intent-bar__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-default),
              color var(--duration-instant) var(--ease-default);
}

.intent-bar__icon-btn:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.intent-bar__send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: 12px;
  background: var(--color-accent);
  color: white;
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-default),
              transform var(--duration-instant) var(--ease-default);
}

.intent-bar__send-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.intent-bar__send-btn:active:not(:disabled) {
  transform: var(--haptic-press);
}

.intent-bar__send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ===== Thinking depth toggle ===== */
.intent-bar__toolbar {
  display: flex;
  gap: var(--space-2);
  padding-top: var(--space-2);
}

.intent-bar__depth-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: 20px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: color var(--duration-instant) var(--ease-default),
              background var(--duration-instant) var(--ease-default);
}

.intent-bar__depth-btn:hover {
  color: var(--text-secondary);
  background: var(--surface-2);
}

.intent-bar__depth-btn--active {
  color: var(--color-accent);
  background: var(--color-accent-glow);
}

.intent-bar__depth-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid currentColor;
  transition: background var(--duration-instant) var(--ease-default);
}

.intent-bar__depth-btn--active .intent-bar__depth-dot {
  background: currentColor;
}

/* ===== SuggestionChips (sits above IntentBar) ===== */
.suggestion-chips {
  display: flex;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-2);
  margin: 0;
  list-style: none;
  overflow-x: auto;
  scrollbar-width: none;
}

.suggestion-chips::-webkit-scrollbar {
  display: none;
}

.suggestion-chips__item {
  flex-shrink: 0;
}

.suggestion-chips__chip {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--surface-3);
  border-radius: 20px;
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  white-space: nowrap;
  animation: chip-enter var(--duration-smooth) var(--ease-spring) both;
  transition: background var(--duration-instant) var(--ease-default),
              border-color var(--duration-instant) var(--ease-default),
              color var(--duration-instant) var(--ease-default);
}

.suggestion-chips__chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-accent-glow);
}

.suggestion-chips__chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@keyframes chip-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===== Mobile ===== */
@media (max-width: 768px) {
  .intent-bar {
    padding: var(--space-2) var(--space-3);
    border-radius: 0;
  }

  .intent-bar__icon-btn {
    min-width: 44px;
    min-height: 44px;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/IntentBar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatHub/IntentBar.tsx frontend/src/components/ChatHub/IntentBar.css frontend/src/components/ChatHub/__tests__/IntentBar.test.tsx
git commit -m "feat(phase104): add IntentBar with thinking depth toggle and voice/file buttons

Universal input evolution of ChatInput. Send on Enter, Shift+Enter for newline.
Auto-resize textarea. 44px touch targets on mobile."
```

---

### Task 22: SlidePanel framework

**Files:**
- Create: `frontend/src/components/ChatHub/SlidePanel.tsx`
- Create: `frontend/src/components/ChatHub/SlidePanel.css`
- Test: `frontend/src/components/ChatHub/__tests__/SlidePanel.test.tsx`

- [ ] **Step 1: Write failing tests for SlidePanel**

```typescript
// frontend/src/components/ChatHub/__tests__/SlidePanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlidePanel } from '../SlidePanel';

describe('SlidePanel', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: 'Test Panel',
    children: <div>Panel Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when open', () => {
    render(<SlidePanel {...defaultProps} />);
    expect(screen.getByText('Panel Content')).toBeInTheDocument();
  });

  it('renders title in header', () => {
    render(<SlidePanel {...defaultProps} />);
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(<SlidePanel {...defaultProps} open={false} />);
    expect(container.querySelector('.slide-panel--open')).toBeNull();
  });

  it('calls onClose when close button is clicked', () => {
    render(<SlidePanel {...defaultProps} />);
    const closeBtn = screen.getByLabelText('Panel schliessen');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<SlidePanel {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when glass backdrop is clicked', () => {
    render(<SlidePanel {...defaultProps} />);
    const backdrop = screen.getByTestId('slide-panel-backdrop');
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('has role=dialog and aria-label', () => {
    render(<SlidePanel {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Test Panel');
  });

  it('traps focus when open (has tabIndex on panel)', () => {
    render(<SlidePanel {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('tabIndex', '-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/SlidePanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SlidePanel**

```typescript
// frontend/src/components/ChatHub/SlidePanel.tsx
/**
 * SlidePanel — 400px right-side panel framework (Phase 104)
 *
 * Desktop: slides in from right, 400px wide, glass backdrop over chat
 * Mobile: full-screen bottom sheet (85vh)
 * Closes on: X button, Escape, backdrop click
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './SlidePanel.css';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SlidePanel({ open, onClose, title, children }: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Focus the panel when opened
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  return (
    <div className={`slide-panel-wrapper ${open ? 'slide-panel--open' : ''}`}>
      {/* Glass backdrop */}
      {open && (
        <div
          className="slide-panel__backdrop"
          data-testid="slide-panel-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className="slide-panel"
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
      >
        <header className="slide-panel__header">
          <h2 className="slide-panel__title">{title}</h2>
          <button
            className="slide-panel__close"
            onClick={onClose}
            aria-label="Panel schliessen"
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <div className="slide-panel__content">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement SlidePanel styles**

```css
/* frontend/src/components/ChatHub/SlidePanel.css */

/* ===== SlidePanel — Phase 104 ===== */

.slide-panel-wrapper {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  display: flex;
  justify-content: flex-end;
}

.slide-panel--open {
  pointer-events: auto;
}

.slide-panel__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: sp-fade-in var(--duration-base) var(--ease-default);
}

@keyframes sp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.slide-panel {
  position: relative;
  width: 400px;
  max-width: 100%;
  height: 100%;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-left: 1px solid var(--glass-border);
  box-shadow: var(--glass-l2-shadow);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--duration-smooth) var(--ease-spring);
}

.slide-panel--open .slide-panel {
  transform: translateX(0);
}

.slide-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--surface-3);
  flex-shrink: 0;
}

.slide-panel__title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
}

.slide-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-default),
              color var(--duration-instant) var(--ease-default);
}

.slide-panel__close:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.slide-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

/* ===== Mobile: bottom sheet ===== */
@media (max-width: 768px) {
  .slide-panel-wrapper {
    flex-direction: column;
    justify-content: flex-end;
  }

  .slide-panel {
    width: 100%;
    height: 85vh;
    border-left: none;
    border-top: 1px solid var(--glass-border);
    border-radius: 16px 16px 0 0;
    transform: translateY(100%);
  }

  .slide-panel--open .slide-panel {
    transform: translateY(0);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/SlidePanel.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatHub/SlidePanel.tsx frontend/src/components/ChatHub/SlidePanel.css frontend/src/components/ChatHub/__tests__/SlidePanel.test.tsx
git commit -m "feat(phase104): add SlidePanel framework with glass backdrop

400px right panel on desktop, full-screen bottom sheet on mobile.
Closes on Escape, backdrop click, or X button. Focus trap via tabIndex."
```

---

### Task 23: SuggestionChips component

**Files:**
- Create: `frontend/src/components/ChatHub/SuggestionChips.tsx`
- Test: `frontend/src/components/ChatHub/__tests__/SuggestionChips.test.tsx`

- [ ] **Step 1: Write failing tests for SuggestionChips**

```typescript
// frontend/src/components/ChatHub/__tests__/SuggestionChips.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionChips } from '../SuggestionChips';

describe('SuggestionChips', () => {
  const chips = [
    { id: '1', label: 'Was steht heute an?', prompt: 'Was steht heute auf meinem Terminplan?' },
    { id: '2', label: 'Ungelesene E-Mails', prompt: 'Zeige mir meine ungelesenen E-Mails' },
    { id: '3', label: 'Letzte Idee fortsetzen', prompt: 'Lass uns an meiner letzten Idee weiterarbeiten' },
  ];

  const defaultProps = {
    chips,
    visible: true,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chips when visible', () => {
    render(<SuggestionChips {...defaultProps} />);
    expect(screen.getByText('Was steht heute an?')).toBeInTheDocument();
    expect(screen.getByText('Ungelesene E-Mails')).toBeInTheDocument();
    expect(screen.getByText('Letzte Idee fortsetzen')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    const { container } = render(<SuggestionChips {...defaultProps} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelect with prompt when chip is clicked', () => {
    render(<SuggestionChips {...defaultProps} />);
    fireEvent.click(screen.getByText('Ungelesene E-Mails'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Zeige mir meine ungelesenen E-Mails');
  });

  it('supports keyboard navigation with arrow keys', () => {
    render(<SuggestionChips {...defaultProps} />);
    const firstChip = screen.getByText('Was steht heute an?');
    firstChip.focus();
    fireEvent.keyDown(firstChip, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('Ungelesene E-Mails'));
  });

  it('wraps keyboard navigation from last to first', () => {
    render(<SuggestionChips {...defaultProps} />);
    const lastChip = screen.getByText('Letzte Idee fortsetzen');
    lastChip.focus();
    fireEvent.keyDown(lastChip, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('Was steht heute an?'));
  });

  it('selects chip on Enter key', () => {
    render(<SuggestionChips {...defaultProps} />);
    const chip = screen.getByText('Was steht heute an?');
    chip.focus();
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Was steht heute auf meinem Terminplan?');
  });

  it('has accessible list role', () => {
    render(<SuggestionChips {...defaultProps} />);
    expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Vorschlaege');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/SuggestionChips.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SuggestionChips**

```typescript
// frontend/src/components/ChatHub/SuggestionChips.tsx
/**
 * SuggestionChips — Contextual suggestions shown when IntentBar is empty + focused (Phase 104)
 *
 * 3-4 chips, keyboard navigable (ArrowLeft/ArrowRight, Enter to select).
 * Spring entry animation, staggered. Styles in IntentBar.css.
 */

import { useCallback, useRef } from 'react';
import type { SuggestionChip } from './types';

interface SuggestionChipsProps {
  chips: SuggestionChip[];
  visible: boolean;
  onSelect: (prompt: string) => void;
}

export function SuggestionChips({ chips, visible, onSelect }: SuggestionChipsProps) {
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex = index;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (index + 1) % chips.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (index - 1 + chips.length) % chips.length;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(chips[index].prompt);
        return;
      } else {
        return;
      }

      chipRefs.current[nextIndex]?.focus();
    },
    [chips, onSelect]
  );

  if (!visible || chips.length === 0) {
    return null;
  }

  return (
    <ul className="suggestion-chips" role="list" aria-label="Vorschlaege">
      {chips.map((chip, i) => (
        <li key={chip.id} className="suggestion-chips__item" role="listitem">
          <button
            ref={(el) => { chipRefs.current[i] = el; }}
            className="suggestion-chips__chip"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => onSelect(chip.prompt)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            tabIndex={i === 0 ? 0 : -1}
            type="button"
          >
            {chip.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

SuggestionChips styles are already included in `IntentBar.css` (the `.suggestion-chips` block added in Task 21 Step 4). They sit directly above the IntentBar visually.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/SuggestionChips.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatHub/SuggestionChips.tsx frontend/src/components/ChatHub/__tests__/SuggestionChips.test.tsx
git commit -m "feat(phase104): add SuggestionChips with keyboard navigation

3-4 contextual chips when input is empty+focused. ArrowLeft/ArrowRight
navigation with wrap-around. Spring entry animation."
```

---

### Task 24: AdaptiveResult component

**Files:**
- Create: `frontend/src/components/ChatHub/AdaptiveResult.tsx`
- Test: `frontend/src/components/ChatHub/__tests__/AdaptiveResult.test.tsx`

- [ ] **Step 1: Write failing tests for AdaptiveResult**

```typescript
// frontend/src/components/ChatHub/__tests__/AdaptiveResult.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdaptiveResult } from '../AdaptiveResult';

describe('AdaptiveResult', () => {
  it('renders text content as paragraph', () => {
    render(<AdaptiveResult type="text" content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders task_card with checkbox and title', () => {
    render(
      <AdaptiveResult
        type="task_card"
        content="Prepare presentation"
        metadata={{ due: 'Tomorrow', priority: 'high' }}
      />
    );
    expect(screen.getByText('Prepare presentation')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders code_block with language label and copy button', () => {
    render(
      <AdaptiveResult
        type="code_block"
        content="console.log('hello')"
        metadata={{ language: 'javascript' }}
      />
    );
    expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByLabelText('Code kopieren')).toBeInTheDocument();
  });

  it('renders event_card with date and time', () => {
    render(
      <AdaptiveResult
        type="event_card"
        content="Meeting with Sarah"
        metadata={{ date: 'Friday', time: '14:00' }}
      />
    );
    expect(screen.getByText('Meeting with Sarah')).toBeInTheDocument();
    expect(screen.getByText(/Friday/)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
  });

  it('falls back to text rendering for unknown types', () => {
    // @ts-expect-error Testing unknown type fallback
    render(<AdaptiveResult type="unknown_type" content="Fallback text" />);
    expect(screen.getByText('Fallback text')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/AdaptiveResult.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AdaptiveResult**

```typescript
// frontend/src/components/ChatHub/AdaptiveResult.tsx
/**
 * AdaptiveResult — Renders AI response as a typed surface (Phase 104)
 *
 * Instead of rendering all AI responses as plain text bubbles,
 * AdaptiveResult matches content type and renders appropriate UI:
 * task cards, code blocks, event cards, tables, etc.
 *
 * This is the MVP version. Additional types (email_composer, agent_progress,
 * table, expandable_cards) will be added in later phases.
 */

import { useCallback, useState } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import type { AdaptiveResultType } from './types';

interface AdaptiveResultProps {
  type: AdaptiveResultType;
  content: string;
  metadata?: Record<string, unknown>;
}

function TextResult({ content }: { content: string }) {
  return <div className="adaptive-result adaptive-result--text"><p>{content}</p></div>;
}

function TaskCardResult({ content, metadata }: { content: string; metadata?: Record<string, unknown> }) {
  const [done, setDone] = useState(false);
  return (
    <div className={`adaptive-result adaptive-result--task ${done ? 'adaptive-result--task-done' : ''}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={() => setDone(!done)}
        aria-label={`Aufgabe erledigt: ${content}`}
      />
      <div className="adaptive-result__task-body">
        <span className={`adaptive-result__task-title ${done ? 'adaptive-result__task-title--done' : ''}`}>
          {content}
        </span>
        {metadata?.due && (
          <span className="adaptive-result__task-due">{String(metadata.due)}</span>
        )}
      </div>
      {metadata?.priority === 'high' && (
        <span className="adaptive-result__task-priority" aria-label="Hohe Prioritaet">!</span>
      )}
    </div>
  );
}

function CodeBlockResult({ content, metadata }: { content: string; metadata?: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const language = String(metadata?.language ?? '');

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className="adaptive-result adaptive-result--code">
      <div className="adaptive-result__code-header">
        <span className="adaptive-result__code-lang">{language}</span>
        <button
          className="adaptive-result__code-copy"
          onClick={handleCopy}
          aria-label="Code kopieren"
          type="button"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="adaptive-result__code-content"><code>{content}</code></pre>
    </div>
  );
}

function EventCardResult({ content, metadata }: { content: string; metadata?: Record<string, unknown> }) {
  return (
    <div className="adaptive-result adaptive-result--event">
      <Calendar size={18} className="adaptive-result__event-icon" />
      <div className="adaptive-result__event-body">
        <span className="adaptive-result__event-title">{content}</span>
        <span className="adaptive-result__event-time">
          {metadata?.date ? String(metadata.date) : ''} {metadata?.time ? String(metadata.time) : ''}
        </span>
      </div>
    </div>
  );
}

export function AdaptiveResult({ type, content, metadata }: AdaptiveResultProps) {
  switch (type) {
    case 'task_card':
      return <TaskCardResult content={content} metadata={metadata} />;
    case 'code_block':
      return <CodeBlockResult content={content} metadata={metadata} />;
    case 'event_card':
      return <EventCardResult content={content} metadata={metadata} />;
    case 'text':
    default:
      return <TextResult content={content} />;
  }
}
```

AdaptiveResult styles are included in `ChatHub.css` (created in Task 25). The component itself needs no separate CSS file since it renders inline within the conversation stream.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/AdaptiveResult.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatHub/AdaptiveResult.tsx frontend/src/components/ChatHub/__tests__/AdaptiveResult.test.tsx
git commit -m "feat(phase104): add AdaptiveResult for typed AI response surfaces

MVP renders: text, task_card (with checkbox), code_block (with copy),
event_card (with date/time). Falls back to text for unknown types."
```

---

### Task 25: ChatHub assembly and routing

**Files:**
- Create: `frontend/src/components/ChatHub/ChatHub.tsx`
- Create: `frontend/src/components/ChatHub/ChatHub.css`
- Test: `frontend/src/components/ChatHub/__tests__/ChatHub.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/index.tsx`
- Modify: `frontend/src/routes/LazyPages.tsx`
- Modify: `frontend/src/components/ChatPage.tsx`
- Modify: `frontend/src/hooks/queries/useDashboard.ts`

- [ ] **Step 1: Write failing tests for ChatHub**

```typescript
// frontend/src/components/ChatHub/__tests__/ChatHub.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatHub } from '../ChatHub';

// Mock GeneralChat (heavyweight, lazy-loaded)
vi.mock('../../GeneralChat', () => ({
  GeneralChat: (props: Record<string, unknown>) => (
    <div data-testid="general-chat" data-context={props.context}>GeneralChat Mock</div>
  ),
}));

// Mock SmartSurfaceV2
vi.mock('../SmartSurfaceV2', () => ({
  SmartSurfaceV2: (props: Record<string, unknown>) => (
    <div data-testid="smart-surface-v2" data-context={props.context}>SmartSurfaceV2 Mock</div>
  ),
}));

// Mock useSmartSuggestions
vi.mock('../../../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: vi.fn(() => ({
    suggestions: [],
    loading: false,
    timeOfDay: 'morning',
    dismiss: vi.fn(),
    snooze: vi.fn(),
    accept: vi.fn(),
    refresh: vi.fn(),
  })),
  isMorningBriefingTime: vi.fn(() => false),
  getTimeOfDay: vi.fn(() => 'morning'),
  getDayOfWeek: vi.fn(() => 'monday'),
}));

describe('ChatHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 3-layer layout: SmartSurface + chat + IntentBar', () => {
    render(<ChatHub context="personal" />);

    // SmartSurfaceV2 is rendered
    expect(screen.getByTestId('smart-surface-v2')).toBeInTheDocument();

    // GeneralChat is rendered (the conversation stream)
    expect(screen.getByTestId('general-chat')).toBeInTheDocument();

    // IntentBar textarea is rendered
    expect(screen.getByPlaceholderText(/frag mich|gib mir/i)).toBeInTheDocument();
  });

  it('passes context to child components', () => {
    render(<ChatHub context="work" />);
    expect(screen.getByTestId('smart-surface-v2')).toHaveAttribute('data-context', 'work');
    expect(screen.getByTestId('general-chat')).toHaveAttribute('data-context', 'work');
  });

  it('has a main landmark for the hub', () => {
    render(<ChatHub context="personal" />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Chat Hub');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/ChatHub.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ChatHub page component**

```typescript
// frontend/src/components/ChatHub/ChatHub.tsx
/**
 * ChatHub — The start page (Phase 104)
 *
 * 3-layer layout:
 * 1. SmartSurfaceV2 (proactive cards, max 3, hidden when empty)
 * 2. Conversation Stream (wraps existing GeneralChat)
 * 3. IntentBar (universal input with thinking depth toggle)
 *
 * Wraps GeneralChat internals — does NOT rewrite chat logic.
 * Same backend chat API, new presentation shell.
 */

import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import type { ChatHubProps, SuggestionChip, SlidePanelConfig } from './types';
import type { AIContext } from '../ContextSwitcher';
import { SmartSurfaceV2 } from './SmartSurfaceV2';
import { IntentBar, type ThinkingDepth } from './IntentBar';
import { SuggestionChips } from './SuggestionChips';
import { SlidePanel } from './SlidePanel';
import { SkeletonLoader } from '../SkeletonLoader';
import { ErrorBoundary } from '../ErrorBoundary';
import { getTimeOfDay } from '../../hooks/useSmartSuggestions';
import './ChatHub.css';

const GeneralChat = lazy(() => import('../GeneralChat').then(m => ({ default: m.GeneralChat })));

/** Build time-aware suggestion chips */
function buildSuggestionChips(timeOfDay: string, _context: AIContext): SuggestionChip[] {
  const chips: SuggestionChip[] = [];

  if (timeOfDay === 'morning') {
    chips.push({ id: 'today', label: 'Was steht heute an?', prompt: 'Was steht heute auf meinem Terminplan?' });
  }

  chips.push({ id: 'emails', label: 'Ungelesene E-Mails', prompt: 'Zeige mir meine ungelesenen E-Mails' });
  chips.push({ id: 'continue', label: 'Letzte Idee fortsetzen', prompt: 'Lass uns an meiner letzten Idee weiterarbeiten' });

  if (timeOfDay === 'afternoon' || timeOfDay === 'evening') {
    chips.push({ id: 'summary', label: 'Tages-Zusammenfassung', prompt: 'Fasse meinen heutigen Tag zusammen' });
  }

  return chips.slice(0, 4);
}

export function ChatHub({ context, onContextChange: _onContextChange }: ChatHubProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>('thorough');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [slidePanel, setSlidePanel] = useState<SlidePanelConfig | null>(null);

  const timeOfDay = useMemo(() => getTimeOfDay(), []);
  const suggestionChips = useMemo(() => buildSuggestionChips(timeOfDay, context), [timeOfDay, context]);

  const showChips = inputFocused && inputValue.trim() === '';

  const handleSend = useCallback(() => {
    // IntentBar delegates to GeneralChat's existing send mechanism.
    // We dispatch a custom event that GeneralChat listens for,
    // same pattern as ChatQuickActions.
    if (!inputValue.trim()) return;
    window.dispatchEvent(
      new CustomEvent('zenai-chat-hub-send', { detail: { prompt: inputValue.trim() } })
    );
    setInputValue('');
  }, [inputValue]);

  const handleChipSelect = useCallback((prompt: string) => {
    setInputValue(prompt);
    // Focus the textarea after chip selection
    setTimeout(() => {
      const textarea = document.querySelector('.intent-bar__textarea') as HTMLTextAreaElement;
      textarea?.focus();
    }, 50);
  }, []);

  const handleSessionChange = useCallback((sessionId: string | null) => {
    setActiveSessionId(sessionId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSlidePanel(null);
  }, []);

  return (
    <main className="chat-hub" role="main" aria-label="Chat Hub">
      {/* Layer 1: Smart Surface */}
      <SmartSurfaceV2 context={context} />

      {/* Layer 2: Conversation Stream */}
      <div className="chat-hub__conversation">
        <ErrorBoundary>
          <Suspense fallback={<SkeletonLoader type="card" count={3} />}>
            <GeneralChat
              context={context}
              isCompact={false}
              fullPage={true}
              initialSessionId={activeSessionId}
              onSessionChange={handleSessionChange}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Layer 3: Suggestion Chips + Intent Bar */}
      <div className="chat-hub__input-area">
        <SuggestionChips
          chips={suggestionChips}
          visible={showChips}
          onSelect={handleChipSelect}
        />
        <IntentBar
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onFocusChange={setInputFocused}
          sending={false}
          thinkingMode={thinkingDepth}
          onThinkingModeChange={setThinkingDepth}
          context={context}
        />
      </div>

      {/* Slide Panel (opened by adaptive results or commands) */}
      {slidePanel && (
        <SlidePanel
          open={true}
          onClose={handleClosePanel}
          title={slidePanel.title}
        >
          <div>Panel content for: {slidePanel.type}</div>
        </SlidePanel>
      )}
    </main>
  );
}

export default ChatHub;
```

- [ ] **Step 4: Create ChatHub styles**

```css
/* frontend/src/components/ChatHub/ChatHub.css */

/* ===== ChatHub — Phase 104 ===== */

.chat-hub {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-bg);
}

/* Layer 2: Conversation fills available space */
.chat-hub__conversation {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* Layer 3: Input area pinned to bottom */
.chat-hub__input-area {
  flex-shrink: 0;
  background: var(--surface-bg);
}

/* ===== AdaptiveResult inline styles ===== */

.adaptive-result {
  border-radius: 12px;
  padding: var(--space-3) var(--space-4);
  margin: var(--space-2) 0;
}

.adaptive-result--text p {
  margin: 0;
  line-height: var(--leading-normal);
  color: var(--text-primary);
}

.adaptive-result--task {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-success-light);
  border: 1px solid var(--color-success);
}

.adaptive-result--task-done {
  opacity: 0.6;
}

.adaptive-result--task input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: var(--color-success);
  cursor: pointer;
}

.adaptive-result__task-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.adaptive-result__task-title {
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.adaptive-result__task-title--done {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.adaptive-result__task-due {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.adaptive-result__task-priority {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-danger-light);
  color: var(--color-danger);
  font-weight: var(--font-bold);
  font-size: var(--text-sm);
}

.adaptive-result--code {
  background: var(--surface-1);
  border: 1px solid var(--surface-3);
  padding: 0;
  overflow: hidden;
}

.adaptive-result__code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-2);
  border-bottom: 1px solid var(--surface-3);
}

.adaptive-result__code-lang {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  text-transform: lowercase;
}

.adaptive-result__code-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.adaptive-result__code-copy:hover {
  background: var(--surface-3);
  color: var(--text-primary);
}

.adaptive-result__code-content {
  padding: var(--space-3) var(--space-4);
  margin: 0;
  overflow-x: auto;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--text-primary);
}

.adaptive-result--event {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
}

.adaptive-result__event-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

.adaptive-result__event-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.adaptive-result__event-title {
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.adaptive-result__event-time {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

/* ===== Mobile ===== */
@media (max-width: 768px) {
  .chat-hub__input-area {
    position: sticky;
    bottom: 0;
    z-index: 10;
  }
}
```

- [ ] **Step 5: Update routing to point `/` to ChatHub**

Modify `frontend/src/routes/LazyPages.tsx` — add ChatHub lazy import:

```typescript
// Add alongside existing lazy imports:
export const ChatHub = lazy(() => import('../components/ChatHub/ChatHub'));
```

Modify `frontend/src/App.tsx` — in the page-rendering switch/case, change the `'home'` case to render `ChatHub` instead of `Dashboard`. Add the import at the top alongside other lazy pages:

```typescript
// Add to imports from LazyPages:
import {
  Dashboard, ChatPage, ChatHub, BrowserPage, /* ...rest unchanged */
} from './routes/LazyPages';

// Then in the switch/case where pages are rendered, change:
//   case 'home':
//     return <Dashboard context={context} ... />;
// to:
//   case 'home':
//     return <ChatHub context={context} onContextChange={setContext} />;
```

The `PAGE_PATHS` in `frontend/src/routes/index.tsx` already maps `'home'` to `'/'`. No change needed there — the mapping is correct. The change is purely in the component that renders for `'home'`.

Modify `frontend/src/components/ChatPage.tsx` — add a clarifying comment at the top:

```typescript
/**
 * ChatPage — Full-page chat with session sidebar (Phase 104: preserved for /chat route)
 *
 * The primary entry point is now ChatHub (at /). ChatPage remains accessible
 * at /chat for users who prefer the sidebar-based session management UX.
 */
```

Modify `frontend/src/hooks/queries/useDashboard.ts` — export a convenience hook for Smart Surface card data. Add at the bottom:

```typescript
/**
 * Smart Surface card data — combines upcoming events + overdue tasks for ChatHub.
 * Used by SmartSurfaceV2 to augment suggestion cards with structured data.
 */
export function useSmartSurfaceCards(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.summary(context), 'smart-surface'],
    queryFn: async ({ signal }) => {
      const [eventsRes, statsRes] = await Promise.all([
        axios.get(`/api/${context}/calendar/upcoming`, { signal, params: { hours: 24, limit: 2 } }).catch(() => ({ data: { data: [] } })),
        axios.get(`/api/${context}/ideas/stats/summary`, { signal }).catch(() => ({ data: { data: {} } })),
      ]);
      return {
        upcomingEvents: (eventsRes.data?.data ?? []) as UpcomingEvent[],
        stats: {
          total: statsRes.data?.data?.total ?? 0,
          highPriority: statsRes.data?.data?.highPriority ?? statsRes.data?.data?.high_priority ?? 0,
        },
      };
    },
    enabled,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ChatHub/__tests__/ChatHub.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatHub/ChatHub.tsx frontend/src/components/ChatHub/ChatHub.css frontend/src/components/ChatHub/__tests__/ChatHub.test.tsx frontend/src/routes/LazyPages.tsx frontend/src/App.tsx frontend/src/components/ChatPage.tsx frontend/src/hooks/queries/useDashboard.ts
git commit -m "feat(phase104): add ChatHub as start page with 3-layer layout

ChatHub wraps GeneralChat with SmartSurfaceV2 + IntentBar + SuggestionChips.
Route / now renders ChatHub instead of Dashboard. Dashboard still accessible
via /insights/analytics. SlidePanel framework ready for future panel types."
```

---

### Task 26: Phase 104 verification

- [ ] **Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All existing tests pass + 6 new test files pass (SmartSurfaceV2, IntentBar, SlidePanel, SuggestionChips, AdaptiveResult, ChatHub)

- [ ] **Step 2: Run TypeScript type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds. ChatHub is code-split (lazy loaded).

- [ ] **Step 4: Run backend tests (regression check)**

Run: `cd backend && npm test`
Expected: All 4933+ tests pass (no backend changes in Phase 104)

- [ ] **Step 5: Verify file structure**

Run: `ls -la frontend/src/components/ChatHub/`
Expected:
```
ChatHub.tsx
ChatHub.css
IntentBar.tsx
IntentBar.css
SmartSurfaceV2.tsx
SmartSurfaceV2.css
SlidePanel.tsx
SlidePanel.css
SuggestionChips.tsx
AdaptiveResult.tsx
types.ts
__tests__/
  ChatHub.test.tsx
  SmartSurfaceV2.test.tsx
  IntentBar.test.tsx
  SlidePanel.test.tsx
  SuggestionChips.test.tsx
  AdaptiveResult.test.tsx
```

- [ ] **Step 6: Commit phase completion marker**

```bash
git commit --allow-empty -m "milestone(phase104): Chat Hub MVP complete

3-layer layout: SmartSurfaceV2 + GeneralChat + IntentBar.
Route / now renders ChatHub. Dashboard preserved at /insights/analytics.
SlidePanel framework (400px desktop, bottom sheet mobile).
SuggestionChips with keyboard navigation.
AdaptiveResult MVP: text, task_card, code_block, event_card.
6 test files, all passing. Zero regressions."
```

## Chunk 4: Phase 105 — Navigation Scaffolding

> **Goal:** Rewrite the navigation from 17 items with 4 sections to a flat 7+1 list. Each nav item points to an EXISTING page as intermediary until the Smart Page for that slot is built in Phases 106-110. All old URLs get legacy redirects. Zero dead links.

---

### Task 30: Rewrite navigation.ts to 7+1 structure

**Files:**
- Rewrite: `frontend/src/navigation.ts`
- Create: `frontend/src/components/layout/__tests__/navigation.test.ts`

- [ ] **Step 1: Write the failing test for new navigation exports**

```typescript
// frontend/src/components/layout/__tests__/navigation.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  NAV_ITEMS,
  NAV_HUB_ITEM,
  ALL_NAVIGABLE_ITEMS,
  isNavItemActive,
  getPageLabel,
  getNavItemByPage,
} from '../../../navigation';

describe('Navigation 7+1 Structure (Phase 105)', () => {
  it('exports exactly 7 nav items (excluding hub)', () => {
    expect(NAV_ITEMS).toHaveLength(7);
  });

  it('exports hub item pointing to chat hub', () => {
    expect(NAV_HUB_ITEM).toBeDefined();
    expect(NAV_HUB_ITEM.page).toBe('hub');
    expect(NAV_HUB_ITEM.icon).toBe('MessageSquare');
  });

  it('has correct 7 items in order: Ideen, Planer, Inbox, Wissen, Cockpit, Meine KI, System', () => {
    const labels = NAV_ITEMS.map(i => i.label);
    expect(labels).toEqual([
      'Ideen',
      'Planer',
      'Inbox',
      'Wissen',
      'Cockpit',
      'Meine KI',
      'System',
    ]);
  });

  it('each nav item has a page, icon, and label', () => {
    for (const item of NAV_ITEMS) {
      expect(item.page).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.label).toBeTruthy();
    }
  });

  it('nav items point to existing intermediary pages', () => {
    const pages = NAV_ITEMS.map(i => i.page);
    // These are existing pages that serve as intermediaries until Smart Pages land.
    // NOTE: Cockpit → business is intentional. Per spec, Cockpit merges Business +
    // Finance + Insights. The existing BusinessDashboard is the closest intermediary.
    // The full Cockpit Smart Page (Phase 109) will unify all three.
    expect(pages).toEqual([
      'ideas',      // Ideen -> existing /ideas
      'calendar',   // Planer -> existing /calendar
      'email',      // Inbox -> existing /email
      'documents',  // Wissen -> existing /documents
      'business',   // Cockpit -> existing /business (intermediary for Business+Finance+Insights)
      'my-ai',      // Meine KI -> existing /my-ai
      'settings',   // System -> existing /settings
    ]);
  });

  it('ALL_NAVIGABLE_ITEMS includes hub + 7 items = 8 total', () => {
    expect(ALL_NAVIGABLE_ITEMS).toHaveLength(8);
    expect(ALL_NAVIGABLE_ITEMS[0].page).toBe('hub');
  });

  it('isNavItemActive matches subPages', () => {
    const planer = NAV_ITEMS.find(i => i.label === 'Planer')!;
    expect(isNavItemActive(planer, 'calendar')).toBe(true);
    expect(isNavItemActive(planer, 'tasks')).toBe(true);
    expect(isNavItemActive(planer, 'contacts')).toBe(true);
    expect(isNavItemActive(planer, 'ideas')).toBe(false);
  });

  it('getPageLabel returns correct labels for new structure', () => {
    expect(getPageLabel('hub')).toBe('Chat Hub');
    expect(getPageLabel('ideas')).toBe('Ideen');
    expect(getPageLabel('calendar')).toBe('Planer');
    expect(getPageLabel('email')).toBe('Inbox');
    expect(getPageLabel('documents')).toBe('Wissen');
    expect(getPageLabel('business')).toBe('Cockpit');
    expect(getPageLabel('my-ai')).toBe('Meine KI');
    expect(getPageLabel('settings')).toBe('System');
  });

  it('getNavItemByPage finds items for subPages too', () => {
    const item = getNavItemByPage('contacts');
    expect(item).toBeDefined();
    expect(item!.label).toBe('Planer');
  });

  it('getPageLabel returns parent label for sub-pages', () => {
    expect(getPageLabel('tasks')).toBe('Planer');
    expect(getPageLabel('canvas')).toBe('Wissen');
    expect(getPageLabel('finance')).toBe('Cockpit');
    expect(getPageLabel('voice-chat')).toBe('Meine KI');
    expect(getPageLabel('system-admin')).toBe('System');
  });

  it('does NOT export NAV_SECTIONS (removed)', async () => {
    // Dynamic import works in ESM/Vitest — use it to check removed exports
    const nav = await import('../../../navigation');
    expect((nav as Record<string, unknown>).NAV_SECTIONS).toBeUndefined();
  });

  it('does NOT export NAV_BROWSER_ITEM (removed)', async () => {
    const nav = await import('../../../navigation');
    expect((nav as Record<string, unknown>).NAV_BROWSER_ITEM).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/navigation.test.ts`
Expected: FAIL — `NAV_ITEMS` is undefined, `NAV_SECTIONS` still exported

- [ ] **Step 3: Implement new navigation.ts**

Rewrite `frontend/src/navigation.ts`. The key changes:
- Remove `NAV_SECTIONS`, `NAV_FOOTER_ITEMS`, `NAV_CHAT_ITEM`, `NAV_BROWSER_ITEM`, `NavSection` interface
- Add `NAV_HUB_ITEM` (page: `'hub'`, icon: `'MessageSquare'`, label: `'Chat Hub'`)
- Add `NAV_ITEMS` array with 7 items (flat, no sections)
- Each item's `page` points to an EXISTING page type as intermediary
- Each item has `subPages` listing all page types that should highlight it (from the Complete Page Type Migration Map in the spec)
- Replace `findSectionForPage` with `findNavItemForPage`
- `ALL_NAVIGABLE_ITEMS` = `[NAV_HUB_ITEM, ...NAV_ITEMS]`

```typescript
// frontend/src/navigation.ts
/**
 * Central Navigation Configuration — Phase 105 (Zenith)
 *
 * 7+1 flat structure: Chat Hub + 7 Smart Page slots.
 * Each nav item points to an EXISTING page as intermediary.
 * Smart Pages (Phases 106-110) will replace intermediaries.
 *
 * Used by Sidebar, MobileSidebarDrawer, MobileBottomBar, TopBar, and CommandPalette.
 */

import type { Page } from './types';

export interface NavItem {
  page: Page;
  /** Lucide icon name (e.g. 'MessageSquare', 'Lightbulb') */
  icon: string;
  label: string;
  description?: string;
  /** Badge type - resolved to actual count at render time */
  badge?: 'notifications' | 'email_unread';
  /** Sub-pages that should highlight this nav item as active */
  subPages?: Page[];
}

/**
 * Chat Hub — start page, displayed prominently above nav items
 */
export const NAV_HUB_ITEM: NavItem = {
  page: 'hub',
  icon: 'MessageSquare',
  label: 'Chat Hub',
  description: 'Frag mich alles oder gib mir eine Aufgabe',
};

/**
 * 7 Smart Page nav items — flat list, no sections.
 * Each `page` value is an existing Page type that renders the current
 * intermediary component until its Smart Page is built (Phases 106-110).
 *
 * subPages are derived from the Complete Page Type Migration Map (spec Section 3).
 */
export const NAV_ITEMS: NavItem[] = [
  {
    page: 'ideas',
    icon: 'Lightbulb',
    label: 'Ideen',
    description: 'Ideen sammeln, entwickeln & priorisieren',
    subPages: ['incubator', 'archive', 'triage', 'workshop', 'proactive', 'evolution', 'agent-teams', 'ai-workshop'],
  },
  {
    page: 'calendar',
    icon: 'Calendar',
    label: 'Planer',
    description: 'Kalender, Aufgaben, Kontakte & Projekte',
    subPages: ['tasks', 'kanban', 'gantt', 'meetings', 'contacts', 'learning-tasks'],
  },
  {
    page: 'email',
    icon: 'Mail',
    label: 'Inbox',
    description: 'E-Mails, Benachrichtigungen & KI-Hinweise',
    badge: 'email_unread',
    subPages: ['notifications'],
  },
  {
    page: 'documents',
    icon: 'FileText',
    label: 'Wissen',
    description: 'Dokumente, Canvas, Knowledge Graph & Lernen',
    subPages: ['canvas', 'media', 'knowledge-graph', 'learning', 'stories'],
  },
  {
    page: 'business',
    icon: 'BarChart3',
    label: 'Cockpit',
    description: 'Business, Finanzen & Trends',
    subPages: ['finance', 'insights', 'analytics', 'digest', 'graphrag'],
  },
  {
    page: 'my-ai',
    icon: 'Brain',
    label: 'Meine KI',
    description: 'Persona, Gedaechtnis & Sprach-Chat',
    subPages: ['voice-chat', 'memory-insights', 'digital-twin', 'procedural-memory', 'personalization'],
  },
  {
    page: 'settings',
    icon: 'Settings',
    label: 'System',
    description: 'Einstellungen, Admin & Integrationen',
    subPages: ['profile', 'automations', 'integrations', 'mcp-servers', 'export', 'sync', 'system-admin'],
  },
];

// ===========================================
// Derived data for consumers
// ===========================================

/** All navigable items: Hub + 7 Smart Pages */
export const ALL_NAVIGABLE_ITEMS: NavItem[] = [NAV_HUB_ITEM, ...NAV_ITEMS];

/**
 * Check if a page is active (including sub-pages)
 */
export function isNavItemActive(item: NavItem, currentPage: Page): boolean {
  if (currentPage === item.page) return true;
  return item.subPages?.includes(currentPage) ?? false;
}

/**
 * Find the nav item that contains a given page (as primary or subPage).
 * For hub/home/chat/dashboard/browser/screen-memory/agent-teams → returns NAV_HUB_ITEM.
 */
export function findNavItemForPage(page: Page): NavItem | undefined {
  const hubPages: Page[] = ['hub', 'home', 'chat', 'dashboard', 'browser', 'screen-memory', 'agent-teams'];
  if (hubPages.includes(page)) return NAV_HUB_ITEM;
  return NAV_ITEMS.find(item => item.page === page || item.subPages?.includes(page));
}

/**
 * Get page label for display (e.g. in TopBar)
 */
export function getPageLabel(page: Page): string {
  const item = findNavItemForPage(page);
  return item?.label ?? 'ZenAI';
}

/**
 * Find NavItem by page identifier (searches hub + all items + subPages)
 */
export function getNavItemByPage(page: Page): NavItem | undefined {
  return findNavItemForPage(page);
}

/**
 * Get page description for display (e.g. in TopBar subtitle)
 */
export function getPageDescription(page: Page): string | undefined {
  const item = findNavItemForPage(page);
  return item?.description;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/navigation.test.ts`
Expected: PASS

- [ ] **Step 5: Fix imports in consuming files (compilation check)**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -40`

Many files import `NAV_SECTIONS`, `NAV_FOOTER_ITEMS`, `NAV_CHAT_ITEM`, `NAV_BROWSER_ITEM`, `NavSection`, or `findSectionForPage` from `navigation.ts`. These must be updated. The key files to fix:
- `Sidebar.tsx` — updated in Task 33
- `MobileSidebarDrawer.tsx` — updated in Task 34
- `AppLayout.tsx` — if it imports nav items, update to new exports
- Any other file that references removed exports

For now, add temporary re-exports at the bottom of `navigation.ts` to avoid breaking everything before Tasks 33-36 are complete:

```typescript
// ── Temporary backward-compat aliases (remove after Tasks 33-36) ──
/** @deprecated Use NAV_ITEMS instead */
export const NAV_FOOTER_ITEMS: NavItem[] = [];
/** @deprecated Use NAV_HUB_ITEM instead */
export const NAV_CHAT_ITEM: NavItem = NAV_HUB_ITEM;
/** @deprecated Browser removed in Phase 105 */
export const NAV_BROWSER_ITEM: NavItem = NAV_HUB_ITEM;
/** @deprecated Use findNavItemForPage instead */
export function findSectionForPage(_page: Page) { return undefined; }
```

These temporary aliases will be removed when Sidebar/Drawer/etc. are updated in subsequent tasks.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (temporary aliases keep existing code compiling)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/navigation.ts frontend/src/components/layout/__tests__/navigation.test.ts
git commit -m "feat(phase105): rewrite navigation.ts to 7+1 flat structure

Chat Hub + 7 Smart Page slots: Ideen, Planer, Inbox, Wissen, Cockpit, Meine KI, System.
Each item points to existing page as intermediary until Smart Pages land.
Temporary backward-compat aliases for NAV_FOOTER_ITEMS, NAV_CHAT_ITEM, NAV_BROWSER_ITEM."
```

---

### Task 31: Update types/idea.ts with 'hub' page type

**Files:**
- Modify: `frontend/src/types/idea.ts`

- [ ] **Step 1: Add 'hub' page type and reorganize with deprecation comments**

Edit `frontend/src/types/idea.ts`. Changes:
- Add `'hub'` to the Page union type as the first entry
- Reorganize into 4 groups: Smart Pages, Active sub-pages, Sub-tabs, Legacy redirect-only
- Add `/** @deprecated Phase 105 */` JSDoc comments on legacy redirect-only types
- Keep ALL existing types — every one is still referenced by existing components or routes

```typescript
/**
 * Page Types — Phase 105 (Zenith Navigation)
 *
 * 7+1 Smart Pages + legacy types for backward compat.
 * Smart Pages are intermediaries pointing to existing components.
 * Phases 106-110 replace intermediaries with consolidated Smart Page components.
 *
 * Legacy types are kept for:
 * 1. Redirect support (old URLs still work)
 * 2. Existing component references (gradual migration)
 */
export type Page =
  // ── Smart Pages (7+1) ──────────────────────────────
  | 'hub'            // Chat Hub (start page, Phase 104)
  | 'ideas'          // Ideen (intermediary: IdeasPage)
  | 'calendar'       // Planer (intermediary: PlannerPage)
  | 'email'          // Inbox (intermediary: EmailPage)
  | 'documents'      // Wissen (intermediary: DocumentVaultPage)
  | 'business'       // Cockpit (intermediary: BusinessDashboard)
  | 'my-ai'          // Meine KI (intermediary: MyAIPage)
  | 'settings'       // System (intermediary: SettingsDashboard)

  // ── Active sub-pages (rendered within parent Smart Page) ──
  | 'contacts'       // Within Planer
  | 'finance'        // Within Cockpit
  | 'insights'       // Within Cockpit
  | 'learning'       // Within Wissen
  | 'notifications'  // Within Inbox
  | 'screen-memory'  // Accessible via Chat Hub intent
  | 'memory-insights' // Within Meine KI

  // ── Sub-tabs (URL routing within Smart Pages) ─────
  | 'tasks' | 'kanban' | 'gantt' | 'meetings'
  | 'canvas' | 'media'
  | 'analytics' | 'digest' | 'knowledge-graph' | 'graphrag'
  | 'voice-chat' | 'procedural-memory' | 'digital-twin'
  | 'system-admin'

  // ── Legacy redirect-only types ────────────────────
  // @deprecated Phase 105 — kept for redirect support, remove in Phase 110
  | 'home'           // → hub
  | 'chat'           // → hub
  | 'browser'        // → hub (intent: "Open URL...")
  | 'workshop'       // → ideas (AI Panel)
  | 'incubator'      // → ideas (filter chip)
  | 'archive'        // → ideas (filter chip)
  | 'triage'         // → ideas (quick-actions)
  | 'proactive'      // → ideas (AI Panel tab)
  | 'evolution'      // → ideas (AI Panel tab)
  | 'agent-teams'    // → hub (intent + result panel)
  | 'learning-tasks' // → calendar (tasks with learning tag)
  | 'personalization'// → my-ai (Persona tab)
  | 'stories'        // → deprecated (unused)
  | 'dashboard'      // → hub
  | 'ai-workshop'    // → ideas
  | 'mcp-servers'    // → settings (Integrations tab)
  | 'automations'    // → settings
  | 'integrations'   // → settings
  | 'export'         // → settings
  | 'sync'           // → settings
  | 'profile';       // → settings
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (all existing code still references valid Page types — nothing was removed)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/idea.ts
git commit -m "feat(phase105): add 'hub' page type, reorganize Page union with deprecation comments

Smart Pages group (7+1), active sub-pages, sub-tabs, and legacy redirect-only types.
All existing types preserved for backward compatibility."
```

---

### Task 32: Rewrite routes/index.tsx with new mappings and legacy redirects

**Files:**
- Rewrite: `frontend/src/routes/index.tsx`
- Create: `frontend/src/components/layout/__tests__/routes.test.ts`

- [ ] **Step 1: Write the failing test for new route mappings**

```typescript
// frontend/src/components/layout/__tests__/routes.test.ts
import { describe, it, expect } from 'vitest';
import { PAGE_PATHS, PATH_PAGES, LEGACY_REDIRECTS, resolvePathToPage } from '../../../routes';

describe('Route Mappings (Phase 105)', () => {
  it('hub maps to /', () => {
    expect(PAGE_PATHS['hub']).toBe('/');
    expect(PATH_PAGES['/']).toBe('hub');
  });

  it('home and chat also map to / (merged into hub)', () => {
    expect(PAGE_PATHS['home']).toBe('/');
    expect(PAGE_PATHS['chat']).toBe('/');
  });

  it('7 Smart Pages have correct German slug paths', () => {
    expect(PAGE_PATHS['ideas']).toBe('/ideen');
    expect(PAGE_PATHS['calendar']).toBe('/planer');
    expect(PAGE_PATHS['email']).toBe('/inbox');
    expect(PAGE_PATHS['documents']).toBe('/wissen');
    expect(PAGE_PATHS['business']).toBe('/cockpit');
    expect(PAGE_PATHS['my-ai']).toBe('/meine-ki');
    expect(PAGE_PATHS['settings']).toBe('/system');
  });

  it('PATH_PAGES reverse map for all 7+1 primary routes', () => {
    expect(PATH_PAGES['/ideen']).toBe('ideas');
    expect(PATH_PAGES['/planer']).toBe('calendar');
    expect(PATH_PAGES['/inbox']).toBe('email');
    expect(PATH_PAGES['/wissen']).toBe('documents');
    expect(PATH_PAGES['/cockpit']).toBe('business');
    expect(PATH_PAGES['/meine-ki']).toBe('my-ai');
    expect(PATH_PAGES['/system']).toBe('settings');
  });

  it('legacy redirects include all old primary paths', () => {
    const fromPaths = LEGACY_REDIRECTS.map(r => r.from);
    // Old primary routes that changed to German slugs
    expect(fromPaths).toContain('/chat');
    expect(fromPaths).toContain('/ideas');
    expect(fromPaths).toContain('/calendar');
    expect(fromPaths).toContain('/email');
    expect(fromPaths).toContain('/documents');
    expect(fromPaths).toContain('/business');
    expect(fromPaths).toContain('/my-ai');
    expect(fromPaths).toContain('/settings');
  });

  it('legacy redirects include old standalone pages', () => {
    const fromPaths = LEGACY_REDIRECTS.map(r => r.from);
    expect(fromPaths).toContain('/browser');
    expect(fromPaths).toContain('/workshop');
    expect(fromPaths).toContain('/contacts');
    expect(fromPaths).toContain('/finance');
    expect(fromPaths).toContain('/insights');
    expect(fromPaths).toContain('/learning');
    expect(fromPaths).toContain('/screen-memory');
    expect(fromPaths).toContain('/notifications');
    expect(fromPaths).toContain('/admin');
  });

  it('legacy redirects include old double-legacy paths', () => {
    const fromPaths = LEGACY_REDIRECTS.map(r => r.from);
    expect(fromPaths).toContain('/incubator');
    expect(fromPaths).toContain('/ai-workshop');
    expect(fromPaths).toContain('/personalization');
    expect(fromPaths).toContain('/voice-chat');
    expect(fromPaths).toContain('/agent-teams');
    expect(fromPaths).toContain('/dashboard');
    expect(fromPaths).toContain('/analytics');
    expect(fromPaths).toContain('/digest');
    expect(fromPaths).toContain('/knowledge-graph');
    expect(fromPaths).toContain('/learning-tasks');
  });

  it('legacy redirects point to correct new locations', () => {
    const map = Object.fromEntries(LEGACY_REDIRECTS.map(r => [r.from, r.to]));
    expect(map['/chat']).toBe('/');
    expect(map['/browser']).toBe('/');
    expect(map['/ideas']).toBe('/ideen');
    expect(map['/calendar']).toBe('/planer');
    expect(map['/email']).toBe('/inbox');
    expect(map['/contacts']).toBe('/planer/kontakte');
    expect(map['/finance']).toBe('/cockpit/finanzen');
    expect(map['/notifications']).toBe('/inbox/benachrichtigungen');
    expect(map['/learning']).toBe('/wissen/lernen');
    expect(map['/admin']).toBe('/system/admin');
  });

  it('resolvePathToPage handles new German slug paths', () => {
    expect(resolvePathToPage('/')).toBe('hub');
    expect(resolvePathToPage('/ideen')).toBe('ideas');
    expect(resolvePathToPage('/planer')).toBe('calendar');
    expect(resolvePathToPage('/inbox')).toBe('email');
    expect(resolvePathToPage('/wissen')).toBe('documents');
    expect(resolvePathToPage('/cockpit')).toBe('business');
    expect(resolvePathToPage('/meine-ki')).toBe('my-ai');
    expect(resolvePathToPage('/system')).toBe('settings');
  });

  it('resolvePathToPage handles sub-paths under new slugs', () => {
    expect(resolvePathToPage('/planer/tasks')).toBe('calendar');
    expect(resolvePathToPage('/ideen/incubator')).toBe('ideas');
    expect(resolvePathToPage('/system/admin')).toBe('settings');
    expect(resolvePathToPage('/cockpit/finanzen')).toBe('business');
    expect(resolvePathToPage('/wissen/canvas')).toBe('documents');
    expect(resolvePathToPage('/meine-ki/voice-chat')).toBe('my-ai');
    expect(resolvePathToPage('/inbox/benachrichtigungen')).toBe('email');
  });

  it('resolvePathToPage still handles old English paths as fallback', () => {
    // Before redirect kicks in, the resolver should still recognize old paths
    expect(resolvePathToPage('/ideas/archive')).toBe('ideas');
    expect(resolvePathToPage('/calendar/tasks')).toBe('calendar');
    expect(resolvePathToPage('/settings/profile')).toBe('settings');
    expect(resolvePathToPage('/workshop/proactive')).toBe('ideas');
  });

  it('resolvePathToPage defaults to hub for unknown paths', () => {
    expect(resolvePathToPage('/nonexistent')).toBe('hub');
    expect(resolvePathToPage('/totally/unknown/path')).toBe('hub');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/routes.test.ts`
Expected: FAIL — `PAGE_PATHS['hub']` is undefined, old paths still active

- [ ] **Step 3: Implement new routes/index.tsx**

Rewrite `frontend/src/routes/index.tsx`. Key design decisions:
- New canonical URLs use German slugs (`/ideen`, `/planer`, `/inbox`, `/wissen`, `/cockpit`, `/meine-ki`, `/system`) for user-facing consistency with German UI labels
- `hub` is the start page at `/`
- `home`, `chat`, `dashboard`, `browser`, `screen-memory`, `agent-teams` all map to `/` (these are absorbed into Chat Hub)
- Sub-pages get German slug sub-paths where user-visible (e.g., `/planer/kontakte`, `/cockpit/finanzen`) but keep English for internal tab routing (e.g., `/planer/tasks`, `/planer/kanban`)
- ALL old English paths (`/ideas`, `/calendar`, `/email`, etc.) become legacy redirects
- `resolvePathToPage` handles both new German and old English prefixes for resilience during transition

```typescript
// frontend/src/routes/index.tsx
/**
 * Route Definitions — Phase 105 (Zenith Navigation)
 *
 * German slug canonical URLs with comprehensive legacy redirects.
 * Every old URL resolves to its new location. Zero dead links.
 */

import { Navigate, useParams } from 'react-router-dom';
import type { Page } from '../types';

// ============================================
// CANONICAL URL PATHS
// ============================================

/** Maps Page identifiers to their canonical URL paths */
export const PAGE_PATHS: Record<Page, string> = {
  // ── Smart Pages (7+1) ──
  'hub': '/',
  'ideas': '/ideen',
  'calendar': '/planer',
  'email': '/inbox',
  'documents': '/wissen',
  'business': '/cockpit',
  'my-ai': '/meine-ki',
  'settings': '/system',

  // ── Active sub-pages ──
  'contacts': '/planer/kontakte',
  'finance': '/cockpit/finanzen',
  'insights': '/cockpit/trends',
  'learning': '/wissen/lernen',
  'notifications': '/inbox/benachrichtigungen',
  'screen-memory': '/',
  'memory-insights': '/meine-ki/memory-insights',

  // ── Sub-tabs ──
  'tasks': '/planer/tasks',
  'kanban': '/planer/kanban',
  'gantt': '/planer/gantt',
  'meetings': '/planer/meetings',
  'canvas': '/wissen/editor',
  'media': '/wissen/medien',
  'analytics': '/cockpit/trends',
  'digest': '/cockpit/digest',
  'knowledge-graph': '/wissen/connections',
  'graphrag': '/cockpit/graphrag',
  'voice-chat': '/meine-ki/voice-chat',
  'procedural-memory': '/meine-ki/procedures',
  'digital-twin': '/meine-ki/digital-twin',
  'system-admin': '/system/admin',

  // ── Legacy redirect-only (all map to canonical paths) ──
  'home': '/',
  'chat': '/',
  'browser': '/',
  'workshop': '/ideen/workshop',
  'incubator': '/ideen/incubator',
  'archive': '/ideen/archive',
  'triage': '/ideen/triage',
  'proactive': '/ideen/proactive',
  'evolution': '/ideen/evolution',
  'agent-teams': '/',
  'learning-tasks': '/planer/tasks',
  'personalization': '/meine-ki',
  'stories': '/wissen/connections',
  'dashboard': '/',
  'ai-workshop': '/ideen/workshop',
  'mcp-servers': '/system/integrations/mcp',
  'automations': '/system/automations',
  'integrations': '/system/integrations',
  'export': '/system/data',
  'sync': '/system/data',
  'profile': '/system/profile',
};

/** Maps canonical URL paths to Page identifiers */
export const PATH_PAGES: Record<string, Page> = {
  '/': 'hub',
  '/ideen': 'ideas',
  '/planer': 'calendar',
  '/inbox': 'email',
  '/wissen': 'documents',
  '/cockpit': 'business',
  '/meine-ki': 'my-ai',
  '/system': 'settings',
};

// ============================================
// LEGACY REDIRECTS — every old URL still works
// ============================================

/** Legacy paths that should redirect to their new canonical locations.
 *  When `rewritePrefix` is true, the wildcard segment from `from` is appended
 *  to the `to` base (e.g., /ideas/archive → /ideen/archive).
 */
export const LEGACY_REDIRECTS: Array<{ from: string; to: string; rewritePrefix?: boolean }> = [
  // Old primary routes → new German slugs
  // NOTE: Wildcard entries use a `rewritePrefix` flag — the redirect handler
  // must replace the old prefix with the new one and PRESERVE the sub-path.
  // Example: /ideas/archive → /ideen/archive, /settings/ai → /system/ai
  { from: '/chat', to: '/' },
  { from: '/ideas', to: '/ideen' },
  { from: '/ideas/*', to: '/ideen/*', rewritePrefix: true },
  { from: '/calendar', to: '/planer' },
  { from: '/calendar/*', to: '/planer/*', rewritePrefix: true },
  { from: '/email', to: '/inbox' },
  { from: '/email/*', to: '/inbox/*', rewritePrefix: true },
  { from: '/documents', to: '/wissen' },
  { from: '/documents/*', to: '/wissen/*', rewritePrefix: true },
  { from: '/business', to: '/cockpit' },
  { from: '/business/*', to: '/cockpit/*', rewritePrefix: true },
  { from: '/my-ai', to: '/meine-ki' },
  { from: '/my-ai/*', to: '/meine-ki/*', rewritePrefix: true },
  { from: '/settings', to: '/system' },
  { from: '/settings/*', to: '/system/*', rewritePrefix: true },

  // Old standalone pages → merged into Smart Pages
  { from: '/browser', to: '/' },
  { from: '/workshop', to: '/ideen' },
  { from: '/workshop/*', to: '/ideen/*', rewritePrefix: true },
  { from: '/contacts', to: '/planer/kontakte' },
  { from: '/finance', to: '/cockpit/finanzen' },
  { from: '/insights', to: '/cockpit/trends' },
  { from: '/insights/*', to: '/cockpit/*', rewritePrefix: true },
  { from: '/learning', to: '/wissen/lernen' },
  { from: '/learning/*', to: '/wissen/*', rewritePrefix: true },
  { from: '/screen-memory', to: '/' },
  { from: '/notifications', to: '/inbox/benachrichtigungen' },
  { from: '/admin', to: '/system/admin' },
  { from: '/admin/*', to: '/system' },

  // Old double-legacy redirects (pre-Phase 105 legacy paths)
  { from: '/incubator', to: '/ideen/incubator' },
  { from: '/ai-workshop', to: '/ideen' },
  { from: '/ai-workshop/*', to: '/ideen' },
  { from: '/meetings', to: '/planer/meetings' },
  { from: '/automations', to: '/system/automations' },
  { from: '/integrations', to: '/system/integrations' },
  { from: '/export', to: '/system/data' },
  { from: '/sync', to: '/system/data' },
  { from: '/profile', to: '/system/profile' },
  { from: '/archive', to: '/ideen/archive' },
  { from: '/triage', to: '/ideen/triage' },
  { from: '/stories', to: '/wissen/connections' },
  { from: '/media', to: '/wissen/medien' },
  { from: '/canvas', to: '/wissen/editor' },
  { from: '/personalization', to: '/meine-ki' },
  { from: '/voice-chat', to: '/meine-ki/voice-chat' },
  { from: '/agent-teams', to: '/' },
  { from: '/dashboard', to: '/' },
  { from: '/analytics', to: '/cockpit/trends' },
  { from: '/digest', to: '/cockpit/digest' },
  { from: '/knowledge-graph', to: '/wissen/connections' },
  { from: '/learning-tasks', to: '/planer/tasks' },
];

/**
 * Create redirect elements for legacy paths.
 * Used inside <Routes> to handle old URLs.
 * For rewritePrefix entries, uses a wrapper component that reads the wildcard
 * param and appends it to the target base path.
 */
function PrefixRedirect({ toBase }: { toBase: string }) {
  const params = useParams();
  const wildcard = params['*'] || '';
  const target = wildcard ? `${toBase}/${wildcard}` : toBase;
  return <Navigate to={target} replace />;
}

export function createLegacyRedirects() {
  return LEGACY_REDIRECTS.map(({ from, to, rewritePrefix }) => {
    if (rewritePrefix) {
      const toBase = to.replace('/*', '');
      return {
        path: from,
        element: <PrefixRedirect toBase={toBase} />,
      };
    }
    return {
      path: from,
      element: <Navigate to={to} replace />,
    };
  });
}

/**
 * Resolve a Page to its URL path, with optional tab suffix.
 */
export function resolvePagePath(page: Page, tab?: string): string {
  let path = PAGE_PATHS[page] || '/';

  if (tab) {
    const tabPages: Page[] = [
      'ideas', 'calendar', 'email', 'documents', 'business',
      'my-ai', 'settings', 'hub',
    ];
    if (tabPages.includes(page)) {
      path = `${PAGE_PATHS[page]}/${tab}`;
    }
  }

  return path;
}

/**
 * Resolve a pathname to its Page identifier.
 * Handles both new German slugs and old English paths (for transition period).
 */
export function resolvePathToPage(pathname: string): Page {
  // Direct match
  if (PATH_PAGES[pathname]) {
    return PATH_PAGES[pathname];
  }

  // Sub-path matching — new German slug prefixes
  if (pathname.startsWith('/ideen/')) return 'ideas';
  if (pathname.startsWith('/planer/')) return 'calendar';
  if (pathname.startsWith('/inbox/')) return 'email';
  if (pathname.startsWith('/wissen/')) return 'documents';
  if (pathname.startsWith('/cockpit/')) return 'business';
  if (pathname.startsWith('/meine-ki/')) return 'my-ai';
  if (pathname.startsWith('/system/')) return 'settings';

  // Sub-path matching — old English prefixes (fallback before redirect)
  if (pathname.startsWith('/ideas/')) return 'ideas';
  if (pathname.startsWith('/calendar/')) return 'calendar';
  if (pathname.startsWith('/email/')) return 'email';
  if (pathname.startsWith('/documents/')) return 'documents';
  if (pathname.startsWith('/business/')) return 'business';
  if (pathname.startsWith('/my-ai/')) return 'my-ai';
  if (pathname.startsWith('/settings/')) return 'settings';
  if (pathname.startsWith('/workshop/')) return 'ideas';
  if (pathname.startsWith('/insights/')) return 'business';
  if (pathname.startsWith('/learning/')) return 'documents';
  if (pathname.startsWith('/admin/')) return 'settings';
  if (pathname.startsWith('/browser/')) return 'hub';
  if (pathname.startsWith('/contacts/')) return 'calendar';
  if (pathname.startsWith('/finance/')) return 'business';
  if (pathname.startsWith('/screen-memory/')) return 'hub';

  // Default: unknown path → hub
  return 'hub';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/index.tsx frontend/src/components/layout/__tests__/routes.test.ts
git commit -m "feat(phase105): rewrite routes with German slug URLs and 50+ legacy redirects

Canonical paths: /ideen, /planer, /inbox, /wissen, /cockpit, /meine-ki, /system.
Every old URL (/ideas, /calendar, /email, /browser, etc.) redirects to new location.
resolvePathToPage handles both German and English prefixes for transition resilience."
```

---

### Task 33: Update Sidebar to flat 7+1 list

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/Sidebar.css`
- Create: `frontend/src/components/layout/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test for new Sidebar**

```typescript
// frontend/src/components/layout/__tests__/Sidebar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';

// Mock auth context
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

// Mock navIcons
vi.mock('../../../utils/navIcons', () => ({
  getPageIcon: () => () => null,
  getIconByName: () => () => null,
  LogOut: () => null,
  Star: () => null,
  ChevronDown: () => null,
}));

const defaultProps = {
  collapsed: false,
  onToggleCollapse: vi.fn(),
  currentPage: 'hub' as const,
  onNavigate: vi.fn(),
  apiStatus: null,
  isAIActive: false,
  archivedCount: 0,
  notificationCount: 0,
};

describe('Sidebar (Phase 105)', () => {
  it('renders 8 nav items (hub + 7 Smart Pages)', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = ['Chat Hub', 'Ideen', 'Planer', 'Inbox', 'Wissen', 'Cockpit', 'Meine KI', 'System'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('does NOT render section headers', () => {
    const { container } = render(<Sidebar {...defaultProps} />);
    // Old section headers should be gone
    expect(container.querySelector('.sidebar-section-header')).toBeNull();
    expect(screen.queryByText('Organisieren')).toBeNull();
    expect(screen.queryByText('Auswerten')).toBeNull();
    expect(screen.queryByText('KI & Lernen')).toBeNull();
  });

  it('does NOT render Browser nav item', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.queryByText('Browser')).toBeNull();
  });

  it('does NOT render old footer items as separate section', () => {
    render(<Sidebar {...defaultProps} />);
    // 'Benachrichtigungen' was a footer item — now absorbed into Inbox
    expect(screen.queryByText('Benachrichtigungen')).toBeNull();
    // 'Einstellungen' label is gone — replaced by 'System'
    expect(screen.queryByText('Einstellungen')).toBeNull();
  });

  it('highlights active item with aria-current="page"', () => {
    render(<Sidebar {...defaultProps} currentPage="ideas" />);
    const navItems = screen.getAllByRole('button');
    const activeItem = navItems.find(el => el.getAttribute('aria-current') === 'page');
    expect(activeItem).toBeDefined();
    expect(activeItem!.textContent).toContain('Ideen');
  });

  it('highlights parent item when sub-page is active', () => {
    render(<Sidebar {...defaultProps} currentPage="contacts" />);
    const navItems = screen.getAllByRole('button');
    const activeItem = navItems.find(el => el.getAttribute('aria-current') === 'page');
    expect(activeItem).toBeDefined();
    expect(activeItem!.textContent).toContain('Planer');
  });

  it('calls onNavigate when a nav item is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar {...defaultProps} onNavigate={onNavigate} />);
    const ideen = screen.getByText('Ideen');
    await userEvent.click(ideen);
    expect(onNavigate).toHaveBeenCalledWith('ideas');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx`
Expected: FAIL — Sidebar still renders section headers, no 'Chat Hub' item

- [ ] **Step 3: Update Sidebar.tsx**

Modify `frontend/src/components/layout/Sidebar.tsx`. Key changes:
- Replace nav imports: `NAV_SECTIONS`, `NAV_FOOTER_ITEMS`, `NAV_CHAT_ITEM`, `NAV_BROWSER_ITEM` → `NAV_ITEMS`, `NAV_HUB_ITEM`, `ALL_NAVIGABLE_ITEMS`, `isNavItemActive`
- Remove `NavSection` type import
- Remove `expandedSections` state, `toggleSection`, and all section expand/collapse logic
- Remove favorites section rendering (deferred to Phase 106)
- Remove recents section rendering
- Render flat list:
  1. Logo + brand at top
  2. Hub item (slightly larger, distinguished style with `.sidebar-hub-item` class)
  3. Divider
  4. 7 nav items in a flat `<nav>` list
  5. Collapse toggle at bottom
- Each item renders: Lucide icon + label (expanded) or icon-only with `title` tooltip (collapsed)
- Active item: `aria-current="page"` attribute + visual accent stripe via CSS
- Badge logic: only `'email_unread'` badge on Inbox item (notifications absorbed)

- [ ] **Step 4: Update Sidebar.css**

Modify `frontend/src/components/layout/Sidebar.css`:
- Remove `.sidebar-section-header`, `.sidebar-section-label`, `.sidebar-section-chevron`, `.sidebar-section-items`, `.sidebar-favorites-section`, `.sidebar-recents-section` rules
- Add `.sidebar-hub-item` — slightly larger font, subtle primary background tint, margin-bottom for separation
- Add `.sidebar-nav-item[aria-current="page"]::before` — 2px left accent stripe using `var(--color-accent-primary)`
- Keep existing transition timings for collapse/expand animation
- Keep existing hover states

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/Sidebar.css frontend/src/components/layout/__tests__/Sidebar.test.tsx
git commit -m "feat(phase105): update Sidebar to flat 7+1 nav list

Remove 4 section headers. Render Chat Hub + 7 Smart Page items as flat list.
Active item gets 2px accent stripe and aria-current=page.
Favorites/recents sections deferred to Phase 106."
```

---

### Task 34: Update MobileBottomBar + MobileSidebarDrawer

**Files:**
- Modify: `frontend/src/components/layout/MobileBottomBar.tsx`
- Modify: `frontend/src/components/layout/MobileSidebarDrawer.tsx`
- Create: `frontend/src/components/layout/__tests__/MobileBottomBar.test.tsx`

- [ ] **Step 1: Write the failing test for new MobileBottomBar**

```typescript
// frontend/src/components/layout/__tests__/MobileBottomBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileBottomBar } from '../MobileBottomBar';

const defaultProps = {
  currentPage: 'hub' as const,
  onNavigate: vi.fn(),
  onOpenMore: vi.fn(),
};

describe('MobileBottomBar (Phase 105)', () => {
  it('renders exactly 5 tabs', () => {
    const { container } = render(<MobileBottomBar {...defaultProps} />);
    const tabs = container.querySelectorAll('.mobile-bottom-tab');
    expect(tabs).toHaveLength(5);
  });

  it('renders correct tab labels: Chat, Ideen, Planer, Inbox, Mehr', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('Ideen')).toBeDefined();
    expect(screen.getByText('Planer')).toBeDefined();
    expect(screen.getByText('Inbox')).toBeDefined();
    expect(screen.getByText('Mehr')).toBeDefined();
  });

  it('does NOT render Home tab (replaced by Chat)', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('does NOT render E-Mail tab (replaced by Inbox)', () => {
    render(<MobileBottomBar {...defaultProps} />);
    expect(screen.queryByText('E-Mail')).toBeNull();
  });

  it('Chat tab navigates to hub', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Chat'));
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('Ideen tab navigates to ideas', async () => {
    const onNavigate = vi.fn();
    render(<MobileBottomBar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Ideen'));
    expect(onNavigate).toHaveBeenCalledWith('ideas');
  });

  it('Mehr tab opens drawer (calls onOpenMore)', async () => {
    const onOpenMore = vi.fn();
    render(<MobileBottomBar {...defaultProps} onOpenMore={onOpenMore} />);
    await userEvent.click(screen.getByText('Mehr'));
    expect(onOpenMore).toHaveBeenCalled();
  });

  it('highlights active tab', () => {
    const { container } = render(<MobileBottomBar {...defaultProps} currentPage="ideas" />);
    const activeTab = container.querySelector('.mobile-bottom-tab.active');
    expect(activeTab).toBeDefined();
    expect(activeTab!.textContent).toContain('Ideen');
  });

  it('highlights Chat tab for hub, home, and chat pages', () => {
    for (const page of ['hub', 'home', 'chat'] as const) {
      const { container } = render(<MobileBottomBar {...defaultProps} currentPage={page} />);
      const activeTab = container.querySelector('.mobile-bottom-tab.active');
      expect(activeTab!.textContent).toContain('Chat');
      container.remove();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/MobileBottomBar.test.tsx`
Expected: FAIL — old tabs (Home, E-Mail) still rendered

- [ ] **Step 3: Update MobileBottomBar.tsx**

Modify `frontend/src/components/layout/MobileBottomBar.tsx`:
- Change `BOTTOM_TABS` constant:
  ```typescript
  const BOTTOM_TABS: BottomTab[] = [
    { id: 'hub', label: 'Chat', page: 'hub' },
    { id: 'ideas', label: 'Ideen', page: 'ideas' },
    { id: 'calendar', label: 'Planer', page: 'calendar' },
    { id: 'email', label: 'Inbox', page: 'email' },
    { id: 'more', label: 'Mehr', isSpecial: 'more' },
  ];
  ```
- Update `TabIcon` SVG switch cases:
  - `'hub'`: MessageSquare-style icon (speech bubble)
  - `'ideas'`: Lightbulb icon
  - `'calendar'`: Calendar icon (keep existing)
  - `'email'`: Mail/envelope icon (keep existing)
  - `'more'`: Horizontal dots / menu icon (keep existing)
  - Remove `'home'` case
- Update active detection: `hub` tab is active when `currentPage` is `'hub'`, `'home'`, `'chat'`, `'dashboard'`, `'browser'`, `'screen-memory'`, or `'agent-teams'`
- Update `ideas` tab active detection to also match sub-pages: `'workshop'`, `'incubator'`, `'archive'`, `'triage'`
- Update `calendar` tab active detection: also match `'tasks'`, `'kanban'`, `'gantt'`, `'meetings'`, `'contacts'`
- Update `email` tab active detection: also match `'notifications'`

- [ ] **Step 4: Update MobileSidebarDrawer.tsx**

Modify `frontend/src/components/layout/MobileSidebarDrawer.tsx`:
- Replace imports: `NAV_SECTIONS`, `NAV_FOOTER_ITEMS`, `NAV_CHAT_ITEM`, `NAV_BROWSER_ITEM` → `NAV_ITEMS`, `NAV_HUB_ITEM`, `isNavItemActive`
- Remove section rendering loop entirely
- Render flat list with stagger animation:
  1. Hub item (prominent, same style as Sidebar hub)
  2. Divider
  3. 7 `NAV_ITEMS` as flat list
  4. Divider
  5. Context switcher + Theme toggle at bottom
- Remove favorites section (deferred)
- Keep existing drawer slide-in animation, backdrop, and focus trap

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/MobileBottomBar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/MobileBottomBar.tsx frontend/src/components/layout/MobileSidebarDrawer.tsx frontend/src/components/layout/__tests__/MobileBottomBar.test.tsx
git commit -m "feat(phase105): update mobile nav — 5-tab bottom bar + flat drawer

Bottom bar: Chat, Ideen, Planer, Inbox, Mehr (opens drawer).
Drawer: flat 7+1 items matching desktop Sidebar. No section headers."
```

---

### Task 35: Update TopBar + CommandPalette + Breadcrumbs

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/components/layout/Breadcrumbs.tsx`
- Modify: `frontend/src/components/CommandPalette.tsx`

- [ ] **Step 1: Update TopBar.tsx**

Modify `frontend/src/components/layout/TopBar.tsx`:
- `getPageLabel` import already works (updated in Task 30 to return new labels)
- Simplify breadcrumbs: remove section nesting. The title is now the Smart Page label directly (e.g. "Planer", "Inbox", "System")
- For sub-tabs, show two-level breadcrumb: "Planer > Aufgaben" or "System > Admin"
  - Import `findNavItemForPage` from navigation
  - If `currentPage` differs from the nav item's `page`, show `navItem.label > subTabLabel` where `subTabLabel` is derived from the URL tab segment
- Remove the old `findSectionForPage` breadcrumb logic (section > item)
- Keep context switcher, theme toggle, search trigger, refresh button unchanged

- [ ] **Step 2: Update Breadcrumbs.tsx**

Modify `frontend/src/components/layout/Breadcrumbs.tsx`:
- **CRITICAL:** Breadcrumbs.tsx imports `findSectionForPage` from `navigation.ts`, which Task 30 removes. Without this step, the app will break at runtime.
- Replace `findSectionForPage` import with `getNavItemByPage`, `getPageLabel` from `../../navigation`
- Replace the old section-based breadcrumb logic (`section.label > item.label > sub-tab`) with:
  1. Smart Page label (from `getNavItemByPage(currentPage)?.label || getPageLabel(currentPage)`)
  2. If on a sub-tab, append ` > tabLabel`
- Remove the 3-level section nesting logic entirely
- Keep existing CSS classes, accessibility attributes, and click handlers unchanged

- [ ] **Step 3: Update CommandPalette.tsx**

Modify `frontend/src/components/CommandPalette.tsx`:
- Import `ALL_NAVIGABLE_ITEMS` from `../../navigation`
- Replace the manually-built navigation commands with a dynamic list generated from `ALL_NAVIGABLE_ITEMS`:
  ```typescript
  const navCommands: Command[] = ALL_NAVIGABLE_ITEMS.map(item => ({
    id: `nav-${item.page}`,
    label: item.label,
    description: item.description,
    icon: item.icon,
    category: 'navigation' as CommandCategory,
    action: () => onNavigate(item.page),
    priority: item.page === 'hub' ? 100 : 50,
  }));
  ```
- Remove any manually listed pages that no longer exist as top-level (Browser, Workshop standalone, Screen Memory standalone, etc.)
- Keep all existing action commands (ai-features, content, settings categories) unchanged
- Keep the Fuse.js search, recency tracking, and mode prefixes unchanged

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx frontend/src/components/layout/Breadcrumbs.tsx frontend/src/components/CommandPalette.tsx
git commit -m "feat(phase105): update TopBar, Breadcrumbs, and CommandPalette

TopBar + Breadcrumbs: flat Smart Page label, two-level breadcrumb for sub-tabs.
Removes findSectionForPage dependency. CommandPalette: dynamic 7+1 nav commands."
```

---

### Task 36: Update App.tsx route definitions

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/LazyPages.tsx`

- [ ] **Step 1: Update LazyPages.tsx**

Modify `frontend/src/routes/LazyPages.tsx`:
- Add lazy import for ChatHub (Phase 104 component): `export const ChatHub = lazy(() => import('../components/ChatHub/ChatHub'));`
- If Phase 104 is not yet complete (ChatHub does not exist), create a minimal placeholder:
  ```typescript
  // Fallback: use ChatPage until ChatHub lands in Phase 104
  export const ChatHub = lazy(() => import('../components/ChatPage'));
  ```
- Keep ALL existing lazy imports — existing pages are still rendered as intermediaries

- [ ] **Step 2: Update App.tsx route switch**

Modify `frontend/src/App.tsx`. Key changes:

**Update the page-to-component mapping** (the `switch/case` or conditional rendering that maps `currentPage` to a component):

```typescript
// New page → component mapping (Phase 105)
// Hub pages → ChatHub (or ChatPage as fallback)
case 'hub':
case 'home':
case 'chat':
case 'dashboard':
case 'browser':
case 'agent-teams':
case 'screen-memory':
  return <ChatHub />;

// Ideen slot → existing IdeasPage as intermediary
case 'ideas':
case 'workshop':
case 'incubator':
case 'archive':
case 'triage':
case 'proactive':
case 'evolution':
case 'ai-workshop':
  return <IdeasPage />;

// Planer slot → existing PlannerPage as intermediary
case 'calendar':
case 'tasks':
case 'kanban':
case 'gantt':
case 'meetings':
case 'contacts':
case 'learning-tasks':
  return <PlannerPage />;

// Inbox slot → existing EmailPage as intermediary
case 'email':
case 'notifications':
  return <EmailPage />;

// Wissen slot → existing DocumentVaultPage as intermediary
case 'documents':
case 'canvas':
case 'media':
case 'knowledge-graph':
case 'learning':
case 'stories':
  return <DocumentVaultPage />;

// Cockpit slot → existing BusinessDashboard as intermediary
case 'business':
case 'finance':
case 'insights':
case 'analytics':
case 'digest':
case 'graphrag':
  return <BusinessDashboard />;

// Meine KI slot → existing MyAIPage as intermediary
case 'my-ai':
case 'voice-chat':
case 'memory-insights':
case 'digital-twin':
case 'procedural-memory':
case 'personalization':
  return <MyAIPage />;

// System slot → existing SettingsDashboard as intermediary
case 'settings':
case 'profile':
case 'automations':
case 'integrations':
case 'mcp-servers':
case 'export':
case 'sync':
case 'system-admin':
  return <SettingsDashboard />;
```

**Update Route definitions** to use new German slug paths:

```typescript
<Route path="/" element={<PageWrapper />} />
<Route path="/ideen/*" element={<PageWrapper />} />
<Route path="/planer/*" element={<PageWrapper />} />
<Route path="/inbox/*" element={<PageWrapper />} />
<Route path="/wissen/*" element={<PageWrapper />} />
<Route path="/cockpit/*" element={<PageWrapper />} />
<Route path="/meine-ki/*" element={<PageWrapper />} />
<Route path="/system/*" element={<PageWrapper />} />
{/* Legacy redirects handle all old paths */}
{createLegacyRedirects().map(r => (
  <Route key={r.path} path={r.path} element={r.element} />
))}
<Route path="*" element={<Navigate to="/" replace />} />
```

**Update imports:**
- Add `ChatHub` import from LazyPages
- Remove standalone page imports that are no longer routed independently (but keep them imported since they are used as intermediaries via the parent Smart Page slot)

**Update `useUrlNavigation` hook:**
- The `resolvePathToPage` import already handles the new German paths (updated in Task 32)
- Update `resolvePagePath` usage in `navigateToPage` to use new paths

- [ ] **Step 3: Remove temporary backward-compat aliases from navigation.ts**

Now that all consumers (Sidebar, Drawer, TopBar, CommandPalette, App.tsx) have been updated, remove the temporary aliases added in Task 30 Step 5:

Remove from `frontend/src/navigation.ts`:
```typescript
// Remove these lines:
export const NAV_FOOTER_ITEMS: NavItem[] = [];
export const NAV_CHAT_ITEM: NavItem = NAV_HUB_ITEM;
export const NAV_BROWSER_ITEM: NavItem = NAV_HUB_ITEM;
export function findSectionForPage(_page: Page) { return undefined; }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (no remaining references to removed exports)

If there are errors, fix the remaining import sites. Common places to check:
- `AppLayout.tsx` — may import from navigation
- `Breadcrumbs.tsx` — may reference `findSectionForPage`
- Any test file mocking navigation imports

- [ ] **Step 5: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass. Fix any failures caused by:
- Import changes (update test mocks for navigation)
- Route path changes (update test assertions that check URLs)
- Page type changes (update `currentPage` test values)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/routes/LazyPages.tsx frontend/src/navigation.ts
git commit -m "feat(phase105): update App.tsx routes and remove navigation compat aliases

Route / renders ChatHub. German slug routes for all 7 Smart Pages.
Each Smart Page slot renders existing page as intermediary.
Legacy redirects handle all old paths. Temporary compat aliases removed."
```

---

### Task 37: Phase 105 verification (quality gate)

- [ ] **Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All 782+ tests pass (including 4 new test files: navigation.test.ts, routes.test.ts, Sidebar.test.tsx, MobileBottomBar.test.tsx)

- [ ] **Step 2: Run TypeScript type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds with 0 errors

- [ ] **Step 4: Run backend tests (regression check)**

Run: `cd backend && npm test`
Expected: All 4933+ tests pass (backend is untouched in this phase)

- [ ] **Step 5: Manual verification checklist**

Verify in the browser (or via dev server `cd frontend && npm run dev`):

| URL | Expected Render | Status |
|-----|----------------|--------|
| `/` | Chat Hub (or ChatPage placeholder) | - [ ] |
| `/ideen` | IdeasPage | - [ ] |
| `/planer` | PlannerPage | - [ ] |
| `/inbox` | EmailPage | - [ ] |
| `/wissen` | DocumentVaultPage | - [ ] |
| `/cockpit` | BusinessDashboard | - [ ] |
| `/meine-ki` | MyAIPage | - [ ] |
| `/system` | SettingsDashboard | - [ ] |
| `/planer/tasks` | PlannerPage (tasks tab) | - [ ] |
| `/cockpit/finanzen` | BusinessDashboard (finance) | - [ ] |
| `/wissen/lernen` | DocumentVaultPage (learning) | - [ ] |
| `/system/admin` | SettingsDashboard (admin tab) | - [ ] |

Legacy redirects (verify browser URL changes):

| Old URL | Redirects To | Status |
|---------|-------------|--------|
| `/chat` | `/` | - [ ] |
| `/ideas` | `/ideen` | - [ ] |
| `/calendar` | `/planer` | - [ ] |
| `/email` | `/inbox` | - [ ] |
| `/documents` | `/wissen` | - [ ] |
| `/business` | `/cockpit` | - [ ] |
| `/my-ai` | `/meine-ki` | - [ ] |
| `/settings` | `/system` | - [ ] |
| `/browser` | `/` | - [ ] |
| `/workshop` | `/ideen` | - [ ] |
| `/contacts` | `/planer/kontakte` | - [ ] |
| `/finance` | `/cockpit/finanzen` | - [ ] |
| `/notifications` | `/inbox/benachrichtigungen` | - [ ] |
| `/learning` | `/wissen/lernen` | - [ ] |
| `/admin` | `/system/admin` | - [ ] |
| `/incubator` | `/ideen/incubator` | - [ ] |

Navigation UI:

| Check | Status |
|-------|--------|
| Sidebar shows 8 items (hub + 7), no section headers | - [ ] |
| Active sidebar item has left accent stripe | - [ ] |
| Collapsed sidebar shows icons only with tooltips | - [ ] |
| MobileBottomBar shows 5 tabs: Chat, Ideen, Planer, Inbox, Mehr | - [ ] |
| Mehr tab opens drawer with all 7+1 items | - [ ] |
| Cmd+K shows 7+1 navigation items | - [ ] |
| TopBar shows Smart Page label (not section > item) | - [ ] |

- [ ] **Step 6: Commit phase completion marker**

```bash
git commit --allow-empty -m "milestone(phase105): Navigation Scaffolding complete

7+1 flat navigation: Chat Hub + Ideen, Planer, Inbox, Wissen, Cockpit, Meine KI, System.
German slug URLs (/ideen, /planer, /inbox, /wissen, /cockpit, /meine-ki, /system).
50+ legacy redirects — every old URL resolves correctly. Zero dead links.
Existing pages serve as intermediaries until Smart Pages land (Phases 106-110).
New tests: navigation (12), routes (12), Sidebar (7), MobileBottomBar (9) = 40 tests."
```