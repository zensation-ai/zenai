/**
 * Phase 66: Field-Level Encryption Tests
 *
 * Tests AES-256-GCM field encryption service covering:
 * - encrypt/decrypt round-trip
 * - backward compatibility (unencrypted values)
 * - graceful degradation without key
 * - tamper detection
 * - format validation
 * - edge cases (empty, unicode, special chars)
 * - key rotation via reEncrypt
 * - key generation
 */

// Mock logger before imports
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// We need to isolate module state between test groups since the module
// caches encryptionKey and initialized flag. Use dynamic require + jest.isolateModules.

const TEST_KEY = 'a'.repeat(64); // Valid 64-char hex key (all 'a's = 32 bytes of 0xAA)
const TEST_KEY_2 = 'b'.repeat(64);

describe('Field Encryption Service', () => {
  // Helper to get a fresh module instance with a given key
  function loadModule(keyOverride?: string | null) {
    let mod: typeof import('../../../services/security/field-encryption');
    jest.isolateModules(() => {
      if (keyOverride === null) {
        delete process.env.ENCRYPTION_KEY;
      } else if (keyOverride !== undefined) {
        process.env.ENCRYPTION_KEY = keyOverride;
      }
      mod = require('../../../services/security/field-encryption');
    });
    return mod!;
  }

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    jest.restoreAllMocks();
  });

  describe('encrypt() and decrypt() round-trip', () => {
    it('should encrypt and decrypt a simple string', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = 'hello world';
      const encrypted = mod.encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(mod.decrypt(encrypted)).toBe(plaintext);
    });

    it('should round-trip a long string', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = 'x'.repeat(10000);
      const encrypted = mod.encrypt(plaintext);
      expect(mod.decrypt(encrypted)).toBe(plaintext);
    });

    it('should round-trip JSON data', () => {
      const mod = loadModule(TEST_KEY);
      const data = JSON.stringify({ token: 'abc123', refresh: 'xyz789', nested: { deep: true } });
      const encrypted = mod.encrypt(data);
      expect(JSON.parse(mod.decrypt(encrypted))).toEqual(JSON.parse(data));
    });

    it('should round-trip multiple values independently', () => {
      const mod = loadModule(TEST_KEY);
      const values = ['secret1', 'secret2', 'secret3'];
      const encrypted = values.map((v) => mod.encrypt(v));
      const decrypted = encrypted.map((e) => mod.decrypt(e));
      expect(decrypted).toEqual(values);
    });
  });

  describe('backward compatibility', () => {
    it('should return unencrypted value unchanged from decrypt()', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = 'not-encrypted-token';
      expect(mod.decrypt(plaintext)).toBe(plaintext);
    });

    it('should return empty string unchanged from decrypt()', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.decrypt('')).toBe('');
    });

    it('should return value starting with "enc:" but not "enc:v1:" unchanged', () => {
      const mod = loadModule(TEST_KEY);
      const value = 'enc:something-else';
      expect(mod.decrypt(value)).toBe(value);
    });
  });

  describe('graceful degradation without ENCRYPTION_KEY', () => {
    it('should return plaintext from encrypt() when no key is set', () => {
      const mod = loadModule(null);
      const plaintext = 'my-secret-token';
      expect(mod.encrypt(plaintext)).toBe(plaintext);
    });

    it('should return plaintext from decrypt() of unencrypted value when no key', () => {
      const mod = loadModule(null);
      expect(mod.decrypt('plain-value')).toBe('plain-value');
    });

    it('should throw when trying to decrypt encrypted value without key', () => {
      // First encrypt with key
      const modWithKey = loadModule(TEST_KEY);
      const encrypted = modWithKey.encrypt('secret');

      // Then try decrypting without key
      const modWithoutKey = loadModule(null);
      expect(() => modWithoutKey.decrypt(encrypted)).toThrow('Decryption unavailable: ENCRYPTION_KEY not set');
    });

    it('initEncryption() should return false when no key', () => {
      const mod = loadModule(null);
      expect(mod.initEncryption()).toBe(false);
    });

    it('isEncryptionAvailable() should return false when no key', () => {
      const mod = loadModule(null);
      expect(mod.isEncryptionAvailable()).toBe(false);
    });
  });

  describe('tamper detection', () => {
    it('should throw on tampered ciphertext', () => {
      const mod = loadModule(TEST_KEY);
      const encrypted = mod.encrypt('secret data');

      // Tamper with the ciphertext portion (last base64 segment)
      const parts = encrypted.split(':');
      const lastPart = parts[parts.length - 1];
      // Flip a character
      const tampered = parts.slice(0, -1).join(':') + ':' + 'AAAA' + lastPart.slice(4);

      expect(() => mod.decrypt(tampered)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const mod = loadModule(TEST_KEY);
      const encrypted = mod.encrypt('secret data');

      // Tamper with the auth tag (3rd segment after enc:v1:)
      const parts = encrypted.split(':');
      // parts: ['enc', 'v1', iv, tag, data]
      parts[3] = 'AAAAAAAAAAAAAAAAAAAAAA=='; // Replace auth tag
      const tampered = parts.join(':');

      expect(() => mod.decrypt(tampered)).toThrow();
    });

    it('should throw on invalid format (missing parts)', () => {
      const mod = loadModule(TEST_KEY);
      const malformed = 'enc:v1:onlyonepart';
      expect(() => mod.decrypt(malformed)).toThrow();
    });
  });

  describe('isEncrypted()', () => {
    it('should return true for encrypted values', () => {
      const mod = loadModule(TEST_KEY);
      const encrypted = mod.encrypt('test');
      expect(mod.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext values', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.isEncrypted('just-a-token')).toBe(false);
    });

    it('should return false for empty string', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.isEncrypted('')).toBe(false);
    });

    it('should return false for partial prefix', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.isEncrypted('enc:')).toBe(false);
      expect(mod.isEncrypted('enc:v')).toBe(false);
    });

    it('should return true for value starting with enc:v1:', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.isEncrypted('enc:v1:anything')).toBe(true);
    });
  });

  describe('random IV produces different ciphertexts', () => {
    it('should produce different ciphertexts for the same plaintext', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = 'same input every time';
      const encrypted1 = mod.encrypt(plaintext);
      const encrypted2 = mod.encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      // Both should decrypt to the same value
      expect(mod.decrypt(encrypted1)).toBe(plaintext);
      expect(mod.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should produce different ciphertexts for different plaintexts', () => {
      const mod = loadModule(TEST_KEY);
      const e1 = mod.encrypt('alpha');
      const e2 = mod.encrypt('beta');
      expect(e1).not.toBe(e2);
    });
  });

  describe('empty string handling', () => {
    it('should encrypt and decrypt empty string', () => {
      const mod = loadModule(TEST_KEY);
      const encrypted = mod.encrypt('');
      expect(mod.isEncrypted(encrypted)).toBe(true);
      expect(mod.decrypt(encrypted)).toBe('');
    });
  });

  describe('unicode and special character handling', () => {
    it('should handle unicode characters', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = 'Hallo Welt! Umlaute: aou - Emoji: \u{1F680}\u{1F30D}';
      const encrypted = mod.encrypt(plaintext);
      expect(mod.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle special characters and symbols', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`\'"\\';
      const encrypted = mod.encrypt(plaintext);
      expect(mod.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle newlines and tabs', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = 'line1\nline2\ttab\rcarriage';
      const encrypted = mod.encrypt(plaintext);
      expect(mod.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle CJK characters', () => {
      const mod = loadModule(TEST_KEY);
      const plaintext = '\u4F60\u597D\u4E16\u754C \u3053\u3093\u306B\u3061\u306F \uC548\uB155\uD558\uC138\uC694';
      const encrypted = mod.encrypt(plaintext);
      expect(mod.decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('reEncrypt()', () => {
    it('should produce different ciphertext but same plaintext', () => {
      const mod = loadModule(TEST_KEY);
      const original = mod.encrypt('rotate me');
      const rotated = mod.reEncrypt(original);

      expect(rotated).not.toBe(original);
      expect(mod.isEncrypted(rotated)).toBe(true);
      expect(mod.decrypt(rotated)).toBe('rotate me');
    });

    it('should work on already-encrypted values', () => {
      const mod = loadModule(TEST_KEY);
      const first = mod.encrypt('data');
      const second = mod.reEncrypt(first);
      const third = mod.reEncrypt(second);

      expect(mod.decrypt(third)).toBe('data');
      // All three should be different due to random IV
      expect(first).not.toBe(second);
      expect(second).not.toBe(third);
    });
  });

  describe('generateEncryptionKey()', () => {
    it('should return a 64-character hex string', () => {
      const mod = loadModule(null);
      const key = mod.generateEncryptionKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });

    it('should generate unique keys each time', () => {
      const mod = loadModule(null);
      const key1 = mod.generateEncryptionKey();
      const key2 = mod.generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });

    it('should produce a key that works with encrypt/decrypt', () => {
      const mod = loadModule(null);
      const newKey = mod.generateEncryptionKey();
      const modWithKey = loadModule(newKey);
      const encrypted = modWithKey.encrypt('test with generated key');
      expect(modWithKey.decrypt(encrypted)).toBe('test with generated key');
    });
  });

  describe('invalid key handling', () => {
    it('should disable encryption for key that is too short', () => {
      const mod = loadModule('abcdef'); // way too short
      expect(mod.isEncryptionAvailable()).toBe(false);
      // encrypt should return plaintext (graceful degradation)
      expect(mod.encrypt('test')).toBe('test');
    });

    it('should disable encryption for key that is too long', () => {
      const mod = loadModule('a'.repeat(128));
      expect(mod.isEncryptionAvailable()).toBe(false);
    });

    it('should disable encryption for key with non-hex characters', () => {
      const mod = loadModule('g'.repeat(64)); // 'g' is not valid hex
      expect(mod.isEncryptionAvailable()).toBe(false);
    });

    it('initEncryption() should return false for invalid key', () => {
      const mod = loadModule('short');
      expect(mod.initEncryption()).toBe(false);
    });
  });

  describe('versioned prefix', () => {
    it('should include enc:v1: prefix in encrypted output', () => {
      const mod = loadModule(TEST_KEY);
      const encrypted = mod.encrypt('test');
      expect(encrypted.startsWith('enc:v1:')).toBe(true);
    });

    it('encrypted value should have 5 colon-separated parts', () => {
      const mod = loadModule(TEST_KEY);
      const encrypted = mod.encrypt('test');
      // Format: enc:v1:base64(iv):base64(tag):base64(data)
      const parts = encrypted.split(':');
      expect(parts.length).toBe(5);
      expect(parts[0]).toBe('enc');
      expect(parts[1]).toBe('v1');
    });
  });

  describe('initEncryption()', () => {
    it('should return true with valid key', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.initEncryption()).toBe(true);
    });

    it('should set isEncryptionAvailable to true with valid key', () => {
      const mod = loadModule(TEST_KEY);
      expect(mod.isEncryptionAvailable()).toBe(true);
    });
  });

  describe('cross-key isolation', () => {
    it('should fail to decrypt with a different key', () => {
      const modA = loadModule(TEST_KEY);
      const encrypted = modA.encrypt('cross-key secret');

      const modB = loadModule(TEST_KEY_2);
      expect(() => modB.decrypt(encrypted)).toThrow();
    });
  });
});
