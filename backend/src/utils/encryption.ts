/**
 * Encryption Utility - AES-256-GCM
 *
 * Encrypts/decrypts sensitive data (e.g., IMAP passwords) at rest.
 * Key source: ENCRYPTION_KEY env var, or derived from ANTHROPIC_API_KEY.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  if (process.env.ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    return key;
  }

  // Derive key from ANTHROPIC_API_KEY as fallback
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Neither ENCRYPTION_KEY nor ANTHROPIC_API_KEY is set — cannot encrypt');
  }
  return createHash('sha256').update(apiKey).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns: `iv:authTag:ciphertext` (all Base64-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt ciphertext produced by encrypt().
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format — expected iv:authTag:ciphertext');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
