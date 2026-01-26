/**
 * Code Generator Module
 *
 * Uses Claude AI to generate executable code from natural language
 * task descriptions. Includes:
 * - Language-specific code generation
 * - Safety-aware prompting
 * - Code validation and extraction
 *
 * @module services/code-execution/code-generator
 */

import { logger } from '../../utils/logger';
import {
  getClaudeClient,
  executeWithProtection,
  CLAUDE_MODEL,
} from '../claude/client';
import {
  CodeGenerationRequest,
  GeneratedCode,
  SupportedLanguage,
  LANGUAGE_CONFIGS,
  MAX_CODE_LENGTH,
} from './types';

// ===========================================
// System Prompts
// ===========================================

/**
 * Base system prompt for code generation
 */
const CODE_GENERATOR_SYSTEM_PROMPT = `Du bist ein Code-Generator. Deine Aufgabe ist es, sicheren, ausführbaren Code zu generieren.

WICHTIGE REGELN:
1. Generiere NUR den Code - keine zusätzlichen Erklärungen im Code selbst
2. Der Code muss eigenständig lauffähig sein (alle nötigen Imports)
3. Verwende NUR Standardbibliotheken oder explizit erlaubte Pakete
4. Füge sinnvolle Fehlerbehandlung hinzu
5. Der Code wird in einer SANDBOX ausgeführt - folgende Einschränkungen:
   - KEIN Dateisystem-Zugriff (außer /tmp)
   - KEIN Netzwerk-Zugriff
   - KEINE Systembefehle oder Prozesse starten
   - KEIN Zugriff auf Umgebungsvariablen
   - KEINE gefährlichen Funktionen (eval, exec, etc.)

AUSGABE als valides JSON:
{
  "code": "der generierte Code als String",
  "explanation": "kurze Erklärung was der Code tut (1-2 Sätze)",
  "estimatedBehavior": "erwartete Ausgabe/Ergebnis",
  "requiredPackages": ["liste", "benötigter", "pakete"],
  "complexity": 3
}

WICHTIG:
- Der "code" Wert muss ein gültiger String sein (Newlines als \\n)
- complexity ist eine Zahl von 1 (trivial) bis 10 (sehr komplex)
- Antworte NUR mit dem JSON, keine Markdown-Formatierung`;

/**
 * Language-specific hints for better code generation
 */
const LANGUAGE_HINTS: Record<SupportedLanguage, string> = {
  python: `PYTHON-SPEZIFISCH:
- Verwende Python 3.11 Syntax
- Nutze f-strings für String-Formatierung
- Verwende type hints wo sinnvoll
- Erlaubte Module: math, json, datetime, collections, itertools, functools, re, random, statistics, decimal, fractions, string, textwrap
- Für numerische Berechnungen: nur math und statistics aus der Standardbibliothek
- VERBOTEN: os, sys, subprocess, socket, requests, urllib, shutil, glob, pathlib, pickle, ctypes`,

  nodejs: `NODE.JS-SPEZIFISCH:
- Verwende Node.js 20 mit CommonJS (require/module.exports)
- Nutze const/let (kein var)
- Verwende async/await für asynchrone Operationen
- Erlaubte Module: path, util, crypto, url, querystring, string_decoder, buffer
- VERBOTEN: child_process, cluster, net, dgram, http, https, fs (außer /tmp), vm, worker_threads
- KEIN fetch() oder externe HTTP-Requests`,

  bash: `BASH-SPEZIFISCH:
- Beginne mit #!/bin/sh oder set -e für Fehlerbehandlung
- Nutze nur POSIX-kompatible Befehle (Alpine Linux)
- Erlaubt: echo, printf, expr, test, [, [[, grep, sed, awk, sort, uniq, wc, head, tail, cut, tr, date, bc
- VERBOTEN: curl, wget, nc, ssh, scp, sudo, chmod, chown, rm (außer /tmp)
- KEINE Netzwerk-Befehle
- KEINE Pfade außerhalb von /tmp`,
};

// ===========================================
// Code Generator Class
// ===========================================

/**
 * Claude-based code generator
 */
export class CodeGenerator {
  /**
   * Generate code from a task description
   *
   * @param request - The code generation request
   * @returns Generated code with metadata
   */
  async generate(request: CodeGenerationRequest): Promise<GeneratedCode> {
    const { task, language, context, inputData } = request;

    logger.info('Generating code', {
      language,
      taskLength: task.length,
      hasContext: !!context,
      hasInputData: !!inputData,
    });

    const userPrompt = this.buildUserPrompt(task, language, context, inputData);

    const client = getClaudeClient();

    return executeWithProtection(async () => {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: CODE_GENERATOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Extract text content
      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Parse and validate response
      const generated = this.parseResponse(content.text, language);

      logger.info('Code generated successfully', {
        language,
        codeLength: generated.code.length,
        complexity: generated.complexity,
        packagesCount: generated.requiredPackages.length,
      });

      return generated;
    });
  }

  /**
   * Build the user prompt for code generation
   */
  private buildUserPrompt(
    task: string,
    language: SupportedLanguage,
    context?: string,
    inputData?: string
  ): string {
    const config = LANGUAGE_CONFIGS[language];
    const languageHint = LANGUAGE_HINTS[language];

    const parts: string[] = [
      `AUFGABE: ${task}`,
      '',
      `SPRACHE: ${config.displayName}`,
      '',
      languageHint,
    ];

    if (context) {
      parts.push('', `ZUSÄTZLICHER KONTEXT: ${context}`);
    }

    if (inputData) {
      parts.push('', `EINGABEDATEN (zum Verarbeiten):\n${inputData}`);
    }

    parts.push('', 'Generiere jetzt den Code als JSON.');

    return parts.join('\n');
  }

  /**
   * Parse and validate the Claude response
   */
  private parseResponse(responseText: string, language: SupportedLanguage): GeneratedCode {
    // Try to extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText;

    // Remove markdown code blocks if present
    const jsonBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    }

    // Try to find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON found in response', undefined, {
        responsePreview: responseText.slice(0, 200),
      });
      throw new Error('No JSON found in Claude response');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      const err = parseError instanceof Error ? parseError : new Error(String(parseError));
      logger.error('Failed to parse JSON', err, {
        jsonPreview: jsonMatch[0].slice(0, 200),
      });
      throw new Error(`Failed to parse code response: ${parseError}`);
    }

    // Validate required fields
    if (!parsed.code || typeof parsed.code !== 'string') {
      throw new Error('Invalid response: missing or invalid "code" field');
    }

    // Validate code length
    if (parsed.code.length > MAX_CODE_LENGTH) {
      throw new Error(`Generated code exceeds maximum length: ${parsed.code.length} > ${MAX_CODE_LENGTH}`);
    }

    // Validate code isn't empty
    if (!parsed.code.trim()) {
      throw new Error('Generated code is empty');
    }

    return {
      code: parsed.code as string,
      language,
      explanation: typeof parsed.explanation === 'string'
        ? parsed.explanation
        : 'No explanation provided',
      estimatedBehavior: typeof parsed.estimatedBehavior === 'string'
        ? parsed.estimatedBehavior
        : 'Unknown',
      requiredPackages: Array.isArray(parsed.requiredPackages)
        ? (parsed.requiredPackages as string[]).filter(p => typeof p === 'string')
        : [],
      complexity: typeof parsed.complexity === 'number'
        ? Math.min(10, Math.max(1, Math.round(parsed.complexity)))
        : 5,
    };
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let generatorInstance: CodeGenerator | null = null;

/**
 * Get the singleton code generator instance
 */
export function getCodeGenerator(): CodeGenerator {
  if (!generatorInstance) {
    generatorInstance = new CodeGenerator();
  }
  return generatorInstance;
}

// ===========================================
// Convenience Function
// ===========================================

/**
 * Generate code from a task description (convenience function)
 *
 * @param task - Natural language task description
 * @param language - Target programming language
 * @param context - Optional additional context
 * @param inputData - Optional input data to process
 * @returns Generated code with metadata
 */
export async function generateCode(
  task: string,
  language: SupportedLanguage,
  context?: string,
  inputData?: string
): Promise<GeneratedCode> {
  const generator = getCodeGenerator();
  return generator.generate({ task, language, context, inputData });
}

