/**
 * Project Context Tool Handlers
 *
 * Implements project/workspace analysis Claude Tool Use handlers:
 * - Full project analysis
 * - Quick project summary
 * - File structure listing
 *
 * @module services/tool-handlers/project-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import * as projectContext from '../project-context';
import path from 'path';

/**
 * Validate a project path from tool input to prevent path traversal.
 * Returns the resolved path or throws an error string for the tool response.
 */
export function validateToolProjectPath(inputPath: string): string {
  if (inputPath.includes('\0')) {
    throw new Error('Ungültiger Pfad: Null-Bytes nicht erlaubt.');
  }
  if (!path.isAbsolute(inputPath)) {
    throw new Error('Projektpfad muss ein absoluter Pfad sein.');
  }
  const resolved = path.resolve(inputPath);
  const blockedPrefixes = ['/etc', '/proc', '/sys', '/dev', '/var/run'];
  for (const blocked of blockedPrefixes) {
    if (resolved.startsWith(blocked)) {
      throw new Error(`Zugriff verweigert: ${blocked} ist ein eingeschränkter Pfad.`);
    }
  }
  return resolved;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Analyze project handler - provides comprehensive project analysis
 * Returns detailed information about project structure, dependencies, and patterns
 */
export async function handleAnalyzeProject(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const projectPath = input.project_path as string;
  const includeReadme = input.include_readme !== 'false';

  if (!projectPath || typeof projectPath !== 'string') {
    return 'Fehler: Kein Projektpfad angegeben.';
  }

  let safePath: string;
  try {
    safePath = validateToolProjectPath(projectPath);
  } catch (e) {
    return `Fehler: ${e instanceof Error ? e.message : 'Ungültiger Pfad'}`;
  }

  logger.debug('Tool: analyze_project', { projectPath: safePath, includeReadme });

  try {
    const context = await projectContext.generateProjectContext(safePath);

    // Build response
    const parts: string[] = [context.summary];

    if (context.keyFiles.length > 0) {
      parts.push('\n## Wichtige Dateien');
      parts.push(context.keyFiles.map((f) => `• ${f}`).join('\n'));
    }

    if (context.techStack.length > 0) {
      parts.push('\n## Tech Stack');
      parts.push(context.techStack.join(', '));
    }

    if (context.focusAreas.length > 0) {
      parts.push('\n## Empfohlene Fokus-Bereiche');
      parts.push(context.focusAreas.map((a) => `• ${a}`).join('\n'));
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool analyze_project failed', error instanceof Error ? error : undefined);
    return `Fehler beim Analysieren des Projekts: ${projectPath}. Stelle sicher, dass der Pfad existiert.`;
  }
}

/**
 * Get project summary handler - quick project overview
 */
export async function handleProjectSummary(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const projectPath = input.project_path as string;

  if (!projectPath || typeof projectPath !== 'string') {
    return 'Fehler: Kein Projektpfad angegeben.';
  }

  let safePath: string;
  try {
    safePath = validateToolProjectPath(projectPath);
  } catch (e) {
    return `Fehler: ${e instanceof Error ? e.message : 'Ungültiger Pfad'}`;
  }

  logger.debug('Tool: get_project_summary', { projectPath: safePath });

  try {
    const summary = await projectContext.getQuickProjectSummary(safePath);
    return summary;
  } catch (error) {
    logger.error('Tool get_project_summary failed', error instanceof Error ? error : undefined);
    return `Fehler: Projekt nicht gefunden unter ${projectPath}`;
  }
}

/**
 * List project files handler - get project file structure
 */
export async function handleListProjectFiles(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const projectPath = input.project_path as string;
  const maxDepth = Math.min(Math.max(1, (input.max_depth as number) || 3), 10);
  const filterExtension = input.filter_extension as string | undefined;

  if (!projectPath || typeof projectPath !== 'string') {
    return 'Fehler: Kein Projektpfad angegeben.';
  }

  let safePath: string;
  try {
    safePath = validateToolProjectPath(projectPath);
  } catch (e) {
    return `Fehler: ${e instanceof Error ? e.message : 'Ungültiger Pfad'}`;
  }

  logger.debug('Tool: list_project_files', { projectPath: safePath, maxDepth, filterExtension });

  try {
    const structure = await projectContext.scanProjectStructure(safePath, maxDepth);

    let files = structure.files.filter((f) => f.type === 'file');

    // Filter by extension if specified
    if (filterExtension) {
      const ext = filterExtension.startsWith('.') ? filterExtension.slice(1) : filterExtension;
      files = files.filter((f) => f.extension === ext);
    }

    // Build tree-like output
    const parts: string[] = [
      `📁 **${structure.rootPath}**`,
      `📊 ${structure.totalFiles} Dateien, ${structure.totalDirectories} Verzeichnisse`,
      '',
    ];

    // Group files by directory
    const filesByDir: Record<string, projectContext.ProjectFile[]> = { '/': [] };

    for (const file of files) {
      const dir = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '/';
      if (!filesByDir[dir]) {
        filesByDir[dir] = [];
      }
      filesByDir[dir].push(file);
    }

    // Sort directories and output
    const sortedDirs = Object.keys(filesByDir).sort();

    for (const dir of sortedDirs.slice(0, 20)) {
      if (dir !== '/') {
        parts.push(`📂 ${dir}/`);
      }
      for (const file of filesByDir[dir].slice(0, 10)) {
        const indent = dir === '/' ? '' : '  ';
        const sizeStr = file.size ? ` (${formatFileSize(file.size)})` : '';
        parts.push(`${indent}📄 ${file.name}${sizeStr}`);
      }
      if (filesByDir[dir].length > 10) {
        parts.push(`  ... und ${filesByDir[dir].length - 10} weitere`);
      }
    }

    if (sortedDirs.length > 20) {
      parts.push(`\n... und ${sortedDirs.length - 20} weitere Verzeichnisse`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool list_project_files failed', error instanceof Error ? error : undefined);
    return `Fehler beim Lesen des Verzeichnisses: ${projectPath}`;
  }
}
