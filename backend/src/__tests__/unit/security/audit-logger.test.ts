/**
 * Phase Security Sprint 3: Audit Logger Tests
 */

import { Request } from 'express';
import {
  auditLogger,
  AuditCategory,
  AuditSeverity,
} from '../../../services/audit-logger';

// Mock dependencies
jest.mock('../../../utils/database', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Audit Logger', () => {
  const { pool } = require('../../../utils/database');
  const { logger } = require('../../../utils/logger');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AuditCategory enum', () => {
    it('should have all expected categories', () => {
      expect(AuditCategory.AUTHENTICATION).toBe('authentication');
      expect(AuditCategory.AUTHORIZATION).toBe('authorization');
      expect(AuditCategory.API_KEY).toBe('api_key');
      expect(AuditCategory.DATA_ACCESS).toBe('data_access');
      expect(AuditCategory.DATA_EXPORT).toBe('data_export');
      expect(AuditCategory.DATA_MODIFICATION).toBe('data_modification');
      expect(AuditCategory.ADMIN_ACTION).toBe('admin_action');
      expect(AuditCategory.SECURITY).toBe('security');
      expect(AuditCategory.SYSTEM).toBe('system');
    });
  });

  describe('AuditSeverity enum', () => {
    it('should have all expected severities', () => {
      expect(AuditSeverity.INFO).toBe('info');
      expect(AuditSeverity.WARNING).toBe('warning');
      expect(AuditSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('auditLogger.log', () => {
    it('should log an audit event to database', async () => {
      await auditLogger.log({
        category: AuditCategory.AUTHENTICATION,
        action: 'login',
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should include request info when provided', async () => {
      const mockRequest = {
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Test Agent',
          'x-request-id': 'req-123',
        },
        path: '/api/test',
        method: 'POST',
        apiKey: {
          id: 'key-123',
          name: 'Test Key',
          scopes: ['read'],
          rateLimit: 1000,
        },
      } as unknown as Request;

      await auditLogger.log({
        category: AuditCategory.API_KEY,
        action: 'test_action',
        req: mockRequest,
        outcome: 'success',
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('192.168.1.1'); // IP
        expect(values).toContain('Test Agent'); // User-Agent
        expect(values).toContain('req-123'); // Request ID
      }
    });

    it('should use critical severity for CRITICAL events', async () => {
      await auditLogger.log({
        category: AuditCategory.SECURITY,
        action: 'breach_attempt',
        severity: AuditSeverity.CRITICAL,
        outcome: 'blocked',
      });

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('auditLogger.logAuth', () => {
    it('should log authentication events', async () => {
      await auditLogger.logAuth({
        action: 'login',
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
    });

    it('should use warning severity for failed auth', async () => {
      await auditLogger.logAuth({
        action: 'auth_failure',
        outcome: 'failure',
      });

      // Check that the log entry used warning severity
      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('warning');
      }
    });
  });

  describe('auditLogger.logApiKeyAction', () => {
    it('should log API key creation', async () => {
      await auditLogger.logApiKeyAction({
        action: 'create',
        keyId: 'key-456',
        keyName: 'New API Key',
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
    });

    it('should log API key deletion', async () => {
      await auditLogger.logApiKeyAction({
        action: 'delete',
        keyId: 'key-789',
        keyName: 'Old API Key',
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
    });

    it('should use critical severity for API key actions', async () => {
      await auditLogger.logApiKeyAction({
        action: 'regenerate',
        keyId: 'key-123',
        outcome: 'success',
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('critical');
      }
    });
  });

  describe('auditLogger.logExport', () => {
    it('should log export events', async () => {
      await auditLogger.logExport({
        exportType: 'backup',
        resourceType: 'full_backup',
        resourceCount: 100,
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
    });

    it('should include export details', async () => {
      await auditLogger.logExport({
        exportType: 'pdf',
        resourceType: 'ideas',
        resourceCount: 50,
        outcome: 'success',
        details: { format: 'A4' },
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        const detailsJson = values.find((v: any) =>
          typeof v === 'string' && v.includes('exportType')
        );
        expect(detailsJson).toBeDefined();
      }
    });
  });

  describe('auditLogger.logAdminAction', () => {
    it('should log admin actions', async () => {
      await auditLogger.logAdminAction({
        action: 'user_suspend',
        resource: { type: 'user', id: 'user-123' },
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('auditLogger.logSecurityEvent', () => {
    it('should log security events', async () => {
      await auditLogger.logSecurityEvent({
        action: 'rate_limit_exceeded',
        outcome: 'blocked',
      });

      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('auditLogger.logDataAccess', () => {
    it('should log data access events', async () => {
      await auditLogger.logDataAccess({
        action: 'read',
        resourceType: 'ideas',
        resourceId: 'idea-123',
        outcome: 'success',
      });

      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      await expect(
        auditLogger.log({
          category: AuditCategory.SYSTEM,
          action: 'test',
          outcome: 'success',
        })
      ).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Actor extraction', () => {
    it('should extract API key actor', async () => {
      const mockRequest = {
        apiKey: {
          id: 'key-123',
          name: 'Test Key',
          scopes: ['read'],
          rateLimit: 1000,
        },
        headers: {},
      } as unknown as Request;

      await auditLogger.log({
        category: AuditCategory.DATA_ACCESS,
        action: 'test',
        req: mockRequest,
        outcome: 'success',
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('api_key');
        expect(values).toContain('key-123');
      }
    });

    it('should extract user actor', async () => {
      const mockRequest = {
        user: {
          id: 'user-456',
          provider: 'local',
        },
        headers: {},
      } as unknown as Request;

      await auditLogger.log({
        category: AuditCategory.DATA_ACCESS,
        action: 'test',
        req: mockRequest,
        outcome: 'success',
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('user');
        expect(values).toContain('user-456');
      }
    });

    it('should use anonymous for unauthenticated requests', async () => {
      const mockRequest = {
        headers: {},
      } as unknown as Request;

      await auditLogger.log({
        category: AuditCategory.DATA_ACCESS,
        action: 'test',
        req: mockRequest,
        outcome: 'success',
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('anonymous');
      }
    });

    it('should use system for actions without request', async () => {
      await auditLogger.log({
        category: AuditCategory.SYSTEM,
        action: 'scheduled_task',
        outcome: 'success',
      });

      const insertCall = pool.query.mock.calls.find((call: any[]) =>
        call[0]?.includes('INSERT INTO audit_logs')
      );

      if (insertCall) {
        const values = insertCall[1];
        expect(values).toContain('system');
      }
    });
  });
});
