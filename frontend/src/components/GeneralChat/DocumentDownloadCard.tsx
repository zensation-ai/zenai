/**
 * DocumentDownloadCard — renders a download button for generated documents.
 *
 * Triggered by [[DOCUMENT_DOWNLOAD:id:filename:mimeType]] markers in
 * AI responses (inserted by the create_document tool handler).
 */

import React, { useState, useCallback } from 'react';
import axios from 'axios';

interface DocumentDownloadCardProps {
  documentId: string;
  filename: string;
  mimeType: string;
}

const ICON_MAP: Record<string, string> = {
  pptx: '📊',
  xlsx: '📈',
  pdf: '📄',
  docx: '📝',
};

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getTypeLabel(ext: string): string {
  switch (ext) {
    case 'pptx': return 'Präsentation';
    case 'xlsx': return 'Tabelle';
    case 'pdf': return 'PDF';
    case 'docx': return 'Word-Dokument';
    default: return 'Dokument';
  }
}

export const DocumentDownloadCard: React.FC<DocumentDownloadCardProps> = ({
  documentId,
  filename,
  mimeType,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ext = getExtension(filename);
  const icon = ICON_MAP[ext] || '📄';
  const typeLabel = getTypeLabel(ext);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const response = await axios.get(
        `/api/documents/${documentId}/download`,
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Download fehlgeschlagen. Das Dokument ist möglicherweise abgelaufen.');
    } finally {
      setDownloading(false);
    }
  }, [documentId, filename, mimeType]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl my-2 max-w-[400px] border border-[var(--border-color,#e2e8f0)] bg-[var(--card-bg,#f8fafc)]"
    >
      <span className="text-[28px] shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm overflow-hidden text-ellipsis whitespace-nowrap">
          {filename}
        </div>
        <div className="text-xs text-text-secondary">
          {typeLabel}
        </div>
        {error && (
          <div className="text-[11px] text-red-500 mt-1">
            {error}
          </div>
        )}
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Download ${filename}`}
        className="px-4 py-2 rounded-lg border-0 text-white font-semibold text-[13px] whitespace-nowrap shrink-0 transition-opacity duration-200 bg-[var(--primary-color,#1a73e8)] opacity-[var(--op)] [cursor:var(--cur)]"
        style={{ '--op': downloading ? 0.7 : 1, '--cur': downloading ? 'wait' : 'pointer' } as React.CSSProperties}
      >
        {downloading ? '...' : 'Download'}
      </button>
    </div>
  );
};
