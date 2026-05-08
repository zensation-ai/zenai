/**
 * Demo Data Seeding Script — CLI wrapper
 * Delegates to backend/src/services/demo/demo-seed.ts (idempotent: clears then inserts).
 *
 * Usage: npm run seed:demo
 *   Options:
 *     --clear   Only clear demo data, don't reseed
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  // Must import after dotenv is loaded (db pool reads DATABASE_URL on init)
  const { seedDemoData, clearDemoData } = await import('../src/services/demo/demo-seed');

  const clearOnly = process.argv.includes('--clear');

  if (clearOnly) {
    console.log('🗑️  Clearing demo data...');
    await clearDemoData();
    console.log('✅ Demo data cleared');
  } else {
    console.log('🌱 Seeding demo data...');
    await seedDemoData();
    console.log('✅ Demo data seeded successfully');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
