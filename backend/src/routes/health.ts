import { Router } from 'express';
import { testConnection } from '../utils/database';
import { checkOllamaHealth } from '../utils/ollama';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  const startTime = Date.now();

  const [dbHealth, ollamaHealth] = await Promise.all([
    testConnection().catch(() => false),
    checkOllamaHealth(),
  ]);

  const status = {
    status: dbHealth && ollamaHealth.available ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    services: {
      database: {
        status: dbHealth ? 'connected' : 'disconnected',
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
      },
      ollama: {
        status: ollamaHealth.available ? 'connected' : 'disconnected',
        url: process.env.OLLAMA_URL,
        models: ollamaHealth.models,
      },
    },
  };

  res.status(status.status === 'healthy' ? 200 : 503).json(status);
});
