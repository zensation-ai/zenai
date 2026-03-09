/**
 * Redis Distributed Lock Service
 *
 * Simple distributed lock using Redis SET NX EX pattern.
 * Ensures only one instance runs critical sections (e.g. memory consolidation)
 * in multi-instance deployments.
 *
 * Falls back to no-op when Redis is unavailable (single-instance mode).
 */

import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../utils/cache';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface LockResult {
  acquired: boolean;
  lockId: string;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_LOCK_TTL = 300; // 5 minutes default
const LOCK_PREFIX = 'lock:';

// ===========================================
// Distributed Lock Service
// ===========================================

export const redisLock = {
  /**
   * Acquire a distributed lock.
   *
   * Uses Redis SET NX EX for atomic lock acquisition.
   * Returns a unique lockId that must be used to release the lock.
   *
   * @param name - Lock name (e.g. 'memory:consolidation')
   * @param ttlSeconds - Lock TTL in seconds (auto-release safety net)
   * @returns LockResult with acquired=true and lockId if successful
   */
  async acquireLock(name: string, ttlSeconds: number = DEFAULT_LOCK_TTL): Promise<LockResult> {
    const lockId = uuidv4();
    const lockKey = `${LOCK_PREFIX}${name}`;

    const client = getRedisClient();
    if (!client) {
      // No Redis available - allow execution (single-instance fallback)
      logger.debug('Redis unavailable, lock acquired without Redis', { lockName: name });
      return { acquired: true, lockId };
    }

    try {
      // SET key value NX EX seconds
      // NX = only set if not exists, EX = expire after seconds
      const result = await client.set(lockKey, lockId, 'EX', ttlSeconds, 'NX');

      const acquired = result === 'OK';

      if (acquired) {
        logger.debug('Distributed lock acquired', { lockName: name, lockId, ttlSeconds });
      } else {
        logger.debug('Distributed lock not acquired (held by another instance)', { lockName: name });
      }

      return { acquired, lockId };
    } catch (error) {
      // Redis error - fall back to allowing execution
      logger.warn('Redis lock acquire failed, falling back to unlocked execution', {
        lockName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      return { acquired: true, lockId };
    }
  },

  /**
   * Release a distributed lock.
   *
   * Only releases if the lockId matches (prevents releasing another instance's lock).
   * Uses a Lua script for atomic check-and-delete.
   *
   * @param name - Lock name
   * @param lockId - The lockId returned from acquireLock
   * @returns true if the lock was released
   */
  async releaseLock(name: string, lockId: string): Promise<boolean> {
    const lockKey = `${LOCK_PREFIX}${name}`;

    const client = getRedisClient();
    if (!client) {
      // No Redis - nothing to release
      return true;
    }

    try {
      // Atomic check-and-delete with Lua script
      // Only delete if the value matches our lockId
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await client.eval(script, 1, lockKey, lockId);
      const released = result === 1;

      if (released) {
        logger.debug('Distributed lock released', { lockName: name, lockId });
      } else {
        logger.debug('Lock release skipped (lock not held or expired)', { lockName: name, lockId });
      }

      return released;
    } catch (error) {
      logger.warn('Redis lock release failed', {
        lockName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  },

  /**
   * Execute a function while holding a distributed lock.
   *
   * Acquires the lock, runs the function, then releases the lock.
   * If the lock cannot be acquired, the function is NOT executed (returns null).
   * If Redis is unavailable, the function executes without a lock (fallback).
   *
   * @param name - Lock name
   * @param fn - Async function to execute
   * @param ttlSeconds - Lock TTL in seconds
   * @returns The function result, or null if the lock couldn't be acquired
   */
  async withLock<T>(
    name: string,
    fn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_LOCK_TTL
  ): Promise<T | null> {
    const { acquired, lockId } = await this.acquireLock(name, ttlSeconds);

    if (!acquired) {
      logger.info('Skipping locked operation (another instance holds the lock)', {
        lockName: name,
      });
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(name, lockId);
    }
  },
};
