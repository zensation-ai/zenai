/**
 * Shared Idea Types & Normalization Utilities
 *
 * Extracted to break circular dependency between utils/ollama.ts and services/openai.ts.
 * Both modules need these types and normalization functions.
 *
 * @module utils/idea-types
 */

// ===========================================
// Structured Idea Interface
// ===========================================

export interface StructuredIdea {
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  suggested_context?: 'operations' | 'finance' | 'people' | 'strategy' | 'demo';
}

// ===========================================
// Valid Values (Database Constraints)
// ===========================================

const VALID_CATEGORIES = ['business', 'technical', 'personal', 'learning'] as const;
const VALID_TYPES = ['idea', 'task', 'insight', 'problem', 'question'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;
const VALID_CONTEXTS = ['operations', 'finance', 'people', 'strategy'] as const;

export type ValidCategory = typeof VALID_CATEGORIES[number];
export type ValidType = typeof VALID_TYPES[number];
export type ValidPriority = typeof VALID_PRIORITIES[number];
type ValidContext = typeof VALID_CONTEXTS[number];

// ===========================================
// Category Mapping
// ===========================================

const CATEGORY_MAPPING: Record<string, ValidCategory> = {
  'marketing': 'business',
  'sales': 'business',
  'strategy': 'business',
  'strategie': 'business',
  'finance': 'business',
  'management': 'business',
  'startup': 'business',
  'product': 'business',
  'growth': 'business',
  'operations': 'business',
  'kunden': 'business',
  'ews': 'business',
  '1komma5': 'business',
  'team': 'business',
  'vertrieb': 'business',
  'verkauf': 'business',
  'development': 'technical',
  'engineering': 'technical',
  'code': 'technical',
  'programming': 'technical',
  'software': 'technical',
  'infrastructure': 'technical',
  'devops': 'technical',
  'architecture': 'technical',
  'technik': 'technical',
  'tech': 'technical',
  'it': 'technical',
  'health': 'personal',
  'wellness': 'personal',
  'lifestyle': 'personal',
  'family': 'personal',
  'relationships': 'personal',
  'hobby': 'personal',
  'creativity': 'personal',
  'privat': 'personal',
  'persönlich': 'personal',
  'familie': 'personal',
  'gesundheit': 'personal',
  'education': 'learning',
  'research': 'learning',
  'study': 'learning',
  'training': 'learning',
  'skills': 'learning',
  'lernen': 'learning',
  'weiterbildung': 'learning',
  'forschung': 'learning',
};

const CONTEXT_MAPPING: Record<string, ValidContext> = {
  'arbeit': 'finance',
  'beruf': 'finance',
  'büro': 'finance',
  'office': 'finance',
  'business': 'finance',
  'geschäft': 'finance',
  'projekt': 'finance',
  'job': 'finance',
  'professional': 'finance',
  'beruflich': 'finance',
  'geschäftlich': 'finance',
  'privat': 'operations',
  'persönlich': 'operations',
  'private': 'operations',
  'zuhause': 'operations',
  'home': 'operations',
  'familie': 'operations',
  'family': 'operations',
  'freizeit': 'operations',
  'alltag': 'operations',
  'lernen': 'people',
  'studium': 'people',
  'weiterbildung': 'people',
  'education': 'people',
  'kurs': 'people',
  'training': 'people',
  'research': 'people',
  'forschung': 'people',
  'skill': 'people',
  'wissen': 'people',
  'kreativ': 'strategy',
  'kunst': 'strategy',
  'art': 'strategy',
  'design': 'strategy',
  'musik': 'strategy',
  'music': 'strategy',
  'schreiben': 'strategy',
  'writing': 'strategy',
  'foto': 'strategy',
  'photography': 'strategy',
  'video': 'strategy',
  'content': 'strategy',
};

// ===========================================
// Normalization Functions
// ===========================================

/**
 * Normalize category to valid database value
 */
export function normalizeCategory(category: string | undefined): ValidCategory {
  if (!category) {return 'personal';}

  const parts = category.split('|').map(p => p.toLowerCase().trim());

  for (const part of parts) {
    if (VALID_CATEGORIES.includes(part as ValidCategory)) {
      return part as ValidCategory;
    }
    const mapped = CATEGORY_MAPPING[part];
    if (mapped) {
      return mapped;
    }
  }

  return 'business';
}

/**
 * Normalize type to valid database value
 */
export function normalizeType(type: string | undefined): ValidType {
  if (!type) {return 'idea';}
  const lower = type.toLowerCase().trim();
  if (VALID_TYPES.includes(lower as ValidType)) {
    return lower as ValidType;
  }
  return 'idea';
}

/**
 * Normalize priority to valid database value
 */
export function normalizePriority(priority: string | undefined): ValidPriority {
  if (!priority) {return 'medium';}
  const lower = priority.toLowerCase().trim();
  if (VALID_PRIORITIES.includes(lower as ValidPriority)) {
    return lower as ValidPriority;
  }
  return 'medium';
}

/**
 * Normalize context suggestion to valid context value
 */
export function normalizeContext(context: string | undefined): ValidContext | undefined {
  if (!context) {return undefined;}
  const lower = context.toLowerCase().trim();
  if (VALID_CONTEXTS.includes(lower as ValidContext)) {
    return lower as ValidContext;
  }
  const mapped = CONTEXT_MAPPING[lower];
  if (mapped) {
    return mapped;
  }
  return undefined;
}
