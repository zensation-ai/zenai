/**
 * Sprint 1.5 Item 3 — Rotation-Script Unit-Tests
 *
 * Testet `rotateTextValue` und `rotateJsonbValue` aus
 * `scripts/rotate-encryption-key.ts`. Die DB-Integration (Client-Pagination,
 * UPDATE-Queries) wird hier nicht getestet — dafür gibt es
 * separaten Integration-Lauf.
 */

// Setze beide Keys VOR dem Import.
process.env.ENCRYPTION_KEY =
  '11111111111111111111111111111111111111111111111111111111111111aa';
process.env.ENCRYPTION_KEY_PREVIOUS =
  '22222222222222222222222222222222222222222222222222222222222222bb';

import {
  rotateTextValue,
  rotateJsonbValue,
} from '../../../../../scripts/rotate-encryption-key';
import {
  encrypt,
  decrypt,
  initEncryption,
  isEncryptedWithCurrentKey,
} from '../../../services/security/field-encryption';

describe('rotate-encryption-key — Unit-Helper', () => {
  beforeAll(() => {
    initEncryption();
  });

  // ─── rotateTextValue ─────────────────────────────────────────────────────────

  describe('rotateTextValue', () => {
    it('returnt null für null/leer (nichts zu rotieren)', () => {
      expect(rotateTextValue(null)).toBeNull();
      expect(rotateTextValue('')).toBeNull();
    });

    it('returnt null für Plaintext (rotation macht nur Ciphertexte)', () => {
      expect(rotateTextValue('just-plaintext')).toBeNull();
    });

    it('returnt null für bereits CURRENT-verschlüsselte Werte (idempotent)', () => {
      const enc = encrypt('already-A');
      expect(isEncryptedWithCurrentKey(enc)).toBe(true);
      expect(rotateTextValue(enc)).toBeNull();
    });

    it('re-encrypted Legacy-Envelope zu neuem A-getaggten Envelope', () => {
      const encA = encrypt('legacy-payload');
      const legacy = `enc:v1:${encA.split(':').slice(3).join(':')}`;
      const rotated = rotateTextValue(legacy);
      expect(rotated).not.toBeNull();
      expect(rotated!.startsWith('enc:v1:A:')).toBe(true);
      expect(decrypt(rotated!)).toBe('legacy-payload');
    });
  });

  // ─── rotateJsonbValue ────────────────────────────────────────────────────────

  describe('rotateJsonbValue', () => {
    it('returnt null für null', () => {
      expect(rotateJsonbValue(null)).toBeNull();
    });

    it('returnt null, wenn keine encrypted-Strings im Objekt sind', () => {
      expect(rotateJsonbValue({ port: 443, plaintext: 'nope' })).toBeNull();
    });

    it('returnt null, wenn alle encrypted-Strings bereits CURRENT sind', () => {
      const cred = { apiKey: encrypt('sk-live'), token: encrypt('tok') };
      expect(rotateJsonbValue(cred)).toBeNull();
    });

    it('rotiert Legacy-Envelope-Leaves, lässt CURRENT-Leaves in Ruhe', () => {
      const encA = encrypt('a-secret');
      const legacy = `enc:v1:${encA.split(':').slice(3).join(':')}`;
      const alreadyCurrent = encrypt('b-secret');

      const input = { legacy, current: alreadyCurrent, port: 443 };
      const out = rotateJsonbValue(input) as {
        legacy: string;
        current: string;
        port: number;
      };
      expect(out).not.toBeNull();
      expect(out.legacy.startsWith('enc:v1:A:')).toBe(true);
      expect(out.current).toBe(alreadyCurrent); // unchanged
      expect(out.port).toBe(443);
      // Round-trip: alle können decrypten.
      expect(decrypt(out.legacy)).toBe('a-secret');
      expect(decrypt(out.current)).toBe('b-secret');
    });

    it('traversiert verschachtelte Objekte und Arrays rekursiv', () => {
      const encA = encrypt('nested-secret');
      const legacy = `enc:v1:${encA.split(':').slice(3).join(':')}`;
      const input = {
        server: { auth: { token: legacy } },
        keys: [legacy, 'plaintext', 42],
      };
      const out = rotateJsonbValue(input) as {
        server: { auth: { token: string } };
        keys: unknown[];
      };
      expect(out).not.toBeNull();
      expect(out.server.auth.token.startsWith('enc:v1:A:')).toBe(true);
      expect((out.keys[0] as string).startsWith('enc:v1:A:')).toBe(true);
      expect(out.keys[1]).toBe('plaintext');
      expect(out.keys[2]).toBe(42);
    });

    it('lässt Plaintext-Strings unverändert (kein Re-Encrypt)', () => {
      // Rotation-Semantik: nur encrypted → encrypted. Plaintext bleibt.
      expect(rotateJsonbValue({ notEncrypted: 'still-text' })).toBeNull();
    });

    it('ist idempotent: rotatedResult → null beim erneuten Aufruf', () => {
      const encA = encrypt('idempotency');
      const legacy = `enc:v1:${encA.split(':').slice(3).join(':')}`;
      const first = rotateJsonbValue({ a: legacy }) as Record<string, unknown>;
      expect(first).not.toBeNull();
      // Zweiter Durchlauf auf dem rotierten Objekt → nichts zu tun.
      expect(rotateJsonbValue(first)).toBeNull();
    });
  });
});
