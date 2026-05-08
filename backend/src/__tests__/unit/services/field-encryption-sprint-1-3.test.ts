/**
 * Sprint 1.3 — Field-Encryption: Zusatztests zum bestehenden field-encryption.test.ts
 *
 * Deckt Scope ab, der in Sprint 1.3 (Security-Hardening) dazugekommen ist:
 *
 *   1. Production-Mode Strict-Behavior
 *      → In NODE_ENV=production ohne ENCRYPTION_KEY MUSS encrypt() werfen,
 *        nicht graceful degradieren (sonst landet Plaintext in der DB).
 *
 *   2. Full Key-Rotation Workflow
 *      → Simuliert den Rotation-Prozess (Key-A → Key-B):
 *        a) Daten mit Key-A verschlüsseln
 *        b) Migration: mit Key-A entschlüsseln + mit Key-B neu verschlüsseln
 *        c) Alte Daten mit Key-B dekrypten geht, mit Key-A nicht mehr
 *
 *   3. DB CHECK-Constraint-Kompatibilität
 *      → Migration sprint_1_3_encrypt_sensitive_fields.sql setzt
 *        CHECK (col LIKE 'enc:v1:%'). Die encrypt()-Ausgabe MUSS diesen
 *        Constraint erfüllen, sonst wird jeder INSERT mit Fehler abgelehnt.
 *
 *   4. Migration-Datei-Struktur-Tests
 *      → Statische Analyse: BEGIN/COMMIT, idempotent, alle P0-Felder abgedeckt,
 *        keine destructive Operations ohne Gate.
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

import * as fs from 'fs';
import * as path from 'path';

const TEST_KEY_A = 'a'.repeat(64);
const TEST_KEY_B = 'b'.repeat(64);
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../sql/migrations/sprint_1_3_encrypt_sensitive_fields.sql'
);

describe('Sprint 1.3 — Field Encryption Supplemental Tests', () => {
  // NODE_ENV wird in afterEach restored, nicht in loadModule — encrypt() liest
  // process.env.NODE_ENV zur Laufzeit, daher muss es während des Testlaufs gesetzt bleiben.
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  function loadModule(keyOverride?: string | null, nodeEnv?: string) {
    let mod: typeof import('../../../services/security/field-encryption');
    jest.isolateModules(() => {
      if (keyOverride === null) {
        delete process.env.ENCRYPTION_KEY;
      } else if (keyOverride !== undefined) {
        process.env.ENCRYPTION_KEY = keyOverride;
      }
      if (nodeEnv !== undefined) {
        process.env.NODE_ENV = nodeEnv;
      }
      mod = require('../../../services/security/field-encryption');
    });
    return mod!;
  }

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    jest.restoreAllMocks();
  });

  // ===========================================
  // 1. Production-Mode Strict-Behavior
  // ===========================================

  describe('Production-Mode Strict-Behavior', () => {
    it('encrypt() wirft in production OHNE ENCRYPTION_KEY', () => {
      const mod = loadModule(null, 'production');
      expect(() => mod.encrypt('secret')).toThrow(/ENCRYPTION_KEY is required in production/);
    });

    it('encrypt() degradiert graceful in development OHNE ENCRYPTION_KEY', () => {
      const mod = loadModule(null, 'development');
      expect(mod.encrypt('secret')).toBe('secret');
    });

    it('encrypt() degradiert graceful in test-Umgebung OHNE ENCRYPTION_KEY', () => {
      const mod = loadModule(null, 'test');
      expect(mod.encrypt('secret')).toBe('secret');
    });

    it('decrypt() eines verschlüsselten Wertes wirft in production OHNE Key', () => {
      // Erst mit Key verschlüsseln
      const modWithKey = loadModule(TEST_KEY_A, 'production');
      const encrypted = modWithKey.encrypt('secret');

      // Dann ohne Key versuchen zu dekrypten (production oder dev — beides wirft)
      const modNoKey = loadModule(null, 'production');
      expect(() => modNoKey.decrypt(encrypted)).toThrow(/ENCRYPTION_KEY not set/);
    });
  });

  // ===========================================
  // 2. Full Key-Rotation Workflow
  // ===========================================

  describe('Full Key-Rotation Workflow (Key-A → Key-B)', () => {
    it('führt vollständige Rotation korrekt durch', () => {
      // Phase 1: Daten mit Key-A verschlüsseln (Ist-Zustand vor Rotation)
      const modA = loadModule(TEST_KEY_A);
      const plaintext = 'oauth-access-token-secret';
      const encryptedWithA = modA.encrypt(plaintext);

      expect(modA.isEncrypted(encryptedWithA)).toBe(true);
      expect(modA.decrypt(encryptedWithA)).toBe(plaintext);

      // Phase 2: Migration-Schritt — mit Key-A entschlüsseln, mit Key-B neu verschlüsseln
      // (entspricht dem Backfill-Script: old_key → new_key Rotation)
      const decrypted = modA.decrypt(encryptedWithA);
      const modB = loadModule(TEST_KEY_B);
      const encryptedWithB = modB.encrypt(decrypted);

      expect(modB.isEncrypted(encryptedWithB)).toBe(true);
      expect(encryptedWithB).not.toBe(encryptedWithA); // andere IV + anderer Cipher

      // Phase 3: Mit Key-B dekrypten geht
      expect(modB.decrypt(encryptedWithB)).toBe(plaintext);

      // Phase 4: Mit Key-A dekrypten geht NICHT mehr (alte Daten sind unbrauchbar)
      expect(() => modA.decrypt(encryptedWithB)).toThrow();
    });

    it('kann mehrere Zeilen parallel rotieren (Batch-Rotation)', () => {
      const modA = loadModule(TEST_KEY_A);
      const secrets = ['tok-1', 'tok-2', 'tok-3', 'tok-4', 'tok-5'];
      const encryptedBatchA = secrets.map((s) => modA.encrypt(s));

      // Rotation
      const modB = loadModule(TEST_KEY_B);
      const rotatedBatch = encryptedBatchA.map((e) => {
        const plain = modA.decrypt(e);
        return modB.encrypt(plain);
      });

      // Verify: alle mit neuem Key dekryptbar
      const decrypted = rotatedBatch.map((e) => modB.decrypt(e));
      expect(decrypted).toEqual(secrets);

      // Alle Ciphertexts sind unterschiedlich (eigener IV pro Wert)
      expect(new Set(rotatedBatch).size).toBe(rotatedBatch.length);
    });

    it('rotation ist idempotent (doppelte Rotation = Wert ist immer noch korrekt)', () => {
      const modA = loadModule(TEST_KEY_A);
      const plaintext = 'sensitive-data';
      const roundA = modA.encrypt(plaintext);

      // Erste Rotation A → B
      const modB = loadModule(TEST_KEY_B);
      const roundB = modB.encrypt(modA.decrypt(roundA));

      // Zweite Rotation B → A (Rollback-Szenario)
      const modA2 = loadModule(TEST_KEY_A);
      const roundA2 = modA2.encrypt(modB.decrypt(roundB));

      expect(modA2.decrypt(roundA2)).toBe(plaintext);
    });

    it('reEncrypt() produziert neuen IV bei gleichem Key (nicht nur bei Key-Wechsel)', () => {
      const mod = loadModule(TEST_KEY_A);
      const first = mod.encrypt('refresh-every-week');

      // 5× reEncrypt — alle Ciphertexts müssen unterschiedlich sein
      const rotated = Array.from({ length: 5 }, () => {
        let current = first;
        current = mod.reEncrypt(current);
        return current;
      });

      // Einzelne Rotationen
      let chain = first;
      const chainCiphertexts: string[] = [first];
      for (let i = 0; i < 5; i++) {
        chain = mod.reEncrypt(chain);
        chainCiphertexts.push(chain);
      }

      // Alle Ciphertexts in der Chain sind unterschiedlich (neuer IV)
      expect(new Set(chainCiphertexts).size).toBe(chainCiphertexts.length);

      // Plaintext bleibt erhalten
      expect(mod.decrypt(chain)).toBe('refresh-every-week');
    });
  });

  // ===========================================
  // 3. DB CHECK-Constraint-Kompatibilität
  // ===========================================

  describe('DB CHECK-Constraint-Kompatibilität (enc:v1:%)', () => {
    // Migration-Constraint: CHECK (col IS NULL OR col LIKE 'enc:v1:%')
    // JS-Äquivalent: val.startsWith('enc:v1:')
    function matchesCheckConstraint(value: string): boolean {
      return value.startsWith('enc:v1:');
    }

    it('encrypt() erzeugt IMMER einen Wert der CHECK (LIKE enc:v1:%) erfüllt', () => {
      const mod = loadModule(TEST_KEY_A);
      const testCases = [
        'short',
        'a'.repeat(10000),
        '',
        'unicode-\u{1F680}',
        JSON.stringify({ oauth: 'access', exp: 1234567890 }),
        '\0\n\t',
      ];

      for (const input of testCases) {
        const encrypted = mod.encrypt(input);
        expect(matchesCheckConstraint(encrypted)).toBe(true);
      }
    });

    it('reEncrypt() Ausgabe erfüllt ebenfalls CHECK-Constraint', () => {
      const mod = loadModule(TEST_KEY_A);
      const initial = mod.encrypt('migrating-token');
      const rotated = mod.reEncrypt(initial);
      expect(matchesCheckConstraint(rotated)).toBe(true);
    });

    it('Plaintext-Werte würden den CHECK-Constraint VERLETZEN (negative Probe)', () => {
      const plaintextValues = [
        'raw-oauth-token',
        'ya29.a0AfH6SMB...',  // Google-OAuth-Token-Format
        'totp-secret',
        'enc:v0:old-format', // alte Version — erfüllt NICHT enc:v1:
        'enc:something-else',
      ];

      for (const val of plaintextValues) {
        expect(matchesCheckConstraint(val)).toBe(false);
      }
    });

    it('encrypt() Ausgabe passt in eine TEXT-Spalte (keine ungewöhnlichen Bytes)', () => {
      const mod = loadModule(TEST_KEY_A);
      const encrypted = mod.encrypt('any plaintext');
      // Sprint 1.5 dual-key format: enc:v1:A:base64(iv):base64(tag):base64(cipher)
      // Nur [A-Za-z0-9+/=], Buchstaben-Key-ID, ':' — kein NUL, kein Escape-Problem.
      expect(
        /^enc:v1:[A-B]:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(encrypted)
      ).toBe(true);
    });
  });

  // ===========================================
  // 4. Sprint-1.3-Migration Struktur-Tests
  // ===========================================

  describe('Sprint-1.3-Migration Datei-Struktur', () => {
    let migrationSQL: string;

    beforeAll(() => {
      expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
      migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
    });

    it('ist in BEGIN/COMMIT gewrappt (atomar)', () => {
      expect(migrationSQL).toMatch(/^\s*(?:--[^\n]*\n)*\s*BEGIN;/m);
      expect(migrationSQL).toMatch(/\nCOMMIT;\s*$/m);
    });

    it('deckt alle 5 P0-Spalten ab (mfa_secret + 4× OAuth-Tokens)', () => {
      // Audit-Block prüft jede Spalte
      expect(migrationSQL).toMatch(/users.*mfa_secret/i);
      expect(migrationSQL).toMatch(/integration_tokens.*access_token/i);
      expect(migrationSQL).toMatch(/integration_tokens.*refresh_token/i);
      expect(migrationSQL).toMatch(/google_oauth_tokens.*access_token/i);
      expect(migrationSQL).toMatch(/google_oauth_tokens.*refresh_token/i);
    });

    it('nutzt idempotente DROP CONSTRAINT IF EXISTS vor jedem ADD', () => {
      // Jede *_encrypted_check Constraint hat DROP + ADD
      const constraintNames = [
        'users_mfa_secret_encrypted_check',
        'integration_tokens_access_token_encrypted_check',
        'integration_tokens_refresh_token_encrypted_check',
        'google_oauth_tokens_access_token_encrypted_check',
        'google_oauth_tokens_refresh_token_encrypted_check',
      ];
      for (const c of constraintNames) {
        expect(migrationSQL).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${c}`));
        expect(migrationSQL).toMatch(new RegExp(`ADD CONSTRAINT ${c}`));
      }
    });

    it('CHECK-Klausel nutzt LIKE enc:v1:% (nicht nur enc:)', () => {
      // Nur enc:v1:%, nicht enc:%-only (das wäre zu permissive)
      const checkClauses = migrationSQL.match(/LIKE ''enc:v1:%''/g) || [];
      expect(checkClauses.length).toBeGreaterThanOrEqual(5); // mindestens 5 P0-Spalten
    });

    it('bricht NICHT ab bei Plaintext-Bestandsdaten, skippt stattdessen Phase 3', () => {
      // Sucht nach skip_constraints-Gate
      expect(migrationSQL).toMatch(/sprint_1_3\.skip_constraints/);
      expect(migrationSQL).toMatch(/set_config\('sprint_1_3\.skip_constraints'/);
      // RAISE WARNING, nicht RAISE EXCEPTION (Migration soll durchlaufen)
      expect(migrationSQL).toMatch(/RAISE WARNING/);
      expect(migrationSQL).not.toMatch(/RAISE EXCEPTION.*Plaintext/i);
    });

    it('prüft Tabellen-Existenz vor ALTER (robust gegen fehlende Tables)', () => {
      // Jeder ALTER-Block ist in IF EXISTS information_schema gewrapt
      const alterBlocks = migrationSQL.match(/ALTER TABLE public\.\w+ ADD CONSTRAINT/g) || [];
      expect(alterBlocks.length).toBeGreaterThanOrEqual(5);

      // Die Existenz-Checks kommen vor den Altern
      const existsChecks = migrationSQL.match(/information_schema\.(tables|columns)/g) || [];
      expect(existsChecks.length).toBeGreaterThanOrEqual(5);
    });

    it('enthält COMMENT ON COLUMN für Dokumentations-Tools', () => {
      expect(migrationSQL).toMatch(/COMMENT ON COLUMN public\.users\.mfa_secret/);
      expect(migrationSQL).toMatch(/COMMENT ON COLUMN public\.integration_tokens\.access_token/);
      expect(migrationSQL).toMatch(/COMMENT ON COLUMN public\.integration_tokens\.refresh_token/);
      expect(migrationSQL).toMatch(/COMMENT ON COLUMN public\.google_oauth_tokens\.access_token/);
      expect(migrationSQL).toMatch(/COMMENT ON COLUMN public\.google_oauth_tokens\.refresh_token/);
    });

    it('enthält Rollback-Anleitung als Kommentar', () => {
      expect(migrationSQL).toMatch(/Rollback/i);
      // Rollback-Statements sind in den Kommentaren enthalten
      expect(migrationSQL).toMatch(/DROP CONSTRAINT IF EXISTS users_mfa_secret_encrypted_check/);
    });

    it('verändert KEINE Daten (nur Schema-Änderungen)', () => {
      // Keine UPDATE/DELETE/INSERT-Statements auf Nutz-Tabellen
      const dataChanges = migrationSQL.match(/^\s*(UPDATE|DELETE FROM|INSERT INTO) public\./gm) || [];
      expect(dataChanges).toEqual([]);
    });
  });
});
