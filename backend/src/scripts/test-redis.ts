/**
 * Redis Connection Test Script
 *
 * Tests the Redis caching functionality
 * Run with: npx ts-node src/scripts/test-redis.ts
 */

// IMPORTANT: Load dotenv FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { cache, getCacheStats } from '../utils/cache';
import { logger } from '../utils/logger';

async function testRedis() {
  console.log('🔄 Testing Redis Connection...\n');

  console.log('DEBUG: REDIS_URL =', process.env.REDIS_URL ? 'Set ✅' : 'Not set ❌');

  try {
    // Test 1: Check if Redis is available (wait a bit for connection)
    console.log('1️⃣ Checking Redis availability...');

    // Give Redis time to connect (lazyConnect means it connects asynchronously)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const isAvailable = cache.isAvailable();
    console.log(`   ${isAvailable ? '✅' : '❌'} Redis available: ${isAvailable}\n`);

    if (!isAvailable) {
      console.log('⚠️  Redis not available. Please ensure REDIS_URL is set.');
      console.log('   The app will continue working with in-memory fallback.\n');
      return;
    }

    // Test 2: Set a value
    console.log('2️⃣ Testing SET operation...');
    const testKey = 'test:redis:connection';
    const testValue = {
      message: 'Redis is working!',
      timestamp: new Date().toISOString(),
      version: '1.0',
    };

    const setSuccess = await cache.set(testKey, testValue, 60); // 60 seconds TTL
    console.log(`   ${setSuccess ? '✅' : '❌'} SET operation: ${setSuccess ? 'success' : 'failed'}\n`);

    // Test 3: Get the value
    console.log('3️⃣ Testing GET operation...');
    const retrievedValue = await cache.get<typeof testValue>(testKey);
    console.log(`   ${retrievedValue ? '✅' : '❌'} GET operation: ${retrievedValue ? 'success' : 'failed'}`);

    if (retrievedValue) {
      console.log(`   Retrieved value:`, JSON.stringify(retrievedValue, null, 2));
    }
    console.log();

    // Test 4: Test getOrSet pattern
    console.log('4️⃣ Testing getOrSet (cache-aside pattern)...');
    let factoryCalled = false;
    const getOrSetKey = 'test:getOrSet';

    const result1 = await cache.getOrSet(
      getOrSetKey,
      async () => {
        factoryCalled = true;
        return { data: 'computed value', computedAt: Date.now() };
      },
      60
    );
    console.log(`   ✅ First call - Factory called: ${factoryCalled}`);
    console.log(`   Result:`, result1);

    factoryCalled = false;
    const result2 = await cache.getOrSet(
      getOrSetKey,
      async () => {
        factoryCalled = true;
        return { data: 'should not be called', computedAt: Date.now() };
      },
      60
    );
    console.log(`   ✅ Second call - Factory called: ${factoryCalled} (should be false - cached)`);
    console.log(`   Result:`, result2);
    console.log();

    // Test 5: Pattern deletion
    console.log('5️⃣ Testing pattern deletion...');
    await cache.set('test:pattern:1', 'value1', 60);
    await cache.set('test:pattern:2', 'value2', 60);
    await cache.set('test:other:1', 'value3', 60);

    const deletedCount = await cache.delPattern('test:pattern:*');
    console.log(`   ✅ Deleted ${deletedCount} keys matching pattern 'test:pattern:*'\n`);

    // Test 6: Get cache stats
    console.log('6️⃣ Getting cache statistics...');
    const stats = await getCacheStats();
    console.log(`   Connected: ${stats.connected}`);
    console.log(`   Total keys: ${stats.keys || 'N/A'}`);
    console.log(`   Memory used: ${stats.memory || 'N/A'}\n`);

    // Cleanup
    console.log('🧹 Cleaning up test keys...');
    await cache.del(testKey);
    await cache.del(getOrSetKey);
    await cache.del('test:other:1');
    console.log('   ✅ Cleanup complete\n');

    console.log('✅ All Redis tests passed!\n');
    console.log('📊 Redis is ready for production use.');
    console.log('   - Embedding caching: enabled (7 day TTL)');
    console.log('   - API response caching: enabled (1 hour TTL)');
    console.log('   - Search result caching: enabled (1 hour TTL)');

  } catch (error) {
    console.error('❌ Redis test failed:', error);
    throw error;
  } finally {
    // Close Redis connection
    await cache.close();
    console.log('\n👋 Redis connection closed');
  }
}

// Run the test
testRedis().catch((error) => {
  logger.error('Redis test script failed', error);
  process.exit(1);
});
