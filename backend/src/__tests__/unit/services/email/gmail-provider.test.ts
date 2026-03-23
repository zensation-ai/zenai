import { GmailProvider } from '../../../../services/email/gmail-provider';

// Mock googleapis
const mockMessagesList = jest.fn();
const mockMessagesGet = jest.fn();
const mockHistoryList = jest.fn();
const mockMessagesSend = jest.fn();
const mockMessagesModify = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(() => ({
      users: {
        messages: {
          list: mockMessagesList,
          get: mockMessagesGet,
          send: mockMessagesSend,
          modify: mockMessagesModify,
        },
        history: {
          list: mockHistoryList,
        },
      },
    })),
  },
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn().mockResolvedValue({
      credentials: {
        access_token: 'refreshed-token',
        refresh_token: 'new-refresh',
        expiry_date: Date.now() + 3600000,
      },
    }),
  })),
}));

jest.mock('../../../../services/auth/google-oauth-tokens', () => ({
  getGoogleToken: jest.fn(),
  updateGoogleTokens: jest.fn(),
  isTokenExpired: jest.fn(() => false),
}));

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

import { getGoogleToken, isTokenExpired } from '../../../../services/auth/google-oauth-tokens';
import { queryContext } from '../../../../utils/database-context';

const mockGetGoogleToken = getGoogleToken as jest.Mock;
const mockIsTokenExpired = isTokenExpired as jest.Mock;
const mockQueryContext = queryContext as jest.Mock;

describe('GmailProvider', () => {
  let provider: GmailProvider;

  const mockAccount = {
    id: 'acc-1',
    google_token_id: 'token-1',
    gmail_history_id: null,
    provider: 'gmail',
    user_id: 'user-1',
  };

  const mockToken = {
    id: 'token-1',
    access_token: 'access-123',
    refresh_token: 'refresh-456',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    google_email: 'user@gmail.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GmailProvider();
    mockGetGoogleToken.mockResolvedValue(mockToken);
    mockIsTokenExpired.mockReturnValue(false);
    mockQueryContext.mockResolvedValueOnce({ rows: [mockAccount] });
  });

  describe('syncFull', () => {
    it('should fetch messages and store historyId', async () => {
      mockMessagesList.mockResolvedValue({
        data: {
          messages: [{ id: 'msg-1', threadId: 'thread-1' }],
          nextPageToken: null,
          resultSizeEstimate: 1,
        },
      });

      mockMessagesGet.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          historyId: '12345',
          labelIds: ['INBOX', 'UNREAD'],
          snippet: 'Hello there',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'To', value: 'user@gmail.com' },
              { name: 'Subject', value: 'Test Email' },
              { name: 'Date', value: 'Sat, 22 Mar 2026 10:00:00 +0000' },
              { name: 'Message-ID', value: '<msg123@example.com>' },
            ],
          },
          internalDate: '1711094400000',
        },
      });

      // no existing, insert, update history
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'db-1' }] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncFull('acc-1', 'personal');

      expect(result.newMessages).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockMessagesList).toHaveBeenCalled();
    });

    it('should handle empty inbox', async () => {
      mockMessagesList.mockResolvedValue({
        data: { messages: [], resultSizeEstimate: 0 },
      });
      // update last_sync_at
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncFull('acc-1', 'personal');
      expect(result.newMessages).toBe(0);
    });
  });

  describe('syncIncremental', () => {
    it('should use history.list for incremental sync', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAccount, gmail_history_id: '10000' }],
      });

      mockHistoryList.mockResolvedValue({
        data: {
          history: [{
            id: '10001',
            messagesAdded: [{ message: { id: 'new-msg', threadId: 't1', labelIds: ['INBOX'] } }],
          }],
          historyId: '10001',
        },
      });

      mockMessagesGet.mockResolvedValue({
        data: {
          id: 'new-msg',
          threadId: 't1',
          historyId: '10001',
          labelIds: ['INBOX'],
          snippet: 'New message',
          payload: {
            headers: [
              { name: 'From', value: 'sender@test.com' },
              { name: 'To', value: 'user@gmail.com' },
              { name: 'Subject', value: 'New' },
              { name: 'Date', value: 'Sat, 22 Mar 2026 11:00:00 +0000' },
            ],
          },
          internalDate: '1711098000000',
        },
      });

      // no existing, insert, update history
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'db-2' }] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncIncremental('acc-1', 'personal');
      expect(result.newMessages).toBe(1);
      expect(mockHistoryList).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'me', startHistoryId: '10000' })
      );
    });

    it('should fall back to full sync on 404 (invalid historyId)', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAccount, gmail_history_id: 'stale-id' }],
      });

      mockHistoryList.mockRejectedValue({
        response: { status: 404 },
        message: 'historyId no longer valid',
      });

      // Reset history_id query
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Full sync: account lookup
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockAccount, gmail_history_id: null }] });
      // Full sync: empty
      mockMessagesList.mockResolvedValue({ data: { messages: [], resultSizeEstimate: 0 } });
      // update last_sync_at
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncIncremental('acc-1', 'personal');
      expect(result.errors).toHaveLength(0);
      expect(mockMessagesList).toHaveBeenCalled();
    });
  });

  describe('fetchMessageBody', () => {
    it('should fetch full message and extract body parts', async () => {
      // We need to mock the pool for the cross-context account lookup
      const { pool } = require('../../../../utils/database');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ ctx: 'personal' }],
      });
      // Account lookup for getGmailClient
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccount] });

      mockMessagesGet.mockResolvedValue({
        data: {
          id: 'msg-1',
          payload: {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: Buffer.from('Hello plain').toString('base64url') } },
              { mimeType: 'text/html', body: { data: Buffer.from('<p>Hello html</p>').toString('base64url') } },
            ],
          },
        },
      });

      const result = await provider.fetchMessageBody('acc-1', 'msg-1');
      expect(result.bodyText).toBe('Hello plain');
      expect(result.bodyHtml).toBe('<p>Hello html</p>');
    });
  });

  describe('modifyMessage', () => {
    it('should call messages.modify with label changes', async () => {
      const { pool } = require('../../../../utils/database');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ ctx: 'personal' }],
      });
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [mockAccount] });
      mockMessagesModify.mockResolvedValue({ data: {} });

      await provider.modifyMessage('acc-1', 'msg-1', {
        read: true,
        starred: true,
      });

      expect(mockMessagesModify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'me',
          id: 'msg-1',
          requestBody: expect.objectContaining({
            removeLabelIds: expect.arrayContaining(['UNREAD']),
            addLabelIds: expect.arrayContaining(['STARRED']),
          }),
        })
      );
    });
  });
});
