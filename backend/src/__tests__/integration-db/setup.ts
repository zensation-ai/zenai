// backend/src/__tests__/integration-db/setup.ts
import { startTestDatabase } from './test-db';
import { writeFileSync } from 'fs';
import { join } from 'path';

export default async function globalSetup(): Promise<void> {
  console.log('\n🐘 Starting PostgreSQL test container...');
  const uri = await startTestDatabase();
  console.log(`✅ Test database ready: ${uri.replace(/:[^:@]+@/, ':***@')}`);

  // Store URI for worker processes (Jest runs setup in main process)
  process.env.TEST_DATABASE_URL = uri;

  // Write to a temp file so worker processes can read it
  writeFileSync(
    join(__dirname, '.test-db-uri'),
    uri,
    'utf-8',
  );
}
