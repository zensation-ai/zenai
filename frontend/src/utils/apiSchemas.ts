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
  success: z.boolean().optional(),
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
    suggested_context: z.enum(['personal', 'work', 'learning', 'creative']).optional(),
  }).passthrough().optional(),
  suggestedContext: z.enum(['personal', 'work', 'learning', 'creative']).optional(),
  contextConfidence: z.number().optional(),
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
  success: z.boolean().optional(),
  sessions: z.array(ChatSessionSchema).default([]),
}).passthrough();

export const ChatSessionResponseSchema = z.object({
  success: z.boolean().optional(),
  session: ChatSessionSchema.optional(),
}).passthrough();

export const ChatMessageResponseSchema = z.object({
  success: z.boolean().optional(),
  userMessage: ChatMessageSchema.optional(),
  assistantMessage: ChatMessageSchema.optional(),
  titleUpdated: z.boolean().optional(),
  title: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Code Execution API
// ---------------------------------------------------------------------------

export const CodeExecutionResponseSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
  executionTime: z.number().optional(),
  language: z.string().optional(),
  code: z.string().optional(),
}).passthrough();

export const CodeHealthResponseSchema = z.object({
  success: z.boolean().optional(),
  available: z.boolean(),
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Search API
// ---------------------------------------------------------------------------

export const SearchResponseSchema = z.object({
  success: z.boolean().optional(),
  ideas: z.array(StructuredIdeaSchema).default([]),
}).passthrough();

// ---------------------------------------------------------------------------
// Meetings API
// ---------------------------------------------------------------------------

export const MeetingsResponseSchema = z.object({
  success: z.boolean().optional(),
  meetings: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    date: z.string().optional(),
    status: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough();

// ---------------------------------------------------------------------------
// Generic wrapper (DEPRECATED: responses now use flat format)
// ---------------------------------------------------------------------------

/** @deprecated Responses now use `{ success, ...fields }` instead of `{ success, data: {...} }`. */
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
  success: z.boolean().optional(),
  last_sync: z.string().optional().nullable(),
  pending_changes: z.number().optional(),
  sync_enabled: z.boolean().optional(),
  devices: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const SyncPendingResponseSchema = z.object({
  success: z.boolean().optional(),
  changes: z.array(z.object({
    id: z.string(),
    type: z.string().optional(),
    action: z.string().optional(),
    timestamp: z.string().optional(),
    synced: z.boolean().optional(),
  }).passthrough()).default([]),
}).passthrough();

export type SyncPendingResponse = z.infer<typeof SyncPendingResponseSchema>;

// ---------------------------------------------------------------------------
// Phase 8.5: Expanded Schemas for remaining API responses
// ---------------------------------------------------------------------------

// Automations API
// ---------------------------------------------------------------------------

const AutomationSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  trigger: z.object({
    type: z.string(),
  }).passthrough().optional(),
  actions: z.array(z.object({
    type: z.string(),
    order: z.number().optional(),
  }).passthrough()).optional(),
  is_active: z.boolean().optional(),
  run_count: z.number().optional(),
  success_count: z.number().optional(),
  failure_count: z.number().optional(),
  last_run_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
}).passthrough();

export const AutomationsResponseSchema = z.object({
  success: z.boolean().optional(),
  automations: z.array(AutomationSchema).default([]),
}).passthrough();

export const AutomationSuggestionsResponseSchema = z.object({
  success: z.boolean().optional(),
  suggestions: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    reasoning: z.string().optional(),
    confidence: z.number().optional(),
  }).passthrough()).default([]),
}).passthrough();

export const AutomationStatsResponseSchema = z.object({
  success: z.boolean().optional(),
  total_automations: z.number().optional(),
  active_automations: z.number().optional(),
  total_executions: z.number().optional(),
  successful_executions: z.number().optional(),
  failed_executions: z.number().optional(),
  success_rate: z.number().optional(),
}).passthrough();

export type AutomationsResponse = z.infer<typeof AutomationsResponseSchema>;
export type AutomationSuggestionsResponse = z.infer<typeof AutomationSuggestionsResponseSchema>;
export type AutomationStatsResponse = z.infer<typeof AutomationStatsResponseSchema>;

// ---------------------------------------------------------------------------
// Profile API
// ---------------------------------------------------------------------------

export const ProfileStatsResponseSchema = z.object({
  success: z.boolean().optional(),
  total_ideas: z.number().optional(),
  total_meetings: z.number().optional(),
  avg_ideas_per_day: z.number().optional(),
  top_categories: z.array(z.unknown()).optional(),
  top_types: z.array(z.unknown()).optional(),
  top_topics: z.array(z.unknown()).optional(),
}).passthrough();

export const ProfileRecommendationsResponseSchema = z.object({
  recommendations: z.object({
    suggested_topics: z.array(z.string()).optional(),
    optimal_hours: z.array(z.number()).optional(),
    focus_categories: z.array(z.string()).optional(),
    insights: z.array(z.string()).optional(),
  }).passthrough().optional(),
}).passthrough();

export const BusinessProfileResponseSchema = z.object({
  profile: z.object({
    id: z.string().optional(),
    company_name: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();

export type ProfileStatsResponse = z.infer<typeof ProfileStatsResponseSchema>;
export type ProfileRecommendationsResponse = z.infer<typeof ProfileRecommendationsResponseSchema>;

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------

export const NotificationStatusResponseSchema = z.object({
  configured: z.boolean().optional(),
  provider: z.string().optional(),
  active_devices: z.number().optional(),
}).passthrough();

export const NotificationDevicesResponseSchema = z.object({
  devices: z.array(z.object({
    id: z.string(),
    device_name: z.string().optional(),
    is_active: z.boolean().optional(),
    last_used_at: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough();

export const NotificationHistoryResponseSchema = z.object({
  notifications: z.array(z.object({
    id: z.string(),
    type: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    status: z.string().optional(),
    sent_at: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough();

export const NotificationStatsResponseSchema = z.object({
  total_sent: z.number().optional(),
  total_opened: z.number().optional(),
  open_rate: z.number().optional(),
}).passthrough();

export type NotificationStatusResponse = z.infer<typeof NotificationStatusResponseSchema>;
export type NotificationHistoryResponse = z.infer<typeof NotificationHistoryResponseSchema>;

// ---------------------------------------------------------------------------
// Analytics API
// ---------------------------------------------------------------------------

export const AnalyticsDashboardResponseSchema = z.object({
  success: z.boolean().optional(),
  summary: z.object({
    total: z.number().optional(),
    today: z.number().optional(),
    thisWeek: z.number().optional(),
    thisMonth: z.number().optional(),
  }).passthrough().optional(),
  goals: z.object({
    daily: z.object({ target: z.number(), current: z.number(), progress: z.number() }).passthrough().optional(),
    weekly: z.object({ target: z.number(), current: z.number(), progress: z.number() }).passthrough().optional(),
  }).passthrough().optional(),
  streaks: z.object({
    current: z.number().optional(),
    longest: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

export const ProductivityScoreResponseSchema = z.object({
  success: z.boolean().optional(),
  overall: z.number().optional(),
  trend: z.string().optional(),
}).passthrough();

export type AnalyticsDashboardResponse = z.infer<typeof AnalyticsDashboardResponseSchema>;
export type ProductivityScoreResponse = z.infer<typeof ProductivityScoreResponseSchema>;

// ---------------------------------------------------------------------------
// Export API
// ---------------------------------------------------------------------------

export const ExportHistoryResponseSchema = z.object({
  success: z.boolean().optional(),
  exports: z.array(z.object({
    id: z.string(),
    format: z.string().optional(),
    filename: z.string().optional(),
    size: z.number().optional(),
    created_at: z.string().optional(),
  }).passthrough()).default([]),
}).passthrough();

export type ExportHistoryResponse = z.infer<typeof ExportHistoryResponseSchema>;

// ---------------------------------------------------------------------------
// Stories API
// ---------------------------------------------------------------------------

export const StoriesResponseSchema = z.object({
  success: z.boolean().optional(),
  stories: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    date: z.string().optional(),
    items: z.array(z.object({
      id: z.string(),
      type: z.string().optional(),
      title: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).default([]),
}).passthrough();

export type StoriesResponse = z.infer<typeof StoriesResponseSchema>;
