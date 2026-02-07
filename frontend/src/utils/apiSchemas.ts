/**
 * Phase 7.2: API Response Validation (Zod Schemas)
 *
 * Runtime type safety for API responses. Validates response shapes
 * and logs warnings on mismatches without breaking the app.
 *
 * Usage:
 *   const ideas = safeParseResponse(IdeasResponseSchema, response.data, 'loadIdeas');
 *   // ideas is typed and validated, falls back to schema default on mismatch
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Safe parse utility
// ---------------------------------------------------------------------------

/**
 * Safely parse and validate an API response against a Zod schema.
 * On failure: logs a warning and returns the raw data (graceful degradation).
 * On success: returns the validated & typed data.
 */
export function safeParseResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  // Log validation failures for debugging - don't crash the app
  if (import.meta.env.DEV) {
    console.warn(
      `[API Schema] Validation failed for "${context}":`,
      result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
    );
  }

  // Graceful degradation: return raw data cast to expected type
  // This prevents breaking changes from causing full app crashes
  return data as T;
}

// ---------------------------------------------------------------------------
// Health API
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
  version: z.string().optional(),
  services: z.object({
    databases: z.object({
      personal: z.object({ status: z.string() }).optional(),
      work: z.object({ status: z.string() }).optional(),
    }).optional(),
    database: z.object({ status: z.string() }).optional(),
    ai: z.object({
      claude: z.object({
        status: z.string(),
        available: z.boolean().optional(),
      }).optional(),
      ollama: z.object({
        status: z.string(),
        models: z.array(z.string()).optional(),
      }).optional(),
      openai: z.object({ status: z.string() }).optional(),
    }).optional(),
  }).optional(),
  uptime: z.object({
    seconds: z.number(),
    human: z.string(),
  }).optional(),
  memory: z.object({
    heapUsed: z.string(),
    heapTotal: z.string(),
    rss: z.string(),
  }).optional(),
}).passthrough();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// Ideas API
// ---------------------------------------------------------------------------

const StructuredIdeaSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  priority: z.string().optional(),
  created_at: z.string().optional(),
}).passthrough();

export const IdeasResponseSchema = z.object({
  ideas: z.array(StructuredIdeaSchema).default([]),
  pagination: z.object({
    total: z.number(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }).optional(),
}).passthrough();

export type IdeasResponse = z.infer<typeof IdeasResponseSchema>;

// ---------------------------------------------------------------------------
// Idea Creation (voice-memo / text submit)
// ---------------------------------------------------------------------------

export const IdeaCreationResponseSchema = z.object({
  ideaId: z.string(),
  structured: z.object({
    title: z.string().optional(),
    summary: z.string().optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    priority: z.string().optional(),
    next_steps: z.array(z.string()).optional(),
    context_needed: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
  }).passthrough().optional(),
  success: z.boolean().optional(),
  transcript: z.string().optional(),
}).passthrough();

export type IdeaCreationResponse = z.infer<typeof IdeaCreationResponseSchema>;

// ---------------------------------------------------------------------------
// Chat API
// ---------------------------------------------------------------------------

const ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']).optional(),
  content: z.string().optional(),
  created_at: z.string().optional(),
}).passthrough();

const ChatSessionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  messages: z.array(ChatMessageSchema).optional(),
  created_at: z.string().optional(),
}).passthrough();

export const ChatSessionsResponseSchema = z.object({
  data: z.object({
    sessions: z.array(ChatSessionSchema).default([]),
  }),
}).passthrough();

export const ChatSessionResponseSchema = z.object({
  data: z.object({
    session: ChatSessionSchema.optional(),
  }),
}).passthrough();

export const ChatMessageResponseSchema = z.object({
  data: z.object({
    userMessage: ChatMessageSchema.optional(),
    assistantMessage: ChatMessageSchema.optional(),
    titleUpdated: z.boolean().optional(),
    title: z.string().optional(),
  }).passthrough(),
}).passthrough();

// ---------------------------------------------------------------------------
// Code Execution API
// ---------------------------------------------------------------------------

export const CodeExecutionResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    output: z.string().optional(),
    error: z.string().optional(),
    exitCode: z.number().optional(),
    executionTime: z.number().optional(),
    language: z.string().optional(),
    code: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export const CodeHealthResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    available: z.boolean(),
    enabled: z.boolean().optional(),
    provider: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Search API
// ---------------------------------------------------------------------------

export const SearchResponseSchema = z.object({
  ideas: z.array(StructuredIdeaSchema).default([]),
}).passthrough();

// ---------------------------------------------------------------------------
// Meetings API
// ---------------------------------------------------------------------------

export const MeetingsResponseSchema = z.object({
  meetings: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    date: z.string().optional(),
    status: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough();

// ---------------------------------------------------------------------------
// Generic wrapper for { success, data } pattern
// ---------------------------------------------------------------------------

export function createWrappedSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.boolean().optional(),
    data: dataSchema,
  }).passthrough();
}

// ---------------------------------------------------------------------------
// Sync API
// ---------------------------------------------------------------------------

export const SyncStatusResponseSchema = z.object({
  last_sync: z.string().optional().nullable(),
  pending_changes: z.number().optional(),
  sync_enabled: z.boolean().optional(),
  devices: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();
