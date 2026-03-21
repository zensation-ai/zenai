/**
 * Integration Tests for Governance API
 *
 * Tests the approval workflow, audit trail, and policy management routes:
 * - GET    /:context/governance/pending    - Pending approval actions
 * - GET    /:context/governance/history    - Action history
 * - GET    /:context/governance/actions/:id - Get single action
 * - POST   /:context/governance/request    - Request approval
 * - POST   /:context/governance/:id/approve - Approve action
 * - POST   /:context/governance/:id/reject  - Reject action
 * - GET    /:context/governance/audit       - Audit log
 * - GET    /:context/governance/policies    - List policies
 * - POST   /:context/governance/policies    - Create policy
 * - DELETE /:context/governance/policies/:id - Delete policy
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockGetPendingActions = jest.fn();
const mockGetActionHistory = jest.fn();
const mockGetActionById = jest.fn();
const mockRequestApproval = jest.fn();
const mockApproveAction = jest.fn();
const mockRejectAction = jest.fn();
const mockGetAuditLog = jest.fn();
const mockListPolicies = jest.fn();
const mockCreatePolicy = jest.fn();
const mockUpdatePolicy = jest.fn();
const mockDeletePolicy = jest.fn();
const mockExpireStaleActions = jest.fn();
const mockLogAudit = jest.fn();

jest.mock('../../services/governance', () => ({
  getPendingActions: (...args: unknown[]) => mockGetPendingActions(...args),
  getActionHistory: (...args: unknown[]) => mockGetActionHistory(...args),
  getActionById: (...args: unknown[]) => mockGetActionById(...args),
  requestApproval: (...args: unknown[]) => mockRequestApproval(...args),
  approveAction: (...args: unknown[]) => mockApproveAction(...args),
  rejectAction: (...args: unknown[]) => mockRejectAction(...args),
  getAuditLog: (...args: unknown[]) => mockGetAuditLog(...args),
  listPolicies: (...args: unknown[]) => mockListPolicies(...args),
  createPolicy: (...args: unknown[]) => mockCreatePolicy(...args),
  updatePolicy: (...args: unknown[]) => mockUpdatePolicy(...args),
  deletePolicy: (...args: unknown[]) => mockDeletePolicy(...args),
  expireStaleActions: (...args: unknown[]) => mockExpireStaleActions(...args),
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  ActionType: {},
  GovernanceStatus: {},
}));

import { governanceRouter } from '../../routes/governance';
import { errorHandler } from '../../middleware/errorHandler';

describe('Governance API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', governanceRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // GET /:context/governance/pending
  // ============================================================

  describe('GET /:context/governance/pending', () => {
    it('should return pending actions', async () => {
      const actions = [
        { id: VALID_UUID, action_type: 'memory_delete', status: 'pending', description: 'Delete fact' },
      ];
      mockGetPendingActions.mockResolvedValueOnce(actions);

      const response = await request(app)
        .get('/api/personal/governance/pending')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.count).toBe(1);
    });

    it('should return empty array when no pending actions', async () => {
      mockGetPendingActions.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/personal/governance/pending')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/governance/pending')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/governance/history
  // ============================================================

  describe('GET /:context/governance/history', () => {
    it('should return action history', async () => {
      const actions = [
        { id: VALID_UUID, action_type: 'agent_execute', status: 'approved' },
      ];
      mockGetActionHistory.mockResolvedValueOnce(actions);

      const response = await request(app)
        .get('/api/work/governance/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should pass filter parameters', async () => {
      mockGetActionHistory.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/governance/history?status=approved')
        .expect(200);

      expect(mockGetActionHistory).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ status: 'approved' }),
      );
    });
  });

  // ============================================================
  // POST /:context/governance/request
  // ============================================================

  describe('POST /:context/governance/request', () => {
    it('should create an approval request', async () => {
      const action = {
        id: VALID_UUID,
        action_type: 'memory_delete',
        status: 'pending',
        description: 'Delete a memory fact',
      };
      mockRequestApproval.mockResolvedValueOnce(action);

      const response = await request(app)
        .post('/api/personal/governance/request')
        .send({
          action_type: 'memory_delete',
          action_source: 'agent',
          description: 'Delete a memory fact',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', VALID_UUID);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/personal/governance/request')
        .send({ action_type: 'memory_delete' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .post('/api/invalid/governance/request')
        .send({
          action_type: 'memory_delete',
          action_source: 'agent',
          description: 'test',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/governance/:id/approve
  // ============================================================

  describe('POST /:context/governance/:id/approve', () => {
    it('should approve a pending action', async () => {
      const action = { id: VALID_UUID, status: 'approved' };
      mockApproveAction.mockResolvedValueOnce(action);

      const response = await request(app)
        .post(`/api/personal/governance/${VALID_UUID}/approve`)
        .send({ approved_by: 'admin' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('approved');
    });
  });

  // ============================================================
  // POST /:context/governance/:id/reject
  // ============================================================

  describe('POST /:context/governance/:id/reject', () => {
    it('should reject an action with reason', async () => {
      const action = { id: VALID_UUID, status: 'rejected' };
      mockRejectAction.mockResolvedValueOnce(action);

      const response = await request(app)
        .post(`/api/personal/governance/${VALID_UUID}/reject`)
        .send({ reason: 'Not appropriate', rejected_by: 'admin' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('rejected');
    });

    it('should reject without reason', async () => {
      const response = await request(app)
        .post(`/api/personal/governance/${VALID_UUID}/reject`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/governance/audit
  // ============================================================

  describe('GET /:context/governance/audit', () => {
    it('should return audit log entries', async () => {
      const entries = [
        { id: VALID_UUID, event_type: 'policy.created', actor: 'user' },
      ];
      mockGetAuditLog.mockResolvedValueOnce(entries);

      const response = await request(app)
        .get('/api/personal/governance/audit')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  // ============================================================
  // Policy CRUD
  // ============================================================

  describe('GET /:context/governance/policies', () => {
    it('should list governance policies', async () => {
      const policies = [{ id: VALID_UUID, name: 'Auto-approve low risk', is_active: true }];
      mockListPolicies.mockResolvedValueOnce(policies);

      const response = await request(app)
        .get('/api/personal/governance/policies')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('POST /:context/governance/policies', () => {
    it('should create a new policy', async () => {
      const policy = { id: VALID_UUID, name: 'Test Policy', action_type: 'memory_delete' };
      mockCreatePolicy.mockResolvedValueOnce(policy);
      mockLogAudit.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/personal/governance/policies')
        .send({
          name: 'Test Policy',
          action_type: 'memory_delete',
          description: 'Auto-approve memory deletes',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name', 'Test Policy');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/personal/governance/policies')
        .send({ description: 'No name or action_type' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /:context/governance/policies/:id', () => {
    it('should delete a policy', async () => {
      mockDeletePolicy.mockResolvedValueOnce(true);

      const response = await request(app)
        .delete(`/api/personal/governance/policies/${VALID_UUID}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent policy', async () => {
      mockDeletePolicy.mockResolvedValueOnce(false);

      const response = await request(app)
        .delete(`/api/personal/governance/policies/${VALID_UUID}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
