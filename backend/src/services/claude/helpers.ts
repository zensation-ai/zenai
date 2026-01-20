/**
 * Claude Helpers Module
 *
 * Provides utility functions for JSON extraction, validation,
 * and response processing from Claude API responses.
 *
 * @module services/claude/helpers
 */

import { logger } from '../../utils/logger';
import { StructuredIdea, normalizeCategory, normalizeType, normalizePriority } from '../../utils/ollama';

// ===========================================
// Types
// ===========================================

/**
 * Result of JSON extraction with method used
 */
export interface JSONExtractionResult {
  json: unknown;
  method: string;
}

// ===========================================
// JSON Extraction
// ===========================================

/**
 * Robust JSON extraction from LLM response with multiple fallback strategies
 * Handles common issues like markdown wrapping, trailing text, malformed JSON
 *
 * @param responseText - The raw response text from Claude
 * @returns Extracted JSON and method used, or null if extraction failed
 */
export function extractJSONFromResponse(responseText: string): JSONExtractionResult | null {
  if (!responseText || typeof responseText !== 'string') {
    logger.debug('JSON extraction: empty or invalid input');
    return null;
  }

  const methods = [
    // Method 1: Direct JSON object
    () => {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        return { json: JSON.parse(match[0]), method: 'direct-object' };
      }
      return null;
    },

    // Method 2: JSON in markdown code block
    () => {
      const markdownMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (markdownMatch) {
        return { json: JSON.parse(markdownMatch[1]), method: 'markdown-block' };
      }
      return null;
    },

    // Method 3: JSON array extraction
    () => {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return { json: JSON.parse(arrayMatch[0]), method: 'array' };
      }
      return null;
    },

    // Method 4: Fix common JSON errors (trailing commas, unquoted keys)
    () => {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {return null;}

      let jsonStr = jsonMatch[0];

      // Fix trailing commas before closing brackets/braces
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      // Fix single quotes to double quotes (but not within strings)
      jsonStr = jsonStr.replace(/'/g, '"');

      // Remove trailing text after closing brace
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace !== -1) {
        jsonStr = jsonStr.substring(0, lastBrace + 1);
      }

      return { json: JSON.parse(jsonStr), method: 'fixed-json' };
    },

    // Method 5: Extract key-value pairs manually and reconstruct
    () => {
      const lines = responseText.split('\n');
      const obj: Record<string, unknown> = {};

      for (const line of lines) {
        // Match "key": "value" or "key": value patterns
        const kvMatch = line.match(/"?(\w+)"?\s*:\s*(?:"([^"]*)"|\[([^\]]*)\]|(\d+(?:\.\d+)?)|(\w+))/);
        if (kvMatch) {
          const key = kvMatch[1];
          if (kvMatch[2] !== undefined) {
            obj[key] = kvMatch[2]; // String value
          } else if (kvMatch[3] !== undefined) {
            // Array value - try to parse
            try {
              obj[key] = JSON.parse(`[${kvMatch[3]}]`);
            } catch {
              obj[key] = kvMatch[3].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            }
          } else if (kvMatch[4] !== undefined) {
            obj[key] = parseFloat(kvMatch[4]); // Number
          } else if (kvMatch[5] !== undefined) {
            const val = kvMatch[5].toLowerCase();
            obj[key] = val === 'true' ? true : val === 'false' ? false : kvMatch[5];
          }
        }
      }

      if (Object.keys(obj).length > 0) {
        return { json: obj, method: 'line-parsing' };
      }
      return null;
    },
  ];

  for (const method of methods) {
    try {
      const result = method();
      if (result) {
        logger.debug('JSON extraction successful', { method: result.method });
        return result;
      }
    } catch {
      // Continue to next method
    }
  }

  logger.warn('JSON extraction failed with all methods', {
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 200)
  });
  return null;
}

/**
 * Extract JSON from Claude response, throwing on failure
 *
 * @param responseText - The raw response text
 * @returns Parsed JSON object
 * @throws Error if no valid JSON found
 */
export function extractJSONOrThrow(responseText: string): unknown {
  const result = extractJSONFromResponse(responseText);
  if (!result) {
    throw new Error('No valid JSON found in Claude response');
  }
  return result.json;
}

// ===========================================
// Idea Validation & Normalization
// ===========================================

/**
 * Validate and normalize a structured idea from parsed JSON
 * Ensures all required fields are present with correct types
 *
 * @param parsed - The parsed JSON object
 * @param fallbackTitle - Fallback title if none provided
 * @returns Validated and normalized StructuredIdea
 */
export function validateAndNormalizeIdea(parsed: unknown, fallbackTitle?: string): StructuredIdea {
  const obj = parsed as Record<string, unknown>;

  // Ensure required fields
  const title = typeof obj.title === 'string' && obj.title.length > 0
    ? obj.title.substring(0, 200)
    : (fallbackTitle || 'Unstrukturierte Notiz');

  const summary = typeof obj.summary === 'string'
    ? obj.summary.substring(0, 1000)
    : '';

  // Handle next_steps - can be string or array
  let nextSteps: string[] = [];
  if (Array.isArray(obj.next_steps)) {
    nextSteps = obj.next_steps.filter((s): s is string => typeof s === 'string').slice(0, 10);
  } else if (typeof obj.next_steps === 'string') {
    nextSteps = [obj.next_steps];
  }

  // Handle context_needed - can be string or array
  let contextNeeded: string[] = [];
  if (Array.isArray(obj.context_needed)) {
    contextNeeded = obj.context_needed.filter((s): s is string => typeof s === 'string').slice(0, 10);
  } else if (typeof obj.context_needed === 'string') {
    contextNeeded = [obj.context_needed];
  }

  // Handle keywords - can be string or array
  let keywords: string[] = [];
  if (Array.isArray(obj.keywords)) {
    keywords = obj.keywords.filter((s): s is string => typeof s === 'string').slice(0, 20);
  } else if (typeof obj.keywords === 'string') {
    keywords = obj.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
  }

  return {
    title,
    type: normalizeType(typeof obj.type === 'string' ? obj.type : undefined),
    category: normalizeCategory(typeof obj.category === 'string' ? obj.category : undefined),
    priority: normalizePriority(typeof obj.priority === 'string' ? obj.priority : undefined),
    summary,
    next_steps: nextSteps,
    context_needed: contextNeeded,
    keywords,
  };
}

// ===========================================
// Response Text Extraction
// ===========================================

/**
 * Extract text content from Claude message response
 *
 * @param message - The Claude API message response
 * @returns The text content or empty string
 */
export function extractTextFromMessage(message: { content: Array<{ type: string; text?: string }> }): string {
  const textBlock = message.content.find(block => block.type === 'text');
  return textBlock?.text || '';
}

/**
 * Extract text content or throw if empty
 *
 * @param message - The Claude API message response
 * @returns The text content
 * @throws Error if no text content found
 */
export function extractTextOrThrow(message: { content: Array<{ type: string; text?: string }> }): string {
  const text = extractTextFromMessage(message);
  if (!text) {
    throw new Error('No response from Claude');
  }
  return text;
}

// ===========================================
// Extended Thinking Helpers
// ===========================================

/**
 * Determine if a task is complex enough to warrant Extended Thinking
 *
 * @param text - The input text to analyze
 * @param taskType - The type of task being performed
 * @returns Whether Extended Thinking should be used
 */
export function shouldUseExtendedThinking(text: string, taskType: string): boolean {
  // Use extended thinking for:
  // 1. Long transcripts (> 500 chars)
  // 2. Draft generation tasks
  // 3. Multi-idea analysis
  // 4. Complex relationship analysis

  const isLongText = text.length > 500;
  const isComplexTask = ['draft', 'analysis', 'relationship', 'graph'].includes(taskType);
  const hasMultipleTopics = (text.match(/\b(und|sowie|außerdem|zusätzlich|also|furthermore|moreover)\b/gi) || []).length > 2;

  return isLongText || isComplexTask || hasMultipleTopics;
}

/**
 * Extract thinking and response content from Extended Thinking message
 *
 * @param content - The message content array
 * @returns Object with thinking and response text
 */
export function extractThinkingContent(
  content: Array<{ type: string; text?: string; thinking?: string }>
): { thinking?: string; response: string } {
  let thinkingContent: string | undefined;
  let responseContent = '';

  for (const block of content) {
    if (block.type === 'thinking' && block.thinking) {
      thinkingContent = block.thinking;
    } else if (block.type === 'text' && block.text) {
      responseContent = block.text;
    }
  }

  return {
    thinking: thinkingContent,
    response: responseContent.trim(),
  };
}
