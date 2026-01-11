/**
 * Fix Supabase Schema - Complete Migration
 * Creates all missing tables and fixes constraints
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function columnExists(client: any, table: string, column: string): Promise<boolean> {
  const { rows } = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = $1 AND column_name = $2
  `, [table, column]);
  return rows.length > 0;
}

async function tableExists(client: any, table: string): Promise<boolean> {
  const { rows } = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
  `, [table]);
  return rows.length > 0;
}

async function indexExists(client: any, indexName: string): Promise<boolean> {
  const { rows } = await client.query(`
    SELECT 1 FROM pg_indexes WHERE indexname = $1
  `, [indexName]);
  return rows.length > 0;
}

async function fixSchema() {
  console.log('🔧 Fixing Supabase schema...\n');

  const client = await pool.connect();
  try {
    // 1. Fix rate_limits table
    console.log('1. Fixing rate_limits table...');
    await client.query(`DROP TABLE IF EXISTS rate_limits CASCADE`);
    await client.query(`
      CREATE TABLE rate_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier VARCHAR(255) NOT NULL,
        window_start TIMESTAMP WITH TIME ZONE NOT NULL,
        request_count INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(identifier, window_start)
      )
    `);
    await client.query(`CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier)`);
    await client.query(`CREATE INDEX idx_rate_limits_window ON rate_limits(window_start)`);
    console.log('   ✅ rate_limits fixed\n');

    // 2. Create idea_topics table
    console.log('2. Creating idea_topics table...');
    if (!await tableExists(client, 'idea_topics')) {
      await client.query(`
        CREATE TABLE idea_topics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          color VARCHAR(7) DEFAULT '#3B82F6',
          icon VARCHAR(50),
          parent_topic_id UUID REFERENCES idea_topics(id) ON DELETE SET NULL,
          confidence_score FLOAT DEFAULT 0.5,
          embedding_vector FLOAT[],
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    } else {
      // Add missing columns
      if (!await columnExists(client, 'idea_topics', 'confidence_score')) {
        await client.query(`ALTER TABLE idea_topics ADD COLUMN confidence_score FLOAT DEFAULT 0.5`);
      }
      if (!await columnExists(client, 'idea_topics', 'embedding_vector')) {
        await client.query(`ALTER TABLE idea_topics ADD COLUMN embedding_vector FLOAT[]`);
      }
    }
    if (!await indexExists(client, 'idx_idea_topics_name')) {
      await client.query(`CREATE INDEX idx_idea_topics_name ON idea_topics(name)`);
    }
    console.log('   ✅ idea_topics ready\n');

    // 3. Create idea_topic_memberships table
    console.log('3. Creating idea_topic_memberships table...');
    if (!await tableExists(client, 'idea_topic_memberships')) {
      await client.query(`
        CREATE TABLE idea_topic_memberships (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
          topic_id UUID NOT NULL REFERENCES idea_topics(id) ON DELETE CASCADE,
          confidence FLOAT DEFAULT 0.5,
          is_primary BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(idea_id, topic_id)
        )
      `);
    }
    if (!await indexExists(client, 'idx_memberships_idea')) {
      await client.query(`CREATE INDEX idx_memberships_idea ON idea_topic_memberships(idea_id)`);
    }
    if (!await indexExists(client, 'idx_memberships_topic')) {
      await client.query(`CREATE INDEX idx_memberships_topic ON idea_topic_memberships(topic_id)`);
    }
    console.log('   ✅ idea_topic_memberships ready\n');

    // 4. Add primary_topic_id to ideas if missing
    console.log('4. Ensuring primary_topic_id column on ideas...');
    if (!await columnExists(client, 'ideas', 'primary_topic_id')) {
      await client.query(`ALTER TABLE ideas ADD COLUMN primary_topic_id UUID REFERENCES idea_topics(id) ON DELETE SET NULL`);
    }
    console.log('   ✅ primary_topic_id ensured\n');

    // 5. Fix daily_learning_tasks table
    console.log('5. Fixing daily_learning_tasks table...');
    if (await tableExists(client, 'daily_learning_tasks')) {
      // Add missing columns one by one
      const columns = [
        { name: 'due_date', type: 'DATE' },
        { name: 'key_concepts', type: "JSONB DEFAULT '[]'" },
        { name: 'resources', type: "JSONB DEFAULT '[]'" },
        { name: 'related_ideas', type: "JSONB DEFAULT '[]'" },
        { name: 'related_meetings', type: "JSONB DEFAULT '[]'" },
        { name: 'metadata', type: "JSONB DEFAULT '{}'" },
        { name: 'completed_at', type: 'TIMESTAMP WITH TIME ZONE' },
      ];
      for (const col of columns) {
        if (!await columnExists(client, 'daily_learning_tasks', col.name)) {
          await client.query(`ALTER TABLE daily_learning_tasks ADD COLUMN ${col.name} ${col.type}`);
          console.log(`   Added column ${col.name}`);
        }
      }
    } else {
      await client.query(`
        CREATE TABLE daily_learning_tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          topic VARCHAR(255) NOT NULL,
          description TEXT,
          priority VARCHAR(20) DEFAULT 'medium',
          estimated_duration INTEGER DEFAULT 30,
          due_date DATE,
          status VARCHAR(20) DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          key_concepts JSONB DEFAULT '[]',
          resources JSONB DEFAULT '[]',
          related_ideas JSONB DEFAULT '[]',
          related_meetings JSONB DEFAULT '[]',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE
        )
      `);
    }
    // Create indexes if they don't exist
    if (!await indexExists(client, 'idx_learning_tasks_status')) {
      await client.query(`CREATE INDEX idx_learning_tasks_status ON daily_learning_tasks(status)`);
    }
    if (!await indexExists(client, 'idx_learning_tasks_priority')) {
      await client.query(`CREATE INDEX idx_learning_tasks_priority ON daily_learning_tasks(priority)`);
    }
    if (await columnExists(client, 'daily_learning_tasks', 'due_date') && !await indexExists(client, 'idx_learning_tasks_due')) {
      await client.query(`CREATE INDEX idx_learning_tasks_due ON daily_learning_tasks(due_date)`);
    }
    console.log('   ✅ daily_learning_tasks ready\n');

    // 6. Create study_sessions table
    console.log('6. Creating study_sessions table...');
    if (!await tableExists(client, 'study_sessions')) {
      await client.query(`
        CREATE TABLE study_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID REFERENCES daily_learning_tasks(id) ON DELETE CASCADE,
          duration_minutes INTEGER NOT NULL,
          notes TEXT,
          concepts_covered JSONB DEFAULT '[]',
          resources_used JSONB DEFAULT '[]',
          effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    }
    if (!await indexExists(client, 'idx_study_sessions_task')) {
      await client.query(`CREATE INDEX idx_study_sessions_task ON study_sessions(task_id)`);
    }
    console.log('   ✅ study_sessions ready\n');

    // 7. Create learning_insights table
    console.log('7. Creating learning_insights table...');
    if (!await tableExists(client, 'learning_insights')) {
      await client.query(`
        CREATE TABLE learning_insights (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          insight_type VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          related_tasks JSONB DEFAULT '[]',
          related_topics JSONB DEFAULT '[]',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    }
    if (!await indexExists(client, 'idx_learning_insights_type')) {
      await client.query(`CREATE INDEX idx_learning_insights_type ON learning_insights(insight_type)`);
    }
    console.log('   ✅ learning_insights ready\n');

    // 8. Create notification tables
    console.log('8. Creating notification tables...');
    if (!await tableExists(client, 'notification_tokens')) {
      await client.query(`
        CREATE TABLE notification_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token TEXT NOT NULL UNIQUE,
          platform VARCHAR(20) NOT NULL,
          device_info JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    }
    if (!await tableExists(client, 'notification_preferences')) {
      await client.query(`
        CREATE TABLE notification_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_id UUID REFERENCES notification_tokens(id) ON DELETE CASCADE,
          preference_type VARCHAR(50) NOT NULL,
          enabled BOOLEAN DEFAULT true,
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(token_id, preference_type)
        )
      `);
    }
    if (!await tableExists(client, 'notification_history')) {
      await client.query(`
        CREATE TABLE notification_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_id UUID REFERENCES notification_tokens(id) ON DELETE SET NULL,
          title VARCHAR(255) NOT NULL,
          body TEXT,
          data JSONB DEFAULT '{}',
          status VARCHAR(20) DEFAULT 'sent',
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    }
    console.log('   ✅ notification tables ready\n');

    // 9. Create digest_entries table
    console.log('9. Creating digest_entries table...');
    if (!await tableExists(client, 'digest_entries')) {
      await client.query(`
        CREATE TABLE digest_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          digest_type VARCHAR(20) NOT NULL,
          period_start TIMESTAMP WITH TIME ZONE NOT NULL,
          period_end TIMESTAMP WITH TIME ZONE NOT NULL,
          content JSONB NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    }
    if (!await indexExists(client, 'idx_digest_type')) {
      await client.query(`CREATE INDEX idx_digest_type ON digest_entries(digest_type)`);
    }
    console.log('   ✅ digest_entries ready\n');

    // 10. Create user_facts table
    console.log('10. Creating user_facts table...');
    if (await tableExists(client, 'user_facts')) {
      // Add missing columns
      const factColumns = [
        { name: 'fact_type', type: "VARCHAR(50) DEFAULT 'general'" },
        { name: 'fact_value', type: "TEXT DEFAULT ''" },
        { name: 'confidence', type: 'FLOAT DEFAULT 0.5' },
        { name: 'source', type: 'VARCHAR(100)' },
        { name: 'verified', type: 'BOOLEAN DEFAULT false' },
        { name: 'metadata', type: "JSONB DEFAULT '{}'" },
      ];
      for (const col of factColumns) {
        if (!await columnExists(client, 'user_facts', col.name)) {
          await client.query(`ALTER TABLE user_facts ADD COLUMN ${col.name} ${col.type}`);
          console.log(`   Added column ${col.name}`);
        }
      }
    } else {
      await client.query(`
        CREATE TABLE user_facts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          fact_type VARCHAR(50) NOT NULL,
          fact_value TEXT NOT NULL,
          confidence FLOAT DEFAULT 0.5,
          source VARCHAR(100),
          verified BOOLEAN DEFAULT false,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    }
    if (await columnExists(client, 'user_facts', 'fact_type') && !await indexExists(client, 'idx_user_facts_type')) {
      await client.query(`CREATE INDEX idx_user_facts_type ON user_facts(fact_type)`);
    }
    console.log('   ✅ user_facts ready\n');

    // 11. Verify all tables
    console.log('11. Verifying all tables...');
    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('   Tables in database:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));

    console.log('\n✅ Schema fix complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixSchema().catch(console.error);
