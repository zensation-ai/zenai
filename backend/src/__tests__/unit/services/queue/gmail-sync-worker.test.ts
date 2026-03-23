import { scheduleGmailSyncJobs, processGmailSyncJob } from '../../../../services/queue/workers/gmail-sync-worker';

jest.mock('../../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../services/email/gmail-provider', () => ({
  GmailProvider: jest.fn().mockImplementation(() => ({
    syncIncremental: jest.fn().mockResolvedValue({
      newMessages: 2, updatedMessages: 1, deletedMessages: 0, newCursor: '12345', errors: [],
    }),
  })),
}));

import { pool } from '../../../../utils/database';
const mockPoolQuery = pool.query as jest.Mock;

describe('GmailSyncWorker', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('scheduleGmailSyncJobs', () => {
    it('should find eligible Gmail accounts', async () => {
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

    it('should return empty when no Gmail accounts', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const jobs = await scheduleGmailSyncJobs();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('processGmailSyncJob', () => {
    it('should call syncIncremental', async () => {
      const result = await processGmailSyncJob({
        accountId: 'acc-1', context: 'personal', googleTokenId: 'tok-1',
      });
      expect(result.newMessages).toBe(2);
    });
  });
});
