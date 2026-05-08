/**
 * OAuth PKCE State Manager
 *
 * Server-side Map for PKCE state with 10-minute TTL.
 * Prevents state replay attacks. No Redis dependency.
 *
 * @module services/social/oauth-state
 */

import { randomBytes, createHash } from 'crypto';
import type { AIContext } from '../../utils/database-context';

const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StateEntry {
  codeVerifier: string;
  context: AIContext;
  createdAt: number;
}

const store = new Map<string, StateEntry>();

export interface OAuthStateResult {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Create a new PKCE state entry. Returns state, codeVerifier, and codeChallenge.
 */
export function createOAuthState(context: AIContext): OAuthStateResult {
  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  store.set(state, { codeVerifier, context, createdAt: Date.now() });
  return { state, codeVerifier, codeChallenge };
}

/**
 * Consume a state entry. Returns null if not found or expired.
 * Entry is deleted on first retrieval (replay prevention).
 */
export function consumeOAuthState(state: string): StateEntry | null {
  const entry = store.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(state);
    return null;
  }
  store.delete(state);
  return entry;
}

/**
 * Remove all expired entries. Called at module load and periodically.
 */
export function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(key);
  }
}

// Auto-purge every 5 minutes
setInterval(purgeExpiredStates, 5 * 60 * 1000).unref();
