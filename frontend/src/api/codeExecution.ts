/**
 * Code Execution API Service
 *
 * Client-side API for the secure code execution service.
 * Handles all code-related API calls with proper typing.
 */

import axios from 'axios';

// ===========================================
// Types
// ===========================================

export type SupportedLanguage = 'python' | 'nodejs' | 'bash';

export interface ExecuteCodeRequest {
  /** Natural language task description */
  task: string;
  /** Programming language */
  language: SupportedLanguage;
  /** Optional additional context */
  context?: string;
  /** Optional input data to process */
  inputData?: string;
}

export interface RunCodeRequest {
  /** Source code to execute */
  code: string;
  /** Programming language */
  language: SupportedLanguage;
}

export interface ValidateCodeRequest {
  /** Source code to validate */
  code: string;
  /** Programming language */
  language: SupportedLanguage;
}

export interface CodeExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Generated/executed code */
  code?: string;
  /** Programming language */
  language?: SupportedLanguage;
  /** Explanation of what the code does */
  explanation?: string;
  /** Execution output (stdout) */
  output?: string;
  /** Execution errors (stderr) */
  errors?: string;
  /** Exit code */
  exitCode?: number;
  /** Execution time in ms */
  executionTimeMs?: number;
  /** Safety warnings */
  warnings?: string[];
  /** Error message if failed */
  error?: string;
  /** Detailed error info */
  errorDetails?: string;
}

export interface SafetyViolation {
  type: string;
  message: string;
  line?: number;
  snippet?: string;
}

export interface SafetyWarning {
  type: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  safe: boolean;
  score: number;
  violations: SafetyViolation[];
  warnings: SafetyWarning[];
}

export interface CodeExecutionHealth {
  available: boolean;
  enabled: boolean;
  dockerRunning: boolean;
  error?: string;
}

export interface LanguageInfo {
  id: string;
  name: string;
  extension: string;
  availablePackages: string[];
}

// ===========================================
// API Functions
// ===========================================

/**
 * Execute code from a natural language task description
 */
export async function executeCode(
  request: ExecuteCodeRequest
): Promise<CodeExecutionResult> {
  const response = await axios.post<{ success: boolean; data: CodeExecutionResult }>(
    '/api/code/execute',
    request
  );
  return response.data.data;
}

/**
 * Execute pre-written code directly
 */
export async function runCode(
  request: RunCodeRequest
): Promise<CodeExecutionResult> {
  const response = await axios.post<{ success: boolean; data: CodeExecutionResult }>(
    '/api/code/run',
    request
  );
  return response.data.data;
}

/**
 * Validate code for security without executing
 */
export async function validateCode(
  request: ValidateCodeRequest
): Promise<ValidationResult> {
  const response = await axios.post<{ success: boolean; data: ValidationResult }>(
    '/api/code/validate',
    request
  );
  return response.data.data;
}

/**
 * Check code execution service health
 */
export async function checkCodeHealth(): Promise<CodeExecutionHealth> {
  const response = await axios.get<{ success: boolean; data: CodeExecutionHealth }>(
    '/api/code/health'
  );
  return response.data.data;
}

/**
 * Get list of supported languages
 */
export async function getLanguages(): Promise<{
  languages: LanguageInfo[];
  enabled: boolean;
}> {
  const response = await axios.get<{
    success: boolean;
    data: { languages: LanguageInfo[]; enabled: boolean };
  }>('/api/code/languages');
  return response.data.data;
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Check if a language is supported
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return ['python', 'nodejs', 'bash'].includes(lang);
}

/**
 * Get display name for a language
 */
export function getLanguageDisplayName(lang: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    python: 'Python',
    nodejs: 'Node.js',
    bash: 'Bash',
  };
  return names[lang] || lang;
}

/**
 * Detect language from code content (basic heuristics)
 */
export function detectLanguage(code: string): SupportedLanguage | null {
  // Python indicators
  if (
    code.includes('def ') ||
    code.includes('import ') ||
    code.includes('print(') ||
    code.match(/^\s*#.*python/mi)
  ) {
    return 'python';
  }

  // Node.js indicators
  if (
    code.includes('const ') ||
    code.includes('require(') ||
    code.includes('console.log') ||
    code.includes('module.exports')
  ) {
    return 'nodejs';
  }

  // Bash indicators
  if (
    code.includes('#!/bin/') ||
    code.includes('echo ') ||
    code.match(/^\s*#.*bash/mi)
  ) {
    return 'bash';
  }

  return null;
}
