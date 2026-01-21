/**
 * Generate API Key Script
 *
 * Creates a new API key with bcrypt hash and stores it in the database.
 * This ensures proper security for production use.
 *
 * Usage:
 *   npm run generate-api-key
 *   or
 *   npx tsx generate-api-key.ts
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { generateApiKey } from './src/middleware/auth';
import { logger } from './src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

// Create a dedicated pool for public schema (API keys)
const publicPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
  max: 1, // Only need one connection for this script
});

async function main() {
  try {
    console.log('🔐 Generating new API key...\n');

    // Generate key with bcrypt hash
    const { key, prefix, hash } = await generateApiKey();

    console.log('✅ API Key generated successfully!\n');
    console.log('━'.repeat(60));
    console.log('API KEY (save this - it will not be shown again):');
    console.log('━'.repeat(60));
    console.log(key);
    console.log('━'.repeat(60));
    console.log();

    // Store in database (public schema)
    const keyId = randomUUID();
    const keyName = process.env.KEY_NAME || 'Test API Key';
    const scopes = ['read', 'write']; // Default scopes
    const rateLimit = 10000; // High rate limit

    const result = await publicPool.query(
      `INSERT INTO public.api_keys (id, key_prefix, key_hash, name, scopes, rate_limit, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)
       RETURNING id, name, scopes, rate_limit, created_at`,
      [keyId, prefix, hash, keyName, JSON.stringify(scopes), rateLimit]
    );

    console.log('✅ API key stored in database');
    console.log();
    console.log('Key Details:');
    console.log(`  ID: ${result.rows[0].id}`);
    console.log(`  Name: ${keyName}`);
    console.log(`  Prefix: ${prefix}`);
    console.log(`  Scopes: ${scopes.join(', ')}`);
    console.log(`  Rate Limit: ${rateLimit} requests/minute`);
    console.log(`  Created: ${result.rows[0].created_at}`);
    console.log();
    console.log('━'.repeat(60));
    console.log('⚠️  IMPORTANT: Save the API key above!');
    console.log('   It cannot be retrieved later for security reasons.');
    console.log('━'.repeat(60));
    console.log();
    console.log('Next steps:');
    console.log('1. Update frontend/.env with:');
    console.log(`   VITE_API_KEY=${key}`);
    console.log('2. Use this key for API testing');
    console.log();

  } catch (error) {
    console.error('❌ Error generating API key:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    logger.error('API key generation failed', error instanceof Error ? error : undefined);
    process.exit(1);
  } finally {
    await publicPool.end();
  }
}

main();
