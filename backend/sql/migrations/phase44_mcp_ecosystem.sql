-- Phase 44: MCP Ecosystem - Database Migration
-- Creates mcp_connections table in all 4 schemas for managing external MCP server connections.

-- Function to create MCP tables in a schema
CREATE OR REPLACE FUNCTION create_mcp_tables(schema_name TEXT) RETURNS VOID AS $$
BEGIN
  -- MCP Connections: External MCP server connection configurations
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.mcp_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT,
      status VARCHAR(20) NOT NULL DEFAULT ''pending''
        CHECK (status IN (''connected'', ''disconnected'', ''error'', ''pending'')),
      tool_count INTEGER NOT NULL DEFAULT 0,
      resource_count INTEGER NOT NULL DEFAULT 0,
      last_health_check TIMESTAMPTZ,
      error_message TEXT,
      context VARCHAR(20) NOT NULL DEFAULT ''personal''
        CHECK (context IN (''personal'', ''work'', ''learning'', ''creative'')),
      enabled BOOLEAN NOT NULL DEFAULT true,
      headers JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name);

  -- Index for listing enabled connections
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%I_mcp_connections_enabled
    ON %I.mcp_connections (enabled, status)
  ', schema_name, schema_name);

  -- MCP Tool Call Log: Audit trail for external MCP tool calls
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.mcp_tool_call_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id UUID NOT NULL REFERENCES %I.mcp_connections(id) ON DELETE CASCADE,
      tool_name VARCHAR(255) NOT NULL,
      input JSONB,
      output JSONB,
      is_error BOOLEAN NOT NULL DEFAULT false,
      duration_ms INTEGER,
      called_by VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name, schema_name);

  -- Index for querying tool call history
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%I_mcp_tool_call_log_conn
    ON %I.mcp_tool_call_log (connection_id, created_at DESC)
  ', schema_name, schema_name);

  RAISE NOTICE 'MCP tables created in schema: %', schema_name;
END;
$$ LANGUAGE plpgsql;

-- Create tables in all 4 schemas
SELECT create_mcp_tables('personal');
SELECT create_mcp_tables('work');
SELECT create_mcp_tables('learning');
SELECT create_mcp_tables('creative');

-- Cleanup
DROP FUNCTION IF EXISTS create_mcp_tables(TEXT);
