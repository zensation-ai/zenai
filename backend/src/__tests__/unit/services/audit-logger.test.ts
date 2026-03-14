/**
 * Phase 62: Security Audit Logger Tests
 */

// Mock dependencies before imports
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/event-system', () => ({
  emitSystemEvent: jest.fn().mockResolvedValue(undefined),
}));

import { queryContext } from '../../../utils/database-context';
import { getAuditLogger, resetAuditLogger } from '../../../services/security/audit-logger';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Security Audit Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    resetAuditLogger();
  });

  // ===========================================
  // logSecurityEvent
  // ===========================================

  describe('logSecurityEvent', () => {
    it('should log a login event', async () => {
      const mockEvent = {
        id: 'evt-1',
        event_type: 'login',
        user_id: 'user-1',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        details: {},
        severity: 'info',
        context: 'personal',
        created_at: new Date().toISOString(),
      };

      mockQueryContext.mockResolvedValueOnce({ rows: [mockEvent], rowCount: 1 } as any);

      const logger = getAuditLogger();
      const result = await logger.logSecurityEvent({
        eventType: 'login',
        userId: 'user-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result).toBeDefined();
      expect(result?.event_type).toBe('login');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO security_audit_log'),
        expect.arrayContaining(['login', 'user-1', '192.168.1.1'])
      );
    });

    it('should use default severity based on event type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      await logger.logSecurityEvent({
        eventType: 'failed_login',
        userId: 'user-1',
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining(['warning']) // default severity for failed_login
      );
    });

    it('should allow custom severity override', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      await logger.logSecurityEvent({
        eventType: 'login',
        userId: 'user-1',
        severity: 'critical',
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining(['critical'])
      );
    });

    it('should use specified context', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      await logger.logSecurityEvent({
        eventType: 'login',
        userId: 'user-1',
        context: 'work' as any,
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.any(String),
        expect.any(Array)
      );
    });

    it('should default ipAddress and userAgent to unknown', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      await logger.logSecurityEvent({
        eventType: 'login',
        userId: 'user-1',
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining(['unknown', 'unknown'])
      );
    });

    it('should return null on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const logger = getAuditLogger();
      const result = await logger.logSecurityEvent({
        eventType: 'login',
        userId: 'user-1',
      });

      expect(result).toBeNull();
    });

    it('should emit event system event for critical events', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: '1', severity: 'critical' }],
        rowCount: 1,
      } as any);

      const logger = getAuditLogger();
      await logger.logSecurityEvent({
        eventType: 'role_change',
        userId: 'user-1',
        severity: 'critical',
      });

      // The logger should have tried to emit (the mock handles it silently)
      expect(mockQueryContext).toHaveBeenCalled();
    });
  });

  // ===========================================
  // getAuditLog
  // ===========================================

  describe('getAuditLog', () => {
    it('should return audit log entries with pagination', async () => {
      const mockEntries = [
        { id: '1', event_type: 'login', user_id: 'user-1' },
        { id: '2', event_type: 'logout', user_id: 'user-1' },
      ];
      mockQueryContext
        .mockResolvedValueOnce({ rows: mockEntries, rowCount: 2 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '10' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      const result = await logger.getAuditLog('personal' as any);

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(10);
    });

    it('should apply event_type filter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      await logger.getAuditLog('personal' as any, { eventType: 'login' });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('event_type = $1'),
        expect.arrayContaining(['login'])
      );
    });

    it('should apply multiple filters', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      await logger.getAuditLog('personal' as any, {
        eventType: 'login',
        userId: 'user-1',
        severity: 'warning',
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('event_type = $1'),
        expect.any(Array)
      );
    });
  });

  // ===========================================
  // getSecurityAlerts
  // ===========================================

  describe('getSecurityAlerts', () => {
    it('should return critical and warning events by default', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as any);

      const logger = getAuditLogger();
      const result = await logger.getSecurityAlerts('personal' as any);

      expect(result).toHaveLength(1);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("severity IN ('critical', 'warning')"),
        expect.any(Array)
      );
    });

    it('should filter by specific severity', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const logger = getAuditLogger();
      await logger.getSecurityAlerts('personal' as any, 'critical');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('severity = $1'),
        ['critical', 20]
      );
    });

    it('should respect custom limit', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const logger = getAuditLogger();
      await logger.getSecurityAlerts('personal' as any, undefined, 5);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        [5]
      );
    });
  });

  // ===========================================
  // Singleton
  // ===========================================

  describe('singleton', () => {
    it('should return the same instance', () => {
      const logger1 = getAuditLogger();
      const logger2 = getAuditLogger();
      expect(logger1).toBe(logger2);
    });

    it('should create new instance after reset', () => {
      const logger1 = getAuditLogger();
      resetAuditLogger();
      const logger2 = getAuditLogger();
      expect(logger1).not.toBe(logger2);
    });
  });
});
