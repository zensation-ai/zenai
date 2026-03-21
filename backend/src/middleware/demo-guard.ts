import { Request, Response, NextFunction } from 'express';

const DEMO_RATE_LIMIT = 50; // requests per minute
const demoRequestCounts = new Map<string, { count: number; resetAt: number }>();

export function demoGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.jwtUser?.isDemo) {
    next();
    return;
  }

  // Rate limiting
  const now = Date.now();
  const key = `demo:${req.jwtUser.id}`;
  const entry = demoRequestCounts.get(key);

  if (!entry || now > entry.resetAt) {
    demoRequestCounts.set(key, { count: 1, resetAt: now + 60000 });
  } else {
    entry.count++;
    if (entry.count > DEMO_RATE_LIMIT) {
      res.status(429).json({
        success: false,
        error: 'Demo rate limit exceeded. Create an account for unlimited access.',
      });
      return;
    }
  }

  // Block restricted operations
  const restricted = ['/api/code/execute', '/api/code/run'];
  if (restricted.some(p => req.path.startsWith(p))) {
    res.status(403).json({
      success: false,
      error: 'Code execution is not available in demo mode.',
    });
    return;
  }

  next();
}
