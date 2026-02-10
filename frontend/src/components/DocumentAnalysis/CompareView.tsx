/**
 * CompareView Component
 *
 * Multi-document comparison upload and trigger interface.
 *
 * @module components/DocumentAnalysis/CompareView
 */

import { SimpleFileUpload } from './SimpleFileUpload';

interface CompareViewProps {
  compareFiles: File[];
  customPrompt: string;
  isAnalyzing: boolean;
  onAddCompareFile: (file: File | null) => void;
  onRemoveCompareFile: (index: number) => void;
  onCustomPromptChange: (value: string) => void;
  onCompare: () => void;
  formatFileSize: (bytes: number) => string;
}

export function CompareView({
  compareFiles,
  customPrompt,
  isAnalyzing,
  onAddCompareFile,
  onRemoveCompareFile,
  onCustomPromptChange,
  onCompare,
  formatFileSize,
}: CompareViewProps) {
  return (
    <section className="doc-analysis-upload-section">
      <div className="doc-analysis-upload-area">
        <h2>Dokumente vergleichen</h2>
        <p className="doc-analysis-upload-hint">
          Lade 2-3 Dokumente hoch f{'\u00fc'}r einen KI-gest{'\u00fc'}tzten Vergleich.
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
                  onClick={() => onRemoveCompareFile(index)}
                  disabled={isAnalyzing}
                >
                  {'\u2715'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add file (up to 3) */}
        {compareFiles.length < 3 && (
          <SimpleFileUpload
            onFileSelect={onAddCompareFile}
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
              onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder="z.B. Vergleiche die Umsatzzahlen beider Quartale..."
              rows={2}
              disabled={isAnalyzing}
            />
          </div>

          <button
            type="button"
            className="doc-analysis-submit"
            onClick={onCompare}
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
  );
}
