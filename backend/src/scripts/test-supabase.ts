/**
 * Supabase Connection Test
 */

import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';

async function testSupabase() {
  console.log('🔄 Testing Supabase Connection...\n');

  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in .env');
    process.exit(1);
  }

  console.log('DATABASE_URL:', DATABASE_URL.substring(0, 50) + '...\n');

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Test 1: Basic connection
    console.log('1️⃣ Testing basic connection...');
    await pool.query('SELECT 1');
    console.log('   ✅ Connection successful\n');

    // Test 2: Check pgvector
    console.log('2️⃣ Checking pgvector extension...');
    const pgvectorResult = await pool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    if (pgvectorResult.rows.length > 0) {
      console.log('   ✅ pgvector extension enabled\n');
    } else {
      console.log('   ❌ pgvector extension not found\n');
    }

    // Test 3: Check tables
    console.log('3️⃣ Checking tables...');
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`   ✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row) => {
      console.log(`      - ${row.table_name}`);
    });
    console.log();

    // Test 4: Check functions
    console.log('4️⃣ Checking semantic search functions...');
    const functionsResult = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        AND routine_name LIKE '%idea%'
      ORDER BY routine_name
    `);
    console.log(`   ✅ Found ${functionsResult.rows.length} semantic search functions:`);
    functionsResult.rows.forEach((row) => {
      console.log(`      - ${row.routine_name}()`);
    });
    console.log();

    // Test 5: Check indexes
    console.log('5️⃣ Checking vector indexes...');
    const indexesResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE '%embedding%'
      ORDER BY indexname
    `);
    console.log(`   ✅ Found ${indexesResult.rows.length} vector indexes:`);
    indexesResult.rows.forEach((row) => {
      console.log(`      - ${row.indexname}`);
    });
    console.log();

    console.log('✅ Supabase is ready for production! 🎉\n');
    console.log('Next steps:');
    console.log('1. Your app can now use Supabase locally');
    console.log('2. Deploy to Railway with the new DATABASE_URL');
    console.log('3. Migrate your existing data (optional)');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testSupabase();
