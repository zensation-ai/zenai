/**
 * DocumentAnalysis Component
 *
 * Full-page document analysis interface.
 * Upload PDF, Excel, or CSV files and receive AI-powered analysis
 * displayed as interactive Artifacts.
 *
 * @module components/DocumentAnalysis
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DocumentUpload } from './DocumentUpload';
import { showToast } from './Toast';
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

const TEMPLATE_ICONS: Record<string, string> = {
  'search': '\uD83D\uDD0D',
  'trending-up': '\uD83D\uDCC8',
  'file-text': '\uD83D\uDCC4',
  'bar-chart': '\uD83D\uDCCA',
  'zap': '\u26A1',
};

export function DocumentAnalysis({ onBack }: DocumentAnalysisProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  const [templates] = useState<AnalysisTemplate[]>([
    { id: 'general', name: 'Allgemeine Analyse', description: 'Zusammenfassung, Hauptinhalte, Auff\u00e4lligkeiten', icon: 'search' },
    { id: 'financial', name: 'Finanzanalyse', description: 'KPIs, Trends, Empfehlungen', icon: 'trending-up' },
    { id: 'contract', name: 'Vertragspr\u00fcfung', description: 'Klauseln, Fristen, Risiken', icon: 'file-text' },
    { id: 'data', name: 'Datenauswertung', description: 'Statistik, Muster, Insights', icon: 'bar-chart' },
    { id: 'summary', name: 'Schnellzusammenfassung', description: 'Kernaussagen in K\u00fcrze', icon: 'zap' },
  ]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('template', selectedTemplate);
      if (customPrompt.trim()) {
        formData.append('customPrompt', customPrompt.trim());
      }

      const response = await axios.post('/api/documents/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 min timeout for large documents
      });

      if (response.data.success) {
        setResult(response.data.data);
        showToast('Analyse abgeschlossen', 'success');
      } else {
        throw new Error('Analyse fehlgeschlagen');
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: { message?: string } })?.error?.message || err.message
        : 'Analyse fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile, selectedTemplate, customPrompt]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setResult(null);
    setCustomPrompt('');
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

  return (
    <div className="doc-analysis">
      {/* Header */}
      <header className="doc-analysis-header">
        <div className="doc-analysis-header-left">
          <button type="button" className="back-button" onClick={onBack}>
            \u2190 Zur\u00fcck
          </button>
          <h1>Dokument-Analyse</h1>
          <span className="doc-analysis-badge">KI-gest\u00fctzt</span>
        </div>
      </header>

      <div className="doc-analysis-content">
        {/* Upload Section */}
        {!result && (
          <section className="doc-analysis-upload-section">
            <div className="doc-analysis-upload-area">
              <h2>Dokument hochladen</h2>
              <p className="doc-analysis-upload-hint">
                Lade ein PDF, Excel oder CSV hoch und erhalte eine KI-gest\u00fctzte Analyse.
              </p>

              <DocumentUpload
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                disabled={isAnalyzing}
              />
            </div>

            {/* Template Selection */}
            {selectedFile && (
              <div className="doc-analysis-options">
                <h3>Analyse-Typ w\u00e4hlen</h3>
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
                </div>

                {/* Custom Prompt (optional) */}
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

                {/* Analyze Button */}
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

        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="doc-analysis-progress">
            <div className="doc-analysis-progress-inner">
              <span className="doc-analysis-spinner large" />
              <h3>Dokument wird analysiert...</h3>
              <p>Claude liest und analysiert dein Dokument. Das kann bei gro\u00dfen Dateien etwas dauern.</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <section className="doc-analysis-results">
            {/* Result Header */}
            <div className="doc-analysis-result-header">
              <div className="doc-analysis-result-info">
                <h2>{result.filename}</h2>
                <div className="doc-analysis-result-meta">
                  <span className="doc-result-tag">{result.documentType}</span>
                  <span className="doc-result-meta-item">
                    {(result.metadata.fileSize / 1024).toFixed(0)} KB
                  </span>
                  <span className="doc-result-meta-item">
                    {(result.metadata.processingTimeMs / 1000).toFixed(1)}s Analyse
                  </span>
                  {result.metadata.tokenUsage && (
                    <span className="doc-result-meta-item">
                      {result.metadata.tokenUsage.input + result.metadata.tokenUsage.output} Tokens
                    </span>
                  )}
                </div>
                {/* Sheet info for Excel */}
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
                  title="Als Artifact \u00f6ffnen"
                >
                  Artifact
                </button>
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
