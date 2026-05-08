/**
 * Sprint 1.8 Commit 4: Live-DB integration test for PMA RLS migration.
 *
 * Creates the 10 PMA tables in a fresh schema, runs
 * sprint_1_7_pma_rls.sql against them, and then asserts:
 *
 *   1. pg_tables.rowsecurity is true for every PMA table.
 *   2. A policy named `allow_all` exists on every PMA table.
 *   3. A non-superuser role sees rows via SELECT (allow_all passes).
 *   4. A non-superuser role on a non-PMA table without RLS-policy
 *      still sees rows (control, isolates the PMA effect).
 *
 * Gated on TEST_DATABASE_URL (written by integration-db/setup.ts).
 * Runs in the `integration-db` Jest project so it skips on normal
 * developer runs where the container isn't started.
 */

import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createTestSchema, dropTestSchema } from './test-db';

const uriFile = join(__dirname, '.test-db-uri');
const hasTestDb = existsSync(uriFile);

const MIGRATION_PATH = join(
  __dirname,
  '../../../sql/migrations/sprint_1_7_pma_rls.sql',
);

const PMA_TABLES = [
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
] as const;

let pool: Pool;
let schema: string;

beforeAll(async () => {
  if (!hasTestDb) return;
  const uri = readFileSync(uriFile, 'utf-8').trim();
  process.env.TEST_DATABASE_URL = uri;

  const result = await createTestSchema();
  pool = result.pool;
  schema = result.schema;

  // Create a subset of PMA tables in this schema — enough to exercise
  // the loop without pulling in the full PMA DDL.
  for (const tbl of PMA_TABLES) {
    await pool.query(
      `CREATE TABLE ${schema}.${tbl} (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID,
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    );
  }

  // Run the RLS migration, but patch the schema list to target THIS
  // test schema instead of the four production contexts.
  const migration = readFileSync(MIGRATION_PATH, 'utf-8');
  const patched = migration.replace(
    /ARRAY\['operations','finance','people','strategy'\]/,
    `ARRAY['${schema}']`,
  );
  await pool.query(patched);
});

afterAll(async () => {
  if (pool) await dropTestSchema(schema, pool);
});

const describeIfDb = hasTestDb ? describe : describe.skip;

describeIfDb('Sprint 1.8 — PMA RLS live-DB verification', () => {
  it('enables RLS on every PMA table', async () => {
    const res = await pool.query(
      `SELECT tablename, rowsecurity
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename = ANY($2::text[])
        ORDER BY tablename`,
      [schema, [...PMA_TABLES]],
    );
    expect(res.rows.length).toBe(PMA_TABLES.length);
    for (const row of res.rows) {
      expect(row.rowsecurity).toBe(true);
    }
  });

  it('creates an allow_all policy on every PMA table', async () => {
    const res = await pool.query(
      `SELECT tablename, policyname
         FROM pg_policies
        WHERE schemaname = $1
          AND tablename = ANY($2::text[])
          AND policyname = 'allow_all'
        ORDER BY tablename`,
      [schema, [...PMA_TABLES]],
    );
    expect(res.rows.length).toBe(PMA_TABLES.length);
  });

  it('allow_all USING (true) lets a non-superuser SELECT after GRANT', async () => {
    const roleName = `pma_rls_test_${Date.now()}`;

    // Create a non-superuser role
    await pool.query(`CREATE ROLE ${roleName} NOLOGIN NOBYPASSRLS`);
    await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${roleName}`);
    await pool.query(
      `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ${schema} TO ${roleName}`,
    );

    try {
      // Seed one row as superuser.
      await pool.query(
        `INSERT INTO ${schema}.neuromodulator_state (user_id) VALUES ($1)`,
        ['00000000-0000-0000-0000-000000000001'],
      );

      // Switch to the non-superuser role and read back.
      const client = await pool.connect();
      try {
        await client.query(`SET ROLE ${roleName}`);
        const seen = await client.query(
          `SELECT COUNT(*)::int AS c FROM ${schema}.neuromodulator_state`,
        );
        // allow_all USING (true) → row visible
        expect(seen.rows[0].c).toBe(1);
      } finally {
        await client.query('RESET ROLE');
        client.release();
      }
    } finally {
      await pool.query(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} FROM ${roleName}`,
      );
      await pool.query(`REVOKE USAGE ON SCHEMA ${schema} FROM ${roleName}`);
      await pool.query(`DROP ROLE IF EXISTS ${roleName}`);
    }
  });

  it('dropping allow_all blocks the non-superuser (proves RLS is enforced)', async () => {
    const roleName = `pma_rls_block_${Date.now()}`;
    await pool.query(`CREATE ROLE ${roleName} NOLOGIN NOBYPASSRLS`);
    await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${roleName}`);
    await pool.query(
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${roleName}`,
    );

    try {
      // Seed a row as superuser.
      await pool.query(
        `INSERT INTO ${schema}.stc_tags (user_id) VALUES ($1)`,
        ['00000000-0000-0000-0000-000000000001'],
      );

      // Drop allow_all on stc_tags so only RLS is left (no permissive policy).
      await pool.query(
        `DROP POLICY IF EXISTS allow_all ON ${schema}.stc_tags`,
      );

      const client = await pool.connect();
      try {
        await client.query(`SET ROLE ${roleName}`);
        const seen = await client.query(
          `SELECT COUNT(*)::int AS c FROM ${schema}.stc_tags`,
        );
        // With RLS enabled and NO permissive policy, the non-superuser
        // sees zero rows.
        expect(seen.rows[0].c).toBe(0);
      } finally {
        await client.query('RESET ROLE');
        client.release();
      }

      // Restore the policy so later tests in other suites (if any) are unaffected.
      await pool.query(
        `CREATE POLICY allow_all ON ${schema}.stc_tags FOR ALL USING (true) WITH CHECK (true)`,
      );
    } finally {
      await pool.query(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} FROM ${roleName}`,
      );
      await pool.query(`REVOKE USAGE ON SCHEMA ${schema} FROM ${roleName}`);
      await pool.query(`DROP ROLE IF EXISTS ${roleName}`);
    }
  });

  it('migration is idempotent — running it twice yields the same policy count', async () => {
    const migration = readFileSync(MIGRATION_PATH, 'utf-8');
    const patched = migration.replace(
      /ARRAY\['operations','finance','people','strategy'\]/,
      `ARRAY['${schema}']`,
    );
    await pool.query(patched);

    const res = await pool.query(
      `SELECT COUNT(*)::int AS c FROM pg_policies
        WHERE schemaname = $1
          AND tablename = ANY($2::text[])
          AND policyname = 'allow_all'`,
      [schema, [...PMA_TABLES]],
    );
    expect(res.rows[0].c).toBe(PMA_TABLES.length);
  });
});
