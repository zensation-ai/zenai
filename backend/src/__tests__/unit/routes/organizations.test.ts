jest.mock('../../../services/organization-service');
jest.mock('../../../middleware/plan-gate', () => ({
  requirePlan: () => (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import request from 'supertest';
import { organizationRouter } from '../../../routes/organizations';
import { errorHandler } from '../../../middleware/errorHandler';
import * as orgService from '../../../services/organization-service';

const mockCreateOrg = orgService.createOrganization as jest.MockedFunction<typeof orgService.createOrganization>;
const mockListOrgs = orgService.listUserOrganizations as jest.MockedFunction<typeof orgService.listUserOrganizations>;
const mockGetOrg = orgService.getOrganization as jest.MockedFunction<typeof orgService.getOrganization>;
const mockUpdateOrg = orgService.updateOrganization as jest.MockedFunction<typeof orgService.updateOrganization>;
const mockDeleteOrg = orgService.deleteOrganization as jest.MockedFunction<typeof orgService.deleteOrganization>;

const app = express();
app.use(express.json());
// Fake auth middleware
app.use((req, _res, next) => {
  (req as any).jwtUser = { id: 'user-1', email: 'test@test.com', role: 'admin' };
  (req as any).user = { id: 'user-1' };
  next();
});
app.use('/api/organizations', organizationRouter);
app.use(errorHandler);

describe('organization routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/organizations creates org', async () => {
    mockCreateOrg.mockResolvedValueOnce({
      org: { id: 'org-1', name: 'Test', slug: 'test' } as any,
      workspace: { id: 'ws-1' } as any,
      contexts: [],
    });

    const res = await request(app)
      .post('/api/organizations')
      .send({ name: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.data.org.name).toBe('Test');
  });

  it('GET /api/organizations lists user orgs', async () => {
    mockListOrgs.mockResolvedValueOnce([
      { id: 'org-1', name: 'A', role: 'owner' } as any,
    ]);

    const res = await request(app).get('/api/organizations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/organizations/:id returns org', async () => {
    mockGetOrg.mockResolvedValueOnce({ id: 'org-1', name: 'Test', member_count: 2 } as any);

    const res = await request(app).get('/api/organizations/org-1');
    expect(res.status).toBe(200);
    expect(res.body.data.member_count).toBe(2);
  });

  it('GET /api/organizations/:id returns 404 for non-member', async () => {
    mockGetOrg.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/organizations/org-x');
    expect(res.status).toBe(404);
  });

  it('PUT /api/organizations/:id updates org', async () => {
    // getOrganization is called first to check caller_role
    mockGetOrg.mockResolvedValueOnce({ id: 'org-1', name: 'Test', caller_role: 'owner' } as any);
    mockUpdateOrg.mockResolvedValueOnce({ id: 'org-1', name: 'Updated' } as any);

    const res = await request(app)
      .put('/api/organizations/org-1')
      .send({ name: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('DELETE /api/organizations/:id deletes org', async () => {
    // getOrganization is called first to check caller_role
    mockGetOrg.mockResolvedValueOnce({ id: 'org-1', name: 'Test', caller_role: 'owner' } as any);
    mockDeleteOrg.mockResolvedValueOnce(true);

    const res = await request(app).delete('/api/organizations/org-1');
    expect(res.status).toBe(200);
  });
});
