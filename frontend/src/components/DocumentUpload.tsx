/**
 * DocumentUpload Component
 *
 * Drag-and-drop document upload supporting PDF, Excel, and CSV files.
 * Based on the existing ImageUpload component pattern.
 *
 * Features:
 * - Drag & drop support
 * - Click to upload
 * - File type icon display
 * - File size and type validation
 * - Single file per upload
 *
 * @module components/DocumentUpload
 */

import { useState, useCallback, useRef } from 'react';

interface DocumentUploadProps {
  /** Called when a file is selected */
  onFileSelect: (file: File | null) => void;
  /** Maximum file size in MB (default: 32) */
  maxSizeMB?: number;
  /** Currently selected file */
  selectedFile?: File | null;
  /** Disabled state */
  disabled?: boolean;
}

const ACCEPTED_FORMATS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
  'application/vnd.ms-excel': 'Excel (XLS)',
  'text/csv': 'CSV',
};

const ACCEPT_STRING = Object.keys(ACCEPTED_FORMATS).join(',') + ',.pdf,.xlsx,.xls,.csv';

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'excel';
  if (mimeType === 'text/csv') return 'csv';
  return 'file';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload({
  onFileSelect,
  maxSizeMB = 32,
  selectedFile = null,
  disabled = false,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const isAccepted = Object.keys(ACCEPTED_FORMATS).includes(file.type) ||
      /\.(pdf|xlsx|xls|csv)$/i.test(file.name);

    if (!isAccepted) {
      return `Nicht unterstütztes Format. Bitte PDF, Excel oder CSV verwenden.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `Datei zu groß (${formatFileSize(file.size)}). Maximum: ${maxSizeMB}MB.`;
    }
    return null;
  };

  const processFile = useCallback((file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    onFileSelect(file);
  }, [onFileSelect, maxSizeMB]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [disabled, processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    e.target.value = '';
  }, [processFile]);

  const removeFile = useCallback(() => {
    onFileSelect(null);
    setError(null);
  }, [onFileSelect]);

  const openFilePicker = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // File selected state
  if (selectedFile) {
    const icon = getFileIcon(selectedFile.type);

    return (
      <div className="doc-upload-selected">
        <div className="doc-upload-file-info">
          <div className={`doc-upload-file-icon doc-icon-${icon}`}>
            {icon === 'pdf' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 15h6" />
                <path d="M9 11h6" />
              </svg>
            )}
            {(icon === 'excel' || icon === 'csv') && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <rect x="8" y="12" width="8" height="6" rx="1" />
                <line x1="12" y1="12" x2="12" y2="18" />
                <line x1="8" y1="15" x2="16" y2="15" />
              </svg>
            )}
            {icon === 'file' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
          </div>
          <div className="doc-upload-file-meta">
            <span className="doc-upload-filename">
              {selectedFile.name.length > 40
                ? selectedFile.name.substring(0, 37) + '...'
                : selectedFile.name}
            </span>
            <span className="doc-upload-filesize">
              {formatFileSize(selectedFile.size)} &middot; {ACCEPTED_FORMATS[selectedFile.type] || 'Dokument'}
            </span>
          </div>
          <button
            type="button"
            className="doc-upload-remove"
            onClick={removeFile}
            aria-label="Datei entfernen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Drop zone state
  return (
    <div className="doc-upload">
      <div
        className={`doc-upload-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFilePicker}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Dokument hochladen - Klicken oder ziehen"
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            openFilePicker();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_STRING}
          onChange={handleFileChange}
          className="doc-upload-input-hidden"
          aria-hidden="true"
        />

        <div className="doc-upload-content">
          <div className="doc-upload-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="doc-upload-text">
            {isDragging
              ? 'Hier ablegen...'
              : 'Dokument hier ablegen oder klicken'}
          </p>
          <span className="doc-upload-hint">
            PDF, Excel (XLSX/XLS), CSV &middot; max {maxSizeMB}MB
          </span>
        </div>
      </div>

      {error && (
        <div className="doc-upload-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;
