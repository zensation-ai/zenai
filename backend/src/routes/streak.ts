import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { getStreak, updateStreak } from '../services/streak';
import type { AIContext } from '../types/context';

const router = Router();

// Sprint 1.5 Item 4 — blanket auth for all streak routes.
router.use(apiKeyAuth);

router.get('/:context/streak', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const streak = await getStreak(context);
  res.json({ data: streak });
}));

router.post('/:context/streak/checkin', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const updated = await updateStreak(context);
  res.json({ data: updated });
}));

export default router;
