/**
 * Sprint 1.5 — Context-Schema CHECK-Constraints Struktur-Tests
 *
 * Statische Analyse von
 * `sprint_1_5_context_schema_check_constraints.sql`. Verifiziert, dass alle
 * 6 P1-Felder × 4 Schemas CHECK-Constraints bekommen, die NOT VALID Strategie
 * konsistent angewendet wird und die JSONB-Helper-Function korrekt definiert
 * ist.
 *
 * Analog zu rls-per-context-sprint-1-5.test.ts — DB-Integration läuft separat.
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../sql/migrations/sprint_1_5_context_schema_check_constraints.sql'
);

// 6 P1-Felder aus Sprint 1.5 Item 2.
const EXPECTED_FIELDS = [
  {
    table: 'mcp_server_connections',
    column: 'credentials',
    constraintName: 'mcp_credentials_encrypted_sprint_1_5',
    kind: 'jsonb' as const,
  },
  {
    table: 'email_accounts',
    column: 'smtp_password',
    constraintName: 'smtp_password_encrypted_sprint_1_5',
    kind: 'text' as const,
  },
  {
    table: 'email_accounts',
    column: 'imap_password',
    constraintName: 'imap_password_encrypted_sprint_1_5',
    kind: 'text' as const,
  },
  {
    table: 'calendar_events',
    column: 'location',
    constraintName: 'location_encrypted_sprint_1_5',
    kind: 'text' as const,
  },
  {
    table: 'financial_accounts',
    column: 'account_number',
    constraintName: 'account_number_encrypted_sprint_1_5',
    kind: 'text' as const,
  },
  {
    table: 'contacts',
    column: 'phone',
    constraintName: 'phone_encrypted_sprint_1_5',
    kind: 'text' as const,
  },
];

const REQUIRED_SCHEMAS = ['operations', 'finance', 'people', 'strategy'];

describe('Sprint 1.5 — Context-Schema CHECK-Constraints Migration', () => {
  let migrationSQL: string;

  beforeAll(() => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
  });

  // ─── Datei-Integrität ────────────────────────────────────────────────────────

  describe('Datei-Integrität', () => {
    it('ist in BEGIN/COMMIT gewrappt (atomar)', () => {
      expect(migrationSQL).toMatch(/^\s*(?:--[^\n]*\n)*\s*BEGIN;/m);
      expect(migrationSQL).toMatch(/\nCOMMIT;\s*$/m);
    });

    it('enthält keinen SET ROLE / SUPERUSER-Escalation', () => {
      expect(migrationSQL).not.toMatch(/SET\s+ROLE/i);
      expect(migrationSQL).not.toMatch(/SET\s+SESSION\s+AUTHORIZATION/i);
    });

    it('verweist auf den Backfill-Script-Pfad im Header', () => {
      expect(migrationSQL).toContain('scripts/backfill-context-schema-encryption.ts');
    });
  });

  // ─── JSONB-Helper-Funktion ───────────────────────────────────────────────────

  describe('Helper-Function public.is_jsonb_strings_encrypted', () => {
    it('wird als IMMUTABLE deklariert (für CHECK-Constraints erforderlich)', () => {
      expect(migrationSQL).toMatch(
        /CREATE OR REPLACE FUNCTION public\.is_jsonb_strings_encrypted\(val jsonb\)\s+RETURNS boolean/
      );
      expect(migrationSQL).toMatch(/IMMUTABLE/);
    });

    it('traversiert JSONB rekursiv via jsonb_path_query($.**)', () => {
      expect(migrationSQL).toMatch(/jsonb_path_query\(val,\s*'strict\s*\$\.\*\*'\)/);
    });

    it('filtert auf jsonb_typeof(value) = string', () => {
      expect(migrationSQL).toMatch(/jsonb_typeof\(value\)\s*=\s*'string'/);
    });

    it('prüft "enc:v1:"-Präfix auf jedem String-Leaf', () => {
      expect(migrationSQL).toMatch(/NOT LIKE\s*'enc:v1:%'/);
    });

    it('dokumentiert die Helper-Funktion via COMMENT ON FUNCTION', () => {
      expect(migrationSQL).toMatch(
        /COMMENT ON FUNCTION public\.is_jsonb_strings_encrypted\(jsonb\)/
      );
    });
  });

  // ─── Phase 1: Audit ──────────────────────────────────────────────────────────

  describe('Phase 1 — Plaintext-Audit', () => {
    it('zählt Plaintext-Bestandsdaten für alle Schemas', () => {
      for (const schema of REQUIRED_SCHEMAS) {
        expect(migrationSQL).toContain(`'${schema}'`);
      }
    });

    it('RAISE NOTICE beim Start des Audits', () => {
      expect(migrationSQL).toMatch(/Sprint 1\.5 Context-Schema Encryption-Audit/);
    });

    it('RAISE WARNING wenn Plaintext-Bestand gefunden', () => {
      expect(migrationSQL).toMatch(/RAISE WARNING\s+'Plaintext-Bestand gefunden/);
    });

    it('dokumentiert VALIDATE-CONSTRAINT-Nachzug im Warning', () => {
      expect(migrationSQL).toContain('VALIDATE');
      expect(migrationSQL).toContain('Backfill');
    });
  });

  // ─── Phase 3: Constraint-Anlage ──────────────────────────────────────────────

  describe('Phase 3 — CHECK-Constraints', () => {
    it('nutzt durchgängig NOT VALID-Strategie (nie direktes ADD CONSTRAINT ... CHECK ohne NOT VALID)', () => {
      // Pro Constraint-Name: verifiziere, dass im nachfolgenden ADD-Block innerhalb
      // von ~500 Zeichen das NOT VALID erscheint. Die SQL-Statements laufen
      // mehrzeilig als format()-String-Konkatenation — eine generische Regex
      // über CHECK(...) hinweg ist durch doppelte Single-Quotes ('') unzuverlässig.
      for (const { constraintName } of EXPECTED_FIELDS) {
        const re = new RegExp(
          `ADD CONSTRAINT ${constraintName}[\\s\\S]{0,500}?NOT VALID`
        );
        expect(migrationSQL).toMatch(re);
      }
    });

    it('droppt vor jedem ADD CONSTRAINT das IF-EXISTS-Pendant (idempotent)', () => {
      for (const { constraintName } of EXPECTED_FIELDS) {
        expect(migrationSQL).toContain(`DROP CONSTRAINT IF EXISTS ${constraintName}`);
      }
    });

    for (const field of EXPECTED_FIELDS) {
      it(`legt Constraint ${field.constraintName} auf ${field.table}.${field.column} (${field.kind}) an`, () => {
        const addPattern = new RegExp(
          `ADD CONSTRAINT ${field.constraintName}[\\s\\S]{0,300}?CHECK`
        );
        expect(migrationSQL).toMatch(addPattern);
      });
    }

    it('JSONB-Constraint nutzt public.is_jsonb_strings_encrypted als Prüffunktion', () => {
      expect(migrationSQL).toMatch(
        /ADD CONSTRAINT mcp_credentials_encrypted_sprint_1_5[\s\S]*?public\.is_jsonb_strings_encrypted\(credentials\)/
      );
    });

    it('TEXT-Constraints nutzen einheitlich LIKE-Pattern mit enc:v1:', () => {
      // Alle 5 TEXT-Constraints müssen LIKE 'enc:v1:%' verwenden.
      const textFields = EXPECTED_FIELDS.filter(f => f.kind === 'text');
      for (const field of textFields) {
        const re = new RegExp(
          `ADD CONSTRAINT ${field.constraintName}[\\s\\S]{0,300}?${field.column} LIKE ''enc:v1:%%''`
        );
        expect(migrationSQL).toMatch(re);
      }
    });

    it('erlaubt NULL und Leerstring für Location/Phone (optionale PII)', () => {
      // location und phone können bei Bestandsdaten auch '' sein — das soll erlaubt bleiben.
      expect(migrationSQL).toMatch(/location\s*=\s*''''\s*OR/);
      expect(migrationSQL).toMatch(/phone\s*=\s*''''\s*OR/);
    });
  });

  // ─── Audit-View ──────────────────────────────────────────────────────────────

  describe('Audit-View v_sprint_1_5_constraint_status', () => {
    it('wird am Ende der Migration erstellt', () => {
      expect(migrationSQL).toMatch(
        /CREATE OR REPLACE VIEW public\.v_sprint_1_5_constraint_status/
      );
    });

    it('filtert auf Constraints mit Suffix "_encrypted_sprint_1_5"', () => {
      expect(migrationSQL).toMatch(/con\.conname LIKE '%_encrypted_sprint_1_5'/);
    });

    it('exposes convalidated als is_validated für Dashboards', () => {
      expect(migrationSQL).toMatch(/con\.convalidated\s+AS\s+is_validated/);
    });
  });

  // ─── Rollback-Dokumentation ──────────────────────────────────────────────────

  describe('Rollback-Dokumentation', () => {
    it('dokumentiert DROP CONSTRAINT IF EXISTS + DROP FUNCTION als Rollback', () => {
      expect(migrationSQL).toMatch(/Rollback:/);
      expect(migrationSQL).toMatch(/DROP CONSTRAINT IF EXISTS/);
      expect(migrationSQL).toMatch(/DROP FUNCTION IF EXISTS public\.is_jsonb_strings_encrypted/);
    });
  });
});
