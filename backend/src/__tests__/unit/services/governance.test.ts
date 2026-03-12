/**
 * Governance & Audit Trail Service + Route Tests
 *
 * Tests for approval workflows, policy evaluation, audit logging,
 * and governance REST API routes.
 */

import express from 'express';
import request from 'supertest';
import { queryContext } from '../../../utils/database-context';
import {
  requestApproval,
  approveAction,
  rejectAction,
  getPendingActions,
  getActionHistory,
  getActionById,
  getAuditLog,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listPolicies,
  expireStaleActions,
} from '../../../services/governance';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const mockAction = {
  id: 'act-001',
  context: 'personal' as const,
  action_type: 'send_email' as const,
  action_source: 'agent' as const,
  source_id: 'agent-researcher',
  description: 'Send project update email to team',
  payload: { to: 'team@example.com', subject: 'Update' },
  risk_level: 'medium' as const,
  status: 'pending' as const,
  requires_approval: true,
  approved_by: null,
  approved_at: null,
  rejection_reason: null,
  executed_at: null,
  execution_result: null,
  expires_at: '2026-03-13T12:00:00Z',
  created_at: '2026-03-12T12:00:00Z',
  updated_at: '2026-03-12T12:00:00Z',
};

const mockApprovedAction = {
  ...mockAction,
  status: 'approved' as const,
  approved_by: 'user',
  approved_at: '2026-03-12T13:00:00Z',
};

const mockPolicy = {
  id: 'pol-001',
  context: 'personal' as const,
  name: 'Auto-approve low-risk tasks',
  description: 'Automatically approve task creation with low risk',
  action_type: 'create_task',
  conditions: [{ field: 'risk_level', operator: 'equals' as const, value: 'low' }],
  risk_level: 'low' as const,
  auto_approve: true,
  notify_on_auto_approve: true,
  is_active: true,
  created_at: '2026-03-10T10:00:00Z',
  updated_at: '2026-03-10T10:00:00Z',
};

const mockAuditEntry = {
  id: 'aud-001',
  context: 'personal' as const,
  event_type: 'action.requested',
  actor: 'agent',
  target_type: 'send_email',
  target_id: 'act-001',
  description: 'Send project update email to team',
  metadata: { risk_level: 'medium', requires_approval: true },
  created_at: '2026-03-12T12:00:00Z',
};

// ===========================================
// Service Unit Tests
// ===========================================

describe('Governance Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // -------------------------------------------
  // getPendingActions
  // -------------------------------------------

  describe('getPendingActions', () => {
    it('should return pending actions ordered by risk', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAction],
      } as never);

      const result = await getPendingActions('personal');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'pending'"),
        expect.arrayContaining([50, 0])
      );
    });

    it('should filter by action_type when provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await getPendingActions('work', { action_type: 'send_email' });
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('action_type'),
        expect.arrayContaining(['send_email'])
      );
    });

    it('should apply limit and offset', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await getPendingActions('personal', { limit: 10, offset: 5 });
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining([10, 5])
      );
    });
  });

  // -------------------------------------------
  // getActionHistory
  // -------------------------------------------

  describe('getActionHistory', () => {
    it('should return all actions without filters', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAction, mockApprovedAction],
      } as never);

      const result = await getActionHistory('personal');
      expect(result).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockApprovedAction],
      } as never);

      await getActionHistory('work', { status: 'approved' });
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('status'),
        expect.arrayContaining(['approved'])
      );
    });

    it('should filter by action_type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await getActionHistory('personal', { action_type: 'agent_action' });
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('action_type'),
        expect.arrayContaining(['agent_action'])
      );
    });
  });

  // -------------------------------------------
  // getActionById
  // -------------------------------------------

  describe('getActionById', () => {
    it('should return action when found', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAction],
      } as never);

      const result = await getActionById('personal', 'act-001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('act-001');
    });

    it('should return null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await getActionById('personal', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------
  // requestApproval
  // -------------------------------------------

  describe('requestApproval', () => {
    it('should create pending action when policy requires approval', async () => {
      // evaluatePolicy query (no matching policies)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      // INSERT governance_actions
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAction, status: 'pending', requires_approval: true }],
      } as never);
      // logAudit (action.requested)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await requestApproval('personal', {
        action_type: 'send_email',
        action_source: 'agent',
        description: 'Send email',
        risk_level: 'high',
      });

      expect(result.status).toBe('pending');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO governance_actions'),
        expect.any(Array)
      );
    });

    it('should auto-approve when matching policy allows it', async () => {
      // evaluatePolicy: matching auto-approve policy
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockPolicy, auto_approve: true, conditions: [] }],
      } as never);
      // INSERT governance_actions
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAction, status: 'auto_approved', requires_approval: false }],
      } as never);
      // logAudit (action.requested)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      // logAudit (action.auto_approved)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await requestApproval('personal', {
        action_type: 'create_task',
        action_source: 'automation',
        description: 'Create follow-up task',
      });

      expect(result.status).toBe('auto_approved');
    });

    it('should default to low risk when not specified', async () => {
      // evaluatePolicy (no matching policies, risk defaults to 'low' => no approval required => auto_approved)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAction, risk_level: 'low', status: 'auto_approved', requires_approval: false }],
      } as never);
      // logAudit (action.requested)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      // logAudit (action.auto_approved)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await requestApproval('personal', {
        action_type: 'create_task',
        action_source: 'user',
        description: 'Create task',
      });

      // evaluatePolicy + INSERT + 2x logAudit (requested + auto_approved)
      expect(mockQueryContext).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------
  // approveAction
  // -------------------------------------------

  describe('approveAction', () => {
    it('should approve a pending action', async () => {
      // UPDATE
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockApprovedAction],
      } as never);
      // logAudit
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await approveAction('personal', 'act-001', 'admin-user');
      expect(result.status).toBe('approved');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'approved'"),
        ['admin-user', 'act-001']
      );
    });

    it('should throw when action not found or not pending', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await expect(
        approveAction('personal', 'nonexistent', 'user')
      ).rejects.toThrow('not found or not pending');
    });
  });

  // -------------------------------------------
  // rejectAction
  // -------------------------------------------

  describe('rejectAction', () => {
    it('should reject a pending action with reason', async () => {
      const rejected = {
        ...mockAction,
        status: 'rejected' as const,
        rejection_reason: 'Too risky',
        approved_by: 'admin',
      };
      // UPDATE
      mockQueryContext.mockResolvedValueOnce({ rows: [rejected] } as never);
      // logAudit
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await rejectAction('personal', 'act-001', 'admin', 'Too risky');
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toBe('Too risky');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'rejected'"),
        ['admin', 'Too risky', 'act-001']
      );
    });

    it('should throw when action not found or not pending', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await expect(
        rejectAction('personal', 'nonexistent', 'user', 'reason')
      ).rejects.toThrow('not found or not pending');
    });
  });

  // -------------------------------------------
  // Audit Log
  // -------------------------------------------

  describe('getAuditLog', () => {
    it('should return audit entries with default filters', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAuditEntry],
      } as never);

      const result = await getAuditLog('personal');
      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('action.requested');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('audit_log'),
        expect.arrayContaining([30, 50, 0])
      );
    });

    it('should filter by event_type and actor', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await getAuditLog('work', { event_type: 'action.approved', actor: 'admin' });
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('event_type'),
        expect.arrayContaining(['action.approved', 'admin'])
      );
    });

    it('should filter by target_id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await getAuditLog('personal', { target_id: 'act-001' });
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('target_id'),
        expect.arrayContaining(['act-001'])
      );
    });
  });

  // -------------------------------------------
  // Policy CRUD
  // -------------------------------------------

  describe('listPolicies', () => {
    it('should list all policies', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockPolicy],
      } as never);

      const result = await listPolicies('personal');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Auto-approve low-risk tasks');
    });

    it('should filter active only', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await listPolicies('personal', true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('is_active = true')
      );
    });
  });

  describe('createPolicy', () => {
    it('should create a policy', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockPolicy],
      } as never);

      const result = await createPolicy('personal', {
        name: 'Auto-approve low-risk tasks',
        description: 'Auto-approve task creation',
        action_type: 'create_task',
        conditions: [],
        risk_level: 'low',
        auto_approve: true,
        notify_on_auto_approve: true,
        is_active: true,
      });

      expect(result.name).toBe('Auto-approve low-risk tasks');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO governance_policies'),
        expect.any(Array)
      );
    });
  });

  describe('updatePolicy', () => {
    it('should update policy fields', async () => {
      const updated = { ...mockPolicy, auto_approve: false };
      mockQueryContext.mockResolvedValueOnce({ rows: [updated] } as never);

      const result = await updatePolicy('personal', 'pol-001', { auto_approve: false });
      expect(result.auto_approve).toBe(false);
    });

    it('should throw when no fields to update', async () => {
      await expect(
        updatePolicy('personal', 'pol-001', {})
      ).rejects.toThrow('No fields to update');
    });

    it('should throw when policy not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await expect(
        updatePolicy('personal', 'nonexistent', { name: 'New name' })
      ).rejects.toThrow('not found');
    });
  });

  describe('deletePolicy', () => {
    it('should delete a policy', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await deletePolicy('personal', 'pol-001');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('DELETE FROM governance_policies'),
        ['pol-001']
      );
    });
  });

  // -------------------------------------------
  // Maintenance
  // -------------------------------------------

  describe('expireStaleActions', () => {
    it('should expire stale pending actions', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'act-001' }, { id: 'act-002' }],
      } as never);

      const count = await expireStaleActions('personal');
      expect(count).toBe(2);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'expired'")
      );
    });

    it('should return 0 when no stale actions', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const count = await expireStaleActions('work');
      expect(count).toBe(0);
    });
  });
});

// ===========================================
// Route Integration Tests
// ===========================================

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => next(),
  requireScope: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: any, _res: any, next: any) => next(),
}));

import { governanceRouter } from '../../../routes/governance';
import { errorHandler } from '../../../middleware/errorHandler';

describe('Governance Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', governanceRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // -------------------------------------------
  // GET /:context/governance/pending
  // -------------------------------------------

  describe('GET /:context/governance/pending', () => {
    it('should return pending actions', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAction],
      } as never);

      const res = await request(app).get('/api/personal/governance/pending');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/governance/pending');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should pass query params as filters', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await request(app)
        .get('/api/work/governance/pending?action_type=send_email&limit=10&offset=5');

      expect(mockQueryContext).toHaveBeenCalled();
    });
  });

  // -------------------------------------------
  // GET /:context/governance/history
  // -------------------------------------------

  describe('GET /:context/governance/history', () => {
    it('should return action history', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAction, mockApprovedAction],
      } as never);

      const res = await request(app).get('/api/personal/governance/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should support status and action_type filters', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .get('/api/learning/governance/history?status=approved&action_type=create_task');

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------
  // GET /:context/governance/actions/:id
  // -------------------------------------------

  describe('GET /:context/governance/actions/:id', () => {
    it('should return a single action', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAction],
      } as never);

      const res = await request(app).get('/api/personal/governance/actions/act-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('act-001');
    });

    it('should return 404 when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app).get('/api/personal/governance/actions/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------
  // POST /:context/governance/request
  // -------------------------------------------

  describe('POST /:context/governance/request', () => {
    it('should create an approval request and return 201', async () => {
      // evaluatePolicy
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAction] } as never);
      // logAudit
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .post('/api/personal/governance/request')
        .send({
          action_type: 'send_email',
          action_source: 'agent',
          description: 'Send project update email to team',
          risk_level: 'high',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/personal/governance/request')
        .send({ action_type: 'send_email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/governance/request')
        .send({
          action_type: 'send_email',
          action_source: 'agent',
          description: 'Test',
        });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------
  // POST /:context/governance/:id/approve
  // -------------------------------------------

  describe('POST /:context/governance/:id/approve', () => {
    it('should approve a pending action', async () => {
      // approveAction UPDATE
      mockQueryContext.mockResolvedValueOnce({ rows: [mockApprovedAction] } as never);
      // logAudit
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .post('/api/personal/governance/act-001/approve')
        .send({ approved_by: 'admin-user' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');
    });

    it('should default approved_by to user', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockApprovedAction] } as never);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .post('/api/personal/governance/act-001/approve')
        .send({});

      expect(res.status).toBe(200);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        ['user', 'act-001']
      );
    });
  });

  // -------------------------------------------
  // POST /:context/governance/:id/reject
  // -------------------------------------------

  describe('POST /:context/governance/:id/reject', () => {
    it('should reject an action with reason', async () => {
      const rejected = { ...mockAction, status: 'rejected', rejection_reason: 'Not allowed' };
      mockQueryContext.mockResolvedValueOnce({ rows: [rejected] } as never);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .post('/api/personal/governance/act-001/reject')
        .send({ rejected_by: 'admin', reason: 'Not allowed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('rejected');
    });

    it('should return 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/personal/governance/act-001/reject')
        .send({ rejected_by: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------
  // GET /:context/governance/audit
  // -------------------------------------------

  describe('GET /:context/governance/audit', () => {
    it('should return audit log entries', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockAuditEntry],
      } as never);

      const res = await request(app).get('/api/personal/governance/audit');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });

    it('should pass filter query params', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .get('/api/creative/governance/audit?event_type=action.approved&actor=admin&days=7');

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------
  // Policy CRUD Routes
  // -------------------------------------------

  describe('GET /:context/governance/policies', () => {
    it('should list policies', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockPolicy],
      } as never);

      const res = await request(app).get('/api/personal/governance/policies');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should filter active only', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .get('/api/personal/governance/policies?active_only=true');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /:context/governance/policies', () => {
    it('should create a policy and return 201', async () => {
      // createPolicy INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [mockPolicy] } as never);
      // logAudit
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .post('/api/personal/governance/policies')
        .send({
          name: 'Auto-approve low-risk tasks',
          action_type: 'create_task',
          risk_level: 'low',
          auto_approve: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Auto-approve low-risk tasks');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/personal/governance/policies')
        .send({ action_type: 'create_task' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when action_type is missing', async () => {
      const res = await request(app)
        .post('/api/personal/governance/policies')
        .send({ name: 'Test policy' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:context/governance/policies/:id', () => {
    it('should update a policy', async () => {
      const updated = { ...mockPolicy, name: 'Updated policy' };
      mockQueryContext.mockResolvedValueOnce({ rows: [updated] } as never);

      const res = await request(app)
        .put('/api/personal/governance/policies/pol-001')
        .send({ name: 'Updated policy' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated policy');
    });
  });

  describe('DELETE /:context/governance/policies/:id', () => {
    it('should delete a policy', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .delete('/api/personal/governance/policies/pol-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Policy deleted');
    });
  });

  // -------------------------------------------
  // POST /:context/governance/expire
  // -------------------------------------------

  describe('POST /:context/governance/expire', () => {
    it('should expire stale actions', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'act-old-1' }, { id: 'act-old-2' }],
      } as never);

      const res = await request(app)
        .post('/api/personal/governance/expire');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.expired).toBe(2);
    });

    it('should return 0 when nothing to expire', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const res = await request(app)
        .post('/api/work/governance/expire');

      expect(res.status).toBe(200);
      expect(res.body.expired).toBe(0);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/governance/expire');

      expect(res.status).toBe(400);
    });
  });
});
