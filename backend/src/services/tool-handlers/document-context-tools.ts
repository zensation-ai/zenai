/**
 * Document Context Tool Handler
 *
 * Implements the `prepare_document_context` tool. Searches all relevant
 * data sources in parallel and returns structured context for Claude
 * to brainstorm a document with the user.
 *
 * @module services/tool-handlers/document-context-tools
 */

import { logger } from '../../utils/logger';
import { queryContext, type AIContext } from '../../utils/database-context';
import { longTermMemory } from '../memory';
import type { ToolExecutionContext } from '../claude/tool-types';

const BUSINESS_KEYWORDS = /umsatz|revenue|quartal|kpi|metrik|finanzen|budget|gewinn|profit|verkauf|sales|traffic|conversion/i;
const CONTACT_KEYWORDS = /kunde|kunden|client|partner|meeting\s+mit|kontakt|firma|company|person/i;

interface SourceConfig {
  documents: boolean;
  ideas: boolean;
  memory: boolean;
  business: boolean;
  contacts: boolean;
}

function resolveSourceConfig(
  topic: string,
  type?: string,
  overrides?: Partial<SourceConfig>
): SourceConfig {
  const isBusinessType = type === 'report' || type === 'xlsx';
  const hasBusinessKeywords = BUSINESS_KEYWORDS.test(topic);
  const hasContactKeywords = CONTACT_KEYWORDS.test(topic);

  return {
    documents: overrides?.documents ?? true,
    ideas: overrides?.ideas ?? true,
    memory: overrides?.memory ?? true,
    business: overrides?.business ?? (isBusinessType || hasBusinessKeywords),
    contacts: overrides?.contacts ?? hasContactKeywords,
  };
}

async function searchDocuments(context: AIContext, topic: string): Promise<string[]> {
  try {
    const result = await Promise.race([
      queryContext(context, `
        SELECT id, title, COALESCE(summary, LEFT(content, 200)) as summary
        FROM documents
        WHERE to_tsvector('german', title || ' ' || COALESCE(content, ''))
              @@ plainto_tsquery('german', $1)
        ORDER BY updated_at DESC
        LIMIT 5
      `, [topic]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return (result as any).rows.map((r: any) =>
      `  - "${r.title}" — ${(r.summary || '').substring(0, 150)}`
    );
  } catch {
    return [];
  }
}

async function searchIdeas(context: AIContext, topic: string): Promise<string[]> {
  try {
    const result = await Promise.race([
      queryContext(context, `
        SELECT id, title, status, priority
        FROM ideas
        WHERE to_tsvector('german', title || ' ' || COALESCE(content, ''))
              @@ plainto_tsquery('german', $1)
        ORDER BY updated_at DESC
        LIMIT 10
      `, [topic]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return (result as any).rows.map((r: any) => {
      const meta = [r.status, r.priority].filter(Boolean).join(', ');
      return `  - "${r.title}"${meta ? ` (${meta})` : ''}`;
    });
  } catch {
    return [];
  }
}

async function recallMemories(context: AIContext, topic: string): Promise<string[]> {
  try {
    const result = await Promise.race([
      longTermMemory.retrieve(context, topic),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    const facts = (result as any)?.facts || [];
    return facts.slice(0, 5).map((f: any) =>
      `  - ${(f.fact || f.content || '').substring(0, 150)}`
    );
  } catch {
    return [];
  }
}

async function getBusinessContext(context: AIContext): Promise<string[]> {
  try {
    const result = await Promise.race([
      queryContext(context, `
        SELECT metric_name, metric_value, period
        FROM business_metrics
        ORDER BY created_at DESC
        LIMIT 10
      `, []),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return (result as any).rows.map((r: any) =>
      `  - ${r.metric_name}: ${r.metric_value}${r.period ? ` (${r.period})` : ''}`
    );
  } catch {
    return [];
  }
}

async function searchContacts(context: AIContext, topic: string): Promise<string[]> {
  try {
    const result = await Promise.race([
      queryContext(context, `
        SELECT id, name, company, role
        FROM contacts
        WHERE to_tsvector('german', name || ' ' || COALESCE(company, '') || ' ' || COALESCE(role, ''))
              @@ plainto_tsquery('german', $1)
        ORDER BY updated_at DESC
        LIMIT 5
      `, [topic]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return (result as any).rows.map((r: any) => {
      const meta = [r.company, r.role].filter(Boolean).join(', ');
      return `  - ${r.name}${meta ? ` (${meta})` : ''}`;
    });
  } catch {
    return [];
  }
}

function suggestOutline(topic: string, type?: string): string {
  if (type === 'pptx' || !type) {
    return [
      '', '💡 Empfohlene Gliederung (Präsentation):',
      '1. Titelfolie', '2. Agenda / Überblick',
      '3. Hauptteil — Kerninhalte aus den Quellen',
      '4. Daten & Metriken (falls verfügbar)',
      '5. Zusammenfassung & Ausblick', '6. Diskussion / Q&A',
    ].join('\n');
  }
  if (type === 'xlsx') {
    return [
      '', '💡 Empfohlene Struktur (Tabelle):',
      '1. Übersichts-Sheet mit Zusammenfassung',
      '2. Detail-Sheets nach Kategorie',
      '3. Diagramme (falls Daten vorhanden)',
    ].join('\n');
  }
  return [
    '', '💡 Empfohlene Gliederung (Bericht):',
    '1. Zusammenfassung / Executive Summary',
    '2. Kontext & Hintergrund',
    '3. Hauptteil — Ergebnisse aus den Quellen',
    '4. Fazit & Empfehlungen',
  ].join('\n');
}

export async function handlePrepareDocumentContext(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  const { topic, type } = args as { topic?: string; type?: string };
  let include_sources: Partial<SourceConfig> | undefined;
  if (typeof args.include_sources === 'string') {
    try { include_sources = JSON.parse(args.include_sources); } catch { /* ignore */ }
  } else if (typeof args.include_sources === 'object') {
    include_sources = args.include_sources as Partial<SourceConfig>;
  }

  if (!topic || (typeof topic === 'string' && topic.trim().length === 0)) {
    return 'Fehler: Der Parameter "topic" ist erforderlich.';
  }

  const sources = resolveSourceConfig(topic, type, include_sources);
  const context = ctx.aiContext;

  logger.info('Tool: prepare_document_context', { topic, type, sources, context });

  const [docsResult, ideasResult, memoryResult, businessResult, contactsResult] =
    await Promise.allSettled([
      sources.documents ? searchDocuments(context, topic) : Promise.resolve([]),
      sources.ideas ? searchIdeas(context, topic) : Promise.resolve([]),
      sources.memory ? recallMemories(context, topic) : Promise.resolve([]),
      sources.business ? getBusinessContext(context) : Promise.resolve([]),
      sources.contacts ? searchContacts(context, topic) : Promise.resolve([]),
    ]);

  const docs = docsResult.status === 'fulfilled' ? docsResult.value : [];
  const ideas = ideasResult.status === 'fulfilled' ? ideasResult.value : [];
  const memories = memoryResult.status === 'fulfilled' ? memoryResult.value : [];
  const business = businessResult.status === 'fulfilled' ? businessResult.value : [];
  const contacts = contactsResult.status === 'fulfilled' ? contactsResult.value : [];

  const typeLabel = type || 'Dokument';
  const sections: string[] = [
    `📋 Kontext für "${topic}" (Typ: ${typeLabel})`,
    '',
  ];

  if (docs.length > 0) {
    sections.push(`📄 Dokumente (${docs.length} gefunden):`);
    sections.push(...docs);
    sections.push('');
  }
  if (ideas.length > 0) {
    sections.push(`💡 Ideen (${ideas.length} gefunden):`);
    sections.push(...ideas);
    sections.push('');
  }
  if (memories.length > 0) {
    sections.push(`🧠 Erinnerungen:`);
    sections.push(...memories);
    sections.push('');
  }
  if (business.length > 0) {
    sections.push(`📊 Business-Metriken:`);
    sections.push(...business);
    sections.push('');
  }
  if (contacts.length > 0) {
    sections.push(`👤 Kontakte:`);
    sections.push(...contacts);
    sections.push('');
  }

  const totalSources = docs.length + ideas.length + memories.length + business.length + contacts.length;
  if (totalSources === 0) {
    sections.push('Keine relevanten Quellen gefunden. Du kannst trotzdem ein Dokument erstellen — beschreibe einfach den gewünschten Inhalt.');
  }

  sections.push(suggestOutline(topic, type));

  return sections.join('\n');
}
