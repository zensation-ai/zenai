/**
 * Sprint 1.5 — Backfill-Script Unit-Tests
 *
 * Testet die Encryption-Helper aus
 * `scripts/backfill-context-schema-encryption.ts`. Die DB-Integration (Client,
 * Pagination, Update-Queries) wird nicht getestet — dafür gibt es einen
 * separaten Integration-Runner.
 *
 * Fokus: Idempotenz (enc:v1:-Skip), rekursive JSONB-Traversierung, Edge-Cases
 * (null, leer, Zahlen, Booleans, verschachtelte Objekte/Arrays).
 */

// Setze ENCRYPTION_KEY VOR dem Import, damit initEncryption() beim ersten
// Import erfolgreich ist.
process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import {
  encryptTextValue,
  encryptJsonbValue,
} from '../../../../../scripts/backfill-context-schema-encryption';
import { isEncrypted, initEncryption } from '../../../services/security/field-encryption';

describe('backfill-context-schema-encryption — Unit-Helper', () => {
  beforeAll(() => {
    initEncryption();
  });

  // ─── encryptTextValue ────────────────────────────────────────────────────────

  describe('encryptTextValue', () => {
    it('gibt null zurück für null-Input (nichts zu tun)', () => {
      expect(encryptTextValue(null)).toBeNull();
    });

    it('gibt null zurück für leeren String (nichts zu tun)', () => {
      expect(encryptTextValue('')).toBeNull();
    });

    it('gibt null zurück für bereits verschlüsselte Werte (idempotent)', () => {
      const alreadyEncrypted = 'enc:v1:dGVzdA==:dGVzdA==:dGVzdA==';
      expect(encryptTextValue(alreadyEncrypted)).toBeNull();
    });

    it('verschlüsselt Plaintext und liefert "enc:v1:..."-String zurück', () => {
      const result = encryptTextValue('hello world');
      expect(result).not.toBeNull();
      expect(result!.startsWith('enc:v1:')).toBe(true);
      expect(isEncrypted(result!)).toBe(true);
    });

    it('produziert unterschiedliche Ciphertexts für denselben Plaintext (IV-Unique)', () => {
      const a = encryptTextValue('same-input');
      const b = encryptTextValue('same-input');
      expect(a).not.toBe(b);
    });

    it('ist idempotent: enc-Wert durch encryptTextValue → null, neuer Plaintext → neuer enc-Wert', () => {
      const enc = encryptTextValue('my-secret');
      expect(enc).not.toBeNull();
      const second = encryptTextValue(enc!);
      expect(second).toBeNull();
    });
  });

  // ─── encryptJsonbValue ───────────────────────────────────────────────────────

  describe('encryptJsonbValue', () => {
    it('gibt null zurück für null-Input', () => {
      expect(encryptJsonbValue(null)).toBeNull();
    });

    it('gibt null zurück, wenn keine String-Leaves im Objekt sind', () => {
      expect(encryptJsonbValue({ port: 443, tls: true })).toBeNull();
    });

    it('verschlüsselt nur String-Leaves, lässt Zahlen/Booleans in Ruhe', () => {
      const input = { apiKey: 'sk-test-123', port: 443, verified: true };
      const out = encryptJsonbValue(input) as Record<string, unknown>;
      expect(out).not.toBeNull();
      expect(typeof out.apiKey).toBe('string');
      expect((out.apiKey as string).startsWith('enc:v1:')).toBe(true);
      expect(out.port).toBe(443);
      expect(out.verified).toBe(true);
    });

    it('traversiert verschachtelte Objekte rekursiv', () => {
      const input = {
        server: {
          host: 'api.example.com',
          auth: { token: 'secret-token' },
        },
      };
      const out = encryptJsonbValue(input) as {
        server: { host: string; auth: { token: string } };
      };
      expect(out.server.host.startsWith('enc:v1:')).toBe(true);
      expect(out.server.auth.token.startsWith('enc:v1:')).toBe(true);
    });

    it('traversiert Arrays und verschlüsselt String-Elemente', () => {
      const input = { keys: ['key-a', 'key-b', 42, true] };
      const out = encryptJsonbValue(input) as { keys: unknown[] };
      expect(typeof out.keys[0]).toBe('string');
      expect((out.keys[0] as string).startsWith('enc:v1:')).toBe(true);
      expect((out.keys[1] as string).startsWith('enc:v1:')).toBe(true);
      expect(out.keys[2]).toBe(42);
      expect(out.keys[3]).toBe(true);
    });

    it('lässt leere Strings unverändert (keine Verschlüsselung)', () => {
      const input = { optional: '' };
      // Kein Change → null.
      expect(encryptJsonbValue(input)).toBeNull();
    });

    it('erkennt bereits verschlüsselte Strings und lässt sie unverändert', () => {
      const existing = 'enc:v1:aGVsbG8=:aGVsbG8=:aGVsbG8=';
      const input = { token: existing };
      expect(encryptJsonbValue(input)).toBeNull();
    });

    it('mischt neue + alte Verschlüsselung: nur Plaintext-Leaves werden touched', () => {
      const input = {
        already: 'enc:v1:aGVsbG8=:aGVsbG8=:aGVsbG8=',
        plaintext: 'new-secret',
      };
      const out = encryptJsonbValue(input) as Record<string, string>;
      expect(out).not.toBeNull();
      expect(out.already).toBe(input.already);
      expect(out.plaintext.startsWith('enc:v1:')).toBe(true);
    });

    it('ist idempotent: bereits vollständig verschlüsselter Input → null', () => {
      const allEncrypted = {
        a: 'enc:v1:aGVsbG8=:aGVsbG8=:aGVsbG8=',
        b: { c: 'enc:v1:d29ybGQ=:d29ybGQ=:d29ybGQ=' },
      };
      expect(encryptJsonbValue(allEncrypted)).toBeNull();
    });

    it('behandelt flachen String als Leaf (kein Wrapping)', () => {
      const out = encryptJsonbValue('plain-string') as string;
      expect(typeof out).toBe('string');
      expect(out.startsWith('enc:v1:')).toBe(true);
    });
  });
});
