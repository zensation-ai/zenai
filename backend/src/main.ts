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
import { meetingsRouter } from './routes/meetings';
import { userProfileRouter, userProfileContextRouter } from './routes/user-profile';
// Phase 4: Enterprise Integration Routes
import { apiKeysRouter } from './routes/api-keys';
import { webhooksRouter } from './routes/webhooks';
import { integrationsRouter } from './routes/integrations';
import { rateLimiter, cleanupRateLimits } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
// Phase Security Sprint 3: CSRF Protection
import { csrfProtection, getCsrfTokenHandler, ensureCookieParser } from './middleware/csrf';
// Phase Security Sprint 3: Enhanced Security Headers
import { securityHeaders } from './middleware/security-headers';
// Phase 5: Thought Incubator
import incubatorRouter from './routes/incubator';
// Phase 6: Dual-Database Context System
import { testConnections, setupGracefulShutdown, startConnectionHealthCheck, validateRequiredExtensions, ensurePerformanceIndexes, ensureSchemas } from './utils/database-context';
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
// Phase 31: AI Capabilities Enhancement
import { registerAllToolHandlers } from './services/tool-handlers';

dotenv.config();

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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id', 'x-csrf-token'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Request tracking & compression
app.use(requestIdMiddleware); // Phase 12: Request ID tracking
app.use(requestLogger); // Phase 4 Review: HTTP request/response logging with timing
// Phase 9: Tuned compression - skip small payloads, balanced level for CPU vs ratio
app.use(compression({
  level: 6,            // Balanced compression (1=fast, 9=best ratio, 6=good default)
  threshold: 1024,     // Don't compress responses < 1KB (overhead > benefit)
  memLevel: 8,         // Memory usage for compression (default 8, max 9)
}));

// Phase 9: Cache-Control headers & ETag support for GET responses
app.use(cacheControlMiddleware);

// Readiness gate: return 503 until DB connections are confirmed
// Health endpoints are always allowed (for container probes)
app.use((req, res, next) => {
  if (serverReady || req.path.startsWith('/api/health') || req.path.startsWith('/api-docs')) {
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

// Phase 34: Business Manager - Must be before context-aware routes
app.use('/api/business', businessRouter);

// Phase 29: General Chat - Must be before context-aware routes
// to avoid /:context/sessions pattern in interactionsRouter catching /api/chat/sessions
app.use('/api/chat', generalChatRouter);  // /api/chat/sessions, /api/chat/sessions/:id/messages, /api/chat/quick

// Phase 35: AI Calendar - Context-aware: /api/:context/calendar/*
app.use('/api', calendarRouter);

// Phase 1-3 Routes
app.use('/api/health', healthRouter);
app.use('/api/voice-memo', voiceMemoRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api', ideasContextRouter);  // Context-aware ideas routes: /api/:context/ideas/*
app.use('/api/knowledge-graph', knowledgeGraphRouter);
app.use('/api/meetings', meetingsRouter);
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

// Phase 32: Document Vault - KI-erkennbarer Dokumentenspeicher
app.use('/api', documentsRouter);  // /api/:context/documents, /api/documents/file/:id, etc.

// Note: Code Execution routes moved to top of file to avoid context-aware route conflicts

// Phase 28: AI Evolution Analytics - "KI-Lernkurve und Domain-Stärken"
// Routes integriert in evolutionRouter: /api/:context/evolution/learning-curve, /api/:context/evolution/domain-strengths, etc.

// Cleanup rate limits every hour
// Store interval reference for proper cleanup on shutdown
// Note: Cleanup happens in setupGracefulShutdown() via closeAllPools()
const rateLimitCleanupInterval = setInterval(() => {
  cleanupRateLimits().catch((err) => logger.error('Rate limit cleanup failed', err));
}, 60 * 60 * 1000);

// Clear interval on shutdown (setupGracefulShutdown handles DB cleanup)
process.once('SIGTERM', () => {
  clearInterval(rateLimitCleanupInterval);
  stopMemoryScheduler();
  stopImapScheduler();
  workingMemory.stopCleanupInterval();
});
process.once('SIGINT', () => {
  clearInterval(rateLimitCleanupInterval);
  stopMemoryScheduler();
  stopImapScheduler();
  workingMemory.stopCleanupInterval();
});

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Error handling - Use centralized error handler
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
  // Phase Security Sprint 4: Initialize Secrets Manager BEFORE server starts
  // This prevents the server from accepting requests with invalid configuration
  try {
    await secretsManager.initialize();
    logger.info('SecretsManager initialized successfully');
  } catch (error) {
    logger.error('FATAL: SecretsManager initialization failed', error instanceof Error ? error : undefined);
    process.exit(1);
  }

  // Additional environment validation (2026-01-30)
  validateEnvironmentVariables();

  // Start server after secrets are validated
  app.listen(PORT, async () => {
    // Get secrets health status for startup display
    const secretsHealth = secretsManager.getHealthSummary();
  const secretsDbStatus = secretsManager.getDatabaseStatus();
  const aiStatus = secretsManager.getAIProviderStatus();
  const cacheStatus = secretsManager.getCacheStatus();

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ███████╗███████╗███╗   ██╗ █████╗ ██╗                       ║
║   ╚══███╔╝██╔════╝████╗  ██║██╔══██╗██║                       ║
║     ███╔╝ █████╗  ██╔██╗ ██║███████║██║                       ║
║    ███╔╝  ██╔══╝  ██║╚██╗██║██╔══██║██║                       ║
║   ███████╗███████╗██║ ╚████║██║  ██║██║                       ║
║   ╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝                       ║
║                                                               ║
║   Enterprise AI Platform by ZenSation Enterprise Solutions   ║
║   © ${new Date().getFullYear()} Alexander Bering. All rights reserved.            ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║   zensation.ai  |  zensation.app  |  zensation.sh            ║
╚═══════════════════════════════════════════════════════════════╝

ZenAI Backend - Phase 31
========================================================
Server:      http://localhost:${PORT}
API Docs:    http://localhost:${PORT}/api-docs
Environment: ${secretsManager.isProduction() ? 'PRODUCTION' : secretsManager.isDevelopment() ? 'development' : 'unknown'}
--------------------------------------------------------
Secrets:     ${secretsHealth.healthy ? 'OK' : 'WARNINGS'} (${secretsHealth.secretsConfigured} configured)
Database:    ${secretsDbStatus.configured ? secretsDbStatus.type.toUpperCase() : 'NOT CONFIGURED'}
AI:          ${aiStatus.configured ? aiStatus.providers.join(', ').toUpperCase() : 'NOT CONFIGURED'}
Cache:       ${cacheStatus.type.toUpperCase()}
========================================================
Phase 31 APIs (Vision Integration):
  - Vision Status:     GET /api/vision/status
  - Analyze Image:     POST /api/vision/analyze
  - Extract Text (OCR):POST /api/vision/extract-text
  - Extract Ideas:     POST /api/vision/extract-ideas
  - Describe Image:    POST /api/vision/describe
  - Ask About Image:   POST /api/vision/ask
  - Compare Images:    POST /api/vision/compare
  - Process Document:  POST /api/vision/document

Phase 32 APIs (Document Analysis):
  - Service Status:  GET /api/documents/status
  - Templates:       GET /api/documents/templates
  - Analyze Document:POST /api/documents/analyze

Phase 30 APIs (Memory Scheduler):
  - Domain Strengths:    GET /api/:context/evolution/domain-strengths
  - Scheduler Status:  GET /api/memory/status
  - Trigger Consolidate: POST /api/memory/consolidate
  - Trigger Decay:     POST /api/memory/decay
  - Memory Stats:      GET /api/memory/stats/:context
  - Get Facts:         GET /api/memory/facts/:context
  - Get Patterns:      GET /api/memory/patterns/:context

Phase 29 APIs:
  - Create Session:    POST /api/chat/sessions
  - List Sessions:     GET /api/chat/sessions
  - Get Session:       GET /api/chat/sessions/:id
  - Send Message:      POST /api/chat/sessions/:id/messages
  - Delete Session:    DELETE /api/chat/sessions/:id
  - Quick Chat:        POST /api/chat/quick

Phase 28 APIs:
  - Learning Curve:      GET /api/:context/evolution/learning-curve
  - Domain Strengths:    GET /api/:context/evolution/domain-strengths
  - Proact. Effective.:  GET /api/:context/evolution/proactive-effectiveness
  - AI Insights:         GET /api/:context/evolution/insights
  - Full Metrics:        GET /api/:context/evolution/metrics

Phase 27 APIs:
  - Suggestions:     GET /api/proactive/suggestions?context=personal
  - Accept/Dismiss:  POST /api/proactive/suggestions/:id/accept|dismiss
  - Routines:        GET /api/proactive/routines?context=personal
  - Analyze:         POST /api/:context/proactive/routines/analyze
  - Log Action:      POST /api/:context/proactive/actions
  - Settings:        GET/PUT /api/:context/proactive/settings
  - Stats:           GET /api/:context/proactive/stats

Phase 23 APIs:
  - Domain Focus:    /api/:context/focus
  - AI Feedback:     /api/:context/feedback
  - Proactive Res.:  /api/:context/research
  - AI Suggestions:  /api/:context/suggestions
  - Learning Dash:   /api/:context/learning/dashboard
  - Run Learning:    POST /api/:context/learning/run

Phase 22 APIs:
  - Learning Tasks:  /api/:context/learning-tasks
  - Create Task:     POST /api/:context/learning-tasks
  - Log Session:     POST /api/:context/learning-tasks/:id/session
  - Stats:           /api/:context/learning-stats
  - Daily Summary:   /api/:context/learning-daily-summary

Phase 21 APIs:
  - Start Chat:      /api/personalization/start
  - Send Message:    /api/personalization/chat
  - Get Facts:       /api/personalization/facts
  - Progress:        /api/personalization/progress
  - Summary:         /api/personalization/summary

Phase 20 APIs:
  - Daily Digest:    /api/:context/digest/generate/daily
  - Weekly Digest:   /api/:context/digest/generate/weekly
  - Analytics Dash:  /api/:context/analytics/dashboard
  - Productivity:    /api/:context/analytics/productivity-score

Phase 19 APIs (APNs Push Notifications):
  - Register Device: POST /api/:context/notifications/device
  - Preferences:     GET/PUT /api/:context/notifications/preferences/:deviceId
  - Send Push:       POST /api/:context/notifications/push
  - Stats:           GET /api/:context/notifications/stats
  - Status:          GET /api/:context/notifications/status

Phase 18 APIs:
  - Export PDF:      /api/export/ideas/pdf
  - Export Markdown: /api/export/ideas/markdown
  - Export CSV:      /api/export/ideas/csv
  - Export JSON:     /api/export/ideas/json
  - Full Backup:     /api/export/backup

Phase 5 APIs:
  - Incubator:    /api/incubator
Phase 4 APIs:
  - API Keys:     /api/keys
  - Webhooks:     /api/webhooks
  - Integrations: /api/integrations
========================================================
  `);

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
  });
  });
}

// Start the server
startServer().catch((error) => {
  logger.error('FATAL: Server startup failed', error instanceof Error ? error : undefined);
  // Fallback to console.error in case logger pipeline is broken
  console.error('Server startup failed:', error); // eslint-disable-line no-console
  process.exit(1);
});
