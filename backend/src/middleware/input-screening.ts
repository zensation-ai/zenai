/**
 * Prompt Injection Screening Middleware
 *
 * Lightweight regex-based screening layer that classifies user inputs
 * for common prompt injection patterns before they reach the main Claude model.
 *
 * Design principles:
 * - NEVER blocks requests — only flags them for downstream handling
 * - Zero API calls — pure regex matching for sub-millisecond latency
 * - Privacy-respecting — logs pattern matches but never the actual message content
 * - Always calls next() — transparent to the request pipeline
 *
 * When a message is flagged, downstream handlers can add a safety instruction
 * to the system prompt so Claude is extra vigilant about following its core instructions.
 *
 * @module middleware/input-screening
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ===========================================
// Injection Pattern Database
// ===========================================

/**
 * Suspicious patterns that indicate prompt injection attempts.
 * Each pattern targets a known attack vector:
 * - Role override: "you are now", "act as", "pretend"
 * - Instruction override: "ignore previous", "forget your instructions", "new instruction"
 * - Format injection: [INST], <|im_start|>, <system> (model-specific control tokens)
 * - Jailbreak keywords: "DAN mode", "developer mode", "jailbreak"
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /forget\s+(all\s+)?your\s+(previous\s+)?instructions/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<system>/i,
  /act\s+as\s+(if\s+you\s+are\s+)?a\s+/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /new\s+instruction/i,
  /override\s+(previous|system|all)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /developer\s+mode/i,
];

/** Score threshold (0-1) — above this the input is considered suspicious */
const SUSPICION_THRESHOLD = 0.6;

// ===========================================
// Screening Result Type
// ===========================================

export interface ScreeningResult {
  /** Whether the input is considered safe (below threshold) */
  safe: boolean;
  /** Suspicion score from 0.0 (clean) to 1.0 (highly suspicious) */
  score: number;
  /** Which pattern sources matched (regex source strings) */
  matchedPatterns: string[];
}

/** Shape of the screening data attached to flagged requests */
export interface InjectionScreeningData {
  flagged: boolean;
  score: number;
  patterns: string[];
}

// ===========================================
// Core Screening Function
// ===========================================

/**
 * Screen user input for prompt injection patterns.
 *
 * Scoring:
 * - Each matched pattern adds 0.3 to the score
 * - High ratio of special characters (>10%) adds 0.2
 * - Excessive line breaks (>10) adds 0.1
 * - Score is capped at 1.0
 *
 * @param input - The user message to screen
 * @returns Screening result with safety verdict, score, and matched patterns
 */
export function screenUserInput(input: string): ScreeningResult {
  const matchedPatterns: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      matchedPatterns.push(pattern.source);
    }
  }

  // Score based on number of matches and input characteristics
  let score = 0;
  score += matchedPatterns.length * 0.3; // Each pattern match adds 0.3

  // Very long inputs with many special characters are more suspicious
  const specialCharRatio = (input.match(/[<>\[\]{}|\\]/g) || []).length / Math.max(input.length, 1);
  if (specialCharRatio > 0.1) score += 0.2;

  // Multiple line breaks with different "personas"
  if ((input.match(/\n/g) || []).length > 10) score += 0.1;

  score = Math.min(score, 1.0);

  return {
    safe: score < SUSPICION_THRESHOLD,
    score,
    matchedPatterns,
  };
}

// ===========================================
// Express Middleware
// ===========================================

/**
 * Express middleware that screens incoming messages for prompt injection patterns.
 *
 * Checks `req.body.message`, `req.body.content`, or `req.body.text` fields.
 * If suspicious patterns are detected, attaches screening data to the request
 * as `req.injectionScreening` for downstream handlers to act on.
 *
 * IMPORTANT: This middleware NEVER blocks requests. It always calls next().
 */
export function inputScreeningMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Only screen POST requests with message body
  const message = req.body?.message || req.body?.content || req.body?.text;
  if (!message || typeof message !== 'string') {
    next();
    return;
  }

  const result = screenUserInput(message);

  if (!result.safe) {
    logger.warn('Potential prompt injection detected', {
      operation: 'input-screening',
      score: result.score,
      matchedPatterns: result.matchedPatterns,
      messageLength: message.length,
      // Don't log the actual message content for privacy
    });

    // Don't block — just tag the request for downstream handling
    (req as any).injectionScreening = {
      flagged: true,
      score: result.score,
      patterns: result.matchedPatterns,
    } satisfies InjectionScreeningData;
  }

  next();
}
