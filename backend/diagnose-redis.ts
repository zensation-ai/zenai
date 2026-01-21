/**
 * Redis Connection Diagnostic Tool
 *
 * Tests Redis connectivity and provides detailed diagnostics
 *
 * Usage:
 *   npm run diagnose:redis
 *   or
 *   npx tsx diagnose-redis.ts
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function diagnoseRedis() {
  console.log('🔍 Redis Connection Diagnostics\n');
  console.log('='.repeat(60));
  console.log();

  // 1. Check Environment Variable
  console.log('1️⃣  Environment Configuration');
  console.log('━'.repeat(60));
  console.log(`REDIS_URL: ${REDIS_URL ? '✅ Set' : '❌ Not set'}`);
  if (REDIS_URL) {
    try {
      const url = new URL(REDIS_URL);
      console.log(`  Protocol: ${url.protocol}`);
      console.log(`  Host: ${url.hostname}`);
      console.log(`  Port: ${url.port || '6379'}`);
      console.log(`  Has Auth: ${url.password ? '✅ Yes' : '❌ No'}`);
    } catch (e) {
      console.log(`  ⚠️  Invalid URL format: ${REDIS_URL}`);
    }
  } else {
    console.log('  ⚠️  Using default: redis://localhost:6379');
  }
  console.log();

  // 2. Test Connection
  console.log('2️⃣  Connection Test');
  console.log('━'.repeat(60));

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    lazyConnect: true,
    retryStrategy: (times) => {
      console.log(`   Retry attempt ${times}/3...`);
      if (times > 3) return null;
      return Math.min(times * 500, 3000);
    },
  });

  redis.on('connect', () => {
    console.log('✅ Connected to Redis');
  });

  redis.on('ready', () => {
    console.log('✅ Redis is ready');
  });

  redis.on('error', (err) => {
    console.log(`❌ Redis error: ${err.message}`);
  });

  redis.on('close', () => {
    console.log('⚠️  Connection closed');
  });

  try {
    console.log('Attempting connection...');
    await redis.connect();
    console.log('✅ Connection successful!');
    console.log();

    // 3. Test Operations
    console.log('3️⃣  Basic Operations Test');
    console.log('━'.repeat(60));

    // PING
    const pingStart = Date.now();
    const pong = await redis.ping();
    const pingDuration = Date.now() - pingStart;
    console.log(`PING: ${pong} (${pingDuration}ms)`);

    // SET
    await redis.set('test_key', 'test_value', 'EX', 10);
    console.log('✅ SET test_key = "test_value" (expires in 10s)');

    // GET
    const value = await redis.get('test_key');
    console.log(`✅ GET test_key = "${value}"`);

    // INFO
    const info = await redis.info('server');
    const versionMatch = info.match(/redis_version:(\S+)/);
    if (versionMatch) {
      console.log(`✅ Redis Version: ${versionMatch[1]}`);
    }

    // MEMORY
    const memoryInfo = await redis.info('memory');
    const memoryMatch = memoryInfo.match(/used_memory_human:(\S+)/);
    if (memoryMatch) {
      console.log(`✅ Memory Used: ${memoryMatch[1]}`);
    }

    // DBSIZE
    const dbsize = await redis.dbsize();
    console.log(`✅ Keys in DB: ${dbsize}`);

    console.log();

    // 4. Performance Test
    console.log('4️⃣  Performance Test');
    console.log('━'.repeat(60));

    const iterations = 100;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await redis.set(`perf_test_${i}`, `value_${i}`);
    }

    const setDuration = Date.now() - start;
    console.log(`SET ${iterations} keys: ${setDuration}ms (${(iterations / setDuration * 1000).toFixed(0)} ops/sec)`);

    const getStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await redis.get(`perf_test_${i}`);
    }
    const getDuration = Date.now() - getStart;
    console.log(`GET ${iterations} keys: ${getDuration}ms (${(iterations / getDuration * 1000).toFixed(0)} ops/sec)`);

    // Cleanup
    for (let i = 0; i < iterations; i++) {
      await redis.del(`perf_test_${i}`);
    }
    await redis.del('test_key');

    console.log();

    // 5. Summary
    console.log('5️⃣  Summary');
    console.log('━'.repeat(60));
    console.log('✅ Redis is FULLY FUNCTIONAL');
    console.log('✅ All operations successful');
    console.log(`✅ Average latency: ${((setDuration + getDuration) / (iterations * 2)).toFixed(2)}ms`);
    console.log();
    console.log('Recommendation: Redis cache is working correctly!');

  } catch (error) {
    console.log();
    console.log('❌ Connection Failed');
    console.log('━'.repeat(60));

    if (error instanceof Error) {
      console.log(`Error: ${error.message}`);
      console.log();

      console.log('Possible Issues:');
      console.log('1. Redis service not running');
      console.log('   → Check Railway Dashboard → Services → Redis');
      console.log('   → Add Redis service if missing');
      console.log();
      console.log('2. REDIS_URL not configured');
      console.log('   → Railway auto-sets this when Redis service exists');
      console.log('   → Check: Railway → Backend Service → Variables → REDIS_URL');
      console.log();
      console.log('3. Network/Firewall issues');
      console.log('   → Redis port 6379 blocked?');
      console.log('   → Railway internal network issue?');
      console.log();
      console.log('4. Authentication failed');
      console.log('   → Check REDIS_URL format: redis://default:PASSWORD@host:port');
      console.log();

      if (error.message.includes('ECONNREFUSED')) {
        console.log('Diagnosis: Connection refused → Redis service not running or wrong host/port');
      } else if (error.message.includes('ETIMEDOUT')) {
        console.log('Diagnosis: Timeout → Network issue or firewall blocking connection');
      } else if (error.message.includes('ENOTFOUND')) {
        console.log('Diagnosis: Host not found → Wrong hostname in REDIS_URL');
      } else if (error.message.includes('authentication')) {
        console.log('Diagnosis: Authentication failed → Wrong password in REDIS_URL');
      }
    }

    console.log();
    console.log('Recommendation: Redis cache will be disabled (graceful fallback)');
  } finally {
    await redis.quit();
    process.exit(0);
  }
}

// Run diagnostics
diagnoseRedis().catch(console.error);
