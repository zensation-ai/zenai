/**
 * Phase Security Sprint 4: Secrets Manager Service
 *
 * Centralized secrets management for the application.
 * All secrets are loaded from environment variables only - no hardcoded values.
 *
 * Features:
 * - Centralized secrets definitions for database, auth, AI, cache, storage
 * - Startup validation for required secrets (fails fast if missing)
 * - Production-specific validation for production-required secrets
 * - Format validators for different secret types
 * - In-memory caching to avoid repeated env reads
 * - SIGHUP handler for secrets rotation support
 * - Health check functions for monitoring
 */

import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Secret categories for organization and validation
 */
export enum SecretCategory {
  DATABASE = 'database',
  AUTH = 'auth',
  AI = 'ai',
  CACHE = 'cache',
  STORAGE = 'storage',
  SERVER = 'server',
}

/**
 * Secret requirement levels
 */
export enum SecretRequirement {
  REQUIRED = 'required',           // Always required - fail fast if missing
  PRODUCTION_REQUIRED = 'production_required',  // Required in production only
  OPTIONAL = 'optional',           // Nice to have, has fallback
}

/**
 * Secret format types for validation
 */
export enum SecretFormat {
  STRING = 'string',               // Any non-empty string
  URL = 'url',                     // Valid URL format
  DATABASE_URL = 'database_url',   // PostgreSQL connection string
  REDIS_URL = 'redis_url',         // Redis connection string
  API_KEY = 'api_key',             // API key format (various patterns)
  JWT_SECRET = 'jwt_secret',       // Minimum entropy requirement
  PORT = 'port',                   // Valid port number (1-65535)
  LOG_LEVEL = 'log_level',         // Valid log level
  BOOLEAN = 'boolean',             // true/false/1/0
  COMMA_LIST = 'comma_list',       // Comma-separated values
}

/**
 * Secret definition
 */
interface SecretDefinition {
  key: string;
  category: SecretCategory;
  requirement: SecretRequirement;
  format: SecretFormat;
  description: string;
  minLength?: number;
  pattern?: RegExp;
  validator?: (value: string) => boolean;
  redactInLogs?: boolean;  // Default true for security
}

/**
 * Validation result for a single secret
 */
interface SecretValidationResult {
  key: string;
  valid: boolean;
  present: boolean;
  error?: string;
  category: SecretCategory;
  requirement: SecretRequirement;
}

/**
 * Overall secrets health status
 */
export interface SecretsHealthStatus {
  healthy: boolean;
  totalSecrets: number;
  validSecrets: number;
  missingRequired: string[];
  missingProductionRequired: string[];
  invalidFormat: string[];
  warnings: string[];
  lastRotation: Date | null;
  lastValidation: Date;
}

// ===========================================
// Secret Definitions
// ===========================================

const SECRET_DEFINITIONS: SecretDefinition[] = [
  // Database Secrets
  {
    key: 'DATABASE_URL',
    category: SecretCategory.DATABASE,
    requirement: SecretRequirement.REQUIRED,
    format: SecretFormat.DATABASE_URL,
    description: 'Primary PostgreSQL database connection URL',
    redactInLogs: true,
  },
  {
    key: 'SUPABASE_URL',
    category: SecretCategory.DATABASE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.URL,
    description: 'Supabase project URL for vector search',
    redactInLogs: false,
  },
  {
    key: 'SUPABASE_SERVICE_KEY',
    category: SecretCategory.DATABASE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.API_KEY,
    description: 'Supabase service role key',
    redactInLogs: true,
  },
  {
    key: 'SUPABASE_DB_URL',
    category: SecretCategory.DATABASE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.DATABASE_URL,
    description: 'Supabase direct database connection URL',
    redactInLogs: true,
  },

  // Auth Secrets
  {
    key: 'JWT_SECRET',
    category: SecretCategory.AUTH,
    requirement: SecretRequirement.PRODUCTION_REQUIRED,
    format: SecretFormat.JWT_SECRET,
    description: 'Secret key for JWT token signing',
    minLength: 32,
    redactInLogs: true,
  },
  {
    key: 'API_KEY',
    category: SecretCategory.AUTH,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'Legacy API key for external access',
    redactInLogs: true,
  },

  // AI Service Secrets
  {
    key: 'OPENAI_API_KEY',
    category: SecretCategory.AI,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.API_KEY,
    description: 'OpenAI API key for GPT models',
    pattern: /^sk-[a-zA-Z0-9-_]+$/,
    redactInLogs: true,
  },
  {
    key: 'OPENAI_MODEL',
    category: SecretCategory.AI,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'OpenAI model to use (e.g., gpt-4o-mini)',
    redactInLogs: false,
  },
  {
    key: 'OLLAMA_URL',
    category: SecretCategory.AI,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.URL,
    description: 'Local Ollama server URL',
    redactInLogs: false,
  },
  {
    key: 'ANTHROPIC_API_KEY',
    category: SecretCategory.AI,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.API_KEY,
    description: 'Anthropic API key for Claude models',
    pattern: /^sk-ant-[a-zA-Z0-9-_]+$/,
    redactInLogs: true,
  },

  // Cache Secrets
  {
    key: 'REDIS_URL',
    category: SecretCategory.CACHE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.REDIS_URL,
    description: 'Redis connection URL for caching',
    redactInLogs: true,
  },
  {
    key: 'CACHE_DEFAULT_TTL',
    category: SecretCategory.CACHE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'Default cache TTL in seconds',
    pattern: /^\d+$/,
    redactInLogs: false,
  },
  {
    key: 'CACHE_EMBEDDING_TTL',
    category: SecretCategory.CACHE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'Embedding cache TTL in seconds',
    pattern: /^\d+$/,
    redactInLogs: false,
  },

  // Storage Secrets
  {
    key: 'S3_BUCKET',
    category: SecretCategory.STORAGE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'S3 bucket name for file storage',
    redactInLogs: false,
  },
  {
    key: 'S3_REGION',
    category: SecretCategory.STORAGE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'S3 region (e.g., eu-central-1)',
    redactInLogs: false,
  },
  {
    key: 'S3_ACCESS_KEY',
    category: SecretCategory.STORAGE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'S3 access key ID',
    redactInLogs: true,
  },
  {
    key: 'S3_SECRET_KEY',
    category: SecretCategory.STORAGE,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'S3 secret access key',
    redactInLogs: true,
  },

  // Server Secrets
  {
    key: 'PORT',
    category: SecretCategory.SERVER,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.PORT,
    description: 'Server port number',
    redactInLogs: false,
  },
  {
    key: 'NODE_ENV',
    category: SecretCategory.SERVER,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.STRING,
    description: 'Node environment (development/production/test)',
    pattern: /^(development|production|test)$/,
    redactInLogs: false,
  },
  {
    key: 'ALLOWED_ORIGINS',
    category: SecretCategory.SERVER,
    requirement: SecretRequirement.PRODUCTION_REQUIRED,
    format: SecretFormat.COMMA_LIST,
    description: 'Comma-separated list of allowed CORS origins',
    redactInLogs: false,
  },
  {
    key: 'LOG_LEVEL',
    category: SecretCategory.SERVER,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.LOG_LEVEL,
    description: 'Logging verbosity level',
    redactInLogs: false,
  },
  {
    key: 'ALLOW_DEV_BYPASS',
    category: SecretCategory.SERVER,
    requirement: SecretRequirement.OPTIONAL,
    format: SecretFormat.BOOLEAN,
    description: 'Allow development bypass for auth (dangerous)',
    redactInLogs: false,
  },
];

// ===========================================
// Format Validators
// ===========================================

const FORMAT_VALIDATORS: Record<SecretFormat, (value: string, def: SecretDefinition) => { valid: boolean; error?: string }> = {
  [SecretFormat.STRING]: (value: string, def: SecretDefinition) => {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: 'Value cannot be empty' };
    }
    if (def.minLength && value.length < def.minLength) {
      return { valid: false, error: `Value must be at least ${def.minLength} characters` };
    }
    if (def.pattern && !def.pattern.test(value)) {
      return { valid: false, error: 'Value does not match expected pattern' };
    }
    return { valid: true };
  },

  [SecretFormat.URL]: (value: string) => {
    try {
      new URL(value);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  },

  [SecretFormat.DATABASE_URL]: (value: string) => {
    try {
      const url = new URL(value);
      if (!url.protocol.startsWith('postgres')) {
        return { valid: false, error: 'Database URL must use postgresql:// or postgres:// protocol' };
      }
      if (!url.hostname) {
        return { valid: false, error: 'Database URL must include hostname' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid database URL format' };
    }
  },

  [SecretFormat.REDIS_URL]: (value: string) => {
    try {
      const url = new URL(value);
      if (!url.protocol.startsWith('redis')) {
        return { valid: false, error: 'Redis URL must use redis:// or rediss:// protocol' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid Redis URL format' };
    }
  },

  [SecretFormat.API_KEY]: (value: string, def: SecretDefinition) => {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }
    if (def.pattern && !def.pattern.test(value)) {
      return { valid: false, error: 'API key does not match expected format' };
    }
    // General API key validation: should be at least 20 chars
    if (value.length < 20) {
      return { valid: false, error: 'API key seems too short (minimum 20 characters)' };
    }
    return { valid: true };
  },

  [SecretFormat.JWT_SECRET]: (value: string, def: SecretDefinition) => {
    const minLength = def.minLength || 32;
    if (value.length < minLength) {
      return { valid: false, error: `JWT secret must be at least ${minLength} characters for security` };
    }
    // Check for common weak secrets
    const weakSecrets = ['secret', 'password', 'change-me', 'your-secret', 'jwt-secret'];
    if (weakSecrets.some(weak => value.toLowerCase().includes(weak))) {
      return { valid: false, error: 'JWT secret appears to be a placeholder or weak value' };
    }
    return { valid: true };
  },

  [SecretFormat.PORT]: (value: string) => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, error: 'Port must be a number between 1 and 65535' };
    }
    return { valid: true };
  },

  [SecretFormat.LOG_LEVEL]: (value: string) => {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(value.toLowerCase())) {
      return { valid: false, error: `Log level must be one of: ${validLevels.join(', ')}` };
    }
    return { valid: true };
  },

  [SecretFormat.BOOLEAN]: (value: string) => {
    const validValues = ['true', 'false', '1', '0', 'yes', 'no'];
    if (!validValues.includes(value.toLowerCase())) {
      return { valid: false, error: 'Boolean value must be true/false, 1/0, or yes/no' };
    }
    return { valid: true };
  },

  [SecretFormat.COMMA_LIST]: (value: string) => {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: 'Comma list cannot be empty' };
    }
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    if (items.length === 0) {
      return { valid: false, error: 'Comma list must contain at least one item' };
    }
    return { valid: true };
  },
};

// ===========================================
// Secrets Manager Class
// ===========================================

class SecretsManager {
  private cache: Map<string, string> = new Map();
  private lastRotation: Date | null = null;
  private lastValidation: Date | null = null;
  private initialized = false;
  private validationResults: Map<string, SecretValidationResult> = new Map();

  constructor() {
    this.setupSighupHandler();
  }

  /**
   * Initialize the secrets manager
   * Should be called at application startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('SecretsManager already initialized', { operation: 'secretsManager' });
      return;
    }

    logger.info('Initializing SecretsManager...', { operation: 'secretsManager' });

    // Load all secrets into cache
    this.loadSecretsIntoCache();

    // Validate all secrets
    const validation = this.validateAllSecrets();

    // Check for critical failures
    if (validation.missingRequired.length > 0) {
      const error = new Error(
        `Missing required secrets: ${validation.missingRequired.join(', ')}`
      );
      logger.error('SecretsManager initialization failed', error, {
        operation: 'secretsManager',
        missingSecrets: validation.missingRequired,
      });
      throw error;
    }

    // Check production requirements
    if (this.isProduction() && validation.missingProductionRequired.length > 0) {
      const error = new Error(
        `Missing production-required secrets: ${validation.missingProductionRequired.join(', ')}`
      );
      logger.error('SecretsManager initialization failed in production', error, {
        operation: 'secretsManager',
        missingSecrets: validation.missingProductionRequired,
      });
      throw error;
    }

    // Log warnings for invalid formats (non-fatal)
    if (validation.invalidFormat.length > 0) {
      logger.warn('Some secrets have invalid formats', {
        operation: 'secretsManager',
        invalidSecrets: validation.invalidFormat,
      });
    }

    // Log warnings
    validation.warnings.forEach(warning => {
      logger.warn(warning, { operation: 'secretsManager' });
    });

    this.initialized = true;
    this.lastValidation = new Date();

    logger.info('SecretsManager initialized successfully', {
      operation: 'secretsManager',
      totalSecrets: validation.totalSecrets,
      validSecrets: validation.validSecrets,
      warnings: validation.warnings.length,
    });
  }

  /**
   * Load all defined secrets into memory cache
   */
  private loadSecretsIntoCache(): void {
    this.cache.clear();

    for (const def of SECRET_DEFINITIONS) {
      const value = process.env[def.key];
      if (value !== undefined) {
        this.cache.set(def.key, value);
      }
    }

    logger.debug('Secrets loaded into cache', {
      operation: 'secretsManager',
      cachedCount: this.cache.size,
    });
  }

  /**
   * Validate all secrets and return health status
   */
  validateAllSecrets(): SecretsHealthStatus {
    const missingRequired: string[] = [];
    const missingProductionRequired: string[] = [];
    const invalidFormat: string[] = [];
    const warnings: string[] = [];
    let validSecrets = 0;

    this.validationResults.clear();

    for (const def of SECRET_DEFINITIONS) {
      const value = this.cache.get(def.key);
      const result: SecretValidationResult = {
        key: def.key,
        valid: false,
        present: value !== undefined,
        category: def.category,
        requirement: def.requirement,
      };

      if (!value) {
        // Check requirement level
        if (def.requirement === SecretRequirement.REQUIRED) {
          missingRequired.push(def.key);
          result.error = 'Required secret is missing';
        } else if (def.requirement === SecretRequirement.PRODUCTION_REQUIRED) {
          missingProductionRequired.push(def.key);
          result.error = 'Production-required secret is missing';
        }
        // Optional secrets without value are still "valid" in a sense
        if (def.requirement === SecretRequirement.OPTIONAL) {
          result.valid = true;
        }
      } else {
        // Validate format
        const validator = FORMAT_VALIDATORS[def.format];
        const formatResult = validator(value, def);

        if (!formatResult.valid) {
          invalidFormat.push(def.key);
          result.error = formatResult.error;
        } else {
          result.valid = true;
          validSecrets++;
        }

        // Run custom validator if present
        if (def.validator && !def.validator(value)) {
          result.valid = false;
          invalidFormat.push(def.key);
          result.error = 'Custom validation failed';
        }
      }

      this.validationResults.set(def.key, result);
    }

    // Add specific warnings
    if (this.isProduction()) {
      if (!this.cache.get('ALLOWED_ORIGINS')) {
        warnings.push('ALLOWED_ORIGINS not set in production - using default origins');
      }
      if (this.cache.get('ALLOW_DEV_BYPASS') === 'true') {
        warnings.push('SECURITY WARNING: ALLOW_DEV_BYPASS is enabled in production!');
      }
      if (!this.cache.get('REDIS_URL')) {
        warnings.push('REDIS_URL not configured - caching will be disabled');
      }
    }

    // Check if at least one AI provider is configured
    if (!this.cache.get('OPENAI_API_KEY') && !this.cache.get('OLLAMA_URL')) {
      warnings.push('No AI provider configured (OPENAI_API_KEY or OLLAMA_URL) - AI features will be limited');
    }

    this.lastValidation = new Date();

    return {
      healthy: missingRequired.length === 0 &&
               (this.isProduction() ? missingProductionRequired.length === 0 : true),
      totalSecrets: SECRET_DEFINITIONS.length,
      validSecrets,
      missingRequired,
      missingProductionRequired,
      invalidFormat,
      warnings,
      lastRotation: this.lastRotation,
      lastValidation: this.lastValidation,
    };
  }

  /**
   * Get a secret value from cache
   * Returns undefined if not present
   */
  get(key: string): string | undefined {
    if (!this.initialized) {
      logger.warn('SecretsManager accessed before initialization', {
        operation: 'secretsManager',
        key,
      });
    }
    return this.cache.get(key);
  }

  /**
   * Get a secret value with a default fallback
   */
  getOrDefault(key: string, defaultValue: string): string {
    return this.cache.get(key) ?? defaultValue;
  }

  /**
   * Get a required secret - throws if missing
   */
  getRequired(key: string): string {
    const value = this.cache.get(key);
    if (value === undefined) {
      throw new Error(`Required secret '${key}' is not configured`);
    }
    return value;
  }

  /**
   * Check if a secret is present
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get all secrets for a specific category
   */
  getByCategory(category: SecretCategory): Map<string, string | undefined> {
    const result = new Map<string, string | undefined>();
    for (const def of SECRET_DEFINITIONS) {
      if (def.category === category) {
        result.set(def.key, this.cache.get(def.key));
      }
    }
    return result;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    const nodeEnv = this.cache.get('NODE_ENV') || process.env.NODE_ENV;
    return nodeEnv === 'production' ||
           !!process.env.RAILWAY_ENVIRONMENT ||
           !!process.env.VERCEL;
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    const nodeEnv = this.cache.get('NODE_ENV') || process.env.NODE_ENV;
    return nodeEnv === 'development';
  }

  /**
   * Check if running in test environment
   */
  isTest(): boolean {
    const nodeEnv = this.cache.get('NODE_ENV') || process.env.NODE_ENV;
    return nodeEnv === 'test';
  }

  /**
   * Rotate secrets - reload from environment
   * This is triggered by SIGHUP signal
   */
  async rotateSecrets(): Promise<SecretsHealthStatus> {
    logger.info('Rotating secrets...', { operation: 'secretsManager' });

    // Store old cache for comparison
    const oldCache = new Map(this.cache);

    // Reload from environment
    this.loadSecretsIntoCache();

    // Track what changed
    const changed: string[] = [];
    for (const [key, value] of this.cache) {
      if (oldCache.get(key) !== value) {
        changed.push(key);
      }
    }

    // Check for removed secrets
    for (const key of oldCache.keys()) {
      if (!this.cache.has(key)) {
        changed.push(key);
      }
    }

    this.lastRotation = new Date();

    // Validate after rotation
    const health = this.validateAllSecrets();

    if (changed.length > 0) {
      logger.info('Secrets rotated', {
        operation: 'secretsManager',
        changedCount: changed.length,
        // Don't log actual keys for security
      });
    } else {
      logger.info('Secrets rotation complete - no changes detected', {
        operation: 'secretsManager',
      });
    }

    return health;
  }

  /**
   * Setup SIGHUP signal handler for secrets rotation
   */
  private setupSighupHandler(): void {
    process.on('SIGHUP', () => {
      logger.info('Received SIGHUP - triggering secrets rotation', {
        operation: 'secretsManager',
      });
      this.rotateSecrets().catch(err => {
        logger.error('Secrets rotation failed', err instanceof Error ? err : undefined, {
          operation: 'secretsManager',
        });
      });
    });
  }

  /**
   * Get health check status for monitoring
   */
  getHealthStatus(): SecretsHealthStatus {
    return this.validateAllSecrets();
  }

  /**
   * Get a summary for health endpoints (safe to expose)
   */
  getHealthSummary(): {
    healthy: boolean;
    initialized: boolean;
    secretsConfigured: number;
    lastRotation: string | null;
    lastValidation: string | null;
    categories: Record<string, { configured: number; total: number }>;
  } {
    const categoryStats: Record<string, { configured: number; total: number }> = {};

    for (const category of Object.values(SecretCategory)) {
      categoryStats[category] = { configured: 0, total: 0 };
    }

    for (const def of SECRET_DEFINITIONS) {
      categoryStats[def.category].total++;
      if (this.cache.has(def.key)) {
        categoryStats[def.category].configured++;
      }
    }

    const health = this.validateAllSecrets();

    return {
      healthy: health.healthy,
      initialized: this.initialized,
      secretsConfigured: this.cache.size,
      lastRotation: this.lastRotation?.toISOString() || null,
      lastValidation: this.lastValidation?.toISOString() || null,
      categories: categoryStats,
    };
  }

  /**
   * Get validation result for a specific secret
   */
  getValidationResult(key: string): SecretValidationResult | undefined {
    return this.validationResults.get(key);
  }

  /**
   * Check if specific secret categories are fully configured
   */
  isCategoryConfigured(category: SecretCategory): boolean {
    const definitions = SECRET_DEFINITIONS.filter(d => d.category === category);
    const required = definitions.filter(
      d => d.requirement === SecretRequirement.REQUIRED ||
           (this.isProduction() && d.requirement === SecretRequirement.PRODUCTION_REQUIRED)
    );

    return required.every(def => this.cache.has(def.key));
  }

  /**
   * Get database configuration status
   */
  getDatabaseStatus(): { configured: boolean; type: 'railway' | 'supabase' | 'local' | 'none' } {
    const databaseUrl = this.cache.get('DATABASE_URL');
    const supabaseUrl = this.cache.get('SUPABASE_DB_URL');

    if (databaseUrl) {
      if (databaseUrl.includes('.railway.')) {
        return { configured: true, type: 'railway' };
      }
      if (databaseUrl.includes('.supabase.')) {
        return { configured: true, type: 'supabase' };
      }
      if (databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')) {
        return { configured: true, type: 'local' };
      }
      return { configured: true, type: 'railway' }; // Default to railway for other URLs
    }

    if (supabaseUrl) {
      return { configured: true, type: 'supabase' };
    }

    return { configured: false, type: 'none' };
  }

  /**
   * Get AI provider status
   */
  getAIProviderStatus(): { configured: boolean; providers: string[] } {
    const providers: string[] = [];

    if (this.cache.get('OPENAI_API_KEY')) {
      providers.push('openai');
    }
    if (this.cache.get('OLLAMA_URL')) {
      providers.push('ollama');
    }
    if (this.cache.get('ANTHROPIC_API_KEY')) {
      providers.push('anthropic');
    }

    return {
      configured: providers.length > 0,
      providers,
    };
  }

  /**
   * Get cache status
   */
  getCacheStatus(): { configured: boolean; type: 'redis' | 'memory' } {
    return {
      configured: this.cache.has('REDIS_URL'),
      type: this.cache.has('REDIS_URL') ? 'redis' : 'memory',
    };
  }

  /**
   * Get storage status
   */
  getStorageStatus(): { configured: boolean; type: 's3' | 'local' } {
    const hasS3 = this.cache.has('S3_BUCKET') &&
                  this.cache.has('S3_ACCESS_KEY') &&
                  this.cache.has('S3_SECRET_KEY');

    return {
      configured: hasS3,
      type: hasS3 ? 's3' : 'local',
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const secretsManager = new SecretsManager();

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Get a secret value
 */
export function getSecret(key: string): string | undefined {
  return secretsManager.get(key);
}

/**
 * Get a secret value with default
 */
export function getSecretOrDefault(key: string, defaultValue: string): string {
  return secretsManager.getOrDefault(key, defaultValue);
}

/**
 * Get a required secret (throws if missing)
 */
export function getRequiredSecret(key: string): string {
  return secretsManager.getRequired(key);
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return secretsManager.isProduction();
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return secretsManager.isDevelopment();
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return secretsManager.isTest();
}

// ===========================================
// Type Exports
// ===========================================

export { SecretDefinition, SecretValidationResult };
