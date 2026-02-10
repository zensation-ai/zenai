/**
 * Phase Security Sprint 3: API Key Security Service
 *
 * Enhanced API key security features:
 * - Key expiry warnings
 * - Key rotation recommendations
 * - Last usage tracking
 * - Expiring keys notification
 */

// pool.query() is intentional here: api_keys is a global table (not per-context)
import { pool } from '../utils/database';
import { logger } from '../utils/logger';

// Expiry warning thresholds
const EXPIRY_WARNING_DAYS = 7;  // Warn when key expires within 7 days
const EXPIRY_CRITICAL_DAYS = 1; // Critical when key expires within 1 day
const KEY_AGE_ROTATION_DAYS = 90; // Recommend rotation after 90 days

/**
 * Key expiry status
 */
export interface KeyExpiryInfo {
  isExpired: boolean;
  isExpiringSoon: boolean;
  isCritical: boolean;
  daysUntilExpiry: number | null;
  expiresAt: Date | null;
  rotationRecommended: boolean;
  rotationReason?: string;
  warningMessage?: string;
}

/**
 * Check API key expiry status and provide warnings
 */
export function checkKeyExpiry(expiresAt: Date | null, createdAt: Date): KeyExpiryInfo {
  const now = new Date();

  // Check key age for rotation recommendation
  const keyAgeMs = now.getTime() - createdAt.getTime();
  const keyAgeDays = Math.floor(keyAgeMs / (1000 * 60 * 60 * 24));
  const rotationRecommended = keyAgeDays >= KEY_AGE_ROTATION_DAYS;

  if (!expiresAt) {
    // Key doesn't expire
    return {
      isExpired: false,
      isExpiringSoon: false,
      isCritical: false,
      daysUntilExpiry: null,
      expiresAt: null,
      rotationRecommended,
      rotationReason: rotationRecommended
        ? `Key is ${keyAgeDays} days old. Consider rotating for security.`
        : undefined,
    };
  }

  const expiryTime = new Date(expiresAt).getTime();
  const msUntilExpiry = expiryTime - now.getTime();
  const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

  const isExpired = msUntilExpiry <= 0;
  const isCritical = !isExpired && daysUntilExpiry <= EXPIRY_CRITICAL_DAYS;
  const isExpiringSoon = !isExpired && daysUntilExpiry <= EXPIRY_WARNING_DAYS;

  let warningMessage: string | undefined;

  if (isExpired) {
    warningMessage = 'API key has expired. Please generate a new key.';
  } else if (isCritical) {
    warningMessage = `API key expires in ${daysUntilExpiry === 0 ? 'less than 1 day' : `${daysUntilExpiry} day(s)`}. Rotate immediately!`;
  } else if (isExpiringSoon) {
    warningMessage = `API key expires in ${daysUntilExpiry} days. Consider rotating soon.`;
  }

  return {
    isExpired,
    isExpiringSoon,
    isCritical,
    daysUntilExpiry: isExpired ? 0 : daysUntilExpiry,
    expiresAt: new Date(expiresAt),
    rotationRecommended: rotationRecommended || isCritical,
    rotationReason: rotationRecommended
      ? `Key is ${keyAgeDays} days old. Consider rotating for security.`
      : isCritical
      ? 'Key is expiring soon.'
      : undefined,
    warningMessage,
  };
}

/**
 * Get all keys that are expiring soon
 */
export async function getExpiringKeys(daysAhead: number = EXPIRY_WARNING_DAYS): Promise<Array<{
  id: string;
  name: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  lastUsedAt: Date | null;
}>> {
  try {
    const result = await pool.query(
      `SELECT id, name, expires_at, last_used_at
       FROM api_keys
       WHERE is_active = true
         AND expires_at IS NOT NULL
         AND expires_at <= NOW() + make_interval(days => $1)
         AND expires_at > NOW()
       ORDER BY expires_at ASC`,
      [daysAhead]
    );

    return result.rows.map((row) => {
      const msUntilExpiry = new Date(row.expires_at).getTime() - Date.now();
      const daysUntilExpiry = Math.max(0, Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24)));

      return {
        id: row.id,
        name: row.name,
        expiresAt: row.expires_at,
        daysUntilExpiry,
        lastUsedAt: row.last_used_at,
      };
    });
  } catch (error) {
    logger.error('Failed to get expiring keys', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get all expired keys (for cleanup/notification)
 */
export async function getExpiredKeys(): Promise<Array<{
  id: string;
  name: string;
  expiresAt: Date;
  lastUsedAt: Date | null;
}>> {
  try {
    const result = await pool.query(
      `SELECT id, name, expires_at, last_used_at
       FROM api_keys
       WHERE is_active = true
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
       ORDER BY expires_at ASC`
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
    }));
  } catch (error) {
    logger.error('Failed to get expired keys', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get keys that haven't been used recently (potential candidates for revocation)
 */
export async function getUnusedKeys(daysUnused: number = 30): Promise<Array<{
  id: string;
  name: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  daysSinceLastUse: number;
}>> {
  try {
    const result = await pool.query(
      `SELECT id, name, last_used_at, created_at
       FROM api_keys
       WHERE is_active = true
         AND (
           last_used_at IS NULL
           OR last_used_at < NOW() - make_interval(days => $1)
         )
       ORDER BY last_used_at ASC NULLS FIRST`,
      [daysUnused]
    );

    return result.rows.map((row) => {
      const daysSinceLastUse = row.last_used_at
        ? Math.floor((Date.now() - new Date(row.last_used_at).getTime()) / (1000 * 60 * 60 * 24))
        : Math.floor((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: row.id,
        name: row.name,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        daysSinceLastUse,
      };
    });
  } catch (error) {
    logger.error('Failed to get unused keys', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Get API key security summary
 */
export async function getKeySecuritySummary(): Promise<{
  totalKeys: number;
  activeKeys: number;
  expiringKeys: number;
  expiredKeys: number;
  unusedKeys: number;
  recommendations: string[];
}> {
  try {
    const [totalResult, activeResult, expiringKeys, expiredKeys, unusedKeys] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM api_keys'),
      pool.query('SELECT COUNT(*) as count FROM api_keys WHERE is_active = true'),
      getExpiringKeys(),
      getExpiredKeys(),
      getUnusedKeys(),
    ]);

    const recommendations: string[] = [];

    if (expiredKeys.length > 0) {
      recommendations.push(`${expiredKeys.length} key(s) have expired and should be deactivated or regenerated.`);
    }

    if (expiringKeys.length > 0) {
      recommendations.push(`${expiringKeys.length} key(s) will expire within ${EXPIRY_WARNING_DAYS} days.`);
    }

    if (unusedKeys.length > 0) {
      recommendations.push(`${unusedKeys.length} key(s) haven't been used in 30+ days. Consider revoking unused keys.`);
    }

    return {
      totalKeys: parseInt(totalResult.rows[0].count),
      activeKeys: parseInt(activeResult.rows[0].count),
      expiringKeys: expiringKeys.length,
      expiredKeys: expiredKeys.length,
      unusedKeys: unusedKeys.length,
      recommendations,
    };
  } catch (error) {
    logger.error('Failed to get key security summary', error instanceof Error ? error : undefined);
    return {
      totalKeys: 0,
      activeKeys: 0,
      expiringKeys: 0,
      expiredKeys: 0,
      unusedKeys: 0,
      recommendations: [],
    };
  }
}

/**
 * Extend API key expiry
 */
export async function extendKeyExpiry(
  keyId: string,
  additionalDays: number
): Promise<{ success: boolean; newExpiresAt?: Date; error?: string }> {
  if (additionalDays < 1 || additionalDays > 365) {
    return { success: false, error: 'Additional days must be between 1 and 365.' };
  }

  try {
    const result = await pool.query(
      `UPDATE api_keys
       SET expires_at = COALESCE(expires_at, NOW()) + make_interval(days => $1)
       WHERE id = $2 AND is_active = true
       RETURNING expires_at`,
      [additionalDays, keyId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'API key not found or inactive.' };
    }

    logger.info('API key expiry extended', {
      operation: 'extendKeyExpiry',
      keyId,
      additionalDays,
      newExpiresAt: result.rows[0].expires_at,
    });

    return { success: true, newExpiresAt: result.rows[0].expires_at };
  } catch (error) {
    logger.error('Failed to extend key expiry', error instanceof Error ? error : undefined);
    return { success: false, error: 'Database error.' };
  }
}
