/**
 * Code Execution Tool Handler
 *
 * Implements the code execution Claude Tool Use handler.
 * Executes code in a sandboxed environment (Docker or Judge0).
 *
 * @module services/tool-handlers/code-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { executeCodeDirect, isCodeExecutionEnabled, isSupportedLanguage, SupportedLanguage } from '../code-execution';

/**
 * Handle execute_code tool
 * Executes code in a sandboxed environment
 */
export async function handleExecuteCode(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const code = input.code as string;
  const language = input.language as string;

  // Check if code execution is enabled
  if (!isCodeExecutionEnabled()) {
    return '⚠️ Code-Ausführung ist in dieser Umgebung nicht aktiviert.';
  }

  // Validate input
  if (!code || typeof code !== 'string') {
    return 'Fehler: Kein Code angegeben.';
  }

  if (!language || !isSupportedLanguage(language)) {
    return 'Fehler: Ungültige Sprache. Unterstützt: python, nodejs, bash';
  }

  logger.debug('Tool: execute_code', {
    language,
    codeLength: code.length,
  });

  try {
    const result = await executeCodeDirect(
      code,
      language as SupportedLanguage,
      false // do not skip validation
    );

    // Format output for AI
    const parts: string[] = [];

    if (result.success) {
      parts.push('✅ **Code erfolgreich ausgeführt**');
    } else {
      parts.push('❌ **Code-Ausführung fehlgeschlagen**');
    }

    if (result.executionTimeMs) {
      parts.push(`\n⏱️ Laufzeit: ${result.executionTimeMs}ms`);
    }

    if (result.output) {
      parts.push('\n**Ausgabe (stdout):**');
      parts.push('```');
      parts.push(result.output.substring(0, 5000));
      if (result.output.length > 5000) {
        parts.push('... (gekürzt)');
      }
      parts.push('```');
    }

    if (result.errors) {
      parts.push('\n**Fehlerausgabe (stderr):**');
      parts.push('```');
      parts.push(result.errors.substring(0, 2000));
      if (result.errors.length > 2000) {
        parts.push('... (gekürzt)');
      }
      parts.push('```');
    }

    if (result.error) {
      parts.push(`\n**Fehler:** ${result.error}`);
    }

    if (result.errorDetails) {
      parts.push(`\n**Details:** ${result.errorDetails}`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool execute_code failed', error instanceof Error ? error : undefined);
    return `Fehler bei der Code-Ausführung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}
