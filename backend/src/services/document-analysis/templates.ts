/**
 * Document Analysis Templates & Constants
 */

import type { AnalysisTemplate, DocumentMediaType } from './types';

// ===========================================
// Analysis Templates
// ===========================================

export const ANALYSIS_TEMPLATES: Record<AnalysisTemplate, { system: string; instruction: string }> = {
  general: {
    system: `Du bist ein professioneller Dokumentanalytiker. Analysiere Dokumente gründlich und strukturiert.
Antworte in klar strukturiertem Markdown mit Überschriften, Listen und Tabellen wo passend.`,
    instruction: `Analysiere dieses Dokument umfassend:

1. **Zusammenfassung**: Worum geht es? (2-3 Sätze)
2. **Hauptinhalte**: Die wichtigsten Punkte und Informationen
3. **Schlüsseldaten**: Relevante Zahlen, Daten, Namen, Fakten
4. **Struktur**: Wie ist das Dokument aufgebaut?
5. **Auffälligkeiten**: Besonderheiten, Inkonsistenzen, fehlende Informationen

Formatiere deine Antwort in klarem Markdown.`,
  },

  financial: {
    system: `Du bist ein Finanzanalytiker. Analysiere Finanzdokumente und Tabellen mit Fokus auf KPIs, Trends und Auffälligkeiten.
Antworte strukturiert mit Markdown-Tabellen und klaren Kennzahlen.`,
    instruction: `Führe eine Finanzanalyse dieses Dokuments durch:

1. **Executive Summary**: Kernaussage in 2-3 Sätzen
2. **KPIs / Kennzahlen**: Alle relevanten Finanzkennzahlen als Tabelle
3. **Trends**: Erkennbare Entwicklungen und Veränderungen
4. **Vergleiche**: Periodenvergleiche, wenn Daten vorhanden
5. **Auffälligkeiten**: Ungewöhnliche Werte, Risiken, Chancen
6. **Empfehlungen**: Handlungsempfehlungen basierend auf den Daten

Nutze Markdown-Tabellen für Kennzahlen. Formatiere Währungsbeträge korrekt.`,
  },

  contract: {
    system: `Du bist ein Vertragsanalytiker. Analysiere Verträge und rechtliche Dokumente mit Fokus auf Schlüsselklauseln, Fristen und Risiken.
Antworte strukturiert und präzise.`,
    instruction: `Analysiere diesen Vertrag / dieses rechtliche Dokument:

1. **Übersicht**: Art des Dokuments, Vertragsparteien, Datum
2. **Kernvereinbarungen**: Hauptpflichten und Leistungen
3. **Fristen & Termine**: Alle relevanten Daten und Fristen
4. **Finanzielle Konditionen**: Beträge, Zahlungsbedingungen
5. **Schlüsselklauseln**: Wichtige vertragliche Regelungen
6. **Risiken & Hinweise**: Potenzielle Risiken, ungewöhnliche Klauseln
7. **Zusammenfassung**: Kernaussage in 2-3 Sätzen

Markiere besonders wichtige Punkte deutlich.`,
  },

  data: {
    system: `Du bist ein Datenanalytiker. Analysiere Datensätze und Tabellen mit statistischem Fokus.
Erstelle aussagekräftige Zusammenfassungen mit Kennzahlen und Mustern.`,
    instruction: `Analysiere diesen Datensatz:

1. **Datenübersicht**: Umfang, Spalten, Datentypen, Zeitraum
2. **Statistische Kennzahlen**: Min, Max, Durchschnitt, Median (als Tabelle)
3. **Verteilungen**: Wie sind die Daten verteilt?
4. **Muster & Trends**: Erkennbare Zusammenhänge und Entwicklungen
5. **Ausreißer**: Ungewöhnliche Datenpunkte
6. **Datenqualität**: Fehlende Werte, Inkonsistenzen
7. **Erkenntnisse**: Top 3-5 Insights aus den Daten

Nutze Markdown-Tabellen für statistische Kennzahlen.`,
  },

  summary: {
    system: `Du bist ein professioneller Zusammenfasser. Erstelle prägnante, informative Zusammenfassungen.`,
    instruction: `Erstelle eine strukturierte Zusammenfassung dieses Dokuments:

1. **Titel / Thema**: Worum geht es?
2. **Kernaussagen**: Die 3-5 wichtigsten Punkte
3. **Schlüsseldaten**: Relevante Zahlen und Fakten
4. **Fazit**: 2-3 Sätze Gesamtbewertung

Halte die Zusammenfassung prägnant und auf das Wesentliche fokussiert.`,
  },
};

// ===========================================
// Supported File Types
// ===========================================

export const SUPPORTED_MIME_TYPES: DocumentMediaType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

export const MIME_TYPE_LABELS: Record<DocumentMediaType, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
  'application/vnd.ms-excel': 'Excel (XLS)',
  'text/csv': 'CSV',
};

/** Magic number signatures for file type validation */
export const MAGIC_SIGNATURES: Record<string, Buffer[]> = {
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK (ZIP)
  ],
  'application/vnd.ms-excel': [
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0]), // OLE2
  ],
};

// ===========================================
// Prompt Cache Configuration
// ===========================================

/** Cache TTL: 5 minutes (matches Claude API prompt caching TTL) */
export const CACHE_TTL_MS = 5 * 60 * 1000;
/** Maximum cached documents */
export const MAX_CACHE_SIZE = 20;
