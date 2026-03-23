# Phase 3C: Autonomous Email Workflows

> **Part of:** ZenAI World #1 Masterplan — Phase 3 (Gmail + Google Calendar)
> **Sub-phase:** 3C of 3 (3A: OAuth + Gmail Read/Sync ✅, 3B: Gmail Send ✅, 3C: Autonomous Workflows)
> **Created:** 2026-03-23
> **Depends on:** Phase 3A (Gmail sync), 3B (Gmail send), existing event system + email AI + smart suggestions

---

## Overview

After Gmail sync detects new messages, automatically analyze them with AI and surface actionable suggestions. The sync worker directly calls the email workflow handler — no reliance on the proactive engine's event processing (which requires manual API triggers).

## Scope

**In scope:**
- Emit `email.received` events from Gmail sync (for audit/observability)
- Directly trigger email workflow handler after sync (auto-analyze + suggestions)
- Auto-run `processEmailWithAI()` on unanalyzed Gmail emails
- Create smart suggestions from analysis (reply, create task, add to calendar)
- Seed default workflow configuration on startup

**Out of scope:**
- Gmail Pub/Sub push notifications (keep 60s polling)
- Auto-reply/forward (dangerous actions, deferred)
- Modifying the proactive decision engine's dispatch mechanism

## Architecture

Direct call from sync worker to workflow handler. Event emission for audit trail only.

```
Gmail Sync Worker
  → processGmailSyncJob() returns { newMessages > 0 }
    → emitSystemEvent({ context, eventType: 'email.received', ... })  // audit trail
    → handleNewEmails(context)  // DIRECT CALL, not via proactive engine
      → processUnanalyzedEmails(context)  // auto-categorize via email-ai
      → createEmailSuggestions(context)   // smart suggestions
```

**Why direct call instead of proactive engine:** The proactive engine's `processUnhandledEvents()` is only triggered via manual API call (`POST /api/:context/proactive-engine/process`). There is no automatic post-emit hook. Calling the handler directly from the sync worker ensures immediate processing without adding a scheduler for the proactive engine.

## Event Emission

### Modified: `backend/src/services/queue/workers/gmail-sync-worker.ts`

After sync completes with `newMessages > 0`:

```typescript
if (result.newMessages > 0) {
  // 1. Emit event for audit/observability (fire-and-forget)
  const { emitSystemEvent } = await import('../../event-system');
  emitSystemEvent({
    context: payload.context,
    eventType: 'email.received',
    eventSource: 'gmail-sync',
    payload: {
      accountId: payload.accountId,
      newMessages: result.newMessages,
    },
  }).catch(err => logger.debug('Event emission failed', { error: err.message }));

  // 2. Trigger email workflow (direct call)
  const { handleNewEmails } = await import('../../email/email-workflow-handler');
  await handleNewEmails(payload.context);
}
```

**Note:** `emitSystemEvent` takes a single `EmitOptions` object: `{ context, eventType, eventSource, payload }`. Event emission is fire-and-forget — workflow handler runs regardless.

## Email Workflow Handler

### New file: `backend/src/services/email/email-workflow-handler.ts`

Two functions, called sequentially after sync detects new emails:

**`handleNewEmails(context)`:**
1. Call `processUnanalyzedEmails(context)`
2. Call `createEmailSuggestions(context)`

**`processUnanalyzedEmails(context)`:**
1. Query: `SELECT id FROM emails WHERE provider = 'gmail' AND ai_processed_at IS NULL ORDER BY received_at DESC LIMIT 10`
2. For each email ID: call `processEmailWithAI(context, emailId)` from existing `email-ai.ts`
3. Cap at 10 per cycle to prevent API overload
4. Errors per-email are caught and logged (one failure doesn't stop others)

**`createEmailSuggestions(context)`:**
1. Query recently analyzed emails: `WHERE provider = 'gmail' AND ai_processed_at > now() - interval '5 minutes'`
2. For each email:
   - If `ai_priority IN ('urgent', 'high')`: create suggestion type `email_reply` — "Reply to [subject] from [sender]"
   - If `ai_action_items` has items: create suggestion type `email_task` — "Create tasks from [N] action items"
   - If `ai_category = 'meeting'`: create suggestion type `email_calendar` — "Add meeting to calendar"
3. Dedup: check if suggestion with same `metadata.email_id` already exists (skip if so)
4. Uses existing `createSuggestion()` from `smart-suggestions.ts` (or direct DB insert)

## Smart Suggestion Types

### Modified: `backend/src/services/smart-suggestions.ts`

Add 3 new types to `SuggestionType` union:
- `email_reply`
- `email_task`
- `email_calendar`

Also add entries to `TYPE_WEIGHTS` record (all weight 60 — moderate priority, below `knowledge_gap` at 65, above `hypothesis` at 55):

```typescript
email_reply: 60,
email_task: 60,
email_calendar: 60,
```

## Workflow Configuration Seeding

### New file: `backend/src/services/email/email-workflow-rules.ts`

Seeds a configuration flag into each context that has Gmail accounts. This is simpler than seeding proactive rules (which we no longer use for dispatch). The handler checks this flag before processing.

```typescript
export async function seedEmailWorkflowConfig(context: AIContext): Promise<void>
```

Called from `GmailModule.onStartup()`. Idempotent. Seeds across all 4 contexts.

**Note:** Since we're calling the handler directly (not via proactive rules), "rules" are replaced by a simpler config: whether auto-analysis and auto-suggestions are enabled per context. Stored in existing `memory_settings` table as `email_workflow_enabled: true`.

## Modified Files

| File | Change |
|------|--------|
| `backend/src/services/queue/workers/gmail-sync-worker.ts` | Emit event + call handleNewEmails() |
| `backend/src/services/smart-suggestions.ts` | Add `email_reply/task/calendar` to SuggestionType + TYPE_WEIGHTS |
| `backend/src/modules/gmail/index.ts` | Call `seedEmailWorkflowConfig()` in onStartup() |

## New Files

| File | Purpose |
|------|---------|
| `backend/src/services/email/email-workflow-handler.ts` | handleNewEmails, processUnanalyzedEmails, createEmailSuggestions |
| `backend/src/services/email/email-workflow-rules.ts` | Seed workflow config (idempotent) |
| Test files (2-3) | Unit tests |

## Database Changes

None. Uses existing tables: `system_events`, `smart_suggestions`, `emails`, `memory_settings`.

## Error Handling

| Scenario | Action |
|----------|--------|
| AI processing fails for one email | Log warning, continue to next email |
| All AI calls fail | Log error, suggestions still created from any previously analyzed emails |
| Event emission fails | Log debug, workflow handler still runs (independent) |
| Suggestion creation fails | Log warning, non-fatal |
| Config seeding fails | Log error, workflow still runs (default: enabled) |

## Testing Strategy

**Unit tests:**
- `email-workflow-handler.test.ts` — processUnanalyzedEmails (caps at 10, calls processEmailWithAI per email, handles individual failures), createEmailSuggestions (creates correct types based on priority/action_items/category, dedup check)
- `email-workflow-rules.test.ts` — idempotent seeding
- `gmail-sync-event.test.ts` — event emission + handler call on newMessages > 0, no call on 0 new

**Target:** ~12-15 new tests, 0 regressions.
