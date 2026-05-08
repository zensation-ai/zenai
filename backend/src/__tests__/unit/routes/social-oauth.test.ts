import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Sprint 1.5 Item 4 — /start routes now carry per-route `apiKeyAuth`.
// Pass-through stub so the existing suite keeps running as-authenticated.
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../services/social/oauth-state', () => ({
  createOAuthState: jest.fn(() => ({
    state: 'test-state-123',
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge',
  })),
  consumeOAuthState: jest.fn(),
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn(() => true),
}));

jest.mock('../../../services/security/field-encryption', () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  isEncryptionAvailable: jest.fn(() => true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { createOAuthState, consumeOAuthState } from '../../../services/social/oauth-state';
import { queryContext } from '../../../utils/database-context';

const mockConsumeState = consumeOAuthState as jest.Mock;
const mockQueryContext = queryContext as jest.Mock;

// ── Setup ──────────────────────────────────────────────────────────────────────

let app: express.Application;

beforeAll(async () => {
  const { default: router } = await import('../../../routes/social-oauth');
  app = express();
  app.use(express.json());
  app.use('/api/social/oauth', router);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/social/oauth/twitter/start', () => {
  it('redirects to Twitter authorization URL', async () => {
    const res = await request(app)
      .get('/api/social/oauth/twitter/start?context=finance')
      .expect(302);

    expect(res.headers.location).toContain('twitter.com/i/oauth2/authorize');
    expect(res.headers.location).toContain('state=test-state-123');
    expect(res.headers.location).toContain('code_challenge=test-challenge');
    expect(createOAuthState).toHaveBeenCalledWith('finance');
  });

  it('defaults to finance context when not specified', async () => {
    const res = await request(app)
      .get('/api/social/oauth/twitter/start')
      .expect(302);

    expect(createOAuthState).toHaveBeenCalledWith('finance');
    expect(res.headers.location).toContain('twitter.com');
  });
});

describe('GET /api/social/oauth/twitter/callback', () => {
  it('redirects to error page on invalid state', async () => {
    mockConsumeState.mockReturnValue(null);

    const res = await request(app)
      .get('/api/social/oauth/twitter/callback?state=bad&code=abc')
      .expect(302);

    expect(res.headers.location).toContain('social=error');
    expect(res.headers.location).toContain('state_expired');
  });

  it('redirects to error page on missing code', async () => {
    mockConsumeState.mockReturnValue({ codeVerifier: 'v', context: 'finance', createdAt: Date.now() });

    const res = await request(app)
      .get('/api/social/oauth/twitter/callback?state=good')
      .expect(302);

    expect(res.headers.location).toContain('social=error');
  });

  it('redirects to error page with access_denied reason when user cancels', async () => {
    const res = await request(app)
      .get('/api/social/oauth/twitter/callback?error=access_denied&state=good')
      .expect(302);

    expect(res.headers.location).toContain('social=error');
    expect(res.headers.location).toContain('access_denied');
    // State must NOT be consumed for cancelled flows
    expect(mockConsumeState).not.toHaveBeenCalled();
  });

  it('stores token and redirects to success on valid callback', async () => {
    mockConsumeState.mockReturnValue({ codeVerifier: 'verifier', context: 'finance', createdAt: Date.now() });

    const mockFetchGlobal = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'act123', refresh_token: 'rt456', expires_in: 7200, scope: 'tweet.read tweet.write' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { username: 'testuser' } }),
      });
    global.fetch = mockFetchGlobal;
    mockQueryContext.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/social/oauth/twitter/callback?state=valid&code=auth_code_123')
      .expect(302);

    expect(res.headers.location).toContain('social=connected');
    expect(res.headers.location).toContain('platform=twitter');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'finance',
      expect.stringContaining('INSERT INTO social_accounts'),
      expect.arrayContaining(['twitter', '@testuser', 'enc:act123', 'enc:rt456']),
    );
  });
});

describe('GET /api/social/oauth/linkedin/start', () => {
  it('redirects to LinkedIn authorization URL', async () => {
    const res = await request(app)
      .get('/api/social/oauth/linkedin/start?context=finance')
      .expect(302);

    expect(res.headers.location).toContain('linkedin.com/oauth/v2/authorization');
    expect(res.headers.location).toContain('state=test-state-123');
  });
});

describe('GET /api/social/oauth/linkedin/callback', () => {
  it('redirects to error page on invalid state', async () => {
    mockConsumeState.mockReturnValue(null);

    const res = await request(app)
      .get('/api/social/oauth/linkedin/callback?state=bad&code=abc')
      .expect(302);

    expect(res.headers.location).toContain('social=error');
    expect(res.headers.location).toContain('state_expired');
  });

  it('redirects to error page with access_denied when user cancels', async () => {
    const res = await request(app)
      .get('/api/social/oauth/linkedin/callback?error=access_denied&state=good')
      .expect(302);

    expect(res.headers.location).toContain('social=error');
    expect(res.headers.location).toContain('access_denied');
    expect(mockConsumeState).not.toHaveBeenCalled();
  });

  it('stores encrypted token and redirects to success on valid callback', async () => {
    mockConsumeState.mockReturnValue({ codeVerifier: 'verifier', context: 'finance', createdAt: Date.now() });

    const mockFetchGlobal = jest.fn()
      // Token exchange
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'li_access', refresh_token: 'li_refresh', expires_in: 5184000 }),
      })
      // Profile fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ localizedFirstName: 'Alex', localizedLastName: 'Bering' }),
      })
      // Org fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ elements: [{ organizationalTarget: 'urn:li:organization:12345' }] }),
      });
    global.fetch = mockFetchGlobal;
    mockQueryContext.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/social/oauth/linkedin/callback?state=valid&code=li_auth_code')
      .expect(302);

    expect(res.headers.location).toContain('social=connected');
    expect(res.headers.location).toContain('platform=linkedin');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'finance',
      expect.stringContaining('INSERT INTO social_accounts'),
      expect.arrayContaining(['linkedin', 'Alex Bering', 'enc:li_access', 'enc:li_refresh']),
    );
  });
});

describe('GET /api/social/oauth/:platform/start — unknown platform', () => {
  it('returns 400 for unknown platform', async () => {
    await request(app)
      .get('/api/social/oauth/instagram/start')
      .expect(400);
  });
});
