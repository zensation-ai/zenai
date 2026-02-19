import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { ExportMenu } from './ExportMenu';
import type { AIContext } from './ContextSwitcher';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { logError } from '../utils/errors';
import '../neurodesign.css';
import './ExportDashboard.css';

interface ExportHistory {
  id: string;
  format: string;
  filename: string;
  size: number;
  created_at: string;
}

interface ExportDashboardProps {
  onBack: () => void;
  context: AIContext;
  embedded?: boolean;
}

export function ExportDashboard({ onBack, context, embedded }: ExportDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [activeTab, setActiveTab] = useState<'export' | 'history' | 'backup'>('export');
  const [loading, setLoading] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistory[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('json');
  const [selectedContent, setSelectedContent] = useState<string[]>(['ideas']);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [ideasCount, setIdeasCount] = useState(0);

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadExportHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await axios.get('/api/export/history', { params: { context }, signal });
      setExportHistory(res.data.exports || []);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      logError('ExportDashboard:loadHistory', err);
    }
  }, [context]);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`/api/${context}/ideas?limit=1`, { signal: controller.signal })
      .then(res => {
        setIdeasCount(res.data.pagination?.total ?? res.data.ideas?.length ?? 0);
      })
      .catch(() => { /* ignore */ });
    return () => controller.abort();
  }, [context]);

  useEffect(() => {
    if (activeTab === 'history') {
      // Abort any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      loadExportHistory(abortControllerRef.current.signal);
    }

    // Cleanup on unmount
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [activeTab, loadExportHistory]);

  const handleExport = async () => {
    if (selectedContent.length === 0) {
      showToast('Bitte wähle mindestens einen Inhaltstyp aus', 'error');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        format: selectedFormat,
        content: selectedContent.join(','),
        context,
      });

      if (dateRange.from) params.append('from', dateRange.from);
      if (dateRange.to) params.append('to', dateRange.to);

      const response = await axios.get(`/api/export/data?${params}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const extension = selectedFormat === 'markdown' ? 'md' : selectedFormat;
      link.setAttribute('download', `ai-brain-export-${new Date().toISOString().split('T')[0]}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showToast('Export erfolgreich!', 'success');
      loadExportHistory();
    } catch (err) {
      logError('ExportDashboard:export', err);
      showToast('Export fehlgeschlagen', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFullBackup = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/export/backup', {
        params: { context },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ai-brain-backup-${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showToast('Backup erstellt!', 'success');
    } catch (err) {
      logError('ExportDashboard:backup', err);
      showToast('Backup fehlgeschlagen', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleContent = (content: string) => {
    setSelectedContent(prev =>
      prev.includes(content)
        ? prev.filter(c => c !== content)
        : [...prev, content]
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="export-dashboard neuro-page-enter">
      {!embedded && (
        <div className="export-header liquid-glass-nav">
          <button className="back-button neuro-hover-lift" onClick={onBack} type="button">
            ← Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Export Center</h1>
            <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <ExportMenu context={context as AIContext} ideasCount={ideasCount} />
        </div>
      )}

      <div className="export-tabs">
        <button
          className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          📤 Export
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📋 Verlauf
        </button>
        <button
          className={`tab-btn ${activeTab === 'backup' ? 'active' : ''}`}
          onClick={() => setActiveTab('backup')}
        >
          💾 Backup
        </button>
      </div>

      {activeTab === 'export' && (
        <div className="export-content">
          <div className="export-section liquid-glass neuro-stagger-item">
            <h3>Format auswählen</h3>
            <div className="format-options neuro-flow-list">
              {[
                { id: 'json', label: 'JSON', icon: '📄', desc: 'Strukturierte Daten' },
                { id: 'csv', label: 'CSV', icon: '📊', desc: 'Tabellenformat' },
                { id: 'markdown', label: 'Markdown', icon: '📝', desc: 'Lesbar & formatiert' },
                { id: 'pdf', label: 'PDF', icon: '📑', desc: 'Druckfertig' },
              ].map((format, index) => (
                <button
                  key={format.id}
                  className={`format-option neuro-hover-lift neuro-stagger-item ${selectedFormat === format.id ? 'active' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => setSelectedFormat(format.id)}
                >
                  <span className="format-icon">{format.icon}</span>
                  <span className="format-label">{format.label}</span>
                  <span className="format-desc">{format.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="export-section liquid-glass neuro-stagger-item">
            <h3>Inhalte auswählen</h3>
            <div className="content-options neuro-flow-list">
              {[
                { id: 'ideas', label: 'Ideen', icon: '💡' },
                { id: 'meetings', label: 'Meetings', icon: '📅' },
                { id: 'incubator', label: 'Inkubator', icon: '🧠' },
                { id: 'learning-tasks', label: 'Lernziele', icon: '📚' },
                { id: 'media', label: 'Medien', icon: '🖼️' },
                { id: 'automations', label: 'Automationen', icon: '⚡' },
              ].map((content, index) => (
                <button
                  key={content.id}
                  className={`content-option neuro-hover-lift neuro-stagger-item ${selectedContent.includes(content.id) ? 'active' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => toggleContent(content.id)}
                >
                  <span className="content-icon">{content.icon}</span>
                  <span className="content-label">{content.label}</span>
                  {selectedContent.includes(content.id) && (
                    <span className="check-mark">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="export-section liquid-glass neuro-stagger-item">
            <h3>Zeitraum (optional)</h3>
            <div className="date-range">
              <div className="date-input">
                <label>Von</label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div className="date-input">
                <label>Bis</label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <button
            className="export-btn primary neuro-button neuro-stagger-item"
            onClick={handleExport}
            disabled={loading || selectedContent.length === 0}
          >
            {loading ? (
              <>
                <span className="loading-spinner" />
                Exportiere...
              </>
            ) : (
              <>📤 Jetzt exportieren</>
            )}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-content">
          {exportHistory.length === 0 ? (
            <div className="empty-state neuro-empty-state">
              <span className="neuro-empty-icon">📋</span>
              <h3 className="neuro-empty-title">Noch keine Exports</h3>
              <p className="neuro-empty-description">Deine Export-Historie erscheint hier.</p>
            </div>
          ) : (
            <div className="history-list neuro-flow-list">
              {exportHistory.slice(0, 7).map((item, index) => (
                <div key={item.id} className="history-item liquid-glass neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="history-icon">
                    {item.format === 'json' && '📄'}
                    {item.format === 'csv' && '📊'}
                    {item.format === 'markdown' && '📝'}
                    {item.format === 'pdf' && '📑'}
                  </div>
                  <div className="history-info">
                    <span className="history-filename">{item.filename}</span>
                    <span className="history-meta">
                      {formatDate(item.created_at)} • {formatFileSize(item.size)}
                    </span>
                  </div>
                  <span className="history-format-badge" title={`Format: ${item.format.toUpperCase()}`}>
                    {item.format.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="backup-content">
          <div className="backup-card liquid-glass neuro-stagger-item">
            <div className="backup-icon neuro-breathing">💾</div>
            <h3>Vollständiges Backup</h3>
            <p>
              Erstelle ein komplettes Backup aller deiner Daten inkl. Medien,
              Einstellungen und AI-Lernfortschritt.
            </p>
            <ul className="backup-includes neuro-flow-list">
              <li className="neuro-stagger-item">✓ Alle Ideen und Meetings</li>
              <li className="neuro-stagger-item">✓ Inkubator & Lernziele</li>
              <li className="neuro-stagger-item">✓ Hochgeladene Medien</li>
              <li className="neuro-stagger-item">✓ Automationen & Einstellungen</li>
              <li className="neuro-stagger-item">✓ AI Personalisierung</li>
            </ul>
            <button
              className="backup-btn neuro-button"
              onClick={handleFullBackup}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner" />
                  Erstelle Backup...
                </>
              ) : (
                <>💾 Backup erstellen</>
              )}
            </button>
          </div>

          <div className="backup-info liquid-glass neuro-stagger-item">
            <h4>📌 Hinweis</h4>
            <p>
              Backups werden als ZIP-Datei heruntergeladen und konnen jederzeit
              wiederhergestellt werden. Wir empfehlen regelmaige Backups.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
