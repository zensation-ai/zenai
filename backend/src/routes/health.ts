/**
 * Phase 12: Extended Health Check Endpoint
 *
 * Provides comprehensive system health information including:
 * - Database connections (personal & work)
 * - AI services (Claude, Ollama)
 * - Redis cache status
 * - Connection pool statistics
 * - System info (uptime, version, memory)
 */

import { Router } from 'express';
import { testConnections, getPoolStats, getHealthCheckStatus } from '../utils/database-context';
import { checkOllamaHealth } from '../utils/ollama';
import { getCacheStats } from '../utils/cache';
import { getAvailableServices } from '../services/ai';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import { getCircuitBreakerStatus } from '../utils/retry';
import { isClaudeAvailable, generateClaudeResponse } from '../services/claude';
import { logger } from '../utils/logger';

// Version from package.json - read at startup
const packageJson = require('../../package.json');
const version = packageJson.version || '2.0.0';

export const healthRouter = Router();

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Active Claude API health check
 * Sends minimal request to verify API connectivity
 * Only runs if Claude is configured
 */
async function checkClaudeHealth(): Promise<{
  available: boolean;
  configured: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const configured = isClaudeAvailable();
  if (!configured) {
    return { available: false, configured: false };
  }

  try {
    const start = Date.now();
    // Minimal API call - just check connectivity with very short response
    await generateClaudeResponse(
      'Respond with exactly: OK',
      'Health check',
      { maxTokens: 5 }
    );
    const latencyMs = Date.now() - start;
    logger.debug('Claude health check passed', { latencyMs });
    return { available: true, configured: true, latencyMs };
  } catch (error: any) {
    logger.warn('Claude health check failed', { error: error.message });
    return {
      available: false,
      configured: true,
      error: error.message?.substring(0, 100), // Truncate long errors
    };
  }
}

/**
 * @route GET /api/health
 * @description FAST health check endpoint (< 100ms target)
 * Returns basic status without external service calls
 * For comprehensive checks, use /api/health/detailed
 *
 * NOTE: Includes minimal services info for frontend status indicators
 * These are based on configuration, not active health checks
 */
healthRouter.get('/', (req, res) => {
  const startTime = Date.now();
  const aiServices = getAvailableServices();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    version,
    uptime: {
      seconds: Math.floor((Date.now() - serverStartTime) / 1000),
      human: formatUptime(Date.now() - serverStartTime),
    },
    memory: {
      heapUsed: formatBytes(process.memoryUsage().heapUsed),
      heapTotal: formatBytes(process.memoryUsage().heapTotal),
      rss: formatBytes(process.memoryUsage().rss),
    },
    // Minimal services info for frontend status indicators
    // Based on configuration, not active health checks
    services: {
      databases: {
        personal: { status: 'connected' }, // If server is running, DB init succeeded
        work: { status: 'connected' },
      },
      ai: {
        primary: aiServices.primary,
        claude: { status: isClaudeAvailable() ? 'healthy' : 'not_configured' },
        ollama: { status: 'disconnected', models: [] }, // Ollama only for local dev
      },
    },
    message: 'For detailed health check, use /api/health/detailed',
  });
});

/**
 * @route GET /api/health/detailed
 * @description Comprehensive health check endpoint with all service checks
 * SECURITY: In production, only return minimal info unless authenticated
 * WARNING: This endpoint is slower (1-3s) due to external service checks
 */
healthRouter.get('/detailed', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';

  // Check if request has valid API key (for detailed info)
  const hasApiKey = req.headers.authorization?.startsWith('Bearer ab_') ||
                    (req.headers['x-api-key'] as string)?.startsWith('ab_');

  // Gather all health checks in parallel
  const [dbHealth, ollamaHealth, cacheStats, claudeHealth] = await Promise.all([
    testConnections().catch(() => ({ personal: false, work: false })),
    checkOllamaHealth(),
    getCacheStats(),
    checkClaudeHealth().catch(() => ({ available: false, configured: false, error: 'Health check failed', latencyMs: undefined })),
  ]);

  const poolStats = getPoolStats();
  const aiServices = getAvailableServices();
  const circuitBreakerStatus = getCircuitBreakerStatus();

  const allDbHealthy = dbHealth.personal && dbHealth.work;
  const anyDbHealthy = dbHealth.personal || dbHealth.work;
  // Use actual Claude availability from active check, not just config
  const anyAiAvailable = claudeHealth.available || ollamaHealth.available;
  // Check if any circuit breaker is open (degraded state)
  const anyCircuitBreakerOpen = Object.values(circuitBreakerStatus).some(cb => cb.isOpen);

  // Calculate overall status
  // Healthy: All DBs + at least one AI service + no circuit breakers open
  // Degraded: At least one DB working OR circuit breaker open
  // Unhealthy: No databases available
  const isHealthy = allDbHealthy && anyAiAvailable && !anyCircuitBreakerOpen;
  const isDegraded = anyDbHealthy || anyCircuitBreakerOpen;

  // Get DB health check circuit breaker status
  const dbHealthCheckStatus = getHealthCheckStatus();

  // SECURITY: Minimal response in production without API key
  // Include basic service status for frontend health indicators
  if (isProduction && !hasApiKey) {
    const minimalStatus = {
      status: isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy'),
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      services: {
        databases: {
          personal: { status: dbHealth.personal ? 'connected' : 'disconnected' },
          work: { status: dbHealth.work ? 'connected' : 'disconnected' },
          healthCheck: dbHealthCheckStatus,
        },
        ai: {
          primary: aiServices.primary,
          claude: { status: claudeHealth.available ? 'healthy' : 'unavailable' },
          ollama: { status: ollamaHealth.available ? 'connected' : 'disconnected', models: ollamaHealth.models || [] },
        },
        cache: {
          status: cacheStats.connected ? 'connected' : 'disconnected',
          type: 'redis',
        },
      },
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
        healthCheck: dbHealthCheckStatus,
      },
      ai: {
        primary: aiServices.primary,
        claude: {
          status: claudeHealth.available ? 'healthy' :
                  claudeHealth.configured ? 'unhealthy' : 'not_configured',
          configured: claudeHealth.configured,
          available: claudeHealth.available,
          latencyMs: claudeHealth.latencyMs,
          error: claudeHealth.error,
          circuitBreaker: {
            standard: circuitBreakerStatus['claude'],
            extendedThinking: circuitBreakerStatus['claude-extended'],
          },
        },
        ollama: {
          status: ollamaHealth.available ? 'connected' : 'disconnected',
          models: ollamaHealth.models,
          circuitBreaker: {
            generation: circuitBreakerStatus['ollama'],
            embedding: circuitBreakerStatus['ollama-embedding'],
          },
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
  if (days > 0) {parts.push(`${days}d`);}
  if (hours > 0) {parts.push(`${hours}h`);}
  if (minutes > 0) {parts.push(`${minutes}m`);}
  parts.push(`${secs}s`);

  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
