/**
 * Contacts & CRM Route Tests - Phase 41
 *
 * Tests contacts CRUD, organizations CRUD, interactions, stats, and follow-ups.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validation
jest.mock('../../../utils/validation', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// Mock contacts service
const mockGetContacts = jest.fn();
const mockGetContactStats = jest.fn();
const mockGetFollowUpSuggestions = jest.fn();
const mockGetContact = jest.fn();
const mockCreateContact = jest.fn();
const mockUpdateContact = jest.fn();
const mockDeleteContact = jest.fn();
const mockGetInteractions = jest.fn();
const mockAddInteraction = jest.fn();
const mockGetOrganizations = jest.fn();
const mockGetOrganization = jest.fn();
const mockCreateOrganization = jest.fn();
const mockUpdateOrganization = jest.fn();
const mockDeleteOrganization = jest.fn();

jest.mock('../../../services/contacts', () => ({
  getContacts: (...args: unknown[]) => mockGetContacts(...args),
  getContactStats: (...args: unknown[]) => mockGetContactStats(...args),
  getFollowUpSuggestions: (...args: unknown[]) => mockGetFollowUpSuggestions(...args),
  getContact: (...args: unknown[]) => mockGetContact(...args),
  createContact: (...args: unknown[]) => mockCreateContact(...args),
  updateContact: (...args: unknown[]) => mockUpdateContact(...args),
  deleteContact: (...args: unknown[]) => mockDeleteContact(...args),
  getInteractions: (...args: unknown[]) => mockGetInteractions(...args),
  addInteraction: (...args: unknown[]) => mockAddInteraction(...args),
  getOrganizations: (...args: unknown[]) => mockGetOrganizations(...args),
  getOrganization: (...args: unknown[]) => mockGetOrganization(...args),
  createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
  updateOrganization: (...args: unknown[]) => mockUpdateOrganization(...args),
  deleteOrganization: (...args: unknown[]) => mockDeleteOrganization(...args),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock database-context (needed by some imports)
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
  queryContext: jest.fn(),
}));

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Contacts & CRM Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { contactsRouter } = await import('../../../routes/contacts');
    app = express();
    app.use(express.json());
    app.use('/api', contactsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path return values
    mockGetContacts.mockResolvedValue({ contacts: [{ id: UUID, display_name: 'Max Mustermann' }], total: 1 });
    mockGetContactStats.mockResolvedValue({ total: 10, favorites: 2 });
    mockGetFollowUpSuggestions.mockResolvedValue([{ id: UUID, display_name: 'Max', reason: 'No contact in 30 days' }]);
    mockGetContact.mockResolvedValue({ id: UUID, display_name: 'Max Mustermann' });
    mockCreateContact.mockResolvedValue({ id: 'new-1', display_name: 'New Contact' });
    mockUpdateContact.mockResolvedValue({ id: UUID, display_name: 'Updated Contact' });
    mockDeleteContact.mockResolvedValue(true);
    mockGetInteractions.mockResolvedValue({ interactions: [], total: 0 });
    mockAddInteraction.mockResolvedValue({ id: 'int-1', interaction_type: 'call' });
    mockGetOrganizations.mockResolvedValue({ organizations: [{ id: UUID, name: 'Acme Corp' }], total: 1 });
    mockGetOrganization.mockResolvedValue({ id: UUID, name: 'Acme Corp' });
    mockCreateOrganization.mockResolvedValue({ id: 'org-1', name: 'New Org' });
    mockUpdateOrganization.mockResolvedValue({ id: UUID, name: 'Updated Org' });
    mockDeleteOrganization.mockResolvedValue(true);
  });

  // ===========================================
  // Contacts List & Stats
  // ===========================================
  describe('GET /api/:context/contacts', () => {
    it('should list contacts', async () => {
      const res = await request(app).get('/api/personal/contacts');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/contacts');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/contacts/stats', () => {
    it('should return contact stats', async () => {
      const res = await request(app).get('/api/personal/contacts/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(10);
    });
  });

  describe('GET /api/:context/contacts/follow-ups', () => {
    it('should return follow-up suggestions', async () => {
      const res = await request(app).get('/api/personal/contacts/follow-ups');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // ===========================================
  // Contact CRUD
  // ===========================================
  describe('GET /api/:context/contacts/:id', () => {
    it('should return a contact', async () => {
      const res = await request(app).get(`/api/personal/contacts/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.display_name).toBe('Max Mustermann');
    });

    it('should return 404 for non-existent contact', async () => {
      mockGetContact.mockResolvedValueOnce(null);
      const res = await request(app).get(`/api/personal/contacts/${UUID}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const { isValidUUID } = require('../../../utils/validation');
      isValidUUID.mockReturnValueOnce(false);
      const res = await request(app).get('/api/personal/contacts/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/contacts', () => {
    it('should create a contact', async () => {
      const res = await request(app)
        .post('/api/personal/contacts')
        .send({ display_name: 'New Contact', email: 'new@example.com' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 without display_name', async () => {
      const res = await request(app)
        .post('/api/personal/contacts')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/contacts/:id', () => {
    it('should update a contact', async () => {
      const res = await request(app)
        .put(`/api/personal/contacts/${UUID}`)
        .send({ display_name: 'Updated Contact' });
      expect(res.status).toBe(200);
      expect(res.body.data.display_name).toBe('Updated Contact');
    });

    it('should return 404 for non-existent contact', async () => {
      mockUpdateContact.mockResolvedValueOnce(null);
      const res = await request(app)
        .put(`/api/personal/contacts/${UUID}`)
        .send({ display_name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/contacts/:id', () => {
    it('should delete a contact', async () => {
      const res = await request(app).delete(`/api/personal/contacts/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent contact', async () => {
      mockDeleteContact.mockResolvedValueOnce(false);
      const res = await request(app).delete(`/api/personal/contacts/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Interactions / Timeline
  // ===========================================
  describe('GET /api/:context/contacts/:id/timeline', () => {
    it('should return interaction timeline', async () => {
      const res = await request(app).get(`/api/personal/contacts/${UUID}/timeline`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(0);
    });
  });

  describe('POST /api/:context/contacts/:id/interactions', () => {
    it('should add an interaction', async () => {
      const res = await request(app)
        .post(`/api/personal/contacts/${UUID}/interactions`)
        .send({ interaction_type: 'call', notes: 'Discussed project' });
      expect(res.status).toBe(201);
      expect(res.body.data.interaction_type).toBe('call');
    });

    it('should return 400 without interaction_type', async () => {
      const res = await request(app)
        .post(`/api/personal/contacts/${UUID}/interactions`)
        .send({ notes: 'No type provided' });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Organizations
  // ===========================================
  describe('GET /api/:context/organizations', () => {
    it('should list organizations', async () => {
      const res = await request(app).get('/api/personal/organizations');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Acme Corp');
    });
  });

  describe('GET /api/:context/organizations/:id', () => {
    it('should return an organization', async () => {
      const res = await request(app).get(`/api/personal/organizations/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Acme Corp');
    });

    it('should return 404 for non-existent organization', async () => {
      mockGetOrganization.mockResolvedValueOnce(null);
      const res = await request(app).get(`/api/personal/organizations/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/organizations', () => {
    it('should create an organization', async () => {
      const res = await request(app)
        .post('/api/personal/organizations')
        .send({ name: 'New Org', industry: 'Tech' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 without name', async () => {
      const res = await request(app)
        .post('/api/personal/organizations')
        .send({ industry: 'Tech' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/organizations/:id', () => {
    it('should update an organization', async () => {
      const res = await request(app)
        .put(`/api/personal/organizations/${UUID}`)
        .send({ name: 'Updated Org' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Org');
    });

    it('should return 404 for non-existent organization', async () => {
      mockUpdateOrganization.mockResolvedValueOnce(null);
      const res = await request(app)
        .put(`/api/personal/organizations/${UUID}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/organizations/:id', () => {
    it('should delete an organization', async () => {
      const res = await request(app).delete(`/api/personal/organizations/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent organization', async () => {
      mockDeleteOrganization.mockResolvedValueOnce(false);
      const res = await request(app).delete(`/api/personal/organizations/${UUID}`);
      expect(res.status).toBe(404);
    });
  });
});
