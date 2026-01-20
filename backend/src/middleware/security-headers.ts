/**
 * Phase Security Sprint 3: Enhanced Security Headers Configuration
 *
 * Provides comprehensive security headers configuration using Helmet.
 * Implements:
 * - Strict Content Security Policy (CSP) with nonce support
 * - HSTS (HTTP Strict Transport Security)
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import helmet from 'helmet';

/**
 * Generate a cryptographic nonce for inline scripts
 * Nonces are per-request unique values that allow specific inline scripts
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Middleware to generate CSP nonce and attach to request/response
 */
export function nonceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const nonce = generateNonce();

  // Attach nonce to response locals for templates
  res.locals.cspNonce = nonce;

  // Store nonce on request for use in CSP directive
  (req as Request & { cspNonce: string }).cspNonce = nonce;

  next();
}

// Extend Express types for nonce
declare global {
  namespace Express {
    interface Request {
      cspNonce?: string;
    }
  }
}

/**
 * Get enhanced Helmet configuration with strict security headers
 *
 * Features:
 * - Strict CSP with nonce-based script allowance
 * - HSTS with preload support
 * - Full security header suite
 */
export function getSecurityHeadersConfig(options: {
  isDevelopment?: boolean;
  enableSwagger?: boolean;
} = {}): ReturnType<typeof helmet> {
  const { isDevelopment = false, enableSwagger = true } = options;

  // Base CSP directives - strict by default
  const cspDirectives: helmet.ContentSecurityPolicyOptions['directives'] = {
    // Default: only allow same origin
    defaultSrc: ["'self'"],

    // Scripts: self + nonce for inline (Swagger needs unsafe-inline in dev)
    scriptSrc: isDevelopment && enableSwagger
      ? ["'self'", "'unsafe-inline'"] // Allow unsafe-inline for Swagger in dev
      : (req: Request, res: Response) => [
          "'self'",
          `'nonce-${res.locals.cspNonce || ''}'`,
        ],

    // Styles: self + unsafe-inline (many UI frameworks need this)
    // In strict mode, would use nonces for styles too
    styleSrc: ["'self'", "'unsafe-inline'"],

    // Images: self + data URIs + HTTPS sources (for external images)
    imgSrc: ["'self'", 'data:', 'https:'],

    // Fonts: self + data URIs + Google Fonts
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],

    // Connections: self + API endpoints
    connectSrc: ["'self'", 'https:', 'wss:'],

    // Object/embed/applet: none (prevent Flash, Java, etc.)
    objectSrc: ["'none'"],

    // Media: self + data URIs
    mediaSrc: ["'self'", 'data:', 'blob:'],

    // Frame ancestors: none (prevent clickjacking)
    frameAncestors: ["'none'"],

    // Form actions: self only
    formAction: ["'self'"],

    // Base URI: self only (prevent base tag hijacking)
    baseUri: ["'self'"],

    // Upgrade insecure requests in production
    upgradeInsecureRequests: isDevelopment ? null : [],

    // Block all mixed content
    blockAllMixedContent: [],

    // Report violations (configure endpoint if needed)
    // reportUri: '/api/csp-report',
  };

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: cspDirectives,
      reportOnly: false, // Enforce CSP (set true for testing)
    },

    // Cross-Origin-Embedder-Policy
    // Set to false for compatibility with Swagger UI
    crossOriginEmbedderPolicy: !enableSwagger,

    // Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: { policy: 'same-origin' },

    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: { policy: 'same-origin' },

    // DNS Prefetch Control - disable DNS prefetching
    dnsPrefetchControl: { allow: false },

    // Expect-CT - Certificate Transparency (deprecated but still useful)
    // Note: Modern browsers don't need this, but it doesn't hurt
    // expectCt is no longer supported in helmet v7+

    // Frameguard - X-Frame-Options
    frameguard: { action: 'deny' },

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // HSTS - HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true, // Apply to all subdomains
      preload: true, // Allow inclusion in browser preload lists
    },

    // IE No Open - prevent IE from executing downloads
    ieNoOpen: true,

    // No Sniff - X-Content-Type-Options: nosniff
    noSniff: true,

    // Origin Agent Cluster - enable origin isolation
    originAgentCluster: true,

    // Permitted Cross-Domain Policies
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // X-DNS-Prefetch-Control - already set via dnsPrefetchControl
    // X-Download-Options: noopen - already set via ieNoOpen
    // X-Permitted-Cross-Domain-Policies - already set above

    // XSS Filter - deprecated but some legacy browsers may use it
    xssFilter: true,
  });
}

/**
 * Permissions-Policy header middleware
 *
 * Controls browser features that can be used on the page.
 * Restricts potentially dangerous features like geolocation, camera, etc.
 */
export function permissionsPolicy(req: Request, res: Response, next: NextFunction): void {
  // Define permissions policy
  // Format: feature=(allowlist)
  // Empty () means completely disabled
  const policy = [
    // Disable potentially dangerous features
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=(self)',
    'battery=()',
    'camera=()',
    'cross-origin-isolated=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=(self)',
    'execution-while-not-rendered=()',
    'execution-while-out-of-viewport=()',
    'fullscreen=(self)',
    'geolocation=()',
    'gyroscope=()',
    'keyboard-map=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'navigation-override=()',
    'payment=()',
    'picture-in-picture=(self)',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'sync-xhr=(self)',
    'usb=()',
    'web-share=(self)',
    'xr-spatial-tracking=()',
  ];

  res.setHeader('Permissions-Policy', policy.join(', '));
  next();
}

/**
 * Additional security headers that aren't covered by Helmet
 */
export function additionalSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // X-Content-Security-Policy for older IE versions
  // Note: This is redundant with CSP but provides legacy support

  // Cache-Control for sensitive data
  // Prevent caching of potentially sensitive responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  // Clear-Site-Data header for logout endpoints
  if (req.path === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('Clear-Site-Data', '"cookies", "storage"');
  }

  next();
}

/**
 * Combined security middleware stack
 *
 * Applies all security headers in the correct order.
 * Use this instead of configuring each middleware separately.
 */
export function securityHeaders(options: {
  isDevelopment?: boolean;
  enableSwagger?: boolean;
} = {}): Array<(req: Request, res: Response, next: NextFunction) => void> {
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development';
  const enableSwagger = options.enableSwagger ?? true;

  return [
    nonceMiddleware,
    getSecurityHeadersConfig({ isDevelopment, enableSwagger }),
    permissionsPolicy,
    additionalSecurityHeaders,
  ];
}
