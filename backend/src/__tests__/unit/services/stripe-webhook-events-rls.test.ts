/**
 * Cross-Sprint-Review 2026-04-20 — stripe_webhook_events RLS Coverage
 *
 * Sprint 1.6 legte public.stripe_webhook_events ohne RLS an, weil die Tabelle
 * erst NACH Sprint 1.3's RLS-Hardening-Welle entstanden ist. Diese Migration
 * (sprint_1_6_stripe_webhook_events_rls.sql) schließt die Lücke: admin-only
 * SELECT + admin/background INSERT/UPDATE.
 *
 * Statische Analyse-Tests — kein Live-DB-Zugriff (Integration-Variante läuft
 * separat über test:integration-db).
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../sql/migrations/sprint_1_6_stripe_webhook_events_rls.sql'
);

describe('Cross-Sprint-Review — stripe_webhook_events RLS Migration', () => {
  let sql: string;

  beforeAll(() => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  });

  it('ist in BEGIN/COMMIT gewrappt (atomar)', () => {
    expect(sql).toMatch(/^\s*(?:--[^\n]*\n)*\s*BEGIN;/m);
    expect(sql).toMatch(/\nCOMMIT;\s*$/m);
  });

  it('aktiviert RLS auf public.stripe_webhook_events', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.stripe_webhook_events\s+ENABLE ROW LEVEL SECURITY/i
    );
  });

  it('hat SELECT-Policy (admin + background)', () => {
    const block = sql.match(
      /CREATE POLICY stripe_webhook_events_admin_select[\s\S]*?;/
    );
    expect(block).toBeTruthy();
    expect(block![0]).toContain('FOR SELECT');
    expect(block![0]).toContain('current_is_admin()');
    expect(block![0]).toContain('current_user_id_uuid() IS NULL');
  });

  it('hat Write-Policy mit WITH CHECK für Webhook-Handler', () => {
    const block = sql.match(
      /CREATE POLICY stripe_webhook_events_admin_write[\s\S]*?;/
    );
    expect(block).toBeTruthy();
    expect(block![0]).toContain('FOR ALL');
    expect(block![0]).toContain('WITH CHECK');
    expect(block![0]).toContain('current_is_admin()');
    expect(block![0]).toContain('current_user_id_uuid() IS NULL');
  });

  it('ist idempotent (DROP POLICY IF EXISTS vor CREATE)', () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS stripe_webhook_events_admin_select ON public\.stripe_webhook_events/
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS stripe_webhook_events_admin_write ON public\.stripe_webhook_events/
    );
  });

  it('nutzt keine hardcodierten UUIDs oder Super-User-Escalations', () => {
    expect(sql).not.toMatch(/SET\s+ROLE/i);
    expect(sql).not.toMatch(/SET\s+SESSION\s+AUTHORIZATION/i);
    expect(sql).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });
});
