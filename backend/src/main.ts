import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { voiceMemoRouter } from './routes/voice-memo';
import { ideasRouter } from './routes/ideas';
import { healthRouter } from './routes/health';
import { knowledgeGraphRouter } from './routes/knowledge-graph';
import { meetingsRouter } from './routes/meetings';
import { userProfileRouter } from './routes/user-profile';
import { companiesRouter } from './routes/companies';
// Phase 4: Enterprise Integration Routes
import { apiKeysRouter } from './routes/api-keys';
import { webhooksRouter } from './routes/webhooks';
import { integrationsRouter } from './routes/integrations';
import { rateLimiter, cleanupRateLimits } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
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
// Phase 12: Developer Experience
import { setupSwagger } from './utils/swagger';
// Error Handling
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // For Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'"],  // For Swagger UI
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,  // For Swagger UI
}));

// CORS with whitelist (configurable via environment)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:8080',
  'capacitor://localhost',
  'ionic://localhost'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // SECURITY: Block unauthorized origins in production
      if (process.env.NODE_ENV === 'production') {
        logger.warn('CORS blocked unauthorized origin', { origin, operation: 'cors' });
        callback(new Error('Not allowed by CORS'));
      } else {
        // Allow in development for testing
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id']
}));

// Request tracking & compression
app.use(requestIdMiddleware); // Phase 12: Request ID tracking
app.use(compression()); // Phase 11: gzip compression for responses

// Global rate limiter for all requests
app.use(rateLimiter);

// Body parsers with reasonable limits (10MB default, routes can override)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phase 12: API Documentation
setupSwagger(app);

// Phase 1-3 Routes
app.use('/api/health', healthRouter);
app.use('/api/voice-memo', voiceMemoRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/knowledge-graph', knowledgeGraphRouter);
app.use('/api/meetings', meetingsRouter);
app.use('/api/profile', userProfileRouter);
app.use('/api/companies', companiesRouter);

// Phase 4: Enterprise Integration Routes
app.use('/api/keys', apiKeysRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/integrations', integrationsRouter);

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

// Phase 19: Push Notifications
app.use('/api/notifications', notificationsRouter);  // Notification routes: /api/notifications/register, etc.

// Phase 20: Digest & Advanced Analytics
app.use('/api', digestRouter);  // Digest routes: /api/:context/digest/*
app.use('/api', advancedAnalyticsRouter);  // Advanced analytics: /api/:context/analytics/dashboard, etc.

// Phase 21: Personalization Chat - "Lerne mich kennen"
app.use('/api/personalization', personalizationChatRouter);  // Chat: /api/personalization/chat, /api/personalization/facts

// Phase 22: Learning Tasks - "Tägliche Lernaufgaben"
app.use('/api', learningTasksRouter);  // Learning tasks: /api/:context/learning-tasks, /api/:context/learning-stats

// Phase 23: Intelligent Learning System - "KI lernt kontinuierlich"
app.use('/api', intelligentLearningRouter);  // /api/:context/focus, /api/:context/feedback, /api/:context/research, /api/:context/suggestions

// Cleanup rate limits every hour
setInterval(() => {
  cleanupRateLimits().catch((err) => logger.error('Rate limit cleanup failed', err));
}, 60 * 60 * 1000);

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
  console.log(`
Personal AI System - Backend (Phase 23)
========================================================
Server:      http://localhost:${PORT}
API Docs:    http://localhost:${PORT}/api-docs
Ollama:      ${process.env.OLLAMA_URL ? 'configured' : 'not configured'}
Database:    ${process.env.DATABASE_URL ? 'DATABASE_URL (Railway)' : (process.env.DB_HOST ? 'DB_HOST configured' : 'localhost (default)')}
========================================================
Phase 6 APIs (NEW!):
  - Context-aware routes support /api/:context/...
  - Personal Persona: Friendly, exploratory
  - Work Persona: Structured, business-focused

Phase 23 APIs (NEW!):
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

Phase 19 APIs:
  - Push Register:   /api/notifications/register
  - Preferences:     /api/notifications/preferences
  - Send Notif:      /api/notifications/send
  - History:         /api/notifications/history

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

  if (!dbStatus.personal || !dbStatus.work) {
    logger.warn('One or more databases are not connected properly', { dbStatus });
  } else {
    logger.info('All databases connected successfully', { dbStatus });
  }

  // Start periodic connection health checks (every 5 minutes)
  // This keeps connections alive and detects issues early
  startConnectionHealthCheck(5 * 60 * 1000);
});
