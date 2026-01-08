import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { showToast } from './Toast';

interface ExportMenuProps {
  context: 'personal' | 'work';
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
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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
      console.error('Export failed:', error);
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
      >
        {isExporting ? (
          <span className="loading-spinner small" />
        ) : (
          <>
            📤 Export
          </>
        )}
      </button>

      {isOpen && (
        <div className="export-dropdown">
          <div className="export-header">
            <h3>Exportieren</h3>
            <span className="export-context">
              {context === 'personal' ? '🏠' : '💼'} {context}
            </span>
          </div>

          <div className="export-info">
            <span>{ideasCount} Ideas</span>
          </div>

          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <span>Archivierte einschließen</span>
          </label>

          <div className="export-options">
            {exportOptions.map((option) => (
              <button
                key={option.format}
                type="button"
                className="export-option"
                onClick={() => handleExport(option)}
                disabled={isExporting}
              >
                <span className="export-option-icon">{option.icon}</span>
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
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
