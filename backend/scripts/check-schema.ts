#!/usr/bin/env ts-node
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== DATABASE SCHEMA CHECK ===\n');

    // Get all tables
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Existing tables:');
    tables.rows.forEach(r => console.log(`  - ${r.table_name}`));
    console.log(`\nTotal: ${tables.rows.length} tables\n`);

    // Check for required tables
    const requiredTables = [
      'ideas', 'meetings', 'api_keys', 'companies', 'user_profiles',
      'thought_incubator', 'thought_clusters', 'stories', 'media',
      'learning_tasks', 'business_profiles', 'notifications'
    ];

    console.log('Missing tables:');
    const existingNames = tables.rows.map(r => r.table_name);
    const missing = requiredTables.filter(t => !existingNames.includes(t));
    if (missing.length === 0) {
      console.log('  None - all required tables exist!');
    } else {
      missing.forEach(t => console.log(`  ❌ ${t}`));
    }

    await pool.end();
  } catch (error: any) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkSchema();
