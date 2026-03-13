-- Phase 58: GraphRAG + Hybrid Retrieval
-- Creates knowledge_entities, entity_relations, and graph_communities tables
-- in all 4 schemas (personal, work, learning, creative)
-- Idempotent: uses IF NOT EXISTS throughout

DO $$
DECLARE
  schema_name TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH schema_name IN ARRAY schemas
  LOOP
    -- knowledge_entities table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.knowledge_entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(500) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN (''person'', ''organization'', ''concept'', ''technology'', ''location'', ''event'', ''product'')),
        description TEXT,
        importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
        embedding vector(1536),
        source_ids UUID[] DEFAULT ''{}'',
        mention_count INTEGER DEFAULT 1,
        aliases TEXT[] DEFAULT ''{}'',
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Indexes for knowledge_entities
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_knowledge_entities_embedding
      ON %I.knowledge_entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_knowledge_entities_type
      ON %I.knowledge_entities USING btree (type)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_knowledge_entities_name
      ON %I.knowledge_entities USING btree (name)
    ', schema_name, schema_name);

    -- entity_relations table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.entity_relations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_entity_id UUID REFERENCES %I.knowledge_entities(id) ON DELETE CASCADE,
        target_entity_id UUID REFERENCES %I.knowledge_entities(id) ON DELETE CASCADE,
        relation_type VARCHAR(100) NOT NULL CHECK (relation_type IN (''supports'', ''contradicts'', ''causes'', ''requires'', ''part_of'', ''similar_to'', ''created_by'', ''used_by'')),
        description TEXT,
        strength FLOAT DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
        source_ids UUID[] DEFAULT ''{}'',
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(source_entity_id, target_entity_id, relation_type)
      )', schema_name, schema_name, schema_name);

    -- Indexes for entity_relations
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_entity_relations_source
      ON %I.entity_relations USING btree (source_entity_id)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_entity_relations_target
      ON %I.entity_relations USING btree (target_entity_id)
    ', schema_name, schema_name);

    -- graph_communities table (for GraphRAG summaries)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.graph_communities_v2 (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        community_level INTEGER DEFAULT 1,
        entity_ids UUID[] NOT NULL,
        summary TEXT NOT NULL,
        summary_embedding vector(1536),
        key_themes TEXT[] DEFAULT ''{}'',
        entity_count INTEGER,
        edge_count INTEGER,
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Index for graph_communities_v2 summary search
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_graph_communities_v2_embedding
      ON %I.graph_communities_v2 USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 50)
    ', schema_name, schema_name);

    RAISE NOTICE 'Phase 58: GraphRAG tables created for schema %', schema_name;
  END LOOP;
END $$;
