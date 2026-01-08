import express from 'express';
import cors from 'cors';
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
import { testConnections, setupGracefulShutdown } from './utils/database-context';
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
// Phase 12: Developer Experience
import { setupSwagger } from './utils/swagger';
// Error Handling
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(requestIdMiddleware); // Phase 12: Request ID tracking
app.use(compression()); // Phase 11: gzip compression for responses
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
app.use('/api/stories', storiesRouter);

// Phase 6: Training Routes
app.use('/api', trainingRouter);  // Context-aware training routes: /api/:context/training

// Phase 10: Offline Sync Routes
app.use('/api', syncRouter);  // Context-aware sync routes: /api/:context/sync/*

// Phase 10: Analytics Routes
app.use('/api', analyticsRouter);  // Context-aware analytics: /api/:context/analytics/*

// Cleanup rate limits every hour
setInterval(() => {
  cleanupRateLimits().catch((err) => logger.error('Rate limit cleanup failed', err));
}, 60 * 60 * 1000);

// Error handling - Use centralized error handler
app.use(errorHandler);

// Setup graceful shutdown for database connections
setupGracefulShutdown();

// Start server
app.listen(PORT, async () => {
  console.log(`
🧠 Personal AI System - Backend (Phase 12: Developer Experience)
========================================================
Server:      http://localhost:${PORT}
API Docs:    http://localhost:${PORT}/api-docs
Ollama:      ${process.env.OLLAMA_URL}
========================================================
DUAL-DATABASE ARCHITECTURE:
  🏠 Personal: postgres://${process.env.DB_HOST}:${process.env.DB_PORT}/personal_ai
  💼 Work:     postgres://${process.env.DB_HOST}:${process.env.DB_PORT}/work_ai
========================================================
Phase 6 APIs (NEW!):
  - Context-aware routes support /api/:context/...
  - Personal Persona: Friendly, exploratory
  - Work Persona: Structured, business-focused

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
});
