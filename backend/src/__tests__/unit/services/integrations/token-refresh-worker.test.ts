import type { OAuthTokens } from '../../../../services/integrations/types';

const mockFindExpiringTokens = jest.fn();
const mockGetValidToken = jest.fn();
jest.mock('../../../../services/integrations/oauth-token-store', () => ({
  OAuthTokenStore: jest.fn().mockImplementation(() => ({
    findExpiringTokens: mockFindExpiringTokens,
    getValidToken: mockGetValidToken,
  })),
}));

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { processTokenRefresh } from '../../../../services/queue/workers/token-refresh-worker';

const makeMockJob = () => ({
  data: {},
  updateProgress: jest.fn().mockResolvedValue(undefined),
});

describe('processTokenRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh expiring tokens when findExpiringTokens returns one token', async () => {
    const expiringToken = { userId: 'user-1', connectorId: 'google' };
    mockFindExpiringTokens.mockResolvedValue([expiringToken]);
    mockGetValidToken.mockResolvedValue({ accessToken: 'new-token' } as OAuthTokens);

    const job = makeMockJob();
    const result = await processTokenRefresh(job);

    expect(result).toEqual({ refreshed: 1, failed: 0 });
    expect(mockFindExpiringTokens).toHaveBeenCalledWith(5);
    expect(mockGetValidToken).toHaveBeenCalledWith('user-1', 'google');
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
    expect(mockQueryPublic).not.toHaveBeenCalled();
  });

  it('should handle refresh failures gracefully and update user_integrations status to error', async () => {
    const expiringToken = { userId: 'user-2', connectorId: 'github' };
    mockFindExpiringTokens.mockResolvedValue([expiringToken]);
    const refreshError = new Error('Token refresh failed: invalid_grant');
    mockGetValidToken.mockRejectedValue(refreshError);
    mockQueryPublic.mockResolvedValue({ rows: [] });

    const job = makeMockJob();
    const result = await processTokenRefresh(job);

    expect(result).toEqual({ refreshed: 0, failed: 1 });
    expect(mockGetValidToken).toHaveBeenCalledWith('user-2', 'github');
    expect(mockQueryPublic).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.user_integrations'),
      ['error', refreshError.message, 'user-2', 'github'],
    );
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('should handle no expiring tokens and return early', async () => {
    mockFindExpiringTokens.mockResolvedValue([]);

    const job = makeMockJob();
    const result = await processTokenRefresh(job);

    expect(result).toEqual({ refreshed: 0, failed: 0 });
    expect(mockGetValidToken).not.toHaveBeenCalled();
    expect(mockQueryPublic).not.toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
