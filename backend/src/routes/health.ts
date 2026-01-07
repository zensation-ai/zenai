import { Router } from 'express';
import { testConnections } from '../utils/database-context';
import { checkOllamaHealth } from '../utils/ollama';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  const startTime = Date.now();

  const [dbHealth, ollamaHealth] = await Promise.all([
    testConnections().catch(() => ({ personal: false, work: false })),
    checkOllamaHealth(),
  ]);

  const allDbHealthy = dbHealth.personal && dbHealth.work;
  const anyDbHealthy = dbHealth.personal || dbHealth.work;

  const status = {
    status: allDbHealthy && ollamaHealth.available ? 'healthy' :
            (anyDbHealthy ? 'degraded' : 'unhealthy'),
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    services: {
      databases: {
        personal: {
          status: dbHealth.personal ? 'connected' : 'disconnected',
          database: 'personal_ai',
        },
        work: {
          status: dbHealth.work ? 'connected' : 'disconnected',
          database: 'work_ai',
        },
      },
      ollama: {
        status: ollamaHealth.available ? 'connected' : 'disconnected',
        url: process.env.OLLAMA_URL,
        models: ollamaHealth.models,
      },
    },
  };

  const httpStatus = status.status === 'healthy' ? 200 :
                     status.status === 'degraded' ? 200 : 503;
  res.status(httpStatus).json(status);
});
