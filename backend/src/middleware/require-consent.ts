/**
 * Sprint 1.2 — Consent-Middleware
 *
 * Gating für consent-gebundene Endpoints (z.B. Analytics). Wenn der User
 * den benötigten Consent nicht erteilt hat, wird mit HTTP 451 (Unavailable
 * For Legal Reasons) abgebrochen. Das Frontend kann 451 als Trigger nutzen,
 * den Consent-Tab im Settings anzuzeigen.
 */

import type { Request, Response, NextFunction } from 'express';
import { hasConsent, type ConsentKind } from '../services/auth/consent-service';
import { logger } from '../utils/logger';

export function requireConsent(kind: ConsentKind) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // JWT-authenticated requests only — Consent ist an users gebunden.
    // API-Keys haben keinen direkten User-Context für Consent.
    const userId = req.jwtUser?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    try {
      const granted = await hasConsent(userId, kind);
      if (!granted) {
        res.status(451).json({
          success: false,
          error: `Consent required for: ${kind}`,
          code: 'CONSENT_REQUIRED',
          consent_kind: kind,
        });
        return;
      }
      next();
    } catch (err) {
      // Fehler beim Consent-Check: fail-closed (sicherheitsrelevant).
      logger.error(
        'Consent check failed',
        err instanceof Error ? err : new Error(String(err)),
        { operation: 'consent', userId, consentKind: kind }
      );
      res.status(500).json({
        success: false,
        error: 'Consent check failed',
        code: 'CONSENT_CHECK_FAILED',
      });
    }
  };
}
