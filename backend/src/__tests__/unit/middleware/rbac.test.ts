/**
 * Phase 62: RBAC Middleware Tests
 */

import { Request, Response, NextFunction } from 'express';

// Mock logger before imports
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { requireRole, ROLES, hasPermission, getEffectiveRole } from '../../../middleware/rbac';

describe('RBAC Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockReq = {
      path: '/api/test',
      method: 'GET',
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = jest.fn();
  });

  // ===========================================
  // ROLES constant
  // ===========================================

  describe('ROLES', () => {
    it('should define admin, editor, viewer roles', () => {
      expect(ROLES.ADMIN).toBe('admin');
      expect(ROLES.EDITOR).toBe('editor');
      expect(ROLES.VIEWER).toBe('viewer');
    });
  });

  // ===========================================
  // hasPermission
  // ===========================================

  describe('hasPermission', () => {
    it('should grant all permissions to admin', () => {
      expect(hasPermission('admin', 'read')).toBe(true);
      expect(hasPermission('admin', 'write')).toBe(true);
      expect(hasPermission('admin', 'delete')).toBe(true);
      expect(hasPermission('admin', 'manage_users')).toBe(true);
      expect(hasPermission('admin', 'manage_system')).toBe(true);
      expect(hasPermission('admin', 'view_audit_log')).toBe(true);
      expect(hasPermission('admin', 'manage_rate_limits')).toBe(true);
    });

    it('should grant read/write/delete to editor', () => {
      expect(hasPermission('editor', 'read')).toBe(true);
      expect(hasPermission('editor', 'write')).toBe(true);
      expect(hasPermission('editor', 'delete')).toBe(true);
    });

    it('should deny management permissions to editor', () => {
      expect(hasPermission('editor', 'manage_users')).toBe(false);
      expect(hasPermission('editor', 'manage_system')).toBe(false);
      expect(hasPermission('editor', 'view_audit_log')).toBe(false);
    });

    it('should grant only read to viewer', () => {
      expect(hasPermission('viewer', 'read')).toBe(true);
      expect(hasPermission('viewer', 'write')).toBe(false);
      expect(hasPermission('viewer', 'delete')).toBe(false);
      expect(hasPermission('viewer', 'manage_users')).toBe(false);
    });

    it('should return false for unknown roles', () => {
      expect(hasPermission('superadmin', 'read')).toBe(false);
      expect(hasPermission('', 'read')).toBe(false);
    });
  });

  // ===========================================
  // getEffectiveRole
  // ===========================================

  describe('getEffectiveRole', () => {
    it('should return JWT user role when present', () => {
      mockReq.jwtUser = { id: 'user1', email: 'test@test.com', role: 'admin' };
      expect(getEffectiveRole(mockReq as Request)).toBe('admin');
    });

    it('should return admin for API key with admin scope', () => {
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
      expect(getEffectiveRole(mockReq as Request)).toBe('admin');
    });

    it('should return editor for API key with write scope', () => {
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['read', 'write'], rateLimit: 1000 };
      expect(getEffectiveRole(mockReq as Request)).toBe('editor');
    });

    it('should return viewer for API key with read-only scope', () => {
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['read'], rateLimit: 1000 };
      expect(getEffectiveRole(mockReq as Request)).toBe('viewer');
    });

    it('should return viewer when no auth is present', () => {
      expect(getEffectiveRole(mockReq as Request)).toBe('viewer');
    });

    it('should prioritize JWT role over API key scope', () => {
      mockReq.jwtUser = { id: 'user1', email: 'test@test.com', role: 'viewer' };
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['admin'], rateLimit: 1000 };
      expect(getEffectiveRole(mockReq as Request)).toBe('viewer');
    });
  });

  // ===========================================
  // requireRole middleware
  // ===========================================

  describe('requireRole', () => {
    it('should call next() when user has required role', () => {
      mockReq.jwtUser = { id: 'user1', email: 'test@test.com', role: 'admin' };
      const middleware = requireRole('admin');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next() when user has one of multiple required roles', () => {
      mockReq.jwtUser = { id: 'user1', email: 'test@test.com', role: 'editor' };
      const middleware = requireRole('admin', 'editor');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when user lacks required role', () => {
      mockReq.jwtUser = { id: 'user1', email: 'test@test.com', role: 'viewer' };
      const middleware = requireRole('admin');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'FORBIDDEN',
        })
      );
    });

    it('should return 403 for unauthenticated users requiring admin', () => {
      const middleware = requireRole('admin');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should allow admin API key to access admin-only routes', () => {
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
      const middleware = requireRole('admin');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny viewer API key from admin-only routes', () => {
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['read'], rateLimit: 1000 };
      const middleware = requireRole('admin');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should include role info in 403 error message', () => {
      mockReq.jwtUser = { id: 'user1', email: 'test@test.com', role: 'viewer' };
      const middleware = requireRole('admin', 'editor');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('admin or editor'),
        })
      );
    });

    it('should handle editor role accessing editor-allowed routes', () => {
      mockReq.apiKey = { id: 'key1', name: 'test', scopes: ['read', 'write'], rateLimit: 1000 };
      const middleware = requireRole('admin', 'editor');
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
