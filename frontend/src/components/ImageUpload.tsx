/**
 * ImageUpload Component
 *
 * Professional drag-and-drop image upload with preview functionality.
 * Supports multiple images for chat integration.
 *
 * Features:
 * - Drag & drop support
 * - Click to upload
 * - Image preview with remove option
 * - Multiple image support (up to 5)
 * - File size validation (10MB max)
 * - Format validation (JPEG, PNG, GIF, WebP)
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import './ImageUpload.css';

interface SelectedImage {
  id: string;
  file: File;
  preview: string;
}

interface ImageUploadProps {
  /** Called when images change */
  onImagesChange: (images: File[]) => void;
  /** Maximum number of images (default: 5) */
  maxImages?: number;
  /** Maximum file size in MB (default: 10) */
  maxSizeMB?: number;
  /** Currently selected images */
  images?: File[];
  /** Disabled state */
  disabled?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
}

const ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function ImageUpload({
  onImagesChange,
  maxImages = 5,
  maxSizeMB = 10,
  images = [],
  disabled = false,
  compact = false,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Map<File, string>>(new Map());

  // Build SelectedImage[] from the images prop, reusing existing preview URLs
  const selectedImages = useMemo(() => {
    const oldMap = previewUrlsRef.current;
    const newMap = new Map<File, string>();

    const result: SelectedImage[] = images.map((file, index) => {
      let preview = oldMap.get(file);
      if (!preview) {
        preview = URL.createObjectURL(file);
      }
      newMap.set(file, preview);
      return {
        id: `img-${index}-${file.name}`,
        file,
        preview,
      };
    });

    // Revoke preview URLs for files no longer in the list
    for (const [file, url] of oldMap) {
      if (!newMap.has(file)) {
        URL.revokeObjectURL(url);
      }
    }

    previewUrlsRef.current = newMap;
    return result;
  }, [images]);

  /**
   * Validate file
   */
  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      const format = file.type.split('/')[1] || 'unbekannt';
      return `Oops! ${format.toUpperCase()} funktioniert leider nicht. Versuch JPEG, PNG, GIF oder WebP.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `Das Bild ist etwas zu groß (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximal ${maxSizeMB}MB sind möglich.`;
    }
    return null;
  };

  /**
   * Process selected files
   * Properly cleans up object URLs on validation errors to prevent memory leaks
   */
  const processFiles = useCallback((files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);

    // Check total count
    if (images.length + fileArray.length > maxImages) {
      setError(`Du kannst maximal ${maxImages} Bilder gleichzeitig hochladen.`);
      return;
    }

    const validFiles: File[] = [];

    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return; // Stop processing on first error
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onImagesChange([...images, ...validFiles]);
    }
  }, [images, maxImages, maxSizeMB, onImagesChange]);

  /**
   * Handle drag events
   */
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
      processFiles(files);
    }
  }, [disabled, processFiles]);

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    // Reset input to allow selecting same file again
    e.target.value = '';
  }, [processFiles]);

  /**
   * Remove an image
   */
  const removeImage = useCallback((id: string) => {
    const img = selectedImages.find(i => i.id === id);
    if (img) {
      onImagesChange(images.filter(f => f !== img.file));
    }
    setError(null);
  }, [selectedImages, images, onImagesChange]);

  /**
   * Clear all images
   */
  const clearAll = useCallback(() => {
    onImagesChange([]);
    setError(null);
  }, [onImagesChange]);

  /**
   * Trigger file input click
   */
  const openFilePicker = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Compact mode - just the button
  if (compact) {
    return (
      <div className="image-upload-compact">
        <button
          type="button"
          className="image-upload-button"
          onClick={openFilePicker}
          disabled={disabled || images.length >= maxImages}
          title="Bild hinzufügen"
          aria-label="Bild hinzufügen"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21,15 16,10 5,21" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS.join(',')}
          multiple={maxImages > 1}
          onChange={handleFileChange}
          className="image-upload-input-hidden"
          aria-hidden="true"
        />

        {selectedImages.length > 0 && (
          <div className="image-upload-preview-strip">
            {selectedImages.map(img => (
              <div key={img.id} className="image-upload-preview-mini">
                <img src={img.preview} alt="Vorschau" />
                <button
                  type="button"
                  className="image-upload-remove-mini"
                  onClick={() => removeImage(img.id)}
                  aria-label="Bild entfernen"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full mode - dropzone with previews
  return (
    <div className="image-upload">
      <div
        className={`image-upload-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFilePicker}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Bilder hochladen - Klicken oder ziehen"
        onKeyDown={(e) => {
          // Support both Enter and Space keys for accessibility (WCAG)
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            openFilePicker();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS.join(',')}
          multiple={maxImages > 1}
          onChange={handleFileChange}
          className="image-upload-input-hidden"
          aria-hidden="true"
        />

        <div className="image-upload-content">
          <div className="image-upload-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="image-upload-text">
            {isDragging
              ? 'Hier ablegen...'
              : 'Bilder hier ablegen oder klicken'}
          </p>
          <span className="image-upload-hint">
            JPEG, PNG, GIF, WebP - max {maxSizeMB}MB
          </span>
        </div>
      </div>

      {error && (
        <div className="image-upload-error" role="alert">
          {error}
        </div>
      )}

      {selectedImages.length > 0 && (
        <div className="image-upload-previews">
          <div className="image-upload-preview-header">
            <span>{selectedImages.length} Bild{selectedImages.length > 1 ? 'er' : ''} ausgewählt</span>
            <button
              type="button"
              className="image-upload-clear"
              onClick={clearAll}
              aria-label="Alle Bilder entfernen"
            >
              Alle entfernen
            </button>
          </div>
          <div className="image-upload-preview-grid">
            {selectedImages.map(img => (
              <div key={img.id} className="image-upload-preview-item">
                <img src={img.preview} alt="Vorschau" />
                <button
                  type="button"
                  className="image-upload-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(img.id);
                  }}
                  aria-label="Bild entfernen"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <span className="image-upload-filename">
                  {img.file.name.length > 20
                    ? img.file.name.substring(0, 17) + '...'
                    : img.file.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageUpload;
