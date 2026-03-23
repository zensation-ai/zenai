# Phase 5: Slack + Autonomous Workflows — Design Spec

> **Date:** 2026-03-23
> **Status:** Draft
> **Part of:** ZenAI World #1 Masterplan (Phase 5 of 8)
> **Goal:** Bidirectional Slack integration with proactive channel presence and autonomous workflows governed by the existing approval system.

---

## Context

ZenAI has a production-ready Integration Framework (Phase 1) with `Connector` interface, `IntegrationRegistry`, `OAuthTokenStore`, and `WebhookRouter`. A partial `slack.ts` service exists with OAuth helpers and signature verification. The ProactiveEngine (Phase 54) provides rule-based event processing with Governance approval. The AgentOrchestrator (Phase 45) enables multi-agent task execution.

Phase 5 builds on all of these to create a full Slack integration: connector, bot, memory sync, proactive intelligence, and autonomous workflows.

### Existing Code to Extend

| File | Purpose | How We Extend It |
|------|---------|------------------|
| `services/integrations/types.ts` | Connector interface | SlackConnector implements it |
| `services/integrations/integration-registry.ts` | Connector discovery | Register SlackConnector at startup |
| `services/integrations/oauth-token-store.ts` | Encrypted tokens | Store Slack bot tokens |
| `services/event-system.ts` | Persistent event bus | Emit `integration.slack.*` events (see note below) |
| `services/proactive-decision-engine.ts` | Rule-based actions | Match `integration.slack.*` events, trigger workflows |
| `services/agent-orchestrator.ts` | Multi-agent execution | Delegate complex Slack requests to agent teams |
| `services/queue/job-queue.ts` | BullMQ (9 queues) | Use existing `integration-sync` queue for sync jobs |
| `modules/integrations/index.ts` | Module registration | Register SlackConnector + slack routes |

**Note on WebhookRouter vs Bolt.js:** Slack webhooks do NOT use the generic `WebhookRouter`. Instead, Bolt.js is the Express handler for `/api/webhooks/integrations/slack`. This is because Bolt.js must control the HTTP response (3-second acknowledgment requirement) and performs its own signature verification. After Bolt.js processes the event, the SlackConnector emits events directly via `emitSystemEvent()` with the `integration.` prefix for ProactiveEngine compatibility. Dedup and webhook logging are handled inside `slack-bot.ts` (not WebhookRouter).

**Note on event type prefix:** The `emitSystemEvent()` function accepts arbitrary `eventType` strings — the `SystemEventType` union in `event-system.ts` is informational only, not enforced at runtime. We use the `integration.slack.*` prefix convention (e.g., `integration.slack.message_received`) to match how WebhookRouter prefixes events for other connectors. No changes to `event-system.ts` required.

### Legacy Code Migration

The existing `backend/src/services/slack.ts` and Slack-related routes in `backend/src/routes/integrations.ts` are superseded by this design. During implementation:
- `services/slack.ts` is deleted — its OAuth helpers are replaced by the Integration Framework's `OAuthTokenStore` + standard OAuth flow
- Slack-specific routes in `routes/integrations.ts` are removed — replaced by `routes/slack.ts` and the Integration Framework management endpoints
- Any existing `public.slack_messages` or `public.slack_webhook_events` tables are dropped by the migration (replaced by per-context `{context}.slack_messages`)
- Environment variables `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` are reused as-is

### Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slack SDK | `@slack/bolt` | Official SDK. Handles event verification, rate limiting, retries, Block Kit. Battle-tested. |
| Bot mode | HTTP (Events API) | Fits existing Express architecture. No separate WebSocket process. |
| Autonomous actions | ProactiveEngine rules | Reuses existing governance, audit, approval infrastructure. Not hardcoded. |
| Memory integration | Selective extraction | Not every message becomes a fact. Claude filters for decisions, action items, key info. |
| Proactive presence | Thread replies only | Reduces noise. Never posts top-level messages unsolicited. |
| Channel→context mapping | Configurable per workspace | Heuristic defaults, user can override via slash command or Settings UI. |
| Frontend changes | None in this phase | Existing Settings > Integrations page reads from IntegrationRegistry. Slack-specific config UI is a follow-up. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Slack Events API / Slash Commands / Interactive Callbacks   │
│  POST /api/webhooks/integrations/slack                       │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Bolt.js HTTP Receiver (Express handler)                     │
│  - Verifies Slack signing secret (HMAC-SHA256 v0)            │
│  - Acknowledges within 3 seconds (HTTP 200)                  │
│  - Routes to event/command/action handlers                   │
│  - Logs to integration_webhook_log (dedup via message_ts)    │
└──────────┬───────────┬───────────┬───────────────────────────┘
           │           │           │
    ┌──────▼──────┐  ┌─▼─────────┐  ┌─▼──────────────────────┐
    │ Bot Actions │  │ Memory    │  │ Event Emission          │
    │             │  │ Pipeline  │  │                         │
    │ DM reply    │  │           │  │ emitSystemEvent({       │
    │ @mention    │  │ Filter    │  │   eventType:            │
    │ Slash cmds  │  │ Extract   │  │   'integration.slack.*' │
    │ Approvals   │  │ Store     │  │ })                      │
    └─────────────┘  │ as facts  │  │         │               │
                     └───────────┘  └─────────┼───────────────┘
                                              │
                                    ┌─────────▼───────────────┐
                                    │ ProactiveEngine         │
                                    │ (Autonomous Workflows)  │
                                    │                         │
                                    │ Match integration.slack.*│
                                    │ Check conditions        │
                                    │ Governance approval     │
                                    │ Execute action          │
                                    └─────────────────────────┘
```

---

## Component Details

### 1. SlackConnector

**File:** `backend/src/services/integrations/slack/slack-connector.ts`

Implements the `Connector` interface from Phase 1.

```typescript
interface SlackConnectorTokens extends OAuthTokens {
  botUserId: string;
  teamId: string;
  teamName: string;
}
```

**OAuth callback flow (in `routes/slack.ts`):**
The Slack OAuth callback extracts `botUserId`, `teamId`, and `teamName` from the Slack `oauth.v2.access` response before calling `registry.install()`. It assembles a `SlackConnectorTokens` object and passes it to `OAuthTokenStore.storeTokens()`. The `connect()` method then retrieves tokens via `tokenStore.getValidToken(userId, 'slack')` and casts to `SlackConnectorTokens` to access the Slack-specific fields. The `botUserId` and `teamId` are also stored in the `slack_workspaces` table for quick lookup without token decryption.

**`connect(userId, tokens)`:**
1. Cast `tokens` to `SlackConnectorTokens` to access `botUserId`, `teamId`, `teamName`
2. Store workspace metadata in `slack_workspaces`
3. Fetch channel list via Slack Web API (`conversations.list`)
4. Store channels in `slack_channels` with default context mapping
5. Install pre-built workflow templates as ProactiveEngine rules
6. Initialize Bolt.js app instance for this workspace

**`disconnect(userId)`:**
1. Remove workflow templates (ProactiveEngine rules with `source: 'slack'`)
2. Delete channel records
3. Delete workspace record
4. Revoke Slack token via `auth.revoke`

**`sync(userId, options)`:**
1. Retrieve bot token from `OAuthTokenStore` via `tokenStore.getValidToken(userId, 'slack')`
2. Fetch channels (`conversations.list`) — update membership, new channels
3. For each member channel: fetch recent messages (`conversations.history`) using cursor pagination
4. Store messages in `{context}.slack_messages`
5. Feed messages through extraction pipeline (batched)
6. Return `SyncResult` with counts

**Sync job payload** (enqueued to `integration-sync` BullMQ queue):
```typescript
interface SlackSyncJobData {
  userId: string;
  connectorId: 'slack';
  workspaceId: string;
  fullSync: boolean;       // true for initial sync, false for incremental
  channelIds?: string[];   // optional: sync specific channels only
}
```
A worker processor for `integration-sync` jobs with `connectorId: 'slack'` must be registered in `workers.ts`. It calls `slackConnector.sync()` with the job data.

**`health(userId)`:**
1. Retrieve bot token from `OAuthTokenStore` via `tokenStore.getValidToken(userId, 'slack')`
2. Call Slack `auth.test` API with the token
3. Return `HealthStatus` with `connected`, `tokenValid`, `tokenExpiresAt`, `lastSync`

**Webhook handling:** Slack webhooks are handled by Bolt.js directly (see Section 2), not via `handleWebhook()`. The `handleWebhook()` method on SlackConnector exists for interface compliance but delegates to the Bolt.js receiver. The `url_verification` challenge is handled in the Express route handler before Bolt.js processes the request.

**OAuth scopes** (Bot Token):
- `channels:history`, `channels:read` — Read public channel messages
- `chat:write` — Post messages/replies
- `commands` — Slash commands
- `reactions:read`, `reactions:write` — Read/add reactions
- `users:read` — User profiles for name resolution
- `im:history`, `im:read`, `im:write` — DM support
- `groups:history`, `groups:read` — Private channels (if invited)

### 2. Slack Bot (Bolt.js)

**File:** `backend/src/services/integrations/slack/slack-bot.ts`

Bolt.js app running in HTTP receiver mode inside Express. One Bolt app instance per connected workspace.

**Event handlers:**

| Slack Event | IntegrationEvent Type | Handler |
|---|---|---|
| `message` (channel) | `integration.slack.message_received` | Store, extract, check proactive rules |
| `message` (DM to bot) | `integration.slack.dm_received` | Route to Claude with full user context |
| `app_mention` | `integration.slack.mention` | Route to Claude with channel context |
| `reaction_added` | `integration.slack.reaction` | Track importance signals + mute detection |
| `channel_created` | `integration.slack.channel_created` | Auto-map to context if name matches pattern |
| `member_joined_channel` | `integration.slack.member_joined` | Update channel membership |

**Slash commands:**

| Command | Action |
|---|---|
| `/zenai summarize` | Summarize current channel (last N messages via Claude) |
| `/zenai task <description>` | Create ZenAI task from Slack context |
| `/zenai remember <text>` | Store as learned fact in target context |
| `/zenai status` | Show connection status + recent activity |
| `/zenai context #channel <context>` | Set channel→context mapping |
| `/zenai quiet #channel` | Disable proactive mode for channel |
| `/zenai help` | List available commands |

**Response behavior:**
- DM responses: detailed, conversational, uses full ZenAI context
- Channel mention responses: concise, focused, in-thread
- Proactive responses: thread replies only, never top-level
- Language: adaptive based on channel language (German/English detection)

### 3. Memory Integration — Extraction Pipeline

**File:** `backend/src/services/integrations/slack/slack-memory.ts`

Selective extraction — not every message becomes a fact.

**Importance filter (fast, no API call):**
- Skip bot messages
- Skip messages < 5 words
- Skip emoji-only / reaction-only
- Skip messages matching noise patterns ("ok", "danke", "lol", "+1")
- Pass: messages with decisions, questions, action items, technical content

**Extraction pipeline (batched, fire-and-forget):**
1. Collect filtered messages per channel (batch every 5 minutes)
2. Send batch to Claude with prompt: "Extract key facts, decisions, action items from these messages. Return structured JSON."
3. Each extracted fact → `storeFact()` in target context schema
4. Triggers: Hebbian KG co-activation, entity resolution (people → contacts), embedding for RAG

**Channel → Context Mapping:**

Default heuristics (configurable per workspace):
- `#engineering`, `#product`, `#sales`, `#ops` → `work`
- `#random`, `#general`, `#watercooler`, `#off-topic` → `personal`
- `#learning`, `#book-club`, `#til`, `#courses` → `learning`
- `#brainstorm`, `#design`, `#ideas`, `#creative` → `creative`
- Unmapped channels → `work` (default)

Override via `/zenai context #channel <context>` or API.

**Source attribution:** Extracted facts include `source_type: 'slack'`, `source_ref: '#channel-name, YYYY-MM-DD'` for traceability in RAG results.

### 4. Proactive Channel Presence

**File:** `backend/src/services/integrations/slack/slack-proactive.ts`

ZenAI monitors channels and contributes when it has relevant context.

**Relevance detection pipeline:**

```
Channel message (post importance filter)
  → Compute embedding (reuse existing embedding service)
  → Compare against user's top-100 learned facts (cached embeddings)
  → If cosine similarity > 0.78: candidate
  → Assemble context: related facts, tasks, emails, ideas
  → Confidence gate: only respond if assembled context adds value (> 0.8)
  → Rate limit: max 1 proactive message per channel per 30 minutes
  → Generate response via Claude with assembled context
  → Post as thread reply
```

**Proactive response types:**

| Type | Example | Trigger |
|---|---|---|
| Context enrichment | "Dazu passend: In eurem Proposal vom 15.3. steht..." | Discussion matches a stored document/idea |
| Reminder | "Reminder: Alex hat am Freitag Deadline fuer das Proposal" | Discussion references a tracked task nearing deadline |
| Contradiction alert | "Achtung: Das widerspricht der Entscheidung vom 10.3. in #product" | New statement conflicts with stored fact |
| Connection | "Das haengt mit dem Ticket zusammen das Sarah in #engineering erwaehnt hat" | Cross-channel topic overlap detected |

**Safety guardrails:**
- Never reveals private DM content in public channels
- Never shares data across contexts that don't match the channel mapping
- Confidence threshold configurable (default 0.8)
- User can react with `:mute:` emoji to suppress bot in that thread. The `reaction_added` handler in `slack-bot.ts` checks if the reaction target is a ZenAI bot message. Muted thread timestamps stored in an in-memory `Set<string>` per workspace with 24-hour TTL (ephemeral, resets on restart — acceptable for low-frequency proactive messages).
- `/zenai quiet #channel` sets `muted: true` on `slack_channels` row (persistent, DB-backed)
- Global kill switch: `proactiveConfig.enabled = false` on `slack_workspaces` row
- All proactive messages audit-logged via `emitSystemEvent()` with `eventType: 'integration.slack.proactive_sent'`

**Cost control:** Embedding similarity check uses cached vectors (no API call). Only response generation calls Claude. Expected: ~5-10 Claude calls/day for a moderately active workspace.

### 5. Autonomous Workflows

**File:** `backend/src/services/integrations/slack/slack-workflows.ts`

Workflows are ProactiveEngine rules that match `slack.*` events. Not hardcoded — users can create, modify, and disable them.

**Pre-built workflow templates** (installed on Slack connect):

| Workflow | Trigger Event | Condition | Action | Risk Level |
|---|---|---|---|---|
| Channel Digest | `system.daily_digest` | Channels with >20 unread messages | Summarize via Claude, post to channel or DM | low (auto) |
| Task Extraction | `integration.slack.message_received` | Message contains action words ("TODO", "bitte", "deadline") | Create ZenAI task, react with checkmark emoji | medium (approval) |
| Email Draft | `integration.slack.message_received` | Message contains "email"/"schreib"/"draft" + @zenai | Draft email from thread context, DM to user for review | medium (approval) |
| Meeting Notes | `integration.slack.message_received` | Message in #meetings or tagged #notes | Extract action items, store as memory facts | low (auto) |
| Cross-Context Alert | `integration.slack.message_received` | Message references a ZenAI idea/task/contact by name | Link context, notify in ZenAI UI | low (auto) |
| Agent Delegation | `integration.slack.dm_received` | Complex request detected (>50 words, multiple steps) | Trigger AgentOrchestrator team, stream progress in thread | high (approval) |

**Governance integration:**
- `low` risk → auto-execute, audit logged
- `medium` risk → requires user approval via Slack DM confirmation (Block Kit buttons: Approve / Reject / Modify)
- `high` risk → requires explicit approval + shows preview of planned action

**Slack-native approval flow:**
1. Workflow triggers with `requiresApproval: true`
2. ZenAI sends Slack DM to workspace owner with Block Kit message:
   - Description of planned action
   - Context summary
   - Approve / Reject / Modify buttons
3. Button callback → `POST /api/webhooks/integrations/slack` (interactive endpoint)
4. Routes to Governance service: `approveAction()` or `rejectAction()`
5. If approved: execute action, post confirmation
6. If rejected: log, no action

### 6. Slack-Specific Types

**File:** `backend/src/services/integrations/slack/types.ts`

```typescript
interface SlackWorkspace {
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

interface ProactiveConfig {
  enabled: boolean;
  confidenceThreshold: number;    // Default: 0.8
  rateLimitMinutes: number;       // Default: 30
  mutedChannels: string[];
}

interface SlackChannel {
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

interface SlackMessage {
  id: string;
  channelId: string;
  messageTs: string;
  threadTs: string | null;
  userId: string;
  userName: string;
  text: string;
  extractedFacts: string[];       // UUID references to learned_facts
  importanceScore: number;
  createdAt: Date;
}

// RuleCondition imported from '../../proactive-decision-engine'
// (exported interface with field, operator, value)
interface SlackWorkflowTemplate {
  name: string;
  description: string;
  eventTypes: string[];
  conditions: RuleCondition[];
  decision: 'notify' | 'prepare_context' | 'take_action' | 'trigger_agent';
  actionConfig: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}
```

---

## Database Schema

### `public.slack_workspaces`

```sql
CREATE TABLE public.slack_workspaces (
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

CREATE INDEX idx_slack_workspaces_user ON public.slack_workspaces(user_id);
```

### `public.slack_channels`

```sql
CREATE TABLE public.slack_channels (
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

CREATE INDEX idx_slack_channels_workspace ON public.slack_channels(workspace_id);
CREATE INDEX idx_slack_channels_context ON public.slack_channels(target_context);
```

### `{context}.slack_messages` (per-context schema)

```sql
-- Created in personal, work, learning, creative schemas
CREATE TABLE slack_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel_id VARCHAR(50) NOT NULL,
  message_ts VARCHAR(50) NOT NULL,
  thread_ts VARCHAR(50),
  slack_user_id VARCHAR(50) NOT NULL,
  user_name VARCHAR(255),
  text TEXT NOT NULL,
  extracted_facts UUID[] DEFAULT '{}',
  importance_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, message_ts)
);

CREATE INDEX idx_slack_messages_channel ON slack_messages(channel_id, created_at DESC);
CREATE INDEX idx_slack_messages_user ON slack_messages(user_id);
CREATE INDEX idx_slack_messages_thread ON slack_messages(thread_ts) WHERE thread_ts IS NOT NULL;
```

---

## API Endpoints

### Slack Management (JWT-protected)

```
GET    /api/slack/workspaces                    - List connected workspaces
GET    /api/slack/channels                      - List channels with context mapping
PATCH  /api/slack/channels/:channelId/config    - Update channel context or muted status
PATCH  /api/slack/workspaces/:id/proactive      - Update proactive config
GET    /api/slack/activity                      - Recent bot activity log
POST   /api/slack/commands/summarize            - Manual channel summary (from ZenAI UI)
```

### Webhook (no auth, Slack signature verified)

```
POST   /api/webhooks/integrations/slack         - Events API + slash commands + interactive callbacks
```

### Integration Framework (existing, no changes)

```
POST   /api/integrations/slack/connect          - Start Slack OAuth flow
GET    /api/integrations/slack/callback          - OAuth callback
DELETE /api/integrations/slack/disconnect        - Disconnect workspace
POST   /api/integrations/slack/sync             - Manual sync trigger
GET    /api/integrations/slack/health           - Connection health check
```

---

## File Structure

```
backend/src/services/integrations/slack/
  slack-connector.ts            # Connector implementation
  slack-bot.ts                  # Bolt.js app, event handlers, slash commands
  slack-memory.ts               # Extraction pipeline, importance filter, fact storage
  slack-proactive.ts            # Relevance detection, confidence gate, response gen
  slack-workflows.ts            # Pre-built workflow templates, Slack-native approval
  types.ts                      # Slack-specific types

backend/src/routes/
  slack.ts                      # Slack-specific API routes

backend/sql/migrations/
  phase5_slack_integration.sql  # DB migration (3 tables)

backend/src/__tests__/unit/services/integrations/slack/
  slack-connector.test.ts       # ~25 tests
  slack-bot.test.ts             # ~25 tests
  slack-memory.test.ts          # ~20 tests
  slack-proactive.test.ts       # ~25 tests
  slack-workflows.test.ts       # ~15 tests

backend/src/__tests__/unit/routes/
  slack.test.ts                 # ~15 tests
```

**Modified files:**
- `backend/src/services/integrations/index.ts` — export SlackConnector
- `backend/src/modules/integrations/index.ts` — register SlackConnector + slack routes
- `backend/package.json` — add `@slack/bolt` dependency

---

## Testing Strategy

### Unit Tests (~130)

| Test Suite | Count | Coverage |
|---|---|---|
| `slack-connector.test.ts` | ~25 | OAuth flow, connect/disconnect lifecycle, sync with cursors, health check, token refresh, url_verification challenge |
| `slack-bot.test.ts` | ~25 | Event routing (message, mention, DM, reaction), slash command parsing, response formatting, rate limiting, language detection |
| `slack-memory.test.ts` | ~20 | Importance filter (skip bots, short, emoji-only), Claude extraction mock, fact storage, channel→context mapping, source attribution |
| `slack-proactive.test.ts` | ~25 | Relevance scoring, confidence gate, rate limit enforcement, mute/quiet handling, safety guardrails (no cross-context leak, no DM leak), response types |
| `slack-workflows.test.ts` | ~15 | Template installation on connect, removal on disconnect, governance routing by risk level, Slack-native approval buttons, action execution |
| `slack.test.ts` | ~15 | All 6 API endpoints, JWT auth checks, validation, error cases, unknown workspace handling |

### Integration Tests (~10)

| Test | What It Proves |
|---|---|
| Connect → sync → receive message → extract fact → recall in chat | Full memory pipeline |
| Webhook → event → proactive rule match → governance → Slack response | Full workflow pipeline |
| Slash command → task creation → confirmation message | Slash command lifecycle |
| DM → Claude response with ZenAI context → reply in thread | Bot conversation flow |

### Mock Strategy

- `MockSlackAPI` — simulates Slack Web API responses (`conversations.list`, `chat.postMessage`, `auth.test`, etc.)
- Bolt.js receiver mocked to process events without real HTTP
- Claude API mocked for extraction and response generation
- EventSystem mocked to verify event emission
- All tests run without Slack credentials (fully offline)

---

## Success Criteria

1. SlackConnector passes all Connector interface lifecycle tests (connect, sync, health, disconnect)
2. Bot responds to DMs and @mentions with contextual ZenAI knowledge
3. Proactive presence adds value in channels without being noisy (rate limited, confidence gated)
4. Autonomous workflows execute with correct governance approval levels
5. Slack messages feed into ZenAI memory and are retrievable via RAG
6. All 6 pre-built workflow templates install on connect and remove on disconnect
7. Safety guardrails prevent cross-context and DM content leaks
8. No breaking changes to existing Integration Framework code — Slack bypasses WebhookRouter (uses Bolt.js directly) but all other connectors continue using WebhookRouter unchanged
9. ~130 tests passing, 0 failures

---

## Out of Scope

| Excluded | Reason |
|----------|--------|
| Frontend Slack config UI | Existing Settings > Integrations page suffices. Dedicated UI is a follow-up. |
| Slack Enterprise Grid | Single-workspace support first. Multi-workspace is Phase 7 (Enterprise). |
| File sharing / uploads | Message-based integration first. File sync is a follow-up. |
| Slack Connect (shared channels) | Complex permission model. Single-org channels first. |
| Custom emoji reactions as commands | Nice-to-have. Slash commands cover all use cases. |
| Voice/Huddle integration | Slack voice is separate API. Out of scope for Phase 5. |

---

## What This Enables (Future Phases)

| Phase | What It Builds On |
|-------|-------------------|
| **Phase 6: Multi-User & Teams** | Shared Slack workspace with team context isolation |
| **Phase 7: Enterprise** | Slack Enterprise Grid, per-tenant rate limits, compliance audit |
| **Phase 8: Launch** | "Connect your Slack in 30 seconds" as key onboarding flow |
