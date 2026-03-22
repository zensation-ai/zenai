# Phase 1: Integration Framework Foundation — Design Spec

> **Date:** 2026-03-22
> **Status:** Approved
> **Part of:** ZenAI World #1 Masterplan (Phase 1 of 8)
> **Goal:** Build the generic connector infrastructure that Gmail/Calendar (Phase 3), Slack (Phase 5), and all future integrations plug into.

---

## Context

ZenAI has 49+ internal tools and a deep cognitive architecture, but no framework for external service integrations (Gmail, Calendar, Slack, etc.). Phase 3 requires Gmail and Google Calendar connectors. This spec builds the abstract infrastructure they will implement.

### Existing Code to Extend

| File | Purpose | How We Extend It |
|------|---------|------------------|
| `services/auth/oauth-providers.ts` | Google/Microsoft/GitHub OAuth | Add `refreshAccessToken(provider, refreshToken)` method for token refresh |
| `services/security/field-encryption.ts` | AES-256-GCM | Encrypt stored OAuth tokens |
| `routes/email-webhooks.ts` | Resend webhook handling | Generalize into WebhookRouter |
| `services/event-system.ts` | Persistent event bus | Emit IntegrationEvents |
| `services/queue/job-queue.ts` | BullMQ (5 queues) | Extend `QUEUE_NAMES` array with `'integration-sync'` (compile-time, not runtime) |
| `modules/index.ts` | Module registration | Add IntegrationsModule |

### Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token storage schema | `public` (not per-context) | One Google account = one token. Data flows into context schemas via routing rules. |
| Data storage schema | Per-context | Synced emails go to `work.emails`, calendar events to `personal.calendar_events`, etc. Preserves 4-context isolation. |
| Token encryption | AES-256-GCM (existing) | Reuse `field-encryption.ts`. No new crypto dependency. |
| Token refresh | BullMQ background job | Refresh 5 min before expiry. No user-facing latency. |
| Webhook routing | `/api/webhooks/integrations/:connectorId` | Single entry point, connector-specific verification. |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  IntegrationRegistry                         │
│  - Connector registration + discovery        │
│  - User installation tracking                │
│  - Health monitoring                         │
├─────────────────────────────────────────────┤
│  OAuthTokenStore                             │
│  - Token CRUD (encrypted at rest)            │
│  - Auto-refresh (BullMQ, 5min before expiry) │
│  - getValidToken() with transparent refresh  │
├─────────────────────────────────────────────┤
│  WebhookRouter                               │
│  - Per-connector signature verification      │
│  - Event normalization → IntegrationEvent    │
│  - Emit to EventSystem for proactive engine  │
├─────────────────────────────────────────────┤
│  Connector (Abstract Interface)              │
│  - connect / disconnect / sync / health      │
│  - Capability declarations                   │
│  - Webhook handler (optional)                │
└─────────────────────────────────────────────┘
```

---

## Component Details

### 1. ConnectorDefinition & Connector Interface

```typescript
type IntegrationCategory = 'email' | 'calendar' | 'messaging' | 'storage' | 'crm' | 'dev';
type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface ConnectorDefinition {
  id: string;                          // 'gmail', 'google-calendar', 'slack'
  name: string;                        // 'Gmail', 'Google Calendar'
  provider: string;                    // 'google', 'microsoft', 'slack'
  category: IntegrationCategory;
  capabilities: string[];              // ['email.read', 'email.send', 'email.sync']
  requiredScopes: string[];            // ['https://www.googleapis.com/auth/gmail.readonly']
  webhookSupported: boolean;
  syncSupported: boolean;
  defaultContext: AIContext;
  icon?: string;                       // Lucide icon name
  description?: string;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: Date;
  scopes: string[];
}

interface SyncOptions {
  fullSync?: boolean;                  // Full re-sync vs incremental
  since?: Date;                        // Incremental: sync since this date
  targetContext?: AIContext;            // Override default context
}

interface SyncResult {
  itemsSynced: number;
  errors: number;
  nextSyncToken?: string;              // For incremental sync (e.g. Gmail history ID)
  duration: number;
}

interface HealthStatus {
  connected: boolean;
  lastSync?: Date;
  error?: string;
  tokenValid: boolean;
  tokenExpiresAt?: Date;
}

interface RawWebhookEvent {
  headers: Record<string, string>;
  body: Buffer;                          // Raw body bytes for signature verification
  // Webhook route uses express.raw() middleware, NOT express.json()
}

interface IntegrationEvent {
  id: string;
  connectorId: string;
  userId: string;
  type: string;                        // 'email.received', 'calendar.updated'
  targetContext: AIContext;
  payload: Record<string, unknown>;
  timestamp: Date;
}

interface Connector {
  definition: ConnectorDefinition;

  /** Called after tokens are stored and user_integration row created.
   *  Use for provider-specific setup (e.g. Gmail watch registration). */
  connect(userId: string, tokens: OAuthTokens): Promise<void>;

  /** Called before tokens and user_integration row are deleted.
   *  Use for provider-specific cleanup (e.g. Gmail watch stop). */
  disconnect(userId: string): Promise<void>;

  /** MUST NOT throw. Errors counted in SyncResult.errors.
   *  Framework catches unexpected throws and marks status as 'error'. */
  sync(userId: string, options: SyncOptions): Promise<SyncResult>;

  health(userId: string): Promise<HealthStatus>;

  /** Verify webhook signature and normalize event. Return null to ignore. */
  handleWebhook?(event: RawWebhookEvent): Promise<IntegrationEvent | null>;
}
```

### 2. OAuthTokenStore

**File:** `backend/src/services/integrations/oauth-token-store.ts`

Manages encrypted OAuth token persistence with transparent auto-refresh.

```typescript
class OAuthTokenStore {
  /** Store tokens after OAuth callback. Encrypts before saving. */
  async storeTokens(userId: string, connectorId: string, provider: string, tokens: OAuthTokens): Promise<void>;

  /** Get a valid token. Auto-refreshes if expired/expiring within 5 min. */
  async getValidToken(userId: string, connectorId: string): Promise<OAuthTokens | null>;

  /** Revoke and delete tokens. */
  async revokeTokens(userId: string, connectorId: string): Promise<void>;

  /** Check if user has valid tokens for a connector. */
  async hasTokens(userId: string, connectorId: string): Promise<boolean>;

  /** Find all tokens expiring within N minutes (for background refresh job). */
  async findExpiringTokens(withinMinutes: number): Promise<Array<{ userId: string; connectorId: string; provider: string }>>;

  /** Refresh a specific token using the provider's refresh endpoint. */
  async refreshToken(userId: string, connectorId: string): Promise<OAuthTokens>;
}
```

**Token refresh flow:**
1. BullMQ repeatable job runs every 2 minutes
2. Queries `findExpiringTokens(5)` — tokens expiring within 5 min
3. For each, calls `refreshToken()` which calls `OAuthProviderManager.refreshAccessToken(provider, refreshToken)`
4. On refresh failure: mark integration status as `error`, emit event for notification

**Required extension to `oauth-providers.ts`:**
```typescript
/** New method to add to OAuthProviderManager */
async refreshAccessToken(provider: string, refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;   // Some providers rotate refresh tokens
  expiresIn?: number;
}>;
// Uses provider-specific token endpoint (e.g. https://oauth2.googleapis.com/token)
// with grant_type=refresh_token
```

### 3. IntegrationRegistry

**File:** `backend/src/services/integrations/integration-registry.ts`

Central registry for connector discovery and user installation tracking.

```typescript
class IntegrationRegistry {
  /** Register a connector (called at startup by each connector module). */
  register(connector: Connector): void;

  /** Get a registered connector by ID. */
  get(connectorId: string): Connector | undefined;

  /** List all registered connectors with optional filters. */
  list(filter?: { category?: IntegrationCategory; provider?: string }): ConnectorDefinition[];

  /** Get user's installed integrations with status. */
  async getForUser(userId: string): Promise<UserIntegration[]>;

  /** Install an integration for a user (after OAuth flow). */
  async install(userId: string, connectorId: string, config?: IntegrationConfig): Promise<void>;

  /** Uninstall an integration. Calls connector.disconnect(). */
  async uninstall(userId: string, connectorId: string): Promise<void>;

  /** Update user's integration config (target context, sync interval, etc.). */
  async updateConfig(userId: string, connectorId: string, config: Partial<IntegrationConfig>): Promise<void>;

  /** Check health of a user's integration. */
  async health(userId: string, connectorId: string): Promise<HealthStatus>;
}

interface UserIntegration {
  connectorId: string;
  definition: ConnectorDefinition;
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  config: IntegrationConfig;
  lastSyncAt?: Date;
  error?: string;
}

interface IntegrationConfig {
  targetContext: AIContext;
  syncEnabled: boolean;
  syncIntervalMinutes?: number;          // Min: 5, Max: 1440, Default: 15
}

// Validation constants
const SYNC_INTERVAL_MIN = 5;
const SYNC_INTERVAL_MAX = 1440;          // 24 hours
const SYNC_INTERVAL_DEFAULT = 15;
```

### 4. WebhookRouter

**File:** `backend/src/services/integrations/webhook-router.ts`

Routes inbound webhooks to the correct connector's handler.

```typescript
class WebhookRouter {
  /** Register a webhook handler for a connector. */
  register(connectorId: string, connector: Connector): void;

  /** Route an incoming webhook to the correct handler. */
  async route(connectorId: string, req: Request): Promise<IntegrationEvent | null>;
}
```

**Webhook flow:**
1. `POST /api/webhooks/integrations/:connectorId` hits the route
2. WebhookRouter finds the registered connector
3. Connector's `handleWebhook()` verifies signature + normalizes event
4. Normalized `IntegrationEvent` emitted to `EventSystem`
5. Proactive engine rules can react (e.g. "new email from boss" → notification)

### 5. Token Refresh Worker

**File:** `backend/src/services/queue/workers/token-refresh-worker.ts`

BullMQ worker for background token refresh. Uses the `integration-sync` queue with job name discrimination:

```typescript
// Job names within 'integration-sync' queue:
// - 'token-refresh' (repeatable, every 2 minutes)
// - 'manual-sync' (on-demand, triggered by user)
// - 'scheduled-sync' (repeatable per-user, based on syncIntervalMinutes)

// Token refresh flow:
// 1. Find tokens expiring within 5 minutes
// 2. For each, call OAuthTokenStore.refreshToken() which calls
//    OAuthProviderManager.refreshAccessToken(provider, refreshToken)
// 3. On success: update DB with new tokens
// 4. On failure: mark user_integration status as 'error', emit notification event
```

### 6. OAuth Connect Flow (Sequence)

```
1. User clicks "Connect Gmail"
2. POST /api/integrations/gmail/connect
3. Server looks up ConnectorDefinition for 'gmail'
4. Merges requiredScopes with existing Google OAuth config
5. Generates state = JSON.stringify({ connectorId: 'gmail', userId, nonce })
6. Encrypts state, stores in public.oauth_states (existing table)
7. Redirects to Google OAuth with:
   - redirect_uri = /api/integrations/gmail/callback
   - scope = connector.requiredScopes
   - access_type = offline (for refresh_token)
   - prompt = consent (force refresh_token on re-auth)
8. Google redirects to /api/integrations/gmail/callback?code=...&state=...
9. Server decodes state, exchanges code for tokens via oauth-providers.ts
10. OAuthTokenStore.storeTokens() — encrypts and saves
11. IntegrationRegistry.install() — creates user_integration row
12. connector.connect() — provider-specific setup
13. Redirects user to frontend /settings/integrations?connected=gmail
```

### 7. Webhook Dedup & Rate Limiting

- Webhook route computes SHA-256 of raw body
- Checks `integration_webhook_log` for matching `payload_hash` within last 5 minutes
- If duplicate: returns 200 OK, logs with status `ignored`, does NOT process
- Rate limit: 100 webhooks per connector per minute (using existing rate-limit middleware)
- Exceeding rate limit returns 429

---

## Database Schema

### `public.integration_tokens`

```sql
CREATE TABLE public.integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  connector_id VARCHAR(100) NOT NULL,
  access_token TEXT NOT NULL,              -- AES-256-GCM encrypted
  refresh_token TEXT,                      -- AES-256-GCM encrypted
  token_type VARCHAR(20) DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connector_id)
);

CREATE INDEX idx_integration_tokens_user ON public.integration_tokens(user_id);
CREATE INDEX idx_integration_tokens_expires ON public.integration_tokens(expires_at)
  WHERE expires_at IS NOT NULL;
```

### `public.user_integrations`

```sql
CREATE TABLE public.user_integrations (
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

CREATE INDEX idx_user_integrations_user ON public.user_integrations(user_id);
CREATE INDEX idx_user_integrations_status ON public.user_integrations(status);
```

### `public.integration_webhook_log`

```sql
CREATE TABLE public.integration_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id VARCHAR(100) NOT NULL,
  user_id UUID,
  event_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  payload_hash VARCHAR(64),                -- SHA-256 for dedup
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_log_connector ON public.integration_webhook_log(connector_id, created_at DESC);
CREATE INDEX idx_webhook_log_hash ON public.integration_webhook_log(payload_hash);
```

---

## API Endpoints

### Integration Management

```
GET    /api/integrations/available                    - List all registered connectors
GET    /api/integrations/mine                         - User's installed integrations + status
POST   /api/integrations/:connectorId/connect         - Start OAuth flow (redirects to provider)
GET    /api/integrations/:connectorId/callback        - OAuth callback (stores tokens, installs)
DELETE /api/integrations/:connectorId/disconnect      - Revoke tokens, uninstall
POST   /api/integrations/:connectorId/sync            - Manual sync trigger
GET    /api/integrations/:connectorId/health          - Connection health check
PATCH  /api/integrations/:connectorId/config          - Update config (target context, sync toggle)
```

### Webhook Ingestion

```
POST   /api/webhooks/integrations/:connectorId        - Inbound webhooks (no auth, signature verified by connector)
```

### Auth Notes

- All `/api/integrations/*` endpoints require JWT auth (`requireJwt` middleware)
- Webhook endpoint is unauthenticated (like existing Resend webhook) — connectors verify signatures themselves
- `/available` is public (no user data), but still behind auth for consistency

---

## File Structure

```
backend/src/services/integrations/
  types.ts                        # All interfaces (Connector, ConnectorDefinition, etc.)
  integration-registry.ts         # IntegrationRegistry class
  oauth-token-store.ts            # OAuthTokenStore class
  webhook-router.ts               # WebhookRouter class
  index.ts                        # Module exports

backend/src/routes/
  integration-framework.ts        # REST API endpoints (integrations.ts already exists for legacy)

backend/src/modules/integrations/
  index.ts                        # IntegrationsModule (register routes + startup)

backend/src/services/queue/workers/
  token-refresh-worker.ts         # BullMQ token refresh job

backend/sql/migrations/
  phase1_integration_framework.sql  # DB migration
```

---

## Testing Strategy

### Unit Tests

| Test Suite | Coverage |
|------------|----------|
| `oauth-token-store.test.ts` | Store, retrieve, refresh, revoke, encryption roundtrip |
| `integration-registry.test.ts` | Register, list, filter, install, uninstall, health |
| `webhook-router.test.ts` | Route to correct handler, unknown connector, signature failure |
| `token-refresh-worker.test.ts` | Find expiring, refresh success, refresh failure → error status |
| `integrations.routes.test.ts` | All 8 endpoints, auth checks, error cases |

### Integration Tests

| Test | What It Proves |
|------|----------------|
| Register mock connector → install → sync → uninstall | Full lifecycle |
| Store tokens → retrieve decrypted → verify encryption at rest | Token security |
| Webhook delivery → event emission → EventSystem receives | Webhook pipeline |
| Token expiry → background refresh → token updated | Auto-refresh |

### Mock Connector

A `MockConnector` implementing `Connector` interface for testing without external dependencies:

```typescript
class MockConnector implements Connector {
  definition = {
    id: 'mock',
    name: 'Mock Integration',
    provider: 'mock',
    category: 'dev' as const,
    capabilities: ['test.read', 'test.write'],
    requiredScopes: ['mock.read'],
    webhookSupported: true,
    syncSupported: true,
    defaultContext: 'personal' as const,
  };
  // ... simple in-memory implementations
}
```

---

## Success Criteria

1. A new connector can be added by implementing the `Connector` interface and calling `registry.register()` — no changes to framework code
2. OAuth tokens are encrypted at rest and auto-refreshed before expiry
3. Webhooks route to the correct connector and emit normalized events
4. All endpoints are JWT-protected (except webhooks which use connector-specific verification)
5. The MockConnector passes all lifecycle tests
6. Zero changes to existing Resend email integration (backward compatible)

---

## What This Enables (Future Phases)

| Phase | What It Builds On |
|-------|-------------------|
| **Phase 3: Gmail + Calendar** | Implements `GmailConnector` and `GoogleCalendarConnector` using this framework |
| **Phase 5: Slack** | Implements `SlackConnector` with webhook-heavy pattern |
| **Phase 7: Enterprise** | Connector marketplace, per-tenant integration limits, audit logging |

---

## Out of Scope

- Actual Gmail/Calendar/Slack connectors (Phase 3+)
- Frontend integration management UI (Phase 2 UX)
- Billing integration (Phase 7)
- Token budget / intent router / memory OS improvements (separate Phase 1 specs)
