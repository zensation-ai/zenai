import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
// Phase Security Sprint 4: Secrets Manager - must be imported early
import { secretsManager } from './services/secrets-manager';
import { voiceMemoRouter } from './routes/voice-memo';
import { ideasRouter } from './routes/ideas';
import { healthRouter } from './routes/health';
import { knowledgeGraphRouter } from './routes/knowledge-graph';
import { meetingsRouter } from './routes/meetings';
import { userProfileRouter, userProfileContextRouter } from './routes/user-profile';
import { companiesRouter } from './routes/companies';
// Phase 4: Enterprise Integration Routes
import { apiKeysRouter } from './routes/api-keys';
// Phase Security Sprint 3: Audit Logs
import { auditLogsRouter } from './routes/audit-logs';
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
import { testConnections, setupGracefulShutdown, startConnectionHealthCheck } from './utils/database-context';
import { voiceMemoContextRouter } from './routes/voice-memo-context';
import { contextsRouter } from './routes/contexts';
// Phase 7: Media & Stories
import mediaRouter from './routes/media';
import storiesRouter from './routes/stories';
// Phase 6: Training
import { trainingRouter } from './routes/training';
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
import { advancedAnalyticsRouter } from './routes/analytics-advanced';
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
// Phase 12: Developer Experience
import { setupSwagger } from './utils/swagger';
// Error Handling
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
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
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id', 'x-csrf-token'],
  exposedHeaders: ['X-CSRF-Token', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Request tracking & compression
app.use(requestIdMiddleware); // Phase 12: Request ID tracking
app.use(compression()); // Phase 11: gzip compression for responses

// Global rate limiter for all requests
app.use(rateLimiter);

// Body parsers with reasonable limits (10MB default, routes can override)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phase Security Sprint 3: Cookie parser for CSRF protection
app.use(ensureCookieParser);

// Phase Security Sprint 3: CSRF Token endpoint for SPA clients
app.get('/api/csrf-token', getCsrfTokenHandler);

// Phase Security Sprint 3: CSRF Protection for state-changing requests
// Applied after body parsing so we can read _csrf from body
app.use(csrfProtection);

// Phase 12: API Documentation
setupSwagger(app);

// Phase 1-3 Routes
app.use('/api/health', healthRouter);
app.use('/api/voice-memo', voiceMemoRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/knowledge-graph', knowledgeGraphRouter);
app.use('/api/meetings', meetingsRouter);
app.use('/api/profile', userProfileRouter);
app.use('/api', userProfileContextRouter);  // Context-aware profile routes: /api/:context/profile/*
app.use('/api/companies', companiesRouter);

// Phase 4: Enterprise Integration Routes
app.use('/api/keys', apiKeysRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/integrations', integrationsRouter);

// Phase Security Sprint 3: Audit Logs
app.use('/api/audit-logs', auditLogsRouter);

// Phase 5: Thought Incubator
app.use('/api/incubator', incubatorRouter);

// Phase 6: Context-Aware Routes
app.use('/api', contextsRouter);
app.use('/api', voiceMemoContextRouter);

// Phase 7: Media & Stories
app.use('/api', mediaRouter);  // Context-aware media routes: /api/:context/media
app.use('/api', storiesRouter);  // Context-aware stories: /api/:context/stories

// Phase 6: Training Routes
app.use('/api', trainingRouter);  // Context-aware training routes: /api/:context/training

// Phase 10: Offline Sync Routes
app.use('/api', syncRouter);  // Context-aware sync routes: /api/:context/sync/*

// Phase 10: Analytics Routes
app.use('/api', analyticsRouter);  // Context-aware analytics: /api/:context/analytics/*

// Phase 18: Export System
app.use('/api/export', exportRouter);  // Export routes: /api/export/ideas/pdf, /api/export/ideas/csv, etc.

// Phase 19: Push Notifications (Context-Aware APNs)
app.use('/api', notificationsRouter);  // Context-aware: /api/:context/notifications/device, etc.

// Phase 20: Digest & Advanced Analytics
app.use('/api', digestRouter);  // Digest routes: /api/:context/digest/*
app.use('/api', advancedAnalyticsRouter);  // Advanced analytics: /api/:context/analytics/dashboard, etc.

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

// Phase 27: Proactive Intelligence System - "KI macht proaktive Vorschläge"
app.use('/api', proactiveRouter);  // /api/:context/proactive/suggestions, /api/:context/proactive/routines, etc.

// Phase 29: General Chat - ChatGPT-like interface
app.use('/api/chat', generalChatRouter);  // /api/chat/sessions, /api/chat/sessions/:id/messages, /api/chat/quick

// Phase 28: AI Evolution Analytics - "KI-Lernkurve und Domain-Stärken"
// Routes integriert in evolutionRouter: /api/:context/evolution/learning-curve, /api/:context/evolution/domain-strengths, etc.

// Cleanup rate limits every hour
// Store interval reference for proper cleanup on shutdown
// Note: Cleanup happens in setupGracefulShutdown() via closeAllPools()
const rateLimitCleanupInterval = setInterval(() => {
  cleanupRateLimits().catch((err) => logger.error('Rate limit cleanup failed', err));
}, 60 * 60 * 1000);

// Clear interval on shutdown (setupGracefulShutdown handles DB cleanup)
process.once('SIGTERM', () => clearInterval(rateLimitCleanupInterval));
process.once('SIGINT', () => clearInterval(rateLimitCleanupInterval));

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

// Start server
app.listen(PORT, async () => {
  // Phase Security Sprint 4: Initialize Secrets Manager first
  try {
    await secretsManager.initialize();
    logger.info('SecretsManager initialized successfully');
  } catch (error) {
    logger.error('FATAL: SecretsManager initialization failed', error instanceof Error ? error : undefined);
    process.exit(1);
  }

  // Get secrets health status for startup display
  const secretsHealth = secretsManager.getHealthSummary();
  const secretsDbStatus = secretsManager.getDatabaseStatus();
  const aiStatus = secretsManager.getAIProviderStatus();
  const cacheStatus = secretsManager.getCacheStatus();

  console.log(`
Personal AI System - Backend (Phase 29)
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
  - Suggestions:     GET /api/:context/proactive/suggestions
  - Accept/Dismiss:  POST /api/:context/proactive/suggestions/:id/accept|dismiss
  - Routines:        GET /api/:context/proactive/routines
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

  // Test both database connections
  logger.info('Testing database connections...');
  const dbStatus = await testConnections();

  if (!dbStatus.personal && !dbStatus.work) {
    // Critical: Both databases failed - cannot operate
    logger.error('CRITICAL: Both databases failed to connect - shutting down', { dbStatus });
    process.exit(1);
  } else if (!dbStatus.personal || !dbStatus.work) {
    // One database failed - warn but continue (partial functionality)
    logger.warn('One database is not connected properly', { dbStatus });
  } else {
    logger.info('All databases connected successfully', { dbStatus });
  }

  // Start periodic connection health checks (every 5 minutes)
  // This keeps connections alive and detects issues early
  startConnectionHealthCheck(5 * 60 * 1000);
});
