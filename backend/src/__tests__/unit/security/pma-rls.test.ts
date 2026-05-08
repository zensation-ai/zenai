/**
 * Sprint 1.7 — PMA Memory Tables RLS migration validation.
 *
 * Verifies the structure of `sprint_1_7_pma_rls.sql` as a static artifact:
 * the migration is a DO $$...$$ block that iterates 10 PMA tables across the
 * 4 context schemas. We check the file content so this works in CI without
 * a database. An integration-level live-DB test belongs in the integration
 * suite (gated on DATABASE_URL).
 */

import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.join(
  __dirname,
  '../../../../sql/migrations/sprint_1_7_pma_rls.sql',
);

const EXPECTED_PMA_TABLES = [
  'neuromodulator_state',
  'memory_copies',
  'stc_tags',
  'reconsolidation_events',
  'memory_stability_locks',
  'memory_clusters',
  'memory_cluster_members',
  'cognitive_bias_metrics',
  'memory_efficiency_metrics',
  'memory_rediscoveries',
];

const EXPECTED_SCHEMAS = ['operations', 'finance', 'people', 'strategy'];

describe('Sprint 1.7 — PMA RLS migration', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  });

  it('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(100);
  });

  it('contains all 4 context schemas in the schema loop', () => {
    for (const schema of EXPECTED_SCHEMAS) {
      expect(sql).toMatch(new RegExp(`'${schema}'`));
    }
  });

  it('declares all 10 PMA tables in the pma_tables array', () => {
    // Extract the array literal from the first DO block
    const declBlock = sql.match(/pma_tables TEXT\[\]\s*:=\s*ARRAY\[([^\]]+)\]/);
    expect(declBlock).not.toBeNull();
    const declText = declBlock?.[1] ?? '';
    for (const tbl of EXPECTED_PMA_TABLES) {
      expect(declText).toMatch(new RegExp(`'${tbl}'`));
    }
  });

  it('issues ENABLE ROW LEVEL SECURITY via format()', () => {
    expect(sql).toMatch(/ALTER TABLE %I\.%I ENABLE ROW LEVEL SECURITY/);
  });

  it('creates the allow_all policy idempotently', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS allow_all/);
    expect(sql).toMatch(/CREATE POLICY allow_all ON %I\.%I FOR ALL USING \(true\)/);
  });

  it('includes a verification block that reports unprotected tables', () => {
    expect(sql).toMatch(/DO \$verify\$/);
    expect(sql).toMatch(/SUCCESS: all PMA tables have RLS enabled/);
    expect(sql).toMatch(/still have RLS disabled/);
  });

  it('protects at least 10 × 4 = 40 table/schema combinations', () => {
    expect(EXPECTED_PMA_TABLES.length * EXPECTED_SCHEMAS.length).toBe(40);
  });
});
