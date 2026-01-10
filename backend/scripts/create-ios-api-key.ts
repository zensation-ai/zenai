#!/usr/bin/env ts-node

/**
 * Script to create an API key for iOS app
 * Run with: npm run create-ios-key
 */

import { pool } from '../src/utils/database';
import { generateApiKey } from '../src/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

async function createIOSAPIKey() {
  try {
    console.log('🔑 Creating API key for iOS app...\n');

    const { key, prefix, hash } = await generateApiKey();
    const id = uuidv4();
    const name = 'iOS App - Personal AI Brain';
    const scopes = ['read', 'write', 'admin'];
    const rateLimit = 10000; // Higher limit for mobile app

    // Check if iOS key already exists
    const existing = await pool.query(
      `SELECT id FROM api_keys WHERE name = $1`,
      [name]
    );

    if (existing.rows.length > 0) {
      console.error('❌ An API key for iOS already exists.');
      console.log('\nTo create a new key, first delete the existing one or use the regenerate endpoint.');
      await pool.end();
      process.exit(1);
    }

    await pool.query(
      `INSERT INTO api_keys (id, company_id, name, key_hash, key_prefix, scopes, rate_limit, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [id, 'personal', name, hash, prefix, JSON.stringify(scopes), rateLimit]
    );

    console.log('✅ API Key created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 iOS App Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Copy this API key and paste it in your iOS app:\n');
    console.log(`   ${key}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  IMPORTANT: Save this key now! It will not be shown again.');
    console.log('\n📝 Key Details:');
    console.log(`   Name:       ${name}`);
    console.log(`   Scopes:     ${scopes.join(', ')}`);
    console.log(`   Rate Limit: ${rateLimit} requests/minute`);
    console.log(`   Prefix:     ${prefix}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    if (error.code === '23505') {
      console.error('❌ An API key for iOS already exists. Check existing keys.');
    } else {
      console.error('❌ Error creating API key:', error.message);
    }
    await pool.end();
    process.exit(1);
  }
}

createIOSAPIKey();
