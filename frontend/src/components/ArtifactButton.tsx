/**
 * Inline Artifact Button for embedding in chat messages.
 * Extracted from ArtifactPanel to avoid pulling heavy dependencies
 * (react-syntax-highlighter, react-markdown) into the main bundle.
 */

import type { Artifact } from '../types/artifacts';

interface ArtifactButtonProps {
  artifact: Artifact;
  onClick: () => void;
}

export function ArtifactButton({ artifact, onClick }: ArtifactButtonProps) {
  const getTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      code: '\uD83D\uDCBB',
      markdown: '\uD83D\uDCDD',
      html: '\uD83C\uDF10',
      mermaid: '\uD83D\uDCCA',
      csv: '\uD83D\uDCCA',
      json: '\uD83D\uDCCB',
    };
    return icons[type] || '\uD83D\uDCC4';
  };

  return (
    <button
      className="artifact-inline-btn"
      onClick={onClick}
      aria-label={`${artifact.type} öffnen: ${artifact.title}`}
    >
      <span className="artifact-inline-icon">{getTypeIcon(artifact.type)}</span>
      <span className="artifact-inline-title">{artifact.title}</span>
      <span className="artifact-inline-action">Öffnen →</span>
    </button>
  );
}
