// backend/src/__tests__/integration-db/teardown.ts
import { stopTestDatabase } from './test-db';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export default async function globalTeardown(): Promise<void> {
  console.log('\n🛑 Stopping PostgreSQL test container...');
  await stopTestDatabase();

  // Clean up temp file
  const uriFile = join(__dirname, '.test-db-uri');
  if (existsSync(uriFile)) {
    unlinkSync(uriFile);
  }

  console.log('✅ Test container stopped');
}
