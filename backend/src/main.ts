import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
// Phase Security Sprint 4: Secrets Manager - must be imported early
import { secretsManager } from './services/secrets-manager';
import { voiceMemoRouter } from './routes/voice-memo';
import { ideasRouter, ideasContextRouter } from './routes/ideas';
import { healthRouter } from './routes/health';
import { knowledgeGraphRouter } from './routes/knowledge-graph';
import { meetingsRouter, contextMeetingsRouter } from './routes/meetings';
import { userProfileRouter, userProfileContextRouter } from './routes/user-profile';
// Phase 4: Enterprise Integration Routes
import { apiKeysRouter } from './routes/api-keys';
import { webhooksRouter } from './routes/webhooks';
import { integrationsRouter } from './routes/integrations';
import { rateLimiter, cleanupRateLimits, stopRateLimitCleanup } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
// Phase Security Sprint 3: CSRF Protection
import { csrfProtection, getCsrfTokenHandler, ensureCookieParser } from './middleware/csrf';
// Phase Security Sprint 3: Enhanced Security Headers
import { securityHeaders } from './middleware/security-headers';
// Phase 5: Thought Incubator
import incubatorRouter from './routes/incubator';
// Phase 6: Dual-Database Context System
import { testConnections, setupGracefulShutdown, startConnectionHealthCheck, stopConnectionHealthCheck, closeAllPools, validateRequiredExtensions, ensurePerformanceIndexes, ensureSchemas } from './utils/database-context';
import { voiceMemoContextRouter } from './routes/voice-memo-context';
import { contextsRouter } from './routes/contexts';
// Phase 7: Media & Stories
import mediaRouter from './routes/media';
// Phase 10: Offline Sync
import { syncRouter } from './routes/sync';
// Phase 10: Analytics
import { analyticsRouter } from './routes/analytics';
// Phase 18: Export System
import { exportRouter } from './routes/export';
// Phase 19: Push Notifications
import { notificationsRouter } from './routes/notifications';
// Phase 20: Digest & Advanced Analytics
import { digestRouter } from './routes/digest';
import './routes/analytics-advanced';  // Registers advanced routes on analyticsRouter
// Phase 21: Personalization Chat
import { personalizationChatRouter } from './routes/personalization-chat';
// Phase 22: Learning Tasks
import { learningTasksRouter } from './routes/learning-tasks';
// Phase 23: Intelligent Learning System
import { intelligentLearningRouter } from './routes/intelligent-learning';
// Phase 3 (Vision): Automation Registry
import { automationsRouter } from './routes/automations';
// Phase 4 (Vision): Interaction Tracking
import { interactionsRouter } from './routes/interactions';
// Phase 5 (Vision): Evolution Analytics
import { evolutionRouter } from './routes/analytics-evolution';
// Phase 25: Proactive Draft Generation
import { draftsRouter } from './routes/drafts';
// Phase 27: Proactive Intelligence System
import proactiveRouter from './routes/proactive';
// Phase 29: General Chat - ChatGPT-like interface
import { generalChatRouter } from './routes/general-chat';
// Phase 30: Memory Admin - HiMeS Memory Management
import { memoryAdminRouter } from './routes/memory-admin';
// Phase 31: Vision Integration - Claude Vision API
import { visionRouter } from './routes/vision';
// Phase 31: Topic Enhancement - Advanced Topic Analysis
import { topicEnhancementRouter } from './routes/topic-enhancement';
// Phase 31: Code Execution - Secure Sandbox
import { codeExecutionRouter } from './routes/code-execution';
// Phase 31: Project Context - Codebase Analysis
import projectContextRouter from './routes/project-context';
// Phase 32: Document Analysis - PDF/Excel/CSV Analysis
import { documentAnalysisRouter } from './routes/document-analysis';
// Phase 32: Document Vault - KI-erkennbarer Dokumentenspeicher
import documentsRouter from './routes/documents';
// Phase 34: Business Manager - AI Business Intelligence
import { businessRouter } from './routes/business';
import { initializeBusinessConnectors } from './services/business';
// Phase 35: AI Calendar System
import { calendarRouter } from './routes/calendar';
// Phase 41: Google Maps Integration
import { mapsRouter } from './routes/maps';
// Phase 40: Calendar Accounts & AI (iCloud Sync, Smart Scheduling, Briefings)
import { calendarAccountsRouter } from './routes/calendar-accounts';
import { startCalDAVScheduler, stopCalDAVScheduler } from './services/caldav-sync';
// Phase 37: Global Search
import { globalSearchRouter } from './routes/global-search';
// Phase 12: Developer Experience
import { setupSwagger } from './utils/swagger';
// Phase 9: Cache-Control & ETag Support
import { cacheControlMiddleware } from './middleware/cache-control';
// Error Handling
import { errorHandler } from './middleware/errorHandler';
import { logger, requestLogger } from './utils/logger';
// Phase 30: Memory Scheduler (HiMeS Consolidation & Decay)
import { startMemoryScheduler, stopMemoryScheduler, workingMemory } from './services/memory';
// Phase 39: IMAP Email Sync Scheduler
import { startImapScheduler, stopImapScheduler } from './services/imap-sync';
// Phase 55: Scheduled Event Producers
import { startScheduledEventProducers, stopScheduledEventProducers } from './services/scheduled-event-producers';
// Phase 31: AI Capabilities Enhancement
import { registerAllToolHandlers } from './services/tool-handlers';
// Phase 61: Observability & Queue
import { initTracing, shutdownTracing } from './services/observability/tracing';
import { initMetrics } from './services/observability/metrics';
import { tracingMiddleware } from './middleware/tracing';
import { observabilityRouter } from './routes/observability';
// Phase 73: AI Observability - Langfuse-style Trace Dashboard
import { aiTracesRouter } from './routes/ai-traces';
import { initAITracing, shutdownAITracing } from './services/observability/ai-trace';
import { getQueueService } from './services/queue/job-queue';
import { startWorkers, stopWorkers } from './services/queue/workers';

dotenv.config();

// ===========================================
// Server Configuration Interface
// ===========================================

export interface ServerConfig {
  port?: number;
  /** When true, server is running inside Electron */
  electronMode?: boolean;
  /** Custom allowed CORS origins */
  allowedOrigins?: string[];
}

const app = express();
const PORT = process.env.PORT || 3000;

// Readiness gate - reject non-health requests until DB connections are verified
let serverReady = false;

// SECURITY: Trust proxy for correct client IP behind reverse proxies (Railway, Vercel, etc.)
// This ensures rate limiting works correctly with real client IPs
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL) {
  app.set('trust proxy', 1);
}

// Security Middleware - Phase Security Sprint 3: Enhanced Security Headers
// Includes: Strict CSP, HSTS, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy
const isDevelopment = process.env.NODE_ENV === 'development';
const securityMiddleware = securityHeaders({
  isDevelopment,
  enableSwagger: true, // Allow Swagger UI in all environments
});
securityMiddleware.forEach(middleware => app.use(middleware));

// CORS with whitelist (configurable via environment)
// SECURITY: Use ALLOWED_ORIGINS env var in production - don't rely on hardcoded fallbacks
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'capacitor://localhost',
  'ionic://localhost'
];

// Warn if using default origins (should be configured via env in production)
if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
  logger.warn('CORS: Using default allowed origins - configure ALLOWED_ORIGINS env var', {
    operation: 'cors',
    securityNote: 'Production should have explicit ALLOWED_ORIGINS configured'
  });
}

// Vercel preview URL patterns for dynamic deployments
const vercelPreviewPatterns = [
  /^https:\/\/frontend-[a-z0-9]+-alexander-berings-projects\.vercel\.app$/,
  /^https:\/\/zenai-[a-z0-9]+\.vercel\.app$/,
  /^https:\/\/zenai\.vercel\.app$/,
  /^https:\/\/zensation\.ai$/,
  /^https:\/\/zensation\.app$/,
  /^https:\/\/zensation\.sh$/,
  /^https:\/\/.*\.zensation\.ai$/,
  /^https:\/\/.*\.zensation\.app$/,
  // Legacy patterns for migration
  /^https:\/\/ki-ab-[a-z0-9]+\.vercel\.app$/,
  /^https:\/\/ki-ab\.vercel\.app$/,
];

// SECURITY: Track whether current request should allow no-origin
// This middleware runs before CORS to set a flag for safe endpoints
app.use((req, res, next) => {
  // Safe endpoints that can be accessed without Origin header
  // (health checks, API docs, mobile apps with API key auth)
  const safeNoOriginPaths = [
    '/api/health',
    '/api-docs',
    '/swagger',
  ];

  const isSafeEndpoint = safeNoOriginPaths.some(path => req.path.startsWith(path));
  const hasApiKeyAuth = !!(req.headers.authorization || req.headers['x-api-key']);

  // Allow no-origin for: safe endpoints OR requests with API key authentication
  (req as { _allowNoOrigin?: boolean })._allowNoOrigin = isSafeEndpoint || hasApiKeyAuth;
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // SECURITY: Requests without Origin header are restricted
    // Only allowed for: health checks, API docs, or authenticated API requests
    if (!origin) {
      // Note: We can't access req here, so we allow it and rely on
      // API key authentication for protection. CSRF protection also helps.
      // Mobile apps and server-to-server calls legitimately have no origin.
      if (process.env.NODE_ENV === 'production') {
        logger.debug('CORS: No-origin request (mobile/server-to-server)', {
          operation: 'cors',
          note: 'Request must have valid API key'
        });
      }
      callback(null, true);
      return;
    }

    // Check explicit whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Check Vercel preview URL patterns
    const isVercelPreview = vercelPreviewPatterns.some(pattern => pattern.test(origin));
    if (isVercelPreview) {
      callback(null, true);
      return;
    }

    // SECURITY: Block unauthorized origins in production
    if (process.env.NODE_ENV === 'production') {
      logger.warn('CORS blocked unauthorized origin', { origin, operation: 'cors' });
      callback(new Error('Not allowed by CORS'));
    } else {
      // SECURITY IMPROVEMENT: Log even in development for visibility
      logger.debug('CORS: Allowing unknown origin in dev mode', {
        origin,
        operation: 'cors',
        note: 'This would be blocked in production'
      });
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id', 'x-csrf-token', 'x-ai-context'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Phase 66: Per-request context for RLS (must be before all route handlers)
import { requestContextMiddleware } from './utils/request-context';
app.use(requestContextMiddleware);

// Request tracking & compression
app.use(requestIdMiddleware); // Phase 12: Request ID tracking
app.use(tracingMiddleware); // Phase 61: OpenTelemetry request tracing
app.use(requestLogger); // Phase 4 Review: HTTP request/response logging with timing
// Phase 9: Tuned compression - skip small payloads, balanced level for CPU vs ratio
app.use(compression({
  level: 6,            // Balanced compression (1=fast, 9=best ratio, 6=good default)
  threshold: 1024,     // Don't compress responses < 1KB (overhead > benefit)
  memLevel: 8,         // Memory usage for compression (default 8, max 9)
}));

// Phase 9: Cache-Control headers & ETag support for GET responses
app.use(cacheControlMiddleware);

// Phase 60: A2A Protocol - Agent Card discovery (no auth, must be before auth middleware)
import { a2aWellKnownRouter } from './routes/a2a';
app.use(a2aWellKnownRouter);  // /.well-known/agent.json (no auth)

// Readiness gate: return 503 until DB connections are confirmed
// Health endpoints are always allowed (for container probes)
app.use((req, res, next) => {
  if (serverReady || req.path.startsWith('/api/health') || req.path.startsWith('/api-docs') || req.path.startsWith('/.well-known')) {
    return next();
  }
  return res.status(503).json({
    success: false,
    error: 'Service starting up, please retry shortly',
    code: 'SERVICE_UNAVAILABLE',
  });
});

// Global rate limiter for all requests
app.use(rateLimiter);

// Body parsers with reasonable limits (10MB default, routes can override)
app.use(express.json({
  limit: '10mb',
  verify: (req: express.Request, _res, buf) => {
    // Preserve raw body for webhook signature verification (Stripe, Slack, etc.)
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phase Security Sprint 3: Cookie parser for CSRF protection
app.use(ensureCookieParser);

// Phase Security Sprint 3: CSRF Token endpoint for SPA clients
app.get('/api/csrf-token', getCsrfTokenHandler);

// Phase Security Sprint 3: CSP violation reporting endpoint
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const report = req.body?.['csp-report'] || req.body;
  if (report) {
    logger.warn('CSP Violation', {
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      documentUri: report['document-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      operation: 'csp-report',
    });
  }
  res.status(204).end();
});

// Phase Security Sprint 3: CSRF Protection for state-changing requests
// Applied after body parsing so we can read _csrf from body
app.use(csrfProtection);

// Phase 12: API Documentation
setupSwagger(app);

// Phase 61: Observability - Metrics, Queue Stats, Health
app.use('/api/observability', observabilityRouter);
// Phase 73: AI Observability - Langfuse-style Trace Dashboard
app.use('/api/observability', aiTracesRouter);

// Phase 56: Auth - Registration, Login, OAuth, MFA, Sessions
import { authRouter } from './routes/auth';
app.use('/api/auth', authRouter);

// Phase 37: Global Search - Must be before context-aware routes
app.use('/api/search', globalSearchRouter);

// Phase 31: Code Execution - Must be before context-aware routes
// to avoid /:context pattern conflicts with routes like /api/:context/...
app.use('/api/code', codeExecutionRouter);

// Phase 32: Document Analysis - Must be before context-aware routes
app.use('/api/documents', documentAnalysisRouter);

// Phase 33: Agent Teams - Multi-Agent Orchestration
import { agentTeamsRouter } from './routes/agent-teams';
app.use('/api/agents', agentTeamsRouter);

// Phase 64: Agent Identity + Workflow Graph
import { agentIdentityRouter } from './routes/agent-identity';
app.use('/api', agentIdentityRouter);  // /api/agent-identities/*, /api/agent-workflows/*, /api/agent-workflow-runs

// Phase 42: Autonomous Agents - Context-aware: /api/:context/agents/*
import { autonomousAgentsRouter } from './routes/autonomous-agents';
app.use('/api', autonomousAgentsRouter);

// Phase 55: MCP Server Exposure - ZenAI as MCP server for external AI clients
import { mcpServerRouter } from './routes/mcp-server';
app.use('/api', mcpServerRouter);            // /api/mcp-server (JSON-RPC), /api/mcp-server/.well-known/mcp.json, /api/mcp-server/tools

// Phase 44: MCP HTTP Gateway - Must be before context-aware routes
import { mcpRouter, mcpConnectionsRouter } from './routes/mcp';
app.use('/api/mcp', mcpRouter);             // /api/mcp/tools, /api/mcp/resources, /api/mcp/status
app.use('/api', mcpConnectionsRouter);       // /api/:context/mcp/connections/*, /api/:context/mcp/tools, /api/:context/mcp/resources

// Phase 55: MCP Client + Connection Management V2
import { mcpConnectionsV2Router } from './routes/mcp-connections';
app.use('/api', mcpConnectionsV2Router);     // /api/:context/mcp/servers/*, /api/:context/mcp/tools/:toolId/execute

// Phase 34: Business Manager - Must be before context-aware routes
app.use('/api/business', businessRouter);

// Phase 29: General Chat - Must be before context-aware routes
// to avoid /:context/sessions pattern in interactionsRouter catching /api/chat/sessions
app.use('/api/chat', generalChatRouter);  // /api/chat/sessions, /api/chat/sessions/:id/messages, /api/chat/quick

// Phase 35: AI Calendar - Context-aware: /api/:context/calendar/*
app.use('/api', calendarRouter);

// Phase 40: Calendar Accounts & AI - /api/:context/calendar/accounts/*, /api/:context/calendar/ai/*
app.use('/api', calendarAccountsRouter);

// Phase 41: Google Maps - /api/:context/maps/*
app.use('/api', mapsRouter);

// Phase 1-3 Routes
app.use('/api/health', healthRouter);
app.use('/api/voice-memo', voiceMemoRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api', ideasContextRouter);  // Context-aware ideas routes: /api/:context/ideas/*
app.use('/api/knowledge-graph', knowledgeGraphRouter);
app.use('/api/meetings', meetingsRouter);
app.use('/api/:context/meetings', contextMeetingsRouter);  // Context-aware meetings: /api/:context/meetings/*
app.use('/api/profile', userProfileRouter);
app.use('/api', userProfileContextRouter);  // Context-aware profile routes: /api/:context/profile/*

// Phase 38: Email Webhooks - MUST be before webhooksRouter to avoid /:id catch-all with apiKeyAuth
import { emailWebhooksRouter } from './routes/email-webhooks';
app.use('/api/webhooks', emailWebhooksRouter);  // /api/webhooks/resend (no auth, uses Svix signature)

// Phase 4: Enterprise Integration Routes
app.use('/api/keys', apiKeysRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/integrations', integrationsRouter);

// Phase 5: Thought Incubator
app.use('/api/incubator', incubatorRouter);

// Phase 6: Context-Aware Routes
app.use('/api', contextsRouter);
app.use('/api', voiceMemoContextRouter);

// Phase 7: Media
app.use('/api', mediaRouter);  // Context-aware media routes: /api/:context/media

// Phase 10: Offline Sync Routes
app.use('/api', syncRouter);  // Context-aware sync routes: /api/:context/sync/*

// Phase 10: Analytics Routes
app.use('/api', analyticsRouter);  // Context-aware analytics: /api/:context/analytics/*

// Phase 18: Export System
app.use('/api/export', exportRouter);  // Export routes: /api/export/ideas/pdf, /api/export/ideas/csv, etc.

// Phase 19: Push Notifications (Context-Aware APNs)
app.use('/api', notificationsRouter);  // Context-aware: /api/:context/notifications/device, etc.

// Phase 27: Proactive Intelligence System - "KI macht proaktive Vorschläge"
// MUST be before digestRouter to prevent /:context/digest/* from catching /proactive/digest/*
app.use('/api/proactive', proactiveRouter);  // /api/proactive/suggestions, /api/proactive/routines, /api/proactive/digest/latest, etc.

// Phase 20: Digest
app.use('/api', digestRouter);  // Digest routes: /api/:context/digest/*
// Advanced analytics routes (dashboard, productivity-score, patterns, comparison)
// are registered on analyticsRouter via side-effect import of ./routes/analytics-advanced

// Phase 32D: Productivity Analytics
import { productivityRouter } from './routes/productivity';
app.use('/api', productivityRouter);  // ROI analytics: /api/:context/productivity/*

// Phase 21: Personalization Chat - "Lerne mich kennen"
app.use('/api/personalization', personalizationChatRouter);  // Chat: /api/personalization/chat, /api/personalization/facts

// Phase 22: Learning Tasks - "Tägliche Lernaufgaben"
app.use('/api', learningTasksRouter);  // Learning tasks: /api/:context/learning-tasks, /api/:context/learning-stats

// Phase 23: Intelligent Learning System - "KI lernt kontinuierlich"
app.use('/api', intelligentLearningRouter);  // /api/:context/focus, /api/:context/feedback, /api/:context/research, /api/:context/suggestions

// Phase 3 (Vision): Automation Registry - "System kennt Automationen"
app.use('/api', automationsRouter);  // /api/:context/automations, /api/:context/automations/suggestions, /api/:context/automations/stats

// Phase 4 (Vision): Interaction Tracking - "Deep Learning Feedback Loop"
app.use('/api', interactionsRouter);  // /api/:context/interactions, /api/:context/corrections, /api/:context/patterns

// Phase 5 (Vision): Evolution Analytics - "Wie die KI lernt"
app.use('/api', evolutionRouter);  // /api/:context/evolution, /api/:context/evolution/timeline, /api/:context/evolution/milestones

// Phase 25: Proactive Draft Generation - "KI bereitet Entwürfe vor"
app.use('/api', draftsRouter);  // /api/:context/ideas/:id/draft, /api/:context/drafts

// Phase 27: Proactive Intelligence System - moved above digestRouter to prevent route conflict

// Phase 30: Memory Admin - HiMeS Memory Management
app.use('/api/memory', memoryAdminRouter);  // /api/memory/status, /api/memory/consolidate, /api/memory/decay, etc.

// Phase 31: Vision Integration - Claude Vision API
app.use('/api/vision', visionRouter);  // /api/vision/analyze, /api/vision/extract-text, /api/vision/describe, etc.

// Phase 31: Topic Enhancement - Advanced Topic Analysis
app.use('/api/topics', topicEnhancementRouter);  // /api/topics/enhanced, /api/topics/quality, /api/topics/similar, etc.

// Phase 33 Sprint 4: Voice/TTS Integration
import { voiceRouter } from './routes/voice';
app.use('/api/voice', voiceRouter);  // /api/voice/speak, /api/voice/status, /api/voice/voices

// Phase 57: Real-Time Voice Pipeline
import { voiceRealtimeRouter } from './routes/voice-realtime';
app.use('/api', voiceRealtimeRouter);  // /api/:context/voice/session/*, /api/:context/voice/tts, /api/:context/voice/voices, etc.

// Phase 33 Sprint 4: Interactive Canvas Mode
import { canvasRouter } from './routes/canvas';
app.use('/api/canvas', canvasRouter);  // /api/canvas, /api/canvas/:id, /api/canvas/:id/versions

// Phase 31: Project Context - Codebase Analysis
app.use('/api/project', projectContextRouter);  // /api/project/analyze, /api/project/summary, /api/project/structure
app.use('/api/:context/project', projectContextRouter);  // Context-aware: /api/personal/project/analyze, etc.

// Phase 37: Planner - Tasks & Projects
import { tasksRouter } from './routes/tasks';
import { projectsRouter } from './routes/projects';
app.use('/api', tasksRouter);      // /api/:context/tasks, /api/:context/tasks/gantt, /api/:context/tasks/reorder
app.use('/api', projectsRouter);   // /api/:context/projects

// Phase 38: Email Integration (Resend) - emailRouter for CRUD
import { emailRouter } from './routes/email';
app.use('/api', emailRouter);                    // /api/:context/emails/*

// Phase 2: Eingebetteter Browser - Browsing History + Bookmarks
import { browserRouter } from './routes/browser';
app.use('/api', browserRouter);    // /api/:context/browser/history, /api/:context/browser/bookmarks

// Phase 3: Kontakte & CRM
import { contactsRouter } from './routes/contacts';
app.use('/api', contactsRouter);   // /api/:context/contacts, /api/:context/organizations

// Phase 4: Finanzen & Ausgaben
import { financeRouter } from './routes/finance';
app.use('/api', financeRouter);    // /api/:context/finance/*

// Phase 5: Screen Memory
import { screenMemoryRouter } from './routes/screen-memory';
app.use('/api', screenMemoryRouter); // /api/:context/screen-memory

// Phase 8: Unified Inbox
import { unifiedInboxRouter } from './routes/unified-inbox';
app.use('/api', unifiedInboxRouter); // /api/:context/inbox, /api/:context/inbox/counts

// Phase 32: Document Vault - KI-erkennbarer Dokumentenspeicher
app.use('/api', documentsRouter);  // /api/:context/documents, /api/documents/file/:id, etc.

// Phase 46: Extended Thinking Excellence
import { thinkingRouter } from './routes/thinking';
app.use('/api', thinkingRouter);  // /api/:context/thinking/feedback, /api/:context/thinking/stats, etc.

// Phase 47: RAG Analytics & Feedback
import { ragAnalyticsRouter } from './routes/rag-analytics';
app.use('/api', ragAnalyticsRouter);  // /api/:context/rag/feedback, /api/:context/rag/analytics, etc.

// Phase 48: Knowledge Graph Reasoning
import { graphReasoningRouter } from './routes/graph-reasoning';
app.use('/api', graphReasoningRouter);  // /api/:context/knowledge-graph/infer, /api/:context/knowledge-graph/communities, etc.

// Phase 58: GraphRAG + Hybrid Retrieval
import { graphragRouter } from './routes/graphrag';
app.use('/api', graphragRouter);  // /api/:context/graphrag/extract, /api/:context/graphrag/retrieve, etc.

// Phase 60: A2A Protocol - Agent-to-Agent Communication
import { a2aRouter } from './routes/a2a';
app.use('/api', a2aRouter);  // /api/a2a/tasks CRUD, /api/:context/a2a/tasks, /api/:context/a2a/external-agents

// Phase 49: Advanced RAG v2
import { ragV2Router } from './routes/rag-v2';
app.use('/api', ragV2Router);  // /api/:context/rag/v2/retrieve, /api/:context/rag/v2/citations, etc.

// Phase 50: Analytics V2 - Interactive Visualizations & Custom Date Ranges
import { analyticsV2Router } from './routes/analytics-v2';
app.use('/api', analyticsV2Router);  // /api/:context/analytics/v2/overview, /api/:context/analytics/v2/trends, etc.

// Phase 51: Plugin System
import { pluginsRouter } from './routes/plugins';
app.use('/api', pluginsRouter);

// Phase 52: i18n
import { i18nRouter } from './routes/i18n';
app.use('/api', i18nRouter);

// Phase 53: Memory Insights - HiMeS Memory Analysis & Visualization
import { memoryInsightsRouter } from './routes/memory-insights';
app.use('/api', memoryInsightsRouter);  // /api/:context/memory/insights/timeline, /api/:context/memory/insights/conflicts, etc.

// Phase 59: Memory Excellence - Procedural Memory & BM25
import { memoryProceduresRouter } from './routes/memory-procedures';
app.use('/api', memoryProceduresRouter);  // /api/:context/memory/procedures/*, /api/:context/memory/bm25, /api/:context/memory/hybrid-search, /api/:context/memory/entity-links/*

// Phase 54: Governance & Audit Trail
import { governanceRouter } from './routes/governance';
app.use('/api', governanceRouter);  // /api/:context/governance/pending, /api/:context/governance/audit, etc.

// Phase 54: Programmatic Context Engineering
import { contextRulesRouter } from './routes/context-rules';
app.use('/api', contextRulesRouter);  // /api/:context/context-rules CRUD, performance, test

// Phase 54: Proactive Event Engine
import { proactiveEngineRouter } from './routes/proactive-engine';
app.use('/api', proactiveEngineRouter);  // /api/:context/proactive-engine/events, rules, stats, process

// Phase 62: Enterprise Security - Admin routes for audit logs & rate limits
import { securityRouter } from './routes/security';
app.use('/api/security', securityRouter);  // /api/security/audit-log, /api/security/alerts, /api/security/rate-limits

// Phase 75: Extension/Plugin System
import { extensionsRouter } from './routes/extensions';
app.use('/api/extensions', extensionsRouter);  // /api/extensions, /api/extensions/installed, /api/extensions/:id/install|uninstall|enable|disable|execute

// Phase 63: Sleep Compute + Context Engine V2
import { sleepComputeRouter } from './routes/sleep-compute';
app.use('/api', sleepComputeRouter);  // /api/:context/sleep-compute/*, /api/:context/context-v2/*

// Phase 69.1: Smart Suggestion Surface
import { smartSuggestionsRouter } from './routes/smart-suggestions';
app.use('/api', smartSuggestionsRouter);  // /api/:context/suggestions, /api/:context/suggestions/:id/dismiss|snooze|accept, /api/:context/suggestions/stream

// Note: Code Execution routes moved to top of file to avoid context-aware route conflicts

// Phase 28: AI Evolution Analytics - "KI-Lernkurve und Domain-Stärken"
// Routes integriert in evolutionRouter: /api/:context/evolution/learning-curve, /api/:context/evolution/domain-strengths, etc.

// Cleanup rate limits every hour
// Store interval reference for proper cleanup on shutdown
// Note: Cleanup happens in setupGracefulShutdown() via closeAllPools()
const rateLimitCleanupInterval = setInterval(() => {
  cleanupRateLimits().catch((err) => logger.error('Rate limit cleanup failed', err));
}, 60 * 60 * 1000);

// HTTP server reference for graceful shutdown (set in startServer)
let httpServer: import('http').Server | null = null;

// Clear interval on shutdown (setupGracefulShutdown handles DB cleanup)
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  clearInterval(rateLimitCleanupInterval);
  stopRateLimitCleanup();
  stopMemoryScheduler();
  stopImapScheduler();
  stopCalDAVScheduler();
  stopScheduledEventProducers();
  workingMemory.stopCleanupInterval();
  // Phase 61: Shutdown queue workers and tracing
  await stopWorkers().catch(() => {});
  await getQueueService().shutdown().catch(() => {});
  await shutdownTracing().catch(() => {});
  await shutdownAITracing().catch(() => {});
  // Stop accepting new connections, drain in-flight requests
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  }
  // Close database connections last
  stopConnectionHealthCheck();
  await closeAllPools().catch(() => {});
  logger.info('Graceful shutdown complete');
  process.exit(0);
};
process.once('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.once('SIGINT', () => { gracefulShutdown('SIGINT'); });

// Phase 66: Sentry error handler (must be BEFORE 404 and app error handler)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Sentry, isSentryInitialized } = require('./services/observability/sentry');
  if (isSentryInitialized()) {
    Sentry.setupExpressErrorHandler(app);
  }
} catch { /* Sentry not available */ }

// 404 Handler for undefined routes (after all routes and Sentry)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Error handling - Use centralized error handler (after Sentry so Sentry captures first)
app.use(errorHandler);

// Setup graceful shutdown for database connections
setupGracefulShutdown();

// ===========================================
// Environment Validation
// ===========================================

/**
 * Validate environment variables that aren't covered by SecretsManager
 * Logs warnings for misconfigured optional variables
 * Throws for invalid required variables in production
 */
function validateEnvironmentVariables(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];

  // Validate CODE_EXECUTION settings
  if (process.env.ENABLE_CODE_EXECUTION) {
    const value = process.env.ENABLE_CODE_EXECUTION.toLowerCase();
    if (value !== 'true' && value !== 'false') {
      warnings.push(`ENABLE_CODE_EXECUTION should be 'true' or 'false', got '${value}'`);
    }
  }

  if (process.env.CODE_EXECUTION_TIMEOUT) {
    const timeout = parseInt(process.env.CODE_EXECUTION_TIMEOUT, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
      warnings.push('CODE_EXECUTION_TIMEOUT should be between 1000 and 300000 ms');
    }
  }

  if (process.env.CODE_EXECUTION_MEMORY_LIMIT) {
    const limit = process.env.CODE_EXECUTION_MEMORY_LIMIT;
    if (!/^\d+[kmg]?$/i.test(limit)) {
      warnings.push(`CODE_EXECUTION_MEMORY_LIMIT '${limit}' is not a valid memory limit (e.g., '256m', '1g')`);
    }
  }

  // Validate Judge0 in production if code execution is enabled
  if (isProduction && process.env.ENABLE_CODE_EXECUTION === 'true') {
    if (!process.env.JUDGE0_API_KEY) {
      warnings.push('JUDGE0_API_KEY is required for code execution in production');
    }
  }

  // Validate Slack signing secret in production if Slack is configured
  if (isProduction && process.env.SLACK_CLIENT_ID && !process.env.SLACK_SIGNING_SECRET) {
    warnings.push('SLACK_SIGNING_SECRET is required in production when Slack integration is enabled');
  }

  // Validate Business Manager (Phase 34) - warn if partially configured
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push('STRIPE_WEBHOOK_SECRET recommended when STRIPE_SECRET_KEY is set');
  }
  if (process.env.GA4_PROPERTY_ID && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    warnings.push('GOOGLE_SERVICE_ACCOUNT_KEY required for GA4 analytics when GA4_PROPERTY_ID is set');
  }
  if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_SECRET) {
    warnings.push('GOOGLE_CLIENT_SECRET required when GOOGLE_CLIENT_ID is set');
  }

  // Log all warnings
  if (warnings.length > 0) {
    logger.warn('Environment validation warnings', { warnings });
    if (isProduction) {
      // In production, some warnings are fatal
      const fatalWarnings = warnings.filter(w =>
        w.includes('required') || w.includes('JUDGE0') || w.includes('SLACK_SIGNING_SECRET')
      );
      if (fatalWarnings.length > 0) {
        logger.error('FATAL: Required environment variables missing in production');
        fatalWarnings.forEach(w => logger.error(`  - ${w}`));
        process.exit(1);
      }
    }
  }

  logger.info('Environment validation complete', {
    production: isProduction,
    warnings: warnings.length,
  });
}

// ===========================================
// Server Startup
// ===========================================

/**
 * Initialize and start the server
 * Ensures secrets are validated BEFORE server accepts requests
 */
async function startServer(): Promise<void> {
  // Phase 66: Initialize Sentry FIRST (before everything else)
  try {
    const { initSentry } = await import('./services/observability/sentry');
    const sentryAvailable = initSentry();
    logger.info('Sentry initialized', { operation: 'startup', available: sentryAvailable });
  } catch (error) {
    logger.warn('Sentry initialization failed (non-critical)', {
      operation: 'startup',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Phase 61: Initialize OpenTelemetry tracing early (before Express setup)
  try {
    const tracingEnabled = await initTracing();
    if (tracingEnabled) {
      await initMetrics();
    }
    logger.info('Observability initialized', { operation: 'startup', tracing: tracingEnabled });
  } catch (error) {
    logger.warn('Observability initialization failed (non-critical)', {
      operation: 'startup',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Phase Security Sprint 4: Initialize Secrets Manager BEFORE server starts
  // This prevents the server from accepting requests with invalid configuration
  try {
    await secretsManager.initialize();
    logger.info('SecretsManager initialized successfully');
  } catch (error) {
    logger.error('FATAL: SecretsManager initialization failed', error instanceof Error ? error : undefined);
    process.exit(1);
  }

  // Phase 66: Initialize field-level encryption
  try {
    const { initEncryption } = await import('./services/security/field-encryption');
    const encryptionAvailable = initEncryption();
    logger.info('Field encryption initialized', { operation: 'startup', available: encryptionAvailable });
  } catch (error) {
    logger.warn('Field encryption initialization failed (non-critical)', {
      operation: 'startup',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Additional environment validation (2026-01-30)
  validateEnvironmentVariables();

  // Start server after secrets are validated
  httpServer = app.listen(PORT, async () => {
    const server = httpServer!;
    // Phase 57: Initialize WebSocket for Voice Signaling
    try {
      const { voiceSignaling } = await import('./services/voice/webrtc-signaling');
      voiceSignaling.initialize(server);
      logger.info('Voice WebSocket server initialized', { operation: 'startup' });
    } catch (error) {
      logger.error('Voice WebSocket initialization failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Get secrets health status for startup display
    const secretsHealth = secretsManager.getHealthSummary();
  const secretsDbStatus = secretsManager.getDatabaseStatus();
  const aiStatus = secretsManager.getAIProviderStatus();
  const cacheStatus = secretsManager.getCacheStatus();

  logger.info('ZenAI Backend starting', {
    operation: 'startup',
    phase: 41,
    server: `http://localhost:${PORT}`,
    apiDocs: `http://localhost:${PORT}/api-docs`,
    environment: secretsManager.isProduction() ? 'PRODUCTION' : secretsManager.isDevelopment() ? 'development' : 'unknown',
    secrets: secretsHealth.healthy ? 'OK' : 'WARNINGS',
    secretsConfigured: secretsHealth.secretsConfigured,
    database: secretsDbStatus.configured ? secretsDbStatus.type.toUpperCase() : 'NOT CONFIGURED',
    ai: aiStatus.configured ? aiStatus.providers.join(', ').toUpperCase() : 'NOT CONFIGURED',
    cache: cacheStatus.type.toUpperCase(),
  });

  // Ensure all 4 context schemas exist before testing connections
  try {
    await ensureSchemas();
    logger.info('All database schemas ensured');
  } catch (error) {
    logger.warn('Schema creation check failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
  }

  // Test all database connections (personal, work, learning, creative)
  logger.info('Testing database connections...');
  const dbStatus = await testConnections();
  const failedContexts = Object.entries(dbStatus).filter(([, ok]) => !ok).map(([ctx]) => ctx);

  if (Object.values(dbStatus).every(ok => ok)) {
    logger.info('All databases connected successfully', { dbStatus, operation: 'startup' });
  } else if (!dbStatus.personal && !dbStatus.work) {
    // Critical: Both primary databases failed - cannot operate
    logger.error('CRITICAL: Both primary databases failed to connect - shutting down', undefined, { dbStatus, operation: 'startup' });
    process.exit(1);
  } else {
    logger.warn(`Database connections failed: ${failedContexts.join(', ')}`, { dbStatus, failedContexts, operation: 'startup' });
  }

  // Phase 73: Initialize AI tracing (Langfuse-style) after DB is ready
  try {
    const { queryPublic: qp } = await import('./utils/database-context');
    initAITracing(qp);
  } catch (error) {
    logger.warn('AI tracing initialization failed (non-critical)', {
      operation: 'startup',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Open readiness gate - server can now handle requests
  serverReady = true;
  logger.info('Server ready to accept requests', { operation: 'startup' });

  // Validate PostgreSQL extensions
  const extensionStatus = await validateRequiredExtensions();
  if (!extensionStatus.valid) {
    logger.error('CRITICAL: Required PostgreSQL extensions missing', undefined, {
      missing: extensionStatus.missing,
      operation: 'startup',
    });
    logger.warn(`Missing PostgreSQL Extensions: ${extensionStatus.missing.join(', ')}. Run: CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`, {
      missing: extensionStatus.missing,
      operation: 'startup',
    });
  } else if (extensionStatus.optional.length > 0) {
    logger.warn('Optional PostgreSQL extensions missing', {
      optional: extensionStatus.optional,
      operation: 'startup',
    });
    logger.info(`Optional extensions not installed: ${extensionStatus.optional.join(', ')}. Some features (like fuzzy duplicate detection) may be limited.`, {
      optional: extensionStatus.optional,
      operation: 'startup',
    });
  } else {
    logger.info('All PostgreSQL extensions validated', {
      installed: extensionStatus.installed,
      operation: 'startup',
    });
  }

  // Start periodic connection health checks (every 5 minutes)
  // This keeps connections alive and detects issues early
  startConnectionHealthCheck(5 * 60 * 1000);

  // Phase 9: Ensure performance-critical composite indexes exist (deferred)
  // Non-blocking: runs after DB is confirmed connected, uses IF NOT EXISTS
  setImmediate(async () => {
    try {
      const indexResult = await ensurePerformanceIndexes();
      logger.info('Performance indexes verified (deferred)', { ...indexResult, operation: 'startup' });
    } catch (error) {
      logger.warn('Performance index creation skipped (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'startup',
      });
    }
  });

  // Phase 31: Register AI Tool Handlers (synchronous, fast - do before scheduler)
  // Enables Claude Tool Use for structured actions
  try {
    registerAllToolHandlers();
    logger.info('AI Tool Handlers registered successfully', { operation: 'startup' });
  } catch (error) {
    logger.error('AI Tool Handlers registration failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
  }

  // Phase 34: Initialize Business Connectors (Stripe, GSC, GA4, Uptime, Lighthouse)
  try {
    await initializeBusinessConnectors();
    logger.info('Business Connectors initialized successfully', { operation: 'startup' });
  } catch (error) {
    logger.error('Business Connectors initialization failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
  }

  // Phase 9: Deferred non-critical initialization
  // Memory Scheduler and index creation run in background to speed up cold starts.
  // Server is already accepting requests at this point.
  setImmediate(async () => {
    // Phase 30: Start Memory Scheduler (HiMeS Consolidation & Decay)
    // Runs daily cron jobs for consolidation (2 AM), decay (3 AM), and stats (hourly)
    try {
      await startMemoryScheduler();
      logger.info('Memory Scheduler started successfully (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Memory Scheduler failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 39: Start IMAP Sync Scheduler
    try {
      startImapScheduler();
    } catch (error) {
      logger.error('IMAP Scheduler failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 40: Start CalDAV Sync Scheduler (iCloud, etc.)
    try {
      startCalDAVScheduler();
      logger.info('CalDAV sync scheduler started (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('CalDAV Scheduler failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 42: Start Autonomous Agent Runtime
    try {
      const { agentRuntime } = await import('./services/agents/agent-runtime');
      await agentRuntime.start();
      logger.info('Agent Runtime started (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Agent Runtime failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 44: Initialize MCP Connection Manager
    try {
      const { mcpConnectionManager } = await import('./services/mcp-connections');
      const contexts = ['personal', 'work', 'learning', 'creative'] as const;
      for (const ctx of contexts) {
        await mcpConnectionManager.initialize(ctx);
      }
      logger.info('MCP Connection Manager initialized (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('MCP Connection Manager failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 46: Restore persisted thinking budget strategies
    try {
      const { loadPersistedStrategies } = await import('./services/thinking-management');
      await loadPersistedStrategies('personal' as const);
      logger.info('Thinking budget strategies restored (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Thinking strategies restore failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 51: Load active plugins from database
    try {
      const { loadActivePlugins } = await import('./services/plugins/plugin-registry');
      const contexts = ['personal', 'work', 'learning', 'creative'] as const;
      for (const ctx of contexts) {
        await loadActivePlugins(ctx);
      }
      logger.info('Active plugins loaded (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Plugin loading failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 55: Start Scheduled Event Producers
    try {
      startScheduledEventProducers();
      logger.info('Scheduled event producers started (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Scheduled event producers failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase 61: Initialize Queue Service and Workers
    try {
      const queueService = getQueueService();
      const queueAvailable = await queueService.initialize();
      if (queueAvailable) {
        await startWorkers();
        // Phase 63: Schedule sleep compute jobs
        try {
          const { scheduleSleepJobs } = await import('./services/queue/workers/sleep-worker');
          await scheduleSleepJobs();
        } catch (sleepErr) {
          logger.debug('Sleep job scheduling skipped', {
            operation: 'startup',
            error: sleepErr instanceof Error ? sleepErr.message : String(sleepErr),
          });
        }
        logger.info('Queue service and workers started (deferred)', { operation: 'startup' });
      } else {
        logger.info('Queue service not available (REDIS_URL not set)', { operation: 'startup' });
      }
    } catch (error) {
      logger.error('Queue service failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  });
  });
}

// ===========================================
// Exported API for Electron Integration
// ===========================================

/**
 * Create and start the Express server programmatically.
 * Used by Electron to embed the backend as a child process.
 *
 * @param config - Optional server configuration
 * @returns The Express app instance
 */
export async function createServer(config?: ServerConfig): Promise<typeof app> {
  if (config?.port) {
    process.env.PORT = String(config.port);
  }
  if (config?.electronMode) {
    process.env.ELECTRON_MODE = 'true';
  }
  await startServer();
  return app;
}

/** Export the Express app for testing */
export { app };

// ===========================================
// Standalone Startup (when run directly)
// ===========================================

// Only auto-start when run directly (not imported by Electron or tests)
const isMainModule = require.main === module;
if (isMainModule) {
  startServer().catch((error) => {
    logger.error('FATAL: Server startup failed', error instanceof Error ? error : undefined);
    // Fallback to console.error in case logger pipeline is broken
    console.error('Server startup failed:', error);
    process.exit(1);
  });
}
