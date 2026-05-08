/**
 * Learning Progress Curiosity Signal
 *
 * Drives exploration toward domains where the agent is actively improving,
 * not just where gaps exist. Learning progress = rate of prediction error
 * reduction over recent interactions.
 *
 * High positive progress -> agent is learning here -> keep exploring
 * Zero progress -> plateau -> consider switching domains
 * Negative progress -> confusion increasing -> may need different approach
 */

export interface DomainProgress {
  domain: string;
  progress: number;
  errorHistory: number[];
  lastUpdated: Date;
}

/**
 * Compute learning progress as slope of linear regression on error history.
 * Negative slope = errors decreasing = positive learning progress.
 */
export function computeLearningProgress(errorHistory: number[]): number {
  const n = errorHistory.length;
  if (n < 2) return 0;

  // Linear regression slope
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += errorHistory[i];
    sumXY += i * errorHistory[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;

  // Negate: negative slope (decreasing errors) = positive progress
  return -slope;
}

export class LearningProgressTracker {
  private domains: Map<string, number[]> = new Map();
  private maxHistory = 20;

  recordError(domain: string, error: number): void {
    const history = this.domains.get(domain) || [];
    history.push(error);
    if (history.length > this.maxHistory) {
      history.shift();
    }
    this.domains.set(domain, history);
  }

  getProgress(domain: string): number {
    const history = this.domains.get(domain);
    if (!history) return 0;
    return computeLearningProgress(history);
  }

  rankByLearningProgress(): DomainProgress[] {
    const results: DomainProgress[] = [];
    for (const [domain, errorHistory] of this.domains) {
      results.push({
        domain,
        progress: computeLearningProgress(errorHistory),
        errorHistory: [...errorHistory],
        lastUpdated: new Date(),
      });
    }
    return results.sort((a, b) => b.progress - a.progress);
  }

  getDomains(): string[] {
    return Array.from(this.domains.keys());
  }
}
