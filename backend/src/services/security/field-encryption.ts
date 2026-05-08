/**
 * Phase 66 + Sprint 1.5 (2026-04-19): Field-Level Encryption (AES-256-GCM)
 * mit Dual-Key-Support für Zero-Downtime-Rotation.
 *
 * Encrypts sensitive fields before writing to the database and decrypts
 * when reading. Uses AES-256-GCM for authenticated encryption (integrity +
 * confidentiality).
 *
 * Envelope-Formate:
 *   Legacy (Sprint 1.3–1.4):  enc:v1:<base64-iv>:<base64-tag>:<base64-ciphertext>
 *   Dual-Key (Sprint 1.5+):   enc:v1:<keyId>:<base64-iv>:<base64-tag>:<base64-ciphertext>
 *                              wo keyId ∈ { A, B }
 *                              A = ENCRYPTION_KEY         (current, used for encrypt)
 *                              B = ENCRYPTION_KEY_PREVIOUS (previous, decrypt-only)
 *
 * `decrypt()` akzeptiert beide Formate und probiert im Legacy-Fall erst CURRENT,
 * dann PREVIOUS. `encrypt()` schreibt immer das neue Dual-Key-Format mit `A`.
 *
 * Key-Rotation-Workflow (siehe docs/RUNBOOK-ENCRYPTION-KEY-ROTATION.md):
 *   1. Set ENCRYPTION_KEY_PREVIOUS = aktueller ENCRYPTION_KEY.
 *   2. Set ENCRYPTION_KEY = neuer Key.
 *   3. Deploy (dual-decrypt ist jetzt aktiv; Legacy-Daten funktionieren weiter).
 *   4. `npx tsx scripts/rotate-encryption-key.ts` — re-encrypted alle Felder
 *      mit PREVIOUS → CURRENT.
 *   5. Nach erfolgreichem Durchlauf: ENCRYPTION_KEY_PREVIOUS entfernen (>=7 Tage
 *      Karenz empfohlen).
 *
 * Encrypted fields:
 * - OAuth tokens (access_token, refresh_token)
 * - MFA secrets (totp_secret)
 * - MCP server credentials
 * - Refresh tokens in session store
 * - Sprint 1.5 P1-Fields: email_accounts.{smtp,imap}_password,
 *   calendar_events.location, financial_accounts.account_number, contacts.phone
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '../../utils/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCRYPTED_PREFIX = 'enc:v1:'; // Versioned prefix to identify encrypted values

export type KeyIdentifier = 'A' | 'B';
export const KEY_CURRENT: KeyIdentifier = 'A';
export const KEY_PREVIOUS: KeyIdentifier = 'B';

let encryptionKeyCurrent: Buffer | null = null;
let encryptionKeyPrevious: Buffer | null = null;
let initialized = false;

function parseKeyHex(keyHex: string | undefined, label: string): Buffer | null {
  if (!keyHex) return null;
  if (keyHex.length !== 64 || !/^[0-9a-f]+$/i.test(keyHex)) {
    logger.error(`${label} must be a 64-character hex string (32 bytes).`, undefined, {
      operation: 'initEncryption',
      keyLabel: label,
      keyLength: keyHex.length,
    });
    return null;
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Initialize the encryption service with keys from environment.
 * Must be called at startup before any encrypt/decrypt operations.
 * Both ENCRYPTION_KEY and ENCRYPTION_KEY_PREVIOUS must be 64-character hex
 * strings (32 bytes / 256 bits). ENCRYPTION_KEY_PREVIOUS is optional.
 *
 * Idempotent — repeated calls re-read env vars (useful in tests).
 */
export function initEncryption(): boolean {
  const keyCurrentHex = process.env.ENCRYPTION_KEY;
  const keyPreviousHex = process.env.ENCRYPTION_KEY_PREVIOUS;

  if (!keyCurrentHex) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRITICAL: ENCRYPTION_KEY not set in production. Field encryption disabled.', undefined, {
        operation: 'initEncryption',
      });
    } else {
      logger.warn('ENCRYPTION_KEY not set. Field encryption disabled (development mode).', {
        operation: 'initEncryption',
      });
    }
    encryptionKeyCurrent = null;
    encryptionKeyPrevious = null;
    initialized = true;
    return false;
  }

  const current = parseKeyHex(keyCurrentHex, 'ENCRYPTION_KEY');
  if (!current) {
    encryptionKeyCurrent = null;
    encryptionKeyPrevious = null;
    initialized = true;
    return false;
  }
  encryptionKeyCurrent = current;

  if (keyPreviousHex) {
    const prev = parseKeyHex(keyPreviousHex, 'ENCRYPTION_KEY_PREVIOUS');
    encryptionKeyPrevious = prev; // null if invalid — log already emitted
    if (prev) {
      logger.info('Field-level encryption initialized (dual-key mode)', {
        operation: 'initEncryption',
        mode: 'dual-key',
      });
    } else {
      logger.warn(
        'ENCRYPTION_KEY_PREVIOUS present but invalid — running single-key mode',
        { operation: 'initEncryption' }
      );
    }
  } else {
    encryptionKeyPrevious = null;
    logger.info('Field-level encryption initialized (single-key mode)', {
      operation: 'initEncryption',
      mode: 'single-key',
    });
  }

  initialized = true;
  return true;
}

/**
 * Check if encryption is available (current key is configured).
 */
export function isEncryptionAvailable(): boolean {
  if (!initialized) {
    initEncryption();
  }
  return encryptionKeyCurrent !== null;
}

/**
 * Check if dual-key rotation mode is active (both CURRENT + PREVIOUS keys present).
 */
export function isDualKeyModeActive(): boolean {
  if (!initialized) {
    initEncryption();
  }
  return encryptionKeyCurrent !== null && encryptionKeyPrevious !== null;
}

/**
 * Encrypt a plaintext string using the CURRENT key.
 *
 * Always emits the dual-key envelope format: enc:v1:A:<iv>:<tag>:<cipher>.
 * If encryption is not available (dev mode without key), returns plaintext
 * unchanged (graceful degradation).
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string (new format) or original plaintext if encryption unavailable
 */
export function encrypt(plaintext: string): string {
  if (!initialized) {
    initEncryption();
  }

  if (!encryptionKeyCurrent) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production. Cannot store sensitive data as plaintext.');
    }
    return plaintext; // Graceful degradation in development only
  }

  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, encryptionKeyCurrent, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return (
      `${ENCRYPTED_PREFIX}${KEY_CURRENT}:` +
      `${iv.toString('base64')}:` +
      `${authTag.toString('base64')}:` +
      `${encrypted.toString('base64')}`
    );
  } catch (error) {
    logger.error('Encryption failed', error instanceof Error ? error : undefined, {
      operation: 'encrypt',
    });
    throw new Error('Failed to encrypt data');
  }
}

type ParsedEnvelope = {
  readonly keyId: KeyIdentifier | null; // null = legacy format
  readonly iv: Buffer;
  readonly authTag: Buffer;
  readonly data: Buffer;
};

function parseEnvelope(encrypted: string): ParsedEnvelope {
  const payload = encrypted.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(':');

  // Legacy format: iv:tag:cipher → 3 parts, no keyId.
  // New format:    keyId:iv:tag:cipher → 4 parts with A or B prefix.
  let keyId: KeyIdentifier | null;
  let ivB64: string;
  let tagB64: string;
  let dataB64: string;

  if (parts.length === 3) {
    keyId = null;
    [ivB64, tagB64, dataB64] = parts;
  } else if (parts.length === 4 && (parts[0] === 'A' || parts[0] === 'B')) {
    keyId = parts[0] as KeyIdentifier;
    [, ivB64, tagB64, dataB64] = parts;
  } else {
    throw new Error(
      `Invalid encrypted format: expected 3 (legacy) or 4 (dual-key) payload segments, got ${parts.length}`
    );
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: ${iv.length} (expected ${IV_LENGTH})`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: ${authTag.length} (expected ${AUTH_TAG_LENGTH})`);
  }

  return { keyId, iv, authTag, data };
}

function tryDecryptWith(
  key: Buffer,
  parsed: ParsedEnvelope
): { ok: true; plaintext: string } | { ok: false; authFailure: boolean } {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, parsed.iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(parsed.authTag);
    const decrypted = Buffer.concat([decipher.update(parsed.data), decipher.final()]);
    return { ok: true, plaintext: decrypted.toString('utf8') };
  } catch (err) {
    const errCode = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    const authFailure =
      errCode === 'ERR_CRYPTO_GCM_AUTH_TAG_MISMATCH' ||
      message.includes('Unsupported state') ||
      message.includes('unable to authenticate');
    return { ok: false, authFailure };
  }
}

/**
 * Decrypt an encrypted string. Dual-key aware:
 * - Legacy format (enc:v1:iv:tag:cipher) → try CURRENT, fallback to PREVIOUS.
 * - New format with explicit keyId (enc:v1:A:... or enc:v1:B:...) → use only that key.
 *
 * If the value is not encrypted (no prefix), returns it unchanged.
 *
 * @param encrypted - The encrypted string to decrypt
 * @returns Decrypted plaintext
 */
export function decrypt(encrypted: string): string {
  if (!initialized) {
    initEncryption();
  }

  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
    return encrypted;
  }

  if (!encryptionKeyCurrent && !encryptionKeyPrevious) {
    logger.error('Cannot decrypt: no ENCRYPTION_KEY configured', undefined, {
      operation: 'decrypt',
    });
    throw new Error('Decryption unavailable: ENCRYPTION_KEY not set');
  }

  let parsed: ParsedEnvelope;
  try {
    parsed = parseEnvelope(encrypted);
  } catch (err) {
    logger.error(
      'Decryption failed — envelope parse error',
      err instanceof Error ? err : undefined,
      { operation: 'decrypt' }
    );
    throw new Error('Failed to decrypt data');
  }

  if (parsed.keyId === KEY_CURRENT || parsed.keyId === null) {
    if (encryptionKeyCurrent) {
      const attempt = tryDecryptWith(encryptionKeyCurrent, parsed);
      if (attempt.ok) return attempt.plaintext;
      if (parsed.keyId === KEY_CURRENT) {
        logger.error(
          'SECURITY: Decryption with CURRENT key failed — possible tampering or key mismatch',
          undefined,
          { operation: 'decrypt', keyId: 'A' }
        );
        throw new Error('Decryption failed: data integrity check failed');
      }
    }
  }

  if (parsed.keyId === KEY_PREVIOUS || parsed.keyId === null) {
    if (encryptionKeyPrevious) {
      const attempt = tryDecryptWith(encryptionKeyPrevious, parsed);
      if (attempt.ok) return attempt.plaintext;
      logger.error(
        parsed.keyId === KEY_PREVIOUS
          ? 'SECURITY: Decryption with PREVIOUS key failed — possible tampering'
          : 'Decryption with PREVIOUS key failed (tried as legacy fallback)',
        undefined,
        { operation: 'decrypt', keyId: 'B' }
      );
      throw new Error('Decryption failed: data integrity check failed');
    }
  }

  // Reached here with unreachable-key scenario: explicit keyId but that slot isn't configured.
  logger.error('Cannot decrypt — required key slot not loaded', undefined, {
    operation: 'decrypt',
    keyId: parsed.keyId ?? 'legacy',
  });
  throw new Error('Decryption unavailable: required key slot not loaded');
}

/**
 * Check if a value is currently encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Parse an encrypted value's key identifier without decrypting.
 * Returns 'A' (CURRENT), 'B' (PREVIOUS), 'legacy' (no keyId → assumed CURRENT),
 * or null (not encrypted / invalid).
 */
export function getKeyIdentifier(encrypted: string): KeyIdentifier | 'legacy' | null {
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) return null;
  try {
    const parsed = parseEnvelope(encrypted);
    return parsed.keyId ?? 'legacy';
  } catch {
    return null;
  }
}

/**
 * Check if a value is encrypted with the CURRENT key (skip re-encrypt).
 */
export function isEncryptedWithCurrentKey(encrypted: string): boolean {
  return getKeyIdentifier(encrypted) === KEY_CURRENT;
}

/**
 * Re-encrypt a value (for key rotation).
 * Decrypts with whatever key works (CURRENT / PREVIOUS / legacy) and re-encrypts
 * with the CURRENT key using a fresh IV.
 *
 * @param encrypted - Currently encrypted value
 * @returns Newly encrypted value with fresh IV and CURRENT keyId
 */
export function reEncrypt(encrypted: string): string {
  const plaintext = decrypt(encrypted);
  return encrypt(plaintext);
}

/**
 * Rotation helper: if the given encrypted value is already encrypted with
 * CURRENT, return null (nothing to do — idempotent skip). Otherwise re-encrypt
 * with CURRENT and return the new envelope.
 */
export function rotateToCurrentKey(encrypted: string): string | null {
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) return null;
  if (isEncryptedWithCurrentKey(encrypted)) return null;
  return reEncrypt(encrypted);
}

/**
 * Generate a new 256-bit encryption key.
 * Use this to create the ENCRYPTION_KEY environment variable.
 *
 * @returns 64-character hex string
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Test-only: reset the module-internal state so `initEncryption()` re-reads env.
 * Used to avoid cross-test contamination.
 */
export function __resetEncryptionStateForTests(): void {
  encryptionKeyCurrent = null;
  encryptionKeyPrevious = null;
  initialized = false;
}
