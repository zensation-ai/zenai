/**
 * Sprint 1.5 — Per-Context-RLS-Migration Struktur-Tests
 *
 * Statische Analyse der Per-Context-RLS-Migration
 * (sprint_1_5_per_context_rls.sql). Verifiziert, dass die 15 sensitivsten
 * Tabellen pro Schema abgedeckt sind und die Policy-Konventionen eingehalten
 * werden.
 *
 * Analog zu rls-policy-structure.test.ts (Sprint 1.3): DB-Integration läuft
 * separat via testcontainers; dieser Test fängt strukturelle Regressions im
 * Haupt-Testlauf.
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../sql/migrations/sprint_1_5_per_context_rls.sql'
);

// Die 15 sensitivsten Tabellen pro Kontext-Schema aus Sprint 1.5 Scope.
const REQUIRED_TABLES = [
  'ideas',
  'tasks',
  'projects',
  'emails',
  'email_accounts',
  'calendar_events',
  'calendar_accounts',
  'contacts',
  'mcp_server_connections',
  'financial_accounts',
  'transactions',
  'general_chat_sessions',
  'general_chat_messages',
  'episodic_memories',
  'learned_facts',
];

const REQUIRED_SCHEMAS = ['operations', 'finance', 'people', 'strategy'];

describe('Sprint 1.5 — Per-Context-RLS-Migration', () => {
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

    it('nutzt keine hardcodierten UUIDs', () => {
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const matches = migrationSQL.match(uuidPattern) || [];
      // Erlaubt: Kommentare + Rollback-Beispiele. Wir filtern Erwähnungen
      // mit '00000000-...' als Kommentar-Beispiele aus.
      const nonExampleUUIDs = matches.filter(u => !u.startsWith('00000000'));
      expect(nonExampleUUIDs).toEqual([]);
    });
  });

  // ─── Table-Liste im DO-Block ─────────────────────────────────────────────────

  describe('Table-Liste im DO-Block', () => {
    it('enthält alle 15 geplanten Tabellen im tables-ARRAY', () => {
      const arrayMatch = migrationSQL.match(
        /tables\s+TEXT\[\]\s*:=\s*ARRAY\[([\s\S]*?)\];/
      );
      expect(arrayMatch).toBeTruthy();

      const arrayBody = arrayMatch![1];
      for (const table of REQUIRED_TABLES) {
        expect(arrayBody).toContain(`'${table}'`);
      }
    });

    it('enthält alle 4 Kontext-Schemas im schemas-ARRAY', () => {
      const arrayMatch = migrationSQL.match(
        /schemas\s+TEXT\[\]\s*:=\s*ARRAY\[([\s\S]*?)\];/
      );
      expect(arrayMatch).toBeTruthy();

      const arrayBody = arrayMatch![1];
      for (const schema of REQUIRED_SCHEMAS) {
        expect(arrayBody).toContain(`'${schema}'`);
      }
    });

    it('tables-ARRAY enthält keine unerlaubten Memory-/Metadaten-Tabellen', () => {
      // PMA-Memory + rag_* sind explizit OUT-OF-SCOPE (per Audit-Doc).
      const arrayMatch = migrationSQL.match(
        /tables\s+TEXT\[\]\s*:=\s*ARRAY\[([\s\S]*?)\];/
      );
      const arrayBody = arrayMatch![1];
      expect(arrayBody).not.toContain("'memory_copies'");
      expect(arrayBody).not.toContain("'reconsolidation_events'");
      expect(arrayBody).not.toContain("'rag_feedback'");
      expect(arrayBody).not.toContain("'sleep_compute_logs'");
    });
  });

  // ─── Policy-Struktur ─────────────────────────────────────────────────────────

  describe('Policy-Struktur', () => {
    it('nutzt einen einzigen, benannten Policy-Konstant ("workspace_isolation_sprint_1_5")', () => {
      expect(migrationSQL).toMatch(
        /policy_name\s+CONSTANT\s+TEXT\s*:=\s*'workspace_isolation_sprint_1_5'/
      );
    });

    it('PERMISSIVE-Policy (default) — RESTRICTIVE würde legacy workspace_isolation ersetzen', () => {
      // PostgreSQL default ist PERMISSIVE. Wir wollen explizit KEIN "AS RESTRICTIVE"
      // in der Sprint-1.5-Policy, damit sie kompatibel mit der bestehenden
      // RESTRICTIVE-Policy aus phase_multi_tenancy_d_rls.sql koexistieren kann.
      const createPolicyMatch = migrationSQL.match(
        /CREATE POLICY %I ON %I\.%I[\s\S]*?USING/
      );
      expect(createPolicyMatch).toBeTruthy();
      expect(createPolicyMatch![0]).not.toMatch(/AS\s+RESTRICTIVE/i);
    });

    it('Policy hat sowohl USING als auch WITH CHECK', () => {
      expect(migrationSQL).toMatch(/USING\s*\(/);
      expect(migrationSQL).toMatch(/WITH CHECK\s*\(/);
    });

    it('Policy erlaubt Admin-Bypass via app.is_admin = true', () => {
      expect(migrationSQL).toContain(
        "COALESCE(current_setting(''app.is_admin'', true), ''false'') = ''true''"
      );
    });

    it('Policy erlaubt Legacy-Fallback wenn GUC nicht gesetzt', () => {
      expect(migrationSQL).toContain(
        "NULLIF(current_setting(''app.current_workspace_id'', true), '''') IS NULL"
      );
    });

    it('Policy filtert auf workspace_id = current_setting(app.current_workspace_id)::uuid', () => {
      expect(migrationSQL).toContain(
        "workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid"
      );
    });
  });

  // ─── Idempotenz ──────────────────────────────────────────────────────────────

  describe('Idempotenz', () => {
    it('DROP POLICY IF EXISTS vor jedem CREATE POLICY', () => {
      expect(migrationSQL).toMatch(
        /EXECUTE format\('DROP POLICY IF EXISTS %I ON %I\.%I'/
      );
    });

    it('ALTER TABLE ENABLE RLS ist idempotent (kein "IF NOT EXISTS" nötig — Postgres erlaubt doppel-ENABLE)', () => {
      expect(migrationSQL).toMatch(
        /EXECUTE format\('ALTER TABLE %I\.%I ENABLE ROW LEVEL SECURITY'/
      );
    });

    it('nutzt KEIN FORCE ROW LEVEL SECURITY in DDL', () => {
      // Dokumentierte Entscheidung: Owner darf Migration-Recovery durchführen.
      // Wir checken nur tatsächliche SQL-Statements, nicht erklärende Kommentare.
      const ddlLines = migrationSQL
        .split('\n')
        .filter(line => !line.trim().startsWith('--'));
      const ddl = ddlLines.join('\n');
      expect(ddl).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    });

    it('überspringt Tabellen, die nicht in einem Schema existieren', () => {
      expect(migrationSQL).toMatch(/information_schema\.tables/);
      expect(migrationSQL).toMatch(/CONTINUE/);
    });

    it('überspringt Tabellen ohne workspace_id-Spalte', () => {
      expect(migrationSQL).toMatch(/information_schema\.columns[\s\S]*?column_name\s*=\s*'workspace_id'/);
    });
  });

  // ─── Audit-View ──────────────────────────────────────────────────────────────

  describe('Audit-View v_sprint_1_5_rls_status', () => {
    it('wird am Ende der Migration erstellt', () => {
      expect(migrationSQL).toMatch(
        /CREATE OR REPLACE VIEW public\.v_sprint_1_5_rls_status/
      );
    });

    it('listet alle 4 Schemas im WHERE-Filter', () => {
      const viewBlock = migrationSQL.match(
        /CREATE OR REPLACE VIEW public\.v_sprint_1_5_rls_status[\s\S]*?ORDER BY/
      );
      expect(viewBlock).toBeTruthy();
      for (const schema of REQUIRED_SCHEMAS) {
        expect(viewBlock![0]).toContain(`'${schema}'`);
      }
    });

    it('listet alle 15 Tabellen im relname-Filter', () => {
      const viewBlock = migrationSQL.match(
        /CREATE OR REPLACE VIEW public\.v_sprint_1_5_rls_status[\s\S]*?ORDER BY/
      );
      expect(viewBlock).toBeTruthy();
      for (const table of REQUIRED_TABLES) {
        expect(viewBlock![0]).toContain(`'${table}'`);
      }
    });

    it('exposes relrowsecurity + policy_count für externen Audit', () => {
      expect(migrationSQL).toMatch(/c\.relrowsecurity\s+AS\s+rls_enabled/);
      expect(migrationSQL).toMatch(/count\(\*\)[\s\S]*?FROM pg_policy p[\s\S]*?AS policy_count/);
    });
  });

  // ─── Rollback-Dokumentation (im Kommentar) ──────────────────────────────────

  describe('Rollback-Dokumentation', () => {
    it('dokumentiert Rollback-Schritte im Kommentar-Block', () => {
      // Der Header-Kommentar MUSS einen Rollback-Block enthalten.
      expect(migrationSQL).toMatch(/Rollback:/);
      expect(migrationSQL).toMatch(/DISABLE ROW LEVEL SECURITY/);
      expect(migrationSQL).toMatch(/DROP POLICY workspace_isolation_sprint_1_5/);
    });
  });

  // ─── GUC-Namenskonsistenz ────────────────────────────────────────────────────

  describe('GUC-Namenskonsistenz mit database-context.ts', () => {
    it('nutzt exakt die GUCs, die queryContext() setzt', () => {
      // database-context.ts setzt: app.current_user_id, app.current_workspace_id,
      // app.current_context_slug, app.is_admin.
      // Die Migration darf nur diese 4 verwenden.
      const gucMatches = Array.from(
        migrationSQL.matchAll(/current_setting\(''([^']+)''/g)
      );
      const gucNames = [...new Set(gucMatches.map(m => m[1]))];
      const allowedGUCs = [
        'app.current_user_id',
        'app.current_workspace_id',
        'app.current_context_slug',
        'app.is_admin',
      ];
      for (const guc of gucNames) {
        expect(allowedGUCs).toContain(guc);
      }
    });
  });
});
