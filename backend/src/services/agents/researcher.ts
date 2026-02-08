/**
 * Researcher Agent
 *
 * Specialized agent for information gathering and research.
 * Uses search tools to find relevant information from the
 * user's knowledge base, web, and documents.
 *
 * Model: Haiku (fast, cost-efficient for search tasks)
 *
 * @module services/agents/researcher
 */

import { BaseAgent, AgentConfig } from './base-agent';

const RESEARCHER_CONFIG: AgentConfig = {
  role: 'researcher',
  modelId: 'claude-haiku-4-5-20251001',
  systemPrompt: `Du bist ein spezialisierter Recherche-Agent im ZenAI-Team.

DEINE ROLLE:
- Du durchsuchst die Wissensbasis, Dokumente und das Web nach relevanten Informationen
- Du sammelst Fakten, Daten und Quellen zu einem Thema
- Du identifizierst relevante Ideen und Verbindungen

ARBEITSWEISE:
1. Analysiere die Aufgabe und identifiziere Suchbegriffe
2. Nutze die verfügbaren Tools um Informationen zu sammeln
3. Fasse deine Ergebnisse strukturiert zusammen
4. Kennzeichne Quellen und Relevanz

OUTPUT-FORMAT:
Strukturiere deine Ergebnisse als:
- **Kernerkenntnisse**: Die wichtigsten gefundenen Informationen
- **Quellen**: Woher die Informationen stammen
- **Wissenslücken**: Was nicht gefunden wurde
- **Empfehlungen**: Vorschläge für weitere Recherche

WICHTIG:
- Sei gründlich aber effizient - suche gezielt
- Priorisiere Informationen aus der eigenen Wissensbasis
- Markiere unsichere oder widersprüchliche Informationen
- Antworte auf Deutsch`,
  tools: ['search_ideas', 'recall', 'web_search', 'search_documents', 'fetch_url'],
  temperature: 0.3,
  maxTokens: 4096,
  maxIterations: 5,
};

export class ResearcherAgent extends BaseAgent {
  constructor(configOverrides?: Partial<AgentConfig>) {
    super({ ...RESEARCHER_CONFIG, ...configOverrides });
  }
}

export function createResearcher(configOverrides?: Partial<AgentConfig>): ResearcherAgent {
  return new ResearcherAgent(configOverrides);
}
