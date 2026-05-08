/**
 * plan-gate.ts — Middleware to enforce minimum plan tier on routes.
 *
 * Usage:
 *   router.post('/advanced-feature', requirePlan('pro'), handler);
 *
 * Resolution order:
 *   1. req.jwtUser.plan (set for demo users or if JWT encodes plan)
 *   2. Live DB lookup from subscriptions table (for real users)
 *   3. Defaults to 'free' if no record found
 */

import { Request, Response, NextFunction } from 'express';
import { getUserPlan } from '../services/billing';

type PlanTier = 'free' | 'pro' | 'enterprise';

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'enterprise'];

export function requirePlan(minPlan: PlanTier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Fast path: plan already on the request (demo users, cached)
    const tokenPlan = (req.jwtUser as Record<string, unknown> | undefined)?.plan as PlanTier | undefined;

    let userPlan: PlanTier;
    if (tokenPlan && TIER_ORDER.includes(tokenPlan)) {
      userPlan = tokenPlan;
    } else {
      // Resolve user ID from JWT auth or API key auth (req.user)
      const userId = req.jwtUser?.id ?? (req.user as { id?: string } | undefined)?.id;
      if (userId) {
        userPlan = await getUserPlan(userId);
        // Cache on jwtUser (when present) to avoid repeated DB queries in one request
        if (req.jwtUser) {
          (req.jwtUser as Record<string, unknown>).plan = userPlan;
        }
      } else {
        userPlan = 'free';
      }
    }

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
