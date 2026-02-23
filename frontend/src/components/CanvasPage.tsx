/**
 * Canvas Page
 *
 * Interactive canvas mode - side-by-side editor with chat.
 * Supports markdown, code, and HTML documents with live preview and auto-save.
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { CanvasEditorPanel, type ViewMode } from './canvas/CanvasEditorPanel';
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

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const apiHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export function CanvasPage({ context }: CanvasPageProps) {
  const [documents, setDocuments] = useState<CanvasDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<CanvasDocument | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showDocList, setShowDocList] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'chat'>('editor');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

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
        const response = await axios.get(`${API_URL}/api/canvas?context=${context}`, {
          headers: apiHeaders,
        });
        if (response.data.success && isMountedRef.current) {
          setDocuments(response.data.documents);
          // Auto-select first document
          if (response.data.documents.length > 0 && !activeDocument) {
            setActiveDocument(response.data.documents[0]);
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

      setActiveDocument((prev) => (prev ? { ...prev, content } : null));
      setSaveStatus('unsaved');

      // Debounce save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        setSaveStatus('saving');
        try {
          await axios.patch(
            `${API_URL}/api/canvas/${activeDocument.id}`,
            { content },
            { headers: apiHeaders }
          );
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
        `${API_URL}/api/canvas`,
        { context, title: 'Neues Dokument', type: 'markdown' },
        { headers: apiHeaders }
      );
      if (response.data.success) {
        const newDoc = response.data;
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
      try {
        const response = await axios.get(`${API_URL}/api/canvas/${id}`, {
          headers: apiHeaders,
        });
        if (response.data.success) {
          setActiveDocument(response.data);
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
        await axios.delete(`${API_URL}/api/canvas/${id}`, {
          headers: apiHeaders,
        });
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
          `${API_URL}/api/canvas/${activeDocument.id}`,
          { title },
          { headers: apiHeaders }
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
          `${API_URL}/api/canvas/${activeDocument.id}`,
          { type },
          { headers: apiHeaders }
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
          `${API_URL}/api/canvas/${activeDocument.id}`,
          { language },
          { headers: apiHeaders }
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
              `${API_URL}/api/canvas/${activeDocument.id}`,
              { content: activeDocument.content },
              { headers: apiHeaders }
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

  // Empty state
  if (!activeDocument) {
    return (
      <div className="canvas-page canvas-empty-state">
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
          />

          <CanvasEditorPanel
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
