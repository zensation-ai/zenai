# Phase 79: Design System Migration — Tailwind CSS + 100% Token Adoption

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the frontend from 135 individual CSS files with 534 inline styles and 0.8% design system adoption to Tailwind CSS with 100% design token adoption. Every component uses the unified design system.

**Architecture:** Install Tailwind CSS v4, configure it with existing design tokens from `frontend/src/design-system/tokens.ts`, migrate components outside-in (layout shell → high-traffic pages → secondary pages), eliminate individual CSS files progressively.

**Tech Stack:** Tailwind CSS v4, PostCSS, existing React + TypeScript + Vite

**Strategy:** This is a massive migration (252 components, 135 CSS files). We approach it in waves:
- **Wave 1:** Tailwind setup + token integration (this plan)
- **Wave 2:** Layout shell migration (Sidebar, TopBar, AppLayout)
- **Wave 3:** High-traffic pages (Dashboard, Chat, Ideas)
- **Wave 4-6:** Remaining pages (separate plans, to be created later)

This plan covers **Wave 1 + Wave 2** only. Each subsequent wave follows the same pattern.

---

## File Structure

### New Files to Create

```
frontend/
  tailwind.config.ts          # Tailwind config with design tokens
  postcss.config.js           # PostCSS config for Tailwind
  src/
    styles/
      tailwind.css            # Tailwind directives (@tailwind base/components/utilities)
      base.css                # Reset + global base styles (extracted from index.css)
```

### Files to Modify

```
frontend/
  package.json                # Add tailwind, postcss, autoprefixer
  vite.config.ts              # Ensure PostCSS is configured
  src/
    main.tsx                  # Import tailwind.css
    index.css                 # Reduce to essential global styles only
    App.css                   # Reduce progressively
    components/layout/
      AppLayout.tsx           # Migrate to Tailwind classes
      AppLayout.css           # Delete after migration
      Sidebar.tsx             # Migrate to Tailwind classes
      Sidebar.css             # Delete after migration
      TopBar.tsx              # Migrate to Tailwind classes
      TopBar.css               # Delete after migration
      MobileBottomBar.tsx     # Migrate to Tailwind classes
      MobileBottomBar.css     # Delete after migration
```

---

## Chunk 1: Tailwind Setup & Token Integration

### Task 1: Install Tailwind CSS

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/postcss.config.js`

- [ ] **Step 1: Install Tailwind and dependencies**

```bash
cd frontend && pnpm add -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

- [ ] **Step 2: Create PostCSS config**

Create `frontend/postcss.config.js`:
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add package.json pnpm-lock.yaml postcss.config.js
git commit -m "feat(phase-79): install Tailwind CSS v4 with PostCSS"
```

---

### Task 2: Tailwind Configuration with Design Tokens

**Files:**
- Create: `frontend/tailwind.config.ts`

- [ ] **Step 1: Create Tailwind config**

Create `frontend/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    // Use design tokens as source of truth
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Brand
        brand: {
          DEFAULT: '#ff6b35',
          dark: '#e55a2b',
          light: '#ff8c61',
          lighter: '#fff0e6',
          glow: 'rgba(255, 107, 53, 0.3)',
        },
        petrol: {
          DEFAULT: '#1a3a4a',
          light: '#2a5a6a',
          lighter: '#3a7a8a',
          glow: 'rgba(26, 58, 74, 0.3)',
        },
        // Semantic
        success: {
          DEFAULT: '#10b981',
          light: '#d1fae5',
          glow: 'rgba(16, 185, 129, 0.3)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: '#fef3c7',
          glow: 'rgba(245, 158, 11, 0.3)',
        },
        danger: {
          DEFAULT: '#ef4444',
          light: '#fee2e2',
          glow: 'rgba(239, 68, 68, 0.3)',
        },
        accent: {
          DEFAULT: '#a855f7',
          light: '#f3e8ff',
          glow: 'rgba(168, 85, 247, 0.3)',
        },
        // Surface (Light)
        surface: {
          DEFAULT: 'rgba(240, 245, 248, 0.8)',
          bg: '#dce5eb',
          card: 'rgba(240, 245, 250, 0.85)',
          hover: 'rgba(220, 235, 245, 0.6)',
          active: 'rgba(200, 225, 240, 0.7)',
        },
        // Surface (Dark) — applied via dark: prefix
        'surface-dark': {
          DEFAULT: 'rgba(22, 28, 36, 0.8)',
          bg: '#0a0a0f',
          card: 'rgba(30, 36, 44, 0.85)',
          hover: 'rgba(40, 48, 58, 0.6)',
          active: 'rgba(50, 60, 72, 0.7)',
        },
        // Glass
        glass: {
          bg: 'rgba(238, 244, 250, 0.78)',
          border: 'rgba(180, 205, 225, 0.55)',
          'dark-bg': 'rgba(20, 30, 40, 0.75)',
          'dark-border': 'rgba(80, 120, 160, 0.25)',
        },
        // Text (Light)
        txt: {
          DEFAULT: '#0f1f2a',
          muted: '#2a3d4d',
          secondary: '#3a4d5a',
          placeholder: '#6b7b8a',
        },
        // Text (Dark)
        'txt-dark': {
          DEFAULT: '#e5e5e5',
          muted: '#a0aab0',
          secondary: '#808a90',
          placeholder: '#606a70',
        },
        // Context accent colors
        'ctx-personal': '#0ea5e9',
        'ctx-work': '#3b82f6',
        'ctx-learning': '#10b981',
        'ctx-creative': '#8b5cf6',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],   // 10px
        'xs': ['0.75rem', { lineHeight: '1rem' }],          // 12px
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],      // 14px
        'base': ['1rem', { lineHeight: '1.5rem' }],         // 16px
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],      // 18px
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],       // 20px
        '2xl': ['1.5rem', { lineHeight: '2rem' }],          // 24px
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],     // 30px
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],       // 36px
        '5xl': ['3rem', { lineHeight: '1' }],               // 48px
        '6xl': ['3.75rem', { lineHeight: '1' }],            // 60px
      },

      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '18': '72px',
        '20': '80px',
        '24': '96px',
        // Layout-specific
        'sidebar': '260px',
        'sidebar-collapsed': '64px',
        'topbar': '52px',
        'bottombar': '64px',
        'touch': '44px',
      },

      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        'full': '9999px',
      },

      boxShadow: {
        'sm': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'DEFAULT': '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        'md': '0 4px 16px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
        'lg': '0 8px 32px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)',
        'xl': '0 16px 48px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.1)',
        'glow': '0 0 20px rgba(255, 107, 53, 0.15)',
        'glow-petrol': '0 0 20px rgba(26, 58, 74, 0.15)',
        'glass': '0 8px 32px rgba(0,0,0,0.06)',
        // Dark mode shadows
        'dark-sm': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'dark-DEFAULT': '0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
        'dark-md': '0 4px 16px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)',
        'dark-lg': '0 8px 32px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4)',
      },

      zIndex: {
        'background': '0',
        'content': '1',
        'elevated': '2',
        'batch-bar': '20',
        'sticky': '30',
        'topbar': '50',
        'sidebar': '60',
        'header': '70',
        'floating': '100',
        'drawer': '150',
        'dropdown': '200',
        'overlay': '250',
        'modal': '400',
        'toast': '500',
        'command': '600',
        'onboarding': '700',
        'login': '800',
        'skip': '900',
      },

      backdropBlur: {
        'glass': '12px',
        'glass-heavy': '20px',
      },

      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'snap': 'cubic-bezier(0, 0, 0.2, 1)',
        'ease-out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },

      transitionDuration: {
        'fast': '100ms',
        'normal': '200ms',
        'slow': '300ms',
        'slower': '500ms',
      },

      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'pulse-subtle': 'pulse-subtle 2s infinite ease-in-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-bottom': 'slide-in-bottom 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
      },

      keyframes: {
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-bottom': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Verify Tailwind config is valid**

```bash
cd frontend && npx tailwindcss --help
```
Expected: No config errors

- [ ] **Step 3: Commit**

```bash
cd frontend && git add tailwind.config.ts
git commit -m "feat(phase-79): configure Tailwind with design tokens (colors, spacing, typography, shadows, z-index, animations)"
```

---

### Task 3: Tailwind Entry CSS + Integration

**Files:**
- Create: `frontend/src/styles/tailwind.css`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create Tailwind entry CSS**

Create `frontend/src/styles/tailwind.css`:
```css
@import "tailwindcss";

/* Preserve existing CSS custom properties for backward compatibility */
/* These will be phased out as components migrate to Tailwind classes */

/* Glass utility classes */
@utility glass {
  background: rgba(238, 244, 250, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(180, 205, 225, 0.55);
}

@utility glass-dark {
  background: rgba(20, 30, 40, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(80, 120, 160, 0.25);
}

/* Scrollbar styling */
@utility scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.15) transparent;
}

/* Focus ring utility */
@utility focus-ring {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Truncate multiline */
@utility line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@utility line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 2: Add Tailwind import to main.tsx**

In `frontend/src/main.tsx`, add BEFORE the existing CSS imports:
```typescript
import './styles/tailwind.css';
```

This ensures Tailwind base styles load first, existing CSS can override where needed during migration.

- [ ] **Step 3: Verify build works**

```bash
cd frontend && pnpm run build
```
Expected: Build succeeds with no errors. Tailwind classes are available.

- [ ] **Step 4: Verify existing app still looks correct**

```bash
cd frontend && pnpm run dev
```
Open in browser, verify no visual regressions.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/styles/tailwind.css src/main.tsx
git commit -m "feat(phase-79): integrate Tailwind CSS into build pipeline"
```

---

### Task 4: Verify Tailwind Works — Add Test Class

- [ ] **Step 1: Quick smoke test**

Temporarily add a Tailwind class to any component to verify it works:

In `frontend/src/components/Dashboard.tsx`, add to any element:
```tsx
<div className="text-brand font-bold">Tailwind works!</div>
```

Verify it renders with the brand color (#ff6b35) and bold text.

- [ ] **Step 2: Remove test element**

Remove the test div.

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && pnpm test
```
Expected: All 572 tests pass

- [ ] **Step 4: Commit**

```bash
cd frontend && git add -A
git commit -m "test(phase-79): verify Tailwind CSS integration — all tests pass"
```

---

## Chunk 2: Layout Shell Migration (Wave 2)

### Task 5: AppLayout Migration

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Delete: `frontend/src/components/layout/AppLayout.css` (after migration)

- [ ] **Step 1: Read AppLayout.tsx and AppLayout.css**

Read both files completely to understand current structure and styles.

- [ ] **Step 2: Replace CSS classes with Tailwind**

Migrate AppLayout.tsx to use Tailwind classes. The key elements:

| CSS Class | Tailwind Equivalent |
|-----------|-------------------|
| `.app-layout` | `flex h-screen overflow-hidden bg-surface-bg dark:bg-surface-dark-bg` |
| `.layout-main` | `flex flex-1 flex-col min-w-0 overflow-hidden` |
| `.main-content` | `flex-1 overflow-y-auto p-6 md:p-8` |
| `.layout-main--sidebar-expanded` | (conditional: `ml-sidebar` vs `ml-sidebar-collapsed`) |

**Important:** Keep the existing logic (sidebar state, mobile overlay, proactive panel, etc.). Only replace CSS class references with Tailwind utilities.

**Pattern for migration:**
```tsx
// BEFORE:
<div className="app-layout">
  <div className={`layout-main ${sidebarExpanded ? 'layout-main--sidebar-expanded' : ''}`}>

// AFTER:
<div className="flex h-screen overflow-hidden bg-surface-bg dark:bg-surface-dark-bg">
  <div className={`flex flex-1 flex-col min-w-0 overflow-hidden transition-[margin] duration-normal ${sidebarExpanded ? 'ml-sidebar' : 'ml-sidebar-collapsed'} md:ml-0`}>
```

- [ ] **Step 3: Verify layout looks correct**

```bash
cd frontend && pnpm run dev
```
Check: sidebar toggle, mobile view, content area, topbar positioning.

- [ ] **Step 4: Delete AppLayout.css**

Remove `frontend/src/components/layout/AppLayout.css` and its import from AppLayout.tsx.

- [ ] **Step 5: Run tests**

```bash
cd frontend && pnpm test
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/AppLayout.tsx
git rm frontend/src/components/layout/AppLayout.css 2>/dev/null || true
git commit -m "feat(phase-79): migrate AppLayout to Tailwind CSS"
```

---

### Task 6: Sidebar Migration

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Delete: `frontend/src/components/layout/Sidebar.css`

- [ ] **Step 1: Read Sidebar.tsx and Sidebar.css**

Read both files completely.

- [ ] **Step 2: Map CSS to Tailwind classes**

Key mappings for Sidebar:

| CSS | Tailwind |
|-----|---------|
| Sidebar container | `fixed left-0 top-0 h-screen bg-surface-card dark:bg-surface-dark-card border-r border-glass-border dark:border-glass-dark-border z-sidebar transition-[width] duration-normal` |
| Width expanded | `w-sidebar` (260px) |
| Width collapsed | `w-sidebar-collapsed` (64px) |
| Nav item | `flex items-center gap-3 px-3 py-2 rounded-md text-txt-muted dark:text-txt-dark-muted hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors duration-fast cursor-pointer` |
| Nav item active | `bg-surface-active dark:bg-surface-dark-active text-txt dark:text-txt-dark font-medium` |
| Section header | `text-2xs font-semibold uppercase tracking-wider text-txt-secondary dark:text-txt-dark-secondary px-3 py-2` |
| Footer | `mt-auto border-t border-glass-border dark:border-glass-dark-border px-2 py-3` |

- [ ] **Step 3: Migrate component**

Replace all CSS class references with Tailwind utilities. Keep all logic (expanded sections, active states, badges, etc.).

- [ ] **Step 4: Verify sidebar behavior**

Check: expand/collapse, hover states, active indicator, section headers, badges, dark mode.

- [ ] **Step 5: Delete Sidebar.css and commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git rm frontend/src/components/layout/Sidebar.css 2>/dev/null || true
git commit -m "feat(phase-79): migrate Sidebar to Tailwind CSS"
```

---

### Task 7: TopBar Migration

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Delete: `frontend/src/components/layout/TopBar.css`

- [ ] **Step 1: Read and migrate**

Key mappings:
| CSS | Tailwind |
|-----|---------|
| TopBar container | `h-topbar flex items-center justify-between px-4 bg-surface-card/80 dark:bg-surface-dark-card/80 backdrop-blur-glass border-b border-glass-border dark:border-glass-dark-border z-topbar sticky top-0` |
| Search trigger | `flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-hover dark:bg-surface-dark-hover text-txt-placeholder dark:text-txt-dark-placeholder text-sm cursor-pointer hover:bg-surface-active transition-colors` |
| Context switcher | `flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium` |

- [ ] **Step 2: Verify, delete CSS, commit**

```bash
git add frontend/src/components/layout/TopBar.tsx
git rm frontend/src/components/layout/TopBar.css 2>/dev/null || true
git commit -m "feat(phase-79): migrate TopBar to Tailwind CSS"
```

---

### Task 8: MobileBottomBar Migration

**Files:**
- Modify: `frontend/src/components/layout/MobileBottomBar.tsx`
- Delete: `frontend/src/components/layout/MobileBottomBar.css`

- [ ] **Step 1: Read and migrate**

Key mappings:
| CSS | Tailwind |
|-----|---------|
| Container | `fixed bottom-0 left-0 right-0 h-bottombar flex items-center justify-around bg-surface-card/90 dark:bg-surface-dark-card/90 backdrop-blur-glass border-t border-glass-border dark:border-glass-dark-border z-topbar pb-[env(safe-area-inset-bottom)] md:hidden` |
| Tab item | `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-2xs text-txt-muted dark:text-txt-dark-muted` |
| Tab active | `text-brand dark:text-brand` |

- [ ] **Step 2: Verify, delete CSS, commit**

```bash
git add frontend/src/components/layout/MobileBottomBar.tsx
git rm frontend/src/components/layout/MobileBottomBar.css 2>/dev/null || true
git commit -m "feat(phase-79): migrate MobileBottomBar to Tailwind CSS"
```

---

## Chunk 3: Verification & Next Steps

### Task 9: Full Verification

- [ ] **Step 1: Run all tests**

```bash
cd frontend && pnpm test
```
Expected: All 572 tests pass

- [ ] **Step 2: Run build**

```bash
cd frontend && pnpm run build
```
Expected: No TypeScript or build errors

- [ ] **Step 3: Visual verification**

Start dev server and check:
- [ ] Desktop layout (sidebar expanded + collapsed)
- [ ] Mobile layout (bottom bar, drawer)
- [ ] Dark mode
- [ ] All pages load correctly
- [ ] No CSS regressions on non-migrated components

- [ ] **Step 4: Count deleted CSS files**

```bash
git diff --name-status HEAD~5 | grep "^D.*\.css$" | wc -l
```
Expected: 4 CSS files deleted (AppLayout, Sidebar, TopBar, MobileBottomBar)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(phase-79): Wave 1+2 complete — Tailwind integrated, layout shell migrated

- Tailwind CSS v4 installed and configured with design tokens
- 150+ design tokens mapped to Tailwind config
- Layout shell components migrated: AppLayout, Sidebar, TopBar, MobileBottomBar
- 4 CSS files eliminated
- All 572 tests pass, build clean"
```

---

## Future Waves (Separate Plans)

**Wave 3:** Dashboard, GeneralChat, IdeasPage — the 3 highest-traffic pages
**Wave 4:** PlannerPage, DocumentVaultPage, EmailPage, ContactsPage
**Wave 5:** FinancePage, BrowserPage, ScreenMemoryPage, CanvasPage, AgentTeamsPage
**Wave 6:** Settings tabs, Modals, Overlays, remaining 200 components

Each wave follows the same pattern:
1. Read component + CSS file
2. Map CSS classes to Tailwind utilities
3. Replace in component
4. Verify visually + test
5. Delete CSS file
6. Commit
