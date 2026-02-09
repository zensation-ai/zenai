/**
 * Document Upload Component
 *
 * Drag-and-drop file upload for the Document Vault.
 * Supports multiple files, progress tracking, and validation.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  DocumentUploadResult,
  formatFileSize,
  getFileTypeLabel,
} from '../types/document';
import './DocumentUpload.css';

interface DocumentUploadProps {
  onUploadComplete: (result: DocumentUploadResult) => void;
  context: string;
  folderPath?: string;
  tags?: string[];
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  compact?: boolean;
}

interface SelectedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

// Supported MIME types
const ACCEPTED_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  // Presentations
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/markdown',
  'text/html',
  // Code
  'application/json',
  'application/javascript',
  'text/javascript',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // E-Books
  'application/epub+zip',
];

export function DocumentUpload({
  onUploadComplete,
  context,
  folderPath = '/inbox',
  tags = [],
  maxFiles = 10,
  maxSizeMB = 100,
  disabled = false,
  compact = false,
}: DocumentUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith('text/')) {
      return `Dateityp nicht unterstützt: ${file.type || 'unbekannt'}`;
    }

    if (file.size > maxSizeBytes) {
      return `Datei zu groß (max. ${maxSizeMB} MB)`;
    }

    return null;
  }, [maxSizeBytes, maxSizeMB]);

  // Process selected files
  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newFiles: SelectedFile[] = [];

    for (const file of fileArray.slice(0, maxFiles - selectedFiles.length)) {
      const error = validateFile(file);

      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: error ? 'error' : 'pending',
        progress: 0,
        error: error || undefined,
      });
    }

    setSelectedFiles(prev => [...prev, ...newFiles]);
  }, [maxFiles, selectedFiles.length, validateFile]);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
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
      processFiles(files);
    }
  }, [disabled, processFiles]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processFiles]);

  // Remove file from selection
  const removeFile = useCallback((id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  // Upload files
  const uploadFiles = useCallback(async () => {
    const pendingFiles = selectedFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    const formData = new FormData();
    pendingFiles.forEach(f => {
      formData.append('files', f.file);
    });
    formData.append('folderPath', folderPath);
    formData.append('tags', JSON.stringify(tags));

    // Mark files as uploading
    setSelectedFiles(prev =>
      prev.map(f =>
        f.status === 'pending' ? { ...f, status: 'uploading' as const, progress: 0 } : f
      )
    );

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/${context}/documents`,
        {
          method: 'POST',
          headers: {
            'X-API-Key': import.meta.env.VITE_API_KEY || '',
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (result.success) {
        // Mark files as success or error
        setSelectedFiles(prev =>
          prev.map(f => {
            if (f.status === 'uploading') {
              const failed = result.data.failed.find(
                (err: { filename: string }) => err.filename === f.file.name
              );
              if (failed) {
                return { ...f, status: 'error' as const, error: failed.error, progress: 100 };
              }
              return { ...f, status: 'success' as const, progress: 100 };
            }
            return f;
          })
        );

        onUploadComplete(result.data);
      } else {
        throw new Error(result.error?.message || 'Upload fehlgeschlagen');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';

      setSelectedFiles(prev =>
        prev.map(f =>
          f.status === 'uploading'
            ? { ...f, status: 'error' as const, error: errorMessage, progress: 0 }
            : f
        )
      );
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles, context, folderPath, tags, onUploadComplete]);

  // Render compact mode
  if (compact) {
    return (
      <div className="document-upload-compact">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileInputChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          className="document-upload-button neuro-hover-lift"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <span className="icon">📄</span>
          <span>Dokumente hochladen</span>
        </button>

        {selectedFiles.length > 0 && (
          <div className="document-upload-compact-list">
            {selectedFiles.map(f => (
              <div key={f.id} className={`compact-file-item status-${f.status}`}>
                <span className="file-name">{f.file.name}</span>
                <span className="file-status">
                  {f.status === 'uploading' && '⏳'}
                  {f.status === 'success' && '✅'}
                  {f.status === 'error' && '❌'}
                </span>
              </div>
            ))}

            {selectedFiles.some(f => f.status === 'pending') && (
              <button
                type="button"
                className="upload-action-button"
                onClick={uploadFiles}
                disabled={isUploading}
              >
                Hochladen
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Render full mode
  return (
    <div className="document-upload">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFileInputChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />

      {/* Dropzone */}
      <div
        className={`document-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            fileInputRef.current?.click();
          }
        }}
        aria-label="Dokumente hochladen per Drag & Drop oder Klick"
      >
        <div className="dropzone-content">
          <div className="dropzone-icon">📁</div>
          <div className="dropzone-text">
            <p className="primary">Dateien hierher ziehen</p>
            <p className="secondary">oder klicken zum Auswählen</p>
          </div>
          <div className="dropzone-info">
            <span>Max. {maxFiles} Dateien</span>
            <span>•</span>
            <span>Max. {maxSizeMB} MB pro Datei</span>
          </div>
        </div>
      </div>

      {/* File List */}
      {selectedFiles.length > 0 && (
        <div className="document-file-list">
          <div className="file-list-header">
            <span>{selectedFiles.length} Datei(en) ausgewählt</span>
            <button type="button" className="clear-button" onClick={clearFiles}>
              Alle entfernen
            </button>
          </div>

          <div className="file-list-items">
            {selectedFiles.map(f => (
              <div key={f.id} className={`file-item status-${f.status}`}>
                <div className="file-icon">
                  {f.status === 'uploading' && <span className="spinner" />}
                  {f.status === 'success' && <span className="success-icon">✓</span>}
                  {f.status === 'error' && <span className="error-icon">✕</span>}
                  {f.status === 'pending' && <span>📄</span>}
                </div>

                <div className="file-info">
                  <span className="file-name">{f.file.name}</span>
                  <span className="file-meta">
                    {getFileTypeLabel(f.file.type)} • {formatFileSize(f.file.size)}
                  </span>
                  {f.error && <span className="file-error">{f.error}</span>}
                </div>

                {f.status === 'uploading' && (
                  <div className="file-progress">
                    <div className="progress-bar" style={{ width: `${f.progress}%` }} />
                  </div>
                )}

                <button
                  type="button"
                  className="remove-button"
                  onClick={() => removeFile(f.id)}
                  disabled={f.status === 'uploading'}
                  aria-label={`${f.file.name} entfernen`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Upload Button */}
          {selectedFiles.some(f => f.status === 'pending') && (
            <div className="file-list-actions">
              <button
                type="button"
                className="upload-button neuro-hover-lift"
                onClick={uploadFiles}
                disabled={isUploading}
              >
                {isUploading ? 'Wird hochgeladen...' : `${selectedFiles.filter(f => f.status === 'pending').length} Datei(en) hochladen`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;
