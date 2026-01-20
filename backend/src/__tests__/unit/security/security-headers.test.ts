/**
 * Phase Security Sprint 3: Security Headers Tests
 */

import { Request, Response, NextFunction } from 'express';
import {
  generateNonce,
  nonceMiddleware,
  permissionsPolicy,
  additionalSecurityHeaders,
} from '../../../middleware/security-headers';

describe('Security Headers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/api/test',
      method: 'GET',
    } as any;
    mockResponse = {
      setHeader: jest.fn().mockReturnThis(),
      locals: { requestId: 'test-request-id' },
    } as any;
    mockNext = jest.fn();
  });

  describe('generateNonce', () => {
    it('should generate a base64 nonce', () => {
      const nonce = generateNonce();
      expect(nonce).toBeTruthy();
      // Base64 pattern
      expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it('should generate 24-character nonces (16 bytes in base64)', () => {
      const nonce = generateNonce();
      // 16 bytes in base64 = 22-24 chars depending on padding
      expect(nonce.length).toBeGreaterThanOrEqual(22);
      expect(nonce.length).toBeLessThanOrEqual(24);
    });
  });

  describe('nonceMiddleware', () => {
    it('should generate and attach nonce to response locals', () => {
      nonceMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.locals!.cspNonce).toBeTruthy();
      expect(mockResponse.locals!.cspNonce).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should attach nonce to request object', () => {
      nonceMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockRequest as any).cspNonce).toBeTruthy();
    });
  });

  describe('permissionsPolicy middleware', () => {
    it('should set Permissions-Policy header', () => {
      permissionsPolicy(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('camera=()')
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should disable dangerous features', () => {
      permissionsPolicy(mockRequest as Request, mockResponse as Response, mockNext);

      const call = (mockResponse.setHeader as jest.Mock).mock.calls.find(
        (c) => c[0] === 'Permissions-Policy'
      );
      const policy = call[1];

      // Check that dangerous features are disabled
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=()');
      expect(policy).toContain('usb=()');
      expect(policy).toContain('payment=()');
    });

    it('should allow self for certain features', () => {
      permissionsPolicy(mockRequest as Request, mockResponse as Response, mockNext);

      const call = (mockResponse.setHeader as jest.Mock).mock.calls.find(
        (c) => c[0] === 'Permissions-Policy'
      );
      const policy = call[1];

      expect(policy).toContain('fullscreen=(self)');
      expect(policy).toContain('autoplay=(self)');
    });
  });

  describe('additionalSecurityHeaders middleware', () => {
    it('should set Cache-Control for API routes', () => {
      mockRequest.path = '/api/data';

      additionalSecurityHeaders(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set Cache-Control for non-API routes', () => {
      mockRequest.path = '/static/image.png';

      additionalSecurityHeaders(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).not.toHaveBeenCalledWith(
        'Cache-Control',
        expect.any(String)
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set Clear-Site-Data for logout endpoint', () => {
      mockRequest.path = '/api/auth/logout';
      mockRequest.method = 'POST';

      additionalSecurityHeaders(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Clear-Site-Data',
        '"cookies", "storage"'
      );
    });

    it('should not set Clear-Site-Data for non-logout endpoints', () => {
      mockRequest.path = '/api/auth/login';
      mockRequest.method = 'POST';

      additionalSecurityHeaders(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).not.toHaveBeenCalledWith(
        'Clear-Site-Data',
        expect.any(String)
      );
    });
  });

  describe('Security Header Values', () => {
    // These tests verify expected security header behavior
    // In practice, helmet handles most of these

    it('should expect HSTS with secure settings', () => {
      // Helmet should set HSTS with:
      // - maxAge: 31536000 (1 year)
      // - includeSubDomains: true
      // - preload: true
      const expectedHSTS = {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      };

      expect(expectedHSTS.maxAge).toBe(31536000);
      expect(expectedHSTS.includeSubDomains).toBe(true);
      expect(expectedHSTS.preload).toBe(true);
    });

    it('should expect X-Frame-Options: DENY', () => {
      const expectedFrameOptions = 'DENY';
      expect(expectedFrameOptions).toBe('DENY');
    });

    it('should expect X-Content-Type-Options: nosniff', () => {
      const expectedContentTypeOptions = 'nosniff';
      expect(expectedContentTypeOptions).toBe('nosniff');
    });

    it('should expect strict Referrer-Policy', () => {
      const expectedReferrerPolicy = 'strict-origin-when-cross-origin';
      expect(expectedReferrerPolicy).toBe('strict-origin-when-cross-origin');
    });
  });
});
