/**
 * Sprint 1.3 — RLS Policy-Struktur-Tests
 *
 * Statische Analyse der RLS-Migration (sprint_1_3_rls_hardening.sql). Verifiziert,
 * dass alle in Master-Plan Sektion 7 geforderten Tabellen abgedeckt sind und die
 * Policy-Konventionen (Admin-Override, append-only audit log) eingehalten werden.
 *
 * Warum statisch statt DB-integration?
 *   - RLS lässt sich nur gegen echtes Postgres mit aktiven Policies testen.
 *   - Die Integration-DB-Suite läuft separat (npm run test:integration-db).
 *   - Diese Tests laufen im Haupt-Testlauf und fangen strukturelle Regressions.
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../sql/migrations/sprint_1_3_rls_hardening.sql'
);

// Die 11 kritischen public.* Tabellen aus Sprint 1.3 Scope
const REQUIRED_TABLES = [
  'users',
  'organizations',
  'organization_members',
  'workspaces',
  'workspace_members',
  'api_keys',
  'tenant_audit_log',
  'data_exports',
  'user_consent',
  'moderation_decisions',
  'moderation_appeals',
];

describe('Sprint 1.3 — RLS Migration Struktur', () => {
  let migrationSQL: string;

  beforeAll(() => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
  });

  // ===========================================
  // Datei-Integrität
  // ===========================================

  describe('Datei-Integrität', () => {
    it('ist in BEGIN/COMMIT gewrappt (atomar)', () => {
      expect(migrationSQL).toMatch(/^\s*(?:--[^\n]*\n)*\s*BEGIN;/m);
      expect(migrationSQL).toMatch(/\nCOMMIT;\s*$/m);
    });

    it('enthält keinen SET ROLE oder ähnliche Super-User-Escalations', () => {
      expect(migrationSQL).not.toMatch(/SET\s+ROLE/i);
      expect(migrationSQL).not.toMatch(/SET\s+SESSION\s+AUTHORIZATION/i);
    });

    it('nutzt keine hardcodierten UUIDs in Policies', () => {
      // UUIDs in Policy-Klauseln wären ein Anti-Pattern (würden Test-Daten freigeben)
      const policyBlocks = migrationSQL.match(/CREATE POLICY[\s\S]*?;/g) || [];
      for (const block of policyBlocks) {
        expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      }
    });
  });

  // ===========================================
  // Helper-Funktionen
  // ===========================================

  describe('GUC-Helper-Funktionen', () => {
    it('definiert current_user_id_uuid() als STABLE mit NULLIF-Cast', () => {
      expect(migrationSQL).toMatch(/CREATE OR REPLACE FUNCTION public\.current_user_id_uuid\(\)/);
      expect(migrationSQL).toMatch(/NULLIF\(current_setting\('app\.current_user_id', true\), ''\)::uuid/);
      expect(migrationSQL).toMatch(/current_user_id_uuid[\s\S]*?STABLE/);
    });

    it('definiert current_is_admin() mit COALESCE-Fallback', () => {
      expect(migrationSQL).toMatch(/CREATE OR REPLACE FUNCTION public\.current_is_admin\(\)/);
      expect(migrationSQL).toMatch(/COALESCE\(current_setting\('app\.is_admin', true\), 'false'\) = 'true'/);
    });

    it('nutzt current_setting(name, true) — nie strict current_setting()', () => {
      // current_setting() ohne zweiten Parameter wirft Exception bei fehlendem GUC.
      // Wir müssen immer den nullable-Modus nutzen.
      const strictCalls = migrationSQL.match(/current_setting\('[^']+'\)(?!\s*,)/g) || [];
      expect(strictCalls).toEqual([]);
    });
  });

  // ===========================================
  // RLS-Enablement + Policy-Abdeckung
  // ===========================================

  describe('RLS-Enablement für alle 11 Tabellen', () => {
    for (const table of REQUIRED_TABLES) {
      it(`aktiviert RLS auf public.${table}`, () => {
        const enablePattern = new RegExp(
          `ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`,
          'i'
        );
        expect(migrationSQL).toMatch(enablePattern);
      });
    }
  });

  describe('Jede Tabelle hat mindestens eine SELECT- und eine Write-Policy', () => {
    for (const table of REQUIRED_TABLES) {
      it(`${table} hat SELECT-Policy`, () => {
        const regex = new RegExp(`CREATE POLICY \\w+ ON public\\.${table}[\\s\\S]*?FOR SELECT`, 'i');
        expect(migrationSQL).toMatch(regex);
      });

      // tenant_audit_log ist append-only → hat INSERT-Policy + keine UPDATE/DELETE-Policy
      if (table === 'tenant_audit_log') {
        it(`${table} hat NUR INSERT-Policy (append-only)`, () => {
          // Extract only the policy blocks belonging to tenant_audit_log
          const policyBlocks = Array.from(
            migrationSQL.matchAll(
              /CREATE POLICY\s+(\w+)\s+ON\s+public\.tenant_audit_log\s+FOR\s+(\w+)/gi
            )
          ).map(m => ({ name: m[1], op: m[2].toUpperCase() }));

          expect(policyBlocks.length).toBeGreaterThan(0);
          const ops = policyBlocks.map(p => p.op);
          expect(ops).toContain('INSERT');
          // Append-only: no UPDATE, no DELETE, no FOR ALL (since ALL includes those)
          expect(ops).not.toContain('UPDATE');
          expect(ops).not.toContain('DELETE');
          expect(ops).not.toContain('ALL');
        });
      } else {
        it(`${table} hat Write-Policy (FOR ALL / FOR INSERT / FOR UPDATE)`, () => {
          const writeRegex = new RegExp(
            `CREATE POLICY \\w+ ON public\\.${table}[\\s\\S]*?FOR (ALL|INSERT|UPDATE|DELETE)`,
            'i'
          );
          expect(migrationSQL).toMatch(writeRegex);
        });
      }
    }
  });

  // ===========================================
  // Admin-Override-Konvention
  // ===========================================

  describe('Admin-Override-Konvention', () => {
    it('jede Policy enthält current_is_admin() als Fallback', () => {
      // Extract CREATE POLICY blocks (up to next DROP POLICY or end of block)
      const policyRegex = /CREATE POLICY\s+\w+\s+ON\s+public\.(\w+)[\s\S]*?(?=DROP POLICY|CREATE POLICY|-- ─|COMMIT;)/g;
      let match;
      const policiesWithoutAdmin: Array<{ table: string; policy: string }> = [];

      while ((match = policyRegex.exec(migrationSQL)) !== null) {
        const block = match[0];
        const table = match[1];
        const policyNameMatch = block.match(/CREATE POLICY\s+(\w+)/);
        const policyName = policyNameMatch?.[1] || 'unknown';

        // append-only policy on tenant_audit_log uses WITH CHECK (true) — no admin check needed
        if (policyName === 'tenant_audit_log_append_only') continue;

        if (!block.includes('current_is_admin()')) {
          policiesWithoutAdmin.push({ table, policy: policyName });
        }
      }

      expect(policiesWithoutAdmin).toEqual([]);
    });
  });

  // ===========================================
  // Service-Access-Patterns
  // ===========================================

  describe('Service-Access für Systemtabellen', () => {
    it('api_keys-Policy erlaubt auth-middleware validation ohne user_id', () => {
      // Die auth-middleware validiert den Key BEVOR der user_id bekannt ist,
      // also muss current_user_id_uuid() IS NULL als Fallback enthalten sein.
      const apiKeysSelectBlock = migrationSQL.match(
        /CREATE POLICY api_keys_owner_select[\s\S]*?;/
      );
      expect(apiKeysSelectBlock).toBeTruthy();
      expect(apiKeysSelectBlock?.[0]).toContain('current_user_id_uuid() IS NULL');
    });

    it('data_exports-Policy erlaubt BullMQ-Worker-Status-Updates ohne user_id', () => {
      const dataExportsBlock = migrationSQL.match(
        /CREATE POLICY data_exports_owner_write[\s\S]*?;/
      );
      expect(dataExportsBlock).toBeTruthy();
      expect(dataExportsBlock?.[0]).toContain('current_user_id_uuid() IS NULL');
    });

    it('droppt alte permissive api_keys_system_access Policy', () => {
      expect(migrationSQL).toMatch(/DROP POLICY IF EXISTS api_keys_system_access ON public\.api_keys/);
    });
  });

  // ===========================================
  // Idempotenz
  // ===========================================

  describe('Idempotenz', () => {
    it('jede CREATE POLICY ist von DROP POLICY IF EXISTS vorangestellt', () => {
      // Extract all CREATE POLICY names
      const createMatches = Array.from(
        migrationSQL.matchAll(/CREATE POLICY\s+(\w+)\s+ON\s+public\.\w+/g)
      );
      const policyNames = createMatches.map(m => m[1]);

      for (const name of policyNames) {
        const dropPattern = new RegExp(`DROP POLICY IF EXISTS ${name} ON public\\.\\w+`);
        expect(migrationSQL).toMatch(dropPattern);
      }
    });

    it('ALTER TABLE ENABLE RLS nutzt kein FORCE (würde doppelte Ausführung ändern)', () => {
      expect(migrationSQL).not.toMatch(/ENABLE ROW LEVEL SECURITY[\s\S]*?FORCE/);
    });
  });
});
