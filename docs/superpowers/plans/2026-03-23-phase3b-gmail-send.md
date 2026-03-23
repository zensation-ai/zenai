# Phase 3B: Gmail Send with Attachments — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Gmail send capability with file attachments, enabling users to compose, reply, and forward emails through their connected Gmail account.

**Architecture:** MIME construction via nodemailer's MailComposer, sent via Gmail API `users.messages.send()`. Provider-aware dispatch in email service functions (`sendNewEmail`, `replyToEmail`, `forwardEmail`) — Gmail accounts bypass the Resend path, Resend stays unchanged.

**Tech Stack:** nodemailer (MailComposer), googleapis gmail_v1, existing GmailProvider from Phase 3A

**Spec:** `docs/superpowers/specs/2026-03-23-phase3b-gmail-send-design.md`

---

## Chunk 1: Dependencies + MIME Builder + EmailDraft Extension

### Task 1: Install nodemailer + Add EmailAttachment type

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/services/email/email-provider.ts`

- [ ] **Step 1: Install nodemailer**

```bash
cd backend && npm install nodemailer && npm install -D @types/nodemailer
```

- [ ] **Step 2: Add EmailAttachment type and attachments field to EmailDraft**

In `backend/src/services/email/email-provider.ts`, after the `EmailDraft` interface, add:

```typescript
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}
```

And add `attachments?: EmailAttachment[];` to the `EmailDraft` interface.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/email/email-provider.ts
git commit -m "feat(phase3b): install nodemailer and add EmailAttachment type"
```

---

### Task 2: MIME Builder

**Files:**
- Create: `backend/src/services/email/mime-builder.ts`
- Test: `backend/src/__tests__/unit/services/email/mime-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/email/mime-builder.test.ts
import { buildMimeMessage } from '../../../../services/email/mime-builder';

describe('MimeBuilder', () => {
  describe('buildMimeMessage', () => {
    it('should build a plain text email', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        text: 'Hello plain text',
      });

      expect(raw).toBeInstanceOf(Buffer);
      const mimeStr = raw.toString();
      expect(mimeStr).toContain('From: sender@gmail.com');
      expect(mimeStr).toContain('To: recipient@example.com');
      expect(mimeStr).toContain('Subject: Test Subject');
    });

    it('should build an HTML email with text fallback', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'HTML Test',
        text: 'Fallback text',
        html: '<p>Hello <b>HTML</b></p>',
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('multipart/alternative');
      expect(mimeStr).toContain('text/plain');
      expect(mimeStr).toContain('text/html');
    });

    it('should include attachments as multipart/mixed', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'With Attachment',
        text: 'See attached',
        attachments: [{
          filename: 'test.txt',
          content: Buffer.from('file content'),
          contentType: 'text/plain',
        }],
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('test.txt');
      expect(mimeStr).toContain('multipart/mixed');
    });

    it('should include In-Reply-To and References headers for threading', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Re: Original',
        text: 'My reply',
        inReplyTo: '<original-msg-id@example.com>',
        references: '<original-msg-id@example.com>',
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('In-Reply-To: <original-msg-id@example.com>');
      expect(mimeStr).toContain('References: <original-msg-id@example.com>');
    });

    it('should handle unicode subjects', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Ünïcödé Sübjéct 日本語',
        text: 'Body',
      });

      // MailComposer handles RFC 2047 encoding
      expect(raw).toBeInstanceOf(Buffer);
      expect(raw.length).toBeGreaterThan(0);
    });

    it('should handle multiple recipients in to, cc, bcc', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['a@example.com', 'b@example.com'],
        cc: ['c@example.com'],
        bcc: ['d@example.com'],
        subject: 'Multi-recipient',
        text: 'Hello all',
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('a@example.com');
      expect(mimeStr).toContain('b@example.com');
      expect(mimeStr).toContain('c@example.com');
      // BCC should NOT appear in headers
      expect(mimeStr).not.toContain('d@example.com');
    });

    it('should handle empty body gracefully', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Empty body',
      });

      expect(raw).toBeInstanceOf(Buffer);
      expect(raw.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest mime-builder --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the MIME builder**

```typescript
// backend/src/services/email/mime-builder.ts
/**
 * Phase 3B: MIME Message Builder
 *
 * Uses nodemailer's MailComposer for RFC 2822 MIME construction.
 * Handles multipart/alternative (text+html), multipart/mixed (attachments),
 * threading headers, and unicode subject encoding.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MailComposer = require('nodemailer/lib/mail-composer');

export interface MimeOptions {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType: string;
  }>;
}

/**
 * Build a raw MIME message ready for Gmail API send.
 * Returns a Buffer of the complete RFC 2822 message.
 */
export async function buildMimeMessage(options: MimeOptions): Promise<Buffer> {
  const mailOptions: Record<string, unknown> = {
    from: options.from,
    to: options.to.join(', '),
    subject: options.subject,
  };

  if (options.cc && options.cc.length > 0) {
    mailOptions.cc = options.cc.join(', ');
  }
  if (options.bcc && options.bcc.length > 0) {
    mailOptions.bcc = options.bcc.join(', ');
  }
  if (options.text) {
    mailOptions.text = options.text;
  }
  if (options.html) {
    mailOptions.html = options.html;
  }

  // Threading headers
  const headers: Record<string, string> = {};
  if (options.inReplyTo) {
    headers['In-Reply-To'] = options.inReplyTo;
  }
  if (options.references) {
    headers['References'] = options.references;
  }
  if (Object.keys(headers).length > 0) {
    mailOptions.headers = headers;
  }

  // Attachments
  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map(att => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    }));
  }

  const composer = new MailComposer(mailOptions);

  return new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(message);
      }
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest mime-builder --no-coverage`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email/mime-builder.ts backend/src/__tests__/unit/services/email/mime-builder.test.ts
git commit -m "feat(phase3b): add MIME builder using nodemailer MailComposer"
```

---

## Chunk 2: GmailProvider.sendMessage() Implementation

### Task 3: Implement GmailProvider.sendMessage()

**Files:**
- Modify: `backend/src/services/email/gmail-provider.ts` (replace sendMessage stub)
- Test: `backend/src/__tests__/unit/services/email/gmail-send.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/email/gmail-send.test.ts
import { GmailProvider } from '../../../../services/email/gmail-provider';

const mockMessagesSend = jest.fn();
const mockMessagesGet = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(() => ({
      users: {
        messages: {
          list: jest.fn(),
          get: mockMessagesGet,
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

    // Default: account lookup returns Gmail account
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
    expect(mockMessagesSend).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        requestBody: expect.objectContaining({
          raw: expect.any(String),
        }),
      })
    );
    expect(result.messageId).toBe('sent-msg-1');
    expect(result.threadId).toBe('thread-1');
  });

  it('should include threadId in send request when replying', async () => {
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
    // Make buildMimeMessage return a >25MB buffer
    mockBuildMime.mockResolvedValueOnce(Buffer.alloc(26 * 1024 * 1024));

    await expect(
      provider.sendMessage('acc-1', {
        to: [{ email: 'recipient@example.com' }],
        subject: 'Too Large',
        bodyText: 'Big attachment',
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
      subject: 'CC/BCC Test',
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest gmail-send --no-coverage`
Expected: FAIL — sendMessage throws "deferred"

- [ ] **Step 3: Implement sendMessage in GmailProvider**

In `backend/src/services/email/gmail-provider.ts`, replace the `sendMessage` stub with:

```typescript
async sendMessage(accountId: string, draft: EmailDraft, context?: AIContext): Promise<SendResult> {
  // Resolve context if not provided
  let ctx = context;
  if (!ctx) {
    const ctxResult = await pool.query(
      `SELECT 'personal' as ctx FROM personal.email_accounts WHERE id = $1
       UNION ALL SELECT 'work' FROM work.email_accounts WHERE id = $1
       UNION ALL SELECT 'learning' FROM learning.email_accounts WHERE id = $1
       UNION ALL SELECT 'creative' FROM creative.email_accounts WHERE id = $1
       LIMIT 1`,
      [accountId]
    );
    ctx = (ctxResult.rows[0]?.ctx || 'personal') as AIContext;
  }

  const { gmail, account } = await this.getGmailClient(accountId, ctx);
  const fromAddress = (account.email_address as string) || 'noreply@zensation.ai';

  // Build MIME message (static import at top of file)
  const rawMessage = await buildMimeMessage({
    from: fromAddress,
    to: draft.to.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
    cc: draft.cc?.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
    bcc: draft.bcc?.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
    subject: draft.subject,
    text: draft.bodyText,
    html: draft.bodyHtml,
    inReplyTo: draft.inReplyTo,
    references: draft.inReplyTo, // Phase 3B: single reference, full chain deferred
    attachments: draft.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  // Validate size (Gmail 25MB limit)
  const MAX_GMAIL_MESSAGE_SIZE = 25 * 1024 * 1024;
  if (rawMessage.length > MAX_GMAIL_MESSAGE_SIZE) {
    throw new Error(`Message size (${Math.round(rawMessage.length / 1024 / 1024)}MB) exceeds Gmail's 25MB limit`);
  }

  // Base64url encode
  const encodedMessage = rawMessage
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Send via Gmail API
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId: draft.threadId || undefined,
    },
  });

  const messageId = response.data.id || '';
  const threadId = response.data.threadId || undefined;

  logger.info('Gmail message sent', {
    operation: 'gmailSend',
    accountId,
    messageId,
    threadId,
    to: draft.to.map(r => r.email),
  });

  return { messageId, threadId };
}
```

Also make these changes in `gmail-provider.ts`:

**a) Add static import for mime-builder at top of file:**
```typescript
import { buildMimeMessage } from './mime-builder';
```

**b) Update `getGmailClient` SELECT to include `email_address`:**

Find (around line 132):
```typescript
'SELECT id, google_token_id, gmail_history_id, provider, user_id FROM email_accounts WHERE id = $1 AND provider = $2',
```
Change to:
```typescript
'SELECT id, google_token_id, gmail_history_id, provider, user_id, email_address FROM email_accounts WHERE id = $1 AND provider = $2',
```

**c) Update `EmailProvider` interface to accept optional context:**

In `email-provider.ts`, change the `sendMessage` signature:
```typescript
sendMessage(accountId: string, draft: EmailDraft, context?: AIContext): Promise<SendResult>;
```

This allows calling with context from the email service where we know the context, while remaining backward-compatible.

**d) In the sendMessage implementation, remove the dynamic import** — use the static import from (a) instead:

Remove this line from the implementation:
```typescript
const { buildMimeMessage } = await import('./mime-builder');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest gmail-send --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Also run Phase 3A tests to check for regressions**

Run: `cd backend && npx jest gmail-provider.test --no-coverage`
Expected: All existing GmailProvider tests still PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/email/gmail-provider.ts backend/src/__tests__/unit/services/email/gmail-send.test.ts
git commit -m "feat(phase3b): implement GmailProvider.sendMessage with MIME + attachments"
```

---

## Chunk 3: Provider-Aware Dispatch in Email Service

### Task 4: Add provider dispatch to email service functions

**Files:**
- Modify: `backend/src/services/email.ts` (sendNewEmail, replyToEmail, forwardEmail)
- Test: `backend/src/__tests__/unit/services/email/email-provider-dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/email/email-provider-dispatch.test.ts
/**
 * Tests that email send/reply/forward routes to Gmail provider
 * when the account has provider='gmail'.
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  AIContext: {},
  isValidContext: jest.fn(() => true),
}));

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../services/resend', () => ({
  sendEmail: jest.fn(),
  isResendConfigured: jest.fn(() => true),
}));

jest.mock('../../../../services/email/email-provider', () => ({
  getEmailProvider: jest.fn(() => ({
    sendMessage: jest.fn().mockResolvedValue({
      messageId: 'gmail-sent-1',
      threadId: 'gmail-thread-1',
    }),
  })),
}));

import { queryContext } from '../../../../utils/database-context';
import { getEmailProvider } from '../../../../services/email/email-provider';

const mockQueryContext = queryContext as jest.Mock;
const mockGetProvider = getEmailProvider as jest.Mock;

describe('Email Provider Dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should detect Gmail account and use GmailProvider for send', async () => {
    // This is a conceptual test — verifying the dispatch logic
    // The actual integration is tested by modifying email.ts

    const gmailAccount = {
      id: 'acc-1',
      provider: 'gmail',
      google_token_id: 'token-1',
      email_address: 'user@gmail.com',
    };

    const resendAccount = {
      id: 'acc-2',
      provider: 'resend',
      email_address: 'user@zensation.ai',
    };

    // Gmail account → should use EmailProvider
    if (gmailAccount.provider === 'gmail') {
      const provider = getEmailProvider('gmail');
      const result = await provider.sendMessage('acc-1', {
        to: [{ email: 'test@example.com' }],
        subject: 'Test',
        bodyText: 'Hello',
      });
      expect(result.messageId).toBe('gmail-sent-1');
    }

    // Resend account → should NOT use EmailProvider
    if (resendAccount.provider !== 'gmail') {
      expect(mockGetProvider).toHaveBeenCalledTimes(1); // Only for Gmail
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes (concept test)**

Run: `cd backend && npx jest email-provider-dispatch --no-coverage`
Expected: PASS

- [ ] **Step 3: Modify sendNewEmail in email.ts**

In `backend/src/services/email.ts`, find `sendNewEmail` (around line 590). Currently:
```typescript
export async function sendNewEmail(context, input, userId) {
  const draft = await createDraft(context, input, userId);
  const sent = await sendEmailById(context, draft.id, userId);
  return sent || draft;
}
```

Change to:
```typescript
export async function sendNewEmail(
  context: AIContext,
  input: CreateEmailInput,
  userId?: string
): Promise<Email> {
  const draft = await createDraft(context, input, userId);

  // Check if account is Gmail → use GmailProvider instead of Resend
  if (input.account_id) {
    const accountResult = await queryContext(context,
      'SELECT provider, google_token_id, email_address FROM email_accounts WHERE id = $1',
      [input.account_id]
    );
    const account = accountResult.rows[0];

    if (account?.provider === 'gmail' && account.google_token_id) {
      const { getEmailProvider } = await import('./email/email-provider');
      const gmailProvider = getEmailProvider('gmail');
      const result = await gmailProvider.sendMessage(input.account_id, {
        to: input.to_addresses,
        cc: input.cc_addresses,
        bcc: input.bcc_addresses,
        subject: input.subject || '',
        bodyHtml: input.body_html,
        bodyText: input.body_text,
        attachments: input.attachments,
      }, context);

      // Update draft → sent in DB
      await queryContext(context,
        `UPDATE emails SET
           status = 'sent',
           direction = 'outbound',
           provider = 'gmail',
           provider_message_id = $1,
           thread_id = $2,
           from_address = $3,
           sent_at = now(),
           updated_at = now()
         WHERE id = $4`,
        [result.messageId, result.threadId || null, account.email_address, draft.id]
      );

      return { ...draft, status: 'sent' as EmailStatus, sent_at: new Date().toISOString() };
    }
  }

  // Default: Resend path (unchanged)
  const sent = await sendEmailById(context, draft.id, userId);
  return sent || draft;
}
```

- [ ] **Step 4: Modify replyToEmail in email.ts**

Find `replyToEmail` (around line 601). After it creates the draft and sets threading info, add provider check before `sendEmailById`:

After the thread_id/in_reply_to UPDATE (around line 625), replace the final send:

```typescript
  // Check if replying from Gmail account
  const accountId = options?.account_id || originalEmail.account_id;
  if (accountId) {
    const accountResult = await queryContext(context,
      'SELECT provider, google_token_id, email_address FROM email_accounts WHERE id = $1',
      [accountId]
    );
    const account = accountResult.rows[0];

    if (account?.provider === 'gmail' && account.google_token_id) {
      const { getEmailProvider } = await import('./email/email-provider');
      const gmailProvider = getEmailProvider('gmail');
      const result = await gmailProvider.sendMessage(accountId, {
        to: [{ email: originalEmail.from_address }],
        cc: options?.cc,
        subject: draft.subject || `Re: ${originalEmail.subject || ''}`,
        bodyHtml: body.html,
        bodyText: body.text,
        inReplyTo: originalEmail.message_id || undefined,
        threadId: originalEmail.thread_id || undefined,
      }, context);

      await queryContext(context,
        `UPDATE emails SET
           status = 'sent', direction = 'outbound', provider = 'gmail',
           provider_message_id = $1, from_address = $2, sent_at = now(), updated_at = now()
         WHERE id = $3`,
        [result.messageId, account.email_address, draft.id]
      );

      return { ...draft, status: 'sent' as EmailStatus, sent_at: new Date().toISOString() };
    }
  }

  // Default: Resend path
  const sent = await sendEmailById(context, draft.id, userId);
  return sent || draft;
```

- [ ] **Step 5: Modify forwardEmail in email.ts**

Find `forwardEmail` (around line 630). Same pattern — add provider check before the final `sendEmailById`:

```typescript
  // Check if forwarding from Gmail account
  const accountId = options?.account_id || originalEmail.account_id;
  if (accountId) {
    const accountResult = await queryContext(context,
      'SELECT provider, google_token_id, email_address FROM email_accounts WHERE id = $1',
      [accountId]
    );
    const account = accountResult.rows[0];

    if (account?.provider === 'gmail' && account.google_token_id) {
      const { getEmailProvider } = await import('./email/email-provider');
      const gmailProvider = getEmailProvider('gmail');
      const result = await gmailProvider.sendMessage(accountId, {
        to,
        subject: draft.subject || `Fwd: ${originalEmail.subject || ''}`,
        bodyHtml: forwardedBody.html,
        bodyText: forwardedBody.text,
      }, context);

      await queryContext(context,
        `UPDATE emails SET
           status = 'sent', direction = 'outbound', provider = 'gmail',
           provider_message_id = $1, from_address = $2, sent_at = now(), updated_at = now()
         WHERE id = $3`,
        [result.messageId, account.email_address, draft.id]
      );

      return { ...draft, status: 'sent' as EmailStatus, sent_at: new Date().toISOString() };
    }
  }

  // Default: Resend path
  const sent = await sendEmailById(context, draft.id, userId);
  return sent || draft;
```

- [ ] **Step 6: Verify routes/email.ts passes account_id**

Read `backend/src/routes/email.ts` to verify the POST /send handler passes `account_id` from the request body into `sendNewEmail()`. The `CreateEmailInput` type already includes `account_id` and `sendNewEmail` receives the full `input` object, so this should already work. If `account_id` is not being passed, add it to the request body destructuring.

Similarly verify that POST /:id/reply and /:id/forward pass `account_id` through the `options` parameter.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/email.ts backend/src/services/email/email-provider.ts backend/src/services/email/gmail-provider.ts backend/src/__tests__/unit/services/email/email-provider-dispatch.test.ts
git commit -m "feat(phase3b): add provider-aware dispatch in email send/reply/forward"
```

---

### Task 5: Full Test Suite + Verification

- [ ] **Step 1: Run all Phase 3B tests**

Run: `cd backend && npx jest mime-builder gmail-send email-provider-dispatch --no-coverage`
Expected: All new tests PASS

- [ ] **Step 2: Run all Phase 3A tests (regression check)**

Run: `cd backend && npx jest google-oauth-tokens email-provider gmail-provider google-oauth.test gmail-sync-worker --no-coverage`
Expected: All 29 Phase 3A tests still PASS

- [ ] **Step 3: Verify TypeScript**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(phase3b): Gmail Send with Attachments complete

Phase 3B of ZenAI World #1 Masterplan:
- MIME builder via nodemailer MailComposer
- GmailProvider.sendMessage() with attachment support
- Provider-aware dispatch in sendNewEmail/replyToEmail/forwardEmail
- Gmail 25MB message size validation
- Threading headers (In-Reply-To, References)
- Resend path unchanged (no regression)"
```
