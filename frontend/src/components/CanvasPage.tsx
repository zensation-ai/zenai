/**
 * Canvas Page
 *
 * Interactive canvas mode - side-by-side editor with chat.
 * Supports markdown, code, and HTML documents with live preview and auto-save.
 * Enhanced with mermaid diagrams, image embedding, export, and markdown toolbar.
 *
 * Phase 33 Sprint 4 - Feature 10
 * Phase 6.2 - Multi-Modal Canvas Enhancement
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { CanvasEditorPanel, type ViewMode, type CanvasEditorPanelHandle } from './canvas/CanvasEditorPanel';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { CanvasDocumentList } from './canvas/CanvasDocumentList';
import { showToast } from './Toast';
import { logError } from '../utils/errors';
import './canvas/Canvas.css';

interface CanvasDocument {
  id: string;
  context: string;
  title: string;
  content: string;
  type: 'markdown' | 'code' | 'html';
  language?: string;
  chatSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

interface CanvasPageProps {
  context: string;
}

const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export function CanvasPage({ context }: CanvasPageProps) {
  const [documents, setDocuments] = useState<CanvasDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<CanvasDocument | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showDocList, setShowDocList] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'chat'>('editor');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);
  const editorPanelRef = useRef<CanvasEditorPanelHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Load documents
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const response = await axios.get(`/api/canvas?context=${context}`);
        if (response.data.success && isMountedRef.current) {
          const result = response.data.data;
          setDocuments(result.documents);
          // Auto-select first document
          if (result.documents.length > 0 && !activeDocument) {
            setActiveDocument(result.documents[0]);
          }
        }
      } catch (error) {
        logError('canvas-load', error);
      }
    };
    loadDocuments();
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save with debounce
  const handleContentChange = useCallback(
    (content: string) => {
      if (!activeDocument) return;

      // Capture document ID at call time to prevent saving to wrong document on quick switch
      const documentId = activeDocument.id;

      setActiveDocument((prev) => (prev ? { ...prev, content } : null));
      setSaveStatus('unsaved');

      // Debounce save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        setSaveStatus('saving');
        try {
          await axios.patch(`/api/canvas/${documentId}`, { content });
          if (isMountedRef.current) setSaveStatus('saved');
        } catch (error) {
          logError('canvas-save', error);
          if (isMountedRef.current) setSaveStatus('unsaved');
        }
      }, 1500);
    },
    [activeDocument]
  );

  // Create new document
  const handleNewDocument = useCallback(async () => {
    try {
      const response = await axios.post(
        `/api/canvas`,
        { context, title: 'Neues Dokument', type: 'markdown' }
      );
      if (response.data.success) {
        const newDoc = response.data.data;
        setDocuments((prev) => [newDoc, ...prev]);
        setActiveDocument(newDoc);
        setShowDocList(false);
        showToast('Dokument erstellt', 'success');
      }
    } catch (error) {
      logError('canvas-create', error);
      showToast('Fehler beim Erstellen', 'error');
    }
  }, [context]);

  // Select document
  const handleSelectDocument = useCallback(
    async (id: string) => {
      // Cancel any pending save from the previous document
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      try {
        const response = await axios.get(`/api/canvas/${id}`);
        if (response.data.success) {
          setActiveDocument(response.data.data);
          setSaveStatus('saved');
          setShowDocList(false);
        }
      } catch (error) {
        logError('canvas-select', error);
      }
    },
    []
  );

  // Delete document
  const handleDeleteDocument = useCallback(
    async (id: string) => {
      try {
        await axios.delete(`/api/canvas/${id}`);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        if (activeDocument?.id === id) {
          setActiveDocument(null);
        }
        showToast('Dokument gel\u00f6scht', 'success');
      } catch (error) {
        logError('canvas-delete', error);
        showToast('Fehler beim L\u00f6schen', 'error');
      }
    },
    [activeDocument]
  );

  // Update title
  const handleTitleChange = useCallback(
    async (title: string) => {
      if (!activeDocument) return;
      setActiveDocument((prev) => (prev ? { ...prev, title } : null));
      try {
        await axios.patch(
          `/api/canvas/${activeDocument.id}`,
          { title }
        );
        setDocuments((prev) =>
          prev.map((d) => (d.id === activeDocument.id ? { ...d, title } : d))
        );
      } catch (error) {
        logError('canvas-title-update', error);
      }
    },
    [activeDocument]
  );

  // Update type
  const handleTypeChange = useCallback(
    async (type: 'markdown' | 'code' | 'html') => {
      if (!activeDocument) return;
      setActiveDocument((prev) => (prev ? { ...prev, type } : null));
      try {
        await axios.patch(
          `/api/canvas/${activeDocument.id}`,
          { type }
        );
      } catch (error) {
        logError('canvas-type-update', error);
      }
    },
    [activeDocument]
  );

  // Update language
  const handleLanguageChange = useCallback(
    async (language: string) => {
      if (!activeDocument) return;
      setActiveDocument((prev) => (prev ? { ...prev, language } : null));
      try {
        await axios.patch(
          `/api/canvas/${activeDocument.id}`,
          { language }
        );
      } catch (error) {
        logError('canvas-language-update', error);
      }
    },
    [activeDocument]
  );

  // Copy content
  const handleCopy = useCallback(async () => {
    if (!activeDocument) return;
    try {
      await navigator.clipboard.writeText(activeDocument.content);
      showToast('Kopiert', 'success');
    } catch {
      showToast('Kopieren fehlgeschlagen', 'error');
    }
  }, [activeDocument]);

  // Download
  const handleDownload = useCallback(() => {
    if (!activeDocument) return;
    const ext =
      activeDocument.type === 'markdown' ? '.md' :
      activeDocument.type === 'html' ? '.html' :
      activeDocument.language ? `.${activeDocument.language}` : '.txt';
    const filename = `${activeDocument.title.replace(/[^a-zA-Z0-9-_]/g, '_')}${ext}`;
    const blob = new Blob([activeDocument.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Download gestartet', 'success');
  }, [activeDocument]);

  // Insert image via file picker
  const handleInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !activeDocument) return;

      const file = files[0];
      if (!file.type.startsWith('image/')) {
        showToast('Nur Bilddateien werden unterstuetzt', 'error');
        return;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast(`Bild ist groesser als ${MAX_IMAGE_SIZE_MB}MB`, 'error');
        return;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
          reader.readAsDataURL(file);
        });

        const altText = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        const markdownImage = `\n![${altText}](${dataUrl})\n`;

        const textarea = editorPanelRef.current?.getTextareaRef();
        const cursorPos = textarea ? textarea.selectionStart : activeDocument.content.length;
        const newContent =
          activeDocument.content.substring(0, cursorPos) +
          markdownImage +
          activeDocument.content.substring(cursorPos);

        handleContentChange(newContent);
        showToast(`Bild "${file.name}" eingefuegt`, 'success');
      } catch (err) {
        logError('canvas-image-insert', err);
        showToast('Fehler beim Einfuegen des Bildes', 'error');
      }

      // Reset the input so the same file can be selected again
      e.target.value = '';
    },
    [activeDocument, handleContentChange]
  );

  // Keyboard shortcut: Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        // Trigger immediate save
        if (activeDocument && saveStatus === 'unsaved') {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          setSaveStatus('saving');
          axios
            .patch(
              `/api/canvas/${activeDocument.id}`,
              { content: activeDocument.content }
            )
            .then(() => {
              if (isMountedRef.current) setSaveStatus('saved');
            })
            .catch((error) => {
              logError('canvas-save', error);
              if (isMountedRef.current) setSaveStatus('unsaved');
            });
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeDocument, saveStatus]);

  // Hidden file input for image insertion
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={handleFileInputChange}
      aria-hidden="true"
    />
  );

  // Empty state
  if (!activeDocument) {
    return (
      <div className="canvas-page canvas-empty-state">
        {fileInput}
        <div className="canvas-empty-content">
          <h2>{'\uD83C\uDFA8'} Canvas</h2>
          <p>Erstelle interaktive Dokumente mit Live-Vorschau.</p>
          <button type="button" className="canvas-create-btn" onClick={handleNewDocument}>
            + Neues Dokument erstellen
          </button>
          {documents.length > 0 && (
            <button
              type="button"
              className="canvas-browse-btn"
              onClick={() => setShowDocList(true)}
            >
              {'\uD83D\uDCC1'} Dokumente durchsuchen ({documents.length})
            </button>
          )}
        </div>

        {showDocList && (
          <CanvasDocumentList
            documents={documents}
            activeDocumentId={null}
            onSelect={handleSelectDocument}
            onDelete={handleDeleteDocument}
            onCreate={handleNewDocument}
            onClose={() => setShowDocList(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="canvas-page">
      {fileInput}

      {/* Mobile Tab Switcher */}
      <div className="canvas-mobile-tabs">
        <button
          className={`canvas-mobile-tab ${mobileTab === 'editor' ? 'active' : ''}`}
          onClick={() => setMobileTab('editor')}
        >
          {'\uD83D\uDCDD'} Editor
        </button>
        <button
          className={`canvas-mobile-tab ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileTab('chat')}
        >
          {'\uD83D\uDCAC'} Chat
        </button>
      </div>

      {/* Main Content */}
      <div className={`canvas-main canvas-mobile-${mobileTab}`}>
        <div className="canvas-editor-section">
          <CanvasToolbar
            title={activeDocument.title}
            onTitleChange={handleTitleChange}
            type={activeDocument.type}
            onTypeChange={handleTypeChange}
            language={activeDocument.language}
            onLanguageChange={handleLanguageChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            saveStatus={saveStatus}
            onDownload={handleDownload}
            onCopy={handleCopy}
            onNewDocument={handleNewDocument}
            onShowDocList={() => setShowDocList(true)}
            content={activeDocument.content}
            onInsertImage={handleInsertImage}
          />

          <CanvasEditorPanel
            ref={editorPanelRef}
            content={activeDocument.content}
            onChange={handleContentChange}
            type={activeDocument.type}
            language={activeDocument.language}
            viewMode={viewMode}
          />
        </div>
      </div>

      {/* Document List Drawer */}
      {showDocList && (
        <CanvasDocumentList
          documents={documents}
          activeDocumentId={activeDocument.id}
          onSelect={handleSelectDocument}
          onDelete={handleDeleteDocument}
          onCreate={handleNewDocument}
          onClose={() => setShowDocList(false)}
        />
      )}
    </div>
  );
}
