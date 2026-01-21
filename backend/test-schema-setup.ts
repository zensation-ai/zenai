/**
 * Test Script: Schema-Based Dual-Database
 *
 * Testet die neue Schema-Architektur:
 * - Verbindung zu beiden Schemas (personal, work)
 * - CRUD-Operationen
 * - Search_path Funktionalität
 */

import { queryContext, testConnections, getPoolStats, closeAllPools } from './src/utils/database-context';
import dotenv from 'dotenv';

dotenv.config();

async function runTests() {
  console.log('🧪 Testing Schema-Based Dual-Database Setup\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Verbindungen prüfen
    console.log('\n📡 Test 1: Testing Database Connections...');
    const connections = await testConnections();
    console.log('✅ Personal schema:', connections.personal ? '✓ Connected' : '✗ Failed');
    console.log('✅ Work schema:', connections.work ? '✓ Connected' : '✗ Failed');

    if (!connections.personal || !connections.work) {
      throw new Error('Schema connections failed. Make sure you ran setup-dual-schema.sql in Supabase!');
    }

    // Test 2: Schemas auflisten
    console.log('\n📋 Test 2: Listing Schemas...');
    const schemasResult = await queryContext('personal', `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name IN ('personal', 'work')
      ORDER BY schema_name
    `);
    console.log('Schemas found:', schemasResult.rows.map(r => r.schema_name).join(', '));

    // Test 3: Tabellen prüfen
    console.log('\n📊 Test 3: Checking Tables in Schemas...');
    for (const context of ['personal', 'work'] as const) {
      const tablesResult = await queryContext(context, `
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = $1
        ORDER BY tablename
      `, [context]);
      console.log(`${context} schema tables:`, tablesResult.rows.map(r => r.tablename).join(', '));
    }

    // Test 4: Insert Test (Personal)
    console.log('\n✏️  Test 4: Insert Test Idea (Personal)...');
    const insertPersonalResult = await queryContext('personal', `
      INSERT INTO ideas (content, category, tags)
      VALUES ($1, $2, $3)
      RETURNING id, content, category
    `, ['Test idea from personal context', 'test', ['schema-test', 'personal']]);
    console.log('✅ Personal idea created:', insertPersonalResult.rows[0]);

    // Test 5: Insert Test (Work)
    console.log('\n✏️  Test 5: Insert Test Idea (Work)...');
    const insertWorkResult = await queryContext('work', `
      INSERT INTO ideas (content, category, tags)
      VALUES ($1, $2, $3)
      RETURNING id, content, category
    `, ['Test idea from work context', 'test', ['schema-test', 'work']]);
    console.log('✅ Work idea created:', insertWorkResult.rows[0]);

    // Test 6: Select Test
    console.log('\n🔍 Test 6: Verify Data Separation...');
    const personalIdeas = await queryContext('personal', 'SELECT COUNT(*) as count FROM ideas');
    const workIdeas = await queryContext('work', 'SELECT COUNT(*) as count FROM ideas');
    console.log('Personal ideas count:', personalIdeas.rows[0].count);
    console.log('Work ideas count:', workIdeas.rows[0].count);

    // Test 7: Pool Stats
    console.log('\n📊 Test 7: Connection Pool Statistics...');
    const stats = getPoolStats();
    console.log('Personal stats:', {
      queries: stats.personal.queries,
      errors: stats.personal.errors,
      poolSize: stats.personal.poolSize,
    });
    console.log('Work stats:', {
      queries: stats.work.queries,
      errors: stats.work.errors,
      poolSize: stats.work.poolSize,
    });

    // Test 8: Cleanup
    console.log('\n🧹 Test 8: Cleanup Test Data...');
    await queryContext('personal', `DELETE FROM ideas WHERE 'schema-test' = ANY(tags)`);
    await queryContext('work', `DELETE FROM ideas WHERE 'schema-test' = ANY(tags)`);
    console.log('✅ Test data cleaned up');

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed! Schema-based setup is working correctly.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeAllPools();
  }
}

// Run tests
runTests().catch(console.error);
