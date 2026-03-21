import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import type { Module } from '../../core/module';
import { securityHeaders } from '../../middleware/security-headers';
import { rateLimiter, cleanupRateLimits, stopRateLimitCleanup } from '../../middleware/auth';
import { requestIdMiddleware } from '../../middleware/requestId';
import { csrfProtection, getCsrfTokenHandler, ensureCookieParser } from '../../middleware/csrf';
import { requestContextMiddleware } from '../../utils/request-context';
import { tracingMiddleware } from '../../middleware/tracing';
import { cacheControlMiddleware } from '../../middleware/cache-control';
import { requestTimeoutMiddleware } from '../../middleware/request-timeout';
import { requestLogger, logger } from '../../utils/logger';
import { setupSwagger } from '../../utils/swagger';
import { demoGuard } from '../../middleware/demo-guard';

let rateLimitCleanupInterval: NodeJS.Timeout | null = null;
let serverReady = false;

export function setServerReady(ready: boolean): void {
  serverReady = ready;
}

export class MiddlewareModule implements Module {
  name = 'middleware';

  registerRoutes(app: Express): void {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // SECURITY: Trust proxy for correct client IP behind reverse proxies
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL) {
      app.set('trust proxy', 1);
    }

    // Security Middleware - Enhanced Security Headers
    const securityMiddleware = securityHeaders({
      isDevelopment,
      enableSwagger: true,
    });
    securityMiddleware.forEach(middleware => app.use(middleware));

    // CORS with whitelist
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      'capacitor://localhost',
      'ionic://localhost'
    ];

    if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
      logger.warn('CORS: Using default allowed origins - configure ALLOWED_ORIGINS env var', {
        operation: 'cors',
        securityNote: 'Production should have explicit ALLOWED_ORIGINS configured'
      });
    }

    const vercelPreviewPatterns = [
      /^https:\/\/frontend-[a-z0-9]+-alexander-berings-projects\.vercel\.app$/,
      /^https:\/\/zenai-[a-z0-9]+\.vercel\.app$/,
      /^https:\/\/zenai\.vercel\.app$/,
      /^https:\/\/zensation\.ai$/,
      /^https:\/\/zensation\.app$/,
      /^https:\/\/zensation\.sh$/,
      /^https:\/\/.*\.zensation\.ai$/,
      /^https:\/\/.*\.zensation\.app$/,
      /^https:\/\/ki-ab-[a-z0-9]+\.vercel\.app$/,
      /^https:\/\/ki-ab\.vercel\.app$/,
    ];

    // Safe no-origin middleware
    app.use((req, res, next) => {
      const safeNoOriginPaths = ['/api/health', '/api-docs', '/swagger'];
      const isSafeEndpoint = safeNoOriginPaths.some(path => req.path.startsWith(path));
      const hasApiKeyAuth = !!(req.headers.authorization || req.headers['x-api-key']);
      (req as { _allowNoOrigin?: boolean })._allowNoOrigin = isSafeEndpoint || hasApiKeyAuth;
      next();
    });

    app.use(cors({
      origin: (origin, callback) => {
        if (!origin) {
          if (process.env.NODE_ENV === 'production') {
            logger.debug('CORS: No-origin request (mobile/server-to-server)', {
              operation: 'cors',
              note: 'Request must have valid API key'
            });
          }
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        const isVercelPreview = vercelPreviewPatterns.some(pattern => pattern.test(origin));
        if (isVercelPreview) {
          callback(null, true);
          return;
        }
        if (process.env.NODE_ENV === 'production') {
          logger.warn('CORS blocked unauthorized origin', { origin, operation: 'cors' });
          callback(new Error('Not allowed by CORS'));
        } else {
          logger.debug('CORS: Allowing unknown origin in dev mode', {
            origin, operation: 'cors',
            note: 'This would be blocked in production'
          });
          callback(null, true);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id', 'x-csrf-token', 'x-ai-context'],
      exposedHeaders: ['X-CSRF-Token', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
    }));

    // Per-request context for RLS
    app.use(requestContextMiddleware);

    // Request-level timeout enforcement (before routes, after CORS)
    app.use(requestTimeoutMiddleware);

    // Request tracking & compression
    app.use(requestIdMiddleware);
    app.use(tracingMiddleware);
    app.use(requestLogger);
    app.use(compression({
      level: 6,
      threshold: 512,
      memLevel: 8,
      filter: (req, res) => {
        // Skip compression for SSE streams (Server-Sent Events)
        if (res.getHeader('Content-Type')?.toString().includes('text/event-stream')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }));

    // Cache-Control headers & ETag support
    app.use(cacheControlMiddleware);

    // A2A Protocol - Agent Card discovery (no auth, must be before auth middleware)
    const { a2aWellKnownRouter } = require('../../routes/a2a');
    app.use(a2aWellKnownRouter);

    // MCP Server Card discovery (no auth)
    app.get('/.well-known/mcp.json', (_req, res) => {
      const baseUrl = process.env.API_URL
        || (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null)
        || `http://localhost:${process.env.PORT || 3000}`;
      res.json({
        name: 'ZenAI',
        version: '1.0.0',
        description: 'ZenAI Enterprise AI Platform - Personal AI Brain with 51+ tools',
        transport: { type: 'streamable-http', url: `${baseUrl}/api/mcp` },
        capabilities: { tools: true, resources: true, prompts: true },
        authentication: { type: 'bearer', description: 'API key or JWT token required' },
        contact: { name: 'ZenSation Enterprise Solutions', url: 'https://zensation.ai' },
      });
    });

    // Readiness gate: return 503 until DB connections are confirmed
    app.use((req, res, next) => {
      if (serverReady || req.path.startsWith('/api/health') || req.path.startsWith('/api-docs') || req.path.startsWith('/.well-known')) {
        return next();
      }
      return res.status(503).json({
        success: false,
        error: 'Service starting up, please retry shortly',
        code: 'SERVICE_UNAVAILABLE',
      });
    });

    // Global rate limiter
    app.use(rateLimiter);

    // Body parsers
    app.use(express.json({
      limit: '10mb',
      verify: (req: express.Request, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // CSRF Protection
    app.use(ensureCookieParser);
    app.get('/api/csrf-token', getCsrfTokenHandler);

    // CSP violation reporting
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

    app.use(csrfProtection);

    // Swagger API Documentation
    setupSwagger(app);

    // Demo guard — rate-limits and restricts demo JWT users after route-level auth sets req.jwtUser
    app.use(demoGuard);

    // Start rate limit cleanup
    rateLimitCleanupInterval = setInterval(() => {
      cleanupRateLimits().catch((err) => logger.error('Rate limit cleanup failed', err));
    }, 60 * 60 * 1000);
  }

  async onShutdown(): Promise<void> {
    if (rateLimitCleanupInterval) {
      clearInterval(rateLimitCleanupInterval);
    }
    stopRateLimitCleanup();
  }
}
