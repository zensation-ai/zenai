/**
 * Phase 66: Field-Level Encryption (AES-256-GCM)
 *
 * Encrypts sensitive fields before writing to the database and decrypts
 * when reading. Uses AES-256-GCM for authenticated encryption (integrity +
 * confidentiality).
 *
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 *
 * Encrypted fields:
 * - OAuth tokens (access_token, refresh_token)
 * - MFA secrets (totp_secret)
 * - MCP server credentials
 * - Refresh tokens in session store
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '../../utils/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCRYPTED_PREFIX = 'enc:v1:'; // Versioned prefix to identify encrypted values

let encryptionKey: Buffer | null = null;
let initialized = false;

/**
 * Initialize the encryption service with the key from environment.
 * Must be called at startup before any encrypt/decrypt operations.
 * Key must be a 64-character hex string (32 bytes / 256 bits).
 */
export function initEncryption(): boolean {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRITICAL: ENCRYPTION_KEY not set in production. Field encryption disabled.', undefined, {
        operation: 'initEncryption',
      });
    } else {
      logger.warn('ENCRYPTION_KEY not set. Field encryption disabled (development mode).', {
        operation: 'initEncryption',
      });
    }
    initialized = true;
    return false;
  }

  if (keyHex.length !== 64 || !/^[0-9a-f]+$/i.test(keyHex)) {
    logger.error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Field encryption disabled.', undefined, {
      operation: 'initEncryption',
      keyLength: keyHex.length,
    });
    initialized = true;
    return false;
  }

  encryptionKey = Buffer.from(keyHex, 'hex');
  initialized = true;
  logger.info('Field-level encryption initialized (AES-256-GCM)', {
    operation: 'initEncryption',
  });
  return true;
}

/**
 * Check if encryption is available (key is configured).
 */
export function isEncryptionAvailable(): boolean {
  if (!initialized) initEncryption();
  return encryptionKey !== null;
}

/**
 * Encrypt a plaintext string.
 *
 * Returns the encrypted value in format: enc:v1:base64(iv):base64(tag):base64(ciphertext)
 * If encryption is not available, returns the plaintext unchanged (graceful degradation).
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string or original plaintext if encryption unavailable
 */
export function encrypt(plaintext: string): string {
  if (!initialized) initEncryption();

  if (!encryptionKey) {
    return plaintext; // Graceful degradation
  }

  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (error) {
    logger.error('Encryption failed', error instanceof Error ? error : undefined, {
      operation: 'encrypt',
    });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted string.
 *
 * Accepts format: enc:v1:base64(iv):base64(tag):base64(ciphertext)
 * If the value is not encrypted (no prefix), returns it unchanged.
 *
 * @param encrypted - The encrypted string to decrypt
 * @returns Decrypted plaintext
 */
export function decrypt(encrypted: string): string {
  if (!initialized) initEncryption();

  // Not encrypted — return as-is (backward compat for unencrypted data)
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
    return encrypted;
  }

  if (!encryptionKey) {
    logger.error('Cannot decrypt: ENCRYPTION_KEY not configured', undefined, {
      operation: 'decrypt',
    });
    throw new Error('Decryption unavailable: ENCRYPTION_KEY not set');
  }

  try {
    const payload = encrypted.slice(ENCRYPTED_PREFIX.length);
    const parts = payload.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format: expected 3 parts (iv:tag:data)');
    }

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${iv.length} (expected ${IV_LENGTH})`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: ${authTag.length} (expected ${AUTH_TAG_LENGTH})`);
    }

    const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    // If auth tag verification fails, it means data was tampered with
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Unsupported state') || message.includes('unable to authenticate')) {
      logger.error('SECURITY: Encrypted data failed authentication — possible tampering', undefined, {
        operation: 'decrypt',
      });
      throw new Error('Decryption failed: data integrity check failed');
    }
    logger.error('Decryption failed', error instanceof Error ? error : undefined, {
      operation: 'decrypt',
    });
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Check if a value is currently encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Re-encrypt a value (for key rotation).
 * Decrypts with current key and re-encrypts with new IV.
 *
 * @param encrypted - Currently encrypted value
 * @returns Newly encrypted value with fresh IV
 */
export function reEncrypt(encrypted: string): string {
  const plaintext = decrypt(encrypted);
  return encrypt(plaintext);
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
