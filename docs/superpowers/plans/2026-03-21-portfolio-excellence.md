# Portfolio Excellence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ZenAI from feature-complete to portfolio-grade with Lighthouse 95+, interactive demo mode, UX polish, billing showcase, and quality evidence.

**Architecture:** 5 sequential phases (A-E), each with parallelizable subtasks. Phase A optimizes bundle/runtime performance. Phase B adds a demo schema + guided tour. Phase C extends the design system and polishes UX. Phase D adds a static pricing page + plan infrastructure. Phase E validates quality with Lighthouse and a11y audits.

**Tech Stack:** React 18 + TypeScript (Vite), Express.js + TypeScript, Supabase PostgreSQL, BullMQ, CSS animations, Lighthouse CI

**Spec:** `docs/superpowers/specs/2026-03-21-strategic-roadmap-design.md`

---

## Chunk 1: Phase A — Performance Excellence

### Task 1: Sentry Lazy-Loading

**Files:**
- Create: `frontend/src/services/sentry-lazy.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Create sentry-lazy.ts wrapper**

Create `frontend/src/services/sentry-lazy.ts` — a lightweight entry point that defers the heavy `@sentry/react` import:

```typescript
// frontend/src/services/sentry-lazy.ts
// This file is tiny — it just queues errors and lazy-loads the real sentry.ts module.

const errorQueue: Error[] = [];
let sentryLoaded = false;

export function queueError(error: Error): void {
  if (sentryLoaded) {
    // If sentry is already loaded, forward directly
    import('./sentry').then(mod => mod.captureException(error));
  } else {
    errorQueue.push(error);
  }
}

export function initSentryLazy(): void {
  const load = () => {
    // Dynamic import of sentry.ts which imports @sentry/react (~81KB gzip)
    import('./sentry').then((mod) => {
      mod.initSentry();
      sentryLoaded = true;
      // Flush queued errors
      for (const error of errorQueue) {
        mod.captureException(error);
      }
      errorQueue.length = 0;
    }).catch(() => {
      // Sentry failed to load — non-critical, continue without it
    });
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(load, { timeout: 3000 });
  } else {
    setTimeout(load, 3000);
  }
}
```

- [ ] **Step 2: Replace eager init in main.tsx**

In `frontend/src/main.tsx`, change the import and call:

```typescript
// Before (line 20):
import { initSentry } from './services/sentry';
// Before (line 26):
initSentry();

// After:
import { initSentryLazy } from './services/sentry-lazy';
// ...
initSentryLazy();
```

This changes the static import from `sentry.ts` (which pulls in `@sentry/react`) to `sentry-lazy.ts` (which is tiny and defers the heavy import).

- [ ] **Step 3: Update ErrorBoundary to queue errors pre-Sentry**

In `frontend/src/components/ErrorBoundary.tsx`, change the import to use the lazy wrapper:

```typescript
// Before:
import { captureException } from '../services/sentry';

// After:
import { queueError } from '../services/sentry-lazy';

componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
  queueError(error);  // Queues if Sentry not yet loaded, forwards if loaded
  console.error('ErrorBoundary caught:', error, errorInfo);
}
```

- [ ] **Step 4: Verify build succeeds**

Run: `cd frontend && npm run build`
Expected: Build succeeds, `vendor-sentry` chunk still exists but is no longer in the initial dependency graph (loaded on idle)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/sentry-lazy.ts frontend/src/main.tsx frontend/src/components/ErrorBoundary.tsx
git commit -m "perf: lazy-load Sentry SDK via requestIdleCallback"
```

---

### Task 2: Chunk Analysis & Lazy Page Audit

**Files:**
- Modify: `frontend/vite.config.ts`
- Check: `frontend/src/routes/LazyPages.tsx`

- [ ] **Step 1: Generate bundle visualization**

Run: `cd frontend && npx vite-bundle-visualizer`
Expected: Opens HTML report showing chunk sizes. Screenshot or note chunks > 150KB gzip.

- [ ] **Step 2: Verify all pages are lazy-loaded in LazyPages.tsx**

Read `frontend/src/routes/LazyPages.tsx` and verify every page component uses `React.lazy()`. List any that don't.

- [ ] **Step 3: Add missing lazy imports if any**

If any pages are directly imported in App.tsx instead of through LazyPages.tsx, move them.

- [ ] **Step 4: Verify manualChunks covers heavy vendor libs**

In `frontend/vite.config.ts`, verify these are in separate chunks:
- `@sentry/` → `vendor-sentry`
- `recharts` → own chunk
- `reactflow` → own chunk
- `react-syntax-highlighter` → own chunk
- `d3` → own chunk

Add any missing chunk splits.

- [ ] **Step 5: Build and verify chunk sizes**

Run: `cd frontend && npm run build`
Check output for chunk sizes. No application chunk should exceed 200KB gzip.

- [ ] **Step 6: Commit if changes made**

```bash
git add frontend/vite.config.ts frontend/src/routes/LazyPages.tsx
git commit -m "perf: optimize chunk splitting for lazy-loaded pages"
```

---

### Task 3: Asset Optimization

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add modulepreload hints for critical chunks**

In `frontend/index.html`, add preload hints in `<head>`:

```html
<!-- Critical font preloading -->
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

Note: Vite automatically generates modulepreload for entry chunks. Verify this in build output.

- [ ] **Step 2: Verify Service Worker precache is reasonable**

Read `frontend/public/sw.js`. Verify the precache list doesn't include large vendor chunks that are rarely needed.

- [ ] **Step 3: Commit if changes made**

```bash
git add frontend/index.html
git commit -m "perf: add font preconnect hints"
```

---

### Task 4: Runtime Performance

**Files:**
- Modify: `frontend/src/components/GeneralChat/ChatMessageList.tsx` (or equivalent)
- Modify: `frontend/src/components/CommandPalette.tsx`

- [ ] **Step 1: Add useDeferredValue to search inputs**

In `CommandPalette.tsx`, wrap the search query with `useDeferredValue`:

```typescript
import { useDeferredValue } from 'react';

// Inside component:
const [searchQuery, setSearchQuery] = useState('');
const deferredQuery = useDeferredValue(searchQuery);
// Use deferredQuery for filtering, searchQuery for input display
```

Apply the same pattern to any other search inputs (Ideas filter, Contacts search) that filter large lists.

- [ ] **Step 2: Add React.memo to frequently rendered list items**

Wrap these components in `React.memo()` if not already:
- `IdeaCard` (or equivalent card component in Ideas list)
- `SuggestionCard` (in SmartSurface)
- Chat message items

Pattern:
```typescript
export const IdeaCard = React.memo(function IdeaCard(props: IdeaCardProps) {
  // existing implementation
});
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ frontend/src/hooks/
git commit -m "perf: add useDeferredValue for search, React.memo for list items"
```

---

## Chunk 2: Phase B — Interactive Demo Mode (Backend)

### Task 5: Demo Schema Migration

**Files:**
- Create: `backend/sql/migrations/phase_demo_schema.sql`
- Modify: `backend/src/config/constants.ts`
- Modify: `backend/src/utils/database-context.ts`

- [ ] **Step 1: Write the migration SQL**

Create `backend/sql/migrations/phase_demo_schema.sql`. This replicates the existing schema structure for the `demo` context. Use the same pattern as the existing schema creation migrations:

```sql
-- Phase Demo: Create demo schema for interactive demo mode
CREATE SCHEMA IF NOT EXISTS demo;

-- Replicate all tables from personal schema into demo
-- Use: SELECT 'CREATE TABLE demo.' || tablename || ' (LIKE personal.' || tablename || ' INCLUDING ALL);'
-- FROM pg_tables WHERE schemaname = 'personal';
-- to generate the full list

-- Core tables (same structure as other 4 schemas)
CREATE TABLE IF NOT EXISTS demo.ideas (LIKE personal.ideas INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_relations (LIKE personal.idea_relations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.topics (LIKE personal.topics INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.chat_sessions (LIKE personal.chat_sessions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.chat_messages (LIKE personal.chat_messages INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.learned_facts (LIKE personal.learned_facts INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.tasks (LIKE personal.tasks INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.task_dependencies (LIKE personal.task_dependencies INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.projects (LIKE personal.projects INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.emails (LIKE personal.emails INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.email_accounts (LIKE personal.email_accounts INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.contacts (LIKE personal.contacts INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.organizations (LIKE personal.organizations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.calendar_events (LIKE personal.calendar_events INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.canvas_documents (LIKE personal.canvas_documents INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.knowledge_entities (LIKE personal.knowledge_entities INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.entity_relations (LIKE personal.entity_relations INCLUDING ALL);
-- ... continue for ALL tables in personal schema
-- Generate the full list by querying: SELECT tablename FROM pg_tables WHERE schemaname = 'personal' ORDER BY tablename;
```

Note: The implementing agent should query `pg_tables` to get the complete table list and generate all CREATE TABLE statements.

- [ ] **Step 2: Add 'demo' to VALID_CONTEXTS**

In `backend/src/config/constants.ts`, modify line 199:

```typescript
// Before:
export const VALID_CONTEXTS = ['personal', 'work', 'learning', 'creative'] as const;

// After:
export const VALID_CONTEXTS = ['personal', 'work', 'learning', 'creative', 'demo'] as const;
```

The `AIContext` type on line 200 auto-updates since it derives from `VALID_CONTEXTS`.

- [ ] **Step 3: Add demo search path**

In `backend/src/utils/database-context.ts`, add to the `SEARCH_PATH_SQL` record (around line 34):

```typescript
const SEARCH_PATH_SQL: Record<AIContext, string> = {
  personal: 'SET search_path TO personal, public',
  work: 'SET search_path TO work, public',
  learning: 'SET search_path TO learning, public',
  creative: 'SET search_path TO creative, public',
  demo: 'SET search_path TO demo, public',
};
```

- [ ] **Step 4: Run backend build to verify types**

Run: `cd backend && npm run build`
Expected: Build succeeds. Any places that switch on `AIContext` exhaustively may need updating — fix them.

- [ ] **Step 5: Commit**

```bash
git add backend/sql/migrations/phase_demo_schema.sql backend/src/config/constants.ts backend/src/utils/database-context.ts
git commit -m "feat(demo): add demo schema and context infrastructure"
```

---

### Task 6: Demo Seed Data

**Files:**
- Create: `backend/src/services/demo/demo-data.ts`
- Create: `backend/src/services/demo/demo-seed.ts`

- [ ] **Step 1: Create demo data definitions**

Create `backend/src/services/demo/demo-data.ts` with static demo data:

```typescript
// Persona: "Startup-Gründer Alexander" — coherent thematic data set
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

export const DEMO_IDEAS = [
  {
    id: 'demo-idea-001',
    title: 'AI-gestützte Kundenanalyse',
    content: 'Machine Learning Modell zur Vorhersage von Kundenverhalten...',
    status: 'active',
    priority: 'high',
    context: 'demo' as const,
    user_id: DEMO_USER_ID,
  },
  // ... 19 more ideas with various statuses (active, incubating, archived)
  // Topics: AI/ML, Startup Operations, Product Development, Marketing
];

export const DEMO_PROJECTS = [
  {
    id: 'demo-project-001',
    name: 'MVP Launch Q2',
    description: 'Minimum Viable Product für den Marktstart im zweiten Quartal',
    status: 'active',
    context: 'demo' as const,
    user_id: DEMO_USER_ID,
  },
  // ... 4 more projects
];

export const DEMO_TASKS = [
  // 15 tasks distributed across projects and Kanban columns
  // statuses: backlog, todo, in_progress, done
];

export const DEMO_EMAILS = [
  // 10 emails: 5 inbox, 3 sent, 2 drafts
];

export const DEMO_CONTACTS = [
  // 8 contacts with organizations
];

export const DEMO_CHAT_SESSIONS = [
  // 3 chat sessions with realistic messages including tool usage
];

export const DEMO_MEMORY_FACTS = [
  // Working memory + long-term facts to show Memory Transparency
];

export const DEMO_CANVAS_DOCS = [
  // 2 canvas documents (markdown content)
];
```

Note: The implementing agent should flesh out all data arrays with realistic, coherent German content.

- [ ] **Step 2: Create seed service**

Create `backend/src/services/demo/demo-seed.ts`:

```typescript
import { queryContext } from '../../utils/database-context';
import { DEMO_IDEAS, DEMO_PROJECTS, DEMO_TASKS, DEMO_EMAILS,
         DEMO_CONTACTS, DEMO_CHAT_SESSIONS, DEMO_MEMORY_FACTS,
         DEMO_CANVAS_DOCS, DEMO_USER_ID } from './demo-data';
import { logger } from '../../utils/logger';

export async function seedDemoData(): Promise<void> {
  logger.info('Seeding demo data...');

  // Clear existing demo data first (idempotent)
  await clearDemoData();

  // Seed in dependency order
  for (const idea of DEMO_IDEAS) {
    await queryContext('demo',
      `INSERT INTO ideas (id, title, content, status, priority, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [idea.id, idea.title, idea.content, idea.status, idea.priority, idea.user_id]
    );
  }

  // ... similar for projects, tasks, emails, contacts, chat sessions, memory facts, canvas docs

  logger.info('Demo data seeded successfully');
}

export async function clearDemoData(): Promise<void> {
  const tables = [
    'canvas_documents', 'chat_messages', 'chat_sessions',
    'learned_facts', 'task_dependencies', 'tasks', 'projects',
    'emails', 'contacts', 'organizations', 'idea_relations', 'ideas'
  ];

  for (const table of tables) {
    await queryContext('demo', `DELETE FROM ${table} WHERE user_id = $1`, [DEMO_USER_ID]);
  }
}
```

- [ ] **Step 3: Run backend build**

Run: `cd backend && npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/demo/
git commit -m "feat(demo): add demo data definitions and seed service"
```

---

### Task 7: Demo Auth & Guard Middleware

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/middleware/jwt-auth.ts`
- Create: `backend/src/middleware/demo-guard.ts`
- Create: `backend/src/services/demo/demo-cleanup.ts`

- [ ] **Step 1: Write demo auth test**

Create `backend/src/__tests__/unit/middleware/demo-auth.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';
// Test that POST /api/auth/demo returns a valid JWT with isDemo: true
// Test that demo token has plan: 'pro'
// Test that demo rate limits are enforced (50 req/min)
```

- [ ] **Step 2: Add demo endpoint to auth routes**

In `backend/src/routes/auth.ts`, add:

```typescript
import jwt from 'jsonwebtoken';

// POST /api/auth/demo — create temporary demo session
router.post('/demo', asyncHandler(async (req, res) => {
  const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

  // Sign directly with jsonwebtoken — don't use generateTokenPair() since
  // demo users don't need refresh tokens or session store entries
  const accessToken = jwt.sign(
    {
      sub: DEMO_USER_ID,
      email: 'demo@zensation.ai',
      role: 'viewer',
      plan: 'pro',
      isDemo: true,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: DEMO_USER_ID,
        email: 'demo@zensation.ai',
        name: 'Demo User',
        plan: 'pro',
        isDemo: true,
      },
    },
  });
}));
```

- [ ] **Step 3: Extend jwtUser type and update JWT middleware**

In `backend/src/middleware/jwt-auth.ts`, update the type augmentation (lines 21-32):

```typescript
declare global {
  namespace Express {
    interface Request {
      jwtUser?: {
        id: string;
        email: string;
        role: string;
        plan?: string;    // Plan tier: 'free' | 'pro' | 'enterprise'
        isDemo?: boolean;  // True for demo sessions
      };
    }
  }
}
```

Then, after the line where `req.jwtUser` is set from the verified payload, add demo context forcing:

```typescript
// After req.jwtUser is set:
if (payload.isDemo) {
  req.jwtUser!.isDemo = true;
  req.jwtUser!.plan = payload.plan || 'pro';
  // Force demo context — override any :context param
  req.params.context = 'demo';
}
```

- [ ] **Step 4: Create demo guard middleware**

Create `backend/src/middleware/demo-guard.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const DEMO_RATE_LIMITS = {
  requestsPerMinute: 50,
  chatMessagesPerMinute: 5,
};

const demoRequestCounts = new Map<string, { count: number; resetAt: number }>();

export function demoGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.jwtUser?.isDemo) {
    next();
    return;
  }

  // Rate limiting for demo users
  const now = Date.now();
  const key = `demo:${req.jwtUser.id}`;
  const entry = demoRequestCounts.get(key);

  if (!entry || now > entry.resetAt) {
    demoRequestCounts.set(key, { count: 1, resetAt: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > DEMO_RATE_LIMITS.requestsPerMinute) {
      res.status(429).json({
        success: false,
        error: 'Demo rate limit exceeded. Create an account for unlimited access.',
      });
      return;
    }
  }

  // Block restricted operations
  const restrictedPaths = ['/api/code/execute', '/api/code/run'];
  if (restrictedPaths.some(p => req.path.startsWith(p))) {
    res.status(403).json({
      success: false,
      error: 'Code execution is not available in demo mode. Create an account to use this feature.',
    });
    return;
  }

  next();
}
```

- [ ] **Step 5: Register demo guard in main.ts**

In `backend/src/main.ts`, add after auth middleware:

```typescript
import { demoGuard } from './middleware/demo-guard';
// After auth middleware registration:
app.use(demoGuard);
```

- [ ] **Step 6: Create demo cleanup worker**

Create `backend/src/services/demo/demo-cleanup.ts`:

```typescript
import { clearDemoData, seedDemoData } from './demo-seed';
import { logger } from '../../utils/logger';

export async function cleanupExpiredDemoData(): Promise<void> {
  logger.info('Cleaning up demo data and re-seeding...');
  try {
    await clearDemoData();
    await seedDemoData();
    logger.info('Demo data refreshed successfully');
  } catch (error) {
    logger.error('Demo cleanup failed:', error);
  }
}
```

- [ ] **Step 7: Run tests**

Run: `cd backend && npm test -- --testPathPattern="demo-auth"`
Expected: Tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/middleware/jwt-auth.ts backend/src/middleware/demo-guard.ts backend/src/services/demo/demo-cleanup.ts backend/src/main.ts backend/src/__tests__/
git commit -m "feat(demo): add demo auth endpoint, guard middleware, cleanup worker"
```

---

## Chunk 3: Phase B — Interactive Demo Mode (Frontend)

### Task 8: Demo Entry Page

**Files:**
- Create: `frontend/src/components/DemoPage/DemoPage.tsx`
- Create: `frontend/src/components/DemoPage/DemoPage.css`
- Modify: `frontend/src/routes/LazyPages.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create DemoPage component**

Create `frontend/src/components/DemoPage/DemoPage.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '../../design-system/components';
import './DemoPage.css';

interface DemoPageProps {
  onDemoStart: () => void;
  onNavigateToAuth: () => void;
}

export default function DemoPage({ onDemoStart, onNavigateToAuth }: DemoPageProps) {
  const [loading, setLoading] = useState(false);

  const handleStartDemo = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/demo', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('zenai_token', data.data.accessToken);
        localStorage.setItem('zenai_demo', 'true');
        onDemoStart();
      }
    } catch {
      // Fallback: show error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="demo-page">
      <div className="demo-hero">
        <div className="demo-logo">
          <img src="/logo.svg" alt="ZenAI" width={64} height={64} />
        </div>
        <h1 className="demo-title">ZenAI</h1>
        <p className="demo-subtitle">Dein persönliches AI-Betriebssystem</p>

        <div className="demo-features animate-stagger">
          <div className="demo-feature-card animate-spring-in">
            <span className="demo-feature-icon">🧠</span>
            <h3>4-Layer Memory</h3>
            <p>KI die sich erinnert und dazulernt</p>
          </div>
          <div className="demo-feature-card animate-spring-in">
            <span className="demo-feature-icon">🤖</span>
            <h3>55 AI Tools</h3>
            <p>Von Recherche bis Code-Ausführung</p>
          </div>
          <div className="demo-feature-card animate-spring-in">
            <span className="demo-feature-icon">🔗</span>
            <h3>Knowledge Graph</h3>
            <p>Verbindungen automatisch erkennen</p>
          </div>
          <div className="demo-feature-card animate-spring-in">
            <span className="demo-feature-icon">👥</span>
            <h3>Multi-Agent Teams</h3>
            <p>Spezialisten arbeiten zusammen</p>
          </div>
        </div>

        <div className="demo-actions">
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartDemo}
            disabled={loading}
          >
            {loading ? 'Wird geladen...' : 'Demo starten'}
          </Button>
          <button className="demo-auth-link" onClick={onNavigateToAuth}>
            Account erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DemoPage styles**

Create `frontend/src/components/DemoPage/DemoPage.css` with full-screen hero, glass cards, dark theme.

- [ ] **Step 3: Add to LazyPages and App routing**

In `frontend/src/routes/LazyPages.tsx`:
```typescript
export const DemoPage = lazy(() => import('../components/DemoPage/DemoPage'));
```

In `frontend/src/App.tsx`, add `/demo` as a public route (before auth check):
```typescript
// Before the auth-gated routes:
if (currentPath === '/demo') {
  return <Suspense fallback={<PageLoader />}><DemoPage onDemoStart={...} onNavigateToAuth={...} /></Suspense>;
}
```

- [ ] **Step 4: Add demo badge to TopBar**

In `frontend/src/components/layout/TopBar.tsx`, add a demo indicator:
```tsx
{localStorage.getItem('zenai_demo') === 'true' && (
  <div className="topbar-demo-badge">
    <span className="demo-pill">Demo</span>
    <button onClick={onNavigateToAuth} className="demo-cta">Account erstellen</button>
  </div>
)}
```

- [ ] **Step 5: Write DemoPage test**

Create `frontend/src/components/DemoPage/__tests__/DemoPage.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import DemoPage from '../DemoPage';

test('renders demo page with CTA button', () => {
  render(<DemoPage onDemoStart={vi.fn()} onNavigateToAuth={vi.fn()} />);
  expect(screen.getByText('Demo starten')).toBeInTheDocument();
  expect(screen.getByText('Account erstellen')).toBeInTheDocument();
});

test('renders feature highlight cards', () => {
  render(<DemoPage onDemoStart={vi.fn()} onNavigateToAuth={vi.fn()} />);
  expect(screen.getByText('4-Layer Memory')).toBeInTheDocument();
  expect(screen.getByText('55 AI Tools')).toBeInTheDocument();
});
```

- [ ] **Step 6: Build and verify**

Run: `cd frontend && npm run build && npx vitest run DemoPage`
Expected: Build succeeds, tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DemoPage/ frontend/src/routes/LazyPages.tsx frontend/src/App.tsx frontend/src/components/layout/TopBar.tsx
git commit -m "feat(demo): add demo entry page with feature highlights"
```

---

### Task 9: Guided Tour

**Files:**
- Create: `frontend/src/components/GuidedTour/GuidedTour.tsx`
- Create: `frontend/src/components/GuidedTour/GuidedTour.css`
- Create: `frontend/src/components/GuidedTour/tour-steps.ts`
- Create: `frontend/src/hooks/useGuidedTour.ts`

- [ ] **Step 1: Define tour steps**

Create `frontend/src/components/GuidedTour/tour-steps.ts`:

```typescript
export interface TourStep {
  id: string;
  targetSelector: string;  // CSS selector for spotlight element
  title: string;
  description: string;
  page: string;  // Route to navigate to
  position: 'top' | 'bottom' | 'left' | 'right';
}

// IMPORTANT: Routes use German slugs. Verified against App.tsx.
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'chat',
    targetSelector: '[data-tour="chat-hub"]',  // Add data-tour attrs to target components
    title: 'Chatte mit deiner KI',
    description: 'Sie kennt deinen Kontext, nutzt 55 Tools und merkt sich alles.',
    page: '/',  // ChatHub is the root route
    position: 'right',
  },
  {
    id: 'ideas',
    targetSelector: '[data-tour="ideas"]',
    title: 'Gedanken festhalten',
    description: 'Ideen erfassen, entwickeln und mit KI-Unterstützung weiterentwickeln.',
    page: '/ideen',
    position: 'bottom',
  },
  {
    id: 'kanban',
    targetSelector: '[data-tour="kanban"]',
    title: 'Aufgaben organisieren',
    description: 'Kanban-Board mit Drag-and-Drop, Projekten und Abhängigkeiten.',
    page: '/planer/tasks',
    position: 'bottom',
  },
  {
    id: 'memory',
    targetSelector: '[data-tour="memory"]',
    title: 'KI-Transparenz',
    description: 'Sieh genau was deine KI sich merkt — Working Memory, Fakten, Prozeduren.',
    page: '/meine-ki',  // Tab: memory (passed as tab param)
    position: 'left',
  },
  {
    id: 'agents',
    targetSelector: '[data-tour="agents"]',
    title: 'Multi-Agenten Teams',
    description: 'Researcher, Writer, Coder und Reviewer arbeiten als Team zusammen.',
    page: '/ideen/workshop',  // Workshop is under /ideen/workshop
    position: 'bottom',
  },
  {
    id: 'insights',
    targetSelector: '[data-tour="insights"]',
    title: 'Knowledge Graph',
    description: 'Automatisch erkannte Verbindungen zwischen deinen Gedanken.',
    page: '/cockpit/trends',  // InsightsDashboard is at /cockpit/trends
    position: 'bottom',
  },
  {
    id: 'voice',
    targetSelector: '[data-tour="voice"]',
    title: 'Sprich mit deiner KI',
    description: 'Echtzeit-Sprachinteraktion mit Transkription und Audio-Visualisierung.',
    page: '/meine-ki/voice-chat',
    position: 'right',
  },
  {
    id: 'business',
    targetSelector: '[data-tour="business"]',
    title: 'Business Dashboard',
    description: 'Revenue, Traffic, SEO und System-Gesundheit auf einen Blick.',
    page: '/cockpit',
    position: 'bottom',
  },
];

// NOTE: Each target component must add data-tour="<id>" attribute to its root element.
// This is more reliable than CSS class selectors which may change.
```

- [ ] **Step 2: Create tour hook**

Create `frontend/src/hooks/useGuidedTour.ts`:

```typescript
import { useState, useCallback } from 'react';
import { TOUR_STEPS } from '../components/GuidedTour/tour-steps';

const STORAGE_KEY = 'zenai_tour_completed';

export function useGuidedTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const isCompleted = localStorage.getItem(STORAGE_KEY) === 'true';

  const start = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const next = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      complete();
    }
  }, [currentStep]);

  const back = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skip = useCallback(() => {
    complete();
  }, []);

  const complete = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  return {
    isActive,
    isCompleted,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    step: TOUR_STEPS[currentStep],
    start,
    next,
    back,
    skip,
  };
}
```

- [ ] **Step 3: Create GuidedTour component**

Create `frontend/src/components/GuidedTour/GuidedTour.tsx`:

A spotlight overlay component that:
- Renders a full-screen semi-transparent overlay
- Cuts out the target element using CSS `clip-path` (calculated from `getBoundingClientRect()`)
- Shows a tooltip card with title, description, step counter, and Next/Back/Skip buttons
- Calls `onNavigate(step.page)` when the step changes to navigate to the correct page

- [ ] **Step 4: Create GuidedTour styles**

Create `frontend/src/components/GuidedTour/GuidedTour.css`:
- Overlay: `position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.7)`
- Spotlight: CSS `clip-path: polygon(...)` or `mix-blend-mode` approach
- Tooltip: glass card with `backdrop-filter: blur(16px)`, positioned relative to target
- Progress dots at bottom
- Animations: spring-in for tooltip, fade for overlay

- [ ] **Step 5: Integrate in AppLayout**

In `frontend/src/components/layout/AppLayout.tsx`, add:
```tsx
import { GuidedTour } from '../GuidedTour/GuidedTour';
import { useGuidedTour } from '../../hooks/useGuidedTour';

// Inside component:
const tour = useGuidedTour();

// Auto-offer tour for demo users on first visit:
useEffect(() => {
  if (localStorage.getItem('zenai_demo') === 'true' && !tour.isCompleted) {
    tour.start();
  }
}, []);

// In render:
{tour.isActive && <GuidedTour {...tour} onNavigate={handleNavigate} />}
```

- [ ] **Step 6: Write GuidedTour and useGuidedTour tests**

Create `frontend/src/components/GuidedTour/__tests__/GuidedTour.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { GuidedTour } from '../GuidedTour';
import { TOUR_STEPS } from '../tour-steps';

test('renders first tour step', () => {
  render(<GuidedTour isActive={true} currentStep={0} step={TOUR_STEPS[0]}
    totalSteps={TOUR_STEPS.length} next={vi.fn()} back={vi.fn()} skip={vi.fn()} onNavigate={vi.fn()} />);
  expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
});

test('calls next on button click', () => {
  const next = vi.fn();
  render(<GuidedTour isActive={true} currentStep={0} step={TOUR_STEPS[0]}
    totalSteps={TOUR_STEPS.length} next={next} back={vi.fn()} skip={vi.fn()} onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByText(/weiter/i));
  expect(next).toHaveBeenCalled();
});

test('calls skip on skip click', () => {
  const skip = vi.fn();
  render(<GuidedTour isActive={true} currentStep={0} step={TOUR_STEPS[0]}
    totalSteps={TOUR_STEPS.length} next={vi.fn()} back={vi.fn()} skip={skip} onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByText(/überspringen/i));
  expect(skip).toHaveBeenCalled();
});
```

Create `frontend/src/hooks/__tests__/useGuidedTour.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useGuidedTour } from '../useGuidedTour';

test('starts inactive', () => {
  const { result } = renderHook(() => useGuidedTour());
  expect(result.current.isActive).toBe(false);
});

test('start() activates tour at step 0', () => {
  const { result } = renderHook(() => useGuidedTour());
  act(() => result.current.start());
  expect(result.current.isActive).toBe(true);
  expect(result.current.currentStep).toBe(0);
});

test('next() advances step', () => {
  const { result } = renderHook(() => useGuidedTour());
  act(() => result.current.start());
  act(() => result.current.next());
  expect(result.current.currentStep).toBe(1);
});
```

- [ ] **Step 7: Build and test**

Run: `cd frontend && npm run build && npx vitest run GuidedTour useGuidedTour`
Expected: Build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/GuidedTour/ frontend/src/hooks/useGuidedTour.ts frontend/src/hooks/__tests__/useGuidedTour.test.ts frontend/src/components/layout/AppLayout.tsx
git commit -m "feat(demo): add guided tour with spotlight overlay and 8 steps"
```

---

## Chunk 4: Phase C — UX Polish

### Task 10: Design System — Table Component

**Files:**
- Create: `frontend/src/design-system/components/Table.tsx`
- Create: `frontend/src/design-system/components/Table.css`
- Create: `frontend/src/design-system/components/__tests__/Table.test.tsx`
- Modify: `frontend/src/design-system/components/index.ts`

- [ ] **Step 1: Write Table component test**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Table } from '../Table';

const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status' },
];
const data = [
  { id: '1', name: 'Alpha', status: 'active' },
  { id: '2', name: 'Beta', status: 'inactive' },
];

test('renders table with data', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.getByText('Beta')).toBeInTheDocument();
});

test('sorts by column when clicked', () => {
  render(<Table columns={columns} data={data} />);
  fireEvent.click(screen.getByText('Name'));
  // Verify sort indicator appears
  expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort');
});

test('renders empty state when no data', () => {
  render(<Table columns={columns} data={[]} emptyMessage="Keine Daten" />);
  expect(screen.getByText('Keine Daten')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement Table component**

Implement with: sortable columns (click header), row selection (optional checkbox), pagination (optional), responsive horizontal scroll on mobile, `aria-sort` attributes, `ds-table` CSS prefix.

- [ ] **Step 3: Run test**

Run: `cd frontend && npx vitest run Table`
Expected: All tests pass.

- [ ] **Step 4: Add to index.ts exports**

In `frontend/src/design-system/components/index.ts`, add:
```typescript
export { Table } from './Table';
export type { TableColumn, TableProps } from './Table';
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/components/Table.tsx frontend/src/design-system/components/Table.css frontend/src/design-system/components/__tests__/Table.test.tsx frontend/src/design-system/components/index.ts
git commit -m "feat(ds): add Table component with sorting, pagination, a11y"
```

---

### Task 11: Design System — Select/Combobox Component

**Files:**
- Create: `frontend/src/design-system/components/Select.tsx`
- Create: `frontend/src/design-system/components/Select.css`
- Create: `frontend/src/design-system/components/__tests__/Select.test.tsx`
- Modify: `frontend/src/design-system/components/index.ts`

- [ ] **Step 1: Write Select test**

Test: renders options, search filtering, keyboard navigation (ArrowDown/Up/Enter/Escape), multi-select, `aria-expanded`/`aria-selected` attributes.

- [ ] **Step 2: Implement Select component**

Features: dropdown with search input, single/multi select, keyboard navigation, `ds-select` prefix, dark mode, ARIA listbox pattern.

- [ ] **Step 3: Run test and commit**

```bash
git add frontend/src/design-system/components/Select.*
git commit -m "feat(ds): add Select/Combobox component with search and keyboard nav"
```

---

### Task 12: Design System — DatePicker Component

**Files:**
- Create: `frontend/src/design-system/components/DatePicker.tsx`
- Create: `frontend/src/design-system/components/DatePicker.css`
- Create: `frontend/src/design-system/components/__tests__/DatePicker.test.tsx`
- Modify: `frontend/src/design-system/components/index.ts`

- [ ] **Step 1: Write DatePicker test**

Test: renders calendar grid, navigates months, selects date, range selection, min/max date bounds, German locale (Mo/Di/Mi...).

- [ ] **Step 2: Implement DatePicker component**

Features: calendar popup, month/year navigation, range selection (optional), locale-aware day names, `ds-datepicker` prefix, `aria-label` on all buttons.

- [ ] **Step 3: Run test and commit**

```bash
git add frontend/src/design-system/components/DatePicker.*
git commit -m "feat(ds): add DatePicker component with calendar, range, locale support"
```

---

### Task 13: Design System — Breadcrumb Component

**Files:**
- Create: `frontend/src/design-system/components/Breadcrumb.tsx`
- Create: `frontend/src/design-system/components/Breadcrumb.css`
- Modify: `frontend/src/design-system/components/index.ts`

- [ ] **Step 1: Implement Breadcrumb as DS component**

Formalize the existing `Breadcrumbs.tsx` pattern into a proper DS component:
- Props: `items: Array<{ label: string; href?: string }>`, `separator?: string`, `maxItems?: number`
- Collapse with ellipsis when `items.length > maxItems`
- `aria-label="Breadcrumb"` on `<nav>`, `aria-current="page"` on last item
- `ds-breadcrumb` CSS prefix

- [ ] **Step 2: Commit**

```bash
git add frontend/src/design-system/components/Breadcrumb.*
git commit -m "feat(ds): add Breadcrumb DS component (formalized from existing)"
```

---

### Task 14: Micro-Interactions & Animations

**Files:**
- Modify: `frontend/src/styles/animations.css`
- Various component CSS files

- [ ] **Step 1: Add page transition and hover utilities to animations.css**

```css
/* Page transitions — View Transitions API progressive enhancement */
@view-transition {
  navigation: auto;
}

::view-transition-old(root) {
  animation: fade-out 150ms ease-out;
}

::view-transition-new(root) {
  animation: fade-in 150ms ease-in;
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Hover lift for interactive cards */
.hover-lift {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hover-lift:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: var(--shadow-lg);
}

/* Skeleton to content fade */
.skeleton-fade-enter {
  opacity: 0;
}

.skeleton-fade-enter-active {
  opacity: 1;
  transition: opacity 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .hover-lift:hover {
    transform: none;
  }
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }
}
```

- [ ] **Step 2: Apply hover-lift class to interactive cards**

Add `hover-lift` class to: IdeaCard, SuggestionCard, DemoPage feature cards, and other clickable cards.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/animations.css
git commit -m "feat(ux): add page transitions, hover-lift, skeleton-fade animations"
```

---

### Task 15: Dark Mode & Consistency Audit

**Files:**
- Various CSS files

- [ ] **Step 1: Audit all pages in dark mode**

Systematically check each page for contrast issues, missing glass effects, and inconsistent styling. Fix issues found.

Key areas to check:
- Text contrast (minimum 4.5:1 for WCAG AA)
- Glass effects on modals, popovers, dropdowns
- Chart colors (Recharts) — need dark-mode palette
- Focus-visible outlines visible in dark mode
- Empty states, error states, loading skeletons

- [ ] **Step 2: Verify QueryErrorState on all pages**

Check that all pages use `QueryErrorState` for error display. Add where missing.

- [ ] **Step 3: Verify PageSkeleton/SmartPageSkeleton on all pages**

Check that all pages use skeleton loading. Add where missing.

- [ ] **Step 4: Commit fixes**

```bash
git add frontend/src/components/ frontend/src/styles/ frontend/src/design-system/
git commit -m "fix(ux): dark mode contrast fixes, consistent error/loading states"
```

---

### Task 16: Mobile UX Hooks

**Files:**
- Create: `frontend/src/hooks/useSwipeGesture.ts`
- Create: `frontend/src/components/shared/BottomSheet.tsx`
- Create: `frontend/src/components/shared/BottomSheet.css`

- [ ] **Step 1: Create swipe gesture hook**

```typescript
import { useRef, useCallback } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function useSwipeGesture(handlers: SwipeHandlers, threshold = 80) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      if (dx > 0) handlers.onSwipeRight?.();
      else handlers.onSwipeLeft?.();
    }
    touchStart.current = null;
  }, [handlers, threshold]);

  return { onTouchStart, onTouchEnd };
}
```

- [ ] **Step 2: Create BottomSheet component**

A mobile-first modal replacement:
- Slides up from bottom on mobile (< 768px)
- Regular centered modal on desktop
- Drag handle at top for dismiss gesture
- `aria-modal="true"`, focus trap, Escape to close

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSwipeGesture.ts frontend/src/components/shared/BottomSheet.*
git commit -m "feat(ux): add swipe gesture hook and BottomSheet component for mobile"
```

---

## Chunk 5: Phase D — Billing Showcase + Phase E — Final Polish

### Task 17: Pricing Page

**Files:**
- Create: `frontend/src/components/PricingPage/PricingPage.tsx`
- Create: `frontend/src/components/PricingPage/PricingPage.css`
- Modify: `frontend/src/routes/LazyPages.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create PricingPage component**

Three-tier pricing card layout:
- **Free:** 5 Ideas, 10 Chat/day, 1 Context, Basic RAG — CTA: "Kostenlos starten"
- **Pro (€19/mo, €15/mo yearly):** Unlimited — CTA: "Pro testen" (links to `/demo`)
- **Enterprise (Custom):** Team, SSO, SLA — CTA: "Kontakt" (mailto link)
- Monthly/Yearly toggle with 20% discount highlight
- Feature comparison table below cards
- Responsive: cards stack on mobile

- [ ] **Step 2: Add styles with glass effect**

Glass cards, gradient borders on "Pro" (highlighted/recommended), responsive grid.

- [ ] **Step 3: Add to routing**

In `LazyPages.tsx`:
```typescript
export const PricingPage = lazy(() => import('../components/PricingPage/PricingPage'));
```

In `App.tsx`, add `/pricing` as public route (alongside `/demo`).

- [ ] **Step 4: Write PricingPage test**

Create `frontend/src/components/PricingPage/__tests__/PricingPage.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import PricingPage from '../PricingPage';

test('renders 3 pricing tiers', () => {
  render(<PricingPage />);
  expect(screen.getByText('Free')).toBeInTheDocument();
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(screen.getByText('Enterprise')).toBeInTheDocument();
});

test('toggles monthly/yearly pricing', () => {
  render(<PricingPage />);
  fireEvent.click(screen.getByText(/jährlich/i));
  expect(screen.getByText(/€15/)).toBeInTheDocument(); // yearly discount
});

test('renders feature comparison table', () => {
  render(<PricingPage />);
  expect(screen.getByText('Knowledge Graph')).toBeInTheDocument();
  expect(screen.getByText('Multi-Agent Teams')).toBeInTheDocument();
});
```

- [ ] **Step 5: Build and test**

Run: `cd frontend && npm run build && npx vitest run PricingPage`
Expected: Build succeeds, tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PricingPage/ frontend/src/routes/LazyPages.tsx frontend/src/App.tsx
git commit -m "feat(billing): add pricing page with 3 tiers and feature comparison"
```

---

### Task 18: Plan Badge & Feature Gate Stubs

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/hooks/usePlanFeatures.ts`
- Create: `frontend/src/types/plan.ts`
- Create: `backend/src/middleware/plan-gate.ts`

- [ ] **Step 1: Create plan types**

Create `frontend/src/types/plan.ts`:

```typescript
export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanFeatures {
  maxIdeas: number | 'unlimited';
  maxChatPerDay: number | 'unlimited';
  contexts: number;
  advancedRag: boolean;
  multiAgent: boolean;
  voiceChat: boolean;
  graphRag: boolean;
  codeExecution: boolean;
}

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: { maxIdeas: 5, maxChatPerDay: 10, contexts: 1, advancedRag: false, multiAgent: false, voiceChat: false, graphRag: false, codeExecution: false },
  pro: { maxIdeas: 'unlimited', maxChatPerDay: 'unlimited', contexts: 4, advancedRag: true, multiAgent: true, voiceChat: true, graphRag: true, codeExecution: true },
  enterprise: { maxIdeas: 'unlimited', maxChatPerDay: 'unlimited', contexts: 4, advancedRag: true, multiAgent: true, voiceChat: true, graphRag: true, codeExecution: true },
};
```

- [ ] **Step 2: Create usePlanFeatures hook**

Create `frontend/src/hooks/usePlanFeatures.ts`:

```typescript
import { PlanTier, PLAN_FEATURES, PlanFeatures } from '../types/plan';

export function usePlanFeatures(): {
  plan: PlanTier;
  features: PlanFeatures;
  canUse: (feature: keyof PlanFeatures) => boolean;
  isDemo: boolean;
} {
  // Read from JWT claims or localStorage
  const isDemo = localStorage.getItem('zenai_demo') === 'true';
  const plan: PlanTier = isDemo ? 'pro' : 'free'; // TODO: read from auth context

  const features = PLAN_FEATURES[plan];

  const canUse = (feature: keyof PlanFeatures): boolean => {
    const value = features[feature];
    return value === true || value === 'unlimited' || (typeof value === 'number' && value > 0);
  };

  return { plan, features, canUse, isDemo };
}
```

- [ ] **Step 3: Add plan badge to Sidebar footer**

In `frontend/src/components/layout/Sidebar.tsx`, in the footer area (around line 201-238), add:

```tsx
<div className="sidebar-plan-badge" onClick={() => onNavigate?.('pricing')}>
  <span className="plan-tier-label">
    {isDemo ? 'Pro (Demo)' : 'Free Plan'}
  </span>
</div>
```

- [ ] **Step 4: Create backend plan-gate middleware stub**

Create `backend/src/middleware/plan-gate.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

type PlanTier = 'free' | 'pro' | 'enterprise';

export function requirePlan(minPlan: PlanTier) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const jwtUser = req.jwtUser as any;
    const userPlan: PlanTier = jwtUser?.plan || 'free';

    const tierOrder: PlanTier[] = ['free', 'pro', 'enterprise'];
    const userTierIndex = tierOrder.indexOf(userPlan);
    const requiredTierIndex = tierOrder.indexOf(minPlan);

    if (userTierIndex < requiredTierIndex) {
      res.status(403).json({
        success: false,
        error: `This feature requires the ${minPlan} plan. Please upgrade.`,
        requiredPlan: minPlan,
        currentPlan: userPlan,
      });
      return;
    }

    next();
  };
}
```

- [ ] **Step 5: Write tests for usePlanFeatures and plan-gate**

Create `frontend/src/hooks/__tests__/usePlanFeatures.test.ts`:

```typescript
import { renderHook } from '@testing-library/react';
import { usePlanFeatures } from '../usePlanFeatures';

test('returns free plan by default', () => {
  localStorage.removeItem('zenai_demo');
  const { result } = renderHook(() => usePlanFeatures());
  expect(result.current.plan).toBe('free');
});

test('returns pro plan in demo mode', () => {
  localStorage.setItem('zenai_demo', 'true');
  const { result } = renderHook(() => usePlanFeatures());
  expect(result.current.plan).toBe('pro');
  expect(result.current.isDemo).toBe(true);
  localStorage.removeItem('zenai_demo');
});

test('canUse returns correct values for free plan', () => {
  localStorage.removeItem('zenai_demo');
  const { result } = renderHook(() => usePlanFeatures());
  expect(result.current.canUse('advancedRag')).toBe(false);
  expect(result.current.canUse('maxIdeas')).toBe(true); // 5 > 0
});
```

Create `backend/src/__tests__/unit/middleware/plan-gate.test.ts`:

```typescript
import { requirePlan } from '../../../middleware/plan-gate';
// Test that free user gets 403 for pro-required route
// Test that pro user passes through
// Test that missing plan defaults to free
```

- [ ] **Step 6: Run tests**

Run: `cd frontend && npx vitest run usePlanFeatures && cd ../backend && npm test -- --testPathPattern="plan-gate"`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/plan.ts frontend/src/hooks/usePlanFeatures.ts frontend/src/hooks/__tests__/usePlanFeatures.test.ts frontend/src/components/layout/Sidebar.tsx backend/src/middleware/plan-gate.ts backend/src/__tests__/unit/middleware/plan-gate.test.ts
git commit -m "feat(billing): add plan badge, feature gate stubs, plan types"
```

---

### Task 19: SEO & Meta Tags

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/public/robots.txt`
- Create: `frontend/public/sitemap.xml`

- [ ] **Step 1: Add meta tags to index.html**

```html
<meta name="description" content="ZenAI — Dein persönliches AI-Betriebssystem. 55 AI-Tools, 4-Layer Memory, Knowledge Graph, Multi-Agent Teams.">
<meta property="og:title" content="ZenAI — Personal AI OS">
<meta property="og:description" content="Das intelligenteste persönliche AI-System. Gedanken festhalten, Wissen vernetzen, Aufgaben automatisieren.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://frontend-mu-six-93.vercel.app">
<meta name="twitter:card" content="summary_large_image">
```

- [ ] **Step 2: Create robots.txt**

```
User-agent: *
Allow: /demo
Allow: /pricing
Disallow: /api/
Disallow: /ideen
Disallow: /chat
Disallow: /cockpit
Disallow: /planer
Disallow: /settings

Sitemap: https://frontend-mu-six-93.vercel.app/sitemap.xml
```

- [ ] **Step 3: Create sitemap.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://frontend-mu-six-93.vercel.app/demo</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://frontend-mu-six-93.vercel.app/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

- [ ] **Step 4: Add JSON-LD structured data**

In `frontend/index.html`, add before `</head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "ZenAI",
  "description": "Personal AI Operating System",
  "applicationCategory": "ProductivityApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR"
  }
}
</script>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html frontend/public/robots.txt frontend/public/sitemap.xml
git commit -m "feat(seo): add meta tags, robots.txt, sitemap, JSON-LD structured data"
```

---

### Task 20: Lighthouse & Accessibility Audit

**Files:**
- Create: `docs/quality/` directory

- [ ] **Step 1: Run Lighthouse on key pages**

Run Lighthouse (via Chrome DevTools or CLI) on:
1. `/demo` (entry point)
2. `/` (ChatHub — main page)
3. `/ideen` (ideas)
4. `/cockpit` (business dashboard)
5. `/pricing` (pricing page)

Target: Performance 95+, Accessibility 95+, Best Practices 95+, SEO 90+

- [ ] **Step 2: Fix all findings below target**

Common fixes:
- Missing `alt` attributes on images
- Contrast ratio issues (update CSS)
- Missing `<label>` on form inputs
- Missing `lang` attribute (should be `de`)
- Button without accessible name

- [ ] **Step 3: Run axe-core accessibility scan**

Either via browser extension or Playwright test:
```bash
npx playwright test --grep "accessibility"
```

Fix any violations found.

- [ ] **Step 4: Verify keyboard navigation**

Manual test: Tab through Demo → Tour → Chat → Ideas flow using only keyboard. Verify:
- Focus visible on all interactive elements
- Focus trap in modals
- Escape closes modals/popovers
- Arrow keys work in dropdowns/tabs

- [ ] **Step 5: Document quality evidence**

Create `docs/quality/performance-metrics.md` with before/after Lighthouse scores, bundle sizes, and CWV metrics.

- [ ] **Step 6: Commit**

```bash
git add docs/quality/ frontend/
git commit -m "fix(a11y): lighthouse and accessibility audit fixes, quality evidence"
```

---

### Task 21: Final Build & Test Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && npm test`
Expected: All tests pass (5,664+ pass, 24 skipped, 0 fail).

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (1,240+ pass).

- [ ] **Step 3: Build both projects**

Run: `cd backend && npm run build && cd ../frontend && npm run build`
Expected: Both build clean with 0 TypeScript errors.

- [ ] **Step 4: Verify demo flow end-to-end**

1. Navigate to `/demo`
2. Click "Demo starten"
3. Guided tour starts automatically
4. Navigate through all 8 steps
5. Verify demo data is visible on each page
6. Verify demo badge in TopBar
7. Verify rate limiting works

- [ ] **Step 5: Final commit**

```bash
git add docs/quality/
git commit -m "docs: add quality evidence — Lighthouse scores, bundle analysis"
```
