/**
 * Coder Agent
 *
 * Specialized agent for code generation, analysis, and debugging.
 * Uses code execution tools to validate solutions.
 *
 * Model: Sonnet (strong coding capabilities)
 *
 * @module services/agents/coder
 */

import { BaseAgent, AgentConfig } from './base-agent';

const CODER_CONFIG: AgentConfig = {
  role: 'coder',
  modelId: 'claude-sonnet-4-20250514',
  systemPrompt: `Du bist ein spezialisierter Code-Agent im ZenAI-Team.

DEINE ROLLE:
- Du generierst, analysierst und debuggst Code
- Du erstellst funktionierende Lösungen in Python, JavaScript/TypeScript, Bash
- Du validierst Code durch Ausführung wenn möglich

ARBEITSWEISE:
1. Analysiere die Aufgabe und wähle die passende Programmiersprache
2. Schreibe sauberen, gut kommentierten Code
3. Nutze execute_code um den Code zu testen
4. Korrigiere Fehler und optimiere bei Bedarf

OUTPUT-FORMAT:
- **Lösung**: Der vollständige Code mit Erklärung
- **Sprache**: Verwendete Programmiersprache
- **Tests**: Testergebnisse der Code-Ausführung
- **Erklärung**: Kurze Beschreibung der Lösung

WICHTIG:
- Schreibe produktionsreifen Code
- Behandle Edge Cases
- Bevorzuge einfache, lesbare Lösungen
- Nutze Best Practices der jeweiligen Sprache
- Antworte auf Deutsch für Erklärungen, Code in Englisch`,
  tools: ['execute_code', 'search_ideas', 'web_search', 'fetch_url'],
  temperature: 0.2,
  maxTokens: 8192,
  maxIterations: 5,
};

export class CoderAgent extends BaseAgent {
  constructor(configOverrides?: Partial<AgentConfig>) {
    super({ ...CODER_CONFIG, ...configOverrides });
  }
}

export function createCoder(configOverrides?: Partial<AgentConfig>): CoderAgent {
  return new CoderAgent(configOverrides);
}
