/**
 * Contacts Service Tests
 *
 * Tests for contact CRUD, organization CRUD, interactions,
 * filtering, and stats.
 */

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  createContact,
  getContacts,
  getContact,
  updateContact,
  deleteContact,
  createOrganization,
  getOrganizations,
  getOrganization,
} from '../../../services/contacts';

describe('Contacts Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ============================================================
  // Contacts CRUD
  // ============================================================

  describe('createContact', () => {
    it('should create a contact with required fields', async () => {
      const mockContact = {
        id: 'c-1',
        display_name: 'John Doe',
        relationship_type: 'colleague',
        email: ['john@example.com'],
        phone: [],
        tags: [],
        is_favorite: false,
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [mockContact] });

      const result = await createContact('personal', {
        display_name: 'John Doe',
        email: ['john@example.com'],
      });

      expect(result).toEqual(mockContact);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO contacts'),
        expect.arrayContaining(['John Doe'])
      );
    });

    it('should default relationship_type to other', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'c-2', relationship_type: 'other' }] });

      await createContact('work', { display_name: 'Jane' });

      const callArgs = mockQueryContext.mock.calls[0][2] as unknown[];
      // relationship_type is the 8th param
      expect(callArgs[7]).toBe('other');
    });

    it('should pass userId when provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'c-3' }] });

      await createContact('personal', { display_name: 'Test' }, 'user-123');

      const callArgs = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(callArgs[callArgs.length - 1]).toBe('user-123');
    });
  });

  describe('getContacts', () => {
    it('should return contacts with total count', async () => {
      const contacts = [{ id: 'c-1', display_name: 'Alice' }];
      mockQueryContext
        .mockResolvedValueOnce({ rows: contacts })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getContacts('personal');

      expect(result.contacts).toEqual(contacts);
      expect(result.total).toBe(1);
    });

    it('should apply search filter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getContacts('personal', { search: 'john' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('ILIKE');
    });

    it('should apply relationship_type filter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getContacts('work', { relationship_type: 'client' });

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params).toContain('client');
    });

    it('should cap limit at 200', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getContacts('personal', { limit: 500 });

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params).toContain(200);
    });
  });

  describe('getContact', () => {
    it('should return contact by id', async () => {
      const contact = { id: 'c-1', display_name: 'Bob', organization_name: 'Acme' };
      mockQueryContext.mockResolvedValueOnce({ rows: [contact] });

      const result = await getContact('personal', 'c-1');

      expect(result).toEqual(contact);
    });

    it('should return null if not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getContact('personal', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateContact', () => {
    it('should update provided fields', async () => {
      const updated = { id: 'c-1', display_name: 'Updated Name' };
      mockQueryContext.mockResolvedValueOnce({ rows: [updated] });

      const result = await updateContact('personal', 'c-1', { display_name: 'Updated Name' });

      expect(result).toEqual(updated);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('UPDATE contacts');
    });

    it('should return current contact when no updates provided', async () => {
      const existing = { id: 'c-1', display_name: 'Existing' };
      mockQueryContext.mockResolvedValueOnce({ rows: [existing] });

      const result = await updateContact('personal', 'c-1', {});

      expect(result).toEqual(existing);
      // Should call getContact (SELECT), not UPDATE
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('SELECT');
    });
  });

  describe('deleteContact', () => {
    it('should return true on successful delete', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });

      const result = await deleteContact('personal', 'c-1');

      expect(result).toBe(true);
    });

    it('should return false when contact not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 });

      const result = await deleteContact('personal', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // Organizations
  // ============================================================

  describe('createOrganization', () => {
    it('should create an organization', async () => {
      const org = { id: 'org-1', name: 'Acme Corp', industry: 'Tech' };
      mockQueryContext.mockResolvedValueOnce({ rows: [org] });

      const result = await createOrganization('work', { name: 'Acme Corp', industry: 'Tech' });

      expect(result).toEqual(org);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('INSERT INTO organizations'),
        expect.arrayContaining(['Acme Corp', 'Tech'])
      );
    });
  });

  describe('getOrganizations', () => {
    it('should return organizations with total and contact_count', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'org-1', name: 'Acme', contact_count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getOrganizations('work');

      expect(result.organizations[0].contact_count).toBe(5);
      expect(result.total).toBe(1);
    });

    it('should filter by industry', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getOrganizations('work', { industry: 'Tech' });

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params).toContain('Tech');
    });
  });

  describe('getOrganization', () => {
    it('should return org with computed contact_count', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'org-1', name: 'Acme', contact_count: '3' }],
      });

      const result = await getOrganization('work', 'org-1');

      expect(result).not.toBeNull();
      expect(result!.contact_count).toBe(3);
    });

    it('should return null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getOrganization('work', 'nonexistent');

      expect(result).toBeNull();
    });
  });
});
