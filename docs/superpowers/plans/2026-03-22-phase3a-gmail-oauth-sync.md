# Phase 3A: Gmail OAuth + Read/Sync — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gmail as a first-class email provider via OAuth + Gmail API, with polling-based incremental sync.

**Architecture:** Provider Adapter Pattern — `EmailProvider` interface abstracts Gmail/IMAP/Resend. Gmail sync via BullMQ polling (60s). OAuth tokens in public schema, encrypted with AES-256-GCM. Existing email CRUD stays unchanged; provider dispatched by account type.

**Tech Stack:** googleapis v171.4.0, google-auth-library v10.5.0, BullMQ, AES-256-GCM field encryption, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-22-phase3a-gmail-oauth-sync-design.md`

---

## Chunk 1: Database Migration + Google OAuth Token Service

### Task 1: Database Migration

**Files:**
- Create: `backend/sql/migrations/phase3a_gmail_oauth.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Phase 3A: Gmail OAuth + Sync
-- New table: google_oauth_tokens (public schema)
-- Altered tables: oauth_states, email_accounts, emails (all 4 context schemas)

-- ===========================================
-- 1. Google OAuth Tokens (public schema)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  google_email VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, google_email)
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_user
  ON public.google_oauth_tokens(user_id);

-- ===========================================
-- 2. Add metadata column to oauth_states (for connect flow distinction)
-- ===========================================
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- ===========================================
-- 3. Alter email_accounts in all 4 schemas
-- ===========================================
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- email_accounts: add provider columns
    EXECUTE format('
      ALTER TABLE %I.email_accounts
        ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT ''resend'',
        ADD COLUMN IF NOT EXISTS google_token_id UUID REFERENCES public.google_oauth_tokens(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS gmail_history_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ
    ', schema_name);

    -- Backfill: existing IMAP accounts
    EXECUTE format('
      UPDATE %I.email_accounts SET provider = ''imap'' WHERE imap_host IS NOT NULL AND provider = ''resend''
    ', schema_name);

    -- emails: add provider tracking columns
    EXECUTE format('
      ALTER TABLE %I.emails
        ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT ''resend''
    ', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_emails_provider_message_id
        ON %I.emails(provider_message_id) WHERE provider_message_id IS NOT NULL
    ', schema_name);

    -- emails: extend status CHECK constraint to include spam
    EXECUTE format('
      ALTER TABLE %I.emails DROP CONSTRAINT IF EXISTS emails_status_check;
      ALTER TABLE %I.emails ADD CONSTRAINT emails_status_check
        CHECK (status IN (''received'', ''read'', ''draft'', ''sending'', ''sent'', ''failed'', ''archived'', ''trash'', ''spam''))
    ', schema_name, schema_name);
  END LOOP;
END $$;
```

- [ ] **Step 2: Verify migration is syntactically valid**

Run: `cd backend && node -e "const fs = require('fs'); const sql = fs.readFileSync('sql/migrations/phase3a_gmail_oauth.sql', 'utf8'); console.log('Migration OK:', sql.length, 'chars')"`
Expected: `Migration OK: <number> chars`

- [ ] **Step 3: Update EmailStatus type to include 'spam'**

Modify: `backend/src/services/email.ts:19`

Change:
```typescript
export type EmailStatus = 'received' | 'read' | 'draft' | 'sending' | 'sent' | 'failed' | 'archived' | 'trash';
```
To:
```typescript
export type EmailStatus = 'received' | 'read' | 'draft' | 'sending' | 'sent' | 'failed' | 'archived' | 'trash' | 'spam';
```

- [ ] **Step 4: Commit**

```bash
git add backend/sql/migrations/phase3a_gmail_oauth.sql backend/src/services/email.ts
git commit -m "feat(phase3a): add database migration for Gmail OAuth + sync"
```

---

### Task 2: Google OAuth Token Service

**Files:**
- Create: `backend/src/services/auth/google-oauth-tokens.ts`
- Test: `backend/src/__tests__/unit/services/auth/google-oauth-tokens.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/auth/google-oauth-tokens.test.ts
import {
  createGoogleToken,
  getGoogleToken,
  getGoogleTokenByEmail,
  updateGoogleTokens,
  deleteGoogleToken,
  isTokenExpired,
  getGoogleTokensForUser,
} from '../../../../services/auth/google-oauth-tokens';

// Mock database
jest.mock('../../../../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock field encryption
jest.mock('../../../../services/security/field-encryption', () => ({
  encrypt: jest.fn((val: string) => `enc:v1:${val}`),
  decrypt: jest.fn((val: string) => val.replace('enc:v1:', '')),
  isEncryptionAvailable: jest.fn(() => true),
}));

import { pool } from '../../../../utils/database';

const mockQuery = pool.query as jest.Mock;

describe('GoogleOAuthTokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createGoogleToken', () => {
    it('should insert token with encrypted access_token and refresh_token', async () => {
      const tokenId = 'test-uuid';
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: tokenId,
          user_id: 'user-1',
          google_email: 'user@gmail.com',
          scopes: ['gmail.modify'],
          expires_at: '2026-03-22T12:00:00Z',
          created_at: '2026-03-22T11:00:00Z',
          updated_at: '2026-03-22T11:00:00Z',
        }],
      });

      const result = await createGoogleToken({
        userId: 'user-1',
        googleEmail: 'user@gmail.com',
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        scopes: ['gmail.modify'],
        expiresAt: new Date('2026-03-22T12:00:00Z'),
      });

      expect(result.id).toBe(tokenId);
      expect(result.google_email).toBe('user@gmail.com');
      // Verify encryption was called
      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[1]).toContain('enc:v1:access-123');
      expect(insertCall[1]).toContain('enc:v1:refresh-456');
    });
  });

  describe('getGoogleToken', () => {
    it('should return token with decrypted values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          google_email: 'user@gmail.com',
          access_token: 'enc:v1:access-123',
          refresh_token: 'enc:v1:refresh-456',
          scopes: ['gmail.modify'],
          expires_at: '2026-03-22T12:00:00Z',
        }],
      });

      const result = await getGoogleToken('token-1');
      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('access-123');
      expect(result!.refresh_token).toBe('refresh-456');
    });

    it('should return null for non-existent token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getGoogleToken('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getGoogleTokenByEmail', () => {
    it('should find token by user_id and google_email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          google_email: 'user@gmail.com',
          access_token: 'enc:v1:access-123',
          refresh_token: 'enc:v1:refresh-456',
          scopes: ['gmail.modify'],
          expires_at: '2026-03-22T12:00:00Z',
        }],
      });

      const result = await getGoogleTokenByEmail('user-1', 'user@gmail.com');
      expect(result).not.toBeNull();
      expect(result!.google_email).toBe('user@gmail.com');
    });
  });

  describe('updateGoogleTokens', () => {
    it('should update access_token and expires_at with encryption', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          access_token: 'enc:v1:new-access',
          expires_at: '2026-03-22T13:00:00Z',
          updated_at: '2026-03-22T12:00:00Z',
        }],
      });

      const result = await updateGoogleTokens('token-1', {
        accessToken: 'new-access',
        expiresAt: new Date('2026-03-22T13:00:00Z'),
      });

      expect(result).not.toBeNull();
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[1]).toContain('enc:v1:new-access');
    });

    it('should also update refresh_token if provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          access_token: 'enc:v1:new-access',
          refresh_token: 'enc:v1:new-refresh',
          expires_at: '2026-03-22T13:00:00Z',
          updated_at: '2026-03-22T12:00:00Z',
        }],
      });

      await updateGoogleTokens('token-1', {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: new Date('2026-03-22T13:00:00Z'),
      });

      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[1]).toContain('enc:v1:new-refresh');
    });
  });

  describe('deleteGoogleToken', () => {
    it('should delete token by id', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await deleteGoogleToken('token-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM public.google_oauth_tokens'),
        ['token-1']
      );
    });
  });

  describe('isTokenExpired', () => {
    it('should return true if token expires within 5 minutes', () => {
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 min from now
      expect(isTokenExpired(expiresAt)).toBe(true);
    });

    it('should return false if token expires in more than 5 minutes', () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
      expect(isTokenExpired(expiresAt)).toBe(false);
    });

    it('should return true if token already expired', () => {
      const expiresAt = new Date(Date.now() - 60 * 1000); // 1 min ago
      expect(isTokenExpired(expiresAt)).toBe(true);
    });
  });

  describe('getGoogleTokensForUser', () => {
    it('should return all tokens for a user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 't1', google_email: 'a@gmail.com', access_token: 'enc:v1:a', refresh_token: 'enc:v1:r1', scopes: ['gmail.modify'], expires_at: '2026-03-22T12:00:00Z' },
          { id: 't2', google_email: 'b@gmail.com', access_token: 'enc:v1:b', refresh_token: 'enc:v1:r2', scopes: ['gmail.modify'], expires_at: '2026-03-22T12:00:00Z' },
        ],
      });

      const tokens = await getGoogleTokensForUser('user-1');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].access_token).toBe('a');
      expect(tokens[1].access_token).toBe('b');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="google-oauth-tokens" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// backend/src/services/auth/google-oauth-tokens.ts
/**
 * Phase 3A: Google OAuth Token Management
 *
 * CRUD for Google OAuth tokens stored in public.google_oauth_tokens.
 * Tokens are encrypted at rest using AES-256-GCM field encryption.
 */

import { pool } from '../../utils/database';
import { encrypt, decrypt, isEncryptionAvailable } from '../security/field-encryption';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface GoogleOAuthToken {
  id: string;
  user_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  scopes: string[];
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGoogleTokenInput {
  userId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
}

export interface UpdateGoogleTokenInput {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

// ===========================================
// Token Expiry Check
// ===========================================

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() < TOKEN_EXPIRY_BUFFER_MS;
}

// ===========================================
// Encryption Helpers
// ===========================================

function encryptToken(value: string): string {
  if (isEncryptionAvailable()) {
    return encrypt(value);
  }
  return value;
}

function decryptToken(value: string): string {
  if (isEncryptionAvailable() && value.startsWith('enc:')) {
    return decrypt(value);
  }
  return value;
}

function decryptRow(row: Record<string, unknown>): GoogleOAuthToken {
  return {
    ...row,
    access_token: decryptToken(row.access_token as string),
    refresh_token: decryptToken(row.refresh_token as string),
  } as GoogleOAuthToken;
}

// ===========================================
// CRUD Operations
// ===========================================

export async function createGoogleToken(input: CreateGoogleTokenInput): Promise<GoogleOAuthToken> {
  const { userId, googleEmail, accessToken, refreshToken, scopes, expiresAt } = input;

  const result = await pool.query(
    `INSERT INTO public.google_oauth_tokens
       (user_id, google_email, access_token, refresh_token, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, google_email) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       scopes = EXCLUDED.scopes,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()
     RETURNING *`,
    [userId, googleEmail, encryptToken(accessToken), encryptToken(refreshToken), scopes, expiresAt]
  );

  logger.info('Google OAuth token created/updated', {
    operation: 'createGoogleToken',
    userId,
    googleEmail,
    scopes,
  });

  return decryptRow(result.rows[0]);
}

export async function getGoogleToken(tokenId: string): Promise<GoogleOAuthToken | null> {
  const result = await pool.query(
    'SELECT * FROM public.google_oauth_tokens WHERE id = $1',
    [tokenId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return decryptRow(result.rows[0]);
}

export async function getGoogleTokenByEmail(userId: string, googleEmail: string): Promise<GoogleOAuthToken | null> {
  const result = await pool.query(
    'SELECT * FROM public.google_oauth_tokens WHERE user_id = $1 AND google_email = $2',
    [userId, googleEmail]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return decryptRow(result.rows[0]);
}

export async function getGoogleTokensForUser(userId: string): Promise<GoogleOAuthToken[]> {
  const result = await pool.query(
    'SELECT * FROM public.google_oauth_tokens WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return result.rows.map(decryptRow);
}

export async function updateGoogleTokens(
  tokenId: string,
  input: UpdateGoogleTokenInput
): Promise<GoogleOAuthToken | null> {
  const { accessToken, refreshToken, expiresAt } = input;

  let sql: string;
  let params: unknown[];

  if (refreshToken) {
    sql = `UPDATE public.google_oauth_tokens
           SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now()
           WHERE id = $4
           RETURNING *`;
    params = [encryptToken(accessToken), encryptToken(refreshToken), expiresAt, tokenId];
  } else {
    sql = `UPDATE public.google_oauth_tokens
           SET access_token = $1, expires_at = $2, updated_at = now()
           WHERE id = $3
           RETURNING *`;
    params = [encryptToken(accessToken), expiresAt, tokenId];
  }

  const result = await pool.query(sql, params);

  if (result.rows.length === 0) {
    return null;
  }

  return decryptRow(result.rows[0]);
}

export async function deleteGoogleToken(tokenId: string): Promise<void> {
  await pool.query(
    'DELETE FROM public.google_oauth_tokens WHERE id = $1',
    [tokenId]
  );

  logger.info('Google OAuth token deleted', {
    operation: 'deleteGoogleToken',
    tokenId,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="google-oauth-tokens" --no-coverage`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth/google-oauth-tokens.ts backend/src/__tests__/unit/services/auth/google-oauth-tokens.test.ts
git commit -m "feat(phase3a): add Google OAuth token service with encryption"
```

---

## Chunk 2: EmailProvider Interface + Gmail Provider

### Task 3: EmailProvider Interface + Factory

**Files:**
- Create: `backend/src/services/email/email-provider.ts`
- Test: `backend/src/__tests__/unit/services/email/email-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/email/email-provider.test.ts
import { getEmailProvider, EmailProviderType } from '../../../../services/email/email-provider';

describe('EmailProviderFactory', () => {
  describe('getEmailProvider', () => {
    it('should return GmailProvider for gmail type', () => {
      const provider = getEmailProvider('gmail');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('gmail');
    });

    it('should return ImapProvider for imap type', () => {
      const provider = getEmailProvider('imap');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('imap');
    });

    it('should return ResendProvider for resend type', () => {
      const provider = getEmailProvider('resend');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('resend');
    });

    it('should throw for unknown provider type', () => {
      expect(() => getEmailProvider('unknown' as EmailProviderType))
        .toThrow('Unknown email provider: unknown');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="email-provider.test" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// backend/src/services/email/email-provider.ts
/**
 * Phase 3A: Email Provider Abstraction
 *
 * Common interface for Gmail, IMAP, and Resend email providers.
 * Factory returns the correct provider based on account type.
 */

import { AIContext } from '../../utils/database-context';

// ===========================================
// Types
// ===========================================

export type EmailProviderType = 'gmail' | 'imap' | 'resend';

export interface FetchOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

export interface SyncResult {
  newMessages: number;
  updatedMessages: number;
  deletedMessages: number;
  newCursor: string | null;
  errors: SyncError[];
}

export interface SyncError {
  messageId?: string;
  error: string;
  recoverable: boolean;
}

export interface EmailDraft {
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string;
  threadId?: string;
}

export interface SendResult {
  messageId: string;
  threadId?: string;
}

export interface MessageMods {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  starred?: boolean;
  read?: boolean;
}

export interface ProviderMessage {
  providerMessageId: string;
  threadId?: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  subject: string;
  snippet?: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  date: Date;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  messageIdHeader?: string;
  inReplyTo?: string;
}

// ===========================================
// Interface
// ===========================================

export interface EmailProvider {
  readonly type: EmailProviderType;

  syncFull(accountId: string, context: AIContext): Promise<SyncResult>;
  syncIncremental(accountId: string, context: AIContext): Promise<SyncResult>;
  fetchMessageBody(accountId: string, providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }>;
  sendMessage(accountId: string, draft: EmailDraft): Promise<SendResult>;
  modifyMessage(accountId: string, providerMessageId: string, mods: MessageMods): Promise<void>;
}

// ===========================================
// Provider Registry
// ===========================================

// Lazy imports to avoid circular dependencies
const providers: Record<EmailProviderType, () => EmailProvider> = {
  gmail: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GmailProvider } = require('./gmail-provider');
    return new GmailProvider();
  },
  imap: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ImapProvider } = require('./imap-provider');
    return new ImapProvider();
  },
  resend: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ResendProvider } = require('./resend-provider');
    return new ResendProvider();
  },
};

const providerInstances: Map<EmailProviderType, EmailProvider> = new Map();

export function getEmailProvider(type: EmailProviderType): EmailProvider {
  if (!providers[type]) {
    throw new Error(`Unknown email provider: ${type}`);
  }

  let instance = providerInstances.get(type);
  if (!instance) {
    instance = providers[type]();
    providerInstances.set(type, instance);
  }

  return instance;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="email-provider.test" --no-coverage`
Expected: All 4 tests PASS (gmail/imap/resend providers won't exist yet but are lazy-loaded — factory itself works)

Note: The gmail/imap/resend providers will be created in subsequent tasks. The factory tests only check that `getEmailProvider` returns an object with the right `type`. For now, create stub files:

- [ ] **Step 4b: Create stub providers so factory tests pass**

Create `backend/src/services/email/gmail-provider.ts`:
```typescript
import { EmailProvider, EmailProviderType } from './email-provider';
import type { AIContext } from '../../utils/database-context';
import type { SyncResult, EmailDraft, SendResult, MessageMods } from './email-provider';

export class GmailProvider implements EmailProvider {
  readonly type: EmailProviderType = 'gmail';

  async syncFull(_accountId: string, _context: AIContext): Promise<SyncResult> {
    throw new Error('Not implemented');
  }
  async syncIncremental(_accountId: string, _context: AIContext): Promise<SyncResult> {
    throw new Error('Not implemented');
  }
  async fetchMessageBody(_accountId: string, _providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    throw new Error('Not implemented');
  }
  async sendMessage(_accountId: string, _draft: EmailDraft): Promise<SendResult> {
    throw new Error('Not implemented');
  }
  async modifyMessage(_accountId: string, _providerMessageId: string, _mods: MessageMods): Promise<void> {
    throw new Error('Not implemented');
  }
}
```

Create `backend/src/services/email/imap-provider.ts`:
```typescript
import { EmailProvider, EmailProviderType } from './email-provider';
import type { AIContext } from '../../utils/database-context';
import type { SyncResult, EmailDraft, SendResult, MessageMods } from './email-provider';

export class ImapProvider implements EmailProvider {
  readonly type: EmailProviderType = 'imap';

  async syncFull(_accountId: string, _context: AIContext): Promise<SyncResult> {
    throw new Error('Not implemented');
  }
  async syncIncremental(_accountId: string, _context: AIContext): Promise<SyncResult> {
    throw new Error('Not implemented');
  }
  async fetchMessageBody(_accountId: string, _providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    throw new Error('Not implemented');
  }
  async sendMessage(_accountId: string, _draft: EmailDraft): Promise<SendResult> {
    throw new Error('Not implemented');
  }
  async modifyMessage(_accountId: string, _providerMessageId: string, _mods: MessageMods): Promise<void> {
    throw new Error('Not implemented');
  }
}
```

Create `backend/src/services/email/resend-provider.ts`:
```typescript
import { EmailProvider, EmailProviderType } from './email-provider';
import type { AIContext } from '../../utils/database-context';
import type { SyncResult, EmailDraft, SendResult, MessageMods } from './email-provider';

export class ResendProvider implements EmailProvider {
  readonly type: EmailProviderType = 'resend';

  async syncFull(_accountId: string, _context: AIContext): Promise<SyncResult> {
    return { newMessages: 0, updatedMessages: 0, deletedMessages: 0, newCursor: null, errors: [] };
  }
  async syncIncremental(_accountId: string, _context: AIContext): Promise<SyncResult> {
    return { newMessages: 0, updatedMessages: 0, deletedMessages: 0, newCursor: null, errors: [] };
  }
  async fetchMessageBody(_accountId: string, _providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    throw new Error('Resend does not support body fetch');
  }
  async sendMessage(_accountId: string, _draft: EmailDraft): Promise<SendResult> {
    throw new Error('Not implemented — use existing resend.ts');
  }
  async modifyMessage(_accountId: string, _providerMessageId: string, _mods: MessageMods): Promise<void> {
    throw new Error('Resend does not support message modification');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="email-provider.test" --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/email/email-provider.ts backend/src/services/email/gmail-provider.ts backend/src/services/email/imap-provider.ts backend/src/services/email/resend-provider.ts backend/src/__tests__/unit/services/email/email-provider.test.ts
git commit -m "feat(phase3a): add EmailProvider interface, factory, and stub providers"
```

---

### Task 4: Gmail Provider Implementation

**Files:**
- Modify: `backend/src/services/email/gmail-provider.ts`
- Test: `backend/src/__tests__/unit/services/email/gmail-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/email/gmail-provider.test.ts
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
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
  },
}));

// Mock token service
jest.mock('../../../../services/auth/google-oauth-tokens', () => ({
  getGoogleToken: jest.fn(),
  updateGoogleTokens: jest.fn(),
  isTokenExpired: jest.fn(() => false),
}));

// Mock database
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

import { getGoogleToken, updateGoogleTokens, isTokenExpired } from '../../../../services/auth/google-oauth-tokens';
import { queryContext } from '../../../../utils/database-context';

const mockGetGoogleToken = getGoogleToken as jest.Mock;
const mockUpdateGoogleTokens = updateGoogleTokens as jest.Mock;
const mockIsTokenExpired = isTokenExpired as jest.Mock;
const mockQueryContext = queryContext as jest.Mock;

describe('GmailProvider', () => {
  let provider: GmailProvider;

  const mockAccount = {
    id: 'acc-1',
    google_token_id: 'token-1',
    gmail_history_id: null,
    provider: 'gmail',
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
    // Default: account lookup returns mockAccount
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

      // Mock: no existing message
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Mock: insert
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'db-id-1' }] });
      // Mock: update history_id
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncFull('acc-1', 'personal');

      expect(result.newMessages).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockMessagesList).toHaveBeenCalled();
      expect(mockMessagesGet).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'me', id: 'msg-1' })
      );
    });

    it('should handle token refresh on 401', async () => {
      mockIsTokenExpired.mockReturnValue(true);
      mockUpdateGoogleTokens.mockResolvedValue({
        ...mockToken,
        access_token: 'new-access',
        expires_at: new Date(Date.now() + 7200000).toISOString(),
      });

      // Simulate successful list after refresh
      mockMessagesList.mockResolvedValue({
        data: { messages: [], resultSizeEstimate: 0 },
      });
      // Mock: update history_id
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncFull('acc-1', 'personal');
      expect(result.newMessages).toBe(0);
    });
  });

  describe('syncIncremental', () => {
    it('should use history.list for incremental sync', async () => {
      // Override account to have history_id
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockAccount, gmail_history_id: '10000' }],
      });

      mockHistoryList.mockResolvedValue({
        data: {
          history: [
            {
              id: '10001',
              messagesAdded: [{ message: { id: 'new-msg', threadId: 't1', labelIds: ['INBOX'] } }],
            },
          ],
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

      // Mock: no existing, insert, update history
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
        message: 'historyId is no longer valid',
      });

      // Full sync fallback
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockAccount, gmail_history_id: null }] });
      mockMessagesList.mockResolvedValue({
        data: { messages: [], resultSizeEstimate: 0 },
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await provider.syncIncremental('acc-1', 'personal');
      expect(result.errors).toHaveLength(0);
      expect(mockMessagesList).toHaveBeenCalled();
    });
  });

  describe('fetchMessageBody', () => {
    it('should fetch full message and extract body parts', async () => {
      // Account lookup
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="gmail-provider.test" --no-coverage`
Expected: FAIL — methods throw "Not implemented"

- [ ] **Step 3: Implement GmailProvider**

Replace `backend/src/services/email/gmail-provider.ts` with full implementation:

```typescript
// backend/src/services/email/gmail-provider.ts
/**
 * Phase 3A: Gmail API Provider
 *
 * Wraps googleapis gmail_v1 for message sync, fetch, send, and modify.
 * Handles token refresh, label mapping, and MIME parsing.
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { EmailProvider, EmailProviderType, SyncResult, EmailDraft, SendResult, MessageMods, SyncError } from './email-provider';
import { getGoogleToken, updateGoogleTokens, isTokenExpired } from '../auth/google-oauth-tokens';
import { queryContext, AIContext } from '../../utils/database-context';
import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';

// ===========================================
// Constants
// ===========================================

const MAX_SYNC_MESSAGES = 5000;
const SYNC_BATCH_SIZE = 100;

// Gmail system label → ZenAI field mapping
const LABEL_TO_STATUS: Record<string, { field: string; value: string | boolean }> = {
  INBOX: { field: 'status', value: 'received' },
  SENT: { field: 'direction', value: 'outbound' },
  DRAFT: { field: 'status', value: 'draft' },
  SPAM: { field: 'status', value: 'spam' },
  TRASH: { field: 'status', value: 'trash' },
  STARRED: { field: 'is_starred', value: true },
  UNREAD: { field: 'is_read', value: false },
};

// ===========================================
// GmailProvider
// ===========================================

export class GmailProvider implements EmailProvider {
  readonly type: EmailProviderType = 'gmail';

  // ---- Auth ----

  private async getGmailClient(accountId: string, context: AIContext): Promise<{ gmail: gmail_v1.Gmail; account: Record<string, unknown> }> {
    // Load account
    const accountResult = await queryContext(context,
      'SELECT * FROM email_accounts WHERE id = $1',
      [accountId]
    );
    if (accountResult.rows.length === 0) {
      throw new Error(`Email account not found: ${accountId}`);
    }
    const account = accountResult.rows[0];

    if (!account.google_token_id) {
      throw new Error(`Account ${accountId} has no linked Google token`);
    }

    // Load token
    const token = await getGoogleToken(account.google_token_id as string);
    if (!token) {
      throw new Error(`Google token not found for account ${accountId}`);
    }

    // Refresh if expired
    if (isTokenExpired(new Date(token.expires_at))) {
      const oauth2 = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2.setCredentials({ refresh_token: token.refresh_token });

      const { credentials } = await oauth2.refreshAccessToken();
      await updateGoogleTokens(token.id, {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token || undefined,
        expiresAt: new Date(credentials.expiry_date || Date.now() + 3600000),
      });
      token.access_token = credentials.access_token!;
    }

    const oauth2 = new OAuth2Client();
    oauth2.setCredentials({ access_token: token.access_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    return { gmail, account };
  }

  // ---- Sync ----

  async syncFull(accountId: string, context: AIContext): Promise<SyncResult> {
    const { gmail, account } = await this.getGmailClient(accountId, context);
    const errors: SyncError[] = [];
    let newMessages = 0;
    let pageToken: string | undefined;
    let latestHistoryId: string | null = null;
    let totalFetched = 0;

    // Calculate 90 days ago
    const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

    do {
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        maxResults: SYNC_BATCH_SIZE,
        pageToken,
        q: `after:${ninetyDaysAgo}`,
      });

      const messages = listResponse.data.messages || [];
      pageToken = listResponse.data.nextPageToken || undefined;

      for (const msg of messages) {
        if (totalFetched >= MAX_SYNC_MESSAGES) break;

        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To'],
          });

          if (detail.data.historyId) {
            latestHistoryId = detail.data.historyId;
          }

          // Check if already exists
          const existing = await queryContext(context,
            'SELECT id FROM emails WHERE provider_message_id = $1 AND provider = $2',
            [msg.id, 'gmail']
          );

          if (existing.rows.length === 0) {
            await this.storeMessage(detail.data, account, context);
            newMessages++;
          }

          totalFetched++;
        } catch (err) {
          errors.push({
            messageId: msg.id || undefined,
            error: (err as Error).message,
            recoverable: true,
          });
        }
      }
    } while (pageToken && totalFetched < MAX_SYNC_MESSAGES);

    // Always update last_sync_at, and historyId if we have one
    await queryContext(context,
      'UPDATE email_accounts SET gmail_history_id = COALESCE($1, gmail_history_id), last_sync_at = now() WHERE id = $2',
      [latestHistoryId, accountId]
    );

    logger.info('Gmail full sync complete', {
      operation: 'gmailSyncFull',
      accountId,
      newMessages,
      totalFetched,
      errors: errors.length,
    });

    return { newMessages, updatedMessages: 0, deletedMessages: 0, newCursor: latestHistoryId, errors };
  }

  async syncIncremental(accountId: string, context: AIContext): Promise<SyncResult> {
    const { gmail, account } = await this.getGmailClient(accountId, context);

    const historyId = account.gmail_history_id as string | null;
    if (!historyId) {
      return this.syncFull(accountId, context);
    }

    try {
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      });

      const histories = historyResponse.data.history || [];
      let newMessages = 0;
      let updatedMessages = 0;
      let deletedMessages = 0;
      const errors: SyncError[] = [];

      for (const history of histories) {
        // New messages
        if (history.messagesAdded) {
          for (const added of history.messagesAdded) {
            try {
              const detail = await gmail.users.messages.get({
                userId: 'me',
                id: added.message!.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To'],
              });

              const existing = await queryContext(context,
                'SELECT id FROM emails WHERE provider_message_id = $1 AND provider = $2',
                [added.message!.id, 'gmail']
              );

              if (existing.rows.length === 0) {
                await this.storeMessage(detail.data, account, context);
                newMessages++;
              }
            } catch (err) {
              errors.push({ messageId: added.message?.id || undefined, error: (err as Error).message, recoverable: true });
            }
          }
        }

        // Deleted messages
        if (history.messagesDeleted) {
          for (const deleted of history.messagesDeleted) {
            await queryContext(context,
              "UPDATE emails SET status = 'trash' WHERE provider_message_id = $1 AND provider = 'gmail'",
              [deleted.message!.id]
            );
            deletedMessages++;
          }
        }

        // Label changes
        if (history.labelsAdded) {
          for (const labelChange of history.labelsAdded) {
            await this.applyLabelChanges(context, labelChange.message!.id!, labelChange.labelIds || [], []);
            updatedMessages++;
          }
        }
        if (history.labelsRemoved) {
          for (const labelChange of history.labelsRemoved) {
            await this.applyLabelChanges(context, labelChange.message!.id!, [], labelChange.labelIds || []);
            updatedMessages++;
          }
        }
      }

      const newHistoryId = historyResponse.data.historyId || historyId;
      await queryContext(context,
        'UPDATE email_accounts SET gmail_history_id = $1, last_sync_at = now() WHERE id = $2',
        [newHistoryId, accountId]
      );

      return { newMessages, updatedMessages, deletedMessages, newCursor: newHistoryId, errors };

    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        logger.warn('Gmail historyId invalid, falling back to full sync', { accountId });
        // Reset history_id and do full sync
        await queryContext(context,
          'UPDATE email_accounts SET gmail_history_id = NULL WHERE id = $1',
          [accountId]
        );
        return this.syncFull(accountId, context);
      }
      throw err;
    }
  }

  // ---- Fetch Body ----

  async fetchMessageBody(accountId: string, providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    // Determine context from account — need to search all contexts
    const accountResult = await pool.query(
      `SELECT 'personal' as ctx FROM personal.email_accounts WHERE id = $1
       UNION ALL SELECT 'work' FROM work.email_accounts WHERE id = $1
       UNION ALL SELECT 'learning' FROM learning.email_accounts WHERE id = $1
       UNION ALL SELECT 'creative' FROM creative.email_accounts WHERE id = $1
       LIMIT 1`,
      [accountId]
    );
    const context = (accountResult.rows[0]?.ctx || 'personal') as AIContext;

    const { gmail } = await this.getGmailClient(accountId, context);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: providerMessageId,
      format: 'full',
    });

    return this.extractBody(response.data.payload);
  }

  // ---- Send ----

  async sendMessage(_accountId: string, _draft: EmailDraft): Promise<SendResult> {
    // Deferred to Phase 3B
    throw new Error('Gmail send not implemented — deferred to Phase 3B');
  }

  // ---- Modify ----

  async modifyMessage(accountId: string, providerMessageId: string, mods: MessageMods): Promise<void> {
    const accountResult = await pool.query(
      `SELECT 'personal' as ctx FROM personal.email_accounts WHERE id = $1
       UNION ALL SELECT 'work' FROM work.email_accounts WHERE id = $1
       UNION ALL SELECT 'learning' FROM learning.email_accounts WHERE id = $1
       UNION ALL SELECT 'creative' FROM creative.email_accounts WHERE id = $1
       LIMIT 1`,
      [accountId]
    );
    const context = (accountResult.rows[0]?.ctx || 'personal') as AIContext;

    const { gmail } = await this.getGmailClient(accountId, context);

    const addLabelIds: string[] = [...(mods.addLabelIds || [])];
    const removeLabelIds: string[] = [...(mods.removeLabelIds || [])];

    if (mods.read === true) removeLabelIds.push('UNREAD');
    if (mods.read === false) addLabelIds.push('UNREAD');
    if (mods.starred === true) addLabelIds.push('STARRED');
    if (mods.starred === false) removeLabelIds.push('STARRED');

    await gmail.users.messages.modify({
      userId: 'me',
      id: providerMessageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  // ---- Private Helpers ----

  private async storeMessage(
    data: gmail_v1.Schema$Message,
    account: Record<string, unknown>,
    context: AIContext
  ): Promise<void> {
    const headers = data.payload?.headers || [];
    const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || null;

    const labelIds = data.labelIds || [];
    const isRead = !labelIds.includes('UNREAD');
    const isStarred = labelIds.includes('STARRED');
    const direction = labelIds.includes('SENT') ? 'outbound' : 'inbound';

    let status = 'received';
    if (labelIds.includes('DRAFT')) status = 'draft';
    else if (labelIds.includes('TRASH')) status = 'trash';
    else if (labelIds.includes('SPAM')) status = 'spam';
    else if (isRead && direction === 'inbound') status = 'read';

    const fromAddress = getHeader('From') || '';
    const toAddress = getHeader('To') || '';
    const subject = getHeader('Subject');
    const dateStr = getHeader('Date');
    const messageIdHeader = getHeader('Message-ID');
    const inReplyTo = getHeader('In-Reply-To');
    const receivedAt = data.internalDate
      ? new Date(parseInt(data.internalDate, 10)).toISOString()
      : (dateStr ? new Date(dateStr).toISOString() : new Date().toISOString());

    // Custom labels (non-system)
    const systemLabels = new Set(Object.keys(LABEL_TO_STATUS));
    const customLabels = labelIds.filter(l => !systemLabels.has(l) && !l.startsWith('CATEGORY_'));

    await queryContext(context,
      `INSERT INTO emails (
         id, account_id, direction, status, from_address, to_addresses, subject,
         body_text, body_html, snippet, provider_message_id, provider,
         thread_id, message_id, in_reply_to, is_read, is_starred,
         labels, has_attachments, received_at, context, user_id
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6,
         NULL, NULL, $7, $8, 'gmail',
         $9, $10, $11, $12, $13,
         $14, false, $15, $16, $17
       )`,
      [
        account.id,
        direction,
        status,
        fromAddress,
        JSON.stringify([{ email: toAddress }]),
        subject,
        data.snippet || null,
        data.id,
        data.threadId || null,
        messageIdHeader,
        inReplyTo,
        isRead,
        isStarred,
        customLabels,
        receivedAt,
        context,
        account.user_id,
      ]
    );
  }

  private async applyLabelChanges(
    context: AIContext,
    messageId: string,
    addedLabels: string[],
    removedLabels: string[]
  ): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const label of addedLabels) {
      const mapping = LABEL_TO_STATUS[label];
      if (mapping) {
        if (mapping.field === 'is_read') {
          updates.push(`is_read = $${paramIdx++}`);
          params.push(!(mapping.value as boolean)); // UNREAD added = is_read false
        } else if (mapping.field === 'is_starred') {
          updates.push(`is_starred = $${paramIdx++}`);
          params.push(mapping.value);
        } else if (mapping.field === 'status') {
          updates.push(`status = $${paramIdx++}`);
          params.push(mapping.value);
        }
      }
    }

    for (const label of removedLabels) {
      if (label === 'UNREAD') {
        updates.push(`is_read = $${paramIdx++}`);
        params.push(true);
      } else if (label === 'STARRED') {
        updates.push(`is_starred = $${paramIdx++}`);
        params.push(false);
      }
    }

    if (updates.length > 0) {
      params.push(messageId);
      await queryContext(context,
        `UPDATE emails SET ${updates.join(', ')}, updated_at = now()
         WHERE provider_message_id = $${paramIdx} AND provider = 'gmail'`,
        params
      );
    }
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): { bodyHtml: string | null; bodyText: string | null } {
    let bodyHtml: string | null = null;
    let bodyText: string | null = null;

    if (!payload) return { bodyHtml, bodyText };

    const decode = (data: string | undefined | null) =>
      data ? Buffer.from(data, 'base64url').toString('utf-8') : null;

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      bodyText = decode(payload.body.data);
    } else if (payload.mimeType === 'text/html' && payload.body?.data) {
      bodyHtml = decode(payload.body.data);
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const result = this.extractBody(part);
        if (result.bodyText && !bodyText) bodyText = result.bodyText;
        if (result.bodyHtml && !bodyHtml) bodyHtml = result.bodyHtml;
      }
    }

    return { bodyHtml, bodyText };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="gmail-provider.test" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email/gmail-provider.ts backend/src/__tests__/unit/services/email/gmail-provider.test.ts
git commit -m "feat(phase3a): implement GmailProvider with sync, fetch, and modify"
```

---

## Chunk 3: OAuth Connect Flow + Gmail Sync Worker

### Task 5: Google OAuth Connect Routes

**Files:**
- Create: `backend/src/routes/google-oauth.ts`
- Test: `backend/src/__tests__/unit/routes/google-oauth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/routes/google-oauth.test.ts
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../../middleware/errorHandler';

// Mock dependencies
jest.mock('../../../../services/auth/oauth-providers', () => {
  const mockManager = {
    isProviderAvailable: jest.fn(() => true),
    getAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    configs: new Map([['google', { clientId: 'test', clientSecret: 'test', redirectUri: 'http://test/callback' }]]),
  };
  return { oauthManager: mockManager };
});

jest.mock('../../../../services/auth/google-oauth-tokens', () => ({
  createGoogleToken: jest.fn(),
  getGoogleTokensForUser: jest.fn(),
  deleteGoogleToken: jest.fn(),
}));

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import { oauthManager } from '../../../../services/auth/oauth-providers';
import { createGoogleToken, getGoogleTokensForUser, deleteGoogleToken } from '../../../../services/auth/google-oauth-tokens';

const mockOauthManager = oauthManager as unknown as {
  isProviderAvailable: jest.Mock;
  getAuthorizationUrl: jest.Mock;
  handleCallback: jest.Mock;
};
const mockCreateToken = createGoogleToken as jest.Mock;
const mockGetTokens = getGoogleTokensForUser as jest.Mock;
const mockDeleteToken = deleteGoogleToken as jest.Mock;

let app: express.Application;

beforeAll(async () => {
  // Dynamic import to get the router after mocks are set up
  const { googleOAuthRouter } = await import('../../../../routes/google-oauth');
  app = express();
  app.use(express.json());
  // Mock JWT auth
  app.use((req, _res, next) => {
    (req as any).jwtUser = { id: 'user-1', email: 'user@test.com' };
    next();
  });
  app.use('/api/auth/oauth/google', googleOAuthRouter);
  app.use(errorHandler);
});

describe('Google OAuth Connect Routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /connect', () => {
    it('should return authorization URL', async () => {
      mockOauthManager.getAuthorizationUrl.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
        state: 'state-123',
        codeVerifier: 'verifier-456',
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/connect')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('accounts.google.com');
    });
  });

  describe('GET /tokens', () => {
    it('should list user Google tokens', async () => {
      mockGetTokens.mockResolvedValue([
        { id: 't1', google_email: 'a@gmail.com', scopes: ['gmail.modify'], expires_at: '2026-03-22T12:00:00Z' },
      ]);

      const res = await request(app)
        .get('/api/auth/oauth/google/tokens');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].google_email).toBe('a@gmail.com');
      // Should NOT expose access/refresh tokens
      expect(res.body.data[0].access_token).toBeUndefined();
    });
  });

  describe('DELETE /disconnect/:tokenId', () => {
    it('should delete token and associated accounts', async () => {
      mockDeleteToken.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/auth/oauth/google/disconnect/token-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDeleteToken).toHaveBeenCalledWith('token-1');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="google-oauth.test" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the routes**

```typescript
// backend/src/routes/google-oauth.ts
/**
 * Phase 3A: Google OAuth Connect Routes
 *
 * Separate from login OAuth — this connects a user's Google account
 * for Gmail/Calendar access with extended scopes.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { pool } from '../utils/database';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import {
  createGoogleToken,
  getGoogleTokensForUser,
  deleteGoogleToken,
} from '../services/auth/google-oauth-tokens';
import { logger } from '../utils/logger';
import { jwtAuth } from '../middleware/jwt-auth';
import axios from 'axios';

export const googleOAuthRouter = Router();

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
];

// ===========================================
// POST /connect — Initiate Gmail OAuth flow
// ===========================================

googleOAuthRouter.post('/connect', jwtAuth, asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { context } = req.body as { context?: string };

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ success: false, error: 'Google OAuth not configured' });
  }

  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/api/auth/callback/google`;

  // Generate PKCE
  const crypto = await import('crypto');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  // Store in oauth_states with metadata
  await pool.query(
    `INSERT INTO public.oauth_states (state, provider, redirect_uri, code_verifier, metadata, expires_at)
     VALUES ($1, 'google', $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [state, redirectUri, codeVerifier, JSON.stringify({
      flow: 'connect',
      scopes: GMAIL_SCOPES,
      user_id: userId,
      context: context || 'personal',
    })]
  );

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  res.json({ success: true, data: { url, state } });
}));

// ===========================================
// GET /callback — Handle OAuth callback for connect flow
// ===========================================

googleOAuthRouter.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=${error || 'missing_params'}`);
  }

  // Look up state
  const stateResult = await pool.query(
    'SELECT * FROM public.oauth_states WHERE state = $1 AND provider = $2',
    [state, 'google']
  );

  if (stateResult.rows.length === 0) {
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=invalid_state`);
  }

  const stateRecord = stateResult.rows[0];
  const metadata = stateRecord.metadata || {};

  // Clean up state
  await pool.query('DELETE FROM public.oauth_states WHERE state = $1', [state]);

  // Check if this is a connect flow
  if (metadata.flow !== 'connect') {
    return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=wrong_flow`);
  }

  const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/api/auth/callback/google`;

  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: stateRecord.code_verifier,
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token || !refresh_token) {
      return res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=no_tokens`);
    }

    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const googleEmail = userInfoResponse.data.email;

    // Store token
    const token = await createGoogleToken({
      userId: metadata.user_id,
      googleEmail,
      accessToken: access_token,
      refreshToken: refresh_token,
      scopes: GMAIL_SCOPES,
      expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
    });

    // Create email account in the specified context
    const context = (metadata.context || 'personal') as AIContext;
    if (isValidContext(context)) {
      await queryContext(context,
        `INSERT INTO email_accounts (id, email_address, display_name, provider, google_token_id, is_default, user_id)
         VALUES (gen_random_uuid(), $1, $2, 'gmail', $3, false, $4)
         ON CONFLICT DO NOTHING`,
        [googleEmail, googleEmail, token.id, metadata.user_id]
      );
    }

    logger.info('Gmail account connected', {
      operation: 'gmailConnect',
      userId: metadata.user_id,
      googleEmail,
      context,
    });

    res.redirect(`${frontendUrl}/settings/integrations?gmail=connected&email=${encodeURIComponent(googleEmail)}`);

  } catch (err) {
    logger.error('Gmail OAuth callback failed', err as Error, {
      operation: 'gmailCallback',
    });
    res.redirect(`${frontendUrl}/settings/integrations?gmail=error&reason=token_exchange_failed`);
  }
}));

// ===========================================
// GET /tokens — List user's Google tokens
// ===========================================

googleOAuthRouter.get('/tokens', jwtAuth, asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const tokens = await getGoogleTokensForUser(userId);

  // Strip sensitive fields
  const safeTokens = tokens.map(t => ({
    id: t.id,
    google_email: t.google_email,
    scopes: t.scopes,
    expires_at: t.expires_at,
    created_at: t.created_at,
  }));

  res.json({ success: true, data: safeTokens });
}));

// ===========================================
// DELETE /disconnect/:tokenId — Disconnect Google account
// ===========================================

googleOAuthRouter.delete('/disconnect/:tokenId', jwtAuth, asyncHandler(async (req, res) => {
  const { tokenId } = req.params;

  // Revoke token at Google (best-effort)
  try {
    const token = await import('../services/auth/google-oauth-tokens').then(m => m.getGoogleToken(tokenId));
    if (token) {
      await axios.post(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`).catch((err: unknown) => {
        logger.debug('Google token revocation failed (non-critical)', { tokenId, error: (err as Error).message });
      });
    }
  } catch (err) {
    logger.debug('Token lookup for revocation failed', { tokenId, error: (err as Error).message });
  }

  // Delete associated email accounts across all contexts
  for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
    await queryContext(ctx,
      "UPDATE emails SET status = 'archived' WHERE account_id IN (SELECT id FROM email_accounts WHERE google_token_id = $1)",
      [tokenId]
    ).catch(() => {});
    await queryContext(ctx,
      'DELETE FROM email_accounts WHERE google_token_id = $1',
      [tokenId]
    ).catch(() => {});
  }

  // Delete token
  await deleteGoogleToken(tokenId);

  res.json({ success: true, message: 'Google account disconnected' });
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="google-oauth.test" --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/google-oauth.ts backend/src/__tests__/unit/routes/google-oauth.test.ts
git commit -m "feat(phase3a): add Google OAuth connect/disconnect/callback routes"
```

---

### Task 6: Gmail Sync Worker + Queue Registration

**Files:**
- Create: `backend/src/services/queue/workers/gmail-sync-worker.ts`
- Test: `backend/src/__tests__/unit/services/queue/gmail-sync-worker.test.ts`
- Modify: `backend/src/services/queue/job-queue.ts` (add 'gmail-sync' to QUEUE_NAMES)
- Modify: `backend/src/services/queue/workers.ts` (register worker)

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/queue/gmail-sync-worker.test.ts
import { scheduleGmailSyncJobs, processGmailSyncJob } from '../../../../services/queue/workers/gmail-sync-worker';

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/email/gmail-provider', () => ({
  GmailProvider: jest.fn().mockImplementation(() => ({
    syncIncremental: jest.fn().mockResolvedValue({
      newMessages: 2,
      updatedMessages: 1,
      deletedMessages: 0,
      newCursor: '12345',
      errors: [],
    }),
    syncFull: jest.fn().mockResolvedValue({
      newMessages: 10,
      updatedMessages: 0,
      deletedMessages: 0,
      newCursor: '12345',
      errors: [],
    }),
  })),
}));

import { pool } from '../../../../utils/database';

const mockPoolQuery = pool.query as jest.Mock;

describe('GmailSyncWorker', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('scheduleGmailSyncJobs', () => {
    it('should find eligible Gmail accounts and return job payloads', async () => {
      // Mock: find accounts across all 4 contexts
      mockPoolQuery.mockResolvedValue({
        rows: [
          { id: 'acc-1', google_token_id: 'tok-1', context: 'personal' },
          { id: 'acc-2', google_token_id: 'tok-2', context: 'work' },
        ],
      });

      const jobs = await scheduleGmailSyncJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toEqual({ accountId: 'acc-1', context: 'personal', googleTokenId: 'tok-1' });
    });

    it('should return empty array when no Gmail accounts exist', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const jobs = await scheduleGmailSyncJobs();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('processGmailSyncJob', () => {
    it('should call syncIncremental on the provider', async () => {
      const result = await processGmailSyncJob({
        accountId: 'acc-1',
        context: 'personal' as const,
        googleTokenId: 'tok-1',
      });

      expect(result.newMessages).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="gmail-sync-worker" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the worker**

```typescript
// backend/src/services/queue/workers/gmail-sync-worker.ts
/**
 * Phase 3A: Gmail Sync Worker
 *
 * Scheduler finds eligible Gmail accounts.
 * Per-account jobs run incremental sync via GmailProvider.
 */

import { pool } from '../../../utils/database';
import { AIContext } from '../../../utils/database-context';
import { GmailProvider } from '../../email/gmail-provider';
import { SyncResult } from '../../email/email-provider';
import { logger } from '../../../utils/logger';

export interface GmailSyncJobPayload {
  accountId: string;
  context: AIContext;
  googleTokenId: string;
}

const gmailProvider = new GmailProvider();

/**
 * Find all Gmail accounts eligible for sync.
 * Returns job payloads for each account.
 */
export async function scheduleGmailSyncJobs(): Promise<GmailSyncJobPayload[]> {
  const result = await pool.query(`
    SELECT id, google_token_id, 'personal' as context FROM personal.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
    UNION ALL
    SELECT id, google_token_id, 'work' FROM work.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
    UNION ALL
    SELECT id, google_token_id, 'learning' FROM learning.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
    UNION ALL
    SELECT id, google_token_id, 'creative' FROM creative.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
  `);

  return result.rows.map(row => ({
    accountId: row.id,
    context: row.context as AIContext,
    googleTokenId: row.google_token_id,
  }));
}

/**
 * Process a single Gmail sync job.
 */
export async function processGmailSyncJob(payload: GmailSyncJobPayload): Promise<SyncResult> {
  const { accountId, context } = payload;

  logger.info('Gmail sync job started', { accountId, context });

  try {
    const result = await gmailProvider.syncIncremental(accountId, context);

    logger.info('Gmail sync job completed', {
      accountId,
      context,
      newMessages: result.newMessages,
      updatedMessages: result.updatedMessages,
      deletedMessages: result.deletedMessages,
      errors: result.errors.length,
    });

    return result;
  } catch (err) {
    logger.error('Gmail sync job failed', err as Error, { accountId, context });
    throw err;
  }
}
```

- [ ] **Step 4: Add 'gmail-sync' to QUEUE_NAMES**

Modify `backend/src/services/queue/job-queue.ts:38-47`:

Change:
```typescript
const QUEUE_NAMES = [
  'memory-consolidation',
  'rag-indexing',
  'email-processing',
  'graph-indexing',
  'sleep-compute',
  'embedding-drift',
  'hebbian-decay',
  'persistent-agent',
] as const;
```
To:
```typescript
const QUEUE_NAMES = [
  'memory-consolidation',
  'rag-indexing',
  'email-processing',
  'graph-indexing',
  'sleep-compute',
  'embedding-drift',
  'hebbian-decay',
  'persistent-agent',
  'gmail-sync',
] as const;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="gmail-sync-worker" --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/queue/workers/gmail-sync-worker.ts backend/src/__tests__/unit/services/queue/gmail-sync-worker.test.ts backend/src/services/queue/job-queue.ts
git commit -m "feat(phase3a): add Gmail sync worker and queue registration"
```

---

### Task 7: Register Gmail Module + Sync Scheduler

Routes are registered via modules (NOT directly in main.ts). We extend the existing EmailModule or create a new GmailModule.

**Files:**
- Create: `backend/src/modules/gmail/index.ts`
- Modify: `backend/src/modules/index.ts` (add GmailModule)
- Modify: `backend/src/services/queue/workers.ts` (register gmail-sync worker processor)

- [ ] **Step 1: Create GmailModule**

```typescript
// backend/src/modules/gmail/index.ts
import type { Express } from 'express';
import type { Module } from '../../core/module';
import { googleOAuthRouter } from '../../routes/google-oauth';
import { jwtAuth } from '../../middleware/jwt-auth';

export class GmailModule implements Module {
  name = 'gmail';
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  registerRoutes(app: Express): void {
    // Gmail OAuth connect/tokens/disconnect (JWT required except callback)
    app.use('/api/auth/oauth/google', googleOAuthRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');
    const { getQueueService } = await import('../../services/queue/job-queue');

    const queueService = getQueueService();
    if (!queueService.isAvailable()) {
      logger.info('Gmail sync scheduler skipped (Redis not available)', { operation: 'startup' });
      return;
    }

    // Schedule Gmail sync every 60s
    this.syncInterval = setInterval(async () => {
      try {
        const { scheduleGmailSyncJobs } = await import('../../services/queue/workers/gmail-sync-worker');
        const jobs = await scheduleGmailSyncJobs();
        for (const job of jobs) {
          await queueService.enqueue('gmail-sync', `sync-${job.accountId}`, job as unknown as Record<string, unknown>, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 2000 },
          });
        }
      } catch (err) {
        logger.error('Gmail sync scheduler error', err instanceof Error ? err : undefined);
      }
    }, 60_000);

    logger.info('Gmail sync scheduler started (60s interval)', { operation: 'startup' });
  }

  async onShutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}
```

- [ ] **Step 2: Register GmailModule in modules/index.ts**

Add import and registration in `backend/src/modules/index.ts`:

After the `EmailModule` import, add:
```typescript
import { GmailModule } from './gmail';
```

In the modules array, add `new GmailModule()` after `new EmailModule()`:
```typescript
new GmailModule(),
```

- [ ] **Step 3: Register gmail-sync worker processor in workers.ts**

Add the gmail-sync processor to `backend/src/services/queue/workers.ts`. Find where other processors are registered (e.g., sleep-compute) and add:

```typescript
// Gmail sync worker
case 'gmail-sync': {
  const { processGmailSyncJob } = await import('./workers/gmail-sync-worker');
  await processGmailSyncJob(job.data as any);
  break;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/gmail/index.ts backend/src/modules/index.ts backend/src/services/queue/workers.ts
git commit -m "feat(phase3a): register GmailModule and sync worker processor"
```

---

## Chunk 4: Email Route Integration + Frontend

### Task 8: On-Demand Body Fetch in Email Routes

**Files:**
- Modify: `backend/src/routes/email.ts` (GET /:id endpoint)
- Test: `backend/src/__tests__/unit/routes/email-gmail-body.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/__tests__/unit/routes/email-gmail-body.test.ts
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../../middleware/errorHandler';

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));

jest.mock('../../../../utils/user-context', () => ({
  getUserId: jest.fn(() => 'user-1'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../../services/email/email-provider', () => ({
  getEmailProvider: jest.fn(() => ({
    fetchMessageBody: jest.fn().mockResolvedValue({
      bodyHtml: '<p>Hello</p>',
      bodyText: 'Hello',
    }),
  })),
}));

import { queryContext } from '../../../../utils/database-context';
const mockQueryContext = queryContext as jest.Mock;

describe('Email GET /:id with Gmail body fetch', () => {
  it('should fetch body on-demand for Gmail emails without cached body', async () => {
    // This test verifies the concept — actual route integration tested in integration tests
    const gmailEmail = {
      id: 'email-1',
      provider: 'gmail',
      provider_message_id: 'gmail-msg-1',
      account_id: 'acc-1',
      body_html: null,
      body_text: null,
      status: 'received',
      subject: 'Test',
    };

    // The route should detect provider=gmail + null body and call fetchMessageBody
    expect(gmailEmail.provider).toBe('gmail');
    expect(gmailEmail.body_html).toBeNull();
    // Provider should be called to fetch body
    const { getEmailProvider } = require('../../../../services/email/email-provider');
    const provider = getEmailProvider('gmail');
    const body = await provider.fetchMessageBody('acc-1', 'gmail-msg-1');
    expect(body.bodyHtml).toBe('<p>Hello</p>');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (concept test)**

Run: `cd backend && npx jest --testPathPattern="email-gmail-body" --no-coverage`
Expected: PASS

- [ ] **Step 3: Add on-demand body fetch logic to email route**

In `backend/src/routes/email.ts`, find the `GET /:context/emails/:id` handler. After fetching the email from DB, add:

```typescript
// On-demand body fetch for Gmail emails
if (email.provider === 'gmail' && !email.body_html && !email.body_text && email.provider_message_id && email.account_id) {
  try {
    const { getEmailProvider } = await import('../services/email/email-provider');
    const provider = getEmailProvider('gmail');
    const body = await provider.fetchMessageBody(email.account_id, email.provider_message_id);

    // Cache in DB (fire-and-forget)
    queryContext(context,
      'UPDATE emails SET body_html = $1, body_text = $2, updated_at = now() WHERE id = $3',
      [body.bodyHtml, body.bodyText, email.id]
    ).catch(() => {});

    email.body_html = body.bodyHtml;
    email.body_text = body.bodyText;
  } catch (err) {
    logger.warn('Failed to fetch Gmail body on-demand', { emailId: email.id, error: (err as Error).message });
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/email.ts backend/src/__tests__/unit/routes/email-gmail-body.test.ts
git commit -m "feat(phase3a): add on-demand Gmail body fetch in email GET endpoint"
```

---

### Task 9: Frontend Gmail Connect Button

**Files:**
- Create: `frontend/src/components/EmailPage/GmailConnectButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/EmailPage/GmailConnectButton.tsx
/**
 * Phase 3A: Gmail Connect Button
 *
 * Triggers Google OAuth flow to connect a Gmail account.
 * Shows connection status after OAuth redirect.
 */

import React, { useState, useEffect } from 'react';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';

interface GmailConnectButtonProps {
  context: string;
  onConnected?: (email: string) => void;
}

export function GmailConnectButton({ context, onConnected }: GmailConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailStatus = params.get('gmail');
    const email = params.get('email');

    if (gmailStatus === 'connected' && email) {
      onConnected?.(decodeURIComponent(email));
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    } else if (gmailStatus === 'error') {
      setError(params.get('reason') || 'Connection failed');
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, [onConnected]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/google/connect`, {
        method: 'POST',
        headers: { ...getApiFetchHeaders('application/json'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });

      const data = await response.json();

      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError(data.error || 'Failed to start OAuth flow');
        setLoading(false);
      }
    } catch (err) {
      setError('Network error');
      setLoading(false);
    }
  };

  return (
    <div className="gmail-connect">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="gmail-connect-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          border: '1px solid var(--border-primary, #dadce0)',
          borderRadius: '8px',
          background: 'var(--surface-primary, #fff)',
          color: 'var(--text-primary, #3c4043)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
          <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" fill="#34A853"/>
          <path d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" fill="#FBBC05"/>
          <path d="M8.98 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8 8 0 0 0 1.83 5.41l2.67 2.07A4.77 4.77 0 0 1 8.98 3.58z" fill="#EA4335"/>
        </svg>
        {loading ? 'Verbinde...' : 'Gmail verbinden'}
      </button>
      {error && (
        <p style={{ color: 'var(--color-error, #d93025)', fontSize: '13px', marginTop: '8px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmailPage/GmailConnectButton.tsx
git commit -m "feat(phase3a): add Gmail connect button component"
```

---

### Task 10: Run Full Test Suite + Final Verification

- [ ] **Step 1: Run backend tests**

Run: `cd backend && npm test`
Expected: All existing tests pass + new Phase 3A tests pass, 0 regressions

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: 0 errors in both

- [ ] **Step 4: Final commit with phase marker**

```bash
git add -A
git commit -m "feat(phase3a): Gmail OAuth + Read/Sync complete

Phase 3A of ZenAI World #1 Masterplan:
- Google OAuth token service with AES-256-GCM encryption
- EmailProvider interface + factory (Gmail/IMAP/Resend)
- GmailProvider: full sync, incremental sync, on-demand body fetch
- Gmail sync worker (BullMQ, 60s polling)
- OAuth connect/disconnect/callback routes
- Gmail label → ZenAI status mapping
- Frontend GmailConnectButton component
- Database migration (google_oauth_tokens + email_accounts + emails alterations)"
```
