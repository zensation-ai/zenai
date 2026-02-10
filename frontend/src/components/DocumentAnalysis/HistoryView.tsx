/**
 * HistoryView Component
 *
 * Displays analysis history with load and delete actions.
 *
 * @module components/DocumentAnalysis/HistoryView
 */

import type { HistoryEntry } from './types';

interface HistoryViewProps {
  history: HistoryEntry[];
  isLoadingHistory: boolean;
  historyTotal: number;
  onLoadEntry: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  formatDate: (dateStr: string) => string;
  formatFileSize: (bytes: number) => string;
}

export function HistoryView({
  history,
  isLoadingHistory,
  historyTotal,
  onLoadEntry,
  onDeleteEntry,
  formatDate,
  formatFileSize,
}: HistoryViewProps) {
  return (
    <section className="doc-analysis-history">
      <h2>Analyse-Historie</h2>
      {isLoadingHistory ? (
        <div className="doc-analysis-progress">
          <div className="doc-analysis-progress-inner">
            <span className="doc-analysis-spinner large" />
            <p>Historie wird geladen...</p>
          </div>
        </div>
      ) : history.length === 0 ? (
        <div className="doc-history-empty">
          <p>Keine bisherigen Analysen vorhanden.</p>
        </div>
      ) : (
        <>
          <p className="doc-history-count">{historyTotal} Analysen gespeichert</p>
          <div className="doc-history-list">
            {history.map((entry) => (
              <div key={entry.id} className="doc-history-item">
                <div className="doc-history-item-info">
                  <span className="doc-history-filename">{entry.filename}</span>
                  <div className="doc-history-meta">
                    <span className="doc-result-tag">{entry.fileType}</span>
                    <span className="doc-result-tag secondary">{entry.analysisType}</span>
                    <span className="doc-result-meta-item">{formatFileSize(entry.fileSize)}</span>
                    {entry.tokenUsage && (
                      <span className="doc-result-meta-item">
                        {entry.tokenUsage.input + entry.tokenUsage.output} Tokens
                      </span>
                    )}
                    <span className="doc-result-meta-item">{formatDate(entry.createdAt)}</span>
                  </div>
                </div>
                <div className="doc-history-item-actions">
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={() => onLoadEntry(entry.id)}
                  >
                    {'\u00d6ffnen'}
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn doc-action-delete"
                    onClick={() => onDeleteEntry(entry.id)}
                  >
                    L{'\u00f6'}schen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
