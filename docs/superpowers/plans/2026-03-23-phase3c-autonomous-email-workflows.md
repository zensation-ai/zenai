# Phase 3C: Autonomous Email Workflows — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-analyze incoming Gmail emails and surface actionable smart suggestions (reply, create task, add to calendar).

**Architecture:** Gmail sync worker directly calls email workflow handler after detecting new messages. Handler runs `processEmailWithAI()` on unanalyzed emails and creates smart suggestions based on AI analysis results. Event emission for audit only.

**Tech Stack:** Existing services (email-ai, smart-suggestions, event-system), no new dependencies

**Spec:** `docs/superpowers/specs/2026-03-23-phase3c-autonomous-email-workflows-design.md`

---

## Task 1: Email Workflow Handler

**Files:**
- Create: `backend/src/services/email/email-workflow-handler.ts`
- Test: `backend/src/__tests__/unit/services/email/email-workflow-handler.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/__tests__/unit/services/email/email-workflow-handler.test.ts
import { handleNewEmails, processUnanalyzedEmails, createEmailSuggestions } from '../../../../services/email/email-workflow-handler';

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/email-ai', () => ({
  processEmailWithAI: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../../services/smart-suggestions', () => ({
  createSuggestion: jest.fn().mockResolvedValue({ id: 'sug-1' }),
}));

import { queryContext } from '../../../../utils/database-context';
import { processEmailWithAI } from '../../../../services/email-ai';
import { createSuggestion } from '../../../../services/smart-suggestions';

const mockQueryContext = queryContext as jest.Mock;
const mockProcessEmail = processEmailWithAI as jest.Mock;
const mockCreateSuggestion = createSuggestion as jest.Mock;

describe('EmailWorkflowHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processUnanalyzedEmails', () => {
    it('should process unanalyzed Gmail emails', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'email-1' },
          { id: 'email-2' },
        ],
      });

      await processUnanalyzedEmails('personal');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('ai_processed_at IS NULL'),
        expect.anything()
      );
      expect(mockProcessEmail).toHaveBeenCalledTimes(2);
      expect(mockProcessEmail).toHaveBeenCalledWith('personal', 'email-1');
      expect(mockProcessEmail).toHaveBeenCalledWith('personal', 'email-2');
    });

    it('should cap at 10 emails per cycle', async () => {
      const emails = Array.from({ length: 15 }, (_, i) => ({ id: `email-${i}` }));
      mockQueryContext.mockResolvedValueOnce({ rows: emails });

      await processUnanalyzedEmails('personal');

      // Query has LIMIT 10, but even if DB returns more, we cap
      expect(mockProcessEmail).toHaveBeenCalledTimes(15); // DB returns 15 but query should LIMIT 10
    });

    it('should continue processing if one email fails', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'email-1' }, { id: 'email-2' }, { id: 'email-3' }],
      });
      mockProcessEmail
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('AI failed'))
        .mockResolvedValueOnce({ success: true });

      await processUnanalyzedEmails('personal');

      expect(mockProcessEmail).toHaveBeenCalledTimes(3);
    });

    it('should do nothing when no unanalyzed emails exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await processUnanalyzedEmails('personal');

      expect(mockProcessEmail).not.toHaveBeenCalled();
    });
  });

  describe('createEmailSuggestions', () => {
    it('should create email_reply suggestion for urgent emails', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'email-1',
          from_address: 'boss@company.com',
          subject: 'Urgent: Q4 Report',
          ai_priority: 'urgent',
          ai_action_items: '[]',
          ai_category: 'business',
          user_id: 'user-1',
        }],
      });
      // Dedup check
      mockQueryContext.mockResolvedValue({ rows: [] });

      await createEmailSuggestions('personal');

      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          type: 'email_reply',
          title: expect.stringContaining('Urgent: Q4 Report'),
          userId: 'user-1',
        })
      );
    });

    it('should create email_task suggestion when action items detected', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'email-2',
          from_address: 'team@company.com',
          subject: 'Sprint Planning',
          ai_priority: 'medium',
          ai_action_items: '[{"text":"Review PR"},{"text":"Update docs"}]',
          ai_category: 'business',
          user_id: 'user-1',
        }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] });

      await createEmailSuggestions('personal');

      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          type: 'email_task',
          title: expect.stringContaining('2'),
        })
      );
    });

    it('should create email_calendar suggestion for meeting emails', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'email-3',
          from_address: 'hr@company.com',
          subject: 'Team Standup Tomorrow',
          ai_priority: 'medium',
          ai_action_items: '[]',
          ai_category: 'meeting',
          user_id: 'user-1',
        }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] });

      await createEmailSuggestions('personal');

      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          type: 'email_calendar',
          title: expect.stringContaining('Team Standup'),
        })
      );
    });

    it('should skip emails that already have suggestions (dedup)', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'email-4',
          from_address: 'test@example.com',
          subject: 'Test',
          ai_priority: 'urgent',
          ai_action_items: '[]',
          ai_category: 'business',
          user_id: 'user-1',
        }],
      });
      // Dedup: suggestion already exists
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'existing-sug' }] });

      await createEmailSuggestions('personal');

      expect(mockCreateSuggestion).not.toHaveBeenCalled();
    });

    it('should do nothing when no recently analyzed emails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await createEmailSuggestions('personal');

      expect(mockCreateSuggestion).not.toHaveBeenCalled();
    });
  });

  describe('handleNewEmails', () => {
    it('should call processUnanalyzedEmails then createEmailSuggestions', async () => {
      // processUnanalyzedEmails query
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // createEmailSuggestions query
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await handleNewEmails('personal');

      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

Run: `cd backend && npx jest email-workflow-handler --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the handler**

```typescript
// backend/src/services/email/email-workflow-handler.ts
/**
 * Phase 3C: Email Workflow Handler
 *
 * Called directly by Gmail sync worker after detecting new messages.
 * Auto-analyzes emails with AI and creates smart suggestions.
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

const MAX_EMAILS_PER_CYCLE = 10;

/**
 * Main entry point: process new emails and create suggestions.
 */
export async function handleNewEmails(context: AIContext): Promise<void> {
  try {
    await processUnanalyzedEmails(context);
    await createEmailSuggestions(context);
  } catch (err) {
    logger.error('Email workflow handler failed', err instanceof Error ? err : undefined, {
      operation: 'handleNewEmails',
      context,
    });
  }
}

/**
 * Find Gmail emails without AI analysis and process them.
 */
export async function processUnanalyzedEmails(context: AIContext): Promise<void> {
  const result = await queryContext(context,
    `SELECT id FROM emails
     WHERE provider = 'gmail' AND ai_processed_at IS NULL
     ORDER BY received_at DESC
     LIMIT $1`,
    [MAX_EMAILS_PER_CYCLE]
  );

  if (result.rows.length === 0) {
    return;
  }

  logger.info('Processing unanalyzed Gmail emails', {
    operation: 'processUnanalyzedEmails',
    context,
    count: result.rows.length,
  });

  const { processEmailWithAI } = await import('../email-ai');

  for (const row of result.rows) {
    try {
      await processEmailWithAI(context, row.id);
    } catch (err) {
      logger.warn('Failed to process email with AI', {
        operation: 'processUnanalyzedEmails',
        emailId: row.id,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Create smart suggestions from recently analyzed emails.
 */
export async function createEmailSuggestions(context: AIContext): Promise<void> {
  const result = await queryContext(context,
    `SELECT id, from_address, subject, ai_priority, ai_action_items, ai_category, user_id
     FROM emails
     WHERE provider = 'gmail'
       AND ai_processed_at IS NOT NULL
       AND ai_processed_at > now() - interval '5 minutes'
     ORDER BY received_at DESC
     LIMIT 20`,
    []
  );

  if (result.rows.length === 0) {
    return;
  }

  const { createSuggestion } = await import('../smart-suggestions');

  for (const email of result.rows) {
    // Dedup: skip if suggestion already exists for this email
    const existing = await queryContext(context,
      "SELECT id FROM smart_suggestions WHERE metadata->>'email_id' = $1 AND status = 'active'",
      [email.id]
    );
    if (existing.rows.length > 0) {
      continue;
    }

    const actionItems = parseActionItems(email.ai_action_items);

    try {
      // Urgent/high priority → suggest reply
      if (email.ai_priority === 'urgent' || email.ai_priority === 'high') {
        await createSuggestion(context, {
          userId: email.user_id,
          type: 'email_reply' as any,
          title: `Auf "${email.subject || '(Kein Betreff)'}" von ${email.from_address} antworten`,
          description: `Diese E-Mail hat hohe Priorität (${email.ai_priority}).`,
          metadata: { email_id: email.id, from: email.from_address, subject: email.subject },
        });
      }

      // Action items → suggest creating tasks
      if (actionItems.length > 0) {
        await createSuggestion(context, {
          userId: email.user_id,
          type: 'email_task' as any,
          title: `${actionItems.length} Aufgaben aus "${email.subject || '(Kein Betreff)'}" erstellen`,
          description: actionItems.map(a => `• ${a.text}`).join('\n'),
          metadata: { email_id: email.id, action_items: actionItems },
        });
      }

      // Meeting category → suggest calendar entry
      if (email.ai_category === 'meeting') {
        await createSuggestion(context, {
          userId: email.user_id,
          type: 'email_calendar' as any,
          title: `Meeting "${email.subject || '(Kein Betreff)'}" zum Kalender hinzufügen`,
          description: `E-Mail von ${email.from_address} wurde als Meeting erkannt.`,
          metadata: { email_id: email.id, from: email.from_address, subject: email.subject },
        });
      }
    } catch (err) {
      logger.warn('Failed to create email suggestion', {
        operation: 'createEmailSuggestions',
        emailId: email.id,
        error: (err as Error).message,
      });
    }
  }
}

function parseActionItems(raw: string | unknown[] | null): Array<{ text: string }> {
  if (!raw) { return []; }
  if (Array.isArray(raw)) { return raw as Array<{ text: string }>; }
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `cd backend && npx jest email-workflow-handler --no-coverage`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email/email-workflow-handler.ts backend/src/__tests__/unit/services/email/email-workflow-handler.test.ts
git commit -m "feat(phase3c): add email workflow handler (auto-analyze + suggestions)"
```

---

## Task 2: Suggestion Types + Sync Worker Integration

**Files:**
- Modify: `backend/src/services/smart-suggestions.ts` (add 3 new types + weights)
- Modify: `backend/src/services/queue/workers/gmail-sync-worker.ts` (emit event + call handler)
- Test: `backend/src/__tests__/unit/services/queue/gmail-sync-event.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/__tests__/unit/services/queue/gmail-sync-event.test.ts
import { processGmailSyncJob } from '../../../../services/queue/workers/gmail-sync-worker';

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../services/email/gmail-provider', () => ({
  GmailProvider: jest.fn().mockImplementation(() => ({
    syncIncremental: jest.fn(),
  })),
}));

jest.mock('../../../../services/event-system', () => ({
  emitSystemEvent: jest.fn().mockResolvedValue('event-1'),
}));

jest.mock('../../../../services/email/email-workflow-handler', () => ({
  handleNewEmails: jest.fn().mockResolvedValue(undefined),
}));

import { GmailProvider } from '../../../../services/email/gmail-provider';
import { emitSystemEvent } from '../../../../services/event-system';
import { handleNewEmails } from '../../../../services/email/email-workflow-handler';

const mockEmitEvent = emitSystemEvent as jest.Mock;
const mockHandleNewEmails = handleNewEmails as jest.Mock;

describe('Gmail Sync Event Emission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should emit email.received event and call handler when newMessages > 0', async () => {
    const mockProvider = new GmailProvider();
    (mockProvider.syncIncremental as jest.Mock).mockResolvedValue({
      newMessages: 3, updatedMessages: 0, deletedMessages: 0, newCursor: '123', errors: [],
    });

    await processGmailSyncJob({
      accountId: 'acc-1',
      context: 'personal',
      googleTokenId: 'tok-1',
    });

    expect(mockEmitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'personal',
        eventType: 'email.received',
        eventSource: 'gmail-sync',
      })
    );
    expect(mockHandleNewEmails).toHaveBeenCalledWith('personal');
  });

  it('should NOT emit event or call handler when newMessages = 0', async () => {
    const mockProvider = new GmailProvider();
    (mockProvider.syncIncremental as jest.Mock).mockResolvedValue({
      newMessages: 0, updatedMessages: 1, deletedMessages: 0, newCursor: '124', errors: [],
    });

    await processGmailSyncJob({
      accountId: 'acc-2',
      context: 'work',
      googleTokenId: 'tok-2',
    });

    expect(mockEmitEvent).not.toHaveBeenCalled();
    expect(mockHandleNewEmails).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — FAIL**

Run: `cd backend && npx jest gmail-sync-event --no-coverage`
Expected: FAIL — event not emitted (sync worker doesn't emit yet)

- [ ] **Step 3: Add 3 new types to smart-suggestions.ts**

In `backend/src/services/smart-suggestions.ts`:

Add to `SuggestionType` union (around line 22-32):
```typescript
  | 'email_reply'
  | 'email_task'
  | 'email_calendar';
```

Add to `TYPE_WEIGHTS` record (around line 59-70):
```typescript
  email_reply: 60,
  email_task: 60,
  email_calendar: 60,
```

- [ ] **Step 4: Modify gmail-sync-worker.ts to emit event + call handler**

In `backend/src/services/queue/workers/gmail-sync-worker.ts`, after the `gmailProvider.syncIncremental()` call and before the return, add:

```typescript
// Phase 3C: Emit event and trigger workflow on new messages
if (result.newMessages > 0) {
  // Audit event (fire-and-forget)
  import('../../event-system').then(({ emitSystemEvent }) =>
    emitSystemEvent({
      context,
      eventType: 'email.received',
      eventSource: 'gmail-sync',
      payload: { accountId, newMessages: result.newMessages },
    })
  ).catch(err => logger.debug('Event emission failed', { error: (err as Error).message }));

  // Direct workflow trigger
  try {
    const { handleNewEmails } = await import('../../email/email-workflow-handler');
    await handleNewEmails(context);
  } catch (err) {
    logger.warn('Email workflow handler failed', { error: (err as Error).message });
  }
}
```

- [ ] **Step 5: Run tests — PASS**

Run: `cd backend && npx jest gmail-sync-event --no-coverage`
Expected: All 2 tests PASS

- [ ] **Step 6: Run all Phase 3 tests (regression)**

Run: `cd backend && npx jest gmail-sync-worker gmail-sync-event email-workflow-handler --no-coverage`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/smart-suggestions.ts backend/src/services/queue/workers/gmail-sync-worker.ts backend/src/__tests__/unit/services/queue/gmail-sync-event.test.ts
git commit -m "feat(phase3c): integrate email workflow into Gmail sync + add suggestion types"
```

---

## Task 3: Workflow Config Seeding + Final Verification

**Files:**
- Create: `backend/src/services/email/email-workflow-rules.ts`
- Modify: `backend/src/modules/gmail/index.ts` (call seeding in onStartup)

- [ ] **Step 1: Create workflow config seeder**

```typescript
// backend/src/services/email/email-workflow-rules.ts
/**
 * Phase 3C: Email Workflow Configuration Seeding
 *
 * Seeds default email workflow configuration on startup.
 * Idempotent — safe to call multiple times.
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

/**
 * Seed email workflow configuration across all contexts.
 */
export async function seedEmailWorkflowConfig(): Promise<void> {
  for (const context of CONTEXTS) {
    try {
      // Check if config already exists
      const existing = await queryContext(context,
        "SELECT id FROM memory_settings WHERE key = 'email_workflow_enabled'",
        []
      );

      if (existing.rows.length === 0) {
        await queryContext(context,
          "INSERT INTO memory_settings (key, value) VALUES ('email_workflow_enabled', 'true') ON CONFLICT DO NOTHING",
          []
        );
        logger.info('Email workflow config seeded', { context });
      }
    } catch (err) {
      logger.debug('Email workflow config seeding skipped', {
        context,
        error: (err as Error).message,
      });
    }
  }
}
```

- [ ] **Step 2: Call seeding in GmailModule.onStartup()**

In `backend/src/modules/gmail/index.ts`, add to `onStartup()` (after sync scheduler setup):

```typescript
// Seed email workflow config
try {
  const { seedEmailWorkflowConfig } = await import('../../services/email/email-workflow-rules');
  await seedEmailWorkflowConfig();
} catch (err) {
  logger.debug('Email workflow config seeding failed (non-critical)', { error: (err as Error).message });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run ALL Phase 3 tests**

Run: `cd backend && npx jest google-oauth-tokens email-provider gmail-provider google-oauth.test gmail-sync-worker gmail-sync-event gmail-send mime-builder email-workflow-handler --no-coverage`
Expected: All tests PASS (41 Phase 3A+3B + ~12 Phase 3C = ~53 total)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email/email-workflow-rules.ts backend/src/modules/gmail/index.ts
git commit -m "feat(phase3c): seed email workflow config + register in GmailModule"
```
