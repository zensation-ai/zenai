// backend/src/__tests__/integration-db/test-db.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { randomBytes } from 'crypto';

let container: StartedPostgreSqlContainer | null = null;
let pool: Pool | null = null;

/**
 * Start a PostgreSQL container (shared across all integration-db tests).
 * Called once in globalSetup.
 */
export async function startTestDatabase(): Promise<string> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('zenai_test')
    .withUsername('test')
    .withPassword('test')
    .withExposedPorts(5432)
    .start();

  const connectionUri = container.getConnectionUri();
  process.env.TEST_DATABASE_URL = connectionUri;

  // Run base schema migration
  pool = new Pool({ connectionString: connectionUri });
  await runMigrations(pool);

  return connectionUri;
}

/**
 * Create an isolated schema for a test suite.
 * Returns the schema name and a configured pool.
 */
export async function createTestSchema(): Promise<{ schema: string; pool: Pool }> {
  const schema = `test_${randomBytes(4).toString('hex')}`;
  const connectionUri = process.env.TEST_DATABASE_URL;
  if (!connectionUri) throw new Error('TEST_DATABASE_URL not set — run startTestDatabase first');

  const testPool = new Pool({ connectionString: connectionUri });

  // Create schema with all tables
  await testPool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await testPool.query(`SET search_path TO ${schema}, public`);

  // Create core tables in this schema
  await createCoreTables(testPool, schema);

  return { schema, pool: testPool };
}

/**
 * Drop a test schema after tests complete.
 */
export async function dropTestSchema(schemaName: string, testPool: Pool): Promise<void> {
  try {
    await testPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await testPool.end();
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Stop the PostgreSQL container. Called once in globalTeardown.
 */
export async function stopTestDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (container) {
    await container.stop();
    container = null;
  }
}

async function runMigrations(p: Pool): Promise<void> {
  // Install pgvector extension if available (optional for tests)
  try {
    await p.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch {
    // pgvector not available in test container — skip
  }

  // Enable uuid-ossp
  await p.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
}

async function createCoreTables(p: Pool, schema: string): Promise<void> {
  // Minimal table set for integration tests
  const tables = `
    CREATE TABLE IF NOT EXISTS ${schema}.ideas (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL,
      title VARCHAR(500) NOT NULL,
      content TEXT DEFAULT '',
      status VARCHAR(50) DEFAULT 'active',
      priority VARCHAR(20) DEFAULT 'medium',
      is_archived BOOLEAN DEFAULT false,
      viewed_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT DEFAULT '',
      status VARCHAR(50) DEFAULT 'pending',
      priority VARCHAR(20) DEFAULT 'medium',
      project_id UUID,
      due_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.chat_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL,
      title VARCHAR(500),
      context VARCHAR(20) DEFAULT 'operations',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.chat_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      session_id UUID REFERENCES ${schema}.chat_sessions(id),
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.user_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL,
      display_name VARCHAR(200),
      preferences JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await p.query(tables);
}
