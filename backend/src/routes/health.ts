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
import { testConnections, getPoolStats, getHealthCheckStatus, getDbBreakerStats } from '../utils/database-context';
import { checkOllamaHealth } from '../utils/ollama';
import { getCacheStats } from '../utils/cache';
import { getAvailableServices } from '../services/ai';
import { asyncHandler } from '../middleware/errorHandler';
import { getCircuitBreakerStatus } from '../utils/retry';
import { isClaudeAvailable, generateClaudeResponse } from '../services/claude';
import { getClaudeBreakerStats } from '../services/claude/streaming';
import { getBraveBreakerStats } from '../services/web-search';
import { queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { getPrometheusMetrics } from '../utils/metrics';
import { getExecutorFactory } from '../services/code-execution/executor-factory';
import { optionalAuth } from '../middleware/auth';

// Version from package.json - read at startup
const packageJson = require('../../package.json');
const version = packageJson.version || '2.0.0';

export const healthRouter = Router();

/**
 * Prometheus-compatible metrics endpoint
 * Returns application metrics in text format for monitoring.
 */
healthRouter.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(getPrometheusMetrics());
});

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Claude health check failed', { error: errorMessage });
    return {
      available: false,
      configured: true,
      error: errorMessage.substring(0, 100), // Truncate long errors
    };
  }
}

/**
 * Phase 7.3: Measure database query latency per context.
 * Runs a simple SELECT 1 and reports the round-trip time.
 */
async function measureDbLatency(context: 'personal' | 'work' | 'learning' | 'creative' | 'demo'): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    await queryContext(context, 'SELECT 1');
    return { connected: true, latencyMs: Date.now() - start };
  } catch (error: unknown) {
    return {
      connected: false,
      error: error instanceof Error ? error.message.substring(0, 100) : 'Unknown error',
    };
  }
}

/**
 * Phase 7.3: Check Brave Search API availability.
 * Only tests if the API key is configured (doesn't consume quota).
 */
function checkBraveSearchStatus(): {
  configured: boolean;
  provider: string;
} {
  const hasApiKey = !!process.env.BRAVE_SEARCH_API_KEY;
  return {
    configured: hasApiKey,
    provider: hasApiKey ? 'brave' : 'duckduckgo-fallback',
  };
}

/**
 * Phase 7.3: Check code execution provider status.
 */
function checkCodeExecutionStatus(): {
  available: boolean;
  provider: string | null;
  enabled: boolean;
} {
  const factory = getExecutorFactory();
  const info = factory.getProviderInfo();
  return {
    available: info.available,
    provider: info.type,
    enabled: process.env.ENABLE_CODE_EXECUTION !== 'false',
  };
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
    // Uses background health check status for accuracy
    services: {
      databases: (() => {
        const hcStatus = getHealthCheckStatus();
        const dbStatus = hcStatus.isHealthy ? 'connected' : 'degraded';
        return {
          personal: { status: dbStatus },
          work: { status: dbStatus },
          learning: { status: dbStatus },
          creative: { status: dbStatus },
        };
      })(),
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
healthRouter.get('/detailed', optionalAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';

  // Check if request has a validated API key (verified by optionalAuth middleware)
  const hasApiKey = !!req.apiKey;

  // Gather all health checks in parallel (Phase 7.3: expanded with latency + dependencies)
  const [dbHealth, ollamaHealth, cacheStats, claudeHealth, personalLatency, workLatency, learningLatency, creativeLatency] = await Promise.all([
    testConnections().catch(() => ({ personal: false, work: false, learning: false, creative: false })),
    checkOllamaHealth(),
    getCacheStats(),
    checkClaudeHealth().catch(() => ({ available: false, configured: false, error: 'Health check failed', latencyMs: undefined })),
    measureDbLatency('personal'),
    measureDbLatency('work'),
    measureDbLatency('learning'),
    measureDbLatency('creative'),
  ]);
  const braveSearchStatus = checkBraveSearchStatus();
  const codeExecutionStatus = checkCodeExecutionStatus();

  const poolStats = getPoolStats();
  const aiServices = getAvailableServices();
  const circuitBreakerStatus = getCircuitBreakerStatus();
  const claudeStreamBreakerStats = getClaudeBreakerStats();
  const braveBreakerStats = getBraveBreakerStats();
  const dbBreakerStats = getDbBreakerStats();

  const allDbHealthy = dbHealth.personal && dbHealth.work && dbHealth.learning && dbHealth.creative;
  const anyDbHealthy = dbHealth.personal || dbHealth.work || dbHealth.learning || dbHealth.creative;
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
  // Only expose overall status for monitoring tools (e.g. UptimeRobot)
  // No internal details (latencies, model names, service configs)
  if (isProduction && !hasApiKey) {
    const overallStatus = isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy');
    const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
    return res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
    });
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
          latencyMs: personalLatency.latencyMs,
          pool: poolStats.contexts.personal,
        },
        work: {
          status: dbHealth.work ? 'connected' : 'disconnected',
          latencyMs: workLatency.latencyMs,
          pool: poolStats.contexts.work,
        },
        learning: {
          status: dbHealth.learning ? 'connected' : 'disconnected',
          latencyMs: learningLatency.latencyMs,
          pool: poolStats.contexts.learning,
        },
        creative: {
          status: dbHealth.creative ? 'connected' : 'disconnected',
          latencyMs: creativeLatency.latencyMs,
          pool: poolStats.contexts.creative,
        },
        sharedPool: poolStats.pool,
        poolEvents: poolStats.events,
        healthCheck: dbHealthCheckStatus,
        circuitBreaker: dbBreakerStats,
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
            streaming: claudeStreamBreakerStats,
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
      dependencies: {
        webSearch: {
          ...braveSearchStatus,
          circuitBreaker: braveBreakerStats,
        },
        codeExecution: codeExecutionStatus,
        github: {
          configured: !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
        },
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
  const dbHealth = await testConnections().catch(() => ({ personal: false, work: false, learning: false, creative: false }));

  const isReady = dbHealth.personal || dbHealth.work;

  if (isReady) {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      databases: {
        personal: dbHealth.personal,
        work: dbHealth.work,
        learning: dbHealth.learning,
        creative: dbHealth.creative,
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
