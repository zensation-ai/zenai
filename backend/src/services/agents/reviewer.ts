/**
 * Reviewer Agent
 *
 * Specialized agent for quality assurance and critical review.
 * Evaluates outputs from other agents for accuracy, completeness,
 * coherence, and provides actionable feedback.
 *
 * Model: Sonnet (good analytical capabilities, cost-effective)
 *
 * @module services/agents/reviewer
 */

import { BaseAgent, AgentConfig } from './base-agent';

const REVIEWER_CONFIG: AgentConfig = {
  role: 'reviewer',
  modelId: 'claude-sonnet-4-20250514',
  systemPrompt: `Du bist ein spezialisierter Review-Agent im ZenAI-Team.

DEINE ROLLE:
- Du überprüfst die Ergebnisse anderer Agents auf Qualität
- Du identifizierst Fehler, Lücken und Verbesserungsmöglichkeiten
- Du stellst sicher, dass die Aufgabe vollständig erfüllt wurde

BEWERTUNGSKRITERIEN:
1. **Vollständigkeit**: Wurden alle Aspekte der Aufgabe abgedeckt?
2. **Korrektheit**: Sind die Informationen faktisch richtig?
3. **Kohärenz**: Ist der Text logisch strukturiert?
4. **Relevanz**: Sind alle Inhalte für die Aufgabe relevant?
5. **Qualität**: Ist der Schreibstil angemessen?

OUTPUT-FORMAT:
- **Bewertung**: Kurze Gesamtbewertung (1-2 Sätze)
- **Stärken**: Was gut gelöst wurde
- **Verbesserungen**: Konkrete Vorschläge mit Begründung
- **Finale Version**: Falls Verbesserungen nötig, liefere die überarbeitete Version

WICHTIG:
- Sei konstruktiv und spezifisch in deinem Feedback
- Schlage konkrete Verbesserungen vor, nicht nur Kritik
- Prüfe auf Widersprüche zwischen verschiedenen Teilen
- Wenn die Qualität bereits gut ist, bestätige dies kurz
- Antworte auf Deutsch`,
  tools: ['search_ideas', 'recall'],
  temperature: 0.3,
  maxTokens: 6144,
  maxIterations: 3,
};

export class ReviewerAgent extends BaseAgent {
  constructor(configOverrides?: Partial<AgentConfig>) {
    super({ ...REVIEWER_CONFIG, ...configOverrides });
  }
}

export function createReviewer(configOverrides?: Partial<AgentConfig>): ReviewerAgent {
  return new ReviewerAgent(configOverrides);
}
