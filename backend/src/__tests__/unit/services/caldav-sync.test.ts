/**
 * Unit Tests for CalDAV Sync Service - Phase 40
 *
 * Tests account CRUD, sync engine, scheduler, and push/delete operations.
 */

// Mock database context
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: mockQueryContext,
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

// Mock encryption
jest.mock('../../../utils/encryption', () => ({
  encrypt: jest.fn((text: string) => `encrypted:${text}`),
  decrypt: jest.fn((text: string) => text.replace('encrypted:', '')),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

// Mock CalDAV connector
const mockFetchCalendarEvents = jest.fn().mockResolvedValue([]);
const mockFetchChangedEvents = jest.fn().mockResolvedValue({ events: [], newSyncToken: undefined });
const mockCreateRemoteEvent = jest.fn().mockResolvedValue({ url: '/event.ics', etag: '"new-etag"' });
const mockUpdateRemoteEvent = jest.fn().mockResolvedValue({ etag: '"updated-etag"' });
const mockDeleteRemoteEvent = jest.fn().mockResolvedValue(true);
const mockEventToICal = jest.fn().mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
const mockParseICal = jest.fn().mockReturnValue(null);

jest.mock('../../../services/caldav-connector', () => ({
  fetchCalendarEvents: (...args: any[]) => mockFetchCalendarEvents(...args),
  fetchChangedEvents: (...args: any[]) => mockFetchChangedEvents(...args),
  createRemoteEvent: (...args: any[]) => mockCreateRemoteEvent(...args),
  updateRemoteEvent: (...args: any[]) => mockUpdateRemoteEvent(...args),
  deleteRemoteEvent: (...args: any[]) => mockDeleteRemoteEvent(...args),
  eventToICal: (...args: any[]) => mockEventToICal(...args),
  parseICal: (...args: any[]) => mockParseICal(...args),
}));

import {
  createCalendarAccount,
  getCalendarAccounts,
  getCalendarAccount,
  updateCalendarAccount,
  deleteCalendarAccount,
  syncAccount,
  pushEventToRemote,
  deleteEventFromRemote,
  startCalDAVScheduler,
  stopCalDAVScheduler,
} from '../../../services/caldav-sync';

describe('CalDAV Sync Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  const mockAccountRow = {
    id: 'acc-1',
    provider: 'icloud',
    username: 'test@icloud.com',
    password_encrypted: 'encrypted:test-pass',
    display_name: 'iCloud',
    caldav_url: 'https://caldav.icloud.com',
    calendars: JSON.stringify([{ url: '/cal/1/', displayName: 'Work', enabled: true, color: '#4A90D9' }]),
    is_enabled: true,
    sync_interval_minutes: 5,
    last_sync_at: null,
    last_sync_error: null,
    sync_token: null,
    context: 'personal',
    metadata: '{}',
    created_at: new Date('2026-03-08T10:00:00Z'),
    updated_at: new Date('2026-03-08T10:00:00Z'),
  };

  // ============================================================
  // Account CRUD
  // ============================================================

  describe('createCalendarAccount', () => {
    it('creates an account with encrypted password', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccountRow] });

      const account = await createCalendarAccount('personal' as any, {
        provider: 'icloud',
        username: 'test@icloud.com',
        password: 'test-pass',
        display_name: 'My iCloud',
      });

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const [, query, params] = mockQueryContext.mock.calls[0];
      expect(query).toContain('INSERT INTO calendar_accounts');
      expect(params[3]).toBe('encrypted:test-pass'); // Encrypted password
      expect(account.id).toBe('acc-1');
      expect(account.provider).toBe('icloud');
    });

    it('defaults caldav_url to icloud URL', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccountRow] });

      await createCalendarAccount('personal' as any, {
        provider: 'icloud',
        username: 'test@icloud.com',
        password: 'test-pass',
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[5]).toBe('https://caldav.icloud.com');
    });
  });

  describe('getCalendarAccounts', () => {
    it('returns all accounts for a context', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccountRow] });

      const accounts = await getCalendarAccounts('personal' as any);

      expect(accounts).toHaveLength(1);
      expect(accounts[0].provider).toBe('icloud');
      expect(accounts[0].calendars).toHaveLength(1);
      expect(accounts[0].calendars[0].displayName).toBe('Work');
    });

    it('returns empty array when no accounts', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const accounts = await getCalendarAccounts('work' as any);
      expect(accounts).toHaveLength(0);
    });
  });

  describe('getCalendarAccount', () => {
    it('returns account by id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccountRow] });

      const account = await getCalendarAccount('personal' as any, 'acc-1');

      expect(account).not.toBeNull();
      expect(account!.id).toBe('acc-1');
    });

    it('returns null when account not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const account = await getCalendarAccount('personal' as any, 'missing');
      expect(account).toBeNull();
    });
  });

  describe('updateCalendarAccount', () => {
    it('updates display_name', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAccountRow, display_name: 'New Name' }],
      });

      const updated = await updateCalendarAccount('personal' as any, 'acc-1', {
        display_name: 'New Name',
      });

      expect(updated).not.toBeNull();
      expect(updated!.display_name).toBe('New Name');
      const query = mockQueryContext.mock.calls[0][1];
      expect(query).toContain('display_name');
    });

    it('encrypts password on update', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccountRow] });

      await updateCalendarAccount('personal' as any, 'acc-1', {
        password: 'new-password',
      });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[0]).toBe('encrypted:new-password');
    });

    it('returns null when no updates provided', async () => {
      const result = await updateCalendarAccount('personal' as any, 'acc-1', {});
      expect(result).toBeNull();
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('returns null when account not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await updateCalendarAccount('personal' as any, 'missing', {
        display_name: 'X',
      });
      expect(result).toBeNull();
    });
  });

  describe('deleteCalendarAccount', () => {
    it('deletes account and its events', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] } as any) // DELETE events
        .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] } as any); // DELETE account

      const result = await deleteCalendarAccount('personal' as any, 'acc-1');

      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      expect(mockQueryContext.mock.calls[0][1]).toContain('DELETE FROM calendar_events');
      expect(mockQueryContext.mock.calls[1][1]).toContain('DELETE FROM calendar_accounts');
    });

    it('returns false when account not found', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] } as any) // DELETE events
        .mockResolvedValueOnce({ rows: [] } as any); // DELETE account (not found)

      const result = await deleteCalendarAccount('personal' as any, 'missing');
      expect(result).toBe(false);
    });
  });

  // ============================================================
  // Sync Engine
  // ============================================================

  describe('syncAccount', () => {
    it('throws if account not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await expect(syncAccount('personal' as any, 'missing')).rejects.toThrow('Account not found or disabled');
    });

    it('throws if account is disabled', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAccountRow, is_enabled: false }],
      });

      await expect(syncAccount('personal' as any, 'acc-1')).rejects.toThrow('Account not found or disabled');
    });

    it('returns zero counts when no enabled calendars', async () => {
      const noCalAccount = {
        ...mockAccountRow,
        calendars: JSON.stringify([{ url: '/cal/1/', displayName: 'Work', enabled: false }]),
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [noCalAccount] });

      const result = await syncAccount('personal' as any, 'acc-1');

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('performs full sync and creates new local events', async () => {
      // getCalendarAccount
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccountRow] });

      // fetchCalendarEvents (full sync, no sync token)
      mockFetchCalendarEvents.mockResolvedValueOnce([
        {
          url: '/cal/1/event1.ics',
          etag: '"etag-1"',
          data: 'BEGIN:VCALENDAR\r\nUID:uid-1\r\nSUMMARY:Meeting\r\nEND:VCALENDAR',
          uid: 'uid-1',
        },
      ]);

      mockParseICal.mockReturnValueOnce({
        uid: 'uid-1',
        title: 'Meeting',
        start_time: '2026-03-08T10:00:00.000Z',
        end_time: '2026-03-08T11:00:00.000Z',
        all_day: false,
        status: 'confirmed',
      });

      // SELECT existing local events
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      // INSERT new local event
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      // No pending local events (sync_token is null, so push check runs)
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      // UPDATE account sync status
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await syncAccount('personal' as any, 'acc-1');

      expect(result.created).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  // ============================================================
  // Push / Delete Remote
  // ============================================================

  describe('pushEventToRemote', () => {
    it('returns false when event not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await pushEventToRemote('personal' as any, 'missing');
      expect(result).toBe(false);
    });

    it('creates new remote event if no external_uid', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          external_uid: null,
          etag: null,
          title: 'Local Event',
          description: null,
          start_time: new Date('2026-03-08T10:00:00Z'),
          end_time: new Date('2026-03-08T11:00:00Z'),
          all_day: false,
          location: null,
          status: 'confirmed',
          rrule: null,
          username: 'test@icloud.com',
          password_encrypted: 'encrypted:test-pass',
          caldav_url: 'https://caldav.icloud.com',
          calendars: JSON.stringify([{ url: '/cal/1/', displayName: 'Work', enabled: true }]),
        }],
      });

      // UPDATE after push
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await pushEventToRemote('personal' as any, 'event-1');

      expect(result).toBe(true);
      expect(mockCreateRemoteEvent).toHaveBeenCalled();
    });

    it('updates existing remote event if external_uid exists', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          external_uid: 'uid-remote',
          etag: '"etag-old"',
          title: 'Updated Event',
          description: null,
          start_time: new Date('2026-03-08T10:00:00Z'),
          end_time: new Date('2026-03-08T11:00:00Z'),
          all_day: false,
          location: null,
          status: 'confirmed',
          rrule: null,
          username: 'test@icloud.com',
          password_encrypted: 'encrypted:test-pass',
          caldav_url: 'https://caldav.icloud.com',
          calendars: JSON.stringify([{ url: '/cal/1/', displayName: 'Work', enabled: true }]),
        }],
      });

      // UPDATE after push
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await pushEventToRemote('personal' as any, 'event-1');

      expect(result).toBe(true);
      expect(mockUpdateRemoteEvent).toHaveBeenCalled();
    });

    it('marks event as pending on push failure', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          external_uid: null,
          etag: null,
          title: 'Fail Event',
          description: null,
          start_time: new Date('2026-03-08T10:00:00Z'),
          end_time: new Date('2026-03-08T11:00:00Z'),
          all_day: false,
          location: null,
          status: 'confirmed',
          rrule: null,
          username: 'test@icloud.com',
          password_encrypted: 'encrypted:test-pass',
          caldav_url: 'https://caldav.icloud.com',
          calendars: JSON.stringify([{ url: '/cal/1/', displayName: 'Work', enabled: true }]),
        }],
      });

      mockCreateRemoteEvent.mockRejectedValueOnce(new Error('Server error'));

      // UPDATE sync_state = 'pending'
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await pushEventToRemote('personal' as any, 'event-1');

      expect(result).toBe(false);
      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[1]).toContain("sync_state = 'pending'");
    });
  });

  describe('deleteEventFromRemote', () => {
    it('returns false when event has no external_uid', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await deleteEventFromRemote('personal' as any, 'event-1');
      expect(result).toBe(false);
    });

    it('deletes remote event successfully', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          external_uid: 'uid-remote',
          etag: '"etag-1"',
          username: 'test@icloud.com',
          password_encrypted: 'encrypted:test-pass',
          caldav_url: 'https://caldav.icloud.com',
          calendars: JSON.stringify([{ url: '/cal/1/', displayName: 'Work', enabled: true }]),
        }],
      });

      const result = await deleteEventFromRemote('personal' as any, 'event-1');

      expect(result).toBe(true);
      expect(mockDeleteRemoteEvent).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Scheduler
  // ============================================================

  describe('CalDAV Scheduler', () => {
    it('starts and stops without error', () => {
      startCalDAVScheduler();
      stopCalDAVScheduler();
      // No assertion needed - just verifying no crash
    });

    it('does not start twice', () => {
      startCalDAVScheduler();
      startCalDAVScheduler(); // Should be a no-op
      stopCalDAVScheduler();
    });
  });
});
