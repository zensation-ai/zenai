/**
 * Prompt Sanitizer Middleware — Sprint 1.4
 *
 * Runs `sanitizePrompt` over `req.body.message` / `req.body.content` /
 * `req.body.text` before they reach handlers that forward the value to an
 * LLM. Updates the body in place so downstream code stays unchanged, and
 * attaches a telemetry record under `req.promptSanitizer` for observability.
 *
 * This middleware is complementary to `inputScreeningMiddleware`:
 * - input-screening detects suspicious intent (heuristic scorer, does not mutate)
 * - prompt-sanitizer-middleware strips known control tokens (deterministic, mutates)
 *
 * @module middleware/prompt-sanitizer-middleware
 */

import { Request, Response, NextFunction } from 'express';
import { sanitizePrompt } from '../services/security/prompt-sanitizer';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      promptSanitizer?: {
        modified: boolean;
        patternsHit: string[];
        truncated: boolean;
      };
    }
  }
}

const CANDIDATE_FIELDS = ['message', 'content', 'text'] as const;

export function promptSanitizerMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.body || typeof req.body !== 'object') {
    next();
    return;
  }

  let modified = false;
  const patternsHit: string[] = [];
  let truncated = false;

  for (const field of CANDIDATE_FIELDS) {
    const value = (req.body as Record<string, unknown>)[field];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    const result = sanitizePrompt(value);
    if (result.modified) {
      (req.body as Record<string, unknown>)[field] = result.sanitized;
      modified = true;
      for (const pattern of result.patternsHit) {
        if (!patternsHit.includes(pattern)) {
          patternsHit.push(pattern);
        }
      }
      if (result.truncated) {
        truncated = true;
      }
    }
  }

  if (modified) {
    req.promptSanitizer = { modified, patternsHit, truncated };
    logger.warn('Prompt control tokens stripped', {
      operation: 'prompt-sanitizer',
      patternsHit,
      truncated,
    });
  }

  next();
}
