/**
 * plan-gate.ts — Middleware to enforce minimum plan tier on routes.
 *
 * Usage:
 *   router.post('/advanced-feature', requirePlan('pro'), handler);
 *
 * Reads `req.jwtUser.plan` (set by jwt-auth middleware).
 * Defaults to 'free' if no plan claim is present.
 */

import { Request, Response, NextFunction } from 'express';

type PlanTier = 'free' | 'pro' | 'enterprise';

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'enterprise'];

export function requirePlan(minPlan: PlanTier) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userPlan: PlanTier = ((req.jwtUser as Record<string, unknown> | undefined)?.plan as PlanTier) || 'free';

    if (TIER_ORDER.indexOf(userPlan) < TIER_ORDER.indexOf(minPlan)) {
      res.status(403).json({
        success: false,
        error: `Requires ${minPlan} plan.`,
        requiredPlan: minPlan,
        currentPlan: userPlan,
      });
      return;
    }

    next();
  };
}
