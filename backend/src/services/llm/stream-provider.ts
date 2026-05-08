/**
 * Multi-LLM Stream Provider
 *
 * Provides provider selection, fallback chain, and SSE-wrapped execution
 * for non-Anthropic LLM providers (Mistral, OpenAI, Ollama).
 *
 * Primary: Anthropic (full streaming via existing streamToSSE)
 * Fallback: Mistral → OpenAI → Ollama (non-streaming, SSE-wrapped)
 *
 * @module services/llm/stream-provider
 */

import { logger } from '../../utils/logger';
import type { Response } from 'express';

export type LLMProvider = 'anthropic' | 'mistral' | 'openai' | 'ollama' | 'google' | 'deepseek';

const FALLBACK_ORDER: LLMProvider[] = ['mistral', 'openai', 'ollama'];

/**
 * Normalize a provider string to a valid LLMProvider.
 * Returns 'anthropic' for unknown values.
 */
export function selectProvider(provider: string): LLMProvider {
  const valid: LLMProvider[] = ['anthropic', 'mistral', 'openai', 'ollama', 'google', 'deepseek'];
  return valid.includes(provider as LLMProvider) ? (provider as LLMProvider) : 'anthropic';
}

/**
 * Get the fallback chain for a given primary provider.
 * Excludes the primary provider from the chain.
 */
export function getFallbackChain(primary: LLMProvider): LLMProvider[] {
  return FALLBACK_ORDER.filter(p => p !== primary);
}

/**
 * Execute a single non-Anthropic provider call.
 * Returns null if the provider fails or is unsupported.
 */
export async function executeWithFallback(
  provider: LLMProvider,
  systemPrompt: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<{ response: string; provider: LLMProvider } | null> {
  const { maxTokens = 4096, temperature = 0.7 } = options;

  try {
    let response: string;

    switch (provider) {
      case 'mistral': {
        const { generateMistralResponse } = await import('../mistral');
        response = await generateMistralResponse(systemPrompt, userMessage, {
          maxTokens,
          temperature,
        });
        break;
      }
      case 'openai': {
        const { generateOpenAIResponse } = await import('../openai');
        response = await generateOpenAIResponse(systemPrompt, userMessage, {
          maxTokens,
          temperature,
        });
        break;
      }
      default:
        // Ollama, Google, DeepSeek — not yet wired up for fallback
        return null;
    }

    return { response, provider };
  } catch (error) {
    logger.warn(`Fallback provider ${provider} failed`, {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Try each provider in the fallback chain until one succeeds.
 * Writes SSE events to the response when a provider returns content.
 * Returns the result or null if all providers failed.
 */
export async function streamWithFallback(
  res: Response,
  systemPrompt: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<{ response: string; provider: LLMProvider } | null> {
  for (const provider of FALLBACK_ORDER) {
    const result = await executeWithFallback(provider, systemPrompt, userMessage, options);
    if (result) {
      // Wrap non-streaming response in SSE events for client compatibility
      res.write(`event: content_start\ndata: {}\n\n`);
      res.write(
        `event: content_delta\ndata: ${JSON.stringify({ content: result.response })}\n\n`,
      );
      res.write(
        `event: done\ndata: ${JSON.stringify({
          content: result.response,
          metadata: { provider: result.provider, fallback: true },
        })}\n\n`,
      );
      return result;
    }
  }
  return null;
}
