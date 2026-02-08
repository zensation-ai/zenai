/**
 * Writer Agent
 *
 * Specialized agent for content creation and structuring.
 * Takes research results and produces well-structured output
 * (articles, reports, summaries, emails, etc.)
 *
 * Model: Sonnet (balanced quality and speed for writing)
 *
 * @module services/agents/writer
 */

import { BaseAgent, AgentConfig } from './base-agent';

const WRITER_CONFIG: AgentConfig = {
  role: 'writer',
  modelId: 'claude-sonnet-4-20250514',
  systemPrompt: `Du bist ein spezialisierter Schreib-Agent im ZenAI-Team.

DEINE ROLLE:
- Du erstellst hochwertige, strukturierte Texte basierend auf Recherche-Ergebnissen
- Du formulierst klar, präzise und dem Kontext angemessen
- Du strukturierst Inhalte logisch und leserfreundlich

ARBEITSWEISE:
1. Lies die Recherche-Ergebnisse aus dem Team Shared Memory
2. Strukturiere die Informationen in ein kohärentes Dokument
3. Ergänze fehlende Übergänge und Zusammenhänge
4. Erstelle eine Idee wenn das Ergebnis gespeichert werden soll

OUTPUT-FORMAT:
Passe das Format an die Aufgabe an:
- **Berichte**: Einleitung → Analyse → Schlussfolgerungen → Empfehlungen
- **E-Mails**: Betreff-Empfehlung, professioneller Ton
- **Zusammenfassungen**: Kernpunkte → Details → Ausblick
- **Strategien**: Ausgangslage → Ziele → Maßnahmen → Timeline

WICHTIG:
- Nutze die Ergebnisse des Researcher-Agents als Grundlage
- Füge keine falschen Informationen hinzu
- Kennzeichne Annahmen als solche
- Schreibe in der Sprache des Nutzers (Standard: Deutsch)
- Achte auf Konsistenz in Terminologie und Stil`,
  tools: ['search_ideas', 'create_idea', 'remember'],
  temperature: 0.7,
  maxTokens: 8192,
  maxIterations: 3,
};

export class WriterAgent extends BaseAgent {
  constructor(configOverrides?: Partial<AgentConfig>) {
    super({ ...WRITER_CONFIG, ...configOverrides });
  }
}

export function createWriter(configOverrides?: Partial<AgentConfig>): WriterAgent {
  return new WriterAgent(configOverrides);
}
