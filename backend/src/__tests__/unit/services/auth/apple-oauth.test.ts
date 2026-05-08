/**
 * Apple Sign In — OAuthProviderManager.handleAppleCallback unit tests
 */

// Set env vars before any module loads
process.env.APPLE_CLIENT_ID = 'com.example.app.web';
process.env.APPLE_TEAM_ID = 'TEAM123456';
process.env.APPLE_KEY_ID = 'KEY1234567';
process.env.APPLE_PRIVATE_KEY = '-----BEGIN EC PRIVATE KEY-----\nfake\n-----END EC PRIVATE KEY-----';

const mockPoolQuery = jest.fn();
jest.mock('../../../../utils/database', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
  get: jest.fn(),
}));

const mockJwtSign = jest.fn(() => 'fake-client-secret');
const mockJwtDecode = jest.fn();
jest.mock('jsonwebtoken', () => ({
  sign: (...args: unknown[]) => mockJwtSign(...args),
  decode: (...args: unknown[]) => mockJwtDecode(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Use dynamic import so env vars are set before singleton initializes
let oauthManager: import('../../../../services/auth/oauth-providers').OAuthProviderManager;

beforeAll(async () => {
  jest.resetModules();
  const mod = await import('../../../../services/auth/oauth-providers');
  oauthManager = mod.oauthManager;
});

const VALID_STATE_ROW = {
  state: 'state-abc',
  provider: 'apple',
  redirect_uri: null,
  code_verifier: 'verifier',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
};

describe('OAuthProviderManager — Apple Sign In', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include apple in available providers when env vars are set', () => {
    expect(oauthManager.getAvailableProviders()).toContain('apple');
  });

  it('should extract email and sub from id_token', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [VALID_STATE_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    mockAxiosPost.mockResolvedValueOnce({
      data: { id_token: 'fake.id.token', access_token: 'at-apple' },
    });

    mockJwtDecode.mockReturnValueOnce({
      sub: 'apple-user-sub-123',
      email: 'user@privaterelay.appleid.com',
    });

    const result = await oauthManager.handleAppleCallback('auth-code', 'state-abc');

    expect(result.email).toBe('user@privaterelay.appleid.com');
    expect(result.providerId).toBe('apple-user-sub-123');
    expect(result.avatarUrl).toBeNull();
  });

  it('should parse name from user JSON on first login', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [VALID_STATE_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    mockAxiosPost.mockResolvedValueOnce({
      data: { id_token: 'fake.id.token', access_token: 'at' },
    });

    mockJwtDecode.mockReturnValueOnce({ sub: 'sub-123', email: 'first@apple.com' });

    const userJson = JSON.stringify({ name: { firstName: 'Ada', lastName: 'Lovelace' } });
    const result = await oauthManager.handleAppleCallback('code', 'state-abc', userJson);

    expect(result.name).toBe('Ada Lovelace');
  });

  it('should return null name when no user JSON provided', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [VALID_STATE_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    mockAxiosPost.mockResolvedValueOnce({
      data: { id_token: 'fake.id.token', access_token: 'at' },
    });

    mockJwtDecode.mockReturnValueOnce({ sub: 'sub-456', email: 'anon@apple.com' });

    const result = await oauthManager.handleAppleCallback('code', 'state-abc');

    expect(result.name).toBeNull();
  });

  it('should throw INVALID_STATE for unknown state', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      oauthManager.handleAppleCallback('code', 'unknown-state')
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('should throw STATE_EXPIRED for expired state', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          ...VALID_STATE_ROW,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      oauthManager.handleAppleCallback('code', 'state-abc')
    ).rejects.toMatchObject({ code: 'STATE_EXPIRED' });
  });

  it('should throw TOKEN_EXCHANGE_FAILED when id_token is missing', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [VALID_STATE_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    mockAxiosPost.mockResolvedValueOnce({ data: { access_token: 'at' } }); // no id_token

    await expect(
      oauthManager.handleAppleCallback('code', 'state-abc')
    ).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_FAILED' });
  });

  it('should generate Apple client_secret JWT with correct claims', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [VALID_STATE_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    mockAxiosPost.mockResolvedValueOnce({
      data: { id_token: 'fake.id.token', access_token: 'at' },
    });

    mockJwtDecode.mockReturnValueOnce({ sub: 'sub-789', email: 'test@apple.com' });

    await oauthManager.handleAppleCallback('code', 'state-abc');

    expect(mockJwtSign).toHaveBeenCalledWith(
      expect.objectContaining({
        iss: 'TEAM123456',
        aud: 'https://appleid.apple.com',
        sub: 'com.example.app.web',
      }),
      expect.stringContaining('BEGIN EC PRIVATE KEY'),
      expect.objectContaining({ algorithm: 'ES256', keyid: 'KEY1234567' })
    );
  });
});
