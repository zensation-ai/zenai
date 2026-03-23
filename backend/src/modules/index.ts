import type { Module } from '../core/module';

// Middleware (global middleware, CORS, auth, rate limiting, etc.)
import { MiddlewareModule } from './middleware';

// Health module — MUST be before any module with router.use(apiKeyAuth) on /api
import { HealthModule } from './health';

// Feature modules — ORDER MATTERS! Matches the route registration order in the original main.ts.
// Some routes have path conflicts that require specific ordering (e.g., /api/code before /:context routes,
// email webhooks before generic webhooks).
import { ObservabilityModule } from './observability';
import { AuthModule } from './auth';
import { SearchModule } from './search';
import { CodeModule } from './code';
import { DocumentsModule } from './documents';
import { AgentsModule } from './agents';
import { MCPModule } from './mcp';
import { BusinessModule } from './business';
import { ChatModule } from './chat';
import { CalendarModule } from './calendar';
import { EmailModule } from './email';
import { GmailModule } from './gmail';
import { CoreRoutesModule } from './core-routes';
import { VoiceModule } from './voice';
import { CanvasModule } from './canvas';
import { ProjectContextModule } from './project-context';
import { PlannerModule } from './planner';
import { BrowserModule } from './browser';
import { ContactsModule } from './contacts';
import { FinanceModule } from './finance';
import { InboxModule } from './inbox';
import { IdeasModule } from './ideas';
import { LearningModule } from './learning';
import { KnowledgeModule } from './knowledge';
import { MiscModule } from './misc';
import { AnalyticsModule } from './analytics';
import { MemoryModule } from './memory';
import { GovernanceModule } from './governance';
import { ProactiveModule } from './proactive';
import { SecurityModule } from './security';
import { ExtensionsModule } from './extensions';
import { SleepModule } from './sleep';
import { MetacognitionModule } from './metacognition';
import { CuriosityModule } from './curiosity';
import { PredictionsModule } from './predictions';
import { FeedbackAdaptiveModule } from './feedback-adaptive';
import { IntegrationsModule } from './integrations';

/**
 * All modules in registration order.
 *
 * The order matches the original main.ts route registration to preserve
 * Express path matching behavior (first match wins for overlapping paths).
 */
export const modules: Module[] = [
  // Global middleware (must be first)
  new MiddlewareModule(),

  // Health — MUST be before any module with router.use(apiKeyAuth) at /api mount
  // (e.g., DocumentsModule, FinanceModule) to keep /api/health unauthenticated
  new HealthModule(),

  // Routes that must come before context-aware routes (to avoid /:context conflicts)
  new ObservabilityModule(),
  new AuthModule(),
  new SearchModule(),
  new CodeModule(),
  new DocumentsModule(),       // documentAnalysisRouter before context-aware documentsRouter
  new AgentsModule(),
  new MCPModule(),
  new BusinessModule(),
  new ChatModule(),            // generalChatRouter before /:context/sessions
  new CalendarModule(),

  // Email webhooks must be before generic webhooks in CoreRoutesModule
  new EmailModule(),
  new GmailModule(),

  // Integration framework (must be before CoreRoutesModule to avoid /:context conflicts)
  new IntegrationsModule(),

  // Core legacy routes (health, ideas, meetings, profile, webhooks, sync, analytics, etc.)
  new CoreRoutesModule(),

  // Voice (real-time pipeline)
  new VoiceModule(),
  new CanvasModule(),
  new ProjectContextModule(),
  new PlannerModule(),

  // Context-aware CRUD modules
  new BrowserModule(),
  new ContactsModule(),
  new FinanceModule(),
  new InboxModule(),

  // Ideas (drafts), Learning, Knowledge
  new IdeasModule(),
  new LearningModule(),
  new KnowledgeModule(),

  // A2A, Analytics V2, i18n
  new MiscModule(),
  new AnalyticsModule(),

  // Memory, Governance, Proactive, Security, Extensions, Sleep
  new MemoryModule(),
  new GovernanceModule(),
  new ProactiveModule(),
  new SecurityModule(),
  new ExtensionsModule(),
  new SleepModule(),
  new MetacognitionModule(),
  new CuriosityModule(),
  new PredictionsModule(),
  new FeedbackAdaptiveModule(),
];
