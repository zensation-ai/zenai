/**
 * A2A Agent Card Generator
 *
 * Generates the Agent Card (/.well-known/agent.json) that describes
 * this agent's capabilities following the A2A protocol specification.
 *
 * @module services/a2a/agent-card
 */

// ===========================================
// Types
// ===========================================

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
}

export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  authentication: {
    schemes: string[];
  };
  skills: A2ASkill[];
}

// ===========================================
// Skills Definition
// ===========================================

export const A2A_SKILLS: A2ASkill[] = [
  {
    id: 'research',
    name: 'Deep Research',
    description: 'Multi-agent research with RAG and knowledge graph',
    inputModes: ['text'],
    outputModes: ['text'],
  },
  {
    id: 'code-review',
    name: 'Code Review & Analysis',
    description: 'Code analysis, bug detection, improvement suggestions',
    inputModes: ['text'],
    outputModes: ['text'],
  },
  {
    id: 'knowledge-query',
    name: 'Knowledge Base Query',
    description: 'Query personal knowledge base with semantic search',
    inputModes: ['text'],
    outputModes: ['text'],
  },
  {
    id: 'content-creation',
    name: 'Content Creation',
    description: 'Generate articles, reports, summaries',
    inputModes: ['text'],
    outputModes: ['text'],
  },
  {
    id: 'task-execution',
    name: 'Task Execution',
    description: 'Execute complex multi-step tasks',
    inputModes: ['text'],
    outputModes: ['text'],
  },
];

// ===========================================
// Agent Card Generator
// ===========================================

/**
 * Generate the A2A Agent Card for this ZenAI instance.
 * The card describes the agent's identity, capabilities, and skills.
 */
export function generateAgentCard(): A2AAgentCard {
  const baseUrl = process.env.API_URL
    || (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null)
    || 'http://localhost:3000';

  return {
    name: 'ZenAI Agent',
    description: 'Enterprise AI Platform with multi-agent orchestration, RAG pipeline, and knowledge graph',
    url: baseUrl,
    version: '1.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    authentication: {
      schemes: ['Bearer'],
    },
    skills: A2A_SKILLS,
  };
}

/**
 * Check if a skill ID is valid
 */
export function isValidSkill(skillId: string): boolean {
  return A2A_SKILLS.some(s => s.id === skillId);
}
