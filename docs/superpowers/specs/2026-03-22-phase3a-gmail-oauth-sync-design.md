# Phase 3A: OAuth Scope Extension + Gmail Read/Sync

> **Part of:** ZenAI World #1 Masterplan — Phase 3 (Gmail + Google Calendar)
> **Sub-phase:** 3A of 3 (3A: OAuth + Gmail Read/Sync, 3B: Gmail Send + Google Calendar, 3C: Autonomous Workflows)
> **Created:** 2026-03-22

---

## Overview

Add Gmail as a first-class email provider in ZenAI. Users connect their Google account via OAuth, and ZenAI syncs their Gmail inbox using the Gmail API. Gmail coexists alongside the existing IMAP and Resend providers — the user chooses which method to use per account.

## Architecture: Provider Adapter Pattern

A new `EmailProvider` interface abstracts Gmail API, IMAP, and Resend behind a common contract. The existing `email.ts` service calls the appropriate provider based on account type. This follows the existing `BusinessConnector` interface pattern in the codebase.

```
EmailService → EmailProviderFactory → GmailProvider | ImapProvider | ResendProvider
```

### EmailProvider Interface

```typescript
interface EmailProvider {
  fetchMessages(accountId: string, options: FetchOptions): Promise<Email[]>;
  sendMessage(accountId: string, draft: EmailDraft): Promise<SendResult>;
  modifyMessage(accountId: string, messageId: string, mods: MessageMods): Promise<void>;
  syncIncremental(accountId: string): Promise<SyncResult>;  // provider reads its own cursor from DB
  syncFull(accountId: string): Promise<SyncResult>;
}

interface FetchOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

interface SyncResult {
  newMessages: number;
  updatedMessages: number;
  deletedMessages: number;
  newHistoryId: string;
  errors: SyncError[];
}

interface MessageMods {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  starred?: boolean;
  read?: boolean;
}
```

## OAuth Scope Extension

### Current State

`OAuthProviderManager` in `backend/src/services/auth/oauth-providers.ts` supports Google OAuth 2.1 with PKCE. Current scopes: `openid, email, profile` (login only).

### Changes

Extend Google OAuth to support a separate "connect" flow with Gmail + Calendar scopes. The login flow remains unchanged.

**New scopes (requested during Gmail connect):**
- `https://www.googleapis.com/auth/gmail.modify` — read, send, modify (not permanent delete)
- `https://www.googleapis.com/auth/calendar` — reserved for Phase 3B, requested now to avoid re-consent

**New endpoint:** `POST /api/auth/oauth/google/connect`
- Initiates OAuth flow with extended scopes
- Separate from `/api/auth/oauth/google` (login flow)
- Requires authenticated user (JWT)
- Returns authorization URL for frontend redirect
- Reuses `OAuthProviderManager.getAuthorizationUrl()` internally with custom scopes
- PKCE state stored in existing `oauth_states` table (same CSRF protection as login flow)

**Callback:** `GET /api/auth/oauth/google/connect/callback`
- Exchanges code for tokens via `OAuthProviderManager.exchangeCode()`
- Stores tokens in `google_oauth_tokens` table
- Creates `email_accounts` row with `provider: 'gmail'`
- Redirects to `${FRONTEND_URL}/settings/integrations?gmail=connected`

**Redirect URI strategy:** The connect callback uses the same `GOOGLE_REDIRECT_URI` env var as login. In the Google Cloud Console, register a single redirect URI: `${API_URL}/api/auth/oauth/google/callback`. The backend callback handler inspects the `oauth_states.metadata` field to distinguish login vs. connect flows and routes accordingly. This avoids needing a second registered redirect URI.

**oauth_states metadata extension:**
```typescript
// When initiating connect flow, store flow type in metadata
await insertOAuthState({
  state,
  code_verifier,
  provider: 'google',
  metadata: { flow: 'connect', scopes: [...], user_id: req.jwtUser.id }
});
```

### Token Storage

New `google_oauth_tokens` table in **public** schema (not per-context, as one Google account may be used across contexts).

```sql
CREATE TABLE public.google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  google_email VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,        -- AES-256-GCM encrypted
  refresh_token TEXT NOT NULL,       -- AES-256-GCM encrypted
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, google_email)
);

CREATE INDEX idx_google_oauth_tokens_user ON public.google_oauth_tokens(user_id);
```

### Token Refresh

GmailProvider checks `expires_at` before every API call. If token expires within 5 minutes, refresh proactively using `google-auth-library`. On 401 response, refresh once and retry. On second 401, mark account as `status: 'auth_error'`.

## Gmail Provider

### File: `backend/src/services/email/gmail-provider.ts`

Wraps `google.gmail('v1')` from the `googleapis` package (already installed v171.4.0).

**Responsibilities:**
- Authenticate with OAuth tokens from `google_oauth_tokens`
- Fetch message list and individual messages
- Send emails via Gmail API
- Modify labels, read/unread, star
- Map Gmail labels to ZenAI email_labels

### Label Mapping

Gmail uses labels instead of folders. System labels are mapped to existing fields:

| Gmail Label | ZenAI Field | Notes |
|-------------|-------------|-------|
| INBOX | `status: 'received'` | Maps to existing valid status |
| SENT | `direction: 'outbound'` | |
| DRAFT | `status: 'draft'` | |
| SPAM | `status: 'spam'` | **New status — migration adds to CHECK constraint** |
| TRASH | `status: 'trash'` | Already valid |
| STARRED | `is_starred: true` | |
| UNREAD | `is_read: false` | |
| Custom labels | `email_labels` rows | |

**CHECK constraint migration:** The existing `emails.status` CHECK constraint only allows `received, read, draft, sending, sent, failed, archived, trash`. The migration must add `spam` as a valid status value. `INBOX` maps to `received` (no constraint change needed).

## Gmail Sync Engine

### File: `backend/src/services/email/gmail-sync.ts`

Orchestrates full and incremental sync for Gmail accounts.

### Full Sync (Initial)

1. Call `messages.list` with pagination (batch of 100)
2. For each message: fetch headers + snippet via `messages.get(format: 'metadata')`
3. Store in `emails` table with `provider_message_id` = Gmail message ID
4. Store Gmail `historyId` as sync cursor in `email_accounts.gmail_history_id`
5. Limit: last 90 days or 5000 messages (whichever is less)
6. Full message body loaded lazily on first open (not during sync)

### Incremental Sync (Polling)

1. Call `history.list(startHistoryId)` — returns only changes since last sync
2. Process history records:
   - `messagesAdded` → fetch and store new messages
   - `messagesDeleted` → soft-delete in DB
   - `labelsAdded` / `labelsRemoved` → update labels/status
3. Update `gmail_history_id` and `last_sync_at`

### Polling Schedule

BullMQ job queue `gmail-sync` (new queue, added to existing QUEUE_NAMES).

**Job scheduling:** At startup, `main.ts` registers a repeating BullMQ job `gmail-sync-scheduler` with a 60-second repeat interval. This scheduler job queries the DB for eligible accounts (`provider = 'gmail'`, `status = 'active'`, `last_sync_at < now() - 55s`) and enqueues one `gmail-sync-account` job per account. Each account job carries `{ accountId, context, googleTokenId }` as payload.

**Worker concurrency:** 3 (process up to 3 account sync jobs simultaneously).

**Dedup:** Jobs are keyed by `accountId` to prevent duplicate syncs for the same account.

### On-Demand Body Fetch

Gmail messages are synced with headers + snippet only. The full body is fetched lazily when the user opens the email. This happens transparently inside the existing `GET /api/:context/emails/:id` endpoint — no separate `/body` endpoint needed.

**Logic in `GET /api/:context/emails/:id`:**
1. Load email from DB
2. If `provider = 'gmail'` AND `body_text IS NULL` AND `body_html IS NULL`:
   a. Call `messages.get(format: 'full')` via GmailProvider
   b. Parse MIME parts (text/plain, text/html)
   c. Store body in `emails.body_text` / `emails.body_html` (fire-and-forget DB write)
   d. Return full email with body to frontend
3. Otherwise: return email as-is (body already cached or non-Gmail)

### Error Handling

| Error | Action |
|-------|--------|
| 401 Unauthorized | Refresh token, retry once. On second 401: mark `status: 'auth_error'` |
| 403 Forbidden | User revoked access. Mark `status: 'auth_error'` |
| 404 History ID invalid | Trigger full re-sync |
| 429 Rate Limit | Exponential backoff (2s, 4s, 8s), max 3 retries |
| 500+ Server Error | Skip cycle, retry next poll |

## Database Changes

### New Table (public schema)

`google_oauth_tokens` — see OAuth section above.

### Altered Tables (per-context schemas, applied to all 4: personal, work, learning, creative)

**email_accounts:**
```sql
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS google_token_id UUID REFERENCES public.google_oauth_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gmail_history_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Backfill: existing IMAP accounts get correct provider value
UPDATE email_accounts SET provider = 'imap' WHERE imap_host IS NOT NULL AND provider = 'resend';
```

**emails — new columns + CHECK constraint update:**
```sql
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'resend';

CREATE INDEX IF NOT EXISTS idx_emails_provider_message_id
  ON emails(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Extend status CHECK constraint to include 'spam' for Gmail
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_status_check;
ALTER TABLE emails ADD CONSTRAINT emails_status_check
  CHECK (status IN ('received', 'read', 'draft', 'sending', 'sent', 'failed', 'archived', 'trash', 'spam'));
```

**Note:** The status constraint name may vary per schema. The migration must query `information_schema.table_constraints` to find the actual constraint name if it differs.

## Route Changes

### New Endpoints

```
POST /api/auth/oauth/google/connect          -- Initiate Gmail OAuth (returns auth URL, requires JWT)
GET  /api/auth/oauth/google/callback         -- Shared callback (login + connect, distinguished by oauth_states.metadata)
DELETE /api/auth/oauth/google/disconnect/:tokenId  -- Revoke Google token, delete email_accounts + token row
```

### Modified Endpoints

```
GET /api/:context/emails/accounts  -- Now returns `provider` field
GET /api/:context/emails           -- Unchanged (provider-transparent)
GET /api/:context/emails/:id       -- Loads body on-demand if Gmail + body not cached
```

### Disconnect Behavior

`DELETE /api/auth/oauth/google/disconnect/:tokenId`:
1. Revoke token at Google (call `https://oauth2.googleapis.com/revoke`)
2. Delete all `email_accounts` rows referencing this `google_token_id` (explicit DELETE, not relying on FK cascade)
3. Delete the `google_oauth_tokens` row
4. Soft-delete synced Gmail emails (set `status: 'archived'`) — preserves data, user can re-connect later

## Frontend Changes

### Email Settings / Account Panel

- New "Connect Gmail" button (Google branded, OAuth redirect)
- Account card shows provider icon (Gmail / IMAP / Resend)
- Sync status indicator (last synced, syncing, auth error)
- "Reconnect" button for `auth_error` state
- "Disconnect" button removes Google token + account

### Inbox

- Gmail labels rendered as colored chips (reuse existing label display)
- Account filter dropdown includes Gmail accounts
- No other UI changes — Gmail emails appear in same list

### New Components

- `GmailConnectButton.tsx` — Branded OAuth trigger button

### OAuth Callback Handling

The backend callback redirects to `${FRONTEND_URL}/settings/integrations?gmail=connected` (or `?gmail=error&reason=...`). The existing `SettingsDashboard` Integrations tab reads the query parameter and shows a success/error toast. No new route or page needed — this is a query-parameter-driven notification on an existing page.

## Testing Strategy

### Unit Tests (TDD — written before implementation)

- `gmail-provider.test.ts` — Mock `googleapis`, test fetch/send/modify, token refresh, error handling
- `gmail-sync.test.ts` — Mock provider, test full sync pagination, incremental sync, label mapping, dedup
- `email-provider.test.ts` — Factory returns correct provider by account type
- `google-oauth-tokens.test.ts` — Token CRUD, encryption/decryption, expiry check

### Integration Tests

- OAuth connect flow end-to-end (mock Google endpoints)
- Email list with mixed providers (Gmail + IMAP)
- Sync worker scheduling and execution
- Token refresh on expiry
- Account disconnect and cleanup

### Regression

- Existing email tests pass unchanged
- Existing IMAP sync unaffected
- Existing Resend send path unaffected

### Target

~80-100 new tests, 0 regressions on existing 9228 tests.

## New Files

| File | Purpose |
|------|---------|
| `backend/src/services/email/email-provider.ts` | EmailProvider interface + factory |
| `backend/src/services/email/gmail-provider.ts` | Gmail API wrapper |
| `backend/src/services/email/gmail-sync.ts` | Full + incremental sync orchestrator |
| `backend/src/services/email/imap-provider.ts` | Wraps existing IMAP logic into EmailProvider |
| `backend/src/services/auth/google-oauth-tokens.ts` | Token CRUD + encryption |
| `backend/src/routes/google-oauth.ts` | Connect/disconnect/callback endpoints |
| `backend/sql/migrations/phase3a_gmail_oauth.sql` | Migration for new table + alterations |
| `frontend/src/components/EmailPage/GmailConnectButton.tsx` | OAuth trigger button |
| Test files (4-6) | Unit + integration tests |

## Modified Files

| File | Change |
|------|--------|
| `backend/src/services/email.ts` | Use EmailProviderFactory, add provider-aware dispatch |
| `backend/src/services/auth/oauth-providers.ts` | Add connect flow with extended scopes |
| `backend/src/routes/auth.ts` | Add connect flow dispatch in existing callback, route to google-oauth for connect endpoints |
| `backend/src/routes/email.ts` | On-demand body fetch in GET /:id, return provider in accounts |
| `backend/src/services/queue/job-queue.ts` | Add 'gmail-sync' queue to QUEUE_NAMES |
| `backend/src/services/queue/workers.ts` | Add gmail-sync worker processor |
| `backend/src/main.ts` | Register google-oauth router, start gmail-sync worker |
| `frontend/src/components/EmailPage/` | Gmail connect button, provider icons, sync status |

## Non-Goals (deferred to 3B/3C)

- Gmail send/compose (3B)
- Google Calendar API (3B)
- Push notifications / Pub/Sub (3C)
- Autonomous email workflows (3C)
- Gmail attachment handling beyond metadata (3B)
- Google Drive integration (future)
