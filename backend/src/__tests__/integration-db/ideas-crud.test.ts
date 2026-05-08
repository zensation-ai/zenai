/**
 * Ideas CRUD Integration Test (Real DB)
 *
 * Tests the full create/read/update/delete lifecycle for ideas
 * against a real PostgreSQL instance via testcontainers.
 * Each test suite gets an isolated schema that is dropped on teardown.
 */

import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createTestSchema, dropTestSchema } from './test-db';

const uriFile = join(__dirname, '.test-db-uri');
const hasTestDb = existsSync(uriFile);

let pool: Pool;
let schema: string;
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  if (!hasTestDb) return;
  const uri = readFileSync(uriFile, 'utf-8').trim();
  process.env.TEST_DATABASE_URL = uri;

  const result = await createTestSchema();
  pool = result.pool;
  schema = result.schema;
});

afterAll(async () => {
  if (pool) await dropTestSchema(schema, pool);
});

const describeIfDb = hasTestDb ? describe : describe.skip;

describeIfDb('Ideas CRUD (Real DB)', () => {
  let createdIdeaId: string;

  it('should create an idea', async () => {
    const result = await pool.query(
      `INSERT INTO ${schema}.ideas (user_id, title, content, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [TEST_USER_ID, 'Test Idea', 'Test content', 'active']
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Test Idea');
    expect(result.rows[0].user_id).toBe(TEST_USER_ID);
    expect(result.rows[0].is_archived).toBe(false);
    createdIdeaId = result.rows[0].id;
  });

  it('should read an idea by id', async () => {
    const result = await pool.query(
      `SELECT * FROM ${schema}.ideas WHERE id = $1`,
      [createdIdeaId]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Test Idea');
  });

  it('should update an idea', async () => {
    await pool.query(
      `UPDATE ${schema}.ideas SET title = $1, updated_at = NOW() WHERE id = $2`,
      ['Updated Idea', createdIdeaId]
    );

    const result = await pool.query(
      `SELECT * FROM ${schema}.ideas WHERE id = $1`,
      [createdIdeaId]
    );

    expect(result.rows[0].title).toBe('Updated Idea');
  });

  it('should archive an idea', async () => {
    await pool.query(
      `UPDATE ${schema}.ideas SET is_archived = true WHERE id = $1`,
      [createdIdeaId]
    );

    const result = await pool.query(
      `SELECT * FROM ${schema}.ideas WHERE id = $1 AND is_archived = true`,
      [createdIdeaId]
    );

    expect(result.rows).toHaveLength(1);
  });

  it('should delete an idea', async () => {
    await pool.query(
      `DELETE FROM ${schema}.ideas WHERE id = $1`,
      [createdIdeaId]
    );

    const result = await pool.query(
      `SELECT * FROM ${schema}.ideas WHERE id = $1`,
      [createdIdeaId]
    );

    expect(result.rows).toHaveLength(0);
  });

  it('should enforce user isolation', async () => {
    const otherUserId = '00000000-0000-0000-0000-000000000002';

    await pool.query(
      `INSERT INTO ${schema}.ideas (user_id, title) VALUES ($1, $2)`,
      [TEST_USER_ID, 'My Idea']
    );
    await pool.query(
      `INSERT INTO ${schema}.ideas (user_id, title) VALUES ($1, $2)`,
      [otherUserId, 'Other Idea']
    );

    const myIdeas = await pool.query(
      `SELECT * FROM ${schema}.ideas WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    const otherIdeas = await pool.query(
      `SELECT * FROM ${schema}.ideas WHERE user_id = $1`,
      [otherUserId]
    );

    expect(myIdeas.rows.every(r => r.user_id === TEST_USER_ID)).toBe(true);
    expect(otherIdeas.rows.every(r => r.user_id === otherUserId)).toBe(true);
  });
});
