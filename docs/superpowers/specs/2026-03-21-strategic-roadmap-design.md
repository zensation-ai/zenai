# ZenAI Strategic Roadmap — Portfolio Excellence

**Date:** 2026-03-21
**Goal:** Transform ZenAI from a feature-complete AI OS into a portfolio-grade showcase product
**Timeline:** 3-5 days across 5 phases
**Approach:** Performance First — speed and interactivity are the strongest portfolio signals

## Context

ZenAI is a feature-complete enterprise AI platform with:
- 7,765 tests (Backend 6,445 + Frontend 1,320), 0 failures
- 55 AI tools, 4-layer memory system, GraphRAG, multi-agent orchestration
- Production deployment: Vercel (frontend), Railway (backend), Supabase (DB), Redis (cache)
- 21 design system components, 4-step onboarding wizard, PWA manifest

**What's missing for portfolio excellence:**
1. Performance optimization (Sentry eager-load, chunk sizes)
2. Interactive demo mode (try-before-signup experience)
3. UX polish (micro-interactions, consistency, mobile)
4. Billing showcase (pricing page, plan infrastructure)
5. Quality evidence (Lighthouse scores, a11y compliance)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary goal | Portfolio/Showcase | Tech excellence over monetization |
| Landing page | In-app demo mode | App *is* the demo, no separate site needed |
| i18n | German only | Low priority, DE reicht for portfolio |
| Billing | Static pricing page | Shows monetization readiness without functional checkout |
| Approach | Performance First | Lighthouse 95+ is objectively measurable quality |

---

## Phase A: Performance Excellence (0.5-1 day)

**Goal:** Lighthouse 95+ on all metrics, minimal bundle, fastest possible load time.
**Parallelizable:** Yes — A1/A2/A3 are independent, A4 depends on A1-A3 completion.

### A1: Sentry Lazy-Loading

**Problem:** Sentry is eagerly loaded in `main.tsx` (~81KB gzip), blocking initial render.

**Solution:**
- Replace `initSentry()` call in `main.tsx` with dynamic `import()` via `requestIdleCallback`
- Fallback: 3-second timeout if `requestIdleCallback` not available
- Pre-init error queue: `ErrorBoundary` catches errors before Sentry loads, flushes queue after init
- No behavioral change — same sampling rates, filtering, replay config

**Files:**
- `frontend/src/services/sentry.ts` — add `initSentryLazy()` with dynamic import
- `frontend/src/main.tsx` — replace eager `initSentry()` with lazy variant

### A2: Chunk Analysis & Splitting

**Problem:** Some vendor chunks may be loaded on pages that don't need them.

**Solution:**
- Run `npx vite-bundle-visualizer` to generate current chunk map
- Verify Recharts, ReactFlow, react-syntax-highlighter are lazy-loaded (only when visible)
- Apply `React.lazy()` + `Suspense` on remaining page-level components not yet lazy
- Target: no chunk > 200KB gzip except core React runtime

**Files:**
- `frontend/vite.config.ts` — adjust `manualChunks` if needed
- `frontend/src/App.tsx` — wrap remaining pages in `React.lazy()`

### A3: Asset Optimization

**Solution:**
- Add `<link rel="modulepreload">` for critical route chunks in `index.html`
- Verify font preloading (Inter/system fonts)
- Verify all images use lazy loading (Intersection Observer)
- Audit Service Worker precache manifest — only cache critical assets

**Files:**
- `frontend/index.html` — preload hints
- `frontend/public/sw.js` — precache list audit

### A4: Runtime Performance

**Solution:**
- `React.memo()` audit on frequently re-rendering components (SuggestionCard, ChatMessageList, IdeaCard)
- `useDeferredValue` for search inputs (CommandPalette, Ideas filter, Contacts search)
- Evaluate virtual scrolling for long lists (Ideas, Emails, Contacts) — only if >100 items typical
- Measure with React DevTools Profiler before/after

**Files:**
- Various component files — targeted `React.memo()` wrapping
- Search input components — `useDeferredValue` addition

**Success Criteria:**
- Lighthouse Performance: 95+
- LCP < 2.5s, CLS < 0.1, INP < 200ms
- No chunk > 200KB gzip
- Sentry not in critical path

---

## Phase B: Interactive Demo Mode (1-1.5 days)

**Goal:** Any visitor can experience ZenAI immediately — no account, no setup.
**Parallelizable:** Yes — B1+B2 (backend) parallel with B3+B4 (frontend).

### B1: Demo Data Seeding

**Solution:**
- `backend/src/services/demo/demo-seed.ts` — deterministic test data set
- Persona: "Startup-Gründer Alexander" with coherent thematic data
- Data set:
  - ~20 Ideas (various status, topics, priorities, with embeddings)
  - 5 Projects with 15 Tasks (Kanban-ready: backlog/todo/in-progress/done)
  - 3 Chat Sessions with realistic AI responses (including tool usage)
  - 10 Mock Emails (inbox, sent, drafts)
  - 8 Contacts with organizations
  - Memory facts (working + long-term) to show Memory Transparency
  - 2 Canvas documents
- Data lives in `demo` schema (5th schema alongside personal/work/learning/creative)
- Idempotent: `seedDemoData()` can run multiple times safely (UPSERT pattern)
- Cleanup: `clearDemoData()` for reset

**Files:**
- `backend/src/services/demo/demo-seed.ts` — seed data generation
- `backend/src/services/demo/demo-data.ts` — static demo data definitions
- `backend/sql/migrations/phase_demo_schema.sql` — create `demo` schema with same table structure

### B2: Demo Session Logic

**Solution:**
- New auth mode: `demo` alongside `jwt` and `api-key`
- `POST /api/auth/demo` — creates temporary demo session
  - Returns JWT with `{ userId: DEMO_USER_ID, plan: 'pro', isDemo: true }`
  - Session TTL: 24 hours
  - No registration required
- Demo user gets `demo` schema as context (hardcoded, no context switching)
- Write operations work within demo session (user can try creating ideas, chatting)
- Cleanup job: BullMQ worker clears expired demo data daily
- Rate limiting: stricter for demo sessions (prevents abuse)
  - 50 API calls/minute (vs 200 for authenticated)
  - 5 chat messages/minute (vs 20)
  - No code execution in demo

**Files:**
- `backend/src/routes/auth.ts` — add `/api/auth/demo` endpoint
- `backend/src/middleware/jwt-auth.ts` — recognize demo tokens
- `backend/src/middleware/demo-guard.ts` — rate limits + restricted ops for demo
- `backend/src/services/demo/demo-cleanup.ts` — BullMQ cleanup worker

### B3: Guided Tour Overlay

**Solution:**
- `frontend/src/components/GuidedTour/GuidedTour.tsx` — step-by-step spotlight tour
- 8-10 steps highlighting key features:
  1. Dashboard — "Dein AI-Cockpit: Alles auf einen Blick"
  2. Chat — "Chatte mit deiner KI — sie kennt deinen Kontext"
  3. Ideas — "Gedanken festhalten und weiterentwickeln"
  4. Kanban — "Aufgaben visuell organisieren"
  5. Memory Transparency — "Sieh was deine KI sich merkt"
  6. AI Workshop — "Multi-Agenten arbeiten zusammen"
  7. Insights — "Knowledge Graph und Statistiken"
  8. Voice Chat — "Sprich mit deiner KI"
- Spotlight effect: dimmed overlay with focused element cutout (CSS `clip-path` or `mix-blend-mode`)
- Navigation: Skip / Next / Back / Progress dots
- Auto-offered after demo login, dismissible
- State persisted in localStorage: `zenai_tour_completed`

**Files:**
- `frontend/src/components/GuidedTour/GuidedTour.tsx` — tour component
- `frontend/src/components/GuidedTour/GuidedTour.css` — spotlight + overlay styles
- `frontend/src/components/GuidedTour/tour-steps.ts` — step definitions
- `frontend/src/hooks/useGuidedTour.ts` — tour state management

### B4: Demo Entry Point

**Solution:**
- `/demo` route — entry point for demo experience
- Minimal splash screen:
  - ZenAI logo + tagline
  - 3-4 feature highlight cards (animated entry)
  - "Demo starten" primary CTA button
  - "Account erstellen" secondary link
- After clicking "Demo starten": calls `/api/auth/demo`, stores token, redirects to Dashboard, offers Guided Tour
- Persistent demo badge in TopBar: "Demo" pill + "Account erstellen" CTA
- Demo badge removed after registration

**Files:**
- `frontend/src/components/DemoPage/DemoPage.tsx` — splash + entry
- `frontend/src/components/DemoPage/DemoPage.css` — styles
- `frontend/src/components/layout/TopBar.tsx` — demo badge integration

**Success Criteria:**
- Visitor can go from `/demo` to full app experience in < 5 seconds
- All major features visible and interactive in demo
- Demo data is coherent and tells a story
- No real user data exposed, demo data isolated in own schema

---

## Phase C: UX Polish & Design Excellence (1-1.5 days)

**Goal:** Visually impressive, consistent, fluid — portfolio quality on every page.
**Parallelizable:** Yes — C1/C2/C3/C4/C5 are largely independent.

### C1: Design System Extension

**New components (4):**

1. **Table** — sortable columns, row selection, pagination, responsive (horizontal scroll on mobile)
   - Used by: Ideas list view, Email inbox, Contacts, Transactions
   - Props: columns, data, sortable, selectable, pagination, emptyState

2. **Select/Combobox** — dropdown with search, single/multi select, keyboard navigation
   - Used by: Context switcher, filter dropdowns, task assignment, tag selection
   - Props: options, searchable, multiple, placeholder, onChange

3. **DatePicker** — calendar popup, range selection, locale-aware (German)
   - Used by: Task due dates, calendar event creation, filter ranges
   - Props: value, onChange, range, minDate, maxDate, locale

4. **Breadcrumb** — formalize existing ad-hoc implementation as DS component
   - Props: items (label + href), separator, maxItems (collapse with ellipsis)

**All components:** Dark mode support, `ds-` CSS prefix, ARIA-compliant, keyboard navigable, unit tested.

**Files:**
- `frontend/src/design-system/components/Table.tsx` + `.css`
- `frontend/src/design-system/components/Select.tsx` + `.css`
- `frontend/src/design-system/components/DatePicker.tsx` + `.css`
- `frontend/src/design-system/components/Breadcrumb.tsx` + `.css`
- `frontend/src/design-system/components/index.ts` — add exports

### C2: Micro-Interactions & Transitions

**Solution:**
- Page transitions: CSS cross-fade using View Transitions API (progressive enhancement, fallback: instant)
- List animations: extend Phase 118 `spring-in` / `spring-slide-up` with stagger utility class
- Hover states: subtle `scale(1.02)` + shadow-lift on interactive cards (IdeaCard, SuggestionCard, etc.)
- Skeleton→Content: `opacity` transition (0→1, 200ms ease) instead of hard swap
- Toast notifications: slide-in from top-right with auto-dismiss progress bar

**Files:**
- `frontend/src/styles/animations.css` — extend existing spring animations
- `frontend/src/styles/transitions.css` — page transition + hover utilities
- Component-specific CSS files — add hover/transition classes

### C3: Dark Mode Audit

**Solution:**
- Visual audit of all 21+ pages in dark mode
- Fix contrast issues (WCAG AA minimum 4.5:1 for text)
- Consistent glass effects (`backdrop-filter: blur()`) on panels, modals, popovers
- Chart colors (Recharts): dark-mode-aware palette using CSS custom properties
- Focus-visible outlines: visible in both modes (use `var(--focus-ring)` token)

**Files:**
- Various CSS files — targeted contrast and glass fixes
- `frontend/src/design-system/tokens.ts` — verify dark mode color tokens

### C4: Mobile UX

**Solution:**
- Touch target audit: verify min 44px on all interactive elements
- Swipe gestures on Ideas list and Email inbox (swipe-left: archive, swipe-right: star)
- Bottom sheet pattern for modals on mobile (viewport < 768px)
- Pull-to-refresh on list pages (Ideas, Emails, Contacts, Tasks)
- Responsive breakpoint verification on all pages

**Files:**
- `frontend/src/hooks/useSwipeGesture.ts` — reusable swipe hook
- `frontend/src/components/shared/BottomSheet.tsx` — mobile modal replacement
- `frontend/src/hooks/usePullToRefresh.ts` — pull-to-refresh hook
- Various page components — integration

### C5: Consistency Pass

**Solution:**
- Spacing/typography audit using design tokens (no hardcoded values)
- Empty states: consistent illustration + CTA pattern on all pages (extend EmptyState DS component)
- Loading states: PageSkeleton pattern on all pages (extend Phase 118 SmartPageSkeleton)
- Error states: QueryErrorState on remaining pages (Phase 100 covered 7/8, complete rest)
- Verify all pages use DS components where applicable

**Files:**
- Various page components — consistency fixes

**Success Criteria:**
- Every page looks polished in both light and dark mode
- Consistent spacing, typography, loading/error/empty states
- Smooth animations that respect `prefers-reduced-motion`
- Mobile experience feels native (swipe, bottom sheet, pull-to-refresh)
- 25 design system components (21 existing + 4 new)

---

## Phase D: Billing Showcase (0.5 day)

**Goal:** Professional pricing presentation — shows ZenAI is monetization-ready without functional checkout.
**Parallelizable:** Yes — D1 parallel with D2+D3.

### D1: Pricing Page

**Solution:**
- `/pricing` route — visually impressive tier presentation
- 3 tiers:
  - **Free:** 5 Ideas, 10 Chat messages/day, 1 Context, Basic RAG
  - **Pro (€19/mo):** Unlimited Ideas, Unlimited Chat, 4 Contexts, Advanced RAG, Multi-Agent, Voice Chat, GraphRAG
  - **Enterprise (Custom):** Everything in Pro + Team Management, SSO, SLA, Priority Support, Custom Integrations
- Feature comparison table with checkmarks and limits per tier
- Monthly/Yearly toggle (20% annual discount, visually highlighted)
- CTA buttons: Free → "Kostenlos starten", Pro → "Pro testen" (→ demo), Enterprise → "Kontakt"
- No Stripe integration — buttons lead to demo or mailto link
- Responsive: cards stack on mobile, table scrolls horizontally

**Files:**
- `frontend/src/components/PricingPage/PricingPage.tsx` — tier cards + comparison table
- `frontend/src/components/PricingPage/PricingPage.css` — styles with glass effects
- `frontend/src/navigation.ts` — add pricing route

### D2: Plan Badge in App

**Solution:**
- Subtle badge in sidebar footer: "Free Plan" / "Pro Plan"
- In demo mode: "Pro Plan (Demo)" with all features unlocked
- Hover tooltip: "Upgrade verfügbar" linking to `/pricing`
- Uses DS Badge component with plan-specific color

**Files:**
- `frontend/src/components/layout/Sidebar.tsx` — plan badge integration

### D3: Feature Gate Infrastructure (Stubs Only)

**Solution:**
- `backend/src/middleware/plan-gate.ts` — middleware stub
  - Reads plan tier from `req.jwtUser.plan` (default: 'free')
  - `requirePlan('pro')` factory — returns 403 with upgrade message if insufficient
  - Currently no routes actually gated — infrastructure only
- `frontend/src/hooks/usePlanFeatures.ts` — hook stub
  - Returns `{ plan, canUse(feature), limits, isDemo }` based on JWT claims
  - Feature map: defines which features are available per tier
  - Currently all features return `true` — infrastructure only
- Shows architectural maturity in portfolio without restricting demo experience

**Files:**
- `backend/src/middleware/plan-gate.ts` — plan gate middleware
- `frontend/src/hooks/usePlanFeatures.ts` — plan features hook
- `frontend/src/types/plan.ts` — PlanTier, PlanFeatures type definitions

**Success Criteria:**
- Pricing page looks professional and competitive
- Plan infrastructure demonstrates SaaS architecture knowledge
- Demo mode shows "Pro" to let visitors experience full feature set

---

## Phase E: Final Polish & Lighthouse Validation (0.5 day)

**Goal:** Tie everything together, end-to-end verification, measurable quality evidence.
**Parallelizable:** Yes — E1/E2/E3 parallel, E4/E5 after fixes.

### E1: Lighthouse CI Audit

**Solution:**
- Run Lighthouse on 5 key pages: `/demo`, `/dashboard`, `/ideas`, `/chat`, `/pricing`
- Target: Performance 95+, Accessibility 95+, Best Practices 95+, SEO 90+
- Fix all findings below target (typical: missing alt texts, contrast, meta tags)
- Document before/after scores

### E2: Accessibility Audit

**Solution:**
- axe-core scan on all pages (can be automated via Playwright)
- Keyboard navigation end-to-end: Tab order, Focus trap in Modals, Escape handling
- Screen reader test on critical path: Demo → Tour → Chat → Ideas
- `aria-live` regions for dynamic content (chat messages, notifications, tool activity)
- Verify `prefers-reduced-motion` respected on all animations

### E3: SEO Basics

**Solution:**
- `<meta>` tags: title, description, og:image on public routes (`/demo`, `/pricing`, `/auth`)
- `robots.txt` allowing `/demo` and `/pricing`, disallowing authenticated routes
- `sitemap.xml` for public pages
- JSON-LD structured data: SoftwareApplication schema on `/demo`
- Canonical URLs on all pages

**Files:**
- `frontend/index.html` — default meta tags
- `frontend/public/robots.txt` — create/update
- `frontend/public/sitemap.xml` — create
- Route-level meta tag updates via `document.title` in useEffect

### E4: Error Resilience Verification

**Solution:**
- Verify ErrorBoundary on all page-level components
- Test offline mode: Service Worker fallback serves cached app shell
- Test API timeout/error scenarios: verify QueryErrorState appears correctly
- Test demo mode fallback when backend is unreachable
- Verify no unhandled promise rejections in console

### E5: Quality Evidence Documentation

**Solution:**
- Lighthouse reports: save as PDF in `docs/quality/`
- Bundle size report: before/after comparison table
- Test coverage summary: 7,765+ tests, 0 failures
- Core Web Vitals comparison: before/after Phase A
- Architecture diagram: update with demo mode + billing infrastructure

**Files:**
- `docs/quality/lighthouse-report-YYYY-MM-DD.pdf` — generated reports
- `docs/quality/bundle-analysis.md` — size comparison
- `docs/quality/performance-metrics.md` — CWV before/after

**Success Criteria:**
- Lighthouse 95+ on Performance, Accessibility, Best Practices
- SEO 90+ on public pages
- Zero console errors in demo flow
- Quality evidence documented and committable

---

## Scope Exclusions

| Excluded | Reason |
|----------|--------|
| i18n completion (EN/ES/FR) | German sufficient for portfolio, low priority |
| Functional Stripe Checkout | Portfolio doesn't need real payment flow |
| Separate landing page (zensation.ai) | Demo mode serves as the product showcase |
| New AI features | Codebase is already feature-complete (55 tools) |
| Database migrations for new features | Demo schema is the only new schema needed |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Demo data exposes patterns of real data | Use fictional but coherent data set, no real user data |
| Demo abuse (spam, resource exhaustion) | Strict rate limits, 24h TTL, no code execution |
| Bundle size regression from new components | Measure before/after, lazy-load all new DS components |
| Dark mode contrast failures | Use design tokens with verified contrast ratios |
| Lighthouse flakiness | Run 3 times, take median score |
