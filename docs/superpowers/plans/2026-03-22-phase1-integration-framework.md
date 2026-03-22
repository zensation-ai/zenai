# Phase 1: Integration Framework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the generic connector infrastructure that Gmail/Calendar (Phase 3), Slack (Phase 5), and all future integrations plug into.

**Architecture:** 4 layers — ConnectorInterface (abstract contract), OAuthTokenStore (encrypted token persistence with auto-refresh), IntegrationRegistry (connector discovery + user installation), WebhookRouter (inbound event normalization). All in `public` schema. Uses existing encryption, queue, and event system.

**Tech Stack:** Express.js, PostgreSQL (public schema, `queryPublic()`), BullMQ, AES-256-GCM encryption, Jest

**Codebase Patterns (MUST follow):**
- DB queries on public schema: `import { queryPublic } from '../utils/database-context'` (NOT `pool.query`)
- Async route handlers: `import { asyncHandler } from '../middleware/errorHandler'`
- User ID extraction: `import { getUserId } from '../utils/user-context'` (NOT `req.jwtUser!.id`)
- Auth middleware: `import { jwtAuth } from '../middleware/jwt-auth'`
- Logging: `import { logger } from '../utils/logger'`

**Deferred to Phase 3:** `scheduled-sync` repeatable per-user job (needs a real connector to test). OAuth connect/callback endpoints (need real provider to test end-to-end)

**Spec:** `docs/superpowers/specs/2026-03-22-phase1-integration-framework-design.md`

---

## File Structure

```
backend/src/services/integrations/
  types.ts                              # All interfaces + types + constants
  oauth-token-store.ts                  # OAuthTokenStore class
  integration-registry.ts               # IntegrationRegistry class
  webhook-router.ts                     # WebhookRouter class
  mock-connector.ts                     # MockConnector for testing
  index.ts                              # Re-exports

backend/src/routes/
  integration-framework.ts              # REST API (8 endpoints + webhook)

backend/src/modules/integrations/
  index.ts                              # IntegrationsModule

backend/src/services/queue/workers/
  token-refresh-worker.ts               # BullMQ token refresh processor

backend/src/__tests__/unit/services/integrations/
  oauth-token-store.test.ts
  integration-registry.test.ts
  webhook-router.test.ts
  token-refresh-worker.test.ts

backend/src/__tests__/unit/routes/
  integration-framework.test.ts

backend/sql/migrations/
  phase1_integration_framework.sql
```

**Modified files:**
- `backend/src/services/auth/oauth-providers.ts` — add `refreshAccessToken()` method
- `backend/src/services/queue/job-queue.ts` — add `'integration-sync'` to QUEUE_NAMES
- `backend/src/services/queue/workers.ts` — register token refresh processor
- `backend/src/modules/index.ts` — add IntegrationsModule

**NOTE:** `event-system.ts` does NOT need modification — `emitSystemEvent` already accepts arbitrary `eventType` strings. We use `'integration.webhook_received'` etc. as convention, not as compile-time types.

---

## Chunk 1: Types + DB Migration + OAuth Extension

### Task 1: Types File

**Files:**
- Create: `backend/src/services/integrations/types.ts`

- [ ] **Step 1: Create types file with all interfaces**

```typescript
// backend/src/services/integrations/types.ts

export type IntegrationCategory = 'email' | 'calendar' | 'messaging' | 'storage' | 'crm' | 'dev';
export type AIContext = 'personal' | 'work' | 'learning' | 'creative';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export const SYNC_INTERVAL_MIN = 5;
export const SYNC_INTERVAL_MAX = 1440;
export const SYNC_INTERVAL_DEFAULT = 15;

export interface ConnectorDefinition {
  id: string;
  name: string;
  provider: string;
  category: IntegrationCategory;
  capabilities: string[];
  requiredScopes: string[];
  webhookSupported: boolean;
  syncSupported: boolean;
  defaultContext: AIContext;
  icon?: string;
  description?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface SyncOptions {
  fullSync?: boolean;
  since?: Date;
  targetContext?: AIContext;
}

export interface SyncResult {
  itemsSynced: number;
  errors: number;
  nextSyncToken?: string;
  duration: number;
}

export interface HealthStatus {
  connected: boolean;
  lastSync?: Date;
  error?: string;
  tokenValid: boolean;
  tokenExpiresAt?: Date;
}

export interface RawWebhookEvent {
  headers: Record<string, string>;
  body: Buffer | Record<string, unknown>;  // Buffer if express.raw(), parsed JSON if express.json()
}

export interface IntegrationEvent {
  id: string;
  connectorId: string;
  userId: string;
  type: string;
  targetContext: AIContext;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface IntegrationConfig {
  targetContext: AIContext;
  syncEnabled: boolean;
  syncIntervalMinutes?: number;
}

export interface UserIntegration {
  connectorId: string;
  definition: ConnectorDefinition;
  status: IntegrationStatus;
  config: IntegrationConfig;
  lastSyncAt?: Date;
  error?: string;
}

export interface Connector {
  definition: ConnectorDefinition;
  connect(userId: string, tokens: OAuthTokens): Promise<void>;
  disconnect(userId: string): Promise<void>;
  sync(userId: string, options: SyncOptions): Promise<SyncResult>;
  health(userId: string): Promise<HealthStatus>;
  handleWebhook?(event: RawWebhookEvent): Promise<IntegrationEvent | null>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from types.ts

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/integrations/types.ts
git commit -m "feat(integrations): add type definitions for integration framework"
```

---

### Task 2: Database Migration

**Files:**
- Create: `backend/sql/migrations/phase1_integration_framework.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Phase 1: Integration Framework Foundation
-- Tables in public schema (tokens are user-level, not context-level)

-- OAuth tokens (encrypted at rest)
CREATE TABLE IF NOT EXISTS public.integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  connector_id VARCHAR(100) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(20) DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_tokens_user
  ON public.integration_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_expires
  ON public.integration_tokens(expires_at)
  WHERE expires_at IS NOT NULL;

-- User integration installations
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connector_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error', 'syncing')),
  config JSONB DEFAULT '{"syncEnabled": true}',
  target_context VARCHAR(20) DEFAULT 'work'
    CHECK (target_context IN ('personal', 'work', 'learning', 'creative')),
  last_sync_at TIMESTAMPTZ,
  last_sync_result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user
  ON public.user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_status
  ON public.user_integrations(status);

-- Webhook audit log
CREATE TABLE IF NOT EXISTS public.integration_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id VARCHAR(100) NOT NULL,
  user_id UUID,
  event_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  payload_hash VARCHAR(64),
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_connector
  ON public.integration_webhook_log(connector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_log_hash
  ON public.integration_webhook_log(payload_hash);
```

- [ ] **Step 2: Commit**

```bash
git add backend/sql/migrations/phase1_integration_framework.sql
git commit -m "feat(integrations): add database migration for integration framework"
```

---

### Task 3: Extend oauth-providers.ts with refreshAccessToken

**Files:**
- Modify: `backend/src/services/auth/oauth-providers.ts`
- Test: `backend/src/__tests__/unit/services/integrations/oauth-refresh.test.ts`

- [ ] **Step 1: Write failing test for refreshAccessToken**

```typescript
// backend/src/__tests__/unit/services/integrations/oauth-refresh.test.ts

// Mock fetch before importing
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { oauthManager } from '../../../services/auth/oauth-providers';

describe('OAuthProviderManager.refreshAccessToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh a Google access token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    const result = await oauthManager.refreshAccessToken('google', 'old-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.expiresIn).toBe(3600);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  });

  it('should throw OAuthError on refresh failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    await expect(
      oauthManager.refreshAccessToken('google', 'expired-refresh-token'),
    ).rejects.toThrow('Token refresh failed');
  });

  it('should throw for unknown provider', async () => {
    await expect(
      oauthManager.refreshAccessToken('unknown-provider', 'token'),
    ).rejects.toThrow('Unknown provider');
  });

  it('should handle rotated refresh tokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    });

    const result = await oauthManager.refreshAccessToken('google', 'old-refresh');

    expect(result.accessToken).toBe('new-access');
    expect(result.refreshToken).toBe('new-refresh');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern="oauth-refresh" --no-coverage 2>&1 | tail -5`
Expected: FAIL — `refreshAccessToken is not a function`

- [ ] **Step 3: Implement refreshAccessToken in oauth-providers.ts**

Add to the `OAuthProviderManager` class:

```typescript
async refreshAccessToken(
  provider: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const providerUrls = PROVIDER_URLS[provider];
  if (!providerUrls) {
    throw new OAuthError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER', 400);
  }

  const config = this.configs.get(provider);
  if (!config) {
    throw new OAuthError(`Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED', 400);
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(providerUrls.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new OAuthError(
      `Token refresh failed: ${(errorData as Record<string, string>).error || response.status}`,
      'TOKEN_REFRESH_FAILED',
      response.status,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern="oauth-refresh" --no-coverage 2>&1 | tail -5`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth/oauth-providers.ts backend/src/__tests__/unit/services/integrations/oauth-refresh.test.ts
git commit -m "feat(integrations): add refreshAccessToken to OAuthProviderManager"
```

---

### Task 4: Extend job-queue.ts with integration-sync queue

**Files:**
- Modify: `backend/src/services/queue/job-queue.ts`

- [ ] **Step 1: Add 'integration-sync' to QUEUE_NAMES array**

In `job-queue.ts`, find the `QUEUE_NAMES` array and add `'integration-sync'`:

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
  'integration-sync',
] as const;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/queue/job-queue.ts
git commit -m "feat(integrations): add integration-sync queue to BullMQ"
```

---

## Chunk 2: OAuthTokenStore

### Task 5: OAuthTokenStore Implementation

**Files:**
- Create: `backend/src/services/integrations/oauth-token-store.ts`
- Test: `backend/src/__tests__/unit/services/integrations/oauth-token-store.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/integrations/oauth-token-store.test.ts

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: any[]) => mockQueryPublic(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../../services/security/field-encryption', () => ({
  encrypt: (val: string) => `enc:${val}`,
  decrypt: (val: string) => val.replace('enc:', ''),
  isEncryptionAvailable: () => true,
}));

const mockRefreshAccessToken = jest.fn();
jest.mock('../../../../services/auth/oauth-providers', () => ({
  oauthManager: {
    refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
  },
}));

import { OAuthTokenStore } from '../../../../services/integrations/oauth-token-store';

describe('OAuthTokenStore', () => {
  let store: OAuthTokenStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    store = new OAuthTokenStore();
  });

  describe('storeTokens', () => {
    it('should encrypt and store tokens', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'tok-1' }] });

      await store.storeTokens('user-1', 'gmail', 'google', {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        tokenType: 'Bearer',
        expiresAt: new Date('2026-04-01'),
        scopes: ['gmail.readonly'],
      });

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('INSERT INTO public.integration_tokens');
      expect(params[2]).toBe('google');
      // Tokens should be encrypted
      expect(params[3]).toBe('enc:access-123');
      expect(params[4]).toBe('enc:refresh-456');
    });
  });

  describe('getValidToken', () => {
    it('should return decrypted tokens when not expired', async () => {
      const futureDate = new Date(Date.now() + 3600_000);
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          access_token: 'enc:access-123',
          refresh_token: 'enc:refresh-456',
          token_type: 'Bearer',
          expires_at: futureDate,
          scopes: ['gmail.readonly'],
          provider: 'google',
        }],
      });

      const result = await store.getValidToken('user-1', 'gmail');

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('access-123');
      expect(result!.refreshToken).toBe('refresh-456');
    });

    it('should auto-refresh when expiring within 5 minutes', async () => {
      const soonDate = new Date(Date.now() + 2 * 60_000); // 2 min from now
      mockQueryPublic
        .mockResolvedValueOnce({
          rows: [{
            access_token: 'enc:old-access',
            refresh_token: 'enc:refresh-tok',
            token_type: 'Bearer',
            expires_at: soonDate,
            scopes: ['gmail.readonly'],
            provider: 'google',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'tok-1' }] }); // UPDATE

      mockRefreshAccessToken.mockResolvedValueOnce({
        accessToken: 'new-access',
        expiresIn: 3600,
      });

      const result = await store.getValidToken('user-1', 'gmail');

      expect(result!.accessToken).toBe('new-access');
      expect(mockRefreshAccessToken).toHaveBeenCalledWith('google', 'refresh-tok');
    });

    it('should return null when no tokens exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await store.getValidToken('user-1', 'gmail');

      expect(result).toBeNull();
    });
  });

  describe('revokeTokens', () => {
    it('should delete tokens from database', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await store.revokeTokens('user-1', 'gmail');

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('DELETE FROM public.integration_tokens');
    });
  });

  describe('hasTokens', () => {
    it('should return true when tokens exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await store.hasTokens('user-1', 'gmail');

      expect(result).toBe(true);
    });

    it('should return false when no tokens', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await store.hasTokens('user-1', 'gmail');

      expect(result).toBe(false);
    });
  });

  describe('findExpiringTokens', () => {
    it('should find tokens expiring within N minutes', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', connector_id: 'gmail', provider: 'google' },
          { user_id: 'u2', connector_id: 'outlook', provider: 'microsoft' },
        ],
      });

      const result = await store.findExpiringTokens(5);

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('u1');
      const [sql] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain("make_interval(mins => $1)");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="oauth-token-store" --no-coverage 2>&1 | tail -5`
Expected: FAIL — Cannot find module

- [ ] **Step 3: Implement OAuthTokenStore**

```typescript
// backend/src/services/integrations/oauth-token-store.ts

import { queryPublic } from '../../utils/database-context';
import { encrypt, decrypt, isEncryptionAvailable } from '../security/field-encryption';
import { oauthManager } from '../auth/oauth-providers';
import { logger } from '../../utils/logger';
import type { OAuthTokens } from './types';

const REFRESH_THRESHOLD_MINUTES = 5;

export class OAuthTokenStore {
  async storeTokens(
    userId: string,
    connectorId: string,
    provider: string,
    tokens: OAuthTokens,
  ): Promise<void> {
    // Uses queryPublic() for public schema queries
    const accessTokenEnc = isEncryptionAvailable() ? encrypt(tokens.accessToken) : tokens.accessToken;
    const refreshTokenEnc = tokens.refreshToken && isEncryptionAvailable()
      ? encrypt(tokens.refreshToken)
      : tokens.refreshToken || null;

    await queryPublic(
      `INSERT INTO public.integration_tokens
         (user_id, connector_id, provider, access_token, refresh_token, token_type, expires_at, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, connector_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_type = EXCLUDED.token_type,
         expires_at = EXCLUDED.expires_at,
         scopes = EXCLUDED.scopes,
         updated_at = NOW()`,
      [
        userId, connectorId, provider,
        accessTokenEnc, refreshTokenEnc,
        tokens.tokenType, tokens.expiresAt || null,
        tokens.scopes,
      ],
    );
  }

  async getValidToken(userId: string, connectorId: string): Promise<OAuthTokens | null> {
    // Uses queryPublic() for public schema queries
    const result = await queryPublic(
      `SELECT access_token, refresh_token, token_type, expires_at, scopes, provider
       FROM public.integration_tokens
       WHERE user_id = $1 AND connector_id = $2`,
      [userId, connectorId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const needsRefresh = expiresAt
      && expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MINUTES * 60_000;

    if (needsRefresh && row.refresh_token) {
      return this.refreshToken(userId, connectorId, row.provider, decrypt(row.refresh_token));
    }

    return {
      accessToken: decrypt(row.access_token),
      refreshToken: row.refresh_token ? decrypt(row.refresh_token) : undefined,
      tokenType: row.token_type,
      expiresAt: expiresAt || undefined,
      scopes: row.scopes || [],
    };
  }

  async revokeTokens(userId: string, connectorId: string): Promise<void> {
    // Uses queryPublic() for public schema queries
    await queryPublic(
      `DELETE FROM public.integration_tokens WHERE user_id = $1 AND connector_id = $2`,
      [userId, connectorId],
    );
  }

  async hasTokens(userId: string, connectorId: string): Promise<boolean> {
    // Uses queryPublic() for public schema queries
    const result = await queryPublic(
      `SELECT COUNT(*) as count FROM public.integration_tokens WHERE user_id = $1 AND connector_id = $2`,
      [userId, connectorId],
    );
    return parseInt(result.rows[0].count, 10) > 0;
  }

  async findExpiringTokens(withinMinutes: number): Promise<Array<{
    userId: string;
    connectorId: string;
    provider: string;
  }>> {
    // Uses queryPublic() for public schema queries
    const result = await queryPublic(
      `SELECT user_id, connector_id, provider
       FROM public.integration_tokens
       WHERE refresh_token IS NOT NULL
         AND expires_at IS NOT NULL
         AND expires_at < NOW() + make_interval(mins => $1)
         AND expires_at > NOW()`,
      [withinMinutes],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      userId: r.user_id as string,
      connectorId: r.connector_id as string,
      provider: r.provider as string,
    }));
  }

  private async refreshToken(
    userId: string,
    connectorId: string,
    provider: string,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const refreshed = await oauthManager.refreshAccessToken(provider, refreshToken);

    const newExpiresAt = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : undefined;

    const tokens: OAuthTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      tokenType: 'Bearer',
      expiresAt: newExpiresAt,
      scopes: [],
    };

    await this.storeTokens(userId, connectorId, provider, tokens);

    return tokens;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="oauth-token-store" --no-coverage 2>&1 | tail -5`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/oauth-token-store.ts backend/src/__tests__/unit/services/integrations/oauth-token-store.test.ts
git commit -m "feat(integrations): implement OAuthTokenStore with encryption and auto-refresh"
```

---

## Chunk 3: IntegrationRegistry

### Task 6: IntegrationRegistry Implementation

**Files:**
- Create: `backend/src/services/integrations/integration-registry.ts`
- Test: `backend/src/__tests__/unit/services/integrations/integration-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/integrations/integration-registry.test.ts

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: any[]) => mockQueryPublic(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

import { IntegrationRegistry } from '../../../../services/integrations/integration-registry';
import type { Connector, ConnectorDefinition } from '../../../../services/integrations/types';

function createMockConnector(overrides: Partial<ConnectorDefinition> = {}): Connector {
  return {
    definition: {
      id: 'mock',
      name: 'Mock',
      provider: 'mock',
      category: 'dev',
      capabilities: ['test.read'],
      requiredScopes: ['mock.read'],
      webhookSupported: false,
      syncSupported: true,
      defaultContext: 'personal',
      ...overrides,
    },
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue({ itemsSynced: 0, errors: 0, duration: 100 }),
    health: jest.fn().mockResolvedValue({ connected: true, tokenValid: true }),
  };
}

describe('IntegrationRegistry', () => {
  let registry: IntegrationRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    registry = new IntegrationRegistry();
  });

  describe('register / get / list', () => {
    it('should register and retrieve a connector', () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);

      expect(registry.get('gmail')).toBe(connector);
    });

    it('should list all registered connectors', () => {
      registry.register(createMockConnector({ id: 'gmail', category: 'email' }));
      registry.register(createMockConnector({ id: 'slack', category: 'messaging' }));

      const all = registry.list();
      expect(all).toHaveLength(2);
    });

    it('should filter by category', () => {
      registry.register(createMockConnector({ id: 'gmail', category: 'email' }));
      registry.register(createMockConnector({ id: 'slack', category: 'messaging' }));

      const emails = registry.list({ category: 'email' });
      expect(emails).toHaveLength(1);
      expect(emails[0].id).toBe('gmail');
    });

    it('should filter by provider', () => {
      registry.register(createMockConnector({ id: 'gmail', provider: 'google' }));
      registry.register(createMockConnector({ id: 'gcal', provider: 'google' }));
      registry.register(createMockConnector({ id: 'slack', provider: 'slack' }));

      const google = registry.list({ provider: 'google' });
      expect(google).toHaveLength(2);
    });

    it('should return undefined for unknown connector', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('install / uninstall / getForUser', () => {
    it('should install integration for user', async () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'ui-1' }] });

      await registry.install('user-1', 'gmail', { targetContext: 'work', syncEnabled: true });

      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
      const [sql] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('INSERT INTO public.user_integrations');
    });

    it('should throw for unknown connector on install', async () => {
      await expect(
        registry.install('user-1', 'nonexistent'),
      ).rejects.toThrow('Unknown connector');
    });

    it('should uninstall and call connector.disconnect', async () => {
      const connector = createMockConnector({ id: 'gmail' });
      registry.register(connector);
      mockQueryPublic.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await registry.uninstall('user-1', 'gmail');

      expect(connector.disconnect).toHaveBeenCalledWith('user-1');
      const [sql] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('DELETE FROM public.user_integrations');
    });

    it('should get user integrations with definitions', async () => {
      const connector = createMockConnector({ id: 'gmail', name: 'Gmail' });
      registry.register(connector);
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          connector_id: 'gmail',
          status: 'connected',
          config: { syncEnabled: true },
          target_context: 'work',
          last_sync_at: null,
          error_message: null,
        }],
      });

      const integrations = await registry.getForUser('user-1');

      expect(integrations).toHaveLength(1);
      expect(integrations[0].connectorId).toBe('gmail');
      expect(integrations[0].definition.name).toBe('Gmail');
      expect(integrations[0].status).toBe('connected');
    });
  });

  describe('updateConfig', () => {
    it('should update target context', async () => {
      registry.register(createMockConnector({ id: 'gmail' }));
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'ui-1' }] });

      await registry.updateConfig('user-1', 'gmail', { targetContext: 'personal' });

      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('UPDATE public.user_integrations');
      expect(params).toContain('personal');
    });

    it('should clamp syncIntervalMinutes to valid range', async () => {
      registry.register(createMockConnector({ id: 'gmail' }));
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'ui-1' }] });

      await registry.updateConfig('user-1', 'gmail', { syncIntervalMinutes: 1 });

      const [, params] = mockQueryPublic.mock.calls[0];
      // Should be clamped to SYNC_INTERVAL_MIN (5)
      const configParam = JSON.parse(params[0] as string);
      expect(configParam.syncIntervalMinutes).toBe(5);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="integration-registry" --no-coverage 2>&1 | tail -5`
Expected: FAIL — Cannot find module

- [ ] **Step 3: Implement IntegrationRegistry**

```typescript
// backend/src/services/integrations/integration-registry.ts

import { queryPublic } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { SYNC_INTERVAL_MIN, SYNC_INTERVAL_MAX } from './types';
import type {
  Connector,
  ConnectorDefinition,
  IntegrationCategory,
  IntegrationConfig,
  UserIntegration,
  HealthStatus,
} from './types';

export class IntegrationRegistry {
  private connectors: Map<string, Connector> = new Map();

  register(connector: Connector): void {
    this.connectors.set(connector.definition.id, connector);
    logger.info(`Integration registered: ${connector.definition.id}`, {
      operation: 'integration-registry',
      connector: connector.definition.id,
    });
  }

  get(connectorId: string): Connector | undefined {
    return this.connectors.get(connectorId);
  }

  list(filter?: { category?: IntegrationCategory; provider?: string }): ConnectorDefinition[] {
    let definitions = Array.from(this.connectors.values()).map((c) => c.definition);
    if (filter?.category) {
      definitions = definitions.filter((d) => d.category === filter.category);
    }
    if (filter?.provider) {
      definitions = definitions.filter((d) => d.provider === filter.provider);
    }
    return definitions;
  }

  async getForUser(userId: string): Promise<UserIntegration[]> {
    // Uses queryPublic() for public schema queries
    const result = await queryPublic(
      `SELECT connector_id, status, config, target_context, last_sync_at, error_message
       FROM public.user_integrations
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows
      .map((row: Record<string, unknown>) => {
        const connector = this.connectors.get(row.connector_id as string);
        if (!connector) return null;
        return {
          connectorId: row.connector_id as string,
          definition: connector.definition,
          status: row.status as UserIntegration['status'],
          config: {
            targetContext: row.target_context,
            ...(row.config as object || {}),
          } as IntegrationConfig,
          lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at as string) : undefined,
          error: row.error_message as string | undefined,
        };
      })
      .filter((x): x is UserIntegration => x !== null);
  }

  async install(
    userId: string,
    connectorId: string,
    config?: Partial<IntegrationConfig>,
  ): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Unknown connector: ${connectorId}`);
    }

    // Uses queryPublic() for public schema queries
    const targetContext = config?.targetContext || connector.definition.defaultContext;
    const syncEnabled = config?.syncEnabled ?? true;

    await queryPublic(
      `INSERT INTO public.user_integrations
         (user_id, connector_id, status, config, target_context)
       VALUES ($1, $2, 'connected', $3, $4)
       ON CONFLICT (user_id, connector_id)
       DO UPDATE SET status = 'connected', config = $3, target_context = $4, updated_at = NOW()`,
      [userId, connectorId, JSON.stringify({ syncEnabled }), targetContext],
    );
  }

  async uninstall(userId: string, connectorId: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      await connector.disconnect(userId);
    }

    // Uses queryPublic() for public schema queries
    await queryPublic(
      `DELETE FROM public.user_integrations WHERE user_id = $1 AND connector_id = $2`,
      [userId, connectorId],
    );
  }

  async updateConfig(
    userId: string,
    connectorId: string,
    config: Partial<IntegrationConfig>,
  ): Promise<void> {
    // Uses queryPublic() for public schema queries
    const safeConfig = { ...config };

    // Clamp sync interval
    if (safeConfig.syncIntervalMinutes !== undefined) {
      safeConfig.syncIntervalMinutes = Math.max(5, Math.min(1440, safeConfig.syncIntervalMinutes));
    }

    const targetContext = safeConfig.targetContext;
    delete safeConfig.targetContext;

    if (targetContext) {
      await queryPublic(
        `UPDATE public.user_integrations
         SET config = $1::jsonb, target_context = $2, updated_at = NOW()
         WHERE user_id = $3 AND connector_id = $4`,
        [JSON.stringify(safeConfig), targetContext, userId, connectorId],
      );
    } else {
      await queryPublic(
        `UPDATE public.user_integrations
         SET config = config || $1::jsonb, updated_at = NOW()
         WHERE user_id = $2 AND connector_id = $3`,
        [JSON.stringify(safeConfig), userId, connectorId],
      );
    }
  }

  async health(userId: string, connectorId: string): Promise<HealthStatus> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      return { connected: false, tokenValid: false, error: 'Unknown connector' };
    }
    return connector.health(userId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="integration-registry" --no-coverage 2>&1 | tail -5`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/integration-registry.ts backend/src/__tests__/unit/services/integrations/integration-registry.test.ts
git commit -m "feat(integrations): implement IntegrationRegistry with user installation tracking"
```

---

## Chunk 4: WebhookRouter + MockConnector

### Task 7: WebhookRouter Implementation

**Files:**
- Create: `backend/src/services/integrations/webhook-router.ts`
- Test: `backend/src/__tests__/unit/services/integrations/webhook-router.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/integrations/webhook-router.test.ts

import crypto from 'crypto';

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: any[]) => mockQueryPublic(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

const mockEmitSystemEvent = jest.fn().mockResolvedValue('evt-1');
jest.mock('../../../../services/event-system', () => ({
  emitSystemEvent: (...args: unknown[]) => mockEmitSystemEvent(...args),
}));

import { WebhookRouter } from '../../../../services/integrations/webhook-router';
import type { Connector, IntegrationEvent, RawWebhookEvent } from '../../../../services/integrations/types';

describe('WebhookRouter', () => {
  let router: WebhookRouter;
  let mockConnector: Connector;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    router = new WebhookRouter();

    mockConnector = {
      definition: {
        id: 'gmail',
        name: 'Gmail',
        provider: 'google',
        category: 'email',
        capabilities: ['email.read'],
        requiredScopes: [],
        webhookSupported: true,
        syncSupported: false,
        defaultContext: 'work',
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      sync: jest.fn(),
      health: jest.fn(),
      handleWebhook: jest.fn(),
    };
  });

  describe('register / route', () => {
    it('should route webhook to correct connector', async () => {
      const event: IntegrationEvent = {
        id: 'evt-1',
        connectorId: 'gmail',
        userId: 'user-1',
        type: 'email.received',
        targetContext: 'work',
        payload: { subject: 'Test' },
        timestamp: new Date(),
      };
      (mockConnector.handleWebhook as jest.Mock).mockResolvedValueOnce(event);
      // No duplicate hash found
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [] })  // dedup check
        .mockResolvedValueOnce({ rows: [{ id: 'log-1' }] }); // log insert

      router.register('gmail', mockConnector);

      const rawEvent: RawWebhookEvent = {
        headers: { 'x-google-signature': 'abc' },
        body: Buffer.from(JSON.stringify({ data: 'test' })),
      };

      const result = await router.route('gmail', rawEvent);

      expect(result).toEqual(event);
      expect(mockConnector.handleWebhook).toHaveBeenCalledWith(rawEvent);
      expect(mockEmitSystemEvent).toHaveBeenCalled();
    });

    it('should return null for unknown connector', async () => {
      const rawEvent: RawWebhookEvent = {
        headers: {},
        body: Buffer.from('{}'),
      };

      const result = await router.route('unknown', rawEvent);

      expect(result).toBeNull();
    });

    it('should return null for connector without webhook handler', async () => {
      const noWebhookConnector = { ...mockConnector, handleWebhook: undefined };
      router.register('no-webhook', noWebhookConnector);

      const result = await router.route('no-webhook', {
        headers: {},
        body: Buffer.from('{}'),
      });

      expect(result).toBeNull();
    });

    it('should deduplicate webhooks by payload hash', async () => {
      router.register('gmail', mockConnector);

      // Duplicate found
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'existing-log' }],
      });

      const result = await router.route('gmail', {
        headers: {},
        body: Buffer.from('{"same": "payload"}'),
      });

      expect(result).toBeNull();
      expect(mockConnector.handleWebhook).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="webhook-router" --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Implement WebhookRouter**

```typescript
// backend/src/services/integrations/webhook-router.ts

import crypto from 'crypto';
import { queryPublic } from '../../utils/database-context';
import { emitSystemEvent } from '../event-system';
import { logger } from '../../utils/logger';
import type { Connector, RawWebhookEvent, IntegrationEvent } from './types';

const DEDUP_WINDOW_MINUTES = 5;

export class WebhookRouter {
  private handlers: Map<string, Connector> = new Map();

  register(connectorId: string, connector: Connector): void {
    this.handlers.set(connectorId, connector);
  }

  async route(connectorId: string, rawEvent: RawWebhookEvent): Promise<IntegrationEvent | null> {
    const connector = this.handlers.get(connectorId);
    if (!connector || !connector.handleWebhook) {
      logger.warn('Webhook received for unknown or non-webhook connector', {
        operation: 'webhook-router',
        connectorId,
      });
      return null;
    }

    const startTime = Date.now();
    const bodyBytes = Buffer.isBuffer(rawEvent.body)
      ? rawEvent.body
      : Buffer.from(JSON.stringify(rawEvent.body));
    const payloadHash = crypto
      .createHash('sha256')
      .update(bodyBytes)
      .digest('hex');

    // Dedup check
    // Uses queryPublic() for public schema queries
    const dupCheck = await queryPublic(
      `SELECT id FROM public.integration_webhook_log
       WHERE payload_hash = $1
         AND created_at > NOW() - make_interval(mins => $2)
       LIMIT 1`,
      [payloadHash, DEDUP_WINDOW_MINUTES],
    );

    if (dupCheck.rows.length > 0) {
      logger.debug('Duplicate webhook ignored', {
        operation: 'webhook-router',
        connectorId,
        payloadHash,
      });
      return null;
    }

    let event: IntegrationEvent | null = null;
    let status = 'processed';
    let errorMessage: string | null = null;

    try {
      event = await connector.handleWebhook(rawEvent);

      if (!event) {
        status = 'ignored';
      }
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Webhook processing failed', {
        operation: 'webhook-router',
        connectorId,
        error: errorMessage,
      });
    }

    const processingTime = Date.now() - startTime;

    // Log webhook
    await queryPublic(
      `INSERT INTO public.integration_webhook_log
         (connector_id, user_id, event_type, status, payload_hash, error_message, processing_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        connectorId,
        event?.userId || null,
        event?.type || null,
        status,
        payloadHash,
        errorMessage,
        processingTime,
      ],
    );

    // Emit to event system for proactive engine
    if (event) {
      await emitSystemEvent({
        context: event.targetContext,
        eventType: `integration.${event.type}`,
        eventSource: connectorId,
        payload: event.payload,
      });
    }

    return event;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="webhook-router" --no-coverage 2>&1 | tail -5`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/webhook-router.ts backend/src/__tests__/unit/services/integrations/webhook-router.test.ts
git commit -m "feat(integrations): implement WebhookRouter with dedup and event emission"
```

---

### Task 8: MockConnector + Module Exports

**Files:**
- Create: `backend/src/services/integrations/mock-connector.ts`
- Create: `backend/src/services/integrations/index.ts`

- [ ] **Step 1: Create MockConnector**

```typescript
// backend/src/services/integrations/mock-connector.ts

import type {
  Connector,
  ConnectorDefinition,
  OAuthTokens,
  SyncOptions,
  SyncResult,
  HealthStatus,
  RawWebhookEvent,
  IntegrationEvent,
} from './types';

export class MockConnector implements Connector {
  definition: ConnectorDefinition = {
    id: 'mock',
    name: 'Mock Integration',
    provider: 'mock',
    category: 'dev',
    capabilities: ['test.read', 'test.write'],
    requiredScopes: ['mock.read'],
    webhookSupported: true,
    syncSupported: true,
    defaultContext: 'personal',
    description: 'A mock connector for testing the integration framework',
  };

  private connected = new Set<string>();

  async connect(userId: string): Promise<void> {
    this.connected.add(userId);
  }

  async disconnect(userId: string): Promise<void> {
    this.connected.delete(userId);
  }

  async sync(_userId: string, _options: SyncOptions): Promise<SyncResult> {
    return {
      itemsSynced: 5,
      errors: 0,
      nextSyncToken: 'mock-sync-token-1',
      duration: 150,
    };
  }

  async health(userId: string): Promise<HealthStatus> {
    return {
      connected: this.connected.has(userId),
      tokenValid: true,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async handleWebhook(event: RawWebhookEvent): Promise<IntegrationEvent | null> {
    const body = JSON.parse(event.body.toString()) as Record<string, unknown>;
    if (!body.userId) return null;

    return {
      id: `mock-evt-${Date.now()}`,
      connectorId: 'mock',
      userId: body.userId as string,
      type: 'test.event',
      targetContext: 'personal',
      payload: body,
      timestamp: new Date(),
    };
  }
}
```

- [ ] **Step 2: Create index.ts barrel export**

```typescript
// backend/src/services/integrations/index.ts

export { OAuthTokenStore } from './oauth-token-store';
export { IntegrationRegistry } from './integration-registry';
export { WebhookRouter } from './webhook-router';
export { MockConnector } from './mock-connector';
export type {
  Connector,
  ConnectorDefinition,
  OAuthTokens,
  SyncOptions,
  SyncResult,
  HealthStatus,
  RawWebhookEvent,
  IntegrationEvent,
  IntegrationConfig,
  UserIntegration,
  IntegrationCategory,
  IntegrationStatus,
  AIContext,
} from './types';
export {
  SYNC_INTERVAL_MIN,
  SYNC_INTERVAL_MAX,
  SYNC_INTERVAL_DEFAULT,
} from './types';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/integrations/mock-connector.ts backend/src/services/integrations/index.ts
git commit -m "feat(integrations): add MockConnector and barrel exports"
```

---

## Chunk 5: Token Refresh Worker + REST API + Module

### Task 9: Token Refresh Worker

**Files:**
- Create: `backend/src/services/queue/workers/token-refresh-worker.ts`
- Test: `backend/src/__tests__/unit/services/integrations/token-refresh-worker.test.ts`
- Modify: `backend/src/services/queue/workers.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/unit/services/integrations/token-refresh-worker.test.ts

const mockFindExpiringTokens = jest.fn();
const mockRefreshToken = jest.fn();
jest.mock('../../../../services/integrations/oauth-token-store', () => ({
  OAuthTokenStore: jest.fn().mockImplementation(() => ({
    findExpiringTokens: mockFindExpiringTokens,
    getValidToken: mockRefreshToken,
  })),
}));

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: any[]) => mockQueryPublic(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

import { processTokenRefresh } from '../../../../services/queue/workers/token-refresh-worker';

describe('Token Refresh Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh expiring tokens', async () => {
    mockFindExpiringTokens.mockResolvedValueOnce([
      { userId: 'u1', connectorId: 'gmail', provider: 'google' },
    ]);
    mockRefreshToken.mockResolvedValueOnce({
      accessToken: 'new-token',
      tokenType: 'Bearer',
      scopes: [],
    });

    const mockJob = {
      data: {},
      updateProgress: jest.fn(),
    };

    const result = await processTokenRefresh(mockJob as any);

    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('should handle refresh failures gracefully', async () => {
    mockFindExpiringTokens.mockResolvedValueOnce([
      { userId: 'u1', connectorId: 'gmail', provider: 'google' },
    ]);
    mockRefreshToken.mockRejectedValueOnce(new Error('invalid_grant'));
    mockQueryPublic.mockResolvedValueOnce({ rows: [] }); // status update

    const mockJob = {
      data: {},
      updateProgress: jest.fn(),
    };

    const result = await processTokenRefresh(mockJob as any);

    expect(result.refreshed).toBe(0);
    expect(result.failed).toBe(1);
    // Should mark integration as error
    expect(mockQueryPublic).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.user_integrations'),
      expect.arrayContaining(['error']),
    );
  });

  it('should handle no expiring tokens', async () => {
    mockFindExpiringTokens.mockResolvedValueOnce([]);

    const mockJob = {
      data: {},
      updateProgress: jest.fn(),
    };

    const result = await processTokenRefresh(mockJob as any);

    expect(result.refreshed).toBe(0);
    expect(result.failed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="token-refresh-worker" --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Implement token refresh worker**

```typescript
// backend/src/services/queue/workers/token-refresh-worker.ts

import { OAuthTokenStore } from '../../integrations/oauth-token-store';
import { queryPublic } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

interface BullJob {
  data: Record<string, unknown>;
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

const tokenStore = new OAuthTokenStore();

export async function processTokenRefresh(
  job: BullJob,
): Promise<{ refreshed: number; failed: number }> {
  logger.info('Token refresh job started', { operation: 'token-refresh-worker' });
  await job.updateProgress(10);

  const expiring = await tokenStore.findExpiringTokens(5);
  if (expiring.length === 0) {
    await job.updateProgress(100);
    return { refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;

  for (const token of expiring) {
    try {
      // getValidToken auto-refreshes when token is expiring
      await tokenStore.getValidToken(token.userId, token.connectorId);
      refreshed++;
    } catch (error) {
      failed++;
      logger.warn('Token refresh failed', {
        operation: 'token-refresh-worker',
        userId: token.userId,
        connectorId: token.connectorId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Mark integration as error
      // Uses queryPublic() for public schema queries
      await queryPublic(
        `UPDATE public.user_integrations
         SET status = $1, error_message = $2, updated_at = NOW()
         WHERE user_id = $3 AND connector_id = $4`,
        ['error', error instanceof Error ? error.message : 'Token refresh failed', token.userId, token.connectorId],
      );
    }
  }

  await job.updateProgress(100);
  logger.info('Token refresh job completed', {
    operation: 'token-refresh-worker',
    refreshed,
    failed,
  });

  return { refreshed, failed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="token-refresh-worker" --no-coverage 2>&1 | tail -5`
Expected: PASS (3 tests)

- [ ] **Step 5: Register worker in workers.ts**

In `backend/src/services/queue/workers.ts`:

1. Add import at top: `import { processTokenRefresh } from './workers/token-refresh-worker';`
2. In the processor registration section (where other queues are mapped to handlers), add:
```typescript
// Integration token refresh
case 'integration-sync':
  return processTokenRefresh(job);
```
3. Add health counter entry for `'integration-sync'` in the `workerHealthCounters` Map initialization.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/queue/workers/token-refresh-worker.ts backend/src/__tests__/unit/services/integrations/token-refresh-worker.test.ts backend/src/services/queue/workers.ts
git commit -m "feat(integrations): implement token refresh BullMQ worker"
```

---

### Task 10: REST API Routes

**Files:**
- Create: `backend/src/routes/integration-framework.ts`
- Test: `backend/src/__tests__/unit/routes/integration-framework.test.ts`

- [ ] **Step 1: Write failing tests for route endpoints**

```typescript
// backend/src/__tests__/unit/routes/integration-framework.test.ts

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

const mockGetForUser = jest.fn();
const mockInstall = jest.fn();
const mockUninstall = jest.fn();
const mockUpdateConfig = jest.fn();
const mockHealthCheck = jest.fn();
const mockRegistryList = jest.fn();
const mockRegistryGet = jest.fn();

jest.mock('../../../services/integrations', () => ({
  IntegrationRegistry: jest.fn().mockImplementation(() => ({
    list: mockRegistryList,
    get: mockRegistryGet,
    getForUser: mockGetForUser,
    install: mockInstall,
    uninstall: mockUninstall,
    updateConfig: mockUpdateConfig,
    health: mockHealthCheck,
  })),
  OAuthTokenStore: jest.fn().mockImplementation(() => ({
    storeTokens: jest.fn(),
    revokeTokens: jest.fn(),
  })),
  WebhookRouter: jest.fn().mockImplementation(() => ({
    route: jest.fn(),
  })),
}));

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (_req: any, _res: any, next: any) => {
    _req.jwtUser = { id: 'test-user', email: 'test@test.com', role: 'admin' };
    _req.apiKey = { id: 'jwt:test', name: 'JWT:test', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
    next();
  },
}));

import { createIntegrationFrameworkRouter } from '../../../routes/integration-framework';

describe('Integration Framework Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const router = createIntegrationFrameworkRouter();
    app.use('/api/integrations', router);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/integrations/available', () => {
    it('should list available connectors', async () => {
      mockRegistryList.mockReturnValueOnce([
        { id: 'gmail', name: 'Gmail', category: 'email' },
      ]);

      const res = await request(app).get('/api/integrations/available');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('gmail');
    });

    it('should filter by category', async () => {
      mockRegistryList.mockReturnValueOnce([]);

      const res = await request(app).get('/api/integrations/available?category=email');

      expect(mockRegistryList).toHaveBeenCalledWith({ category: 'email', provider: undefined });
    });
  });

  describe('GET /api/integrations/mine', () => {
    it('should list user integrations', async () => {
      mockGetForUser.mockResolvedValueOnce([
        { connectorId: 'gmail', status: 'connected', definition: { name: 'Gmail' } },
      ]);

      const res = await request(app).get('/api/integrations/mine');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('DELETE /api/integrations/:connectorId/disconnect', () => {
    it('should disconnect integration', async () => {
      mockUninstall.mockResolvedValueOnce(undefined);

      const res = await request(app).delete('/api/integrations/gmail/disconnect');

      expect(res.status).toBe(200);
      expect(mockUninstall).toHaveBeenCalledWith('test-user', 'gmail');
    });
  });

  describe('GET /api/integrations/:connectorId/health', () => {
    it('should return health status', async () => {
      mockHealthCheck.mockResolvedValueOnce({
        connected: true,
        tokenValid: true,
      });

      const res = await request(app).get('/api/integrations/gmail/health');

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(true);
    });
  });

  describe('PATCH /api/integrations/:connectorId/config', () => {
    it('should update config', async () => {
      mockUpdateConfig.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .patch('/api/integrations/gmail/config')
        .send({ targetContext: 'personal' });

      expect(res.status).toBe(200);
      expect(mockUpdateConfig).toHaveBeenCalledWith('test-user', 'gmail', { targetContext: 'personal' });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --testPathPattern="integration-framework.test" --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Implement routes**

```typescript
// backend/src/routes/integration-framework.ts

import { Router, type Request, type Response } from 'express';
import { jwtAuth } from '../middleware/jwt-auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getUserId } from '../utils/user-context';
import { IntegrationRegistry } from '../services/integrations/integration-registry';
import { OAuthTokenStore } from '../services/integrations/oauth-token-store';
import { WebhookRouter } from '../services/integrations/webhook-router';
import { logger } from '../utils/logger';

export function createIntegrationFrameworkRouter(
  registry?: IntegrationRegistry,
  tokenStore?: OAuthTokenStore,
  webhookRouter?: WebhookRouter,
): Router {
  const router = Router();
  const _registry = registry || new IntegrationRegistry();
  const _tokenStore = tokenStore || new OAuthTokenStore();
  const _webhookRouter = webhookRouter || new WebhookRouter();

  // List available connectors
  router.get('/available', jwtAuth, asyncHandler(async (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const provider = req.query.provider as string | undefined;
    const connectors = _registry.list({ category: category as any, provider });
    res.json({ success: true, data: connectors });
  }));

  // User's installed integrations
  router.get('/mine', jwtAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const integrations = await _registry.getForUser(userId);
    res.json({ success: true, data: integrations });
  }));

  // Disconnect integration
  router.delete('/:connectorId/disconnect', jwtAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { connectorId } = req.params;

    await _tokenStore.revokeTokens(userId, connectorId);
    await _registry.uninstall(userId, connectorId);

    res.json({ success: true, message: `Disconnected ${connectorId}` });
  }));

  // Manual sync trigger
  router.post('/:connectorId/sync', jwtAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { connectorId } = req.params;
    const connector = _registry.get(connectorId);

    if (!connector) {
      res.status(404).json({ success: false, error: 'Connector not found' });
      return;
    }

    try {
      const result = await connector.sync(userId, req.body || {});
      res.json({ success: true, data: result });
    } catch (error) {
      logger.warn('Sync failed', {
        operation: 'integration-sync',
        connectorId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.json({
        success: true,
        data: { itemsSynced: 0, errors: 1, duration: 0 },
      });
    }
  }));

  // Health check
  router.get('/:connectorId/health', jwtAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { connectorId } = req.params;
    const health = await _registry.health(userId, connectorId);
    res.json({ success: true, data: health });
  }));

  // Update config
  router.patch('/:connectorId/config', jwtAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { connectorId } = req.params;
    await _registry.updateConfig(userId, connectorId, req.body);
    res.json({ success: true, message: 'Config updated' });
  }));

  return router;
}

// Webhook route (separate, no auth — signature verified by connector)
export function createWebhookIntegrationRouter(webhookRouter: WebhookRouter): Router {
  const router = Router();

  router.post('/:connectorId', asyncHandler(async (req: Request, res: Response) => {
    const { connectorId } = req.params;
    const rawEvent = {
      headers: req.headers as Record<string, string>,
      body: req.body as Buffer,
    };

    const event = await webhookRouter.route(connectorId, rawEvent);

    if (event) {
      res.json({ success: true, eventId: event.id });
    } else {
      res.json({ success: true, message: 'Webhook processed' });
    }
  }));

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern="integration-framework.test" --no-coverage 2>&1 | tail -5`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/integration-framework.ts backend/src/__tests__/unit/routes/integration-framework.test.ts
git commit -m "feat(integrations): implement REST API routes for integration framework"
```

---

### Task 11: IntegrationsModule + Wire Everything

**Files:**
- Create: `backend/src/modules/integrations/index.ts`
- Modify: `backend/src/modules/index.ts`

- [ ] **Step 1: Create IntegrationsModule**

```typescript
// backend/src/modules/integrations/index.ts

import type { Express } from 'express';
import type { Module } from '../../core/module';
import { IntegrationRegistry } from '../../services/integrations/integration-registry';
import { OAuthTokenStore } from '../../services/integrations/oauth-token-store';
import { WebhookRouter } from '../../services/integrations/webhook-router';
import { MockConnector } from '../../services/integrations/mock-connector';
import {
  createIntegrationFrameworkRouter,
  createWebhookIntegrationRouter,
} from '../../routes/integration-framework';
import { logger } from '../../utils/logger';

// Singleton instances
let registry: IntegrationRegistry;
let tokenStore: OAuthTokenStore;
let webhookRouter: WebhookRouter;

export function getIntegrationRegistry(): IntegrationRegistry {
  if (!registry) {
    registry = new IntegrationRegistry();
  }
  return registry;
}

export function getTokenStore(): OAuthTokenStore {
  if (!tokenStore) {
    tokenStore = new OAuthTokenStore();
  }
  return tokenStore;
}

export function getWebhookRouter(): WebhookRouter {
  if (!webhookRouter) {
    webhookRouter = new WebhookRouter();
  }
  return webhookRouter;
}

export class IntegrationsModule implements Module {
  name = 'integrations';

  registerRoutes(app: Express): void {
    const reg = getIntegrationRegistry();
    const store = getTokenStore();
    const wh = getWebhookRouter();

    // Register mock connector (for testing and as example)
    const mock = new MockConnector();
    reg.register(mock);
    wh.register('mock', mock);

    // Integration management API (JWT auth)
    app.use('/api/integrations', createIntegrationFrameworkRouter(reg, store, wh));

    // Webhook ingestion (no auth — follows Resend pattern, connectors verify signatures from headers)
    // NOTE: Body is JSON-parsed by global express.json() middleware.
    // Connectors that need raw bytes for signature verification should use
    // req.rawBody if available, or verify from parsed JSON + headers (like Resend does).
    app.use('/api/webhooks/integrations', createWebhookIntegrationRouter(wh));

    logger.info('Integration framework routes registered', {
      operation: 'module-init',
      module: 'integrations',
    });
  }
}
```

- [ ] **Step 2: Add IntegrationsModule to modules/index.ts**

Add the import and insert `new IntegrationsModule()` in the modules array. Place it before CoreRoutesModule (since it needs `/api/integrations` to not be caught by `/:context` routes):

```typescript
import { IntegrationsModule } from './integrations';

// In the modules array, add before CoreRoutesModule:
new IntegrationsModule(),
```

- [ ] **Step 3: Verify TypeScript compiles and existing tests pass**

Run: `cd backend && npx tsc --noEmit --pretty 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -10`
Expected: No TS errors, all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/integrations/index.ts backend/src/modules/index.ts
git commit -m "feat(integrations): wire IntegrationsModule into application startup"
```

---

### Task 12: Full Test Suite Run + Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass (existing 7720+ plus ~30 new integration framework tests)

- [ ] **Step 2: Run frontend tests (no changes, but verify no breakage)**

Run: `cd frontend && npx vitest run 2>&1 | tail -10`
Expected: All 1400 tests pass

- [ ] **Step 3: Verify TypeScript build**

Run: `cd backend && npx tsc --noEmit && echo "BUILD OK"`
Expected: BUILD OK

- [ ] **Step 4: Final commit with migration and summary**

```bash
git add -A
git status
git commit -m "feat(integrations): Phase 1 Integration Framework complete

Integration framework with 4 components:
- OAuthTokenStore: encrypted token persistence with auto-refresh
- IntegrationRegistry: connector discovery + user installation
- WebhookRouter: inbound event normalization with dedup
- MockConnector: test connector implementing full interface

Includes: DB migration, BullMQ worker, 8 REST endpoints, ~30 tests.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
