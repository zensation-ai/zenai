/**
 * DocumentAnalysis Component
 *
 * Full-page document analysis interface.
 * Upload PDF, Excel, or CSV files and receive AI-powered analysis
 * displayed as interactive Artifacts.
 *
 * Phase 2 features:
 * - SSE streaming with real-time progress
 * - Follow-up questions on analyzed documents (prompt caching)
 * - Multi-document comparison (2-3 files)
 * - Analysis history
 *
 * @module components/DocumentAnalysis
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter, oneDark } from '../utils/syntaxHighlighter';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';

// Simple inline file upload component for DocumentAnalysis
interface SimpleFileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

function SimpleFileUpload({ onFileSelect, selectedFile, disabled = false }: SimpleFileUploadProps) {
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
        <span className="file-icon">📄</span>
        <div className="file-info">
          <span className="file-name">{selectedFile.name}</span>
          <span className="file-size">{formatSize(selectedFile.size)}</span>
        </div>
        <button type="button" onClick={() => onFileSelect(null)} disabled={disabled}>✕</button>
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
        aria-label="Datei auswählen"
      />
      <div className="dropzone-content">
        <span className="dropzone-icon">📁</span>
        <p>Datei hierher ziehen oder klicken</p>
        <span className="dropzone-hint">PDF, Excel, CSV</span>
      </div>
    </div>
  );
}
import { ArtifactPanel } from './ArtifactPanel';
import type { Artifact } from '../types/artifacts';
import './DocumentAnalysis.css';

interface DocumentAnalysisProps {
  context: string;
  onBack: () => void;
}

interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface AnalysisResult {
  id?: string;
  cacheKey?: string;
  filename: string;
  documentType: string;
  analysis: string;
  sections: Array<{
    title: string;
    content: string;
    type: 'text' | 'table' | 'list' | 'kpi';
  }>;
  keyFindings: string[];
  metadata: {
    fileSize: number;
    mimeType: string;
    processingTimeMs: number;
    tokenUsage?: { input: number; output: number };
    sheetInfo?: Array<{ name: string; rows: number; columns: number }>;
  };
}

interface HistoryEntry {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  analysisType: string;
  tokenUsage: { input: number; output: number } | null;
  createdAt: string;
}

interface FollowUpMessage {
  role: 'user' | 'assistant';
  content: string;
  tokenUsage?: { input: number; output: number };
}

interface CustomTemplate {
  id: string;
  name: string;
  system_prompt: string;
  instruction: string;
  icon: string;
  context: string;
}

interface MermaidDiagram {
  title: string;
  content: string;
}

type ViewMode = 'upload' | 'compare' | 'history' | 'templates';

const TEMPLATE_ICONS: Record<string, string> = {
  'search': '\uD83D\uDD0D',
  'trending-up': '\uD83D\uDCC8',
  'file-text': '\uD83D\uDCC4',
  'bar-chart': '\uD83D\uDCCA',
  'zap': '\u26A1',
  'star': '\u2B50',
  'settings': '\u2699\uFE0F',
  'brain': '\uD83E\uDDE0',
  'target': '\uD83C\uDFAF',
  'clipboard': '\uD83D\uDCCB',
};

export function DocumentAnalysis({ onBack }: DocumentAnalysisProps) {
  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  // Streaming state
  const [streamingContent, setStreamingContent] = useState('');
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamStage, setStreamStage] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);

  // Follow-up state
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  // Compare mode state
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  const [compareFiles, setCompareFiles] = useState<File[]>([]);

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Custom templates state (Phase 3)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [isLoadingCustomTemplates, setIsLoadingCustomTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<CustomTemplate> | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Mermaid diagrams state (Phase 3)
  const [mermaidDiagrams, setMermaidDiagrams] = useState<MermaidDiagram[]>([]);

  // PDF export state (Phase 3)
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const followUpRef = useRef<HTMLDivElement>(null);

  const [templates] = useState<AnalysisTemplate[]>([
    { id: 'general', name: 'Allgemeine Analyse', description: 'Zusammenfassung, Hauptinhalte, Auff\u00e4lligkeiten', icon: 'search' },
    { id: 'financial', name: 'Finanzanalyse', description: 'KPIs, Trends, Empfehlungen', icon: 'trending-up' },
    { id: 'contract', name: 'Vertragspr\u00fcfung', description: 'Klauseln, Fristen, Risiken', icon: 'file-text' },
    { id: 'data', name: 'Datenauswertung', description: 'Statistik, Muster, Insights', icon: 'bar-chart' },
    { id: 'summary', name: 'Schnellzusammenfassung', description: 'Kernaussagen in K\u00fcrze', icon: 'zap' },
  ]);

  // ===========================================
  // Analysis (with optional streaming)
  // ===========================================

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setResult(null);
    setFollowUpMessages([]);
    setStreamingContent('');
    setStreamProgress(0);

    if (useStreaming) {
      // SSE Streaming analysis
      try {
        const formData = new FormData();
        formData.append('document', selectedFile);
        formData.append('template', selectedTemplate);
        if (customPrompt.trim()) {
          formData.append('customPrompt', customPrompt.trim());
        }

        setStreamStage('Verbinde...');
        setStreamProgress(5);

        const response = await fetch('/api/documents/analyze/stream', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        if (!reader) throw new Error('No reader available');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              // Event type line - data follows on next line
              continue;
            }
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.stage) {
                  setStreamStage(data.content || data.stage);
                }
                if (data.progress !== undefined) {
                  setStreamProgress(data.progress);
                }
                if (data.content && !data.stage) {
                  accumulated += data.content;
                  setStreamingContent(accumulated);
                }
                if (data.result) {
                  setResult(data.result);
                  showToast('Analyse abgeschlossen', 'success');
                }
                if (data.error) {
                  throw new Error(data.error);
                }
              } catch (parseErr) {
                // Skip parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Streaming-Analyse fehlgeschlagen';
        showToast(message, 'error');
      } finally {
        setIsAnalyzing(false);
        setStreamingContent('');
        setStreamProgress(0);
        setStreamStage('');
      }
    } else {
      // Regular (non-streaming) analysis
      try {
        const formData = new FormData();
        formData.append('document', selectedFile);
        formData.append('template', selectedTemplate);
        if (customPrompt.trim()) {
          formData.append('customPrompt', customPrompt.trim());
        }

        const response = await axios.post('/api/documents/analyze', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });

        if (response.data.success) {
          setResult(response.data.data);
          showToast('Analyse abgeschlossen', 'success');
        } else {
          throw new Error('Analyse fehlgeschlagen');
        }
      } catch (err: unknown) {
        showToast(getErrorMessage(err, 'Analyse fehlgeschlagen'), 'error');
      } finally {
        setIsAnalyzing(false);
      }
    }
  }, [selectedFile, selectedTemplate, customPrompt, useStreaming]);

  // ===========================================
  // Multi-Document Comparison
  // ===========================================

  const handleCompare = useCallback(async () => {
    if (compareFiles.length < 2) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      const formData = new FormData();
      for (const file of compareFiles) {
        formData.append('documents', file);
      }
      if (customPrompt.trim()) {
        formData.append('customPrompt', customPrompt.trim());
      }

      const response = await axios.post('/api/documents/compare', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });

      if (response.data.success) {
        setResult(response.data.data);
        showToast('Vergleich abgeschlossen', 'success');
      } else {
        throw new Error('Vergleich fehlgeschlagen');
      }
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Vergleich fehlgeschlagen'), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [compareFiles, customPrompt]);

  // ===========================================
  // Follow-up Questions
  // ===========================================

  const handleFollowUp = useCallback(async () => {
    if (!result?.cacheKey || !followUpQuestion.trim()) return;

    const question = followUpQuestion.trim();
    setFollowUpQuestion('');
    setIsFollowUpLoading(true);

    setFollowUpMessages((prev) => [...prev, { role: 'user', content: question }]);

    try {
      const response = await axios.post('/api/documents/followup', {
        cacheKey: result.cacheKey,
        question,
      });

      if (response.data.success) {
        setFollowUpMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: response.data.data.answer,
            tokenUsage: response.data.data.tokenUsage,
          },
        ]);
      } else {
        throw new Error('Folge-Frage fehlgeschlagen');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Folge-Frage fehlgeschlagen');
      setFollowUpMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Fehler: ${message}` },
      ]);
      showToast(message, 'error');
    } finally {
      setIsFollowUpLoading(false);
    }
  }, [result, followUpQuestion]);

  // Scroll follow-up into view
  useEffect(() => {
    if (followUpMessages.length > 0 && followUpRef.current) {
      followUpRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [followUpMessages]);

  // ===========================================
  // History
  // ===========================================

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await axios.get('/api/documents/history', {
        params: { limit: 20, offset: 0 },
      });
      if (response.data.success) {
        setHistory(response.data.data.entries);
        setHistoryTotal(response.data.data.total);
      }
    } catch {
      showToast('Historie konnte nicht geladen werden', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const loadHistoryEntry = useCallback(async (id: string) => {
    try {
      const response = await axios.get(`/api/documents/history/${id}`);
      if (response.data.success) {
        setResult(response.data.data.analysisResult);
        setViewMode('upload');
        showToast('Analyse geladen', 'success');
      }
    } catch {
      showToast('Analyse konnte nicht geladen werden', 'error');
    }
  }, []);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/documents/history/${id}`);
      setHistory((prev) => prev.filter((e) => e.id !== id));
      setHistoryTotal((prev) => prev - 1);
      showToast('Analyse gel\u00f6scht', 'success');
    } catch {
      showToast('L\u00f6schen fehlgeschlagen', 'error');
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'history') {
      loadHistory();
    }
  }, [viewMode, loadHistory]);

  // ===========================================
  // Phase 3: Custom Templates
  // ===========================================

  const loadCustomTemplates = useCallback(async () => {
    setIsLoadingCustomTemplates(true);
    try {
      const response = await axios.get('/api/documents/templates/custom');
      if (response.data.success) {
        setCustomTemplates(response.data.data.templates);
      }
    } catch {
      showToast('Custom Templates konnten nicht geladen werden', 'error');
    } finally {
      setIsLoadingCustomTemplates(false);
    }
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!editingTemplate?.name || !editingTemplate?.system_prompt || !editingTemplate?.instruction) {
      showToast('Bitte alle Pflichtfelder ausfüllen', 'error');
      return;
    }

    setIsSavingTemplate(true);
    try {
      if (editingTemplate.id) {
        // Update existing
        const response = await axios.put(`/api/documents/templates/custom/${editingTemplate.id}`, {
          name: editingTemplate.name,
          system_prompt: editingTemplate.system_prompt,
          instruction: editingTemplate.instruction,
          icon: editingTemplate.icon || 'file-text',
        });
        if (response.data.success) {
          setCustomTemplates((prev) =>
            prev.map((t) => (t.id === editingTemplate.id ? response.data.data.template : t))
          );
          showToast('Template aktualisiert', 'success');
        }
      } else {
        // Create new
        const response = await axios.post('/api/documents/templates/custom', {
          name: editingTemplate.name,
          system_prompt: editingTemplate.system_prompt,
          instruction: editingTemplate.instruction,
          icon: editingTemplate.icon || 'file-text',
        });
        if (response.data.success) {
          setCustomTemplates((prev) => [response.data.data.template, ...prev]);
          showToast('Template erstellt', 'success');
        }
      }
      setEditingTemplate(null);
    } catch {
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setIsSavingTemplate(false);
    }
  }, [editingTemplate]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/documents/templates/custom/${id}`);
      setCustomTemplates((prev) => prev.filter((t) => t.id !== id));
      showToast('Template gelöscht', 'success');
    } catch {
      showToast('Löschen fehlgeschlagen', 'error');
    }
  }, []);

  // Load custom templates on mount and when templates view is active
  useEffect(() => {
    loadCustomTemplates();
  }, [loadCustomTemplates]);

  useEffect(() => {
    if (viewMode === 'templates') {
      loadCustomTemplates();
    }
  }, [viewMode, loadCustomTemplates]);

  // ===========================================
  // Phase 3: Mermaid Extraction
  // ===========================================

  const extractMermaidDiagrams = useCallback((text: string): MermaidDiagram[] => {
    const diagrams: MermaidDiagram[] = [];
    const pattern = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;
    let idx = 0;

    while ((match = pattern.exec(text)) !== null) {
      idx++;
      const content = match[1].trim();
      let title = `Diagramm ${idx}`;
      if (content.startsWith('pie')) title = `Kreisdiagramm ${idx}`;
      else if (content.startsWith('graph') || content.startsWith('flowchart')) title = `Flussdiagramm ${idx}`;
      else if (content.startsWith('sequenceDiagram')) title = `Sequenzdiagramm ${idx}`;
      else if (content.startsWith('gantt')) title = `Gantt-Diagramm ${idx}`;
      else if (content.startsWith('xychart-beta')) title = `Balkendiagramm ${idx}`;
      diagrams.push({ title, content });
    }

    return diagrams;
  }, []);

  // Extract Mermaid diagrams when result changes
  useEffect(() => {
    if (result?.analysis) {
      const diagrams = extractMermaidDiagrams(result.analysis);
      setMermaidDiagrams(diagrams);
    } else {
      setMermaidDiagrams([]);
    }
  }, [result, extractMermaidDiagrams]);

  // ===========================================
  // Phase 3: PDF Export
  // ===========================================

  const handleExportPdf = useCallback(async () => {
    if (!result?.id) {
      showToast('Analyse muss zuerst gespeichert sein', 'error');
      return;
    }

    setIsExportingPdf(true);
    try {
      const response = await axios.post(
        '/api/documents/export/pdf',
        { analysisId: result.id },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analyse-${result.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('PDF-Report heruntergeladen', 'success');
    } catch {
      showToast('PDF-Export fehlgeschlagen', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  }, [result]);

  // ===========================================
  // Reset & Helpers
  // ===========================================

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setResult(null);
    setCustomPrompt('');
    setFollowUpMessages([]);
    setFollowUpQuestion('');
    setCompareFiles([]);
    setStreamingContent('');
    setMermaidDiagrams([]);
  }, []);

  const openAsArtifact = useCallback((type: 'markdown' | 'csv', title: string, content: string) => {
    setSelectedArtifact({
      id: `doc-artifact-${Date.now()}`,
      title,
      type,
      content,
    });
  }, []);

  const handleCopyAnalysis = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.analysis);
      showToast('Analyse kopiert', 'success');
    } catch {
      showToast('Kopieren fehlgeschlagen', 'error');
    }
  }, [result]);

  const handleAddCompareFile = useCallback((file: File | null) => {
    if (file && compareFiles.length < 3) {
      setCompareFiles((prev) => [...prev, file]);
    }
  }, [compareFiles]);

  const handleRemoveCompareFile = useCallback((index: number) => {
    setCompareFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ===========================================
  // Render
  // ===========================================

  return (
    <div className="doc-analysis">
      {/* Header */}
      <header className="doc-analysis-header">
        <div className="doc-analysis-header-left">
          <button type="button" className="back-button" onClick={onBack}>
            \u2190 Zur\u00fcck
          </button>
          <h1>Dokument-Analyse</h1>
          <span className="doc-analysis-badge">Phase 3</span>
        </div>
        <div className="doc-analysis-header-right">
          <button
            type="button"
            className={`doc-mode-btn ${viewMode === 'upload' ? 'active' : ''}`}
            onClick={() => setViewMode('upload')}
          >
            Analyse
          </button>
          <button
            type="button"
            className={`doc-mode-btn ${viewMode === 'compare' ? 'active' : ''}`}
            onClick={() => setViewMode('compare')}
          >
            Vergleich
          </button>
          <button
            type="button"
            className={`doc-mode-btn ${viewMode === 'history' ? 'active' : ''}`}
            onClick={() => setViewMode('history')}
          >
            Historie
          </button>
          <button
            type="button"
            className={`doc-mode-btn ${viewMode === 'templates' ? 'active' : ''}`}
            onClick={() => setViewMode('templates')}
          >
            Templates
          </button>
        </div>
      </header>

      <div className="doc-analysis-content">
        {/* ===========================================
            Upload / Single Analysis Mode
            =========================================== */}
        {viewMode === 'upload' && !result && (
          <section className="doc-analysis-upload-section">
            <div className="doc-analysis-upload-area">
              <h2>Dokument hochladen</h2>
              <p className="doc-analysis-upload-hint">
                Lade ein PDF, Excel oder CSV hoch und erhalte eine KI-gest\u00fctzte Analyse.
              </p>

              <SimpleFileUpload
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                disabled={isAnalyzing}
              />
            </div>

            {selectedFile && (
              <div className="doc-analysis-options">
                <h3>Analyse-Typ w&auml;hlen</h3>
                <div className="doc-analysis-templates">
                  {templates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      className={`doc-template-card ${selectedTemplate === tmpl.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTemplate(tmpl.id)}
                      disabled={isAnalyzing}
                    >
                      <span className="doc-template-icon">
                        {TEMPLATE_ICONS[tmpl.icon] || '\uD83D\uDCC4'}
                      </span>
                      <span className="doc-template-name">{tmpl.name}</span>
                      <span className="doc-template-desc">{tmpl.description}</span>
                    </button>
                  ))}
                  {customTemplates.map((tmpl) => (
                    <button
                      key={`custom-${tmpl.id}`}
                      type="button"
                      className={`doc-template-card doc-template-custom ${selectedTemplate === `custom:${tmpl.id}` ? 'selected' : ''}`}
                      onClick={() => setSelectedTemplate(`custom:${tmpl.id}`)}
                      disabled={isAnalyzing}
                    >
                      <span className="doc-template-icon">
                        {TEMPLATE_ICONS[tmpl.icon] || '\u2B50'}
                      </span>
                      <span className="doc-template-name">{tmpl.name}</span>
                      <span className="doc-template-desc doc-template-custom-label">Eigenes Template</span>
                    </button>
                  ))}
                </div>

                <div className="doc-analysis-custom-prompt">
                  <label htmlFor="custom-prompt">
                    Eigene Anweisungen (optional)
                  </label>
                  <textarea
                    id="custom-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="z.B. Fokussiere auf die Umsatzentwicklung Q3..."
                    rows={2}
                    disabled={isAnalyzing}
                  />
                </div>

                {/* Streaming toggle */}
                <label className="doc-streaming-toggle">
                  <input
                    type="checkbox"
                    checked={useStreaming}
                    onChange={(e) => setUseStreaming(e.target.checked)}
                    disabled={isAnalyzing}
                  />
                  <span>Echtzeit-Streaming (Fortschritt sichtbar)</span>
                </label>

                <button
                  type="button"
                  className="doc-analysis-submit"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !selectedFile}
                >
                  {isAnalyzing ? (
                    <>
                      <span className="doc-analysis-spinner" />
                      Analysiere...
                    </>
                  ) : (
                    'Analyse starten'
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ===========================================
            Compare Mode
            =========================================== */}
        {viewMode === 'compare' && !result && (
          <section className="doc-analysis-upload-section">
            <div className="doc-analysis-upload-area">
              <h2>Dokumente vergleichen</h2>
              <p className="doc-analysis-upload-hint">
                Lade 2-3 Dokumente hoch f\u00fcr einen KI-gest\u00fctzten Vergleich.
              </p>

              {/* Show selected files */}
              {compareFiles.length > 0 && (
                <div className="doc-compare-files">
                  {compareFiles.map((file, index) => (
                    <div key={index} className="doc-compare-file-item">
                      <span className="doc-compare-file-name">{file.name}</span>
                      <span className="doc-compare-file-size">{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        className="doc-compare-remove"
                        onClick={() => handleRemoveCompareFile(index)}
                        disabled={isAnalyzing}
                      >
                        \u2715
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add file (up to 3) */}
              {compareFiles.length < 3 && (
                <SimpleFileUpload
                  onFileSelect={handleAddCompareFile}
                  selectedFile={null}
                  disabled={isAnalyzing}
                />
              )}
            </div>

            {compareFiles.length >= 2 && (
              <div className="doc-analysis-options">
                <div className="doc-analysis-custom-prompt">
                  <label htmlFor="compare-prompt">
                    Vergleichsanweisungen (optional)
                  </label>
                  <textarea
                    id="compare-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="z.B. Vergleiche die Umsatzzahlen beider Quartale..."
                    rows={2}
                    disabled={isAnalyzing}
                  />
                </div>

                <button
                  type="button"
                  className="doc-analysis-submit"
                  onClick={handleCompare}
                  disabled={isAnalyzing || compareFiles.length < 2}
                >
                  {isAnalyzing ? (
                    <>
                      <span className="doc-analysis-spinner" />
                      Vergleiche...
                    </>
                  ) : (
                    `${compareFiles.length} Dokumente vergleichen`
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ===========================================
            History Mode
            =========================================== */}
        {viewMode === 'history' && !result && (
          <section className="doc-analysis-history">
            <h2>Analyse-Historie</h2>
            {isLoadingHistory ? (
              <div className="doc-analysis-progress">
                <div className="doc-analysis-progress-inner">
                  <span className="doc-analysis-spinner large" />
                  <p>Historie wird geladen...</p>
                </div>
              </div>
            ) : history.length === 0 ? (
              <div className="doc-history-empty">
                <p>Keine bisherigen Analysen vorhanden.</p>
              </div>
            ) : (
              <>
                <p className="doc-history-count">{historyTotal} Analysen gespeichert</p>
                <div className="doc-history-list">
                  {history.map((entry) => (
                    <div key={entry.id} className="doc-history-item">
                      <div className="doc-history-item-info">
                        <span className="doc-history-filename">{entry.filename}</span>
                        <div className="doc-history-meta">
                          <span className="doc-result-tag">{entry.fileType}</span>
                          <span className="doc-result-tag secondary">{entry.analysisType}</span>
                          <span className="doc-result-meta-item">{formatFileSize(entry.fileSize)}</span>
                          {entry.tokenUsage && (
                            <span className="doc-result-meta-item">
                              {entry.tokenUsage.input + entry.tokenUsage.output} Tokens
                            </span>
                          )}
                          <span className="doc-result-meta-item">{formatDate(entry.createdAt)}</span>
                        </div>
                      </div>
                      <div className="doc-history-item-actions">
                        <button
                          type="button"
                          className="doc-action-btn"
                          onClick={() => loadHistoryEntry(entry.id)}
                        >
                          \u00d6ffnen
                        </button>
                        <button
                          type="button"
                          className="doc-action-btn doc-action-delete"
                          onClick={() => deleteHistoryEntry(entry.id)}
                        >
                          L\u00f6schen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* ===========================================
            Templates Editor Mode (Phase 3)
            =========================================== */}
        {viewMode === 'templates' && (
          <section className="doc-analysis-templates-editor">
            <h2>Eigene Analyse-Templates</h2>
            <p className="doc-templates-hint">
              Erstelle und verwalte eigene Analyse-Vorlagen mit benutzerdefinierten Prompts.
            </p>

            {/* Template Editor Form */}
            {editingTemplate !== null && (
              <div className="doc-template-editor">
                <h3>{editingTemplate.id ? 'Template bearbeiten' : 'Neues Template'}</h3>
                <div className="doc-template-editor-field">
                  <label htmlFor="tpl-name">Name *</label>
                  <input
                    id="tpl-name"
                    type="text"
                    value={editingTemplate.name || ''}
                    onChange={(e) => setEditingTemplate((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="z.B. Marketing-Analyse"
                    maxLength={100}
                  />
                </div>
                <div className="doc-template-editor-field">
                  <label htmlFor="tpl-icon">Icon</label>
                  <select
                    id="tpl-icon"
                    value={editingTemplate.icon || 'file-text'}
                    onChange={(e) => setEditingTemplate((prev) => ({ ...prev, icon: e.target.value }))}
                  >
                    {Object.entries(TEMPLATE_ICONS).map(([key, emoji]) => (
                      <option key={key} value={key}>{emoji} {key}</option>
                    ))}
                  </select>
                </div>
                <div className="doc-template-editor-field">
                  <label htmlFor="tpl-system">System-Prompt * (Rolle des AI)</label>
                  <textarea
                    id="tpl-system"
                    value={editingTemplate.system_prompt || ''}
                    onChange={(e) => setEditingTemplate((prev) => ({ ...prev, system_prompt: e.target.value }))}
                    placeholder="Du bist ein professioneller Analyst f&uuml;r..."
                    rows={3}
                  />
                </div>
                <div className="doc-template-editor-field">
                  <label htmlFor="tpl-instruction">Anweisung * (Was soll analysiert werden)</label>
                  <textarea
                    id="tpl-instruction"
                    value={editingTemplate.instruction || ''}
                    onChange={(e) => setEditingTemplate((prev) => ({ ...prev, instruction: e.target.value }))}
                    placeholder="Analysiere dieses Dokument mit Fokus auf..."
                    rows={5}
                  />
                </div>
                <div className="doc-template-editor-actions">
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={handleSaveTemplate}
                    disabled={isSavingTemplate || !editingTemplate.name || !editingTemplate.system_prompt || !editingTemplate.instruction}
                  >
                    {isSavingTemplate ? 'Speichern...' : 'Speichern'}
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn secondary"
                    onClick={() => setEditingTemplate(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {/* Create button */}
            {editingTemplate === null && (
              <button
                type="button"
                className="doc-analysis-submit"
                onClick={() => setEditingTemplate({ name: '', system_prompt: '', instruction: '', icon: 'file-text' })}
              >
                + Neues Template erstellen
              </button>
            )}

            {/* Template List */}
            {isLoadingCustomTemplates ? (
              <div className="doc-analysis-progress">
                <div className="doc-analysis-progress-inner">
                  <span className="doc-analysis-spinner large" />
                  <p>Templates werden geladen...</p>
                </div>
              </div>
            ) : customTemplates.length === 0 ? (
              <div className="doc-history-empty">
                <p>Keine eigenen Templates vorhanden. Erstelle dein erstes Template!</p>
              </div>
            ) : (
              <div className="doc-history-list">
                {customTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="doc-history-item">
                    <div className="doc-history-item-info">
                      <span className="doc-history-filename">
                        {TEMPLATE_ICONS[tmpl.icon] || '\u2B50'} {tmpl.name}
                      </span>
                      <div className="doc-history-meta">
                        <span className="doc-result-tag secondary">System: {tmpl.system_prompt.substring(0, 60)}...</span>
                      </div>
                    </div>
                    <div className="doc-history-item-actions">
                      <button
                        type="button"
                        className="doc-action-btn"
                        onClick={() => setEditingTemplate(tmpl)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="doc-action-btn doc-action-delete"
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                      >
                        L&ouml;schen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===========================================
            Streaming Progress
            =========================================== */}
        {isAnalyzing && useStreaming && streamingContent && (
          <div className="doc-analysis-streaming">
            <div className="doc-streaming-header">
              <div className="doc-streaming-progress-bar">
                <div
                  className="doc-streaming-progress-fill"
                  style={{ width: `${streamProgress}%` }}
                />
              </div>
              <span className="doc-streaming-stage">{streamStage}</span>
            </div>
            <div className="doc-analysis-main">
              <div className="doc-analysis-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Non-streaming progress */}
        {isAnalyzing && (!useStreaming || !streamingContent) && (
          <div className="doc-analysis-progress">
            <div className="doc-analysis-progress-inner">
              <span className="doc-analysis-spinner large" />
              <h3>{streamStage || 'Dokument wird analysiert...'}</h3>
              <p>Claude liest und analysiert dein Dokument.</p>
              {streamProgress > 0 && (
                <div className="doc-streaming-progress-bar" style={{ width: '200px' }}>
                  <div
                    className="doc-streaming-progress-fill"
                    style={{ width: `${streamProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===========================================
            Results
            =========================================== */}
        {result && (
          <section className="doc-analysis-results">
            {/* Result Header */}
            <div className="doc-analysis-result-header">
              <div className="doc-analysis-result-info">
                <h2>{result.filename}</h2>
                <div className="doc-analysis-result-meta">
                  <span className="doc-result-tag">{result.documentType}</span>
                  <span className="doc-result-meta-item">
                    {formatFileSize(result.metadata.fileSize)}
                  </span>
                  <span className="doc-result-meta-item">
                    {(result.metadata.processingTimeMs / 1000).toFixed(1)}s Analyse
                  </span>
                  {result.metadata.tokenUsage && (
                    <span className="doc-result-meta-item">
                      {result.metadata.tokenUsage.input + result.metadata.tokenUsage.output} Tokens
                    </span>
                  )}
                  {result.cacheKey && (
                    <span className="doc-result-tag secondary">Cache aktiv</span>
                  )}
                </div>
                {result.metadata.sheetInfo && result.metadata.sheetInfo.length > 0 && (
                  <div className="doc-analysis-sheet-info">
                    {result.metadata.sheetInfo.map((sheet, i) => (
                      <span key={i} className="doc-result-tag secondary">
                        {sheet.name}: {sheet.rows} Zeilen, {sheet.columns} Spalten
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="doc-analysis-result-actions">
                <button
                  type="button"
                  className="doc-action-btn"
                  onClick={handleCopyAnalysis}
                  title="Analyse kopieren"
                >
                  Kopieren
                </button>
                <button
                  type="button"
                  className="doc-action-btn"
                  onClick={() => openAsArtifact('markdown', `Analyse: ${result.filename}`, result.analysis)}
                  title="Als Artifact öffnen"
                >
                  Artifact
                </button>
                {result.id && (
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    title="Als PDF exportieren"
                  >
                    {isExportingPdf ? 'Export...' : 'PDF'}
                  </button>
                )}
                <button
                  type="button"
                  className="doc-action-btn secondary"
                  onClick={handleReset}
                >
                  Neue Analyse
                </button>
              </div>
            </div>

            {/* Key Findings */}
            {result.keyFindings.length > 0 && (
              <div className="doc-analysis-key-findings">
                <h3>Schl\u00fcssel-Erkenntnisse</h3>
                <ul>
                  {result.keyFindings.map((finding, i) => (
                    <li key={i}>{finding}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Mermaid Diagrams (Phase 3) */}
            {mermaidDiagrams.length > 0 && (
              <div className="doc-analysis-diagrams">
                <h3>Visualisierungen</h3>
                <div className="doc-diagrams-grid">
                  {mermaidDiagrams.map((diagram, i) => (
                    <div key={i} className="doc-diagram-card">
                      <div className="doc-diagram-header">
                        <span className="doc-diagram-title">{diagram.title}</span>
                        <button
                          type="button"
                          className="doc-action-btn"
                          onClick={() => setSelectedArtifact({
                            id: `mermaid-${Date.now()}-${i}`,
                            title: diagram.title,
                            type: 'mermaid',
                            content: diagram.content,
                          })}
                        >
                          Öffnen
                        </button>
                      </div>
                      <pre className="doc-diagram-preview">{diagram.content.substring(0, 200)}{diagram.content.length > 200 ? '...' : ''}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Main Analysis */}
            <div className="doc-analysis-main">
              <div className="doc-analysis-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match;
                      return isInline ? (
                        <code className="inline-code" {...props}>
                          {children}
                        </code>
                      ) : (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      );
                    },
                  }}
                >
                  {result.analysis}
                </ReactMarkdown>
              </div>
            </div>

            {/* ===========================================
                Follow-up Questions
                =========================================== */}
            {result.cacheKey && (
              <div className="doc-followup-section" ref={followUpRef}>
                <h3>Folge-Fragen zum Dokument</h3>
                <p className="doc-followup-hint">
                  Stelle weitere Fragen zum analysierten Dokument. Der Kontext bleibt f\u00fcr 5 Minuten im Cache.
                </p>

                {/* Follow-up conversation */}
                {followUpMessages.length > 0 && (
                  <div className="doc-followup-messages">
                    {followUpMessages.map((msg, i) => (
                      <div key={i} className={`doc-followup-msg doc-followup-${msg.role}`}>
                        <div className="doc-followup-msg-label">
                          {msg.role === 'user' ? 'Du' : 'Claude'}
                        </div>
                        <div className="doc-followup-msg-content">
                          {msg.role === 'assistant' ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                        {msg.tokenUsage && (
                          <span className="doc-followup-tokens">
                            {msg.tokenUsage.input + msg.tokenUsage.output} Tokens
                          </span>
                        )}
                      </div>
                    ))}
                    {isFollowUpLoading && (
                      <div className="doc-followup-msg doc-followup-assistant">
                        <div className="doc-followup-msg-label">Claude</div>
                        <div className="doc-followup-msg-content">
                          <span className="doc-analysis-spinner" /> Denke nach...
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Follow-up input */}
                <div className="doc-followup-input">
                  <textarea
                    value={followUpQuestion}
                    onChange={(e) => setFollowUpQuestion(e.target.value)}
                    placeholder="Stelle eine Folge-Frage zum Dokument..."
                    rows={2}
                    disabled={isFollowUpLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFollowUp();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="doc-followup-submit"
                    onClick={handleFollowUp}
                    disabled={isFollowUpLoading || !followUpQuestion.trim()}
                  >
                    {isFollowUpLoading ? (
                      <span className="doc-analysis-spinner" />
                    ) : (
                      'Fragen'
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Artifact Panel */}
      {selectedArtifact && (
        <ArtifactPanel
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
        />
      )}
    </div>
  );
}

export default DocumentAnalysis;
