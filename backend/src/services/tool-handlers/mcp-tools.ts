/**
 * MCP Tool Handlers - Phase 44
 *
 * Bridge between the Chat Tool Use system and external MCP servers.
 * Enables Claude to call tools on connected external MCP servers
 * via the existing tool_use infrastructure.
 *
 * Tools:
 * - mcp_call_tool: Call a tool on a connected MCP server
 * - mcp_list_tools: List available tools across all MCP connections
 */

import { ToolExecutionContext } from '../claude/tool-use';
import { mcpConnectionManager } from '../mcp-connections';
import { logger } from '../../utils/logger';

/**
 * Handle mcp_call_tool — call a tool on an external MCP server
 */
export async function handleMCPCallTool(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const connectionId = input.connection_id as string;
  const toolName = input.tool_name as string;
  const toolArgs = (input.arguments as Record<string, unknown>) || {};

  if (!connectionId || !toolName) {
    return 'Fehler: connection_id und tool_name sind erforderlich.';
  }

  const context = execContext.aiContext;
  logger.debug('Tool: mcp_call_tool', { connectionId, toolName, context });

  try {
    const result = await mcpConnectionManager.callTool(connectionId, toolName, toolArgs);

    if (result.isError) {
      const errorText = result.content.map(c => c.text).join('\n');
      return `MCP Tool-Fehler: ${errorText}`;
    }

    return result.content.map(c => c.text).join('\n');
  } catch (error) {
    logger.error('Tool mcp_call_tool failed', error instanceof Error ? error : undefined);
    return `Fehler beim MCP Tool-Aufruf: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

/**
 * Handle mcp_list_tools — list all available tools from connected MCP servers
 */
export async function handleMCPListTools(
  _input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const context = execContext.aiContext;
  logger.debug('Tool: mcp_list_tools', { context });

  try {
    const tools = await mcpConnectionManager.getAllTools(context);

    if (tools.length === 0) {
      return 'Keine externen MCP-Tools verfuegbar. Es sind keine MCP-Server verbunden.';
    }

    const lines: string[] = [`**${tools.length} MCP-Tools verfuegbar:**\n`];

    // Group by connection
    const byConnection = new Map<string, typeof tools>();
    for (const tool of tools) {
      const existing = byConnection.get(tool.connectionName) || [];
      existing.push(tool);
      byConnection.set(tool.connectionName, existing);
    }

    for (const [connName, connTools] of byConnection) {
      lines.push(`\n**${connName}** (${connTools.length} Tools):`);
      for (const t of connTools) {
        lines.push(`- \`${t.originalName}\`: ${t.tool.description}`);
      }
    }

    return lines.join('\n');
  } catch (error) {
    logger.error('Tool mcp_list_tools failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der MCP-Tools.';
  }
}
