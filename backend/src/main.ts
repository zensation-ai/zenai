import express from 'express';
import cors from 'cors';
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
// Phase 5: Thought Incubator
import incubatorRouter from './routes/incubator';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Cleanup rate limits every hour
setInterval(() => {
  cleanupRateLimits().catch(console.error);
}, 60 * 60 * 1000);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🧠 Personal AI System - Backend (Phase 5)
==========================================
Server:      http://localhost:${PORT}
Ollama:      ${process.env.OLLAMA_URL}
Database:    postgres://${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}
==========================================
Phase 5 APIs:
  - Incubator:    /api/incubator (NEW!)
Phase 4 APIs:
  - API Keys:     /api/keys
  - Webhooks:     /api/webhooks
  - Integrations: /api/integrations
==========================================
  `);
});
