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

import { pool } from './src/utils/database';
import { generateApiKey } from './src/middleware/auth';
import { logger } from './src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

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

    // Store in database
    const keyName = process.env.KEY_NAME || 'Generated Key';
    const scopes = ['read', 'write']; // Default scopes
    const rateLimit = 10000; // High rate limit

    await pool.query(
      `INSERT INTO public.api_keys (key_prefix, key_hash, name, scopes, rate_limit, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, name, scopes, rate_limit, created_at`,
      [prefix, hash, keyName, scopes, rateLimit]
    );

    console.log('✅ API key stored in database');
    console.log();
    console.log('Key Details:');
    console.log(`  Name: ${keyName}`);
    console.log(`  Prefix: ${prefix}`);
    console.log(`  Scopes: ${scopes.join(', ')}`);
    console.log(`  Rate Limit: ${rateLimit} requests/minute`);
    console.log();
    console.log('━'.repeat(60));
    console.log('⚠️  IMPORTANT: Save the API key above!');
    console.log('   It cannot be retrieved later for security reasons.');
    console.log('━'.repeat(60));
    console.log();
    console.log('Next steps:');
    console.log('1. Update frontend/.env with:');
    console.log(`   VITE_API_KEY=${key}`);
    console.log('2. Update Railway/Vercel environment variables');
    console.log('3. Redeploy frontend if needed');
    console.log();

  } catch (error) {
    console.error('❌ Error generating API key:', error);
    logger.error('API key generation failed', error instanceof Error ? error : undefined);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
