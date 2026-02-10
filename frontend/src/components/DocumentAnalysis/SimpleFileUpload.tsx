/**
 * SimpleFileUpload Component
 *
 * Inline file upload with drag-and-drop support for DocumentAnalysis.
 *
 * @module components/DocumentAnalysis/SimpleFileUpload
 */

import { useState, useRef } from 'react';
import type { SimpleFileUploadProps } from './types';

export function SimpleFileUpload({ onFileSelect, selectedFile, disabled = false }: SimpleFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (selectedFile) {
    return (
      <div className="simple-file-selected">
        <span className="file-icon">{'\uD83D\uDCC4'}</span>
        <div className="file-info">
          <span className="file-name">{selectedFile.name}</span>
          <span className="file-size">{formatSize(selectedFile.size)}</span>
        </div>
        <button type="button" onClick={() => onFileSelect(null)} disabled={disabled}>{'\u2715'}</button>
      </div>
    );
  }

  return (
    <div
      className={`simple-file-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="visually-hidden"
        disabled={disabled}
        aria-label="Datei ausw\u00e4hlen"
      />
      <div className="dropzone-content">
        <span className="dropzone-icon">{'\uD83D\uDCC1'}</span>
        <p>Datei hierher ziehen oder klicken</p>
        <span className="dropzone-hint">PDF, Excel, CSV</span>
      </div>
    </div>
  );
}
