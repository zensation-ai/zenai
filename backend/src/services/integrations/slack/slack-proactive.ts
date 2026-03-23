/**
 * Slack Proactive Intelligence
 *
 * Relevance detection, confidence gating, rate limiting, and thread muting
 * for proactive channel presence. ZenAI only speaks when it has high-confidence
 * relevant knowledge to contribute.
 */

import type { ProactiveConfig } from './types';

/**
 * In-memory store for muted thread timestamps per workspace.
 * Ephemeral — resets on restart. 24-hour TTL.
 */
export class MutedThreadStore {
  private store = new Map<string, Set<string>>(); // workspaceId → Set<threadTs>
  private expiry = new Map<string, number>(); // "ws:ts" → expiry timestamp

  mute(workspaceId: string, threadTs: string): void {
    if (!this.store.has(workspaceId)) {
      this.store.set(workspaceId, new Set());
    }
    const threads = this.store.get(workspaceId);
    if (threads) {
      threads.add(threadTs);
    }
    this.expiry.set(`${workspaceId}:${threadTs}`, Date.now() + 24 * 60 * 60 * 1000);
  }

  isMuted(workspaceId: string, threadTs: string): boolean {
    const threads = this.store.get(workspaceId);
    if (!threads || !threads.has(threadTs)) {
      return false;
    }

    // Check TTL
    const key = `${workspaceId}:${threadTs}`;
    const exp = this.expiry.get(key);
    if (exp && Date.now() > exp) {
      threads.delete(threadTs);
      this.expiry.delete(key);
      return false;
    }

    return true;
  }

  clearWorkspace(workspaceId: string): void {
    const threads = this.store.get(workspaceId);
    if (threads) {
      for (const ts of threads) {
        this.expiry.delete(`${workspaceId}:${ts}`);
      }
    }
    this.store.delete(workspaceId);
  }
}

// Global muted thread store (singleton)
export const mutedThreads = new MutedThreadStore();

/**
 * Determine if ZenAI should respond proactively to a channel message.
 *
 * Checks (in order):
 * 1. Global kill switch (config.enabled)
 * 2. Muted channel list
 * 3. Muted thread (via MutedThreadStore)
 * 4. Confidence threshold (similarityScore >= config.confidenceThreshold)
 * 5. Per-channel rate limit (config.rateLimitMinutes)
 */
export function shouldRespondProactively(
  config: ProactiveConfig,
  channelId: string,
  threadTs: string | null,
  similarityScore: number,
  lastProactiveResponses: Map<string, number>,
  mutedStore?: MutedThreadStore,
  workspaceId?: string,
): boolean {
  // Global kill switch
  if (!config.enabled) {
    return false;
  }

  // Muted channel
  if (config.mutedChannels.includes(channelId)) {
    return false;
  }

  // Muted thread
  if (threadTs && mutedStore && workspaceId && mutedStore.isMuted(workspaceId, threadTs)) {
    return false;
  }

  // Confidence threshold
  if (similarityScore < config.confidenceThreshold) {
    return false;
  }

  // Rate limit per channel
  const lastResponse = lastProactiveResponses.get(channelId);
  if (lastResponse) {
    const minutesSince = (Date.now() - lastResponse) / (60 * 1000);
    if (minutesSince < config.rateLimitMinutes) {
      return false;
    }
  }

  return true;
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
