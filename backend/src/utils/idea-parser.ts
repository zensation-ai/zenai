/**
 * Idea Parser Utility
 *
 * Provides consistent JSON parsing for idea fields across all routes.
 * Eliminates code duplication and ensures type safety.
 *
 * @module utils/idea-parser
 */

import { logger } from './logger';

// ===========================================
// Types
// ===========================================

/**
 * Raw database row for an idea (before parsing)
 */
export interface IdeaDatabaseRow {
  id: string;
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string | string[] | null;
  context_needed: string | string[] | null;
  keywords: string | string[] | null;
  raw_transcript?: string;
  context?: string;
  created_at: string | Date;
  updated_at?: string | Date;
  is_archived?: boolean;
  viewed_count?: number;
  relevance_score?: number;
  similarity?: number;
  [key: string]: unknown;
}

/**
 * Parsed idea with properly typed array fields
 */
export interface ParsedIdea {
  id: string;
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  raw_transcript?: string;
  context?: string;
  created_at: string;
  updated_at?: string;
  is_archived?: boolean;
  viewed_count?: number;
  relevance_score?: number;
  similarity?: number;
  [key: string]: unknown;
}

// ===========================================
// Parsing Functions
// ===========================================

/**
 * Safely parse a JSON string or return the value if already an array
 * Returns empty array on failure
 *
 * @param value - The value to parse (string, array, or null)
 * @param fieldName - Name of the field for logging purposes
 * @returns Parsed array or empty array
 */
export function parseJsonArray(value: string | string[] | null | undefined, fieldName?: string): string[] {
  // Already an array
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  // Null or undefined
  if (value === null || value === undefined) {
    return [];
  }

  // Empty string
  if (typeof value === 'string' && value.trim() === '') {
    return [];
  }

  // Try to parse JSON string
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
      // If parsed but not an array, wrap in array if it's a string
      if (typeof parsed === 'string') {
        return [parsed];
      }
      logger.warn('Parsed JSON is not an array', { fieldName, valueType: typeof parsed });
      return [];
    } catch (error) {
      // Not valid JSON - might be a comma-separated string
      if (value.includes(',')) {
        return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
      // Single value
      return [value];
    }
  }

  return [];
}

/**
 * Parse all array fields of an idea database row
 * Converts JSON strings to proper arrays
 *
 * @param row - Raw database row
 * @returns Parsed idea with array fields
 */
export function parseIdeaRow(row: IdeaDatabaseRow): ParsedIdea {
  return {
    ...row,
    next_steps: parseJsonArray(row.next_steps, 'next_steps'),
    context_needed: parseJsonArray(row.context_needed, 'context_needed'),
    keywords: parseJsonArray(row.keywords, 'keywords'),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/**
 * Parse multiple idea rows
 *
 * @param rows - Array of raw database rows
 * @returns Array of parsed ideas
 */
export function parseIdeaRows(rows: IdeaDatabaseRow[]): ParsedIdea[] {
  return rows.map(parseIdeaRow);
}

/**
 * Serialize array fields for database storage
 * Converts arrays to JSON strings
 *
 * @param value - Array or null
 * @returns JSON string or null
 */
export function serializeArrayField(value: string[] | null | undefined): string | null {
  if (!value || !Array.isArray(value) || value.length === 0) {
    return null;
  }
  return JSON.stringify(value);
}

/**
 * Prepare idea data for database insertion/update
 * Serializes array fields to JSON strings
 *
 * @param data - Idea data with array fields
 * @returns Data with serialized array fields
 */
export function serializeIdeaForDatabase(data: Partial<ParsedIdea>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };

  if ('next_steps' in data) {
    result.next_steps = serializeArrayField(data.next_steps);
  }
  if ('context_needed' in data) {
    result.context_needed = serializeArrayField(data.context_needed);
  }
  if ('keywords' in data) {
    result.keywords = serializeArrayField(data.keywords);
  }

  return result;
}

// ===========================================
// Validation Functions
// ===========================================

/**
 * Valid idea types
 */
export const VALID_IDEA_TYPES = ['idea', 'task', 'insight', 'problem', 'question'] as const;
export type IdeaType = typeof VALID_IDEA_TYPES[number];

/**
 * Valid idea categories
 */
export const VALID_CATEGORIES = ['business', 'technical', 'personal', 'learning'] as const;
export type IdeaCategory = typeof VALID_CATEGORIES[number];

/**
 * Valid idea priorities
 */
export const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;
export type IdeaPriority = typeof VALID_PRIORITIES[number];

/**
 * Check if a value is a valid idea type
 */
export function isValidIdeaType(value: unknown): value is IdeaType {
  return typeof value === 'string' && VALID_IDEA_TYPES.includes(value as IdeaType);
}

/**
 * Check if a value is a valid category
 */
export function isValidCategory(value: unknown): value is IdeaCategory {
  return typeof value === 'string' && VALID_CATEGORIES.includes(value as IdeaCategory);
}

/**
 * Check if a value is a valid priority
 */
export function isValidPriority(value: unknown): value is IdeaPriority {
  return typeof value === 'string' && VALID_PRIORITIES.includes(value as IdeaPriority);
}

/**
 * Normalize type to valid value or default
 */
export function normalizeIdeaType(value: unknown, defaultValue: IdeaType = 'idea'): IdeaType {
  return isValidIdeaType(value) ? value : defaultValue;
}

/**
 * Normalize category to valid value or default
 */
export function normalizeCategory(value: unknown, defaultValue: IdeaCategory = 'personal'): IdeaCategory {
  return isValidCategory(value) ? value : defaultValue;
}

/**
 * Normalize priority to valid value or default
 */
export function normalizePriority(value: unknown, defaultValue: IdeaPriority = 'medium'): IdeaPriority {
  return isValidPriority(value) ? value : defaultValue;
}
