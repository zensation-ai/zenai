-- Phase 100: Deep Excellence Migration
-- All schema changes for Phase 100 in one file

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- A1: Self-Editing Memory - fact lineage tracking
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS superseded_by UUID', schema_name);
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS supersede_reason TEXT', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_facts_superseded ON %I.learned_facts(superseded_by) WHERE superseded_by IS NOT NULL', schema_name, schema_name);

    -- C1: Chat Branching
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS parent_message_id UUID', schema_name);
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1', schema_name);
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chat_msg_parent ON %I.chat_messages(parent_message_id) WHERE parent_message_id IS NOT NULL', schema_name, schema_name);

    -- C3: Persistent Tool Disclosure
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT ''[]''', schema_name);

    -- C4: Thinking Persistence
    EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS thinking_content TEXT', schema_name);
  END LOOP;
END $$;

-- B2: Persistent Shared Memory (public schema only)
CREATE TABLE IF NOT EXISTS agent_shared_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  agent_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(execution_id, key)
);
CREATE INDEX IF NOT EXISTS idx_shared_memory_exec ON agent_shared_memory(execution_id);
