/**
 * Intent Handler Types
 *
 * Extracted to break circular dependency between index.ts and handler files.
 *
 * @module services/intent-handlers/intent-types
 */

import type { IntentType } from '../intent-detector';

export interface IntentHandlerResult {
  success: boolean;
  intent_type: IntentType;
  created_resource?: {
    type: string;
    id: string;
    summary: string;
    data?: Record<string, unknown>;
  };
  error?: string;
}
