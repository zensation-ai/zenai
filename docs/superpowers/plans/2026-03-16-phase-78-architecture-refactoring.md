# Phase 78: Architecture Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `backend/src/main.ts` from 1,117 lines with 122 imports into a modular architecture with DI container, module system, and startup orchestrator. Target: main.ts < 50 lines.

**Architecture:** Create a lightweight DI container (`core/container.ts`), a module system where each feature registers its routes and services via a `Module` interface, and a startup orchestrator that handles initialization phases. All 80+ router registrations and 10+ service initializations move into their respective modules.

**Tech Stack:** TypeScript, Express.js, custom lightweight DI (no external library needed)

---

## File Structure

### New Files to Create

```
backend/src/
  core/
    container.ts           # Lightweight DI container (Map-based)
    module.ts              # Module interface definition
    startup.ts             # Startup orchestrator (init → connect → register → start)
    config.ts              # Validated config with Zod schemas
    shutdown.ts            # Graceful shutdown coordinator
    health.ts              # Health check aggregator
    middleware.ts          # Global middleware setup (extracted from main.ts)
    routes.ts              # Router registration coordinator
  modules/
    index.ts               # Module registry — exports all modules
    chat/
      index.ts             # ChatModule implements Module
    memory/
      index.ts             # MemoryModule implements Module
    ideas/
      index.ts             # IdeasModule implements Module
    email/
      index.ts             # EmailModule implements Module
    auth/
      index.ts             # AuthModule implements Module
    agents/
      index.ts             # AgentsModule implements Module
    voice/
      index.ts             # VoiceModule implements Module
    mcp/
      index.ts             # MCPModule implements Module
    observability/
      index.ts             # ObservabilityModule implements Module
    business/
      index.ts             # BusinessModule implements Module
    planner/
      index.ts             # PlannerModule implements Module (tasks, projects, calendar)
    contacts/
      index.ts             # ContactsModule implements Module
    finance/
      index.ts             # FinanceModule implements Module
    documents/
      index.ts             # DocumentsModule implements Module
    knowledge/
      index.ts             # KnowledgeModule implements Module (knowledge graph, RAG, graphrag)
    security/
      index.ts             # SecurityModule implements Module
    extensions/
      index.ts             # ExtensionsModule implements Module
    governance/
      index.ts             # GovernanceModule implements Module
    proactive/
      index.ts             # ProactiveModule implements Module
    browser/
      index.ts             # BrowserModule implements Module
```

### Files to Modify

```
backend/src/main.ts        # Rewrite to < 50 lines
```

### Files to Keep (NOT moved, just referenced by modules)

All existing route files (`backend/src/routes/*.ts`) and service files (`backend/src/services/**/*.ts`) stay in place. Modules only import and register them — no service logic moves.

---

## Chunk 1: Core Infrastructure

### Task 1: Module Interface & Container

**Files:**
- Create: `backend/src/core/module.ts`
- Create: `backend/src/core/container.ts`
- Test: `backend/src/__tests__/unit/core/container.test.ts`

- [ ] **Step 1: Define Module interface**

Create `backend/src/core/module.ts`:
```typescript
import { Router } from 'express';

export interface Module {
  name: string;

  /** Register routes on the provided router */
  registerRoutes(router: Router): void;

  /** Optional: async initialization (DB checks, schedulers, etc.) */
  onStartup?(): Promise<void>;

  /** Optional: cleanup on shutdown */
  onShutdown?(): Promise<void>;

  /** Optional: health check */
  healthCheck?(): Promise<{ healthy: boolean; details?: Record<string, unknown> }>;
}
```

- [ ] **Step 2: Write failing container test**

Create `backend/src/__tests__/unit/core/container.test.ts`:
```typescript
import { Container } from '../../../core/container';

describe('Container', () => {
  it('should register and resolve a service', () => {
    const container = new Container();
    container.register('config', () => ({ port: 3000 }));
    const config = container.resolve<{ port: number }>('config');
    expect(config.port).toBe(3000);
  });

  it('should return singleton by default', () => {
    const container = new Container();
    let count = 0;
    container.register('counter', () => ({ id: ++count }));
    const a = container.resolve('counter');
    const b = container.resolve('counter');
    expect(a).toBe(b);
  });

  it('should throw on unregistered service', () => {
    const container = new Container();
    expect(() => container.resolve('missing')).toThrow('Service "missing" not registered');
  });

  it('should support has() check', () => {
    const container = new Container();
    container.register('foo', () => 'bar');
    expect(container.has('foo')).toBe(true);
    expect(container.has('baz')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern="core/container" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 4: Implement Container**

Create `backend/src/core/container.ts`:
```typescript
type Factory<T = unknown> = () => T;

export class Container {
  private factories = new Map<string, Factory>();
  private instances = new Map<string, unknown>();

  register<T>(name: string, factory: Factory<T>): void {
    this.factories.set(name, factory);
    this.instances.delete(name); // clear cached instance on re-register
  }

  resolve<T>(name: string): T {
    if (this.instances.has(name)) {
      return this.instances.get(name) as T;
    }
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service "${name}" not registered`);
    }
    const instance = factory() as T;
    this.instances.set(name, instance);
    return instance;
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern="core/container" --no-coverage`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/core/module.ts src/core/container.ts src/__tests__/unit/core/container.test.ts
git commit -m "feat(phase-78): add Module interface and DI Container"
```

---

### Task 2: Config Module with Zod Validation

**Files:**
- Create: `backend/src/core/config.ts`
- Test: `backend/src/__tests__/unit/core/config.test.ts`

- [ ] **Step 1: Write failing config test**

Create `backend/src/__tests__/unit/core/config.test.ts`:
```typescript
import { loadConfig, AppConfig } from '../../../core/config';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load config with defaults', () => {
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('test');
    expect(config.database.url).toBe('postgresql://test');
  });

  it('should throw on missing required vars', () => {
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow();
  });

  it('should parse numeric port', () => {
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.PORT = '8080';
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern="core/config" --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement Config**

Create `backend/src/core/config.ts`:
```typescript
import { z } from 'zod';

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3000),
  nodeEnv: z.string().default('development'),
  apiUrl: z.string().optional(),
  frontendUrl: z.string().optional(),
  allowedOrigins: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
    poolMax: z.coerce.number().default(8),
    poolMin: z.coerce.number().default(2),
    sslRejectUnauthorized: z.coerce.boolean().default(true),
    slowQueryThreshold: z.coerce.number().default(300),
  }),

  // AI
  ai: z.object({
    anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
    claudeModel: z.string().default('claude-sonnet-4-20250514'),
    maxTokens: z.coerce.number().default(4096),
    openaiApiKey: z.string().optional(),
    ollamaUrl: z.string().optional(),
  }),

  // Redis
  redis: z.object({
    url: z.string().optional(),
  }),

  // Optional Services
  braveSearchApiKey: z.string().optional(),
  judge0ApiKey: z.string().optional(),
  githubToken: z.string().optional(),
  resendApiKey: z.string().optional(),
  stripeSecretKey: z.string().optional(),
  sentryDsn: z.string().optional(),
  jwtSecret: z.string().optional(),
  encryptionKey: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  return configSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    apiUrl: process.env.API_URL,
    frontendUrl: process.env.FRONTEND_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    logLevel: process.env.LOG_LEVEL,
    database: {
      url: process.env.DATABASE_URL,
      poolMax: process.env.DB_POOL_SIZE,
      poolMin: process.env.DB_POOL_MIN,
      sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED,
      slowQueryThreshold: process.env.SLOW_QUERY_THRESHOLD,
    },
    ai: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      claudeModel: process.env.CLAUDE_MODEL,
      maxTokens: process.env.MAX_TOKENS,
      openaiApiKey: process.env.OPENAI_API_KEY,
      ollamaUrl: process.env.OLLAMA_URL,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY,
    judge0ApiKey: process.env.JUDGE0_API_KEY,
    githubToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern="core/config" --no-coverage`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/core/config.ts src/__tests__/unit/core/config.test.ts
git commit -m "feat(phase-78): add validated Config module with Zod"
```

---

### Task 3: Middleware Setup (extracted from main.ts)

**Files:**
- Create: `backend/src/core/middleware.ts`

- [ ] **Step 1: Extract middleware setup**

Create `backend/src/core/middleware.ts` — this extracts lines ~1-360 of main.ts into a function:

```typescript
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { requestContextMiddleware } from '../utils/request-context';
import { tracingMiddleware } from '../middleware/tracing';
import { AppConfig } from './config';

export function setupMiddleware(app: Express, config: AppConfig): void {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS
  const allowedOrigins = config.allowedOrigins
    ? config.allowedOrigins.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:5174'];

  if (config.frontendUrl) allowedOrigins.push(config.frontendUrl);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID', 'X-CSRF-Token', 'sentry-trace', 'baggage'],
    exposedHeaders: ['X-Request-ID', 'X-Trace-ID'],
  }));

  // Trust proxy (Railway, Vercel)
  if (config.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  // Request context (AsyncLocalStorage)
  app.use(requestContextMiddleware);

  // Tracing
  app.use(tracingMiddleware);

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cache headers for API
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add src/core/middleware.ts
git commit -m "feat(phase-78): extract middleware setup from main.ts"
```

---

### Task 4: Shutdown Coordinator

**Files:**
- Create: `backend/src/core/shutdown.ts`

- [ ] **Step 1: Implement shutdown coordinator**

Create `backend/src/core/shutdown.ts`:
```typescript
import http from 'http';

type ShutdownHandler = () => Promise<void>;

export class ShutdownCoordinator {
  private handlers: Array<{ name: string; handler: ShutdownHandler }> = [];
  private isShuttingDown = false;

  register(name: string, handler: ShutdownHandler): void {
    this.handlers.push({ name, handler });
  }

  async shutdown(server?: http.Server): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[Shutdown] Starting graceful shutdown...');

    // Close HTTP server first
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('[Shutdown] HTTP server closed');
          resolve();
        });
        // Force close after 10s
        setTimeout(resolve, 10000);
      });
    }

    // Run shutdown handlers in reverse order
    for (const { name, handler } of [...this.handlers].reverse()) {
      try {
        await handler();
        console.log(`[Shutdown] ${name}: OK`);
      } catch (err) {
        console.error(`[Shutdown] ${name}: ERROR`, err);
      }
    }

    console.log('[Shutdown] Complete');
  }

  attachSignalHandlers(server: http.Server): void {
    const handle = () => {
      this.shutdown(server).then(() => process.exit(0));
    };
    process.on('SIGTERM', handle);
    process.on('SIGINT', handle);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add src/core/shutdown.ts
git commit -m "feat(phase-78): add ShutdownCoordinator"
```

---

### Task 5: Startup Orchestrator

**Files:**
- Create: `backend/src/core/startup.ts`

- [ ] **Step 1: Implement startup orchestrator**

Create `backend/src/core/startup.ts`:
```typescript
import express, { Express, Router } from 'express';
import http from 'http';
import { Container } from './container';
import { Module } from './module';
import { AppConfig } from './config';
import { setupMiddleware } from './middleware';
import { ShutdownCoordinator } from './shutdown';
import { errorHandler } from '../middleware/errorHandler';

export class StartupOrchestrator {
  private app: Express;
  private server?: http.Server;
  private shutdown: ShutdownCoordinator;

  constructor(
    private container: Container,
    private modules: Module[],
    private config: AppConfig,
  ) {
    this.app = express();
    this.shutdown = new ShutdownCoordinator();
    this.container.register('app', () => this.app);
    this.container.register('config', () => this.config);
    this.container.register('shutdown', () => this.shutdown);
  }

  async start(): Promise<http.Server> {
    // Phase 1: Middleware
    setupMiddleware(this.app, this.config);

    // Phase 2: Register routes from all modules
    const apiRouter = Router();
    for (const mod of this.modules) {
      mod.registerRoutes(apiRouter);
      console.log(`[Module] ${mod.name}: routes registered`);
    }
    this.app.use('/api', apiRouter);

    // Phase 3: Error handler (must be last middleware)
    this.app.use(errorHandler);

    // Phase 4: Start HTTP server
    this.server = await new Promise<http.Server>((resolve) => {
      const srv = this.app.listen(this.config.port, () => {
        console.log(`[Server] Listening on port ${this.config.port}`);
        resolve(srv);
      });
    });

    // Phase 5: Async initialization (DB, schedulers, workers)
    for (const mod of this.modules) {
      if (mod.onStartup) {
        try {
          await mod.onStartup();
          console.log(`[Module] ${mod.name}: started`);
        } catch (err) {
          console.error(`[Module] ${mod.name}: startup failed`, err);
          // Non-critical modules should not crash the server
        }
      }
    }

    // Phase 6: Register shutdown handlers
    for (const mod of this.modules) {
      if (mod.onShutdown) {
        this.shutdown.register(mod.name, mod.onShutdown.bind(mod));
      }
    }
    this.shutdown.attachSignalHandlers(this.server);

    console.log(`[Server] Ready (${this.modules.length} modules loaded)`);
    return this.server;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add src/core/startup.ts
git commit -m "feat(phase-78): add StartupOrchestrator"
```

---

## Chunk 2: Module Implementations

### Task 6: First Module — Ideas Module (Pattern Example)

**Files:**
- Create: `backend/src/modules/ideas/index.ts`

This serves as the template for all other modules.

- [ ] **Step 1: Create Ideas module**

Create `backend/src/modules/ideas/index.ts`:
```typescript
import { Router } from 'express';
import { Module } from '../../core/module';

// Import existing route files — they stay in their original locations
import ideasRouter from '../../routes/ideas';
import draftsRouter from '../../routes/drafts';

export class IdeasModule implements Module {
  name = 'ideas';

  registerRoutes(router: Router): void {
    router.use('/:context/ideas', ideasRouter);
    router.use('/:context/drafts', draftsRouter);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add src/modules/ideas/index.ts
git commit -m "feat(phase-78): add IdeasModule (template module)"
```

---

### Task 7: All Remaining Modules

**Files:**
- Create: 19 module index files in `backend/src/modules/*/index.ts`
- Create: `backend/src/modules/index.ts` (registry)

- [ ] **Step 1: Create all module files**

Each module follows the same pattern as IdeasModule. Create all modules by importing existing route files:

**backend/src/modules/chat/index.ts:**
```typescript
import { Router } from 'express';
import { Module } from '../../core/module';
import generalChatRouter from '../../routes/general-chat';
import personalizationChatRouter from '../../routes/personalization-chat';

export class ChatModule implements Module {
  name = 'chat';
  registerRoutes(router: Router): void {
    router.use('/:context/chat', generalChatRouter);
    router.use('/personalization', personalizationChatRouter);
  }
}
```

**backend/src/modules/memory/index.ts:**
```typescript
import { Router } from 'express';
import { Module } from '../../core/module';
import memoryAdminRouter from '../../routes/memory-admin';
import memoryInsightsRouter from '../../routes/memory-insights';
import memoryProceduresRouter from '../../routes/memory-procedures';

export class MemoryModule implements Module {
  name = 'memory';
  registerRoutes(router: Router): void {
    router.use('/:context/memory', memoryAdminRouter);
    router.use('/:context/memory', memoryInsightsRouter);
    router.use('/:context/memory', memoryProceduresRouter);
  }
}
```

Continue for all modules. The key mapping from main.ts router registrations:

| Module | Routes imported | Path prefixes |
|--------|----------------|---------------|
| auth | auth | /auth |
| ideas | ideas, drafts | /:context/ideas, /:context/drafts |
| chat | general-chat, personalization-chat | /:context/chat, /personalization |
| memory | memory-admin, memory-insights, memory-procedures | /:context/memory |
| email | email, email-webhooks | /:context/emails, /webhooks/resend |
| agents | agent-teams, autonomous-agents, agent-identity | /agents, /:context/agents |
| voice | voice-realtime, voice, voice-memo, voice-memo-context | /:context/voice |
| mcp | mcp, mcp-server, mcp-connections | /:context/mcp, /mcp |
| observability | observability, ai-traces, health | /observability, /:context/ai-traces, /health |
| business | business, analytics-* | /:context/business |
| planner | calendar, calendar-accounts, tasks, projects | /:context/calendar, /:context/tasks, /:context/projects |
| contacts | contacts | /:context/contacts |
| finance | finance | /:context/finance |
| documents | documents, document-analysis, canvas | /:context/documents, /canvas |
| knowledge | knowledge-graph, graph-reasoning, graphrag, rag-analytics, rag-v2, enhanced-rag | /:context/knowledge-graph, /:context/graphrag |
| security | security, governance | /security, /:context/governance |
| extensions | extensions, plugins | /extensions, /plugins |
| proactive | proactive-engine, smart-suggestions, digest | /:context/proactive-engine, /:context/smart-suggestions |
| browser | browser, screen-memory, maps | /:context/browser, /:context/screen-memory, /:context/maps |

**CRITICAL:** Preserve the EXACT route registration order from current main.ts. Some routes have ordering dependencies (e.g., email-webhooks before generic webhooks, code execution before context routes).

- [ ] **Step 2: Create module registry**

Create `backend/src/modules/index.ts`:
```typescript
import { Module } from '../core/module';
import { AuthModule } from './auth';
import { IdeasModule } from './ideas';
import { ChatModule } from './chat';
import { MemoryModule } from './memory';
import { EmailModule } from './email';
import { AgentsModule } from './agents';
import { VoiceModule } from './voice';
import { MCPModule } from './mcp';
import { ObservabilityModule } from './observability';
import { BusinessModule } from './business';
import { PlannerModule } from './planner';
import { ContactsModule } from './contacts';
import { FinanceModule } from './finance';
import { DocumentsModule } from './documents';
import { KnowledgeModule } from './knowledge';
import { SecurityModule } from './security';
import { ExtensionsModule } from './extensions';
import { ProactiveModule } from './proactive';
import { BrowserModule } from './browser';

// Order matters! Some routes have path conflicts that require specific ordering.
export const modules: Module[] = [
  new AuthModule(),
  new ObservabilityModule(),     // health endpoints early
  new EmailModule(),              // webhook routes before generic routes
  new ChatModule(),
  new IdeasModule(),
  new MemoryModule(),
  new PlannerModule(),
  new ContactsModule(),
  new FinanceModule(),
  new DocumentsModule(),
  new KnowledgeModule(),
  new AgentsModule(),
  new VoiceModule(),
  new MCPModule(),
  new BusinessModule(),
  new SecurityModule(),
  new ExtensionsModule(),
  new ProactiveModule(),
  new BrowserModule(),
];
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/modules/
git commit -m "feat(phase-78): create all 19 feature modules with route registration"
```

---

### Task 8: Rewrite main.ts

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Rewrite main.ts**

Replace the entire `backend/src/main.ts` with:

```typescript
import 'dotenv/config';
import { Container } from './core/container';
import { loadConfig } from './core/config';
import { StartupOrchestrator } from './core/startup';
import { modules } from './modules';

async function main(): Promise<void> {
  const config = loadConfig();
  const container = new Container();
  const orchestrator = new StartupOrchestrator(container, modules, config);

  await orchestrator.start();
}

main().catch((err) => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
```

**IMPORTANT:** Before doing this, ensure all startup logic (schedulers, workers, DB validation, etc.) is moved into the appropriate module's `onStartup()` method. The modules that need onStartup:

- **ObservabilityModule**: initTracing, initMetrics, initAITracing
- **MemoryModule**: startMemoryScheduler
- **EmailModule**: startImapScheduler
- **AgentsModule**: registerAllToolHandlers
- **BusinessModule**: initializeBusinessConnectors
- **ProactiveModule**: startScheduledEventProducers
- **SecurityModule**: queue service + workers

- [ ] **Step 2: Run all existing tests to verify nothing breaks**

Run: `cd backend && npm test`
Expected: All 4139+ tests pass, 24 skipped

- [ ] **Step 3: Run build to verify TypeScript compiles**

Run: `cd backend && npm run build`
Expected: No errors

- [ ] **Step 4: Start server and verify health**

Run: `cd backend && npm run dev` (in separate terminal)
Then: `curl http://localhost:3000/api/health`
Expected: `{ "status": "ok", ... }`

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/main.ts
git commit -m "feat(phase-78): rewrite main.ts to 10 lines with modular architecture

main.ts reduced from 1,117 lines to <15 lines.
All route registrations moved to 19 feature modules.
DI Container, Config validation, and Startup Orchestrator handle initialization."
```

---

## Chunk 3: Verification & Cleanup

### Task 9: Integration Verification

- [ ] **Step 1: Verify all API endpoints still work**

Run the full test suite:
```bash
cd backend && npm test
```
Expected: Same results as before (4139+ pass, 24 skip, 0 fail)

- [ ] **Step 2: Verify build**

```bash
cd backend && npm run build
```
Expected: 0 TypeScript errors

- [ ] **Step 3: Verify server starts and responds**

Start server, test key endpoints:
```bash
curl http://localhost:3000/api/health/detailed
curl http://localhost:3000/api/personal/ideas
```

- [ ] **Step 4: Count lines in new main.ts**

```bash
wc -l backend/src/main.ts
```
Expected: < 50 lines

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(phase-78): post-refactoring adjustments"
```
