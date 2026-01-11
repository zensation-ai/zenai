/**
 * Phase 12: Extended Health Check Endpoint
 *
 * Provides comprehensive system health information including:
 * - Database connections (personal & work)
 * - AI services (OpenAI, Ollama)
 * - Redis cache status
 * - Connection pool statistics
 * - System info (uptime, version, memory)
 */

import { Router } from 'express';
import { testConnections, getPoolStats } from '../utils/database-context';
import { checkOllamaHealth } from '../utils/ollama';
import { getCacheStats } from '../utils/cache';
import { getAvailableServices } from '../services/ai';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';

// Version from package.json - read at startup
const packageJson = require('../../package.json');
const version = packageJson.version || '2.0.0';

export const healthRouter = Router();

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * @route GET /api/health
 * @description Comprehensive health check endpoint
 * SECURITY: In production, only return minimal info unless authenticated
 */
healthRouter.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';

  // Check if request has valid API key (for detailed info)
  const hasApiKey = req.headers.authorization?.startsWith('Bearer ab_') ||
                    (req.headers['x-api-key'] as string)?.startsWith('ab_');

  // Gather all health checks in parallel
  const [dbHealth, ollamaHealth, cacheStats] = await Promise.all([
    testConnections().catch(() => ({ personal: false, work: false })),
    checkOllamaHealth(),
    getCacheStats(),
  ]);

  const poolStats = getPoolStats();
  const aiServices = getAvailableServices();

  const allDbHealthy = dbHealth.personal && dbHealth.work;
  const anyDbHealthy = dbHealth.personal || dbHealth.work;
  const anyAiAvailable = aiServices.openai || ollamaHealth.available;

  // Calculate overall status
  // Healthy: All DBs + at least one AI service
  // Degraded: At least one DB working
  // Unhealthy: No databases available
  const isHealthy = allDbHealthy && anyAiAvailable;
  const isDegraded = anyDbHealthy;

  // SECURITY: Minimal response in production without API key
  if (isProduction && !hasApiKey) {
    const minimalStatus = {
      status: isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy'),
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
    };
    const httpStatus = minimalStatus.status === 'healthy' ? 200 :
                       minimalStatus.status === 'degraded' ? 200 : 503;
    return res.status(httpStatus).json(minimalStatus);
  }

  // Full response for development or authenticated requests
  const status = {
    status: isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy'),
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    version,
    uptime: {
      seconds: Math.floor((Date.now() - serverStartTime) / 1000),
      human: formatUptime(Date.now() - serverStartTime),
    },
    services: {
      databases: {
        personal: {
          status: dbHealth.personal ? 'connected' : 'disconnected',
          pool: poolStats.personal,
        },
        work: {
          status: dbHealth.work ? 'connected' : 'disconnected',
          pool: poolStats.work,
        },
      },
      ai: {
        primary: aiServices.primary,
        openai: {
          status: aiServices.openai ? 'configured' : 'not_configured',
        },
        ollama: {
          status: ollamaHealth.available ? 'connected' : 'disconnected',
          models: ollamaHealth.models,
        },
      },
      cache: {
        status: cacheStats.connected ? 'connected' : 'disconnected',
        type: 'redis',
        keys: cacheStats.keys,
        memory: cacheStats.memory,
      },
    },
    // SECURITY: Only include system info in development
    ...(isProduction ? {} : {
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          heapUsed: formatBytes(process.memoryUsage().heapUsed),
          heapTotal: formatBytes(process.memoryUsage().heapTotal),
          rss: formatBytes(process.memoryUsage().rss),
        },
      },
    }),
  };

  const httpStatus = status.status === 'healthy' ? 200 :
                     status.status === 'degraded' ? 200 : 503;
  res.status(httpStatus).json(status);
}));

/**
 * @route GET /api/health/live
 * @description Kubernetes liveness probe - minimal check
 */
healthRouter.get('/live', asyncHandler(async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}));

/**
 * @route GET /api/health/ready
 * @description Kubernetes readiness probe - checks critical services
 */
healthRouter.get('/ready', asyncHandler(async (req, res) => {
  const dbHealth = await testConnections().catch(() => ({ personal: false, work: false }));

  const isReady = dbHealth.personal || dbHealth.work;

  if (isReady) {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      databases: {
        personal: dbHealth.personal,
        work: dbHealth.work,
      },
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      reason: 'No database connections available',
    });
  }
}));

// Helper functions
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
