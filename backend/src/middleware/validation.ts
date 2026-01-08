/**
 * Phase 9: Input Validation Middleware using Zod
 *
 * Provides type-safe request validation for all API endpoints.
 * Centralizes validation logic and returns consistent error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

// ===========================================
// Common Schemas
// ===========================================

/**
 * Valid AI context values
 */
export const contextSchema = z.enum(['personal', 'work']);
export type AIContextType = z.infer<typeof contextSchema>;

/**
 * UUID v4 validation
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).optional(),
});
export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Sort order validation
 */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/**
 * Date range validation
 */
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || data.startDate <= data.endDate,
  { message: 'startDate must be before or equal to endDate' }
);

// ===========================================
// Idea Schemas
// ===========================================

export const ideaTypeSchema = z.enum(['idea', 'task', 'note', 'question', 'reminder']);
export const ideaCategorySchema = z.enum([
  'general', 'work', 'personal', 'health', 'finance',
  'learning', 'creative', 'relationship', 'travel', 'other'
]);
export const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const createIdeaSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
    content: z.string().max(50000, 'Content too long').optional(),
    type: ideaTypeSchema.default('idea'),
    category: ideaCategorySchema.default('general'),
    priority: prioritySchema.default('medium'),
    tags: z.array(z.string().max(50)).max(20).optional(),
  }),
  params: z.object({
    context: contextSchema,
  }),
});

export const updateIdeaSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().max(50000).optional(),
    type: ideaTypeSchema.optional(),
    category: ideaCategorySchema.optional(),
    priority: prioritySchema.optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    isArchived: z.boolean().optional(),
  }),
  params: z.object({
    context: contextSchema,
    id: uuidSchema,
  }),
});

export const searchIdeasSchema = z.object({
  body: z.object({
    query: z.string().min(1, 'Search query is required').max(500),
    limit: z.number().int().min(1).max(100).default(20),
    threshold: z.number().min(0).max(1).default(0.5),
    includeArchived: z.boolean().default(false),
  }),
  params: z.object({
    context: contextSchema,
  }),
});

// ===========================================
// Voice Memo Schemas
// ===========================================

export const voiceMemoTextSchema = z.object({
  body: z.object({
    text: z.string().min(1, 'Text is required').max(50000, 'Text too long'),
  }),
  params: z.object({
    context: contextSchema.optional(),
  }),
});

// ===========================================
// API Key Schemas
// ===========================================

export const createApiKeySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    scopes: z.array(z.string()).min(1).default(['read']),
    rateLimit: z.number().int().min(1).max(10000).default(1000),
    expiresIn: z.number().int().min(3600).max(31536000).optional(), // 1 hour to 1 year in seconds
  }),
});

export const updateApiKeySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    scopes: z.array(z.string()).min(1).optional(),
    rateLimit: z.number().int().min(1).max(10000).optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    id: uuidSchema,
  }),
});

// ===========================================
// Training Schemas
// ===========================================

export const trainingFeedbackSchema = z.object({
  body: z.object({
    ideaId: uuidSchema,
    trainingType: z.enum(['category', 'priority', 'type', 'tone', 'general']),
    correctedCategory: ideaCategorySchema.optional(),
    correctedPriority: prioritySchema.optional(),
    correctedType: ideaTypeSchema.optional(),
    toneFeedback: z.enum(['too_formal', 'too_casual', 'just_right']).optional(),
    feedback: z.string().max(1000).optional(),
  }),
  params: z.object({
    context: contextSchema,
  }),
});

// ===========================================
// Validation Middleware
// ===========================================

/**
 * Request validation schema type
 */
interface RequestSchema {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Generic validation middleware factory
 * Validates request against a Zod schema and returns standardized errors
 */
export function validateRequest<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as { body?: unknown; query?: unknown; params?: unknown };

      // Replace request data with validated/transformed data
      if (validatedData.body !== undefined) {
        req.body = validatedData.body;
      }
      if (validatedData.query !== undefined) {
        req.query = validatedData.query as any;
      }
      if (validatedData.params !== undefined) {
        req.params = validatedData.params as any;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: formatZodErrors(error),
          },
        });
      }

      // Re-throw unexpected errors
      next(error);
    }
  };
}

/**
 * Validate a single value against a schema (for inline validation)
 */
export function validate<T>(schema: ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}

/**
 * Safe validation that returns result or null
 */
export function validateSafe<T>(schema: ZodSchema<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Context validation middleware (for :context param routes)
 */
export function validateContext(req: Request, res: Response, next: NextFunction) {
  const result = contextSchema.safeParse(req.params.context);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CONTEXT',
        message: 'Invalid context parameter',
        details: {
          received: req.params.context,
          expected: ['personal', 'work'],
        },
      },
    });
  }

  next();
}

/**
 * UUID validation middleware (for :id param routes)
 */
export function validateUUID(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    const result = uuidSchema.safeParse(value);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UUID',
          message: `Invalid ${paramName} format`,
          details: {
            received: value,
            expected: 'Valid UUID v4',
          },
        },
      });
    }

    next();
  };
}

/**
 * Pagination validation middleware
 */
export function validatePagination(req: Request, res: Response, next: NextFunction) {
  const result = paginationSchema.safeParse(req.query);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid pagination parameters',
        details: formatZodErrors(result.error),
      },
    });
  }

  // Replace query with validated/defaulted values
  req.query = { ...req.query, ...result.data } as any;
  next();
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Format Zod errors into a user-friendly structure
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    const key = path || 'general';

    if (!formatted[key]) {
      formatted[key] = [];
    }
    formatted[key].push(issue.message);
  }

  return formatted;
}

// ===========================================
// Re-export Zod for convenience
// ===========================================

export { z } from 'zod';
