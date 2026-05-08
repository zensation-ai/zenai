/**
 * Sprint 1.10 — Central Moderation Middleware Factory
 *
 * Consolidates the three surface-specific moderation wrappers (chat, email,
 * social) into a single factory. Each caller provides:
 *   - `domain`: which surface the content belongs to (drives audit trail).
 *   - `extractContent`: pulls the user-submitted content out of the request.
 *     Return undefined to skip moderation (e.g. empty body on optional field).
 *   - `onBlock?` (optional): custom block handler. Default is HTTP 422 with
 *     an appeal token — matches the behaviour the existing routes shipped
 *     since Sprint 1.2.
 *
 * The factory keeps the audit hook intact: `moderateContent()` persists every
 * decision (allow + block) to `public.moderation_decisions` via
 * `persistDecision()` in the service layer. Middleware does not touch the DB.
 *
 * Fail-open on exceptions: moderation errors must NOT take the app down.
 * Tier-1 regex (LDNOOBW, Sprint 1.2 + 1.10) already fired synchronously, so
 * structural violations are still caught even if Tier 2/3 panic.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  moderateContent,
  type ModerationSurface,
  type ModerationResult,
} from '../services/content-moderation';
import { logger } from '../utils/logger';

export type ModerationDomain = ModerationSurface;

export interface ModerationFactoryOptions {
  /** Surface tag written to `moderation_decisions.surface`. */
  domain: ModerationDomain;
  /**
   * Pull the content to moderate out of the request. Return undefined to
   * skip moderation (common for PATCH endpoints where content is optional).
   */
  extractContent: (req: Request) => string | undefined;
  /**
   * Custom block handler. Receives the decision result so callers can
   * attach it to audit logs or shape a surface-specific error payload.
   * If omitted, responds with HTTP 422 + appeal token (the default since
   * Sprint 1.2).
   */
  onBlock?: (req: Request, res: Response, result: ModerationResult) => void;
}

// Augment Express.Request once. Re-export the type via
// `middleware/content-moderation.ts` for backward compatibility.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      moderation?: {
        decision: 'allow' | 'block';
        tier: 'regex' | 'openai' | 'claude';
        categories: string[];
        score: number;
        appealToken: string | null;
        decisionId: string;
      };
    }
  }
}

/**
 * Convenience helper: extract content by walking body field paths in
 * priority order. First non-empty string wins. This mirrors the original
 * `moderateInput({ fieldPaths })` behaviour so most routes need nothing
 * custom.
 */
export function extractFromFields(
  fieldPaths: string[],
): (req: Request) => string | undefined {
  return (req: Request) => {
    for (const path of fieldPaths) {
      const val = getNested(req.body, path);
      if (typeof val === 'string' && val.trim().length > 0) {
        return val;
      }
    }
    return undefined;
  };
}

function getNested(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function defaultOnBlock(_req: Request, res: Response, result: ModerationResult): void {
  res.status(422).json({
    success: false,
    error: 'Dieser Inhalt verstößt gegen unsere Nutzungsrichtlinien.',
    code: 'CONTENT_BLOCKED',
    details: {
      reason: result.reason,
      categories: result.categories,
      tier: result.tier,
      appeal_token: result.appealToken,
      appeal_endpoint: result.appealToken
        ? `/api/moderation/appeals/${result.appealToken}`
        : null,
    },
  });
}

export function createModerationMiddleware(options: ModerationFactoryOptions) {
  const { domain, extractContent, onBlock = defaultOnBlock } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const content = extractContent(req);
    if (!content) {
      next();
      return;
    }

    try {
      const userId = req.jwtUser?.id || null;
      const result = await moderateContent({ content, surface: domain, userId });

      req.moderation = {
        decision: result.decision,
        tier: result.tier,
        categories: result.categories,
        score: result.score,
        appealToken: result.appealToken,
        decisionId: result.decisionId,
      };

      if (result.decision === 'block') {
        onBlock(req, res, result);
        return;
      }

      next();
    } catch (err) {
      // Fail-open: availability > perfection. Tier-1 regex already ran and
      // caught structural violations synchronously, so this is limited to
      // Tier-2/3 network/API failures.
      logger.warn('Moderation middleware error (fail-open)', {
        operation: 'moderation',
        domain,
        error: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  };
}
