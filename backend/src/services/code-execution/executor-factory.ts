/**
 * Executor Factory
 *
 * Creates and manages code execution providers with automatic
 * selection based on environment and availability.
 *
 * @module services/code-execution/executor-factory
 */

import { logger } from '../../utils/logger';
import {
  ExecutorProvider,
  ExecutorProviderType,
  getPreferredProvider,
} from './executor-provider';
import { SandboxExecutor, getSandboxExecutor } from './sandbox-executor';
import { Judge0Executor, getJudge0Executor } from './judge0-executor';

// ===========================================
// Executor Factory
// ===========================================

/**
 * Factory for creating and selecting code execution providers
 */
export class ExecutorFactory {
  private static instance: ExecutorFactory;
  private currentProvider: ExecutorProvider | null = null;
  private providerType: ExecutorProviderType | null = null;
  private initialized = false;

  private constructor() {}

  /**
   * Get the singleton factory instance
   */
  static getInstance(): ExecutorFactory {
    if (!ExecutorFactory.instance) {
      ExecutorFactory.instance = new ExecutorFactory();
    }
    return ExecutorFactory.instance;
  }

  /**
   * Initialize the factory and select the best available provider
   *
   * This method:
   * 1. Determines the preferred provider based on environment
   * 2. Tests if the provider is available
   * 3. Falls back to alternatives if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing executor factory...');

    const preferred = getPreferredProvider();
    logger.debug('Preferred provider', { preferred });

    // Try preferred provider first
    if (preferred) {
      const provider = await this.tryProvider(preferred);
      if (provider) {
        this.currentProvider = provider;
        this.providerType = preferred;
        this.initialized = true;
        logger.info('Executor factory initialized', {
          provider: preferred,
          name: provider.name,
        });
        return;
      }
    }

    // Try fallback providers
    const fallbacks: ExecutorProviderType[] = preferred === 'docker'
      ? ['judge0']
      : ['docker'];

    for (const fallback of fallbacks) {
      const provider = await this.tryProvider(fallback);
      if (provider) {
        this.currentProvider = provider;
        this.providerType = fallback;
        this.initialized = true;
        logger.info('Executor factory initialized with fallback', {
          preferred,
          actual: fallback,
          name: provider.name,
        });
        return;
      }
    }

    // No provider available
    this.initialized = true;
    logger.warn('No execution provider available', {
      preferred,
      checkedFallbacks: fallbacks,
    });
  }

  /**
   * Get the current execution provider
   *
   * @throws Error if no provider is available
   */
  async getExecutor(): Promise<ExecutorProvider> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.currentProvider) {
      throw new Error(
        'No code execution provider available. ' +
        'Configure JUDGE0_API_KEY for production or ensure Docker is running for development.'
      );
    }

    return this.currentProvider;
  }

  /**
   * Check if code execution is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.currentProvider !== null;
  }

  /**
   * Get information about the current provider
   */
  getProviderInfo(): {
    available: boolean;
    type: ExecutorProviderType | null;
    name: string | null;
  } {
    return {
      available: this.currentProvider !== null,
      type: this.providerType,
      name: this.currentProvider?.name ?? null,
    };
  }

  /**
   * Force re-initialization (useful after config changes)
   */
  async reinitialize(): Promise<void> {
    this.initialized = false;
    this.currentProvider = null;
    this.providerType = null;
    await this.initialize();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Try to create and verify a provider
   */
  private async tryProvider(
    type: ExecutorProviderType
  ): Promise<ExecutorProvider | null> {
    try {
      const provider = this.createProvider(type);
      const available = await provider.isAvailable();

      if (available) {
        logger.debug('Provider available', { type, name: provider.name });
        return provider;
      }

      logger.debug('Provider not available', { type });
      return null;
    } catch (error) {
      logger.debug('Provider check failed', {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Create a provider instance by type
   */
  private createProvider(type: ExecutorProviderType): ExecutorProvider {
    switch (type) {
      case 'docker':
        return getSandboxExecutor();
      case 'judge0':
        return getJudge0Executor();
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Get the executor factory instance
 */
export function getExecutorFactory(): ExecutorFactory {
  return ExecutorFactory.getInstance();
}

/**
 * Get the current execution provider
 */
export async function getExecutor(): Promise<ExecutorProvider> {
  return getExecutorFactory().getExecutor();
}

/**
 * Check if code execution is available
 */
export async function isExecutionAvailable(): Promise<boolean> {
  return getExecutorFactory().isAvailable();
}
