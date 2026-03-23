import { GmailProvider } from '../../../../services/email/gmail-provider';

const mockMessagesSend = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(() => ({
      users: {
        messages: {
          list: jest.fn(),
          get: jest.fn(),
          send: mockMessagesSend,
          modify: jest.fn(),
        },
        history: { list: jest.fn() },
      },
    })),
  },
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn().mockResolvedValue({
      credentials: { access_token: 'new', expiry_date: Date.now() + 3600000 },
    }),
  })),
}));

jest.mock('../../../../services/auth/google-oauth-tokens', () => ({
  getGoogleToken: jest.fn().mockResolvedValue({
    id: 'token-1',
    access_token: 'access-123',
    refresh_token: 'refresh-456',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    google_email: 'user@gmail.com',
  }),
  updateGoogleTokens: jest.fn(),
  isTokenExpired: jest.fn(() => false),
}));

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../services/email/mime-builder', () => ({
  buildMimeMessage: jest.fn().mockResolvedValue(Buffer.from('MIME message content')),
}));

import { queryContext } from '../../../../utils/database-context';
import { buildMimeMessage } from '../../../../services/email/mime-builder';

const mockQueryContext = queryContext as jest.Mock;
const mockBuildMime = buildMimeMessage as jest.Mock;

describe('GmailProvider.sendMessage', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GmailProvider();
    // Default: account lookup
    mockQueryContext.mockResolvedValueOnce({
      rows: [{
        id: 'acc-1',
        google_token_id: 'token-1',
        email_address: 'user@gmail.com',
        provider: 'gmail',
        user_id: 'user-1',
      }],
    });
  });

  it('should build MIME message and call Gmail API send', async () => {
    mockMessagesSend.mockResolvedValue({
      data: { id: 'sent-msg-1', threadId: 'thread-1' },
    });

    const result = await provider.sendMessage('acc-1', {
      to: [{ email: 'recipient@example.com' }],
      subject: 'Test Send',
      bodyText: 'Hello from Gmail',
    }, 'personal');

    expect(mockBuildMime).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'user@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Test Send',
        text: 'Hello from Gmail',
      })
    );
    expect(mockMessagesSend).toHaveBeenCalled();
    expect(result.messageId).toBe('sent-msg-1');
    expect(result.threadId).toBe('thread-1');
  });

  it('should include threadId when replying', async () => {
    mockMessagesSend.mockResolvedValue({
      data: { id: 'reply-1', threadId: 'existing-thread' },
    });

    await provider.sendMessage('acc-1', {
      to: [{ email: 'other@example.com' }],
      subject: 'Re: Original',
      bodyText: 'My reply',
      inReplyTo: '<original@example.com>',
      threadId: 'existing-thread',
    }, 'personal');

    expect(mockBuildMime).toHaveBeenCalledWith(
      expect.objectContaining({
        inReplyTo: '<original@example.com>',
        references: '<original@example.com>',
      })
    );
    expect(mockMessagesSend).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          threadId: 'existing-thread',
        }),
      })
    );
  });

  it('should pass attachments to MIME builder', async () => {
    mockMessagesSend.mockResolvedValue({
      data: { id: 'att-msg-1', threadId: 'thread-2' },
    });

    await provider.sendMessage('acc-1', {
      to: [{ email: 'recipient@example.com' }],
      subject: 'With Attachment',
      bodyText: 'See attached',
      attachments: [{
        filename: 'doc.pdf',
        content: Buffer.from('pdf-content'),
        contentType: 'application/pdf',
      }],
    }, 'personal');

    expect(mockBuildMime).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        })],
      })
    );
  });

  it('should reject messages over 25MB', async () => {
    mockBuildMime.mockResolvedValueOnce(Buffer.alloc(26 * 1024 * 1024));

    await expect(
      provider.sendMessage('acc-1', {
        to: [{ email: 'recipient@example.com' }],
        subject: 'Too Large',
        bodyText: 'Big',
      }, 'personal')
    ).rejects.toThrow(/exceeds Gmail's 25MB limit/);
  });

  it('should handle cc and bcc recipients', async () => {
    mockMessagesSend.mockResolvedValue({
      data: { id: 'cc-msg-1', threadId: 'thread-3' },
    });

    await provider.sendMessage('acc-1', {
      to: [{ email: 'to@example.com' }],
      cc: [{ email: 'cc@example.com' }],
      bcc: [{ email: 'bcc@example.com' }],
      subject: 'CC Test',
      bodyText: 'Hello',
    }, 'personal');

    expect(mockBuildMime).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
      })
    );
  });
});
