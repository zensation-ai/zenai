# Phase 3B: Gmail Send with Attachments

> **Part of:** ZenAI World #1 Masterplan — Phase 3 (Gmail + Google Calendar)
> **Sub-phase:** 3B of 3 (3A: OAuth + Gmail Read/Sync ✅, 3B: Gmail Send, 3C: Autonomous Workflows)
> **Created:** 2026-03-23
> **Depends on:** Phase 3A (GmailProvider, EmailProvider interface, OAuth tokens)

---

## Overview

Implement Gmail send capability in the existing GmailProvider. Users can compose, reply, and forward emails through their connected Gmail account — including file attachments. The existing email routes gain provider-aware dispatch so the same API endpoints work for both Gmail and Resend accounts.

## Scope

**In scope:**
- `GmailProvider.sendMessage()` implementation with MIME construction
- File attachment support (binary + base64)
- Email threading (In-Reply-To, References headers)
- Provider-aware send dispatch in email routes
- Sent email persistence in DB

**Out of scope (deferred to 3C):**
- Gmail Draft API sync (bidirectional draft management)
- Push notifications / Pub/Sub
- Autonomous email workflows
- Google Calendar API (CalDAV is sufficient)

## Architecture

### MIME Construction

Use `nodemailer`'s `MailComposer` class (not SMTP transport) to build RFC 2822 MIME messages. This handles:
- `multipart/alternative` (text/plain + text/html)
- `multipart/mixed` (when attachments present)
- Unicode subject encoding (RFC 2047)
- Content-Type boundaries
- Attachment Content-Disposition headers

### Send Flow

The existing email service (`email.ts`) funnels all sends through `sendEmailById()` which is hardcoded to Resend. We do NOT refactor `sendEmailById` — instead, we add a provider check **before** calling it. If the account is Gmail, we bypass `sendEmailById` entirely and call `GmailProvider.sendMessage()` directly. Resend accounts continue through the existing path unchanged.

```
EmailService.sendNewEmail(context, data):
  → create draft in DB (existing logic)
  → look up account → check provider field
  → if 'gmail': getEmailProvider('gmail').sendMessage(accountId, draft)
                 → update DB row: status='sent', provider_message_id, sent_at, from_address
  → if 'resend': sendEmailById() (existing path, unchanged)
  → trigger AI processing (fire-and-forget)
```

Same pattern for `replyToEmail()` and `forwardEmail()` — provider check before the send call.

### Gmail API Send

```
GmailProvider.sendMessage(accountId, draft, context):
  1. Load account + token via getGmailClient(accountId, context)
  2. Resolve "from" address: getGmailClient already loads the token internally.
     Add google_email to the returned account object by joining email_accounts
     with google_oauth_tokens on google_token_id. The email_accounts.email_address
     field (set during Phase 3A connect) contains the google_email.
  3. Build MIME message via MailComposer (from = account.email_address)
  4. Base64url-encode raw MIME bytes
  5. Call gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } })
  6. Return { messageId: response.id, threadId: response.threadId }
```

**Note:** The caller (email service) handles DB persistence of the sent email — GmailProvider only handles the API call. This keeps provider responsibilities clean: providers send, the service stores.

## EmailDraft Extension

Add optional `attachments` field to the existing `EmailDraft` interface in `email-provider.ts`:

```typescript
export interface EmailDraft {
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string;
  threadId?: string;
  attachments?: EmailAttachment[];  // NEW
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;    // Buffer for binary, string for base64
  contentType: string;
}

// Note: This is a send-time payload type, separate from the stored
// Email.attachments metadata type (which has download_url, size, etc.).
// Route layer converts incoming request data (base64 JSON strings from
// the frontend attachment UI) into EmailAttachment objects before passing
// to the provider.
```

## MIME Builder

### File: `backend/src/services/email/mime-builder.ts`

Thin wrapper around `nodemailer`'s `MailComposer`:

```typescript
buildMimeMessage(options: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType: string }>;
}): Promise<Buffer>
```

Returns raw MIME bytes ready for base64url encoding.

**Threading headers:**
- `In-Reply-To`: Set to `inReplyTo` value (Message-ID of parent)
- `References`: Ideally the full chain of Message-IDs from the thread. For Phase 3B, we set it to `inReplyTo` only. Gmail is tolerant of this and still groups messages correctly for 1-level replies. Full `References` chain construction (loading all ancestor message IDs) is deferred — acceptable limitation for 3B.

## Provider-Aware Route Dispatch

### Modified: `backend/src/routes/email.ts`

The existing send/reply/forward endpoints determine the account's provider and dispatch accordingly:

**For `POST /api/:context/emails/send` (compose & send new):**
1. Request body includes `account_id`
2. Look up account → check `provider` field
3. If `provider === 'gmail'`: use GmailProvider.sendMessage()
4. If `provider === 'resend'`: use existing resendSendEmail()
5. Store result in DB

**For `POST /api/:context/emails/:id/reply`:**
1. Load original email → get `account_id`
2. Look up account → check `provider` field
3. Dispatch to correct provider
4. Set `inReplyTo` to original email's `message_id` header
5. Set `threadId` to original email's `thread_id`

**For `POST /api/:context/emails/:id/forward`:**
1. Same provider dispatch logic
2. Prefix subject with "Fwd: " if not already present
3. Include original body as quoted content

## Database Changes

No new tables or columns needed. Sent Gmail emails are stored in the existing `emails` table with:
- `provider = 'gmail'`
- `provider_message_id` = Gmail message ID from API response
- `direction = 'outbound'`
- `status = 'sent'`
- `sent_at = NOW()`
- `from_address` = account's email_address (google_email)
- `from_name` = account's display_name
- `thread_id` = Gmail thread ID
- `message_id` = Gmail Message-ID header (for future threading)

## New Dependency

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

Only `MailComposer` is used (MIME construction). No SMTP transport configured.

**Import note:** `MailComposer` is not part of nodemailer's public API. Import via:
```typescript
import MailComposer from 'nodemailer/lib/mail-composer';
```
This is the standard pattern used by Gmail API integrations. The class is stable and has not changed between nodemailer major versions.

## Error Handling

| Error | Action |
|-------|--------|
| 401 Unauthorized | Token refresh + retry (existing logic in getGmailClient) |
| 403 Forbidden | Account auth_error state, return 403 to frontend |
| 429 Rate Limit | Exponential backoff (2s, 4s, 8s), max 3 retries |
| Invalid recipient | Return 422 with validation error |
| Attachment too large | Gmail's limit is 25MB for the total encoded MIME message. Validation in `GmailProvider.sendMessage()` after MIME construction: if `rawMessage.length > 25 * 1024 * 1024`, throw with 413 status. Per-file limit not enforced separately. |

## Frontend Changes

No frontend changes needed. The existing EmailComposer component already:
- Shows account selector (Gmail accounts now appear thanks to Phase 3A)
- Handles compose/reply/forward
- Sends to the same `POST /api/:context/emails/send` endpoint
- Supports file attachment UI

The backend now transparently routes to the correct provider.

## New Files

| File | Purpose |
|------|---------|
| `backend/src/services/email/mime-builder.ts` | MIME construction via MailComposer |
| Test files (2-3) | Unit + integration tests |

## Modified Files

| File | Change |
|------|--------|
| `backend/src/services/email/gmail-provider.ts` | Implement `sendMessage()` (replace throw) |
| `backend/src/services/email/email-provider.ts` | Add `attachments` to `EmailDraft` + `EmailAttachment` type |
| `backend/src/services/email.ts` | Provider-aware dispatch in sendNewEmail/replyToEmail/forwardEmail (before sendEmailById) |
| `backend/src/routes/email.ts` | Pass account_id through to service functions |
| `backend/package.json` | Add `nodemailer` + `@types/nodemailer` |

## Testing Strategy

### Unit Tests

- `mime-builder.test.ts` — Plain text MIME, HTML MIME, multipart with attachments, threading headers (In-Reply-To, References), unicode subject, empty body edge case
- `gmail-send.test.ts` — Mock Gmail API, test sendMessage flow (MIME build → base64url → API call → DB store), token refresh on 401, attachment size validation, from address resolution

### Integration Tests

- Send via Gmail account through email routes
- Send via Resend account still works (regression check)
- Reply to Gmail email preserves threading

### Target

~20-25 new tests, 0 regressions on existing tests.
