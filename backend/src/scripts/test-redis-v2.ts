/**
 * Redis Connection Test Script V2
 */

// Load dotenv FIRST
import dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';

async function testRedis() {
  console.log('🔄 Testing Redis Connection...\n');
  console.log('REDIS_URL:', process.env.REDIS_URL ? 'Set ✅' : 'Not set ❌\n');

  if (!process.env.REDIS_URL) {
    console.error('❌ REDIS_URL not set');
    process.exit(1);
  }

  const redis = new Redis(process.env.REDIS_URL);

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('❌ Connection timeout (10s)');
      redis.disconnect();
      reject(new Error('Connection timeout'));
    }, 10000);

    redis.on('connect', async () => {
      clearTimeout(timeout);
      console.log('✅ Redis connected!\n');

      try {
        // Test SET
        console.log('Testing SET...');
        await redis.set('test:connection', JSON.stringify({ test: true, timestamp: Date.now() }), 'EX', 60);
        console.log('✅ SET successful\n');

        // Test GET
        console.log('Testing GET...');
        const value = await redis.get('test:connection');
        console.log('✅ GET successful:', value, '\n');

        // Test DEL
        console.log('Testing DEL...');
        await redis.del('test:connection');
        console.log('✅ DEL successful\n');

        console.log('✅ All tests passed!');
        console.log('Redis is ready for production use.');

        await redis.quit();
        resolve();
      } catch (error) {
        console.error('❌ Test failed:', error);
        await redis.disconnect();
        reject(error);
      }
    });

    redis.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ Redis error:', err.message);
      reject(err);
    });
  });
}

testRedis()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
