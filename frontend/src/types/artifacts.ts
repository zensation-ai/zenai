/**
 * Artifact Types and Interfaces
 *
 * Defines the structure for interactive artifacts in chat responses.
 * Similar to Claude's Artifacts feature.
 *
 * @module types/artifacts
 */

export type ArtifactType = 'code' | 'markdown' | 'html' | 'mermaid' | 'csv' | 'json';

export interface Artifact {
  /** Unique identifier */
  id: string;
  /** Display title */
  title: string;
  /** Artifact type */
  type: ArtifactType;
  /** Programming language (for code artifacts) */
  language?: string;
  /** Raw content */
  content: string;
  /** Optional description */
  description?: string;
  /** Creation timestamp */
  createdAt?: string;
}

export interface ArtifactMatch {
  /** Full match including markers */
  fullMatch: string;
  /** Artifact data */
  artifact: Artifact;
  /** Start index in original string */
  startIndex: number;
  /** End index in original string */
  endIndex: number;
}

/**
 * Extract artifacts from AI response content
 *
 * Supports formats:
 * - ```language:title\n...\n```
 * - <artifact type="code" language="python" title="Example">...</artifact>
 */
export function extractArtifacts(content: string): { text: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  let processedContent = content;

  // Pattern 1: Code blocks with title - ```python:My Script\n...\n```
  const codeBlockWithTitleRegex = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockWithTitleRegex.exec(content)) !== null) {
    const [fullMatch, language, title, code] = match;
    const artifact: Artifact = {
      id: `artifact-${Date.now()}-${artifacts.length}`,
      title: title.trim(),
      type: 'code',
      language: language.toLowerCase(),
      content: code.trim(),
    };
    artifacts.push(artifact);

    // Replace with artifact reference
    processedContent = processedContent.replace(
      fullMatch,
      `[[ARTIFACT:${artifact.id}]]`
    );
  }

  // Pattern 2: XML-style artifact tags
  const xmlArtifactRegex = /<artifact\s+type="(\w+)"(?:\s+language="(\w+)")?(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<\/artifact>/g;

  while ((match = xmlArtifactRegex.exec(content)) !== null) {
    const [fullMatch, type, language, title, artifactContent] = match;
    const artifact: Artifact = {
      id: `artifact-${Date.now()}-${artifacts.length}`,
      title: title || `${type.charAt(0).toUpperCase() + type.slice(1)} Artifact`,
      type: type as ArtifactType,
      language: language?.toLowerCase(),
      content: artifactContent.trim(),
    };
    artifacts.push(artifact);

    processedContent = processedContent.replace(
      fullMatch,
      `[[ARTIFACT:${artifact.id}]]`
    );
  }

  // Pattern 3: Large code blocks (>20 lines) without explicit title
  // Iterate over original content (like Patterns 1 & 2) to avoid stale regex lastIndex
  // when processedContent is mutated by .replace() during the loop
  const largeCodeBlockRegex = /```(\w+)\n([\s\S]{500,}?)```/g;

  while ((match = largeCodeBlockRegex.exec(content)) !== null) {
    const [fullMatch, language, code] = match;
    // Skip if already replaced by Pattern 1 or 2
    if (!processedContent.includes(fullMatch)) continue;

    const lineCount = code.split('\n').length;
    if (lineCount >= 20) {
      const artifact: Artifact = {
        id: `artifact-${Date.now()}-${artifacts.length}`,
        title: `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
        type: 'code',
        language: language.toLowerCase(),
        content: code.trim(),
      };
      artifacts.push(artifact);

      processedContent = processedContent.replace(
        fullMatch,
        `[[ARTIFACT:${artifact.id}]]`
      );
    }
  }

  return { text: processedContent, artifacts };
}

/**
 * Check if content contains potential artifacts
 */
export function hasArtifacts(content: string): boolean {
  return (
    content.includes('<artifact') ||
    /```\w+:[^\n]+\n/.test(content) ||
    (content.match(/```\w+\n[\s\S]{500,}?```/g)?.length ?? 0) > 0
  );
}

/**
 * Get file extension for artifact type
 */
export function getFileExtension(artifact: Artifact): string {
  if (artifact.language) {
    const extensionMap: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      bash: 'sh',
      shell: 'sh',
      markdown: 'md',
      json: 'json',
      html: 'html',
      css: 'css',
      sql: 'sql',
      yaml: 'yml',
      xml: 'xml',
    };
    return extensionMap[artifact.language] || artifact.language;
  }

  const typeExtensionMap: Record<ArtifactType, string> = {
    code: 'txt',
    markdown: 'md',
    html: 'html',
    mermaid: 'mmd',
    csv: 'csv',
    json: 'json',
  };

  return typeExtensionMap[artifact.type] || 'txt';
}

/**
 * Generate filename for artifact download
 */
export function getArtifactFilename(artifact: Artifact): string {
  const sanitizedTitle = artifact.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const extension = getFileExtension(artifact);
  return `${sanitizedTitle}.${extension}`;
}
