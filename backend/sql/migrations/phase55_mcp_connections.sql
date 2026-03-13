-- Phase 55: MCP Client + Extended MCP Server
-- Creates mcp_server_connections and mcp_external_tools tables in all 4 schemas
-- Idempotent: safe to run multiple times

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- MCP Server Connections: stores configs for external MCP servers
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.mcp_server_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        transport VARCHAR(50) NOT NULL CHECK (transport IN (''streamable-http'', ''stdio'', ''sse'')),
        url TEXT,
        command TEXT,
        args JSONB DEFAULT ''[]'',
        env_vars JSONB DEFAULT ''{}'',
        auth_type VARCHAR(50),
        auth_config JSONB DEFAULT ''{}'',
        enabled BOOLEAN DEFAULT true,
        health_status VARCHAR(20) DEFAULT ''unknown'' CHECK (health_status IN (''healthy'', ''unhealthy'', ''unknown'')),
        last_health_check TIMESTAMPTZ,
        tool_count INTEGER DEFAULT 0,
        resource_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name);

    -- MCP External Tools: tools discovered from connected MCP servers
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.mcp_external_tools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID REFERENCES %I.mcp_server_connections(id) ON DELETE CASCADE,
        tool_name VARCHAR(255) NOT NULL,
        description TEXT,
        input_schema JSONB,
        usage_count INTEGER DEFAULT 0,
        avg_latency_ms FLOAT DEFAULT 0,
        last_used TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(server_id, tool_name)
      )
    ', schema_name, schema_name);

    -- Indexes
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_mcp_server_connections_enabled
      ON %I.mcp_server_connections(enabled)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_mcp_external_tools_server_id
      ON %I.mcp_external_tools(server_id)
    ', schema_name, schema_name);

    RAISE NOTICE 'Phase 55 MCP tables created for schema: %', schema_name;
  END LOOP;
END $$;
