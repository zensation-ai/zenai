/**
 * Tests for Phase 3C integration: gmail-sync-worker emits events
 * and triggers email workflow when new messages arrive.
 */

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

// Use a container object to avoid TDZ issues with jest.mock hoisting
const gmailMocks = {
  syncIncremental: jest.fn(),
};

jest.mock('../../../../services/email/gmail-provider', () => ({
  GmailProvider: jest.fn().mockImplementation(() => ({
    get syncIncremental() { return gmailMocks.syncIncremental; },
  })),
}));

jest.mock('../../../../services/event-system', () => ({
  emitSystemEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../services/email/email-workflow-handler', () => ({
  handleNewEmails: jest.fn().mockResolvedValue(undefined),
}));

import { emitSystemEvent } from '../../../../services/event-system';
import { handleNewEmails } from '../../../../services/email/email-workflow-handler';
import { processGmailSyncJob } from '../../../../services/queue/workers/gmail-sync-worker';

const mockEmitSystemEvent = emitSystemEvent as jest.Mock;
const mockHandleNewEmails = handleNewEmails as jest.Mock;

const PAYLOAD = { accountId: 'acc-1', context: 'personal' as const, googleTokenId: 'tok-1' };

describe('GmailSyncWorker – Phase 3C event integration', () => {
  beforeEach(() => {
    gmailMocks.syncIncremental.mockReset();
    mockEmitSystemEvent.mockReset().mockResolvedValue(undefined);
    mockHandleNewEmails.mockReset().mockResolvedValue(undefined);
  });

  it('should call emitSystemEvent and handleNewEmails when newMessages > 0', async () => {
    gmailMocks.syncIncremental.mockResolvedValue({
      newMessages: 3,
      updatedMessages: 0,
      deletedMessages: 0,
      newCursor: 'abc',
      errors: [],
    });

    await processGmailSyncJob(PAYLOAD);

    // Give the fire-and-forget dynamic import time to resolve
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    expect(mockEmitSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'personal',
        eventType: 'email.received',
        eventSource: 'gmail-sync',
        payload: expect.objectContaining({ newMessages: 3 }),
      })
    );
    expect(mockHandleNewEmails).toHaveBeenCalledWith('personal');
  });

  it('should NOT call emitSystemEvent or handleNewEmails when newMessages = 0', async () => {
    gmailMocks.syncIncremental.mockResolvedValue({
      newMessages: 0,
      updatedMessages: 2,
      deletedMessages: 0,
      newCursor: 'abc',
      errors: [],
    });

    await processGmailSyncJob(PAYLOAD);

    await new Promise(resolve => setImmediate(resolve));

    expect(mockEmitSystemEvent).not.toHaveBeenCalled();
    expect(mockHandleNewEmails).not.toHaveBeenCalled();
  });
});
