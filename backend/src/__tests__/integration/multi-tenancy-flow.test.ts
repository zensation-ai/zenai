jest.mock('../../utils/database-context', () => ({
  queryPublic: jest.fn(),
  queryContext: jest.fn(),
}));
jest.mock('../../services/auth/jwt-service', () => ({
  ...jest.requireActual('../../services/auth/jwt-service'),
  generateWorkspaceToken: jest.fn().mockResolvedValue('mock-ws-token'),
}));

import express from 'express';
import request from 'supertest';
import { queryPublic } from '../../utils/database-context';
import { organizationRouter } from '../../routes/organizations';
import { workspaceRouter } from '../../routes/workspaces';
import { errorHandler } from '../../middleware/errorHandler';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('Multi-Tenancy Full Flow', () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).jwtUser = { id: 'user-1', email: 'alice@test.com', role: 'admin', workspaceId: 'ws-1', workspaceRole: 'owner' };
    (req as any).user = { id: 'user-1' };
    next();
  });
  app.use('/api/organizations', organizationRouter);
  app.use('/api', workspaceRouter);
  app.use(errorHandler);

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  it('creates org → lists → gets details', async () => {
    // Create
    mockQueryPublic.mockResolvedValueOnce({
      rows: [{
        org: { id: 'org-new', name: 'Zensation', slug: 'zensation', plan: 'free', owner_id: 'user-1' },
        workspace: { id: 'ws-new', org_id: 'org-new', name: 'Default', slug: 'default' },
        contexts: '[]',
      }],
    } as any);

    const createRes = await request(app)
      .post('/api/organizations')
      .send({ name: 'Zensation' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.org.slug).toBe('zensation');

    // List
    mockQueryPublic.mockResolvedValueOnce({
      rows: [{ id: 'org-new', name: 'Zensation', slug: 'zensation', role: 'owner' }],
    } as any);

    const listRes = await request(app).get('/api/organizations');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    // Get details
    mockQueryPublic.mockResolvedValueOnce({
      rows: [{ id: 'org-new', name: 'Zensation', member_count: 1 }],
    } as any);

    const getRes = await request(app).get('/api/organizations/org-new');
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.member_count).toBe(1);
  });

  it('creates workspace → adds member → lists members', async () => {
    // Create workspace (with validation mocks)
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ role: 'owner', plan: 'pro' }] } as any)
      .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any)
      .mockResolvedValueOnce({
        rows: [{
          workspace: { id: 'ws-dev', org_id: 'org-1', name: 'Dev', slug: 'dev' },
          contexts: '[]',
        }],
      } as any);

    const wsRes = await request(app)
      .post('/api/organizations/org-1/workspaces')
      .send({ name: 'Dev', color: '#10b981' });
    expect(wsRes.status).toBe(201);

    // List members (checkMembership + listMembers)
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-dev', user_id: 'user-1', role: 'owner' }] } as any)
      .mockResolvedValueOnce({
        rows: [{ user_id: 'user-1', role: 'owner', email: 'alice@test.com' }],
      } as any);

    const membersRes = await request(app).get('/api/workspaces/ws-dev/members');
    expect(membersRes.status).toBe(200);
    expect(membersRes.body.data[0].role).toBe('owner');
  });

  it('invite → accept → member appears', async () => {
    // Invite
    mockQueryPublic.mockResolvedValueOnce({
      rows: [{ id: 'inv-1', email: 'bob@test.com', token: 'tok123', role: 'member' }],
    } as any);

    const invRes = await request(app)
      .post('/api/workspaces/ws-1/invite')
      .send({ email: 'bob@test.com', role: 'member' });
    expect(invRes.status).toBe(201);

    // Accept
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', workspace_id: 'ws-1', role: 'member', expires_at: new Date(Date.now() + 86400000).toISOString(), accepted_at: null }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] } as any)
      .mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-1', user_id: 'user-2', role: 'member' }] } as any)
      .mockResolvedValueOnce({ rows: [{}] } as any);

    const joinRes = await request(app)
      .post('/api/workspaces/ws-1/join')
      .send({ token: 'tok123' });
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.data.role).toBe('member');
  });
});
