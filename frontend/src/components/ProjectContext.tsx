/**
 * ProjectContext Component
 *
 * Displays project/workspace context information in the chat interface.
 * Helps the AI understand the current codebase being discussed.
 *
 * @module components/ProjectContext
 */

import { useState, useCallback } from 'react';
import { showToast } from './Toast';
import './ProjectContext.css';

interface ProjectInfo {
  name: string;
  version?: string;
  type: string;
  language: string;
  frameworks: string[];
  dependencies: number;
  files: number;
  directories: number;
  patterns: string[];
}

interface ProjectContextProps {
  /** Current AI context */
  context: string;
  /** Callback when project is set */
  onProjectSet?: (path: string, info: ProjectInfo) => void;
  /** Currently active project path */
  currentPath?: string;
}

export function ProjectContext({
  context,
  onProjectSet,
  currentPath,
}: ProjectContextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [projectPath, setProjectPath] = useState(currentPath || '');

  const analyzeProject = useCallback(async (path: string) => {
    if (!path.trim()) {
      showToast('Bitte einen Projektpfad eingeben', 'warning');
      return;
    }

    setIsLoading(true);

    // Create AbortController with timeout to prevent infinite loading states
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(`/api/${context}/project/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectPath: path }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.projectInfo) {
        const info: ProjectInfo = {
          name: data.projectInfo.name,
          version: data.projectInfo.version,
          type: data.projectInfo.type,
          language: data.projectInfo.language,
          frameworks: data.projectInfo.frameworks || [],
          dependencies: data.projectInfo.dependencies?.length || 0,
          files: data.projectInfo.structure?.totalFiles || 0,
          directories: data.projectInfo.structure?.totalDirectories || 0,
          patterns: data.projectInfo.patterns || [],
        };

        setProjectInfo(info);
        setProjectPath(path);
        showToast(`Projekt "${info.name}" analysiert`, 'success');

        if (onProjectSet) {
          onProjectSet(path, info);
        }
      } else {
        throw new Error(data.error || 'Projekt konnte nicht analysiert werden');
      }
    } catch (error) {
      // Don't show error for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        showToast('Analyse abgebrochen (Timeout)', 'warning');
        return;
      }

      console.error('Project analysis failed:', error);
      showToast(
        `Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [context, onProjectSet]);

  const clearProject = useCallback(() => {
    setProjectInfo(null);
    setProjectPath('');
    showToast('Projekt-Kontext entfernt', 'info');
  }, []);

  const getLanguageIcon = (lang: string): string => {
    const icons: Record<string, string> = {
      TypeScript: '💠',
      JavaScript: '📜',
      Python: '🐍',
      Rust: '🦀',
      Go: '🐹',
      Java: '☕',
      'C#': '🎯',
      Ruby: '💎',
      PHP: '🐘',
      Swift: '🍎',
      Kotlin: '🟣',
    };
    return icons[lang] || '📄';
  };

  const getFrameworkBadge = (framework: string): string => {
    const badges: Record<string, string> = {
      react: '⚛️ React',
      nextjs: '▲ Next.js',
      vue: '🟢 Vue',
      angular: '🔴 Angular',
      express: '🚂 Express',
      fastapi: '⚡ FastAPI',
      django: '🎸 Django',
      flask: '🧪 Flask',
    };
    return badges[framework] || framework;
  };

  return (
    <div className={`project-context ${isExpanded ? 'expanded' : ''}`}>
      {/* Toggle Button */}
      <button
        className="project-context-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? 'Projekt-Kontext minimieren' : 'Projekt-Kontext anzeigen'}
      >
        <span className="project-icon">📁</span>
        {projectInfo ? (
          <span className="project-name-mini">
            {getLanguageIcon(projectInfo.language)} {projectInfo.name}
          </span>
        ) : (
          <span className="project-name-mini">Kein Projekt</span>
        )}
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="project-context-panel">
          {/* Input Section */}
          <div className="project-input-section">
            <input
              type="text"
              className="project-path-input"
              placeholder="/pfad/zum/projekt"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  analyzeProject(projectPath);
                }
              }}
              disabled={isLoading}
              aria-label="Projektpfad eingeben"
            />
            <button
              className="project-analyze-btn"
              onClick={() => analyzeProject(projectPath)}
              disabled={isLoading || !projectPath.trim()}
              aria-label="Projekt analysieren"
            >
              {isLoading ? '...' : '🔍'}
            </button>
            {projectInfo && (
              <button
                className="project-clear-btn"
                onClick={clearProject}
                title="Projekt entfernen"
                aria-label="Projekt entfernen"
              >
                ✕
              </button>
            )}
          </div>

          {/* Project Info Section */}
          {projectInfo && (
            <div className="project-info-section">
              <div className="project-header">
                <span className="project-language-icon">
                  {getLanguageIcon(projectInfo.language)}
                </span>
                <h4 className="project-title">
                  {projectInfo.name}
                  {projectInfo.version && (
                    <span className="project-version">v{projectInfo.version}</span>
                  )}
                </h4>
              </div>

              <div className="project-meta">
                <span className="meta-item" title="Sprache">
                  {projectInfo.language}
                </span>
                <span className="meta-item" title="Dateien">
                  📄 {projectInfo.files}
                </span>
                <span className="meta-item" title="Abhängigkeiten">
                  📦 {projectInfo.dependencies}
                </span>
              </div>

              {projectInfo.frameworks.length > 0 && (
                <div className="project-frameworks">
                  {projectInfo.frameworks
                    .filter((f) => f !== 'unknown')
                    .map((f) => (
                      <span key={f} className="framework-badge">
                        {getFrameworkBadge(f)}
                      </span>
                    ))}
                </div>
              )}

              {projectInfo.patterns.length > 0 && (
                <div className="project-patterns">
                  {projectInfo.patterns.slice(0, 4).map((p) => (
                    <span key={p} className="pattern-tag">
                      {p}
                    </span>
                  ))}
                  {projectInfo.patterns.length > 4 && (
                    <span className="pattern-more">
                      +{projectInfo.patterns.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Help Text */}
          {!projectInfo && !isLoading && (
            <p className="project-help">
              Gib einen Projektpfad ein, um den AI-Assistenten über deinen
              Codebase zu informieren. Der Kontext wird in Gesprächen verwendet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectContext;
