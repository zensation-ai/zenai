import { pool } from './src/utils/database';

async function migrateApiKeys() {
  try {
    console.log('🔧 Migrating api_keys table...\n');
    
    // Add rate_limit column if it doesn't exist
    await pool.query(`
      ALTER TABLE api_keys 
      ADD COLUMN IF NOT EXISTS rate_limit INTEGER DEFAULT 1000;
    `);
    console.log('✅ Added rate_limit column\n');
    
    // Verify
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'api_keys' AND column_name = 'rate_limit';
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Migration successful! rate_limit column exists.');
    } else {
      console.log('❌ Migration failed!');
    }
    
    await pool.end();
  } catch (error: any) {
    console.error('❌ Migration error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

migrateApiKeys();
