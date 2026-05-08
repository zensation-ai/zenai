import { createOAuthState, consumeOAuthState, purgeExpiredStates } from '../../../../services/social/oauth-state';
import type { AIContext } from '../../../../utils/database-context';

describe('oauth-state', () => {
  beforeEach(() => {
    purgeExpiredStates(); // clear between tests
  });

  it('stores and retrieves state by key', () => {
    const { state, codeVerifier } = createOAuthState('finance' as AIContext);
    expect(state).toHaveLength(32); // 16 bytes hex
    expect(codeVerifier).toHaveLength(43); // base64url of 32 bytes
    const entry = consumeOAuthState(state);
    expect(entry).not.toBeNull();
    expect(entry!.context).toBe('finance');
    expect(entry!.codeVerifier).toBe(codeVerifier);
  });

  it('returns null for unknown state', () => {
    expect(consumeOAuthState('nonexistent')).toBeNull();
  });

  it('consumes state only once (replay prevention)', () => {
    const { state } = createOAuthState('operations' as AIContext);
    expect(consumeOAuthState(state)).not.toBeNull();
    expect(consumeOAuthState(state)).toBeNull();
  });

  it('returns null for expired state', () => {
    jest.useFakeTimers();
    const { state } = createOAuthState('finance' as AIContext);
    jest.advanceTimersByTime(11 * 60 * 1000); // 11 minutes
    expect(consumeOAuthState(state)).toBeNull();
    jest.useRealTimers();
  });

  it('generates PKCE code challenge from verifier', async () => {
    const { codeVerifier, codeChallenge } = createOAuthState('finance' as AIContext);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeChallenge.length).toBeGreaterThan(30);
    expect(codeChallenge).not.toBe(codeVerifier);
  });

  it('does not purge fresh entries during purgeExpiredStates', () => {
    const { state } = createOAuthState('finance' as AIContext);
    purgeExpiredStates();
    // fresh entry should still be there
    const entry = consumeOAuthState(state);
    expect(entry).not.toBeNull();
  });
});
