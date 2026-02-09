/**
 * Zod Validation Schemas for API Endpoints
 *
 * Security Sprint 2: Centralized input validation using Zod
 * Provides type-safe validation for all API inputs
 *
 * Compatible with Zod 4.x
 */

import { z } from 'zod';

// ===========================================
// Common Schemas
// ===========================================

/**
 * UUID validation schema
 */
export const UUIDSchema = z.string().uuid('Invalid UUID format');

/**
 * Context schema (personal/work)
 */
export const ContextSchema = z.enum(['personal', 'work', 'learning', 'creative'], {
  message: 'Context must be "personal", "work", "learning", or "creative"'
});

/**
 * Base pagination schema (without transform for merging)
 */
const PaginationBaseSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(),
});

/**
 * Pagination schema with page-to-offset transform
 */
export const PaginationSchema = PaginationBaseSchema.transform((data) => {
  // If page is provided, calculate offset from it
  if (data.page !== undefined) {
    return {
      limit: data.limit,
      offset: (data.page - 1) * data.limit,
    };
  }
  return { limit: data.limit, offset: data.offset };
});

// ===========================================
// Ideas Schemas
// ===========================================

/**
 * Idea type enum
 */
export const IdeaTypeSchema = z.enum(['idea', 'task', 'insight', 'problem', 'question'], {
  message: 'Invalid idea type. Must be: idea, task, insight, problem, or question'
});

/**
 * Category enum
 */
export const CategorySchema = z.enum(['business', 'technical', 'personal', 'learning'], {
  message: 'Invalid category. Must be: business, technical, personal, or learning'
});

/**
 * Priority enum
 */
export const PrioritySchema = z.enum(['low', 'medium', 'high'], {
  message: 'Invalid priority. Must be: low, medium, or high'
});

/**
 * Idea filter schema for GET /api/ideas
 */
export const IdeaFilterSchema = z.object({
  type: IdeaTypeSchema.optional(),
  category: CategorySchema.optional(),
  priority: PrioritySchema.optional(),
  context: ContextSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(),
}).transform((data) => {
  const result = {
    type: data.type,
    category: data.category,
    priority: data.priority,
    context: data.context,
    limit: data.limit,
    offset: data.offset,
  };
  // If page is provided, calculate offset from it
  if (data.page !== undefined) {
    result.offset = (data.page - 1) * data.limit;
  }
  return result;
});

/**
 * Create/Update idea schema
 */
export const IdeaInputSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be at most 500 characters')
    .transform(s => s.trim()),
  content: z.string()
    .max(50000, 'Content must be at most 50000 characters')
    .optional()
    .transform(s => s?.trim()),
  type: IdeaTypeSchema.optional(),
  category: CategorySchema.optional(),
  priority: PrioritySchema.optional(),
  summary: z.string()
    .max(2000, 'Summary must be at most 2000 characters')
    .optional()
    .transform(s => s?.trim()),
  next_steps: z.array(z.string().max(500)).max(20, 'Maximum 20 next steps allowed').optional(),
  context_needed: z.array(z.string().max(500)).max(20, 'Maximum 20 context items allowed').optional(),
  keywords: z.array(z.string().max(100)).max(50, 'Maximum 50 keywords allowed').optional(),
});

/**
 * Update idea schema (all fields optional)
 */
export const IdeaUpdateSchema = IdeaInputSchema.partial();

/**
 * Search ideas schema
 */
export const IdeaSearchSchema = z.object({
  query: z.string()
    .min(1, 'Search query is required')
    .max(500, 'Search query must be at most 500 characters')
    .transform(s => s.trim()),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  threshold: z.coerce.number().min(0).max(1).default(0.5),
});

/**
 * Check duplicates schema
 */
export const CheckDuplicatesSchema = z.object({
  content: z.string()
    .max(50000, 'Content must be at most 50000 characters')
    .optional()
    .transform(s => s?.trim()),
  title: z.string()
    .max(500, 'Title must be at most 500 characters')
    .optional()
    .transform(s => s?.trim()),
  threshold: z.coerce.number().min(0).max(1).default(0.85),
}).refine(data => data.content || data.title, {
  message: 'Either content or title is required',
});

/**
 * Merge ideas schema
 */
export const MergeIdeasSchema = z.object({
  secondaryId: UUIDSchema,
});

/**
 * Priority update schema
 */
export const PriorityUpdateSchema = z.object({
  priority: PrioritySchema,
});

/**
 * Swipe action schema
 */
export const SwipeActionSchema = z.object({
  action: z.enum(['priority', 'later', 'archive'], {
    message: 'Invalid action. Must be: priority, later, or archive'
  }),
});

// ===========================================
// Voice Memo Schemas
// ===========================================

/**
 * Voice memo text input schema
 */
export const VoiceMemoTextSchema = z.object({
  text: z.string()
    .min(1, 'Text is required')
    .max(100000, 'Text must be at most 100000 characters')
    .transform(s => s.trim()),
  transcript: z.string()
    .max(100000, 'Transcript must be at most 100000 characters')
    .optional()
    .transform(s => s?.trim()),
});

/**
 * Voice memo upload validation (for multer processed files)
 */
export const VoiceMemoFileSchema = z.object({
  mimetype: z.string().refine(
    (mime) => [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/webm',
      'audio/ogg',
      'audio/m4a',
      'audio/mp4',
      'audio/x-m4a',
    ].includes(mime),
    { message: 'Invalid audio format. Allowed: wav, mp3, webm, ogg, m4a, mp4' }
  ),
  size: z.number()
    .max(50 * 1024 * 1024, 'File size must be at most 50MB'),
});

// ===========================================
// Export Schemas
// ===========================================

/**
 * Export format enum
 */
export const ExportFormatSchema = z.enum(['pdf', 'markdown', 'csv', 'json'], {
  message: 'Invalid format. Must be: pdf, markdown, csv, or json'
});

/**
 * Export filter schema
 */
export const ExportFilterSchema = z.object({
  type: IdeaTypeSchema.optional(),
  category: CategorySchema.optional(),
  priority: PrioritySchema.optional(),
  includeArchived: z.coerce.boolean().default(false),
});

// ===========================================
// API Key Schemas
// ===========================================

/**
 * Scope enum for API keys
 */
const ScopeSchema = z.enum(['read', 'write', 'admin'], {
  message: 'Invalid scope. Must be: read, write, or admin'
});

/**
 * Create API key schema
 */
export const CreateApiKeySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .regex(/^[a-zA-Z0-9_\-\s]+$/, 'Name can only contain letters, numbers, underscores, hyphens, and spaces')
    .transform(s => s.trim()),
  scopes: z.array(ScopeSchema).min(1, 'At least one scope is required').max(3),
  expiresAt: z.string().datetime().optional(),
  rateLimit: z.number().int().min(1).max(10000).default(1000),
});

// ===========================================
// Validation Middleware Factory
// ===========================================

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Format Zod errors for API response
 * Compatible with Zod 4.x (uses 'issues' instead of 'errors')
 */
function formatZodError(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map(issue => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}

/**
 * Create validation middleware for request body
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: formatZodError(result.error),
        },
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Create validation middleware for request query
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter validation failed',
          details: formatZodError(result.error),
        },
      });
    }
    // Store validated query in request
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}

/**
 * Create validation middleware for request params
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL parameter validation failed',
          details: formatZodError(result.error),
        },
      });
    }
    (req as Request & { validatedParams: T }).validatedParams = result.data;
    next();
  };
}

// ===========================================
// Chat Schemas
// ===========================================

/**
 * Chat session creation schema
 */
export const CreateChatSessionSchema = z.object({
  context: ContextSchema.default('personal'),
  type: z.enum(['general', 'assistant']).optional(),
});

/**
 * Chat message schema
 */
export const ChatMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message is required')
    .max(100000, 'Message must be at most 100000 characters')
    .transform((s: string) => s.trim()),
  include_metadata: z.boolean().optional(),
  thinking_mode: z.string().optional(),
  assistantMode: z.boolean().optional(),
});

// ===========================================
// Meeting Schemas
// ===========================================

/**
 * Meeting type enum
 */
export const MeetingTypeSchema = z.enum(
  ['internal', 'external', 'one_on_one', 'team', 'client', 'other'],
  { message: 'Invalid meeting type' }
);

/**
 * Create meeting schema
 */
export const CreateMeetingSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be at most 500 characters')
    .transform((s: string) => s.trim()),
  date: z.string().min(1, 'Date is required'),
  company_id: z.string().max(200).optional(),
  duration_minutes: z.coerce.number().int().min(1).max(1440).default(60),
  participants: z.union([
    z.string().max(2000),
    z.array(z.string().max(200)),
  ]).optional(),
  location: z.string().max(500).optional(),
  meeting_type: MeetingTypeSchema.default('internal'),
});

/**
 * Meeting search schema
 */
export const MeetingSearchSchema = z.object({
  query: z.string()
    .min(1, 'Search query is required')
    .max(500)
    .transform((s: string) => s.trim()),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ===========================================
// Type Exports
// ===========================================

export type IdeaInput = z.infer<typeof IdeaInputSchema>;
export type IdeaUpdate = z.infer<typeof IdeaUpdateSchema>;
export type IdeaFilter = z.infer<typeof IdeaFilterSchema>;
export type IdeaSearch = z.infer<typeof IdeaSearchSchema>;
export type VoiceMemoText = z.infer<typeof VoiceMemoTextSchema>;
export type ExportFilter = z.infer<typeof ExportFilterSchema>;
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type IdeaType = z.infer<typeof IdeaTypeSchema>;
export type Category = z.infer<typeof CategorySchema>;
