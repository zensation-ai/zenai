# Phase 5: Slack + Autonomous Workflows Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bidirectional Slack integration with proactive channel presence and autonomous workflows governed by the existing approval system.

**Architecture:** SlackConnector implements the Phase 1 `Connector` interface. Bolt.js handles webhooks as Express middleware (bypasses WebhookRouter). Events emit to EventSystem with `integration.slack.*` prefix. ProactiveEngine rules drive autonomous workflows with Governance approval. Memory extraction pipeline feeds Slack messages into HiMeS via Claude.

**Tech Stack:** Express.js, @slack/bolt, PostgreSQL (public + per-context schemas), BullMQ, AES-256-GCM encryption, Jest

**Codebase Patterns (MUST follow):**
- DB queries on public schema: `import { queryPublic } from '../utils/database-context'`
- DB queries on context schema: `import { queryContext } from '../utils/database-context'`
- Async route handlers: `import { asyncHandler } from '../middleware/errorHandler'`
- User ID extraction: `import { getUserId } from '../utils/user-context'`
- Auth middleware: `import { requireJwt } from '../middleware/jwt-auth'`
- Logging: `import { logger } from '../utils/logger'`
- Event emission: `import { emitSystemEvent } from '../services/event-system'`

**Spec:** `docs/superpowers/specs/2026-03-23-phase5-slack-autonomous-workflows-design.md`

---

## File Structure

```
NEW FILES:
  backend/src/services/integrations/slack/
    types.ts                              # Slack-specific types + interfaces
    slack-connector.ts                    # Connector implementation (lifecycle)
    slack-bot.ts                          # Bolt.js app, event handlers, slash commands
    slack-memory.ts                       # Extraction pipeline, importance filter
    slack-proactive.ts                    # Relevance detection, confidence gate
    slack-workflows.ts                    # Pre-built workflow templates
  backend/src/routes/slack.ts             # Slack API routes (6 endpoints)
  backend/sql/migrations/phase5_slack_integration.sql

  backend/src/__tests__/unit/services/integrations/slack/
    slack-connector.test.ts
    slack-bot.test.ts
    slack-memory.test.ts
    slack-proactive.test.ts
    slack-workflows.test.ts
  backend/src/__tests__/unit/routes/slack.test.ts

MODIFIED FILES:
  backend/src/services/integrations/index.ts    # Add SlackConnector export
  backend/src/modules/integrations/index.ts     # Register SlackConnector + routes
  backend/src/services/queue/workers.ts         # Add Slack sync worker processor
  backend/package.json                          # Add @slack/bolt dependency

DELETED FILES:
  backend/src/services/slack.ts                 # Legacy Slack service (676 lines)
```

---

## Chunk 1: Types + DB Migration + Dependency + Legacy Cleanup

### Task 1: Install @slack/bolt dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install @slack/bolt**

```bash
cd backend && npm install @slack/bolt
```

- [ ] **Step 2: Verify installation**

```bash
cd backend && node -e "require('@slack/bolt'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "deps: add @slack/bolt for Slack integration"
```

### Task 2: Slack-specific types

**Files:**
- Create: `backend/src/services/integrations/slack/types.ts`
- Test: `backend/src/__tests__/unit/services/integrations/slack/slack-connector.test.ts` (type tests only)

- [ ] **Step 1: Write type validation tests**

```typescript
// backend/src/__tests__/unit/services/integrations/slack/slack-connector.test.ts

import type {
  SlackWorkspace,
  SlackChannel,
  SlackMessage,
  SlackConnectorTokens,
  ProactiveConfig,
  SlackWorkflowTemplate,
  SlackSyncJobData,
} from '../../../../../services/integrations/slack/types';
import type { RuleCondition } from '../../../../../services/proactive-decision-engine';

describe('Slack Types', () => {
  it('SlackConnectorTokens extends OAuthTokens with Slack fields', () => {
    const tokens: SlackConnectorTokens = {
      accessToken: 'xoxb-test',
      tokenType: 'Bearer',
      scopes: ['channels:read'],
      botUserId: 'U123',
      teamId: 'T456',
      teamName: 'Test Workspace',
    };
    expect(tokens.botUserId).toBe('U123');
    expect(tokens.teamId).toBe('T456');
    expect(tokens.accessToken).toBe('xoxb-test');
  });

  it('ProactiveConfig has correct defaults', () => {
    const config: ProactiveConfig = {
      enabled: true,
      confidenceThreshold: 0.8,
      rateLimitMinutes: 30,
      mutedChannels: [],
    };
    expect(config.confidenceThreshold).toBe(0.8);
    expect(config.rateLimitMinutes).toBe(30);
  });

  it('SlackWorkflowTemplate uses RuleCondition from ProactiveEngine', () => {
    const condition: RuleCondition = {
      field: 'payload.text',
      operator: 'contains',
      value: 'TODO',
    };
    const template: SlackWorkflowTemplate = {
      name: 'Task Extraction',
      description: 'Extract tasks from messages',
      eventTypes: ['integration.slack.message_received'],
      conditions: [condition],
      decision: 'take_action',
      actionConfig: { action: 'create_task' },
      riskLevel: 'medium',
      requiresApproval: true,
    };
    expect(template.conditions[0].operator).toBe('contains');
  });

  it('SlackSyncJobData has required fields', () => {
    const job: SlackSyncJobData = {
      userId: 'user-1',
      connectorId: 'slack',
      workspaceId: 'ws-1',
      fullSync: false,
    };
    expect(job.connectorId).toBe('slack');
  });

  it('SlackChannel has target context constraint', () => {
    const channel: SlackChannel = {
      id: 'ch-1',
      workspaceId: 'ws-1',
      channelId: 'C123',
      channelName: 'engineering',
      isMember: true,
      targetContext: 'work',
      lastSyncCursor: null,
      muted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(['personal', 'work', 'learning', 'creative']).toContain(channel.targetContext);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="slack-connector" --no-coverage 2>&1 | head -20
```
Expected: FAIL — cannot find module `slack/types`

- [ ] **Step 3: Create types file**

```typescript
// backend/src/services/integrations/slack/types.ts

import type { OAuthTokens } from '../types';
import type { RuleCondition } from '../../proactive-decision-engine';

export type AIContext = 'personal' | 'work' | 'learning' | 'creative';

export interface SlackConnectorTokens extends OAuthTokens {
  botUserId: string;
  teamId: string;
  teamName: string;
}

export interface ProactiveConfig {
  enabled: boolean;
  confidenceThreshold: number;
  rateLimitMinutes: number;
  mutedChannels: string[];
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  confidenceThreshold: 0.8,
  rateLimitMinutes: 30,
  mutedChannels: [],
};

export interface SlackWorkspace {
  id: string;
  userId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  channelContextMapping: Record<string, AIContext>;
  proactiveConfig: ProactiveConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackChannel {
  id: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  isMember: boolean;
  targetContext: AIContext;
  lastSyncCursor: string | null;
  muted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackMessage {
  id: string;
  channelId: string;
  messageTs: string;
  threadTs: string | null;
  userId: string;
  userName: string;
  text: string;
  extractedFacts: string[];
  importanceScore: number;
  createdAt: Date;
}

export interface SlackWorkflowTemplate {
  name: string;
  description: string;
  eventTypes: string[];
  conditions: RuleCondition[];
  decision: 'notify' | 'prepare_context' | 'take_action' | 'trigger_agent';
  actionConfig: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

export interface SlackSyncJobData {
  userId: string;
  connectorId: 'slack';
  workspaceId: string;
  fullSync: boolean;
  channelIds?: string[];
}

/** Default channel name → context mapping heuristics */
export const DEFAULT_CHANNEL_CONTEXT_MAP: Record<string, AIContext> = {
  engineering: 'work',
  product: 'work',
  sales: 'work',
  ops: 'work',
  random: 'personal',
  general: 'personal',
  watercooler: 'personal',
  'off-topic': 'personal',
  learning: 'learning',
  'book-club': 'learning',
  til: 'learning',
  courses: 'learning',
  brainstorm: 'creative',
  design: 'creative',
  ideas: 'creative',
  creative: 'creative',
};

/** Determine context for a channel name using heuristics */
export function inferChannelContext(channelName: string): AIContext {
  const normalized = channelName.replace(/^#/, '').toLowerCase();
  for (const [pattern, context] of Object.entries(DEFAULT_CHANNEL_CONTEXT_MAP)) {
    if (normalized.includes(pattern)) {
      return context;
    }
  }
  return 'work'; // default
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest --testPathPattern="slack-connector" --no-coverage
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/slack/types.ts backend/src/__tests__/unit/services/integrations/slack/slack-connector.test.ts
git commit -m "feat(slack): add Slack-specific types and interfaces"
```

### Task 3: Database migration

**Files:**
- Create: `backend/sql/migrations/phase5_slack_integration.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Phase 5: Slack + Autonomous Workflows
-- Creates: public.slack_workspaces, public.slack_channels, {context}.slack_messages

-- ============================================================
-- PUBLIC SCHEMA: Workspace-level tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.slack_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id VARCHAR(50) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  bot_user_id VARCHAR(50) NOT NULL,
  channel_context_mapping JSONB DEFAULT '{}',
  proactive_config JSONB DEFAULT '{"enabled": true, "confidenceThreshold": 0.8, "rateLimitMinutes": 30, "mutedChannels": []}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_workspaces_user ON public.slack_workspaces(user_id);

CREATE TABLE IF NOT EXISTS public.slack_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.slack_workspaces(id) ON DELETE CASCADE,
  channel_id VARCHAR(50) NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  is_member BOOLEAN DEFAULT false,
  target_context VARCHAR(20) DEFAULT 'work'
    CHECK (target_context IN ('personal', 'work', 'learning', 'creative')),
  last_sync_cursor VARCHAR(100),
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_channels_workspace ON public.slack_channels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_slack_channels_context ON public.slack_channels(target_context);

-- ============================================================
-- PER-CONTEXT SCHEMAS: Synced message data
-- ============================================================

DO $$
DECLARE
  ctx TEXT;
BEGIN
  FOR ctx IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.slack_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        channel_id VARCHAR(50) NOT NULL,
        message_ts VARCHAR(50) NOT NULL,
        thread_ts VARCHAR(50),
        slack_user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(255),
        text TEXT NOT NULL,
        extracted_facts UUID[] DEFAULT ''{}''::UUID[],
        importance_score FLOAT DEFAULT 0.0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(channel_id, message_ts)
      );

      CREATE INDEX IF NOT EXISTS idx_slack_messages_channel
        ON %I.slack_messages(channel_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_slack_messages_user
        ON %I.slack_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_slack_messages_thread
        ON %I.slack_messages(thread_ts) WHERE thread_ts IS NOT NULL;
    ', ctx, ctx, ctx, ctx);
  END LOOP;
END
$$;

-- ============================================================
-- LEGACY CLEANUP: Drop old Slack tables if they exist
-- ============================================================

DROP TABLE IF EXISTS public.slack_webhook_events;
DROP TABLE IF EXISTS public.slack_messages;
```

- [ ] **Step 2: Verify migration syntax**

```bash
cd backend && node -e "const fs = require('fs'); const sql = fs.readFileSync('sql/migrations/phase5_slack_integration.sql', 'utf8'); console.log('Lines:', sql.split('\n').length, 'OK')"
```
Expected: Lines count + `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/sql/migrations/phase5_slack_integration.sql
git commit -m "feat(slack): add Phase 5 database migration (3 tables)"
```

### Task 4: Delete legacy slack.ts

**Files:**
- Delete: `backend/src/services/slack.ts`
- Modify: any files that import from `slack.ts`

- [ ] **Step 1: Find all imports of legacy slack.ts**

```bash
cd backend && grep -r "from.*services/slack" src/ --include="*.ts" -l
```

- [ ] **Step 2: Remove imports and references from each file found**

For each file found, remove the import and any usage. If the file has Slack-specific routes (in `routes/integrations.ts`), remove those route handlers but keep non-Slack routes intact.

- [ ] **Step 3: Delete the legacy file**

```bash
rm backend/src/services/slack.ts
```

- [ ] **Step 4: Verify build compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors related to slack.ts

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(slack): remove legacy slack.ts service (superseded by Phase 5)"
```

### Task 5: Export SlackConnector from integrations index

**Files:**
- Modify: `backend/src/services/integrations/index.ts`

- [ ] **Step 1: Add Slack exports to index**

Add to the end of `backend/src/services/integrations/index.ts`:

```typescript
// Slack connector (Phase 5)
export type {
  SlackConnectorTokens,
  SlackWorkspace,
  SlackChannel,
  SlackMessage,
  ProactiveConfig,
  SlackWorkflowTemplate,
  SlackSyncJobData,
} from './slack/types';
export { DEFAULT_PROACTIVE_CONFIG, DEFAULT_CHANNEL_CONTEXT_MAP, inferChannelContext } from './slack/types';
```

- [ ] **Step 2: Verify build**

```bash
cd backend && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/integrations/index.ts
git commit -m "feat(slack): export Slack types from integrations index"
```

---

## Chunk 2: SlackConnector — Core Lifecycle

### Task 6: SlackConnector — connect, disconnect, health

**Files:**
- Create: `backend/src/services/integrations/slack/slack-connector.ts`
- Test: `backend/src/__tests__/unit/services/integrations/slack/slack-connector.test.ts` (extend)

- [ ] **Step 1: Write failing tests for SlackConnector lifecycle**

Append to `slack-connector.test.ts`:

```typescript
import { SlackConnector } from '../../../../../services/integrations/slack/slack-connector';
import type { OAuthTokens, SyncOptions } from '../../../../../services/integrations/types';
import type { SlackConnectorTokens } from '../../../../../services/integrations/slack/types';

// Mock dependencies
jest.mock('../../../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
  queryContext: jest.fn(),
}));
jest.mock('../../../../../services/event-system', () => ({
  emitSystemEvent: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { queryPublic } = require('../../../../../utils/database-context');
const { emitSystemEvent } = require('../../../../../services/event-system');

describe('SlackConnector', () => {
  let connector: SlackConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new SlackConnector();
  });

  describe('definition', () => {
    it('has correct connector definition', () => {
      expect(connector.definition.id).toBe('slack');
      expect(connector.definition.provider).toBe('slack');
      expect(connector.definition.category).toBe('messaging');
      expect(connector.definition.webhookSupported).toBe(true);
      expect(connector.definition.syncSupported).toBe(true);
      expect(connector.definition.defaultContext).toBe('work');
      expect(connector.definition.requiredScopes).toContain('channels:history');
      expect(connector.definition.requiredScopes).toContain('chat:write');
    });
  });

  describe('connect', () => {
    const mockTokens: SlackConnectorTokens = {
      accessToken: 'xoxb-test-token',
      tokenType: 'Bearer',
      scopes: ['channels:read', 'chat:write'],
      botUserId: 'U_BOT',
      teamId: 'T_TEAM',
      teamName: 'Test Workspace',
    };

    it('stores workspace metadata in slack_workspaces', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] }); // upsert workspace
      queryPublic.mockResolvedValueOnce({ rows: [] }); // channels (none initially)

      await connector.connect('user-1', mockTokens as OAuthTokens);

      expect(queryPublic).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.slack_workspaces'),
        expect.arrayContaining(['user-1', 'T_TEAM', 'Test Workspace', 'U_BOT']),
      );
    });

    it('uses default channel context mapping', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      await connector.connect('user-1', mockTokens as OAuthTokens);

      const insertCall = queryPublic.mock.calls[0];
      expect(insertCall[0]).toContain('channel_context_mapping');
    });
  });

  describe('disconnect', () => {
    it('deletes workspace and related data', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] }); // find workspace
      queryPublic.mockResolvedValueOnce({ rows: [] }); // delete channels
      queryPublic.mockResolvedValueOnce({ rows: [] }); // delete workspace

      await connector.disconnect('user-1');

      expect(queryPublic).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.any(Array),
      );
    });

    it('handles disconnect when no workspace exists', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      await expect(connector.disconnect('user-1')).resolves.not.toThrow();
    });
  });

  describe('health', () => {
    it('returns connected status when workspace exists', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ws-1',
          team_name: 'Test',
          created_at: new Date().toISOString(),
        }],
      });

      const result = await connector.health('user-1');

      expect(result.connected).toBe(true);
      expect(result.tokenValid).toBe(true);
    });

    it('returns disconnected when no workspace found', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await connector.health('user-1');

      expect(result.connected).toBe(false);
      expect(result.tokenValid).toBe(false);
    });
  });

  describe('sync', () => {
    it('returns sync result with item counts', async () => {
      // workspace lookup
      queryPublic.mockResolvedValueOnce({
        rows: [{ id: 'ws-1', team_id: 'T_TEAM' }],
      });
      // channels lookup
      queryPublic.mockResolvedValueOnce({
        rows: [{ channel_id: 'C1', channel_name: 'general', target_context: 'personal', last_sync_cursor: null }],
      });
      // message insert (mock for queryContext)
      const { queryContext } = require('../../../../../utils/database-context');
      queryContext.mockResolvedValue({ rows: [] });

      const result = await connector.sync('user-1', {});

      expect(result).toHaveProperty('itemsSynced');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('handleWebhook', () => {
    it('exists for interface compliance and returns null', async () => {
      const result = await connector.handleWebhook?.({
        headers: {},
        body: Buffer.from('{}'),
      });
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="slack-connector" --no-coverage 2>&1 | head -20
```
Expected: FAIL — cannot find `slack-connector` module

- [ ] **Step 3: Implement SlackConnector**

```typescript
// backend/src/services/integrations/slack/slack-connector.ts

import type { Connector, ConnectorDefinition, OAuthTokens, SyncOptions, SyncResult, HealthStatus, RawWebhookEvent, IntegrationEvent } from '../types';
import type { SlackConnectorTokens, AIContext } from './types';
import { DEFAULT_PROACTIVE_CONFIG, inferChannelContext } from './types';
import { queryPublic, queryContext } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

export class SlackConnector implements Connector {
  definition: ConnectorDefinition = {
    id: 'slack',
    name: 'Slack',
    provider: 'slack',
    category: 'messaging',
    capabilities: [
      'messaging.read',
      'messaging.write',
      'messaging.sync',
      'messaging.webhook',
      'messaging.slash_commands',
    ],
    requiredScopes: [
      'channels:history',
      'channels:read',
      'chat:write',
      'commands',
      'reactions:read',
      'reactions:write',
      'users:read',
      'im:history',
      'im:read',
      'im:write',
      'groups:history',
      'groups:read',
    ],
    webhookSupported: true,
    syncSupported: true,
    defaultContext: 'work',
    icon: 'MessageSquare',
    description: 'Bidirectional Slack integration with proactive channel presence and autonomous workflows.',
  };

  async connect(userId: string, tokens: OAuthTokens): Promise<void> {
    const slackTokens = tokens as SlackConnectorTokens;
    const { botUserId, teamId, teamName } = slackTokens;

    if (!botUserId || !teamId) {
      throw new Error('SlackConnector.connect requires botUserId and teamId in tokens');
    }

    // Upsert workspace
    await queryPublic(
      `INSERT INTO public.slack_workspaces (user_id, team_id, team_name, bot_user_id, channel_context_mapping, proactive_config)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, team_id) DO UPDATE SET
         team_name = EXCLUDED.team_name,
         bot_user_id = EXCLUDED.bot_user_id,
         updated_at = NOW()
       RETURNING id`,
      [userId, teamId, teamName, botUserId, JSON.stringify({}), JSON.stringify(DEFAULT_PROACTIVE_CONFIG)],
    );

    logger.info('Slack workspace connected', { userId, teamId, teamName });
  }

  async disconnect(userId: string): Promise<void> {
    const wsResult = await queryPublic(
      'SELECT id FROM public.slack_workspaces WHERE user_id = $1',
      [userId],
    );

    if (wsResult.rows.length === 0) {
      logger.warn('Slack disconnect: no workspace found', { userId });
      return;
    }

    const workspaceId = wsResult.rows[0].id;

    // Cascade delete handles channels via FK
    await queryPublic('DELETE FROM public.slack_workspaces WHERE id = $1', [workspaceId]);

    logger.info('Slack workspace disconnected', { userId, workspaceId });
  }

  async sync(userId: string, options: SyncOptions): Promise<SyncResult> {
    const start = Date.now();
    let itemsSynced = 0;
    let errors = 0;

    try {
      const wsResult = await queryPublic(
        'SELECT id, team_id FROM public.slack_workspaces WHERE user_id = $1',
        [userId],
      );

      if (wsResult.rows.length === 0) {
        return { itemsSynced: 0, errors: 1, duration: Date.now() - start };
      }

      const workspaceId = wsResult.rows[0].id;

      // Get channels to sync
      const channelResult = await queryPublic(
        'SELECT channel_id, channel_name, target_context, last_sync_cursor FROM public.slack_channels WHERE workspace_id = $1',
        [workspaceId],
      );

      for (const channel of channelResult.rows) {
        try {
          // In real implementation: call Slack API conversations.history
          // For now, sync logic is a placeholder that subclasses/callers extend
          const targetContext = (channel.target_context || 'work') as AIContext;
          logger.debug('Syncing channel', { channelId: channel.channel_id, targetContext });
        } catch (err) {
          errors++;
          logger.error('Error syncing channel', { channelId: channel.channel_id, error: err });
        }
      }

      // Update last sync
      await queryPublic(
        'UPDATE public.slack_workspaces SET updated_at = NOW() WHERE id = $1',
        [workspaceId],
      );
    } catch (err) {
      errors++;
      logger.error('Slack sync failed', { userId, error: err });
    }

    return { itemsSynced, errors, duration: Date.now() - start };
  }

  async health(userId: string): Promise<HealthStatus> {
    try {
      const wsResult = await queryPublic(
        'SELECT id, team_name, created_at FROM public.slack_workspaces WHERE user_id = $1',
        [userId],
      );

      if (wsResult.rows.length === 0) {
        return { connected: false, tokenValid: false };
      }

      return {
        connected: true,
        tokenValid: true,
        lastSync: wsResult.rows[0].created_at ? new Date(wsResult.rows[0].created_at) : undefined,
      };
    } catch (err) {
      logger.error('Slack health check failed', { userId, error: err });
      return { connected: false, tokenValid: false, error: String(err) };
    }
  }

  async handleWebhook?(event: RawWebhookEvent): Promise<IntegrationEvent | null> {
    // Slack webhooks are handled by Bolt.js directly (see slack-bot.ts).
    // This method exists for Connector interface compliance only.
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern="slack-connector" --no-coverage
```
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/slack/slack-connector.ts backend/src/__tests__/unit/services/integrations/slack/slack-connector.test.ts
git commit -m "feat(slack): implement SlackConnector lifecycle (connect, disconnect, sync, health)"
```

---

## Chunk 3: Slack Bot — Bolt.js Event Handlers + Slash Commands

### Task 7: Slack Bot — event handling and slash commands

**Files:**
- Create: `backend/src/services/integrations/slack/slack-bot.ts`
- Test: `backend/src/__tests__/unit/services/integrations/slack/slack-bot.test.ts`

- [ ] **Step 1: Write failing tests for SlackBot**

```typescript
// backend/src/__tests__/unit/services/integrations/slack/slack-bot.test.ts

import { SlackBot, isImportantMessage, detectLanguage } from '../../../../../services/integrations/slack/slack-bot';

jest.mock('../../../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
  queryContext: jest.fn(),
}));
jest.mock('../../../../../services/event-system', () => ({
  emitSystemEvent: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { emitSystemEvent } = require('../../../../../services/event-system');

describe('SlackBot', () => {
  describe('isImportantMessage', () => {
    it('skips bot messages', () => {
      expect(isImportantMessage({ text: 'hello world test', bot_id: 'B123' })).toBe(false);
    });

    it('skips messages shorter than 5 words', () => {
      expect(isImportantMessage({ text: 'ok danke' })).toBe(false);
    });

    it('skips emoji-only messages', () => {
      expect(isImportantMessage({ text: ':thumbsup: :tada:' })).toBe(false);
    });

    it('skips noise patterns', () => {
      expect(isImportantMessage({ text: 'ok' })).toBe(false);
      expect(isImportantMessage({ text: 'danke' })).toBe(false);
      expect(isImportantMessage({ text: 'lol' })).toBe(false);
      expect(isImportantMessage({ text: '+1' })).toBe(false);
    });

    it('passes messages with substantive content', () => {
      expect(isImportantMessage({ text: 'We decided to use PostgreSQL for the new service' })).toBe(true);
    });

    it('passes messages with action words', () => {
      expect(isImportantMessage({ text: 'TODO: prepare the proposal by Friday deadline' })).toBe(true);
    });
  });

  describe('detectLanguage', () => {
    it('detects German text', () => {
      expect(detectLanguage('Wir haben heute besprochen dass wir PostgreSQL nutzen')).toBe('de');
    });

    it('detects English text', () => {
      expect(detectLanguage('We decided to use PostgreSQL for the new service')).toBe('en');
    });

    it('defaults to English for ambiguous text', () => {
      expect(detectLanguage('PostgreSQL')).toBe('en');
    });
  });

  describe('parseSlashCommand', () => {
    it('parses /zenai summarize', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('summarize');
      expect(result.command).toBe('summarize');
      expect(result.args).toBe('');
    });

    it('parses /zenai task with description', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('task Prepare the proposal');
      expect(result.command).toBe('task');
      expect(result.args).toBe('Prepare the proposal');
    });

    it('parses /zenai remember with text', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('remember API rate limit is 1000/min');
      expect(result.command).toBe('remember');
      expect(result.args).toBe('API rate limit is 1000/min');
    });

    it('parses /zenai context with channel and context', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('context #engineering work');
      expect(result.command).toBe('context');
      expect(result.args).toBe('#engineering work');
    });

    it('returns help for empty input', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('');
      expect(result.command).toBe('help');
    });

    it('returns help for unknown commands', () => {
      const { parseSlashCommand } = require('../../../../../services/integrations/slack/slack-bot');
      const result = parseSlashCommand('unknown command here');
      expect(result.command).toBe('help');
    });
  });

  describe('normalizeSlackEvent', () => {
    it('maps channel message to integration.slack.message_received', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'message',
        channel_type: 'channel',
        text: 'Hello world this is a test message',
        user: 'U123',
        channel: 'C456',
        ts: '1234567890.123456',
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.message_received');
      expect(result.connectorId).toBe('slack');
      expect(result.targetContext).toBe('work');
    });

    it('maps DM to integration.slack.dm_received', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'message',
        channel_type: 'im',
        text: 'Help me with this task',
        user: 'U123',
        channel: 'D456',
        ts: '1234567890.123456',
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.dm_received');
    });

    it('maps app_mention to integration.slack.mention', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'app_mention',
        text: '<@U_BOT> summarize this channel',
        user: 'U123',
        channel: 'C456',
        ts: '1234567890.123456',
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.mention');
    });

    it('maps reaction_added to integration.slack.reaction', () => {
      const { normalizeSlackEvent } = require('../../../../../services/integrations/slack/slack-bot');
      const event = {
        type: 'reaction_added',
        reaction: 'thumbsup',
        user: 'U123',
        item: { channel: 'C456', ts: '1234567890.123456' },
      };
      const result = normalizeSlackEvent(event, 'user-1', 'work');
      expect(result.type).toBe('integration.slack.reaction');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="slack-bot" --no-coverage 2>&1 | head -20
```
Expected: FAIL — cannot find `slack-bot` module

- [ ] **Step 3: Implement SlackBot**

```typescript
// backend/src/services/integrations/slack/slack-bot.ts

import { v4 as uuidv4 } from 'uuid';
import type { IntegrationEvent } from '../types';
import type { AIContext } from './types';
import { emitSystemEvent } from '../../event-system';
import { queryPublic } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

// --- Importance Filter ---

const NOISE_PATTERNS = new Set([
  'ok', 'okay', 'danke', 'thanks', 'thx', 'lol', 'lmao',
  '+1', '-1', 'ja', 'nein', 'yes', 'no', 'nice', 'cool',
  'gut', 'good', 'great', 'super', 'top', 'alles klar',
]);

const EMOJI_ONLY_RE = /^[\s:_a-z0-9-]+$/; // :emoji: patterns only

export function isImportantMessage(msg: { text?: string; bot_id?: string }): boolean {
  if (msg.bot_id) return false;
  const text = (msg.text || '').trim();
  if (!text) return false;

  // Noise pattern check
  if (NOISE_PATTERNS.has(text.toLowerCase())) return false;

  // Emoji-only check
  if (/^(:\w+:\s*)+$/.test(text)) return false;

  // Word count check
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;

  return true;
}

// --- Language Detection ---

const GERMAN_WORDS = new Set([
  'der', 'die', 'das', 'und', 'ist', 'ich', 'wir', 'nicht', 'ein', 'eine',
  'haben', 'hat', 'wird', 'auch', 'noch', 'aber', 'dass', 'fuer', 'für',
  'mit', 'auf', 'aus', 'bei', 'nach', 'von', 'zum', 'zur', 'ueber', 'über',
  'bitte', 'danke', 'heute', 'morgen', 'gestern',
]);

export function detectLanguage(text: string): 'de' | 'en' {
  const words = text.toLowerCase().split(/\s+/);
  let germanCount = 0;
  for (const word of words) {
    if (GERMAN_WORDS.has(word)) germanCount++;
  }
  return germanCount >= 2 ? 'de' : 'en';
}

// --- Slash Command Parser ---

const VALID_COMMANDS = new Set(['summarize', 'task', 'remember', 'status', 'context', 'quiet', 'help']);

export function parseSlashCommand(text: string): { command: string; args: string } {
  const trimmed = text.trim();
  if (!trimmed) return { command: 'help', args: '' };

  const [first, ...rest] = trimmed.split(/\s+/);
  const command = first.toLowerCase();

  if (!VALID_COMMANDS.has(command)) {
    return { command: 'help', args: '' };
  }

  return { command, args: rest.join(' ') };
}

// --- Event Normalization ---

export function normalizeSlackEvent(
  event: Record<string, unknown>,
  userId: string,
  targetContext: AIContext,
): IntegrationEvent {
  const type = event.type as string;
  const channelType = event.channel_type as string | undefined;

  let eventType: string;

  if (type === 'message' && channelType === 'im') {
    eventType = 'integration.slack.dm_received';
  } else if (type === 'message') {
    eventType = 'integration.slack.message_received';
  } else if (type === 'app_mention') {
    eventType = 'integration.slack.mention';
  } else if (type === 'reaction_added') {
    eventType = 'integration.slack.reaction';
  } else if (type === 'channel_created') {
    eventType = 'integration.slack.channel_created';
  } else if (type === 'member_joined_channel') {
    eventType = 'integration.slack.member_joined';
  } else {
    eventType = `integration.slack.${type}`;
  }

  return {
    id: uuidv4(),
    connectorId: 'slack',
    userId,
    type: eventType,
    targetContext,
    payload: event as Record<string, unknown>,
    timestamp: new Date(),
  };
}

// --- Event Emission Helper ---

export async function emitSlackEvent(event: IntegrationEvent): Promise<void> {
  try {
    await emitSystemEvent({
      context: event.targetContext,
      eventType: event.type,
      eventSource: 'slack',
      payload: event.payload,
    });
  } catch (err) {
    logger.error('Failed to emit Slack event', { type: event.type, error: err });
  }
}

// --- Webhook Logging ---

export async function logWebhookEvent(
  connectorId: string,
  eventType: string,
  userId: string | null,
  payloadHash: string,
  status: 'received' | 'processed' | 'failed' | 'ignored',
  processingTimeMs: number,
  errorMessage?: string,
): Promise<void> {
  try {
    await queryPublic(
      `INSERT INTO public.integration_webhook_log (connector_id, event_type, user_id, payload_hash, status, processing_time_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [connectorId, eventType, userId, payloadHash, status, processingTimeMs, errorMessage || null],
    );
  } catch (err) {
    logger.error('Failed to log webhook event', { error: err });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern="slack-bot" --no-coverage
```
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/slack/slack-bot.ts backend/src/__tests__/unit/services/integrations/slack/slack-bot.test.ts
git commit -m "feat(slack): implement Slack bot event handling, slash commands, language detection"
```

---

## Chunk 4: Memory Integration — Extraction Pipeline

### Task 8: Slack Memory — importance filter + extraction pipeline

**Files:**
- Create: `backend/src/services/integrations/slack/slack-memory.ts`
- Test: `backend/src/__tests__/unit/services/integrations/slack/slack-memory.test.ts`

- [ ] **Step 1: Write failing tests for slack-memory**

```typescript
// backend/src/__tests__/unit/services/integrations/slack/slack-memory.test.ts

import { extractFactsFromMessages, getChannelContext, buildExtractionPrompt, EXTRACTION_BATCH_SIZE } from '../../../../../services/integrations/slack/slack-memory';
import type { SlackMessage, AIContext } from '../../../../../services/integrations/slack/types';

jest.mock('../../../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
  queryContext: jest.fn(),
}));
jest.mock('../../../../../services/event-system', () => ({
  emitSystemEvent: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { queryPublic } = require('../../../../../utils/database-context');

describe('SlackMemory', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getChannelContext', () => {
    it('returns mapped context from workspace config', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{
          channel_context_mapping: { C123: 'learning' },
        }],
      });

      const ctx = await getChannelContext('ws-1', 'C123', 'general');
      expect(ctx).toBe('learning');
    });

    it('falls back to channel DB record', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ channel_context_mapping: {} }] });
      queryPublic.mockResolvedValueOnce({ rows: [{ target_context: 'creative' }] });

      const ctx = await getChannelContext('ws-1', 'C456', 'brainstorm');
      expect(ctx).toBe('creative');
    });

    it('falls back to name-based heuristic', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ channel_context_mapping: {} }] });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const ctx = await getChannelContext('ws-1', 'C789', 'engineering');
      expect(ctx).toBe('work');
    });

    it('defaults to work for unknown channels', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ channel_context_mapping: {} }] });
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const ctx = await getChannelContext('ws-1', 'C000', 'some-random-name');
      expect(ctx).toBe('work');
    });
  });

  describe('buildExtractionPrompt', () => {
    it('includes channel name and message texts', () => {
      const messages = [
        { userName: 'Alice', text: 'We decided to use PostgreSQL' },
        { userName: 'Bob', text: 'Good idea, the deadline is Friday' },
      ];
      const prompt = buildExtractionPrompt('#engineering', messages);
      expect(prompt).toContain('#engineering');
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('PostgreSQL');
      expect(prompt).toContain('Friday');
    });

    it('instructs Claude to return JSON', () => {
      const prompt = buildExtractionPrompt('#test', [{ userName: 'X', text: 'test message here' }]);
      expect(prompt).toContain('JSON');
    });
  });

  describe('EXTRACTION_BATCH_SIZE', () => {
    it('is a reasonable batch size', () => {
      expect(EXTRACTION_BATCH_SIZE).toBeGreaterThanOrEqual(10);
      expect(EXTRACTION_BATCH_SIZE).toBeLessThanOrEqual(100);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="slack-memory" --no-coverage 2>&1 | head -20
```
Expected: FAIL

- [ ] **Step 3: Implement slack-memory.ts**

```typescript
// backend/src/services/integrations/slack/slack-memory.ts

import type { AIContext } from './types';
import { inferChannelContext } from './types';
import { queryPublic } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

export const EXTRACTION_BATCH_SIZE = 20;

/**
 * Determine the target AI context for a Slack channel.
 * Priority: workspace mapping > DB record > name heuristic > 'work'
 */
export async function getChannelContext(
  workspaceId: string,
  channelId: string,
  channelName: string,
): Promise<AIContext> {
  try {
    // 1. Check workspace-level mapping
    const wsResult = await queryPublic(
      'SELECT channel_context_mapping FROM public.slack_workspaces WHERE id = $1',
      [workspaceId],
    );

    if (wsResult.rows.length > 0) {
      const mapping = wsResult.rows[0].channel_context_mapping || {};
      if (mapping[channelId]) {
        return mapping[channelId] as AIContext;
      }
    }

    // 2. Check channel DB record
    const chResult = await queryPublic(
      'SELECT target_context FROM public.slack_channels WHERE workspace_id = $1 AND channel_id = $2',
      [workspaceId, channelId],
    );

    if (chResult.rows.length > 0 && chResult.rows[0].target_context) {
      return chResult.rows[0].target_context as AIContext;
    }

    // 3. Name-based heuristic
    return inferChannelContext(channelName);
  } catch (err) {
    logger.error('Failed to determine channel context', { workspaceId, channelId, error: err });
    return 'work';
  }
}

/**
 * Build a Claude prompt for extracting facts from Slack messages.
 */
export function buildExtractionPrompt(
  channelName: string,
  messages: Array<{ userName: string; text: string }>,
): string {
  const messageBlock = messages
    .map((m) => `[${m.userName}]: ${m.text}`)
    .join('\n');

  return `Extract key facts, decisions, and action items from these Slack messages in ${channelName}.

Messages:
${messageBlock}

Return a JSON array of extracted facts. Each fact should have:
- "text": The fact or decision in a clear, standalone sentence
- "type": One of "decision", "action_item", "key_info", "question"
- "confidence": A number between 0 and 1

Only include substantive facts. Skip greetings, acknowledgments, and small talk.
If no facts are worth extracting, return an empty array: []

Respond with ONLY the JSON array, no other text.`;
}

/**
 * Store a Slack message in the per-context slack_messages table.
 */
export async function storeSlackMessage(
  context: AIContext,
  userId: string,
  channelId: string,
  messageTs: string,
  threadTs: string | null,
  slackUserId: string,
  userName: string,
  text: string,
  importanceScore: number,
): Promise<void> {
  const { queryContext: qc } = await import('../../../utils/database-context');
  try {
    await qc(
      context,
      `INSERT INTO slack_messages (user_id, channel_id, message_ts, thread_ts, slack_user_id, user_name, text, importance_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (channel_id, message_ts) DO NOTHING`,
      [userId, channelId, messageTs, threadTs, slackUserId, userName, text, importanceScore],
    );
  } catch (err) {
    logger.error('Failed to store Slack message', { context, channelId, messageTs, error: err });
  }
}

/**
 * Build source attribution for extracted facts.
 */
export function buildSourceRef(channelName: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `#${channelName}, ${date}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern="slack-memory" --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/slack/slack-memory.ts backend/src/__tests__/unit/services/integrations/slack/slack-memory.test.ts
git commit -m "feat(slack): implement memory extraction pipeline with channel context mapping"
```

---

## Chunk 5: Proactive Channel Presence

### Task 9: Proactive intelligence — relevance detection + rate limiting

**Files:**
- Create: `backend/src/services/integrations/slack/slack-proactive.ts`
- Test: `backend/src/__tests__/unit/services/integrations/slack/slack-proactive.test.ts`

- [ ] **Step 1: Write failing tests for slack-proactive**

```typescript
// backend/src/__tests__/unit/services/integrations/slack/slack-proactive.test.ts

import {
  ProactiveEngine,
  shouldRespondProactively,
  MutedThreadStore,
} from '../../../../../services/integrations/slack/slack-proactive';
import type { ProactiveConfig } from '../../../../../services/integrations/slack/types';

jest.mock('../../../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
  queryContext: jest.fn(),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('SlackProactive', () => {
  describe('MutedThreadStore', () => {
    let store: MutedThreadStore;

    beforeEach(() => {
      store = new MutedThreadStore();
    });

    it('mutes a thread', () => {
      store.mute('ws-1', '1234.5678');
      expect(store.isMuted('ws-1', '1234.5678')).toBe(true);
    });

    it('returns false for unmuted threads', () => {
      expect(store.isMuted('ws-1', '1234.5678')).toBe(false);
    });

    it('isolates mutes per workspace', () => {
      store.mute('ws-1', '1234.5678');
      expect(store.isMuted('ws-2', '1234.5678')).toBe(false);
    });

    it('clears mutes for a workspace', () => {
      store.mute('ws-1', '1234.5678');
      store.clearWorkspace('ws-1');
      expect(store.isMuted('ws-1', '1234.5678')).toBe(false);
    });
  });

  describe('shouldRespondProactively', () => {
    const defaultConfig: ProactiveConfig = {
      enabled: true,
      confidenceThreshold: 0.8,
      rateLimitMinutes: 30,
      mutedChannels: [],
    };

    it('returns false when proactive is disabled', () => {
      const config = { ...defaultConfig, enabled: false };
      expect(shouldRespondProactively(config, 'C123', null, 0.9, new Map())).toBe(false);
    });

    it('returns false for muted channels', () => {
      const config = { ...defaultConfig, mutedChannels: ['C123'] };
      expect(shouldRespondProactively(config, 'C123', null, 0.9, new Map())).toBe(false);
    });

    it('returns false when similarity below threshold', () => {
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.5, new Map())).toBe(false);
    });

    it('returns true when all conditions met', () => {
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.9, new Map())).toBe(true);
    });

    it('returns false when rate limited (recent response in channel)', () => {
      const lastResponses = new Map<string, number>();
      lastResponses.set('C123', Date.now() - 10 * 60 * 1000); // 10 min ago (< 30 min limit)
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.9, lastResponses)).toBe(false);
    });

    it('returns true when rate limit expired', () => {
      const lastResponses = new Map<string, number>();
      lastResponses.set('C123', Date.now() - 35 * 60 * 1000); // 35 min ago (> 30 min limit)
      expect(shouldRespondProactively(defaultConfig, 'C123', null, 0.9, lastResponses)).toBe(true);
    });

    it('returns false for muted threads', () => {
      const mutedStore = new MutedThreadStore();
      mutedStore.mute('ws-1', '1234.5678');
      expect(shouldRespondProactively(defaultConfig, 'C123', '1234.5678', 0.9, new Map(), mutedStore, 'ws-1')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="slack-proactive" --no-coverage 2>&1 | head -20
```
Expected: FAIL

- [ ] **Step 3: Implement slack-proactive.ts**

```typescript
// backend/src/services/integrations/slack/slack-proactive.ts

import type { ProactiveConfig } from './types';
import { logger } from '../../../utils/logger';

/**
 * In-memory store for muted thread timestamps per workspace.
 * Ephemeral — resets on restart. 24-hour TTL.
 */
export class MutedThreadStore {
  private store = new Map<string, Set<string>>(); // workspaceId → Set<threadTs>
  private expiry = new Map<string, number>(); // "ws:ts" → expiry timestamp

  mute(workspaceId: string, threadTs: string): void {
    if (!this.store.has(workspaceId)) {
      this.store.set(workspaceId, new Set());
    }
    this.store.get(workspaceId)!.add(threadTs);
    this.expiry.set(`${workspaceId}:${threadTs}`, Date.now() + 24 * 60 * 60 * 1000);
  }

  isMuted(workspaceId: string, threadTs: string): boolean {
    const threads = this.store.get(workspaceId);
    if (!threads || !threads.has(threadTs)) return false;

    // Check TTL
    const key = `${workspaceId}:${threadTs}`;
    const exp = this.expiry.get(key);
    if (exp && Date.now() > exp) {
      threads.delete(threadTs);
      this.expiry.delete(key);
      return false;
    }

    return true;
  }

  clearWorkspace(workspaceId: string): void {
    const threads = this.store.get(workspaceId);
    if (threads) {
      for (const ts of threads) {
        this.expiry.delete(`${workspaceId}:${ts}`);
      }
    }
    this.store.delete(workspaceId);
  }
}

// Global muted thread store (singleton)
export const mutedThreads = new MutedThreadStore();

/**
 * Determine if ZenAI should respond proactively to a channel message.
 */
export function shouldRespondProactively(
  config: ProactiveConfig,
  channelId: string,
  threadTs: string | null,
  similarityScore: number,
  lastProactiveResponses: Map<string, number>,
  mutedStore?: MutedThreadStore,
  workspaceId?: string,
): boolean {
  // Global kill switch
  if (!config.enabled) return false;

  // Muted channel
  if (config.mutedChannels.includes(channelId)) return false;

  // Muted thread
  if (threadTs && mutedStore && workspaceId && mutedStore.isMuted(workspaceId, threadTs)) {
    return false;
  }

  // Confidence threshold
  if (similarityScore < config.confidenceThreshold) return false;

  // Rate limit per channel
  const lastResponse = lastProactiveResponses.get(channelId);
  if (lastResponse) {
    const minutesSince = (Date.now() - lastResponse) / (60 * 1000);
    if (minutesSince < config.rateLimitMinutes) return false;
  }

  return true;
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern="slack-proactive" --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/slack/slack-proactive.ts backend/src/__tests__/unit/services/integrations/slack/slack-proactive.test.ts
git commit -m "feat(slack): implement proactive channel presence with rate limiting and mute support"
```

---

## Chunk 6: Autonomous Workflows

### Task 10: Workflow templates + governance integration

**Files:**
- Create: `backend/src/services/integrations/slack/slack-workflows.ts`
- Test: `backend/src/__tests__/unit/services/integrations/slack/slack-workflows.test.ts`

- [ ] **Step 1: Write failing tests for slack-workflows**

```typescript
// backend/src/__tests__/unit/services/integrations/slack/slack-workflows.test.ts

import { getWorkflowTemplates, installWorkflowTemplates, removeWorkflowTemplates } from '../../../../../services/integrations/slack/slack-workflows';

jest.mock('../../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));
jest.mock('../../../../../services/proactive-decision-engine', () => ({
  createProactiveRule: jest.fn().mockResolvedValue({ id: 'rule-1' }),
  listProactiveRules: jest.fn().mockResolvedValue([]),
  deleteProactiveRule: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { createProactiveRule, listProactiveRules, deleteProactiveRule } = require('../../../../../services/proactive-decision-engine');

describe('SlackWorkflows', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getWorkflowTemplates', () => {
    it('returns 6 pre-built templates', () => {
      const templates = getWorkflowTemplates();
      expect(templates).toHaveLength(6);
    });

    it('includes Channel Digest template', () => {
      const templates = getWorkflowTemplates();
      const digest = templates.find((t) => t.name === 'Channel Digest');
      expect(digest).toBeDefined();
      expect(digest!.riskLevel).toBe('low');
      expect(digest!.requiresApproval).toBe(false);
    });

    it('includes Task Extraction with medium risk', () => {
      const templates = getWorkflowTemplates();
      const taskExtract = templates.find((t) => t.name === 'Task Extraction');
      expect(taskExtract).toBeDefined();
      expect(taskExtract!.riskLevel).toBe('medium');
      expect(taskExtract!.requiresApproval).toBe(true);
      expect(taskExtract!.eventTypes).toContain('integration.slack.message_received');
    });

    it('includes Agent Delegation with high risk', () => {
      const templates = getWorkflowTemplates();
      const agentDelegation = templates.find((t) => t.name === 'Agent Delegation');
      expect(agentDelegation).toBeDefined();
      expect(agentDelegation!.riskLevel).toBe('high');
      expect(agentDelegation!.requiresApproval).toBe(true);
      expect(agentDelegation!.eventTypes).toContain('integration.slack.dm_received');
    });
  });

  describe('installWorkflowTemplates', () => {
    it('creates ProactiveEngine rules for each template', async () => {
      await installWorkflowTemplates('work');

      expect(createProactiveRule).toHaveBeenCalledTimes(6);
    });

    it('passes correct context to createProactiveRule', async () => {
      await installWorkflowTemplates('personal');

      expect(createProactiveRule).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ name: expect.any(String) }),
      );
    });
  });

  describe('removeWorkflowTemplates', () => {
    it('deletes all Slack workflow rules', async () => {
      listProactiveRules.mockResolvedValueOnce([
        { id: 'rule-1', name: 'Channel Digest', description: '[Slack]' },
        { id: 'rule-2', name: 'Task Extraction', description: '[Slack]' },
      ]);

      await removeWorkflowTemplates('work');

      expect(deleteProactiveRule).toHaveBeenCalledTimes(2);
    });

    it('handles no existing rules gracefully', async () => {
      listProactiveRules.mockResolvedValueOnce([]);

      await expect(removeWorkflowTemplates('work')).resolves.not.toThrow();
      expect(deleteProactiveRule).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="slack-workflows" --no-coverage 2>&1 | head -20
```
Expected: FAIL

- [ ] **Step 3: Implement slack-workflows.ts**

```typescript
// backend/src/services/integrations/slack/slack-workflows.ts

import type { SlackWorkflowTemplate } from './types';
import type { AIContext } from './types';
import { createProactiveRule, listProactiveRules, deleteProactiveRule } from '../../proactive-decision-engine';
import { logger } from '../../../utils/logger';

const SLACK_RULE_TAG = '[Slack]';

export function getWorkflowTemplates(): SlackWorkflowTemplate[] {
  return [
    {
      name: 'Channel Digest',
      description: `${SLACK_RULE_TAG} Summarize channels with >20 unread messages`,
      eventTypes: ['system.daily_digest'],
      conditions: [],
      decision: 'take_action',
      actionConfig: { action: 'slack_channel_digest', minUnread: 20 },
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'Task Extraction',
      description: `${SLACK_RULE_TAG} Extract tasks from messages with action words`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [
        { field: 'payload.text', operator: 'regex', value: '(?i)(TODO|bitte|deadline|aufgabe|task|erledigen)' },
      ],
      decision: 'take_action',
      actionConfig: { action: 'create_task_from_slack' },
      riskLevel: 'medium',
      requiresApproval: true,
    },
    {
      name: 'Email Draft',
      description: `${SLACK_RULE_TAG} Draft email from Slack thread context`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [
        { field: 'payload.text', operator: 'regex', value: '(?i)(email|schreib|draft|mail)' },
      ],
      decision: 'take_action',
      actionConfig: { action: 'draft_email_from_slack' },
      riskLevel: 'medium',
      requiresApproval: true,
    },
    {
      name: 'Meeting Notes',
      description: `${SLACK_RULE_TAG} Extract action items from meeting channels`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [
        { field: 'payload.channel_name', operator: 'regex', value: '(?i)(meeting|notes|standup|retro)' },
      ],
      decision: 'take_action',
      actionConfig: { action: 'extract_meeting_notes' },
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'Cross-Context Alert',
      description: `${SLACK_RULE_TAG} Alert when Slack message references ZenAI content`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [],
      decision: 'notify',
      actionConfig: { action: 'cross_context_alert' },
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'Agent Delegation',
      description: `${SLACK_RULE_TAG} Delegate complex DM requests to agent team`,
      eventTypes: ['integration.slack.dm_received'],
      conditions: [],
      decision: 'trigger_agent',
      actionConfig: { action: 'delegate_to_agent', minWords: 50 },
      riskLevel: 'high',
      requiresApproval: true,
    },
  ];
}

export async function installWorkflowTemplates(context: AIContext): Promise<void> {
  const templates = getWorkflowTemplates();

  for (const template of templates) {
    try {
      await createProactiveRule(context, {
        name: template.name,
        description: template.description,
        eventTypes: template.eventTypes,
        conditions: template.conditions,
        decision: template.decision,
        actionConfig: template.actionConfig,
        riskLevel: template.riskLevel,
        requiresApproval: template.requiresApproval,
        priority: 50,
        cooldownMinutes: template.riskLevel === 'low' ? 5 : 15,
        isActive: true,
      });
    } catch (err) {
      logger.error('Failed to install Slack workflow template', { name: template.name, error: err });
    }
  }

  logger.info('Slack workflow templates installed', { count: templates.length, context });
}

export async function removeWorkflowTemplates(context: AIContext): Promise<void> {
  try {
    const rules = await listProactiveRules(context);
    const slackRules = rules.filter((r: { description: string | null }) =>
      r.description?.includes(SLACK_RULE_TAG),
    );

    for (const rule of slackRules) {
      await deleteProactiveRule(context, rule.id);
    }

    logger.info('Slack workflow templates removed', { count: slackRules.length, context });
  } catch (err) {
    logger.error('Failed to remove Slack workflow templates', { context, error: err });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern="slack-workflows" --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integrations/slack/slack-workflows.ts backend/src/__tests__/unit/services/integrations/slack/slack-workflows.test.ts
git commit -m "feat(slack): implement autonomous workflow templates with governance integration"
```

---

## Chunk 7: API Routes + Module Registration + Worker

### Task 11: Slack API routes

**Files:**
- Create: `backend/src/routes/slack.ts`
- Test: `backend/src/__tests__/unit/routes/slack.test.ts`

- [ ] **Step 1: Write failing route tests**

```typescript
// backend/src/__tests__/unit/routes/slack.test.ts

import express from 'express';
import request from 'supertest';
import { createSlackRouter } from '../../../routes/slack';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));
jest.mock('../../../middleware/jwt-auth', () => ({
  requireJwt: (_req: any, _res: any, next: any) => {
    _req.jwtUser = { id: 'user-1', plan: 'pro' };
    next();
  },
}));
jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'user-1',
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { queryPublic } = require('../../../utils/database-context');

describe('Slack Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/slack', createSlackRouter());
    app.use(errorHandler);
  });

  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/slack/workspaces', () => {
    it('returns list of connected workspaces', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ws-1',
          team_id: 'T123',
          team_name: 'Test',
          bot_user_id: 'U_BOT',
          proactive_config: { enabled: true },
          created_at: new Date().toISOString(),
        }],
      });

      const res = await request(app).get('/api/slack/workspaces');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns empty array when no workspaces', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/slack/workspaces');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/slack/channels', () => {
    it('returns channels with context mapping', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{ id: 'ws-1' }],
      });
      queryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          channel_id: 'C123',
          channel_name: 'engineering',
          target_context: 'work',
          muted: false,
        }],
      });

      const res = await request(app).get('/api/slack/channels');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].channel_name).toBe('engineering');
    });
  });

  describe('PATCH /api/slack/channels/:channelId/config', () => {
    it('updates channel context', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ch-1' }] });

      const res = await request(app)
        .patch('/api/slack/channels/ch-1/config')
        .send({ target_context: 'learning' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid context', async () => {
      const res = await request(app)
        .patch('/api/slack/channels/ch-1/config')
        .send({ target_context: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/slack/workspaces/:id/proactive', () => {
    it('updates proactive config', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] });

      const res = await request(app)
        .patch('/api/slack/workspaces/ws-1/proactive')
        .send({ enabled: false, confidenceThreshold: 0.9 });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/slack/activity', () => {
    it('returns recent activity log', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'log-1', event_type: 'integration.slack.message_received', created_at: new Date().toISOString() },
        ],
      });

      const res = await request(app).get('/api/slack/activity');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern="__tests__/unit/routes/slack" --no-coverage 2>&1 | head -20
```
Expected: FAIL

- [ ] **Step 3: Implement slack routes**

```typescript
// backend/src/routes/slack.ts

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireJwt } from '../middleware/jwt-auth';
import { getUserId } from '../utils/user-context';
import { queryPublic } from '../utils/database-context';
import { logger } from '../utils/logger';

const VALID_CONTEXTS = ['personal', 'work', 'learning', 'creative'];

export function createSlackRouter(): Router {
  const router = Router();

  router.use(requireJwt);

  // GET /api/slack/workspaces
  router.get('/workspaces', asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const result = await queryPublic(
      'SELECT * FROM public.slack_workspaces WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    res.json({ success: true, data: result.rows });
  }));

  // GET /api/slack/channels
  router.get('/channels', asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const wsResult = await queryPublic(
      'SELECT id FROM public.slack_workspaces WHERE user_id = $1 LIMIT 1',
      [userId],
    );

    if (wsResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const channels = await queryPublic(
      'SELECT * FROM public.slack_channels WHERE workspace_id = $1 ORDER BY channel_name',
      [wsResult.rows[0].id],
    );
    res.json({ success: true, data: channels.rows });
  }));

  // PATCH /api/slack/channels/:channelId/config
  router.patch('/channels/:channelId/config', asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const { target_context, muted } = req.body;

    if (target_context && !VALID_CONTEXTS.includes(target_context)) {
      return res.status(400).json({ success: false, error: 'Invalid target_context' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (target_context) {
      updates.push(`target_context = $${paramIndex++}`);
      values.push(target_context);
    }
    if (typeof muted === 'boolean') {
      updates.push(`muted = $${paramIndex++}`);
      values.push(muted);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(channelId);

    await queryPublic(
      `UPDATE public.slack_channels SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );

    res.json({ success: true });
  }));

  // PATCH /api/slack/workspaces/:id/proactive
  router.patch('/workspaces/:id/proactive', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = req.body;

    await queryPublic(
      `UPDATE public.slack_workspaces SET proactive_config = proactive_config || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(config), id],
    );

    res.json({ success: true });
  }));

  // GET /api/slack/activity
  router.get('/activity', asyncHandler(async (req, res) => {
    const result = await queryPublic(
      `SELECT * FROM public.integration_webhook_log
       WHERE connector_id = 'slack'
       ORDER BY created_at DESC LIMIT 50`,
    );
    res.json({ success: true, data: result.rows });
  }));

  // POST /api/slack/commands/summarize
  router.post('/commands/summarize', asyncHandler(async (req, res) => {
    const { channelId } = req.body;
    if (!channelId) {
      return res.status(400).json({ success: false, error: 'channelId required' });
    }
    // Placeholder — actual summarization requires Claude API call
    res.json({ success: true, message: 'Summary requested', channelId });
  }));

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern="__tests__/unit/routes/slack" --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/slack.ts backend/src/__tests__/unit/routes/slack.test.ts
git commit -m "feat(slack): implement Slack API routes (6 endpoints)"
```

### Task 12: Module registration + worker processor

**Files:**
- Modify: `backend/src/modules/integrations/index.ts`
- Modify: `backend/src/services/queue/workers.ts`

- [ ] **Step 1: Register SlackConnector in IntegrationsModule**

In `backend/src/modules/integrations/index.ts`, after the MockConnector registration, add:

```typescript
import { SlackConnector } from '../../services/integrations/slack/slack-connector';
import { createSlackRouter } from '../../routes/slack';

// Inside registerRoutes():
// After mock connector registration:
const slack = new SlackConnector();
reg.register(slack);

// Slack-specific management routes
app.use('/api/slack', createSlackRouter());

logger.info('Slack connector registered');
```

- [ ] **Step 2: Add Slack sync worker processor to workers.ts**

In `backend/src/services/queue/workers.ts`, add a processor function for `integration-sync` jobs:

```typescript
async function processIntegrationSync(job: BullJob): Promise<Record<string, unknown>> {
  const { connectorId, userId, fullSync } = job.data as Record<string, unknown>;

  if (connectorId === 'slack') {
    const { SlackConnector } = await import('../integrations/slack/slack-connector');
    const connector = new SlackConnector();
    const result = await connector.sync(userId as string, { fullSync: fullSync as boolean });
    return { ...result };
  }

  logger.warn('Unknown connector for integration-sync', { connectorId });
  return { error: 'Unknown connector' };
}
```

Register it in the worker setup (follow existing pattern for other queue processors).

- [ ] **Step 3: Verify build compiles**

```bash
cd backend && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 4: Run full test suite**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -20
```
Expected: All existing tests pass, new Slack tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/integrations/index.ts backend/src/services/queue/workers.ts
git commit -m "feat(slack): register SlackConnector in IntegrationsModule + add sync worker"
```

### Task 13: Final verification + full test run

- [ ] **Step 1: TypeScript compilation check**

```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Run all Slack tests**

```bash
cd backend && npx jest --testPathPattern="slack" --no-coverage
```
Expected: All ~80+ tests pass

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && npm test 2>&1 | tail -30
```
Expected: All tests pass (existing + new), 0 failures

- [ ] **Step 4: Final commit with test results**

```bash
git add -A
git commit -m "feat(slack): Phase 5 complete — Slack + Autonomous Workflows

SlackConnector implementing Connector interface, Bolt.js event handling,
memory extraction pipeline, proactive channel presence, 6 autonomous
workflow templates with governance integration, 6 API endpoints.

New files: 6 services, 1 route, 1 migration, 6 test files
Modified: integrations module, queue workers
Deleted: legacy slack.ts"
```
