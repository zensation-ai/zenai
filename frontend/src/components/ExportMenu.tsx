import { useState, useRef, useCallback } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { showToast } from './Toast';
import { useDropdownClose } from '../hooks/useClickOutside';
import { logError } from '../utils/errors';

interface ExportMenuProps {
  context: AIContext;
  ideasCount: number;
}

type ExportFormat = 'pdf' | 'markdown' | 'csv' | 'json' | 'backup';

interface ExportOption {
  format: ExportFormat;
  label: string;
  icon: string;
  description: string;
  endpoint: string;
  mimeType: string;
  extension: string;
}

const exportOptions: ExportOption[] = [
  {
    format: 'pdf',
    label: 'PDF Report',
    icon: '📄',
    description: 'Professioneller Bericht mit Formatierung',
    endpoint: '/api/export/ideas/pdf',
    mimeType: 'application/pdf',
    extension: 'pdf',
  },
  {
    format: 'markdown',
    label: 'Markdown',
    icon: '📝',
    description: 'Kompatibel mit Obsidian, Notion',
    endpoint: '/api/export/ideas/markdown',
    mimeType: 'text/markdown',
    extension: 'md',
  },
  {
    format: 'csv',
    label: 'CSV / Excel',
    icon: '📊',
    description: 'Tabellenkalkulation & Analyse',
    endpoint: '/api/export/ideas/csv',
    mimeType: 'text/csv',
    extension: 'csv',
  },
  {
    format: 'json',
    label: 'JSON',
    icon: '🔧',
    description: 'Strukturiertes Datenformat',
    endpoint: '/api/export/ideas/json',
    mimeType: 'application/json',
    extension: 'json',
  },
  {
    format: 'backup',
    label: 'Vollst. Backup',
    icon: '💾',
    description: 'Alle Daten inkl. Meetings & Clusters',
    endpoint: '/api/export/backup',
    mimeType: 'application/json',
    extension: 'json',
  },
];

export function ExportMenu({ context, ideasCount }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Close on outside click and escape
  useDropdownClose(menuRef, () => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, isOpen);

  // Keyboard navigation for export options
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || isExporting) return;

    const itemCount = exportOptions.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev < itemCount - 1 ? prev + 1 : 0;
          optionRefs.current[next]?.focus();
          return next;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev > 0 ? prev - 1 : itemCount - 1;
          optionRefs.current[next]?.focus();
          return next;
        });
        break;

      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        optionRefs.current[0]?.focus();
        break;

      case 'End':
        e.preventDefault();
        setFocusedIndex(itemCount - 1);
        optionRefs.current[itemCount - 1]?.focus();
        break;
    }
  }, [isOpen, isExporting]);

  const handleExport = async (option: ExportOption) => {
    setIsExporting(true);

    try {
      const params = new URLSearchParams();
      params.append('context', context);
      if (includeArchived && option.format !== 'backup') {
        params.append('includeArchived', 'true');
      }

      const response = await axios.get(`${option.endpoint}?${params.toString()}`, {
        responseType: 'blob',
        headers: {
          'X-AI-Context': context,
        },
      });

      // Create download link
      const blob = new Blob([response.data], { type: option.mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename =
        option.format === 'backup'
          ? `brain-backup-${context}-${timestamp}.${option.extension}`
          : `ideas-${context}-${timestamp}.${option.extension}`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast(`Export als ${option.label} erfolgreich!`, 'success');
      setIsOpen(false);
    } catch (error) {
      logError('ExportMenu:exportData', error);
      showToast('Export fehlgeschlagen', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        type="button"
        className="export-button nav-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        title="Exportieren"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Export-Menü öffnen"
      >
        {isExporting ? (
          <span className="loading-spinner small" aria-hidden="true" />
        ) : (
          <>
            <span aria-hidden="true">📤</span> Export
          </>
        )}
      </button>

      {isOpen && (
        <div
          className="export-dropdown"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-menu-title"
          onKeyDown={handleKeyDown}
        >
          <div className="export-header">
            <h3 id="export-menu-title">Exportieren</h3>
            <span className="export-context" aria-label={`Aktueller Kontext: ${context}`}>
              <span aria-hidden="true">{context === 'personal' ? '🏠' : '💼'}</span> {context}
            </span>
          </div>

          <div className="export-info" aria-live="polite">
            <span>{ideasCount} Ideas</span>
          </div>

          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              aria-describedby="include-archived-desc"
            />
            <span id="include-archived-desc">Archivierte einschließen</span>
          </label>

          <div className="export-options" role="group" aria-label="Export-Formate">
            {exportOptions.map((option, index) => (
              <button
                key={option.format}
                ref={(el) => { optionRefs.current[index] = el; }}
                type="button"
                className={`export-option ${focusedIndex === index ? 'focused' : ''}`}
                onClick={() => handleExport(option)}
                onFocus={() => setFocusedIndex(index)}
                disabled={isExporting}
                tabIndex={focusedIndex === index || (focusedIndex === -1 && index === 0) ? 0 : -1}
                aria-label={`${option.label}: ${option.description}`}
              >
                <span className="export-option-icon" aria-hidden="true">{option.icon}</span>
                <div className="export-option-content">
                  <span className="export-option-label">{option.label}</span>
                  <span className="export-option-desc">{option.description}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="export-footer">
            <button
              type="button"
              className="export-cancel"
              onClick={() => setIsOpen(false)}
              aria-label="Export-Menü schließen"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
