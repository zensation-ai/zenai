/**
 * Phase 59: Memory MCP Resources
 *
 * Additional MCP resource definitions for memory services.
 * Exposes working memory, procedural memories, and entity-linked facts
 * as MCP resources for external AI clients.
 *
 * @module services/memory/memory-mcp-resources
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface MCPResourceContent {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}

// ===========================================
// Resource Definitions
// ===========================================

/**
 * Get additional memory MCP resource definitions
 */
export function getMemoryMCPResources(): MCPResourceDefinition[] {
  return [
    {
      uri: 'zenai://memory/working',
      name: 'Working Memory',
      description: 'Active working memory items (current task focus)',
      mimeType: 'application/json',
    },
    {
      uri: 'zenai://memory/procedures',
      name: 'Procedural Memories',
      description: 'Recently recorded procedural memories (learned action sequences)',
      mimeType: 'application/json',
    },
    {
      uri: 'zenai://memory/entities',
      name: 'Entity-Linked Facts',
      description: 'Facts linked to knowledge graph entities',
      mimeType: 'application/json',
    },
  ];
}

/**
 * Read a memory MCP resource by URI
 */
export async function readMemoryResource(
  uri: string,
  context: AIContext
): Promise<MCPResourceContent | null> {
  try {
    switch (uri) {
      case 'zenai://memory/working': {
        const result = await queryContext(context, `
          SELECT id, key, value, priority, expires_at, created_at
          FROM working_memory
          WHERE expires_at IS NULL OR expires_at > NOW()
          ORDER BY priority DESC, created_at DESC
          LIMIT 20
        `, []);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      case 'zenai://memory/procedures': {
        const result = await queryContext(context, `
          SELECT id, trigger_description, steps, tools_used, outcome,
                 usage_count, success_rate, feedback_score, created_at
          FROM procedural_memories
          ORDER BY created_at DESC
          LIMIT 15
        `, []);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      case 'zenai://memory/entities': {
        const result = await queryContext(context, `
          SELECT mel.fact_id, mel.entity_id, mel.link_type, mel.confidence,
                 COALESCE(lf.content, pf.content) AS fact_content,
                 ke.name AS entity_name, ke.type AS entity_type
          FROM memory_entity_links mel
          LEFT JOIN learned_facts lf ON lf.id = mel.fact_id
          LEFT JOIN personalization_facts pf ON pf.id = mel.fact_id
          LEFT JOIN knowledge_entities ke ON ke.id = mel.entity_id
          ORDER BY mel.created_at DESC
          LIMIT 20
        `, []);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          }],
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.debug('Memory MCP resource read failed (table may not exist)', {
      uri,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: '[]',
      }],
    };
  }
}
