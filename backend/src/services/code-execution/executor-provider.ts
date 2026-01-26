/**
 * Executor Provider Interface
 *
 * Defines the contract for code execution providers.
 * Enables switching between Docker (local) and Judge0 (production)
 * without changing the service layer.
 *
 * @module services/code-execution/executor-provider
 */

import { SupportedLanguage, ExecutionOptions, ExecutionResult } from './types';

// ===========================================
// Provider Interface
// ===========================================

/**
 * Abstract interface for code execution providers
 *
 * Implementations:
 * - DockerExecutor: Local Docker-based execution
 * - Judge0Executor: Remote Judge0 API execution
 */
export interface ExecutorProvider {
  /**
   * Provider name for logging and debugging
   */
  readonly name: string;

  /**
   * Execute code and return the result
   *
   * @param code - Source code to execute
   * @param language - Programming language
   * @param options - Execution options (timeout, memory, etc.)
   * @returns Execution result with output and metadata
   */
  execute(
    code: string,
    language: SupportedLanguage,
    options?: Partial<ExecutionOptions>
  ): Promise<ExecutionResult>;

  /**
   * Check if this provider is available and configured
   *
   * @returns true if the provider can execute code
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get supported languages for this provider
   *
   * @returns Array of supported language identifiers
   */
  getSupportedLanguages(): SupportedLanguage[];
}

// ===========================================
// Provider Types
// ===========================================

/**
 * Available execution provider types
 */
export type ExecutorProviderType = 'docker' | 'judge0';

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider type */
  type: ExecutorProviderType;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Provider-specific configuration */
  config: DockerConfig | Judge0Config;
}

/**
 * Docker provider configuration
 */
export interface DockerConfig {
  /** Directory for temporary code files */
  tempDir: string;
  /** Whether to auto-pull missing images */
  pullImages: boolean;
}

/**
 * Judge0 API configuration
 */
export interface Judge0Config {
  /** Judge0 API base URL */
  apiUrl: string;
  /** API key (for RapidAPI or self-hosted with auth) */
  apiKey: string;
  /** RapidAPI host header (if using RapidAPI) */
  rapidApiHost?: string;
  /** Request timeout in milliseconds */
  requestTimeout: number;
  /** Maximum polling attempts for async submissions */
  maxPollingAttempts: number;
  /** Polling interval in milliseconds */
  pollingInterval: number;
}

// ===========================================
// Language Mapping
// ===========================================

/**
 * Judge0 language IDs
 * https://ce.judge0.com/languages
 */
export const JUDGE0_LANGUAGE_IDS: Record<SupportedLanguage, number> = {
  python: 71,   // Python 3.8.1
  nodejs: 63,   // JavaScript (Node.js 12.14.0)
  bash: 46,     // Bash (5.0.0)
};

/**
 * Judge0 language names for display
 */
export const JUDGE0_LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  python: 'Python (3.8.1)',
  nodejs: 'JavaScript (Node.js 12.14.0)',
  bash: 'Bash (5.0.0)',
};

// ===========================================
// Default Configurations
// ===========================================

/**
 * Default Docker configuration
 */
export const DEFAULT_DOCKER_CONFIG: DockerConfig = {
  tempDir: process.env.CODE_SANDBOX_DIR || '/tmp/code-sandbox',
  pullImages: true,
};

/**
 * Default Judge0 configuration
 */
export const DEFAULT_JUDGE0_CONFIG: Judge0Config = {
  apiUrl: process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com',
  apiKey: process.env.JUDGE0_API_KEY || '',
  rapidApiHost: process.env.JUDGE0_RAPIDAPI_HOST || 'judge0-ce.p.rapidapi.com',
  requestTimeout: 30000,
  maxPollingAttempts: 20,
  pollingInterval: 1000,
};

// ===========================================
// Provider Selection Logic
// ===========================================

/**
 * Determine which provider to use based on environment
 *
 * Priority:
 * 1. Explicit EXECUTOR_PROVIDER env var
 * 2. Docker if available (development)
 * 3. Judge0 if configured (production)
 * 4. None (disabled)
 */
export function getPreferredProvider(): ExecutorProviderType | null {
  // Explicit override
  const explicit = process.env.EXECUTOR_PROVIDER as ExecutorProviderType;
  if (explicit && ['docker', 'judge0'].includes(explicit)) {
    return explicit;
  }

  // Production defaults to Judge0
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JUDGE0_API_KEY) {
      return 'judge0';
    }
    return null; // No provider available in production without API key
  }

  // Development defaults to Docker
  return 'docker';
}
