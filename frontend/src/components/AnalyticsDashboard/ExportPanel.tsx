/**
 * Phase 50: ExportPanel Component
 *
 * CSV and JSON export of current analytics metrics.
 */

import React, { useCallback } from 'react';

interface OverviewData {
  ideas: { total: number; created: number; completed: number; trend: number };
  tasks: { total: number; completed: number; inProgress: number; trend: number };
  chats: { total: number; messages: number; avgDuration: number; trend: number };
  documents: { total: number; uploaded: number; trend: number };
}

interface ExportPanelProps {
  overview: OverviewData | null;
  dateRange: { from: string; to: string };
  context: string;
}

function buildCSV(overview: OverviewData, dateRange: { from: string; to: string }, context: string): string {
  const lines: string[] = [
    'Kategorie,Metrik,Wert,Trend (%)',
    `Zeitraum,Von,${dateRange.from},`,
    `Zeitraum,Bis,${dateRange.to},`,
    `Kontext,,${context},`,
    '',
    `Gedanken,Gesamt,${overview.ideas.total},`,
    `Gedanken,Erstellt,${overview.ideas.created},${overview.ideas.trend}`,
    `Gedanken,Abgeschlossen,${overview.ideas.completed},`,
    '',
    `Aufgaben,Gesamt,${overview.tasks.total},`,
    `Aufgaben,Abgeschlossen,${overview.tasks.completed},${overview.tasks.trend}`,
    `Aufgaben,In Bearbeitung,${overview.tasks.inProgress},`,
    '',
    `Chats,Gesamt,${overview.chats.total},${overview.chats.trend}`,
    `Chats,Nachrichten,${overview.chats.messages},`,
    `Chats,Durchschn. Dauer (min),${overview.chats.avgDuration.toFixed(1)},`,
    '',
    `Dokumente,Gesamt,${overview.documents.total},`,
    `Dokumente,Hochgeladen,${overview.documents.uploaded},${overview.documents.trend}`,
  ];

  return lines.join('\n');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ overview, dateRange, context }) => {
  const handleCSVExport = useCallback(() => {
    if (!overview) return;

    const csv = buildCSV(overview, dateRange, context);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `analytics_${context}_${dateRange.from}_${dateRange.to}.csv`);
  }, [overview, dateRange, context]);

  const handleJSONExport = useCallback(() => {
    if (!overview) return;

    const exportData = {
      context,
      dateRange,
      exportedAt: new Date().toISOString(),
      data: overview,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    triggerDownload(blob, `analytics_${context}_${dateRange.from}_${dateRange.to}.json`);
  }, [overview, dateRange, context]);

  return (
    <div className="av2-export-panel">
      <h4 className="av2-export-title">Daten exportieren</h4>
      <p className="av2-export-desc">
        Exportiere die aktuellen Analytics-Daten als CSV- oder JSON-Datei.
        Der Export umfasst alle Metriken des ausgewaehlten Zeitraums.
      </p>
      <div className="av2-export-info">
        <span className="av2-export-range">
          Zeitraum: {dateRange.from} bis {dateRange.to}
        </span>
        <span className="av2-export-context">
          Kontext: {context}
        </span>
      </div>
      <div className="av2-export-buttons">
        <button
          type="button"
          className="av2-export-btn"
          onClick={handleCSVExport}
          disabled={!overview}
        >
          CSV herunterladen
        </button>
        <button
          type="button"
          className="av2-export-btn av2-export-btn-secondary"
          onClick={handleJSONExport}
          disabled={!overview}
        >
          JSON herunterladen
        </button>
      </div>
    </div>
  );
};
