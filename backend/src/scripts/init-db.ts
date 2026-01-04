/**
 * Database Initialization Script
 * Creates the required tables and extensions for the Personal AI System
 *
 * Run with: npm run db:init
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_brain',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'localpass',
});

async function initDatabase() {
  const client = await pool.connect();

  try {
    console.log('🚀 Initializing database...\n');

    // Enable pgvector extension
    console.log('1. Enabling pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('   ✅ pgvector enabled\n');

    // Create ideas table
    console.log('2. Creating ideas table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ideas (
        -- Primary Key
        id UUID PRIMARY KEY,

        -- Structured Data (from Mistral)
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('idea', 'task', 'insight', 'problem', 'question')),
        category VARCHAR(50) NOT NULL CHECK (category IN ('business', 'technical', 'personal', 'learning')),
        priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
        summary TEXT,

        -- Arrays stored as JSONB
        next_steps JSONB DEFAULT '[]',
        context_needed JSONB DEFAULT '[]',
        keywords JSONB DEFAULT '[]',

        -- Original Content
        raw_transcript TEXT,

        -- Embeddings (multiple formats for optimization)
        embedding vector(768),           -- Full precision (nomic-embed-text uses 768 dims)
        embedding_int8 JSONB,            -- Int8 quantized (8x smaller)
        embedding_binary TEXT,           -- Binary quantized (32x smaller, ultra-fast)

        -- Metadata
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Optional: For future multi-company support
        company_id VARCHAR(100) DEFAULT 'personal',

        -- Optional: User interaction tracking
        viewed_count INTEGER DEFAULT 0,
        is_archived BOOLEAN DEFAULT FALSE
      );
    `);
    console.log('   ✅ ideas table created\n');

    // Create idea_relations table for Knowledge Graph
    console.log('2b. Creating idea_relations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS idea_relations (
        id SERIAL PRIMARY KEY,
        source_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        target_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
        relation_type VARCHAR(50) NOT NULL CHECK (
          relation_type IN ('similar_to', 'builds_on', 'contradicts', 'supports', 'enables', 'part_of', 'related_tech')
        ),
        strength FLOAT NOT NULL CHECK (strength >= 0 AND strength <= 1),
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(source_id, target_id, relation_type)
      );
    `);
    console.log('   ✅ idea_relations table created\n');

    // Create indexes
    console.log('3. Creating indexes...');

    // Vector similarity index (HNSW for fast approximate search)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ideas_embedding_idx
      ON ideas
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);
    console.log('   ✅ Vector similarity index (HNSW) created');

    // B-tree indexes for filtering
    await client.query('CREATE INDEX IF NOT EXISTS ideas_type_idx ON ideas(type);');
    await client.query('CREATE INDEX IF NOT EXISTS ideas_category_idx ON ideas(category);');
    await client.query('CREATE INDEX IF NOT EXISTS ideas_priority_idx ON ideas(priority);');
    await client.query('CREATE INDEX IF NOT EXISTS ideas_created_at_idx ON ideas(created_at DESC);');
    await client.query('CREATE INDEX IF NOT EXISTS ideas_company_id_idx ON ideas(company_id);');
    console.log('   ✅ Filter indexes created');

    // Knowledge Graph indexes
    await client.query('CREATE INDEX IF NOT EXISTS idea_relations_source_idx ON idea_relations(source_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idea_relations_target_idx ON idea_relations(target_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idea_relations_type_idx ON idea_relations(relation_type);');
    console.log('   ✅ Knowledge Graph indexes created');

    // Full-text search index (for fallback text search)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ideas_fulltext_idx
      ON ideas
      USING gin(to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(raw_transcript, '')));
    `);
    console.log('   ✅ Full-text search index created\n');

    // Create updated_at trigger
    console.log('4. Creating update trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_ideas_updated_at ON ideas;
      CREATE TRIGGER update_ideas_updated_at
      BEFORE UPDATE ON ideas
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('   ✅ Update trigger created\n');

    // Create helper functions
    console.log('5. Creating helper functions...');

    // Function for finding similar ideas
    await client.query(`
      CREATE OR REPLACE FUNCTION find_similar_ideas(
        query_embedding vector(768),
        max_results INTEGER DEFAULT 10,
        similarity_threshold FLOAT DEFAULT 0.5
      )
      RETURNS TABLE (
        id UUID,
        title VARCHAR(255),
        type VARCHAR(50),
        category VARCHAR(50),
        priority VARCHAR(20),
        summary TEXT,
        similarity FLOAT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          i.id,
          i.title,
          i.type,
          i.category,
          i.priority,
          i.summary,
          1 - (i.embedding <=> query_embedding) as similarity
        FROM ideas i
        WHERE i.embedding IS NOT NULL
          AND 1 - (i.embedding <=> query_embedding) > similarity_threshold
        ORDER BY i.embedding <=> query_embedding
        LIMIT max_results;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('   ✅ find_similar_ideas function created\n');

    // Verify setup
    console.log('6. Verifying setup...');
    const tableCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ideas'
      ORDER BY ordinal_position;
    `);

    console.log('   Ideas table columns:');
    tableCheck.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ Database initialization complete!\n');
    console.log('You can now start the backend with: npm run dev');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
initDatabase().catch(console.error);
